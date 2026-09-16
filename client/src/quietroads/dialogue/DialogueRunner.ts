import type {
  Character, ChoiceOption, Condition, DialogueFile, DialogueNode, Effects,
  Scene, ShownLine, VoiceBed, CardResult,
} from "./types";
import type { DialogueHost, DialogueEvents, TimerHandle } from "./host";

type Listener<K extends keyof DialogueEvents> = DialogueEvents[K];

/**
 * DialogueRunner — consumes files matching dialogue.schema.json (1.3.0).
 *
 * Port of DialogueRunner.gd with every patch from the design doc applied:
 *  - Act 2: merging load_file, _pending_wait survives interrupting barks,
 *           run_pool_sequence()
 *  - Act 3: waits don't block barks; prefix wait_for ("merge.")
 *  - Act 4: {var:x} / {var_words:x} / {Var_words:x} substitution, add_vars,
 *           resident end (scene stays loaded when next_scene is empty)
 *  - Act 6: choice.timeout:<node> logging, noise_marker, entering a wait
 *           clears a stale pending wait
 *  - Act 8: per-line voice_bed override
 */
export class DialogueRunner {
  data: DialogueFile = { meta: { schema_version: "", acts: [], locale: "en-US", placeholders: {} }, characters: {}, scenes: {}, pools: {} };
  scene: Scene | null = null;
  current: DialogueNode | null = null;
  currentId = "";

  private firedOnce = new Set<string>();
  private lastFiredMs = new Map<string, number>();
  private poolUsed = new Map<string, number[]>();
  private pendingWait: DialogueNode | null = null;
  /** Set when a wait's event arrived while a bark was on screen; run when the bark ends. */
  private pendingResume: string | null = null;
  private autoTimer: TimerHandle | null = null;
  private choiceTimer: TimerHandle | null = null;
  private listeners: { [K in keyof DialogueEvents]?: Listener<K>[] } = {};

  constructor(private host: DialogueHost) {}

  // ------------------------------------------------------------ events out
  on<K extends keyof DialogueEvents>(evt: K, fn: Listener<K>): () => void {
    (this.listeners[evt] ??= [] as any).push(fn as any);
    return () => this.off(evt, fn);
  }
  off<K extends keyof DialogueEvents>(evt: K, fn: Listener<K>): void {
    const l = this.listeners[evt] as any[] | undefined;
    if (l) this.listeners[evt] = l.filter((f) => f !== fn) as any;
  }
  private emit<K extends keyof DialogueEvents>(evt: K, ...args: Parameters<Listener<K>>): void {
    for (const fn of (this.listeners[evt] ?? []) as any[]) fn(...args);
  }

  // ------------------------------------------------------------ loading
  /** Load a dialogue file. Repeated calls merge (scenes/pools/characters/flags/vars). */
  load(file: DialogueFile): void {
    if (Object.keys(this.data.scenes).length === 0 && !this.data.meta.schema_version) {
      this.data = {
        ...file,
        meta: { ...file.meta, placeholders: { ...(file.meta.placeholders ?? {}) } },
        pools: { ...(file.pools ?? {}) },
      };
    } else {
      this.data.characters = { ...this.data.characters, ...file.characters };
      this.data.scenes = { ...this.data.scenes, ...file.scenes };
      this.data.pools = { ...(this.data.pools ?? {}), ...(file.pools ?? {}) };
      this.data.variables = { ...(this.data.variables ?? {}), ...(file.variables ?? {}) };
      this.data.flags = { ...(this.data.flags ?? {}), ...(file.flags ?? {}) };
      this.data.meta.acts = [...new Set([...this.data.meta.acts, ...file.meta.acts])];
      this.data.meta.placeholders = { ...(this.data.meta.placeholders ?? {}), ...(file.meta.placeholders ?? {}) };
    }
    // Seed defaults only where the host doesn't already hold a value.
    for (const [k, def] of Object.entries(file.variables ?? {})) {
      if (Number.isNaN(this.host.getVar(k))) this.host.setVar(k, def.default);
    }
    for (const [k, v] of Object.entries(file.flags ?? {})) {
      if (this.host.getFlag(k) === undefined) this.host.setFlag(k, v);
    }
  }

  /** Override a placeholder at runtime (e.g. real names for {MOM}/{RAY}). */
  setPlaceholder(token: string, value: string): void {
    (this.data.meta.placeholders ??= {})[token] = value;
  }

  hasScene(id: string): boolean { return id in this.data.scenes; }

  startScene(sceneId: string): void {
    const sc = this.data.scenes[sceneId];
    if (!sc) throw new Error(`Dialogue scene missing: ${sceneId}`);
    this.killTimers();
    this.scene = sc;
    this.pendingWait = null;
    this.pendingResume = null;
    this.current = null;
    this.currentId = "";
    this.emit("scene_started", sceneId);
    this.run(sc.entry);
  }

