/**
 * Zustand Game Store — Ali's Aigoo Apocalypse
 * All game state, persisted via localStorage
 *
 * PERFORMANCE: Store uses subscribeWithSelector middleware to enable
 * transient subscriptions for per-frame readers (60Hz updates).
 * This bypasses React rendering — critical inside <Canvas>.
 * See zustand-patterns skill for optimization patterns.
 */
import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { Question } from '@/types/quiz';

export type GamePhase =
  | 'menu'
  | 'driving'
  | 'quiz'
  | 'paused'
  | 'gasStation'
  | 'outOfGas'
  | 'victory'
  | 'gameover'
  | 'dialogue'
  | 'walking'
  | 'card';

export type WorldMode = 'highway' | 'kent';

export type Biome = 'city' | 'highway' | 'rural';

// ─── Biome thresholds ────────────────────────────────────────────────────────
const BIOME_THRESHOLDS: Array<{ max: number; biome: Biome }> = [
  { max: 700, biome: 'city' },
  { max: 2100, biome: 'highway' },
  { max: 2800, biome: 'rural' },
];

function getBiome(mileage: number): Biome {
  for (const { max, biome } of BIOME_THRESHOLDS) {
    if (mileage < max) return biome;
  }
  return 'rural';
}

// ─── Day/Night cycle ─────────────────────────────────────────────────────────
export type TimeOfDay = 'day' | 'sunset' | 'night';
export type CameraMode = 'chase' | 'birdseye' | 'profile' | 'quiet';

function getTimeOfDay(mileage: number): TimeOfDay {
  const phase = (mileage % 400) / 400; // 0–1 repeating
  if (phase < 0.6) return 'day';
  if (phase < 0.7) return 'sunset';
  return 'night';
}

// ─── Love's Truck Stop mile markers ──────────────────────────────────────────
const FUEL_STOP_MILES = [175, 525, 875, 1225, 1575, 1925, 2275, 2625];

// ─── State shape ─────────────────────────────────────────────────────────────
interface ControlsSlice {
  steering: number;   // -1 to 1
  throttle: number;   // 0 to 1
  brake: number;      // 0 to 1
}

interface VehicleSlice {
  walkerPosition: [number, number, number];   // Quiet Roads on-foot sections
  vehiclePosition: [number, number, number];
  vehicleHeading: number; // Y-axis rotation in radians
  velocityMph: number;
  engineRPM: number;
  engineGear: number;
  engineSpeed: number;
  absActive: boolean;
}

interface GameSlice {
  phase: GamePhase;
  prePausePhase: GamePhase;
  worldMode: WorldMode;
  mileage: number;
  lastQuizMile: number;
  lastFuelStopMile: number;
  visitedFuelStops: number[]; // mile markers already visited
  currentBiome: Biome;
  hp: number;
  fuel: number;
  timeOfDay: TimeOfDay;
}

interface QuizSlice {
  quizActive: boolean;
  currentQuestion: Question | null;
  answeredIds: string[];
  questionsAnswered: number;
  correctAnswers: number;
}

interface EconomySlice {
  zCoins: number;
  streak: number;
  trafficHits: number;
}

interface SettingsSlice {
  steeringSensitivity: number; // 0.5–2.0
  cameraMode: CameraMode;
  isMuted: boolean;
  sfxVolume: number;    // 0–1
  musicVolume: number;  // 0–1
  resetCounter: number;
}

type GameState = ControlsSlice &
  VehicleSlice &
  GameSlice &
  QuizSlice &
  EconomySlice &
  SettingsSlice & {
    // Actions
    setControls: (partial: Partial<ControlsSlice>) => void;
    setVehiclePosition: (pos: [number, number, number]) => void;
    setVehicleHeading: (heading: number) => void;
    setVelocityMph: (mph: number) => void;
    setEngineRPM: (rpm: number) => void;
    setEngineGear: (gear: number) => void;
    setEngineSpeed: (speed: number) => void;
    setABSActive: (active: boolean) => void;
    setPhase: (phase: GamePhase) => void;
    setWorldMode: (mode: WorldMode) => void;
    addMileage: (delta: number) => void;
    setFuel: (n: number) => void;
    consumeFuel: (delta: number) => void;
    refuel: () => void;
    triggerQuiz: (question: Question) => void;
    answerQuiz: (selectedAnswer: string) => { correct: boolean; coinsEarned: number };
    takeDamage: (amount: number) => void;
    addZCoins: (amount: number) => void;
    addTrafficHit: () => void;
    collectFuelCan: () => void;
    resetProgress: () => void;
    togglePause: () => void;
    cycleCameraMode: () => void;
    setMuted: (muted: boolean) => void;
    toggleMute: () => void;
    setSfxVolume: (vol: number) => void;
    setMusicVolume: (vol: number) => void;
  };

