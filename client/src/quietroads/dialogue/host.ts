import type { Character, DialogueNode, Effects, ShownLine } from "./types";

/**
 * The runner never touches game objects directly. The game provides a host
 * that implements these hooks; tests provide a fake. Mirrors the singletons
 * the GDScript version assumed (GameState, Inventory, Unlocks, Ledger,
 * SaveSystem, Telemetry, Audio, NoiseSystem, Markers, EventBus).
 */
export interface DialogueHost {
  // ---- state
  /** Return NaN for an unset variable so load() can seed the file default. */
  getVar(name: string): number;
  setVar(name: string, value: number): void;
  addVar(name: string, delta: number): void;
  /** Return undefined for an unset flag so load() can seed the file default. */
  getFlag(name: string): boolean | undefined;
  setFlag(name: string, value: boolean): void;
  hasItem(id: string): boolean;
  giveItem(id: string): void;
  unlock(id: string): void;

  // ---- world
  /** Emit a noise at the player, or at a named world marker when given. */
  emitNoise(db: number, marker?: string): void;
  playSfx(name: string): void;
  animCue(name: string): void;

  // ---- persistence & telemetry
  checkpoint(label: string): void;
  ledger(delta: number, reason: string): void;
  logEvent(name: string): void;
  logChoice(sceneId: string, nodeId: string, optionId: string): void;

  // ---- control
  startGameplay(id: string): void;

  // ---- timers (injected so tests can be synchronous)
  setTimer(ms: number, fn: () => void): TimerHandle;
  clearTimer(h: TimerHandle): void;
  /** Monotonic milliseconds, for trigger cooldowns. */
  now(): number;
  /** Random in [0,1). Injected so pools are deterministic in tests. */
  random(): number;
}

export type TimerHandle = unknown;

/** Signals the UI layer subscribes to. */
export interface DialogueEvents {
  line_shown: (line: ShownLine) => void;
  direction_shown: (node: DialogueNode, nodeId: string) => void;
  choice_shown: (node: DialogueNode, options: DialogueNode["choices"], nodeId: string) => void;
  choice_hidden: () => void;
  /** A PINK MENACE card is on screen; the UI must call runner.resolveCard() to continue. */
  card_shown: (cardId: string, nodeId: string) => void;
  effects_applied: (effects: Effects) => void;
  gameplay_requested: (id: string) => void;
  scene_started: (sceneId: string) => void;
  scene_finished: (sceneId: string, nextScene: string) => void;
  /** Fired when a bark ends and nothing is on screen (UI should clear the box). */
  idle: () => void;
}

export type CharacterMap = Record<string, Character>;