  /** True when a line/direction/choice is on screen (a wait is not "on screen"). */
  get onScreen(): boolean {
    return !!this.current && this.current.type !== "wait";
  }
  get isWaiting(): boolean {
    return (!!this.current && this.current.type === "wait") || !!this.pendingWait;
  }

  // ------------------------------------------------------------ core loop
  private run(nodeId: string): void {
    this.killTimers();
    if (!this.scene) return;

    if (nodeId.startsWith("pool:")) { this.runPoolLine(nodeId.slice(5)); return; }

    const node = this.scene.nodes[nodeId];
    if (!node) { console.error(`Dialogue node missing: ${this.scene.id}/${nodeId}`); return; }

    this.currentId = nodeId;
    this.current = node;
    if (node.type === "wait") { this.pendingWait = null; this.pendingResume = null; } // Act 6 patch 3

    if (node.condition && !this.evalCond(node.condition)) { this.advance(); return; }
    if (node.effects) this.apply(node.effects);
    if (node.anim) this.host.animCue(node.anim);
    for (const s of node.sfx ?? []) this.host.playSfx(s);

    switch (node.type) {
      case "line": {
        const spk = this.speakerOf(node);
        const bed = this.voiceBedOf(node, spk);
        const shown: ShownLine = {
          ...node,
          text: this.substitute(node.text ?? ""),
          speaker: node.speaker ?? "",
          voice_bed: bed,
          speaker_def: spk,
          node_id: nodeId,
        };
        const db = this.volumeDb(node, spk, bed);
        if (db > 0) this.host.emitNoise(db);
        this.emit("line_shown", shown);
        this.maybeAuto();
        break;
      }
      case "direction":
        this.emit("direction_shown", node, nodeId);
        this.maybeAuto();
        break;
      case "choice": {
        const opts = (node.choices ?? []).filter((o) => !o.condition || this.evalCond(o.condition));
        this.emit("choice_shown", node, opts, nodeId);
        if (node.timeout_ms != null) {
          const id = nodeId;
          this.choiceTimer = this.host.setTimer(node.timeout_ms, () => {
            this.host.logEvent(`choice.timeout:${id}`);
            this.chooseById(node.default_option ?? opts[0]?.id ?? "");
          });
        }
        break;
      }
      case "branch":
        for (const b of node.branches ?? []) {
          if (!b.condition || this.evalCond(b.condition)) { this.run(b.next); return; }
        }
        break;
      case "wait":
        break; // resumes in onEvent
      case "card":
        this.emit("card_shown", node.card ?? "", nodeId);
        break; // resumes in resolveCard
      case "effects":
        this.advance();
        break;
      case "pool":
        this.runPoolLine(node.pool ?? "");
        break;
      case "jump":
        this.startScene(node.scene ?? "");
        break;
      case "end": {
        const next = node.next_scene ?? "";
        const sid = this.scene.id;
        this.current = null;
        this.currentId = "";
        // Resident end: scene stays loaded when next_scene is empty so late
        // triggers (exam.pass, study.close, shop.buy:*) still resolve.
        this.emit("scene_finished", sid, next);
        if (!next) this.emit("idle"); // nothing follows: clear whatever line led here
        break;
      }
    }
  }

  /** Called from UI on tap. During a wait a tap dismisses the last line; choices need a pick. */
  advanceFromUi(): void {
    if (!this.current) return;
    if (this.current.type === "wait") { this.emit("idle"); return; }
    if (["choice", "end", "card"].includes(this.current.type)) return;
    this.advance();
  }

  /**
   * The UI answered (or dismissed) the current card. Grading is the card's own:
   * correct +2 Respect, wrong −1; a positive noise delta is heard by the Quiet
   * (the host maps the card's small ints onto dB). Everything is logged.
   */
  static CARD_NOISE_DB = (n: number) => 40 + n * 12; // 1→52 (yellow), 2→64, 3→76 (red)
  resolveCard(result: CardResult): void {
    if (!this.current || this.current.type !== "card") return;
    if (this.scene) this.host.logChoice(this.scene.id, this.currentId, `card:${result.card}:${result.option ?? "-"}`);
    if (result.correct === true) this.host.addVar("respect", 2);
    else if (result.correct === false) this.host.addVar("respect", -1);
    if (result.noise != null && result.noise > 0) this.host.emitNoise(DialogueRunner.CARD_NOISE_DB(result.noise));
    if (result.time_cost) this.host.addVar("time_cost", result.time_cost);
    this.host.logEvent(`card.${result.correct === null ? "seen" : result.correct ? "correct" : "wrong"}:${result.card}`);
    this.advance();
  }

