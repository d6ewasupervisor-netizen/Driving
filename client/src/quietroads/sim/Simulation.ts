import { type Vec2, rectHas, rng, MPH } from "./math";
import { NoiseSystem } from "./noise";
import { QuietField, QuietState } from "./quiet";
import { ZoneField } from "./zones";
import { VehicleObserver, VEHICLE, type VehicleSample, type ObserverOut } from "./vehicleObserver";
import { buildKentMap, type WorldMap } from "./kentMap";

export type MissionId = "tutorial_carport" | "mission_dol_drive";

export interface SimEvents {
  /** Game events for the DialogueRunner (dlg.onEvent) and telemetry. */
  fire: (event: string, data?: Record<string, unknown>) => void;
  requestQuiz: (trigger: string, delayS: number) => void;
  setObjective: (text: string) => void;
  toast: (text: string) => void;
  /** The sim wants the car placed here (mission start, soft-fail reset). */
  placeVehicle: (pos: Vec2, heading: number) => void;
}

export interface SimFrame extends ObserverOut {
  speedMph: number;
  speedLimitMph: number;
  noiseDb: number;
  noiseBand: 0 | 1 | 2;
  hearingRadiusM: number;   // how far the current noise level carries above the floor
  frozen: boolean;
  objective: string;
}

/**
 * One object the R3F scene talks to. Per frame:
 *   const f = sim.step(dt, sampleFromYourCar());
 * then render sim.quiet.list, f.stoppingM (shadow), f.noiseBand (meter), etc.
 */
export class Simulation {
  map: WorldMap;
  noise: NoiseSystem;
  quiet: QuietField;
  zones: ZoneField;
  vehicle: VehicleObserver;
  speedLimitMph = 25;
  missionId: MissionId | "" = "";
  tutorialForgiving = false;
  objective = "";
  private freezeReasons = new Set<string>();
  // tutorial state
  private tutStep = 0; private tutT = 0; private tutBlockEnd = false;

  constructor(private ev: SimEvents, seed = 7) {
    this.map = buildKentMap(seed);
    const fire = (e: string, d?: Record<string, unknown>) => this.ev.fire(e, d);
    this.noise = new NoiseSystem(fire);
    this.quiet = new QuietField({ fire, softFail: () => this.softFail() }, () => this.tutorialForgiving);
    const r = rng(seed + 1);
    for (const p of this.map.quietSpawns) this.quiet.spawn(p, r);
    this.noise.setListeners(this.quiet.list);
    this.zones = new ZoneField(this.map.zones, {
      fire,
      requestQuiz: (t, d) => this.ev.requestQuiz(t, d),
      setSpeedLimit: (mph) => { this.speedLimitMph = mph; },
    });
    this.vehicle = new VehicleObserver(this.noise, fire);
  }

  get frozen() { return this.freezeReasons.size > 0; }
  freeze(reason: string) { this.freezeReasons.add(reason); }
  unfreeze(reason: string) { this.freezeReasons.delete(reason); }

  /** True if a point is inside a building or off the map. R3F should use this for the car too, or Rapier. */
  blocked(p: Vec2): boolean {
    if (!rectHas(this.map.bounds, p)) return true;
    for (const b of this.map.buildings) if (rectHas(b.rect, p)) return true;
    return false;
  }

  startMission(id: MissionId): boolean {
    this.missionId = id;
    this.tutStep = 0; this.tutT = 0; this.tutBlockEnd = false;
    switch (id) {
      case "tutorial_carport":
        this.tutorialForgiving = true; this.zones.quizzesEnabled = false;
        this.setObjective("End of the block and back. Quietly.");
        break;
      case "mission_dol_drive":
        this.tutorialForgiving = false; this.zones.quizzesEnabled = true;
        this.setObjective("Kent DOL: east on Titus, right on Central, all the way south.");
        break;
      default: return false;
    }
    this.resetWorld();
    this.ev.fire(`mission.start:${id}`);
    return true;
  }

