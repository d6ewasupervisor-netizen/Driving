import { type Vec2, rectHas, dist, sub, norm, add, mul, len, clamp, angle } from "./math";
import type { WorldMap } from "./kentMap";
import type { NoiseSystem } from "./noise";
import type { QuietField } from "./quiet";
import type { VehicleSample } from "./vehicleObserver";

export type DolEvents = {
  fire: (event: string, data?: Record<string, unknown>) => void;
  setObjective: (text: string) => void;
};

// ============================================================================ 1.2 — parking
/**
 * Pull in straight, slow, don't touch the curb. Grades one attempt:
 *   park.clean  — stopped inside the target stall, roughly aligned, no curb contact
 *   park.curb   — the nose crossed the head curb with any real speed
 * The mission ends on either; the dialogue decides what Ali says.
 */
export class ParkingGrader {
  private stoppedS = 0;
  private done = false;
  private curbHit = false;
  constructor(private map: WorldMap, private ev: DolEvents, private noseOffsetM = 2.1) {}

  get finished() { return this.done; }
  reset() { this.stoppedS = 0; this.done = false; this.curbHit = false; }

  step(dt: number, s: VehicleSample): "clean" | "curb" | null {
    if (this.done) return null;
    const stall = this.map.parking.stalls[this.map.parking.target];
    const nose = { x: s.pos.x + Math.cos(s.heading) * this.noseOffsetM, y: s.pos.y + Math.sin(s.heading) * this.noseOffsetM };
    const curbY = stall.y + stall.h;
    const inLane = nose.x > stall.x - 0.6 && nose.x < stall.x + stall.w + 0.6;
    // Curb: nose past the head of the stall with speed → a tap. 55 dB and everybody in the queue looks.
    if (inLane && nose.y >= curbY && Math.abs(s.speedMs) > 0.3 && !this.curbHit) {
      this.curbHit = true;
      this.done = true;
      this.ev.fire("park.curb", { mph: Math.round(Math.abs(s.speedMs) / 0.44704) });
      return "curb";
    }
    const inside = rectHas(stall, s.pos, 0.2);
    const facingSouth = Math.abs(normAngle(s.heading - Math.PI / 2)) < 0.22; // ±12.6°
    if (inside && facingSouth && Math.abs(s.speedMs) < 0.2) this.stoppedS += dt; else this.stoppedS = 0;
    if (this.stoppedS >= 0.6) {
      this.done = true;
      this.ev.fire("park.clean");
      return "clean";
    }
    return null;
  }
}

function normAngle(a: number) { return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; }

// ============================================================================ 1.3 — on foot
export interface WalkerInput { x: number; y: number; run: boolean } // x east, y south, each -1..1

export const WALKER = {
  WALK_MS: 1.3,
  RUN_MS: 2.6,
  CARRIER_SLOW: 0.85,      // both carriers → 85% speed
  RADIUS_M: 0.35,
  FOOTSTEP_WALK_DB: 28,    // below the 30 dB floor: silent
  FOOTSTEP_RUN_DB: 38,     // +8 above the floor per step: running gets you noticed in ~3 s, swarmed in ~8
  BUMP_DB: 52,
  RATTLE_DB: 55,           // Gracie's carrier when the QTE fails
  QTE_WINDOW_S: 2.2,
  QTE_MIN_GAP_S: 9, QTE_MAX_GAP_S: 16,
  CATCH_RADIUS_M: 1.1,
  SEAT_RADIUS_M: 2.6,
} as const;

export type InteriorPhase = "stealth" | "latch" | "chase" | "to_car" | "done";

export class InteriorController {
  pos: Vec2;
  facing = Math.PI;         // radians, 0 = +x; starts facing west into the building
  speed = 0;
  phase: InteriorPhase = "stealth";
  carriers = { mya: true, gracie: true };
  gracie: { pos: Vec2; loose: boolean } = { pos: { x: 0, y: 0 }, loose: false };
  myaCarrierAt: Vec2 | null = null;   // where Mya's carrier got left
  qte: { deadline: number } | null = null;
  private clock = 0;
  private nextQte = 0;
  private footT = 0;
  private bumpCd = 0;
  private terminalFired = false;
  private carPos: Vec2 = { x: 0, y: 0 };

  constructor(private map: WorldMap, private noise: NoiseSystem, private quiet: QuietField, private ev: DolEvents, private random: () => number) {
    this.pos = { x: map.dol.door.x + 1.2, y: map.dol.door.y };
    this.scheduleQte();
  }

  get indoors() { return rectHas(this.map.dol.floor, this.pos, 0.2); }
  get zone(): "dol_interior" | "outdoor" { return this.indoors ? "dol_interior" : "outdoor"; }

  setCar(pos: Vec2) { this.carPos = { ...pos }; }

  reset() {
    this.pos = { x: this.map.dol.door.x + 1.2, y: this.map.dol.door.y };
    this.facing = Math.PI; this.speed = 0; this.phase = "stealth";
    this.carriers = { mya: true, gracie: true }; this.gracie = { pos: { x: 0, y: 0 }, loose: false };
    this.myaCarrierAt = null; this.qte = null; this.terminalFired = false; this.footT = 0;
    this.scheduleQte();
    for (const q of this.quiet.inZone("dol_interior")) q.reset();
  }

  private scheduleQte() { this.nextQte = this.clock + WALKER.QTE_MIN_GAP_S + this.random() * (WALKER.QTE_MAX_GAP_S - WALKER.QTE_MIN_GAP_S); }

