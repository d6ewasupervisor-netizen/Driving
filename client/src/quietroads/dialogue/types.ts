// Types mirror dialogue.schema.json (1.3.0). Keep in sync with the schema.

export type Volume = "whisper" | "low" | "normal" | "raised" | "shout";
export type VoiceBed = "none" | "radio_static" | "cb_radio" | "phone";
export type Delivery = "V" | "S" | "R" | "G" | "SYS";
export type NodeType =
  | "line" | "direction" | "choice" | "branch" | "wait"
  | "effects" | "pool" | "jump" | "end" | "card";
export type SceneType = "video" | "still" | "radio" | "gameplay" | "shop" | "exam";

export interface Character {
  name: string;
  color?: string;
  portrait_dir?: string;
  speaks?: boolean;
  voice_bed?: VoiceBed;
  default_volume?: Volume;
}

export type Condition =
  | { flag: string; is: boolean }
  | { var: string; eq?: number; gte?: number; lte?: number; gt?: number; lt?: number }
  | { has_item: string }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export interface Effects {
  respect?: number;
  calm?: number;
  tp?: number;
  noise_db?: number;
  noise_marker?: string;
  set_flags?: Record<string, boolean>;
  set_vars?: Record<string, number>;
  add_vars?: Record<string, number>;
  give_items?: string[];
  unlock?: string[];
  start_gameplay?: string;
  checkpoint?: string;
  log?: string;
}

export interface ChoiceOption {
  id: string;
  text: string;
  next: string;
  condition?: Condition;
  effects?: Effects;
  tracked?: boolean;
}

export interface Branch {
  condition?: Condition;
  next: string;
}

export interface DialogueNode {
  type: NodeType;
  speaker?: string;
  text?: string;
  text_key?: string;
  emotion?: string;
  volume?: Volume;
  noise_db?: number;
  voice_bed?: VoiceBed;
  delivery?: Delivery;
  portrait?: string;
  anim?: string;
  sfx?: string[];
  music?: string;
  background?: string;
  auto_ms?: number;
  effects?: Effects;
  condition?: Condition;
  next?: string;
  next_scene?: string;
  choices?: ChoiceOption[];
  timeout_ms?: number;
  default_option?: string;
  branches?: Branch[];
  wait_for?: string;
  pool?: string;
  scene?: string;
  /** card node: PINK MENACE card id (e.g. "II-007"). The UI shows it; resolveCard() continues. */
  card?: string;
}

/** What the UI reports back when a card is answered (or dismissed, for dossiers). */
export interface CardResult {
  card: string;
  option: string | null;     // option id, or null for a dossier/beat
  correct: boolean | null;   // null when the card has no graded options
  noise?: number;            // card state_delta.noise (small ints, may be negative)
  time_cost?: number;
}

export interface Trigger {
  event: string;
  node: string;
  condition?: Condition;
  once?: boolean;
  cooldown_ms?: number;
  priority?: number;
  interrupt?: boolean;
}

export interface Scene {
  id: string;
  act: number;
  title: string;
  type: SceneType;
  location?: string;
  video?: string;
  background?: string;
  music?: string;
  ambience?: string;
  entry: string;
  nodes: Record<string, DialogueNode>;
  triggers?: Trigger[];
  guide_refs?: string[];
}

export interface Pool {
  pick?: "random" | "sequential";
  no_repeat?: boolean;
  lines: DialogueNode[];
}

export interface VariableDef {
  type: "int" | "float";
  default: number;
  min?: number;
  max?: number;
  hidden?: boolean;
}

export interface DialogueFile {
  meta: {
    schema_version: string;
    game?: string;
    acts: number[];
    locale: string;
    placeholders?: Record<string, string>;
  };
  variables?: Record<string, VariableDef>;
  flags?: Record<string, boolean>;
  characters: Record<string, Character>;
  scenes: Record<string, Scene>;
  pools?: Record<string, Pool>;
}

/** What the UI receives for a spoken line: the node plus resolved fields. */
export interface ShownLine extends DialogueNode {
  text: string;
  speaker: string;
  voice_bed: VoiceBed;
  speaker_def: Character;
  node_id: string;
}