  private advance(): void {
    if (!this.current) return;
    if (this.current.next) { this.run(this.current.next); return; }
    // Bark finished. If the wait we were holding already got its event, resume it.
    if (this.pendingResume) {
      const target = this.pendingResume;
      this.pendingResume = null;
      this.pendingWait = null;
      this.run(target);
      return;
    }
    // Otherwise restore a stashed wait, else go idle.
    if (this.pendingWait) {
      this.current = this.pendingWait;
      this.currentId = "__wait";
      this.pendingWait = null;
    } else {
      this.current = null;
      this.currentId = "";
      this.emit("idle");
    }
  }

  choose(index: number): void {
    if (!this.current?.choices) return;
    this.killTimers();
    const opt = this.current.choices[index];
    if (opt) this.pick(opt);
  }

  chooseById(id: string): void {
    if (!this.current?.choices) return;
    const opt = this.current.choices.find((o) => o.id === id);
    if (!opt) return;
    this.killTimers();
    this.pick(opt);
  }

  private pick(opt: ChoiceOption): void {
    this.emit("choice_hidden");
    if (opt.tracked && this.scene) this.host.logChoice(this.scene.id, this.currentId, opt.id);
    if (opt.effects) this.apply(opt.effects);
    this.run(opt.next);
  }

  // ------------------------------------------------------------ events in
  /** Game emits events here (noise.yellow, stop.rolled, waypoint.reach:dol, …). */
  onEvent(name: string): void {
    if (!this.scene) return;

    // 1) Triggers first (so merge.* effect nodes set flags before a wait resumes).
    let best: (typeof this.scene.triggers extends (infer T)[] | undefined ? T : never) | null = null;
    for (const t of this.scene.triggers ?? []) {
      if (!this.eventMatches(t.event, name)) continue;
      const key = `${this.scene.id}/${t.node}`;
      if (t.once && this.firedOnce.has(key)) continue;
      const last = this.lastFiredMs.get(key);
      if (last != null && this.host.now() - last < (t.cooldown_ms ?? 0)) continue;
      if (t.condition && !this.evalCond(t.condition)) continue;
      if (!best || (t.priority ?? 0) > (best.priority ?? 0)) best = t;
    }
    if (best) {
      const onScreen = this.onScreen;
      if (!(onScreen && !best.interrupt)) {
        if (this.current && this.current.type === "wait") this.pendingWait = this.current; // stash
        const key = `${this.scene.id}/${best.node}`;
        this.firedOnce.add(key);
        this.lastFiredMs.set(key, this.host.now());
        this.run(best.node);
      }
    }

    // 2) Then resume a wait (current or stashed) if this event matches it.
    const waiting = this.current && this.current.type === "wait" ? this.current : this.pendingWait;
    if (waiting && waiting.wait_for && this.eventMatches(waiting.wait_for, name)) {
      const target = waiting.next ?? "";
      if (!this.onScreen) {
        this.pendingWait = null;
        this.pendingResume = null;
        this.current = waiting;
        this.run(target);
      } else {
        // A bark is showing; resume when its chain ends (advance()).
        this.pendingResume = target;
      }
    }
  }

  private eventMatches(pattern: string, name: string): boolean {
    return pattern === name || (pattern.endsWith(":") || pattern.endsWith(".") ? name.startsWith(pattern) : false);
  }

  // ------------------------------------------------------------ pools
  private runPoolLine(poolId: string): void {
    const pool = this.data.pools?.[poolId];
    if (!pool || !this.scene) { console.error(`Dialogue pool missing: ${poolId}`); return; }
    const lines = pool.lines;
    let used = this.poolUsed.get(poolId) ?? [];
    if (used.length >= lines.length) used = [];
    let idx: number;
    if ((pool.pick ?? "random") === "sequential") {
      idx = used.length;
    } else {
      const avail = lines.map((_, i) => i).filter((i) => !((pool.no_repeat ?? true) && used.includes(i)));
      idx = avail[Math.floor(this.host.random() * avail.length)] ?? 0;
    }
    used.push(idx);
    this.poolUsed.set(poolId, used);
    const line: DialogueNode = { ...lines[idx], type: lines[idx].type ?? "line" };
    this.scene.nodes["__pool_tmp"] = line;
    this.run("__pool_tmp");
  }

  /** Play a sequential pool as one exchange (e.g. mission_fail_swarm). */
  runPoolSequence(poolId: string): void {
    const pool = this.data.pools?.[poolId];
    if (!pool || !this.scene) { console.error(`Dialogue pool missing: ${poolId}`); return; }
    pool.lines.forEach((l, i) => {
      const n: DialogueNode = { ...l, type: l.type ?? "line" };
      if (i < pool.lines.length - 1) n.next = `__seq_${i + 1}`;
      this.scene!.nodes[`__seq_${i}`] = n;
    });
    this.run("__seq_0");
  }

