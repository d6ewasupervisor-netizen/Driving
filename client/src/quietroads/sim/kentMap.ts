import { type Rect, type Vec2, rng } from "./math";
import type { ZoneDef } from "./zones";

/**
 * Kent, two streets: Titus St (Grandma's block) and Central Ave south to the DOL.
 * Everything in metres. +x = east, +y = south. Heading 0 = east. R3F maps (x, y) → (X, Z).
 */
export interface RoadSeg { rect: Rect; name?: string }
export interface SignDef { pos: Vec2; kind: "stop" | "school" | "rail" | "warning" | "speed"; text?: string }
export interface Building { rect: Rect; label?: string }

export interface WorldMap {
  bounds: Rect;
  roads: RoadSeg[];
  centerLines: [Vec2, Vec2][];
  stopLines: [Vec2, Vec2][];
  rail?: { from: Vec2; to: Vec2 };
  schoolZone?: Rect;
  buildings: Building[];
  signs: SignDef[];
  zones: ZoneDef[];
  markers: Record<string, Vec2>;
  quietSpawns: Vec2[];
  starts: Record<string, { pos: Vec2; heading: number }>;
}

export function buildKentMap(seed = 7): WorldMap {
  const buildings: Building[] = [];
  for (let x = 30; x < 240; x += 20) { buildings.push({ rect: { x: x - 5, y: -26, w: 10, h: 9 } }); buildings.push({ rect: { x: x - 5, y: 17, w: 10, h: 9 } }); }
  buildings.push({ rect: { x: 3, y: -26, w: 10, h: 9 }, label: "JUNE" });
  for (const y of [30, 50, 70, 90, 130, 250, 270, 320, 340, 360]) {
    buildings.push({ rect: { x: 240, y: y - 4, w: 10, h: 8 } });
    if (y < 160 || y > 240) buildings.push({ rect: { x: 280, y: y - 4, w: 10, h: 8 } });
  }
  buildings.push({ rect: { x: 282, y: 175, w: 26, h: 50 }, label: "KENT MIDDLE" });
  buildings.push({ rect: { x: 205, y: 380, w: 20, h: 40 }, label: "DOL" });

  const zones: ZoneDef[] = [
    { kind: "waypoint", id: "block_end", rect: c(250, 0, 6, 8) },
    { kind: "sign", id: "warning", rect: c(226, 0, 4, 8), quiz: "sign.prompt:warning" },
    { kind: "stop", id: "titus_central", rect: c(250.5, 0, 17, 8), quiz: "sign.prompt:regulatory", quizDelayS: 0.4 },
    { kind: "stop", id: "meeker", rect: c(265, 97, 10, 16), quiz: "stop.approach", quizDelayS: 0.4 },
    { kind: "sign", id: "school", rect: c(265, 150, 10, 4), quiz: "sign.prompt:school", quizDelayS: 2.6 },
    { kind: "school", id: "central", rect: c(265, 200, 10, 80) },
    { kind: "sign", id: "rail_advance", rect: c(265, 285, 10, 4) },
    { kind: "rail", id: "central", rect: c(265, 300, 10, 14), quiz: "zone.rail.enter", quizDelayS: 2.8 },
    { kind: "waypoint", id: "dol_approach", rect: c(265, 372, 10, 8) },
  ];

  const r = rng(seed);
  const spawns: Vec2[] = [];
  const blocked = (p: Vec2) => buildings.some((b) => p.x >= b.rect.x - 1.5 && p.x <= b.rect.x + b.rect.w + 1.5 && p.y >= b.rect.y - 1.5 && p.y <= b.rect.y + b.rect.h + 1.5);
  const push = (p: Vec2) => { if (!blocked(p)) spawns.push(p); };
  for (let i = 0; i < 20; i++) { const x = 22 + r() * 223; const side = r() < 0.5 ? 1 : -1; push({ x, y: side * (6 + r() * 9) }); }          // Titus yards
  for (let i = 0; i < 16; i++) { const y = 20 + r() * 345; const side = r() < 0.5 ? 1 : -1; push({ x: 265 + side * (7 + r() * 9), y }); }   // Central yards
  for (let i = 0; i < 12; i++) push({ x: 228 + (r() * 6 - 3), y: 384 + i * 3 });                                                             // the DOL queue

  return {
    bounds: { x: -30, y: -70, w: 360, h: 530 },
    roads: [
      { rect: { x: -10, y: -4, w: 279, h: 8 }, name: "TITUS ST" },
      { rect: { x: 260, y: -50, w: 10, h: 490 }, name: "CENTRAL AVE" },
      { rect: { x: 215, y: 106, w: 100, h: 8 }, name: "MEEKER ST" },
      { rect: { x: 225, y: 380, w: 30, h: 40 }, name: "DOL LOT" },
    ],
    centerLines: [[{ x: -10, y: 0 }, { x: 258, y: 0 }], [{ x: 265, y: -50 }, { x: 265, y: 440 }], [{ x: 215, y: 110 }, { x: 315, y: 110 }]],
    stopLines: [[{ x: 259, y: -4 }, { x: 259, y: 4 }], [{ x: 260, y: 105 }, { x: 270, y: 105 }], [{ x: 260, y: 293 }, { x: 270, y: 293 }]],
    rail: { from: { x: 200, y: 300 }, to: { x: 330, y: 300 } },
    schoolZone: { x: 260, y: 160, w: 10, h: 80 },
    buildings,
    signs: [
      { pos: { x: 226, y: 5.5 }, kind: "warning", text: "T" },
      { pos: { x: 259.5, y: 5.5 }, kind: "stop" },
      { pos: { x: 258.5, y: 105 }, kind: "stop" },
      { pos: { x: 258.5, y: 150 }, kind: "school", text: "20" },
      { pos: { x: 258.5, y: 285 }, kind: "rail" },
    ],
    zones,
    markers: { carport: { x: 14, y: -14 }, dol_lot: { x: 240, y: 400 } },
    quietSpawns: spawns,
    starts: { carport: { pos: { x: 14, y: 0 }, heading: 0 } },
  };
}

/** centre + size → Rect */
function c(cx: number, cy: number, w: number, h: number): Rect { return { x: cx - w / 2, y: cy - h / 2, w, h }; }
