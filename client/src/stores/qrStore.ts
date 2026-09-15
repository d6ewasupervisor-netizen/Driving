/**
 * qrStore — Quiet Roads progress (persisted) + transient HUD state.
 * The DialogueHost in QuietRoadsBridge reads/writes the persisted half.
 * HUD components subscribe to the transient half.
 */
import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type { ShownLine, DialogueNode, ChoiceOption, SimFrame, MasteryRecord } from '@/quietroads';

export interface TelemetryRow {
  ts: number;
  event: string;
  data?: Record<string, unknown>;
}

interface Persisted {
  vars: Record<string, number>;
  flags: Record<string, boolean>;
  items: string[];
  unlocks: string[];
  ledger: { ts: number; delta: number; reason: string }[];
  mastery: Record<string, MasteryRecord>;
  attempts: { ts: number; question_id: string; correct: boolean; chosen: number; response_ms: number }[];
  choiceLog: { ts: number; scene: string; node: string; option: string }[];
  telemetry: TelemetryRow[];
  checkpoint: string | null;
  sceneId: string | null;
  runnerState: { sceneId: string | null; firedOnce: string[]; poolUsed: Record<string, number[]> } | null;
  placeholders: Record<string, string>;
}

interface Transient {
  line: ShownLine | null;
  direction: { node: DialogueNode; id: string } | null;
  choices: { node: DialogueNode; options: ChoiceOption[] } | null;
  objective: string;
  toast: string;
  frame: SimFrame | null;
  horn: boolean;
  run: boolean;
  qteActive: boolean;
}

interface Actions {
  setVar: (k: string, v: number) => void;
  addVar: (k: string, d: number) => void;
  setFlag: (k: string, v: boolean) => void;
  giveItem: (id: string) => void;
  unlock: (id: string) => void;
  addLedger: (delta: number, reason: string) => void;
  setMastery: (id: string, m: MasteryRecord) => void;
  addAttempt: (a: Persisted['attempts'][number]) => void;
  addChoice: (c: Persisted['choiceLog'][number]) => void;
  addTelemetry: (row: TelemetryRow) => void;
  drainTelemetry: () => TelemetryRow[];
  setCheckpoint: (label: string, sceneId: string | null, runnerState: Persisted['runnerState']) => void;
  setPlaceholder: (k: string, v: string) => void;
  setTransient: (partial: Partial<Transient>) => void;
  setHorn: (v: boolean) => void;
  setRun: (v: boolean) => void;
  resetQuietRoads: () => void;
}

export type QRState = Persisted & Transient & Actions;

const emptyPersisted: Persisted = {
  vars: {}, flags: {}, items: [], unlocks: [], ledger: [], mastery: {}, attempts: [], choiceLog: [],
  telemetry: [], checkpoint: null, sceneId: null, runnerState: null,
  placeholders: { MOM: 'Mom', RAY: 'Ray', GRANDMA: 'Grandma', GRANDMA_NAME: 'June', GRANDMA_INITIALS: 'G.J.', PLAYER: 'Ali', PLAYER_FULL: 'Alison' },
};

const emptyTransient: Transient = {
  line: null, direction: null, choices: null, objective: '', toast: '', frame: null, horn: false, run: false, qteActive: false,
};

export const useQRStore = create<QRState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...emptyPersisted,
        ...emptyTransient,

        setVar: (k, v) => set((s) => ({ vars: { ...s.vars, [k]: v } })),
        addVar: (k, d) => set((s) => ({ vars: { ...s.vars, [k]: (s.vars[k] ?? 0) + d } })),
        setFlag: (k, v) => set((s) => ({ flags: { ...s.flags, [k]: v } })),
        giveItem: (id) => set((s) => (s.items.includes(id) ? s : { items: [...s.items, id] })),
        unlock: (id) => set((s) => (s.unlocks.includes(id) ? s : { unlocks: [...s.unlocks, id] })),
        addLedger: (delta, reason) => set((s) => ({ ledger: [...s.ledger.slice(-499), { ts: Date.now(), delta, reason }] })),
        setMastery: (id, m) => set((s) => ({ mastery: { ...s.mastery, [id]: m } })),
        addAttempt: (a) => set((s) => ({ attempts: [...s.attempts.slice(-1999), a] })),
        addChoice: (c) => set((s) => ({ choiceLog: [...s.choiceLog, c] })),
        addTelemetry: (row) => set((s) => ({ telemetry: [...s.telemetry.slice(-999), row] })),
        drainTelemetry: () => { const rows = get().telemetry; set({ telemetry: [] }); return rows; },
        setCheckpoint: (label, sceneId, runnerState) => set({ checkpoint: label, sceneId, runnerState }),
        setPlaceholder: (k, v) => set((s) => ({ placeholders: { ...s.placeholders, [k]: v } })),
        setTransient: (partial) => set(partial),
        setHorn: (v) => set({ horn: v }),
        setRun: (v) => set({ run: v }),
        resetQuietRoads: () => set({ ...emptyPersisted, placeholders: get().placeholders, ...emptyTransient }),
      }),
      {
        name: 'quiet-roads-save',
        partialize: (s) => ({
          vars: s.vars, flags: s.flags, items: s.items, unlocks: s.unlocks, ledger: s.ledger,
          mastery: s.mastery, attempts: s.attempts, choiceLog: s.choiceLog, telemetry: s.telemetry,
          checkpoint: s.checkpoint, sceneId: s.sceneId, runnerState: s.runnerState, placeholders: s.placeholders,
        }),
      }
    )
  )
);