  /** Is this point walkable? Inside the floor (or the door gap) and not in furniture. */
  walkable(p: Vec2): boolean {
    const d = this.map.dol;
    const inDoor = Math.abs(p.y - d.door.y) < d.doorWidth / 2 && p.x >= d.floor.x + d.floor.w - 0.6 && p.x <= d.door.x + 1.6;
    const inFloor = rectHas(d.floor, p, -WALKER.RADIUS_M);
    if (!inFloor && !inDoor && this.phase !== "to_car" && this.phase !== "done") return false;
    if (inFloor) for (const b of d.blocked) if (rectHas(b, p, WALKER.RADIUS_M)) return false;
    // outside (to_car): anything goes except buildings
    return true;
  }

  step(dt: number, input: WalkerInput): void {
    this.clock += dt;
    this.bumpCd = Math.max(0, this.bumpCd - dt);
    if (this.phase === "latch" || this.phase === "done") return;

    // ---- movement (screen-relative: y = south)
    const dir = { x: clamp(input.x, -1, 1), y: clamp(input.y, -1, 1) };
    const mag = Math.min(1, len(dir));
    let target = mag > 0.05 ? (input.run ? WALKER.RUN_MS : WALKER.WALK_MS) * mag : 0;
    if (this.carriers.mya && this.carriers.gracie) target *= WALKER.CARRIER_SLOW;
    this.speed += clamp(target - this.speed, -8 * dt, 8 * dt);
    if (mag > 0.05) {
      const u = norm(dir);
      this.facing = angle(u);
      const next = add(this.pos, mul(u, this.speed * dt));
      // slide along obstacles: try full, then each axis
      if (this.walkable(next)) this.pos = next;
      else {
        const nx = { x: next.x, y: this.pos.y }, ny = { x: this.pos.x, y: next.y };
        if (this.walkable(nx)) this.pos = nx; else if (this.walkable(ny)) this.pos = ny;
        else { this.bump(); this.speed = 0; }
      }
    }

    // ---- the Quiet are solid; brushing one at speed is a bump
    for (const q of this.quiet.inZone(this.zone)) {
      const d = dist(q.pos, this.pos); const min = WALKER.RADIUS_M + 0.45;
      if (d < min) {
        this.pos = add(q.pos, mul(norm(sub(this.pos, q.pos)), min));
        this.bump();
        this.speed *= 0.4;
      }
    }

    // ---- footsteps
    this.footT += dt;
    if (this.speed > 0.3 && this.footT >= 0.5) {
      this.footT = 0;
      this.noise.emit(this.speed > 1.8 ? WALKER.FOOTSTEP_RUN_DB : WALKER.FOOTSTEP_WALK_DB, this.pos, this.zone);
    }

    // ---- Gracie's carrier QTE (only while she's in the carrier)
    if (this.phase === "stealth" && this.carriers.gracie && !this.qte && this.clock >= this.nextQte) {
      this.qte = { deadline: this.clock + WALKER.QTE_WINDOW_S };
      this.ev.fire("qte.gracie.start");
    }
    if (this.qte && this.clock >= this.qte.deadline) this.resolveQte(false);

    // ---- terminal reached → the latch beat
    if (this.phase === "stealth" && !this.terminalFired && dist(this.pos, this.map.dol.terminal) < this.map.dol.terminalRadius) {
      this.terminalFired = true;
      this.phase = "latch";
      this.qte = null;
      this.speed = 0;
      this.myaCarrierAt = { x: this.map.dol.terminal.x + 0.6, y: this.map.dol.terminal.y + 0.4 };
      this.ev.fire("waypoint.reach:terminal");
    }

    // ---- chase: catch Gracie, then get to the car
    if (this.phase === "chase") {
      const g = this.gracie;
      const d = dist(g.pos, this.map.dol.gracieRunTarget);
      if (d > 0.2) g.pos = add(g.pos, mul(norm(sub(this.map.dol.gracieRunTarget, g.pos)), Math.min(4.5 * dt, d)));
      if (dist(this.pos, g.pos) < WALKER.CATCH_RADIUS_M) {
        g.loose = false; this.carriers.gracie = false; // she's under Ali's arm, not in the carrier
        this.phase = "to_car";
        this.ev.fire("chase.gracie_caught");
        this.ev.setObjective("Get to the Beetle.");
      }
    }
    if (this.phase === "to_car" && dist(this.pos, this.carPos) < WALKER.SEAT_RADIUS_M) {
      this.phase = "done";
      this.ev.fire("waypoint.reach:beetle_driver_seat");
    }
  }

  private bump() {
    if (this.speed < 1.0 || this.bumpCd > 0) return;
    this.bumpCd = 0.8;
    this.noise.emit(WALKER.BUMP_DB, this.pos, this.zone);
    this.ev.fire("walker.bump");
  }

  /** The dialogue's 1.3.chase end node fires start_gameplay "chase_dol_gracie" — call this then. */
  beginChase() {
    if (this.phase !== "latch") return;
    this.carriers.mya = false;               // her carrier stays by the terminal
    this.gracie = { pos: { ...this.pos }, loose: true };
    this.phase = "chase";
    this.ev.fire("chase.start");
    this.ev.setObjective("Gracie's loose. Get her.");
  }

  /** Player tapped SHH. */
  answerQte() { if (this.qte) this.resolveQte(true); }

  private resolveQte(success: boolean) {
    this.qte = null;
    this.scheduleQte();
    if (success) this.ev.fire("qte.gracie.success");
    else { this.noise.emit(WALKER.RATTLE_DB, this.pos, this.zone); this.ev.fire("qte.gracie.fail"); }
  }
}
