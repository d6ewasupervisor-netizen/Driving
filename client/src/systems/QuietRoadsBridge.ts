/**
 * QuietRoadsBridge — the one place the story engine and the world simulation
 * touch the game. Pure TS singleton (no JSX); ticked from a useFrame in
 * QuietRoadsFrame.tsx and driven by store phase changes.
 *
 * Responsibilities
 *   - DialogueHost implementation over qrStore
 *   - Scene routing: still/video/radio scenes → phase 'dialogue' (car frozen);
 *     gameplay scenes → phase 'driving'
 *   - Vehicle sampling for the Simulation (never drives the car itself)
 *   - In-world quizzes → reuse QuizOverlay by mapping core questions to the
 *     game's Question type; answers feed SM-2 + Trade Points
 *   - Telemetry queue for the parent dashboard
 */
import {
  DialogueRunner, Simulation, QuestionBank, newMastery, sm2Update, gradeQuality, tpForAnswer,
  type DialogueHost, type DialogueFile, type VehicleSample, type SimFrame, type MissionId,
  type Question as CoreQuestion, type TimerHandle, VEHICLE, type WalkerInput,
} from '@/quietroads';
import act01 from '@/quietroads/data/dialogue_act0-1.json';
import act2 from '@/quietroads/data/dialogue_act2.json';
import act3 from '@/quietroads/data/dialogue_act3.json';
import act4 from '@/quietroads/data/dialogue_act4.json';
import act5 from '@/quietroads/data/dialogue_act5.json';
import act6 from '@/quietroads/data/dialogue_act6.json';
import act7 from '@/quietroads/data/dialogue_act7.json';
import act8 from '@/quietroads/data/dialogue_act8.json';
import qv1 from '@/quietroads/data/questions_v1.json';
import qv2 from '@/quietroads/data/questions_v2_weak.json';
import qv3 from '@/quietroads/data/questions_v3_routines.json';
import { useGameStore } from '@/stores/gameStore';
import { useQRStore } from '@/stores/qrStore';
import type { Question, Category } from '@/types/quiz';
import { getCurrentSpeedMs, teleportVehicle, scaleCurrentSpeed, haltVehicle } from '@/systems/VehicleController';

// The R3F Beetle brakes at 8 m/s² (MAX_BRAKE_DECEL in VehicleController). The stopping
// shadow must be honest about *this* car, so the observer uses the same number.
(VEHICLE as { BRAKE_DECEL_DRY: number }).BRAKE_DECEL_DRY = 8.0;

const CHAPTER_CATEGORY: Record<number, Category> = {
  1: 'washington_laws', 2: 'road_signs', 3: 'right_of_way', 4: 'parking',
  5: 'speed_limits', 6: 'weather', 7: 'sharing_road', 8: 'defensive_driving',
};

class Bridge {
  readonly runner: DialogueRunner;
  readonly sim: Simulation;
  readonly bank: QuestionBank;
  private started = false;
  private pendingQuiz: { trigger: string; at: number } | null = null;
  private activeQuiz: { q: CoreQuestion; shownAt: number; options: string[] } | null = null;
  private quizCooldownUntil = 0;
  private timers = new Set<number>();
  private clock = 0;

  constructor() {
    this.runner = new DialogueRunner(this.host());
    for (const a of [act01, act2, act3, act4, act5, act6, act7, act8]) this.runner.load(structuredClone(a) as unknown as DialogueFile);
    this.bank = new QuestionBank().load(qv1 as never).load(qv2 as never).load(qv3 as never);
    this.sim = new Simulation({
      fire: (e, d) => this.fire(e, d),
      requestQuiz: (trigger, delayS) => { this.pendingQuiz = { trigger, at: this.clock + delayS }; },
      setObjective: (t) => useQRStore.getState().setTransient({ objective: t }),
      toast: (t) => this.toast(t),
      placeVehicle: (p, h) => teleportVehicle(p.x, p.y, h),
    });
    this.subscribeRunner();
  }

