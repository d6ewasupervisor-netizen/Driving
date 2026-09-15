import { type Vec2, MPH, clamp } from "./math";
import type { NoiseSystem } from "./noise";

/**
 * The R3F vehicle controller owns movement. This observer watches it and
 * derives the teaching layer: stopping shadow, hard-input noise, skid, ambient
 * engine noise, speed-limit tracking. Feed it once per frame.
 */
export interface VehicleSample {
  pos: Vec2;          // metres, world XZ → (x, y)
  heading: number;    // radians, 0 = +x
  speedMs: number;    // signed, negative = reversing
  throttle: number;   // 0..1
  brake: number;      // 0..1
  steer: number;      // -1..1
  horn: boolean;
}

export const VEHICLE = {
  REACTION_S: 1.5,
  BRAKE_DECEL_DRY: 6.0,   // m/s² at μ 0.7 (heavy Beetle, ~0.6 g)
  MU: { dry: 0.7, wet: 0.4, ice: 0.15 } as { dry: number; wet: number; ice: number },
  WHEELBASE_M: 2.4,
  LENGTH_M: 4.0,
  WIDTH_M: 1.9,
};

/** Reaction + braking distance, in metres. The single most valuable visual in the game. */
export function stoppingDistanceM(speedMs: number, mu = VEHICLE.MU.dry): number {
  const v = Math.abs(speedMs);
  const decel = Math.max(VEHICLE.BRAKE_DECEL_DRY * (mu / VEHICLE.MU.dry), 0.5);
  return v * VEHICLE.REACTION_S + (v * v) / (2 * decel);
}
export const reactionDistanceM = (speedMs: number) => Math.abs(speedMs) * VEHICLE.REACTION_S;

export interface ObserverOut {
  skidding: boolean;
  stoppingM: number;
  lateralG: number;
}

export class VehicleObserver {
  mu: number = VEHICLE.MU.dry;
  skidding = false;
  private prev: VehicleSample | null = null;
  private hornHeld = false;
  private hardCd = 0; private skidCd = 0; private speedOverT = 0; private speedOverCd = 0; private ambientT = 0;
  private lastHeading = 0;

  constructor(private noise: NoiseSystem, private fire: (event: string, data?: Record<string, unknown>) => void) {}

  reset() { this.prev = null; this.skidding = false; this.hardCd = this.skidCd = this.speedOverT = this.speedOverCd = this.ambientT = 0; }

  step(dt: number, s: VehicleSample, speedLimitMph: number): ObserverOut {
    const p = this.prev ?? s;
    this.hardCd = Math.max(0, this.hardCd - dt); this.skidCd = Math.max(0, this.skidCd - dt); this.speedOverCd = Math.max(0, this.speedOverCd - dt);
    const v = Math.abs(s.speedMs);

    // horn
    if (s.horn && !this.hornHeld) { this.noise.emitKind("horn", s.pos); this.fire("horn.used"); }
    this.hornHeld = s.horn;

    // hard inputs
    if (s.throttle > 0.9 && p.throttle <= 0.9 && v < 9 && this.hardCd <= 0) { this.noise.emitKind("hard_accel", s.pos); this.fire("input.hard_accel"); this.hardCd = 1.5; }
    if (s.brake > 0.85 && p.brake <= 0.85 && v > 4.5 && this.hardCd <= 0) { this.noise.emitKind("hard_brake", s.pos); this.fire("input.hard_brake"); this.hardCd = 1.5; }

    // lateral acceleration from actual yaw rate → traction-circle skid
    let dh = s.heading - (this.prev ? this.lastHeading : s.heading);
    dh = ((dh + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    const yawRate = dt > 0 ? dh / dt : 0;
    const latAcc = Math.abs(v * yawRate);
    const limit = this.mu * 9.81;
    const was = this.skidding;
    if (latAcc > limit * 0.95 && v > 3) {
      this.skidding = true;
      if (!was && this.skidCd <= 0) { this.noise.emitKind("skid", s.pos); this.fire("skid.begin"); this.skidCd = 2; }
    } else {
      if (was) this.fire("skid.recovered");
      this.skidding = false;
    }

    // ambient engine
    this.ambientT += dt;
    if (this.ambientT >= 0.5) { this.ambientT = 0; this.noise.emitKind(v > 0.5 ? "cruise" : "idle", s.pos); }

    // speed limit (5 mph grace, 2 s sustained, 10 s cooldown)
    if (s.speedMs > (speedLimitMph + 5) * MPH) {
      this.speedOverT += dt;
      if (this.speedOverT > 2 && this.speedOverCd <= 0) { this.fire("speed.over", { mph: Math.round(v / MPH), limit: speedLimitMph }); this.speedOverCd = 10; }
    } else this.speedOverT = 0;

    this.prev = { ...s }; this.lastHeading = s.heading;
    return { skidding: this.skidding, stoppingM: stoppingDistanceM(s.speedMs, this.mu), lateralG: latAcc / 9.81 };
  }

  /** Call when the car hits static geometry (curb, house). Emits the soft collision. */
  staticHit(pos: Vec2, speedMs: number) {
    if (Math.abs(speedMs) > 1) { this.noise.emitKind("collision_soft", pos); this.fire("collision.static"); }
  }
}

/** Grace helper for touch pads: converts hold time into a pressure ramp (gentle is a skill). */
export function pedalRamp(heldS: number, fullAtS = 0.9): number { return clamp(heldS / fullAtS, 0, 1); }
