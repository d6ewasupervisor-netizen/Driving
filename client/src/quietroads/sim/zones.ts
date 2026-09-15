import { type Rect, type Vec2, rectHas } from "./math";

export type ZoneKind = "waypoint" | "stop" | "school" | "rail" | "sign";

export interface ZoneDef {
  kind: ZoneKind;
  id: string;
  rect: Rect;              // metres
  quiz?: string;           // in_world_trigger to ask on entry
  quizDelayS?: number;
  once?: boolean;          // default true (stops always re-arm)
}

export interface ZoneEvents {
  fire: (event: string, data?: Record<string, unknown>) => void;
  requestQuiz: (trigger: string, delayS: number) => void;
  setSpeedLimit: (mph: number) => void;
}

/** Rectangular triggers with stop grading. Feed the car position/speed each frame. */
export class ZoneField {
  private inside = new Set<string>();
  private fired = new Set<string>();
  private stopTrack = new Map<string, { minSpeed: number; stoppedS: number }>();
  quizzesEnabled = false;

  constructor(public defs: ZoneDef[], private ev: ZoneEvents) {}

  rearm(kinds?: ZoneKind[]) {
    if (!kinds) { this.fired.clear(); return; }
    for (const d of this.defs) if (kinds.includes(d.kind)) this.fired.delete(zoneKey(d));
  }

  reset() { this.inside.clear(); this.fired.clear(); this.stopTrack.clear(); }

  step(dt: number, carPos: Vec2, speedMs: number) {
    for (const d of this.defs) {
      const key = `${d.kind}:${d.id}`;
      const now = rectHas(d.rect, carPos);
      const was = this.inside.has(key);
      if (now && !was) { this.inside.add(key); this.enter(d, key); }
      if (!now && was) { this.inside.delete(key); this.exit(d, key); }
      const t = this.stopTrack.get(key);
      if (t) { const v = Math.abs(speedMs); t.minSpeed = Math.min(t.minSpeed, v); if (v < 0.3) t.stoppedS += dt; }
    }
  }

  private enter(d: ZoneDef, key: string) {
    if ((d.once ?? true) && d.kind !== "stop" && this.fired.has(key)) return;
    this.fired.add(key);
    switch (d.kind) {
      case "waypoint": this.ev.fire(`waypoint.reach:${d.id}`); break;
      case "stop": this.stopTrack.set(key, { minSpeed: Infinity, stoppedS: 0 }); this.ev.fire("stop.approach", { stop: d.id }); break;
      case "school": this.ev.setSpeedLimit(20); this.ev.fire("zone.school.enter"); break;
      case "rail": this.ev.fire("zone.rail.enter"); break;
      case "sign": this.ev.fire(`sign.prompt:${d.id}`); break;
    }
    if (d.quiz && this.quizzesEnabled && !this.quizAsked.has(key)) {
      this.ev.requestQuiz(d.quiz, d.quizDelayS ?? 0);
      if (d.kind !== "stop") this.quizAsked.add(key);
    }
  }
  private quizAsked = new Set<string>();

  private exit(d: ZoneDef, key: string) {
    if (d.kind === "stop") {
      const t = this.stopTrack.get(key); this.stopTrack.delete(key);
      if (!t) return;
      if (t.stoppedS >= 0.4) this.ev.fire("stop.full", { stop: d.id });
      else this.ev.fire("stop.rolled", { stop: d.id, min_mph: Math.round(t.minSpeed / 0.44704) });
    } else if (d.kind === "school") { this.ev.setSpeedLimit(25); this.ev.fire("zone.school.exit"); }
  }
}
export function zoneKey(d: ZoneDef) { return `${d.kind}:${d.id}`; }