  // ---------------------------------------------------------------- host
  private host(): DialogueHost {
    const S = () => useQRStore.getState();
    return {
      getVar: (n) => (n in S().vars ? S().vars[n] : NaN),
      setVar: (n, v) => S().setVar(n, v),
      addVar: (n, d) => S().addVar(n, d),
      getFlag: (n) => S().flags[n],
      setFlag: (n, v) => S().setFlag(n, v),
      hasItem: (id) => S().items.includes(id),
      giveItem: (id) => S().giveItem(id),
      unlock: (id) => S().unlock(id),
      emitNoise: (db, marker) => {
        const pos = marker && this.sim.map.markers[marker] ? this.sim.map.markers[marker] : this.sim.playerPos;
        this.sim.noise.emit(db, pos, this.sim.playerZone);
      },
      playSfx: () => {},                         // AudioManager hook-up is a later pass
      animCue: () => {},
      checkpoint: (label) => S().setCheckpoint(label, this.runner.scene?.id ?? null, this.runner.serialize()),
      ledger: (delta, reason) => S().addLedger(delta, reason),
      logEvent: (name) => {
        S().addTelemetry({ ts: Date.now(), event: name });
        if (name === 'choice.dol:honk') this.sim.escapeForgiving = true;   // the script says she gets out
      },
      logChoice: (scene, node, option) => S().addChoice({ ts: Date.now(), scene, node, option }),
      startGameplay: (id) => this.startGameplay(id),
      setTimer: (ms, fn) => { const h = window.setTimeout(() => { this.timers.delete(h); fn(); }, ms); this.timers.add(h); return h as TimerHandle; },
      clearTimer: (h) => { window.clearTimeout(h as number); this.timers.delete(h as number); },
      now: () => performance.now(),
      random: () => Math.random(),
    };
  }

  private subscribeRunner() {
    const T = (p: Parameters<ReturnType<typeof useQRStore.getState>['setTransient']>[0]) => useQRStore.getState().setTransient(p);
    this.runner.on('line_shown', (l) => T({ line: l, direction: null }));
    this.runner.on('direction_shown', (node, id) => T({ direction: { node, id }, line: null }));
    this.runner.on('choice_shown', (node, options) => T({ choices: { node, options: options ?? [] } }));
    this.runner.on('choice_hidden', () => T({ choices: null }));
    this.runner.on('idle', () => T({ line: null, direction: null, choices: null }));
    this.runner.on('scene_started', (id) => {
      const type = this.runner.data.scenes[id]?.type;
      useQRStore.setState({ sceneId: id });
      this.onSceneStarted(id);
      if (type === 'gameplay') { if (this.sim.mode === 'walker') this.enterWalking(); else this.enterDriving(); }
      else this.enterDialogue();
    });
    this.runner.on('scene_finished', (_id, next) => { if (next) this.runner.startScene(next); });
  }

  // ---------------------------------------------------------------- lifecycle
  /** Called when the player picks Quiet Roads from the menu. */
  start(fresh = false) {
    const qr = useQRStore.getState();
    if (fresh) qr.resetQuietRoads();
    for (const [k, v] of Object.entries(useQRStore.getState().placeholders)) this.runner.setPlaceholder(k, v);
    const st = useQRStore.getState();
    if (!fresh && st.runnerState) this.runner.restore(st.runnerState);
    const sceneId = !fresh && st.sceneId && this.runner.hasScene(st.sceneId) ? st.sceneId : '0.1';
    this.started = true;
    useGameStore.getState().setWorldMode('kent');
    this.runner.startScene(sceneId);
  }

  stop() { this.started = false; for (const h of this.timers) window.clearTimeout(h); this.timers.clear(); }
  get isActive() { return this.started; }

  private enterDialogue() { haltVehicle(); this.sim.freeze('dialogue'); useGameStore.getState().setPhase('dialogue'); }
  private enterDriving() { this.sim.unfreeze('dialogue'); useGameStore.getState().setPhase('driving'); }
  private enterWalking() { haltVehicle(); this.sim.unfreeze('dialogue'); useGameStore.getState().setPhase('walking'); }