  private setObjective(t: string) { this.objective = t; this.ev.setObjective(t); }

  private resetWorld() {
    const s = this.map.starts.carport;
    this.ev.placeVehicle(s.pos, s.heading);
    this.quiet.reset(); this.noise.reset(); this.zones.reset(); this.vehicle.reset();
    this.speedLimitMph = 25;
  }

  softFail() {
    this.ev.fire("mission.fail.swarm", { mission: this.missionId });
    this.ev.toast("Swarmed. Cargo's gone. Back to the start.");
    this.resetWorld();
  }

  /** Advance the world. Returns everything the HUD/renderer needs this frame. */
  step(dt: number, s: VehicleSample): SimFrame {
    let out: ObserverOut = { skidding: this.vehicle.skidding, stoppingM: 0, lateralG: 0 };
    if (!this.frozen) {
      out = this.vehicle.step(dt, s, this.speedLimitMph);
      this.noise.step(dt);
      this.zones.step(dt, s.pos, s.speedMs);
      this.quiet.step(dt, s.pos, (p) => this.blocked(p));
      const hit = this.quiet.collide(s.pos, s.heading, VEHICLE.LENGTH_M / 2, VEHICLE.WIDTH_M / 2, s.speedMs);
      if (hit === "plow") { this.noise.emitKind("collision_plow", s.pos); this.ev.fire("plow.used"); }
      else if (hit === "soft") this.noise.emitKind("collision_soft", s.pos);
      if (this.missionId === "tutorial_carport") this.tutorialTick(dt, s);
    }
    return {
      ...out,
      speedMph: Math.abs(s.speedMs) / MPH,
      speedLimitMph: this.speedLimitMph,
      noiseDb: this.noise.levelDb,
      noiseBand: this.noise.band,
      hearingRadiusM: NoiseSystem.hearingRadius(this.noise.levelDb),
      frozen: this.frozen,
      objective: this.objective,
    };
  }

  /** Game events that the sim itself reacts to (route these from your event bus). */
  onEvent(name: string) {
    if (this.missionId === "tutorial_carport" && name === "waypoint.reach:block_end") {
      this.tutBlockEnd = true;
      this.setObjective("Now back to the carport. Same speed, same care.");
    }
  }

  /** Speed multiplier the car should apply when hit by a collision (R3F applies it to its own velocity). */
  static collisionSpeedFactor(kind: "plow" | "soft" | "static"): number {
    return kind === "plow" ? 0.85 : kind === "soft" ? 0.6 : 0.25;
  }

  private tutorialTick(dt: number, s: VehicleSample) {
    this.tutT += dt;
    const v = Math.abs(s.speedMs) / MPH;
    const next = (evt: string) => { this.ev.fire(evt); this.tutStep++; this.tutT = 0; };
    switch (this.tutStep) {
      case 0: if (this.tutT > 1.2) next("tutorial.step.throttle"); break;
      case 1: if (v > 3 && this.tutT > 2.5) next("tutorial.step.stopping_shadow"); break;
      case 2: if (this.tutT > 4.5) next("tutorial.step.noise_meter"); break;
      case 3: if (this.tutT > 4.5) next("tutorial.step.brake"); break;
      case 4: if (this.tutT > 4.5) next("tutorial.step.objective"); break;
      case 5:
        if (this.tutBlockEnd && s.pos.x < 30 && v < 1) {
          this.tutStep = 6; this.missionId = ""; this.tutorialForgiving = false; this.setObjective("");
          this.ev.fire("tutorial.complete", { red_events: this.noise.redEvents });
        }
        break;
    }
  }

  /** Counts for the HUD / dashboard. */
  quietSummary() {
    const c = { dormant: 0, curious: 0, alert: 0, swarm: 0 };
    for (const q of this.quiet.list) c[(["dormant", "curious", "alert", "swarm"] as const)[q.state]]++;
    return c;
  }
}

export { QuietState };
