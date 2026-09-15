import type { Vec2 } from "./math";
import { dist } from "./math";

/** dB per action. Sound is a mechanic; these are the game's rules. */
export const NOISE = {
  idle: 20, cruise: 35, hard_accel: 60, hard_brake: 65,
  skid: 85, horn: 95, collision_soft: 70, collision_plow: 90,
} as const;
export type NoiseKind = keyof typeof NOISE;

export const NOISE_YELLOW = 55;
export const NOISE_RED = 75;
export const NOISE_DECAY_DB_PER_S = 22;
export const HEAR_FLOOR_DB = 30;
/**
 * dB lost per decade of distance beyond the 10 m reference; inside 10 m you hear the nominal
 * level (so an idling engine at 20 dB never clears the 30 dB floor, even up close).
 * Free-field is 20 (−6 dB/doubling), which would carry a horn 17 km. 30 (−9 dB/doubling) models
 * an absorbing suburb: one horn alerts everything inside ~32 m (loud-jump to 80), turns heads
 * out to ~215 m, and a second horn inside 32 m tips them into a swarm. "Three blocks."
 */
export const FALLOFF_DB_PER_DECADE = 30;
export const REF_DISTANCE_M = 10;

export type NoiseBand = 0 | 1 | 2; // green, yellow, red

export type NoiseZone = "outdoor" | "dol_interior";

export interface NoiseListener {
  pos: Vec2;
  /** Listeners only hear sources in their own zone — walls are absolute here. */
  zone: NoiseZone;
  /** heard = dB above the 30 dB floor at the listener's position */
  hear(heardAboveFloor: number, from: Vec2, db: number): void;
}

/**
 * The HUD meter is the loudest recent sound at the car, decaying.
 * Every emission is propagated to listeners (the Quiet) with inverse-square falloff.
 */
export class NoiseSystem {
  levelDb = 20;
  band: NoiseBand = 0;
  redEvents = 0;
  private listeners: NoiseListener[] = [];

  constructor(private fire: (event: string) => void) {}

  setListeners(l: NoiseListener[]) { this.listeners = l; }

  emitKind(kind: NoiseKind, pos: Vec2, zone: NoiseZone = "outdoor") { this.emit(NOISE[kind], pos, zone); }

  emit(db: number, pos: Vec2, zone: NoiseZone = "outdoor") {
    this.levelDb = Math.max(this.levelDb, db);
    for (const z of this.listeners) {
      if (z.zone !== zone) continue;
      const heard = NoiseSystem.heardAt(db, dist(pos, z.pos));
      if (heard > HEAR_FLOOR_DB) z.hear(heard - HEAR_FLOOR_DB, pos, db);
    }
    this.updateBand();
  }

  /** How loud a source of `db` is at distance `dm` — used by the HUD "who can hear me" ring. */
  static heardAt(db: number, dm: number): number {
    return db - FALLOFF_DB_PER_DECADE * Math.log10(Math.max(dm, REF_DISTANCE_M) / REF_DISTANCE_M);
  }
  /** Radius (m) inside which a `db` sound is heard at `heardDb` or louder. */
  static radiusFor(db: number, heardDb: number): number {
    if (db < heardDb) return 0;
    return REF_DISTANCE_M * Math.pow(10, (db - heardDb) / FALLOFF_DB_PER_DECADE);
  }
  /** Radius inside which one emission of `db` wakes a dormant Quiet to CURIOUS (needs +25 above floor). */
  static hearingRadius(db: number): number { return NoiseSystem.radiusFor(db, HEAR_FLOOR_DB + 25); }
  /** Radius inside which one emission jumps them straight to ALERT (loud rule: > +50). */
  static alertRadius(db: number): number { return NoiseSystem.radiusFor(db, HEAR_FLOOR_DB + 50); }

  step(dt: number) {
    this.levelDb = Math.max(20, this.levelDb - NOISE_DECAY_DB_PER_S * dt);
    this.updateBand();
  }

  private updateBand() {
    const b: NoiseBand = this.levelDb >= NOISE_RED ? 2 : this.levelDb >= NOISE_YELLOW ? 1 : 0;
    if (b === this.band) return;
    if (b === 2) { this.redEvents++; this.fire("noise.red"); }
    else if (b === 1 && this.band < 1) this.fire("noise.yellow");
    else if (b === 0) this.fire("noise.clear");
    this.band = b;
  }

  reset() { this.levelDb = 20; this.band = 0; }
}
