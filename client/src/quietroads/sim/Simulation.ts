import { type Vec2, rectHas, rng, MPH } from "./math";
import { NoiseSystem } from "./noise";
import { QuietField, QuietState } from "./quiet";
import { ZoneField } from "./zones";
import { VehicleObserver, VEHICLE, type VehicleSample, type ObserverOut } from "./vehicleObserver";
import { buildKentMap, type WorldMap } from "./kentMap";
import { ParkingGrader, InteriorController, type WalkerInput } from "./dol";
import type { NoiseZone } from "./noise";

export type MissionId =
  | "tutorial_carport" | "mission_dol_drive"
  | "minigame_park_dol" | "stealth_dol_interior" | "chase_dol_gracie";

export type PlayerMode = "vehicle" | "walker";

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
  mode: PlayerMode;
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
  parking: ParkingGrader;
  interior: InteriorController;
  mode: PlayerMode = "vehicle";
  speedLimitMph = 25;
  missionId: MissionId | "" = "";
  private missionStart: keyof WorldMap["starts"] = "carport";
  tutorialForgiving = false;
  /** Set by the 1.3 honk branch: she escapes the lot, per the script. Cleared at the driveway. */
  escapeForgiving = false;
  objective = "";
  private freezeReasons = new Set<string>();
  // tutorial state
  private tutStep = 0; private tutT = 0; private tutBlockEnd = false;

  constructor(private ev: SimEvents, seed = 7) {
    this.map = buildKentMap(seed);
    const fire = (e: string, d?: Record<string, unknown>) => this.ev.fire(e, d);
    this.noise = new NoiseSystem(fire);
    // Forgiving: the carport tutorial, and the scripted dash back to the car after the chase —
    // the script says she makes it; the doorway fills *after*.
    this.quiet = new QuietField({ fire, softFail: () => this.softFail() },
      () => this.tutorialForgiving || this.escapeForgiving || (this.mode === "walker" && this.interior.phase === "to_car"));
    const r = rng(seed + 1);
    for (const p of this.map.quietSpawns) this.quiet.spawn(p, r);
    for (const p of this.map.dol.quietSpawns) this.quiet.spawn(p, r, "dol_interior");
    this.noise.setListeners(this.quiet.list);
    this.zones = new ZoneField(this.map.zones, {
      fire,
      requestQuiz: (t, d) => this.ev.requestQuiz(t, d),
      setSpeedLimit: (mph) => { this.speedLimitMph = mph; },
    });
    this.vehicle = new VehicleObserver(this.noise, fire);
    const dolEv = { fire, setObjective: (t: string) => this.setObjective(t) };
    this.parking = new ParkingGrader(this.map, dolEv);
    this.interior = new InteriorController(this.map, this.noise, this.quiet, dolEv, r);
  }

  /** Where the player currently is, for noise attribution and the Quiet. */
  get playerPos(): Vec2 { return this.mode === "walker" ? this.interior.pos : (this.lastVehiclePos ?? this.map.starts.carport.pos); }
  get playerZone(): NoiseZone { return this.mode === "walker" ? this.interior.zone : "outdoor"; }
  private lastVehiclePos: Vec2 | null = null;

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
    this.tutStep = 0; this.tutT = 0; this.tutBlockEnd = false;
    switch (id) {
      case "tutorial_carport":
        this.missionId = id; this.mode = "vehicle"; this.missionStart = "carport";
        this.tutorialForgiving = true; this.zones.quizzesEnabled = false;
        this.setObjective("End of the block and back. Quietly.");
        this.resetWorld();
        break;
      case "mission_dol_drive":
        this.missionId = id; this.mode = "vehicle"; this.missionStart = "carport";
        this.tutorialForgiving = false; this.zones.quizzesEnabled = true;
        this.setObjective("Kent DOL: east on Titus, right on Central, all the way south.");
        this.resetWorld();
        break;
      case "minigame_park_dol":
        this.missionId = id; this.mode = "vehicle"; this.missionStart = "dol_lot_entry";
        this.tutorialForgiving = false; this.zones.quizzesEnabled = false;
        this.parking.reset();
        this.setObjective("Pull into the marked space. Straight. Slow. No curb.");
        this.resetWorld(false);   // keep the Quiet where they are; she just drove up
        break;
      case "stealth_dol_interior":
        this.missionId = id; this.mode = "walker"; this.missionStart = "dol_stall";
        this.tutorialForgiving = false; this.zones.quizzesEnabled = false;
        this.interior.reset();
        this.interior.setCar(this.map.starts.dol_stall.pos);
        this.ev.placeVehicle(this.map.starts.dol_stall.pos, this.map.starts.dol_stall.heading);
        this.setObjective("Find the test terminal. Walk soft.");
        break;
      case "chase_dol_gracie":
        // continues the interior mission — same controller, next phase
        this.missionId = id; this.mode = "walker";
        this.interior.beginChase();
        break;
      default: return false;
    }
    this.ev.fire(`mission.start:${id}`);
    return true;
  }

  /** Hand control back to the car (after beetle_driver_seat). */
  enterVehicle() { this.mode = "vehicle"; }

  private setObjective(t: string) { this.objective = t; this.ev.setObjective(t); }

  private resetWorld(resetQuiet = true) {
    const s = this.map.starts[this.missionStart];
    this.ev.placeVehicle(s.pos, s.heading);
    if (resetQuiet) this.quiet.reset();
    this.noise.reset(); this.zones.reset(); this.vehicle.reset();
    this.speedLimitMph = 25;
  }

  softFail() {
    this.ev.fire("mission.fail.swarm", { mission: this.missionId });
    if (this.mode === "walker") {
      this.ev.toast("Swarmed. Out the door. Try again.");
      this.interior.reset();
      this.noise.reset();
      this.setObjective("Find the test terminal. Walk soft.");
    } else {
      this.ev.toast("Swarmed. Cargo's gone. Back to the start.");
      this.resetWorld();
    }
  }

  /** Advance the world with the player in the car. Returns everything the HUD/renderer needs. */
  step(dt: number, s: VehicleSample): SimFrame {
    this.lastVehiclePos = s.pos;
    let out: ObserverOut = { skidding: this.vehicle.skidding, stoppingM: 0, lateralG: 0 };
    if (!this.frozen && this.mode === "vehicle") {
      out = this.vehicle.step(dt, s, this.speedLimitMph);
      this.noise.step(dt);
      this.zones.step(dt, s.pos, s.speedMs);
      this.quiet.step(dt, s.pos, (p) => this.blocked(p));
      const hit = this.quiet.collide(s.pos, s.heading, VEHICLE.LENGTH_M / 2, VEHICLE.WIDTH_M / 2, s.speedMs);
      if (hit === "plow") { this.noise.emitKind("collision_plow", s.pos); this.ev.fire("plow.used"); }
      else if (hit === "soft") this.noise.emitKind("collision_soft", s.pos);
      if (this.missionId === "tutorial_carport") this.tutorialTick(dt, s);
      if (this.missionId === "minigame_park_dol") this.parking.step(dt, s);
    }
    return {
      ...out,
      mode: this.mode,
      speedMph: Math.abs(s.speedMs) / MPH,
      speedLimitMph: this.speedLimitMph,
      noiseDb: this.noise.levelDb,
      noiseBand: this.noise.band,
      hearingRadiusM: NoiseSystem.hearingRadius(this.noise.levelDb),
      frozen: this.frozen,
      objective: this.objective,
    };
  }

  /** Advance the world with the player on foot (1.3). */
  stepWalker(dt: number, input: WalkerInput): SimFrame {
    if (!this.frozen && this.mode === "walker") {
      this.interior.step(dt, input);
      this.noise.step(dt);
      this.quiet.step(dt, this.interior.pos, (p) => this.blocked(p) || (rectHas(this.map.dol.floor, p) && !this.interior.walkable(p)), this.interior.zone);
    }
    return {
      mode: this.mode,
      skidding: false, stoppingM: 0, lateralG: 0,
      speedMph: this.interior.speed / MPH,
      speedLimitMph: 0,
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
    for (const q of this.quiet.list) if (q.zone === this.playerZone) c[(["dormant", "curious", "alert", "swarm"] as const)[q.state]]++;
    return c;
  }
}

export { QuietState };