  /** World setup that the dialogue file implies but doesn't spell out. */
  private onSceneStarted(id: string) {
    const g = useGameStore.getState();
    switch (id) {
      case '1.4':   // aftermath — Grandma's carport, night, engine off
        teleportVehicle(this.sim.map.starts.carport.pos.x, this.sim.map.starts.carport.pos.y, this.sim.map.starts.carport.heading);
        this.sim.enterVehicle();
        useGameStore.setState({ timeOfDay: 'night' });
        break;
      case '1.4b':  // rumor board, next morning
        useGameStore.setState({ timeOfDay: 'day' });
        break;
      case '2.1':
        useGameStore.setState({ timeOfDay: 'day' });
        break;
      default:
        if (g.timeOfDay !== 'day' && id.startsWith('0.')) useGameStore.setState({ timeOfDay: 'day' });
    }
  }

  private startGameplay(id: string) {
    if (this.sim.startMission(id as MissionId)) {
      if (this.sim.mode === 'walker') this.enterWalking(); else this.enterDriving();
      return;
    }
    // Not built yet — say so on screen and hand control back so she can keep driving around Kent.
    this.toast(`"${id}" isn't built yet. Drive around — Kent is open.`);
    this.enterDriving();
  }

  private toast(t: string) {
    useQRStore.getState().setTransient({ toast: t });
    window.setTimeout(() => useQRStore.getState().setTransient({ toast: '' }), 3800);
  }

  private fire(event: string, data?: Record<string, unknown>) {
    useQRStore.getState().addTelemetry({ ts: Date.now(), event, data });
    if (event === 'waypoint.reach:dol_lot_exit') this.sim.escapeForgiving = false;
    if (event === 'waypoint.reach:beetle_driver_seat') {
      // She's in. Doors slam (in the script). Back to the car; the dialogue takes it from here.
      this.sim.enterVehicle();
      useGameStore.getState().setPhase('driving');
    }
    this.runner.onEvent(event);
    this.sim.onEvent(event);
  }

  // ---------------------------------------------------------------- per frame
  private sample(): VehicleSample {
    const g = useGameStore.getState();
    const [x, , z] = g.vehiclePosition;
    // vehicleHeading = atan2(-fx, -fz); forward in XZ = (-sin h, -cos h). Core heading = atan2(fz, fx).
    const fx = -Math.sin(g.vehicleHeading), fz = -Math.cos(g.vehicleHeading);
    return {
      pos: { x, y: z },
      heading: Math.atan2(fz, fx),
      speedMs: getCurrentSpeedMs(),
      throttle: g.throttle, brake: g.brake, steer: g.steering,
      horn: useQRStore.getState().horn,
    };
  }

  private acc = 0;
  private lastQte = false;
  tick(dt: number) {
    if (!this.started) return;
    const g = useGameStore.getState();
    this.clock += dt;
    // Only simulate while driving/walking; dialogue/quiz/pause freeze the world.
    if (g.phase !== 'driving' && g.phase !== 'walking') return;
    this.acc += Math.min(dt, 0.1);
    let f: SimFrame | null = null;
    if (g.phase === 'walking' && this.sim.mode === 'walker') {
      const qr = useQRStore.getState();
      const input: WalkerInput = { x: g.steering, y: g.brake - g.throttle, run: qr.run };
      while (this.acc >= 1 / 60) { f = this.sim.stepWalker(1 / 60, input); this.acc -= 1 / 60; }
      const w = this.sim.interior;
      useGameStore.setState({ walkerPosition: [w.pos.x, 0, w.pos.y] });
      const qteNow = !!w.qte;
      if (qteNow !== this.lastQte) { this.lastQte = qteNow; qr.setTransient({ qteActive: qteNow }); }
    } else {
      const s = this.sample();
      while (this.acc >= 1 / 60) { f = this.sim.step(1 / 60, s); this.acc -= 1 / 60; }
    }
    if (f) useQRStore.getState().setTransient({ frame: f });
    if (this.pendingQuiz && this.clock >= this.pendingQuiz.at) {
      const t = this.pendingQuiz; this.pendingQuiz = null;
      this.openQuiz(t.trigger);
    }
  }

