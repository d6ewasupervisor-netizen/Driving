export interface Vec2 { x: number; y: number }
export const v = (x: number, y: number): Vec2 => ({ x, y });
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
export const len = (a: Vec2) => Math.hypot(a.x, a.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const norm = (a: Vec2): Vec2 => { const l = len(a); return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 }; };
export const angle = (a: Vec2) => Math.atan2(a.y, a.x);
export const fromAngle = (t: number, s = 1): Vec2 => ({ x: Math.cos(t) * s, y: Math.sin(t) * s });
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const moveToward = (x: number, target: number, maxDelta: number) =>
  Math.abs(target - x) <= maxDelta ? target : x + Math.sign(target - x) * maxDelta;
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
  return a + d * clamp(t, 0, 1);
}
export interface Rect { x: number; y: number; w: number; h: number } // top-left + size, metres
export const rectHas = (r: Rect, p: Vec2, grow = 0) =>
  p.x >= r.x - grow && p.x <= r.x + r.w + grow && p.y >= r.y - grow && p.y <= r.y + r.h + grow;
export const rectCenter = (r: Rect): Vec2 => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const MPH = 0.44704; // m/s per mph

/** Seeded PRNG (mulberry32) so spawns are deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