// ─── Default values ───────────────────────────────────────────────────────────
const defaultGameState: GameSlice & QuizSlice & EconomySlice = {
  phase: 'menu',
  prePausePhase: 'driving',
  worldMode: 'highway',
  mileage: 0,
  lastQuizMile: 0,
  lastFuelStopMile: 0,
  visitedFuelStops: [],
  currentBiome: 'city',
  hp: 100,
  fuel: 100,
  timeOfDay: 'day',
  quizActive: false,
  currentQuestion: null,
  answeredIds: [],
  questionsAnswered: 0,
  correctAnswers: 0,
  zCoins: 0,
  streak: 0,
  trafficHits: 0,
};

// ─── Store ────────────────────────────────────────────────────────────────────
export const useGameStore = create<GameState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
      // Runtime (not persisted)
      steering: 0,
      throttle: 0,
      brake: 0,
      walkerPosition: [0, 0, 0],
      vehiclePosition: [0, 0.7, 0],
      vehicleHeading: 0,
      velocityMph: 0,
      engineRPM: 800,
      engineGear: 1,
      engineSpeed: 0,
      absActive: false,

      // Persisted initial state
      ...defaultGameState,

      // Settings
      steeringSensitivity: 1.0,
      cameraMode: 'chase' as CameraMode,
      isMuted: false,
      sfxVolume: 0.7,
      musicVolume: 0.3,
      resetCounter: 0,

      // ── Controls ────────────────────────────────────────────────────────────
      setControls: (partial) => set((s) => ({ ...s, ...partial })),

      // ── Vehicle ─────────────────────────────────────────────────────────────
      setVehiclePosition: (pos) => set({ vehiclePosition: pos }),
      setVehicleHeading: (heading) => set({ vehicleHeading: heading }),
      setVelocityMph: (mph) => set({ velocityMph: mph }),
      setEngineRPM: (rpm) => set({ engineRPM: rpm }),
      setEngineGear: (gear) => set({ engineGear: gear }),
      setEngineSpeed: (speed) => set({ engineSpeed: speed }),
      setABSActive: (active) => set({ absActive: active }),

      // ── Phase ───────────────────────────────────────────────────────────────
      setPhase: (phase) => set({ phase }),
      setWorldMode: (mode) => set({ worldMode: mode, cameraMode: mode === 'kent' ? 'quiet' : 'chase' }),

      togglePause: () => {
        const { phase, prePausePhase } = get();
        if (phase === 'driving' || phase === 'walking' || phase === 'dialogue' || phase === 'card') set({ phase: 'paused', prePausePhase: phase });
        else if (phase === 'paused') set({ phase: prePausePhase });
      },

      cycleCameraMode: () => {
        const modes: CameraMode[] = ['chase', 'birdseye', 'profile', 'quiet'];
        const idx = modes.indexOf(get().cameraMode);
        set({ cameraMode: modes[(idx + 1) % modes.length] });
      },

      setMuted: (muted) => set({ isMuted: muted }),
      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
      setSfxVolume: (vol) => set({ sfxVolume: Math.max(0, Math.min(1, vol)) }),
      setMusicVolume: (vol) => set({ musicVolume: Math.max(0, Math.min(1, vol)) }),

      // ── Mileage + triggers ───────────────────────────────────────────────────
      addMileage: (delta) => {
        const s = get();
        if (s.phase !== 'driving') return;

        const newMileage = s.mileage + delta;
        const newBiome = getBiome(newMileage);
        const newTimeOfDay = getTimeOfDay(newMileage);

        // Victory check
        if (newMileage >= 2800) {
          set({ mileage: 2800, phase: 'victory' });
          return;
        }

        // Fuel stop trigger
        const nextFuelStop = FUEL_STOP_MILES.find(
          (m) => newMileage >= m && !s.visitedFuelStops.includes(m)
        );
        if (nextFuelStop !== undefined) {
          set({
            mileage: newMileage,
            currentBiome: newBiome,
            timeOfDay: newTimeOfDay,
            visitedFuelStops: [...s.visitedFuelStops, nextFuelStop],
            phase: 'gasStation',
          });
          return;
        }

        // Quiz trigger (grace period: no quiz before mile 10)
        const quizDue =
          newMileage >= 10 &&
          newMileage - s.lastQuizMile >= 20 &&
          !s.quizActive;

        set({
          mileage: newMileage,
          currentBiome: newBiome,
          timeOfDay: newTimeOfDay,
          ...(quizDue ? { quizActive: true } : {}),
        });
      },

      // ── Fuel ────────────────────────────────────────────────────────────────
      setFuel: (n) => set({ fuel: Math.max(0, Math.min(100, n)) }),

      consumeFuel: (delta) => {
        const { fuel, phase } = get();
        if (phase !== 'driving') return;
        const newFuel = fuel - delta;
        if (newFuel <= 0) {
          set({ fuel: 0, phase: 'outOfGas' });
        } else {
          set({ fuel: newFuel });
        }
      },

      refuel: () => {
        const { zCoins, fuel } = get();
        const cost = Math.ceil((100 - fuel) * 0.3);
        if (zCoins >= cost) {
          set({ fuel: 100, zCoins: zCoins - cost, phase: 'driving' });
        }
      },

      // ── Quiz ────────────────────────────────────────────────────────────────
      triggerQuiz: (question) =>
        set({ quizActive: true, currentQuestion: question, phase: 'quiz' }),

      answerQuiz: (selectedAnswer) => {
        const s = get();
        const q = s.currentQuestion;
        if (!q) return { correct: false, coinsEarned: 0 };

        const correct = selectedAnswer === q.correctAnswer;
        const newStreak = correct ? Math.min(s.streak + 1, 50) : 0;
        const coinsEarned = correct
          ? 10 + Math.floor(newStreak * 0.1)
          : 0;

        const newAnsweredIds = s.answeredIds.includes(q.id)
          ? s.answeredIds
          : [...s.answeredIds, q.id];

        // Reset exclusion list when all questions answered
        const resetIds =
          newAnsweredIds.length >= (s.questionsAnswered > 0 ? newAnsweredIds.length : 1);

        set({
          streak: newStreak,
          zCoins: s.zCoins + coinsEarned,
          questionsAnswered: s.questionsAnswered + 1,
          correctAnswers: s.correctAnswers + (correct ? 1 : 0),
          answeredIds: resetIds ? newAnsweredIds : newAnsweredIds,
          lastQuizMile: s.mileage,
          quizActive: false,
          // Kent (Quiet Roads) in-world prompts never cost HP — the design says wrong answers are free.
          hp: correct || s.worldMode === 'kent' ? s.hp : Math.max(0, s.hp - 10),
          phase: s.hp - 10 <= 0 && !correct && s.worldMode !== 'kent' ? 'gameover' : 'quiz',
        });

        return { correct, coinsEarned };
      },

      // ── HP ──────────────────────────────────────────────────────────────────
      takeDamage: (amount) => {
        const { hp } = get();
        const newHp = Math.max(0, hp - amount);
        set({ hp: newHp, ...(newHp <= 0 ? { phase: 'gameover' } : {}) });
      },

      // ── Economy ─────────────────────────────────────────────────────────────
      addZCoins: (amount) => set((s) => ({ zCoins: s.zCoins + amount })),

      addTrafficHit: () => set((s) => ({
        trafficHits: s.trafficHits + 1,
      })),

      collectFuelCan: () => set((s) => ({
        fuel: Math.min(100, s.fuel + 10),
      })),

      // ── Reset ───────────────────────────────────────────────────────────────
      resetProgress: () => {
        const { steeringSensitivity, resetCounter } = get();
        set({
          ...defaultGameState,
          steeringSensitivity,
          phase: 'menu',
          vehiclePosition: [0, 0.7, 0] as [number, number, number],
          vehicleHeading: 0,
          velocityMph: 0,
          engineRPM: 800,
          engineGear: 1,
          engineSpeed: 0,
          absActive: false,
          resetCounter: resetCounter + 1,
        });
      },
    }),
    {
      name: 'aigoo-game-save',
      partialize: (state) => ({
        // Exclude runtime-only state
        phase: ['driving', 'dialogue', 'walking', 'card'].includes(state.phase) ? 'menu' : state.phase,
        worldMode: state.worldMode,
        mileage: state.mileage,
        lastQuizMile: state.lastQuizMile,
        lastFuelStopMile: state.lastFuelStopMile,
        visitedFuelStops: state.visitedFuelStops,
        currentBiome: state.currentBiome,
        hp: state.hp,
        fuel: state.fuel,
        timeOfDay: state.timeOfDay,
        quizActive: false, // never resume mid-quiz from storage
        currentQuestion: state.currentQuestion,
        answeredIds: state.answeredIds,
        questionsAnswered: state.questionsAnswered,
        correctAnswers: state.correctAnswers,
        zCoins: state.zCoins,
        streak: state.streak,
        trafficHits: state.trafficHits,
        steeringSensitivity: state.steeringSensitivity,
        isMuted: state.isMuted,
        sfxVolume: state.sfxVolume,
        musicVolume: state.musicVolume,
      }),
    }
    )
  )
);