  // ------------------------------------------------------------ effects / conditions
  private apply(e: Effects): void {
    if (e.respect != null) this.host.addVar("respect", e.respect);
    if (e.calm != null) this.host.addVar("calm", e.calm);
    if (e.tp != null) { this.host.addVar("trade_points", e.tp); this.host.ledger(e.tp, `dialogue:${this.currentId}`); }
    if (e.noise_db != null) this.host.emitNoise(e.noise_db, e.noise_marker);
    for (const [k, v] of Object.entries(e.set_flags ?? {})) this.host.setFlag(k, v);
    for (const [k, v] of Object.entries(e.set_vars ?? {})) this.host.setVar(k, v);
    for (const [k, v] of Object.entries(e.add_vars ?? {})) this.host.addVar(k, v);
    for (const i of e.give_items ?? []) this.host.giveItem(i);
    for (const u of e.unlock ?? []) this.host.unlock(u);
    if (e.start_gameplay) { this.host.startGameplay(e.start_gameplay); this.emit("gameplay_requested", e.start_gameplay); }
    if (e.checkpoint) this.host.checkpoint(e.checkpoint);
    if (e.log) this.host.logEvent(e.log);
    this.emit("effects_applied", e);
  }

  evalCond(c: Condition): boolean {
    if ("flag" in c) return this.host.getFlag(c.flag) === c.is;
    if ("has_item" in c) return this.host.hasItem(c.has_item);
    if ("all" in c) return c.all.every((x) => this.evalCond(x));
    if ("any" in c) return c.any.some((x) => this.evalCond(x));
    if ("not" in c) return !this.evalCond(c.not);
    if ("var" in c) {
      const v = this.host.getVar(c.var);
      if (c.eq != null && v !== c.eq) return false;
      if (c.gte != null && v < c.gte) return false;
      if (c.lte != null && v > c.lte) return false;
      if (c.gt != null && v <= c.gt) return false;
      if (c.lt != null && v >= c.lt) return false;
      return true;
    }
    return true;
  }

  // ------------------------------------------------------------ helpers
  private static VOLUME_DB: Record<string, number> = { whisper: 0, low: 0, normal: 30, raised: 50, shout: 70 };

  private speakerOf(node: DialogueNode): Character {
    const id = node.speaker ?? "";
    return this.data.characters[id] ?? { name: id };
  }
  private voiceBedOf(node: DialogueNode, spk: Character): VoiceBed {
    return node.voice_bed ?? spk.voice_bed ?? "none";
  }
  private volumeDb(node: DialogueNode, spk: Character, bed: VoiceBed): number {
    if (node.noise_db != null) return node.noise_db;
    if (bed !== "none") return 0; // radio voices don't wake anyone
    const v = node.volume ?? spk.default_volume ?? "whisper";
    return DialogueRunner.VOLUME_DB[v] ?? 0;
  }

  private static ONES = ["zero","one","two","three","four","five","six","seven","eight","nine","ten",
    "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  private static TENS = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  static words(n: number): string {
    n = Math.trunc(n);
    if (n < 0) return "minus " + DialogueRunner.words(-n);
    if (n < 20) return DialogueRunner.ONES[n];
    if (n < 100) return DialogueRunner.TENS[Math.floor(n / 10)] + (n % 10 === 0 ? "" : "-" + DialogueRunner.ONES[n % 10]);
    return String(n);
  }

  /** {TOKEN} placeholders, then {var:x} / {var_words:x} / {Var_words:x}. */
  substitute(text: string): string {
    let out = text;
    for (const [k, v] of Object.entries(this.data.meta.placeholders ?? {})) out = out.split(`{${k}}`).join(v);
    out = out.replace(/\{(var|var_words|Var_words):([a-z_]+)\}/g, (_m, kind: string, name: string) => {
      const v = Math.trunc(this.host.getVar(name) || 0);
      if (kind === "var") return String(v);
      const w = DialogueRunner.words(v);
      return kind === "Var_words" ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    });
    return out;
  }

  private maybeAuto(): void {
    const ms = this.current?.auto_ms;
    if (ms != null) this.autoTimer = this.host.setTimer(ms, () => { this.autoTimer = null; this.advance(); });
  }

  private killTimers(): void {
    if (this.autoTimer) this.host.clearTimer(this.autoTimer);
    if (this.choiceTimer) this.host.clearTimer(this.choiceTimer);
    this.autoTimer = null;
    this.choiceTimer = null;
  }

  /** Snapshot for save files. */
  serialize() {
    return {
      sceneId: this.scene?.id ?? null,
      firedOnce: [...this.firedOnce],
      poolUsed: Object.fromEntries(this.poolUsed),
    };
  }
  restore(s: ReturnType<DialogueRunner["serialize"]>): void {
    this.firedOnce = new Set(s.firedOnce);
    this.poolUsed = new Map(Object.entries(s.poolUsed));
  }
}
