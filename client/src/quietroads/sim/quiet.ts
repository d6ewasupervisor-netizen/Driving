import { type Vec2, dist, sub, norm, angle, lerpAngle, len, mul, add, moveToward, fromAngle } from "./math";
import type { NoiseListener } from "./noise";

/** They see you. They don't care unless they hear you. */
export enum QuietState { DORMANT = 0, CURIOUS = 1, ALERT = 2, SWARM = 3 }

export const QUIET = {
  DECAY_PER_S: 4,
  THRESH: { CURIOUS: 25, ALERT: 60, SWARM: 90 },
  LOUD_JUMP: { above: 50, to: 80 },
  SPEED: { HOME: 0.3, ALERT: 0.6, SWARM: 2.4 },
  RADIUS_M: 0.45,
  TUTORIAL_CAP: 88,
} as const;

export class Quiet implements NoiseListener {
  pos: Vec2;
  home: Vec2;
  awareness = 0;
  state = QuietState.DORMANT;
  facing: number;
  heardPos: Vec2;
  private shove: Vec2 = { x: 0, y: 0 };
  private seedOffset: number;

  constructor(public id: number, pos: Vec2, random: () => number, public forgiving = () => false) {
    this.pos = { ...pos }; this.home = { ...pos }; this.heardPos = { ...pos };
    this.facing = random() * Math.PI * 2; this.seedOffset = random() * 10;
  }

  hear(heardAboveFloor: number, from: Vec2) { this.addAwareness(heardAboveFloor, from); }

  /** Returns true if this call pushed the Quiet into SWARM. */
  addAwareness(amount: number, from?: Vec2): boolean {
    const before = this.state;
    this.awareness += amount;
    if (amount > QUIET.LOUD_JUMP.above) this.awareness = Math.max(this.awareness, QUIET.LOUD_JUMP.to);
    if (this.forgiving()) this.awareness = Math.min(this.awareness, QUIET.TUTORIAL_CAP);
    this.awareness = Math.min(this.awareness, 100);
    if (from) this.heardPos = { ...from };
    this.updateState();
    return before !== QuietState.SWARM && this.state === QuietState.SWARM;
  }

  applyShove(impulse: Vec2, playerPos: Vec2) { this.shove = add(this.shove, impulse); this.addAwareness(45, playerPos); }

  reset() { this.awareness = 0; this.state = QuietState.DORMANT; this.pos = { ...this.home }; this.shove = { x: 0, y: 0 }; }

  private updateState() {
    const a = this.awareness;
    this.state = a > QUIET.THRESH.SWARM ? QuietState.SWARM : a > QUIET.THRESH.ALERT ? QuietState.ALERT : a > QUIET.THRESH.CURIOUS ? QuietState.CURIOUS : QuietState.DORMANT;
  }

  step(dt: number, playerPos: Vec2, timeS: number) {
    this.awareness = Math.max(0, this.awareness - QUIET.DECAY_PER_S * dt);
    this.updateState();
    let dir: Vec2 = { x: 0, y: 0 }; let speed = 0;
    switch (this.state) {
      case QuietState.DORMANT:
        if (dist(this.pos, this.home) > 2) { dir = norm(sub(this.home, this.pos)); speed = QUIET.SPEED.HOME; }
        break;
      case QuietState.CURIOUS:
        this.facing = lerpAngle(this.facing, angle(sub(this.heardPos, this.pos)), 3 * dt);
        break;
      case QuietState.ALERT: {
        const to = sub(this.heardPos, this.pos);
        this.facing = lerpAngle(this.facing, angle(to), 4 * dt);
        if (len(to) > 3) { dir = norm(to); speed = QUIET.SPEED.ALERT; }
        break;
      }
      case QuietState.SWARM: {
        const to = sub(playerPos, this.pos);
        this.facing = angle(to);
        if (len(to) > 1.6) { dir = norm(to); speed = QUIET.SPEED.SWARM + 0.3 * Math.sin(timeS * 2.5 + this.seedOffset); }
        break;
      }
    }
    const vel = add(mul(dir, speed), this.shove);
    this.pos = add(this.pos, mul(vel, dt));
    const sl = len(this.shove);
    this.shove = sl > 0 ? mul(norm(this.shove), moveToward(sl, 0, 31 * dt)) : this.shove;
  }
}

export interface QuietFieldEvents { fire: (event: string) => void; softFail: () => void }

/** All the Quiet, plus the swarm/settle checks the mission layer needs. */
export class QuietField {
  list: Quiet[] = [];
  private hot = false;
  private checkT = 0;
  private time = 0;
  constructor(private ev: QuietFieldEvents, public forgiving: () => boolean = () => false) {}

  spawn(pos: Vec2, random: () => number): Quiet {
    const q = new Quiet(this.list.length, pos, random, this.forgiving);
    this.list.push(q); return q;
  }
  reset() { for (const q of this.list) q.reset(); this.hot = false; }

  step(dt: number, playerPos: Vec2, blocked: (p: Vec2) => boolean) {
    this.time += dt;
    for (const q of this.list) {
      const before = q.pos;
      q.step(dt, playerPos, this.time);
      if (blocked(q.pos)) q.pos = before;
    }
    // separation so they don't stack
    for (let i = 0; i < this.list.length; i++) for (let j = i + 1; j < this.list.length; j++) {
      const a = this.list[i], b = this.list[j]; const d = dist(a.pos, b.pos); const min = QUIET.RADIUS_M * 2;
      if (d < min && d > 1e-6) { const push = mul(norm(sub(b.pos, a.pos)), (min - d) / 2); a.pos = sub(a.pos, push); b.pos = add(b.pos, push); }
    }
    this.checkT += dt;
    if (this.checkT >= 0.5) { this.checkT = 0; this.check(playerPos); }
  }

  private check(playerPos: Vec2) {
    let maxAw = 0, swarmNear = 0;
    for (const q of this.list) {
      maxAw = Math.max(maxAw, q.awareness);
      if (q.state === QuietState.SWARM && dist(q.pos, playerPos) < 5) swarmNear++;
    }
    if (maxAw >= 60) this.hot = true;
    else if (this.hot && maxAw < 25) { this.hot = false; this.ev.fire("quiet.settle"); }
    if (swarmNear >= 3 && !this.forgiving()) this.ev.softFail();
  }

  /** Vehicle-vs-Quiet contact. Call with the car's footprint each frame; returns collision kind. */
  collide(carPos: Vec2, heading: number, halfLen: number, halfWid: number, speedMs: number): "plow" | "soft" | null {
    let result: "plow" | "soft" | null = null;
    const fwd = fromAngle(heading);
    for (const q of this.list) {
      const rel = sub(q.pos, carPos);
      const lx = rel.x * fwd.x + rel.y * fwd.y;         // along car
      const ly = -rel.x * fwd.y + rel.y * fwd.x;        // across car
      const r = QUIET.RADIUS_M;
      if (Math.abs(lx) > halfLen + r || Math.abs(ly) > halfWid + r) continue;
      const headOn = lx > halfLen * 0.6 && Math.abs(ly) < halfWid + r;
      if (headOn && speedMs > 1) {
        const side = Math.sign(ly) || 1;
        q.applyShove(mul(fromAngle(heading + side * 1.2), 14), carPos);
        result = "plow";
      } else if (Math.abs(speedMs) > 0.6) {
        q.applyShove(mul(norm(rel), 7.5), carPos);
        result = result ?? "soft";
      } else {
        q.pos = add(carPos, mul(norm(rel), Math.max(len(rel), halfWid + r + 0.05)));
      }
    }
    return result;
  }
}