  /** Called by CollisionSystem-equivalent when the sim reports the car hit something. */
  onCollision(kind: 'plow' | 'soft' | 'static') { scaleCurrentSpeed(Simulation.collisionSpeedFactor(kind)); }

  // ---------------------------------------------------------------- quizzes
  private openQuiz(trigger: string) {
    if (this.clock < this.quizCooldownUntil || this.activeQuiz) return;
    const g = useGameStore.getState();
    if (g.phase !== 'driving') return;
    const mastery = useQRStore.getState().mastery;
    const pool = this.bank.forTrigger(trigger);
    if (!pool.length) return;
    // prefer items not yet mastered; then random
    const ranked = [...pool].sort((a, b) => ((mastery[a.id]?.correct ?? 0) - (mastery[b.id]?.correct ?? 0)) || Math.random() - 0.5);
    const q = ranked[0];
    const options = [...q.choices];
    this.activeQuiz = { q, shownAt: performance.now(), options };
    this.quizCooldownUntil = this.clock + 20;
    haltVehicle();
    this.sim.freeze('quiz');
    g.triggerQuiz(this.toGameQuestion(q));
    this.fire('quiz.open', { id: q.id, trigger });
  }

  private toGameQuestion(q: CoreQuestion): Question {
    return {
      id: q.id,
      category: CHAPTER_CATEGORY[q.ch] ?? 'defensive_driving',
      difficulty: q.difficulty === 1 ? 'easy' : q.difficulty === 2 ? 'medium' : 'hard',
      title: q.guide_ref ?? 'Quiet Roads',
      question: q.prompt,
      correctAnswer: q.choices[q.answer],
      wrongAnswers: q.choices.filter((_, i) => i !== q.answer),
      explanation: q.explanation,
      imagePrompt: '',
      imageUrl: null,
      tags: q.tags ?? [],
      waTestFrequency: 'high',
      source: 'quietroads',
    };
  }

  /** QuizOverlay calls this after answerQuiz() for source === 'quietroads'. */
  onQuizAnswered(questionId: string, chosenText: string, correct: boolean) {
    const a = this.activeQuiz; if (!a || a.q.id !== questionId) return;
    const S = useQRStore.getState();
    const now = Date.now();
    const responseMs = performance.now() - a.shownAt;
    const chosen = a.q.choices.indexOf(chosenText);
    const prev = S.mastery[questionId] ?? newMastery(questionId, now);
    const tp = tpForAnswer(a.q, S.mastery[questionId], correct);
    S.setMastery(questionId, sm2Update(prev, gradeQuality(correct, responseMs), now));
    S.addAttempt({ ts: now, question_id: questionId, correct, chosen, response_ms: Math.round(responseMs) });
    if (tp) { S.addVar('trade_points', tp); S.addLedger(tp, `quiz:${questionId}`); }
    this.fire(correct ? 'sign.prompt.correct' : 'sign.prompt.wrong', { id: questionId, ms: Math.round(responseMs) });
    this.activeQuiz = null;
  }

  /** QuizOverlay calls this on Continue. */
  onQuizClosed() { this.sim.unfreeze('quiz'); this.activeQuiz = null; }

  // ---------------------------------------------------------------- UI actions
  shh() { this.sim.interior.answerQte(); }
  tap() { this.runner.advanceFromUi(); }
  choose(id: string) { this.runner.chooseById(id); }
  restartFromCheckpoint() {
    const st = useQRStore.getState();
    if (st.runnerState) this.runner.restore(st.runnerState);
    this.runner.startScene(st.sceneId && this.runner.hasScene(st.sceneId) ? st.sceneId : '0.1');
  }
}

export const QuietRoads = new Bridge();
