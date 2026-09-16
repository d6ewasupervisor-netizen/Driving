// PINK MENACE cards — the judgment layer. Data lives in data/cards.json (imported by the client).

export interface CardOption {
  id: string;
  text: string;
  correct: boolean;
  result: string;
  state_delta?: { noise?: number; yaw?: number; time_cost?: number; [k: string]: number | undefined };
}

export interface Card {
  card_id: string;
  act: string;                 // "I".."VI"
  zone?: string;
  driver?: string;
  card_type: string;           // scene | rule | hazard | dossier | convoy | ledger | wrench | beat | ...
  title: string;
  hook?: string;
  scene?: string;
  decision?: string;
  options?: CardOption[];
  debrief?: string;
  source?: { psdp_skill?: string; dol_section?: string; teaching_target?: string };
  cast?: string[];
  image: string | null;
}

export class CardDeck {
  private byId = new Map<string, Card>();
  load(cards: Card[]): this { for (const c of cards) this.byId.set(c.card_id, c); return this; }
  get(id: string): Card | undefined { return this.byId.get(id); }
  has(id: string): boolean { return this.byId.has(id); }
  get size(): number { return this.byId.size; }
  /** Graded = has options with a correct one. Dossiers/beats are read-only. */
  static isGraded(c: Card): boolean { return !!c.options?.some((o) => o.correct); }
  byAct(act: string): Card[] { return [...this.byId.values()].filter((c) => c.act === act); }
}

/**
 * In-world hazards → cards. When the sim fires one of these triggers on Kent's
 * roads, the bridge shows the card instead of a plain question. Everything else
 * still falls through to the question bank.
 */
export const CARD_FOR_TRIGGER: Record<string, string[]> = {
  "sign.prompt:regulatory": ["II-003"],   // Red Octagon, White Fog — complete stop at the line
  "sign.prompt:school":     ["II-002"],   // White Lights, Empty Yard — flashing school lamps
  "stop.approach":          ["II-024"],   // First In at the Four-Way
  "zone.school.enter":      ["II-027"],   // Search the Edges Again
  "follow.close":           ["II-012"],   // Three Seconds, Not One
};
