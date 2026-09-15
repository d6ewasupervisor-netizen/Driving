import { type Rect, type Vec2, rng } from "./math";
import type { ZoneDef } from "./zones";

/**
 * Kent, two streets: Titus St (Grandma's block) and Central Ave south to the DOL.
 * Everything in metres. +x = east, +y = south. Heading 0 = east. R3F maps (x, y) → (X, Z).
 */
export interface RoadSeg { rect: Rect; name?: string }
export interface SignDef { pos: Vec2; kind: "stop" | "school" | "rail" | "warning" | "speed"; text?: string }
export interface Building { rect: Rect; label?: string }

export interface ParkingLot {
  stalls: Rect[];          // painted stalls, all facing +y (south); head curb at y = stall.y + stall.h
  target: number;          // index into stalls — the one she's told to use
  driveway: Rect;          // connects Central Ave to the lot
}

/** The DOL interior, entered on foot. Everything in world metres (same frame as outside). */
export interface DolInterior {
  floor: Rect;             // inside face of the walls
  door: Vec2;              // on the east wall; walker starts just outside it
  doorWidth: number;
  blocked: Rect[];         // counters, chair rows, the number board's stand
  terminal: Vec2;          // knowledge-test terminal, still lit
  terminalRadius: number;
  gracieRunTarget: Vec2;   // where Gracie bolts to after the latch pops
  quietSpawns: Vec2[];     // the ones still waiting for their number
  labels: { pos: Vec2; text: string }[];
}

export interface WorldMap {
  bounds: Rect;
  parking: ParkingLot;
  dol: DolInterior;
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
    { kind: "waypoint", id: "dol_lot_exit", rect: { x: 255, y: 382, w: 5, h: 10 }, once: false },
  ];

  // Parking: six stalls along the south edge of the lot, pull in heading south. Target is #3.
  const stalls: Rect[] = [];
  for (let i = 0; i < 6; i++) stalls.push({ x: 235 + i * 2.9, y: 413.5, w: 2.6, h: 5.5 });
  const parking: ParkingLot = { stalls, target: 2, driveway: { x: 255, y: 382, w: 5, h: 10 } };

  // DOL interior: building box is x 205–225, y 380–420. Walls 0.5 m thick.
  const dolRng = rng(seed + 7);
  const dolQuiet: Vec2[] = [];
  for (let i = 0; i < 9; i++) dolQuiet.push({ x: 212.5 + (dolRng() - 0.5) * 1.2, y: 388 + i * 2.6 });   // the line, still holding numbers
  dolQuiet.push({ x: 219.5, y: 396.5 }); dolQuiet.push({ x: 218.5, y: 403.5 }); dolQuiet.push({ x: 221, y: 409 }); // in the chairs
  const dol: DolInterior = {
    floor: { x: 205.5, y: 380.5, w: 19, h: 39 },
    door: { x: 225, y: 386 },
    doorWidth: 2.4,
    blocked: [
      { x: 205.5, y: 383, w: 6, h: 1.2 },            // service counter (north-west)
      { x: 215, y: 392, w: 7, h: 0.8 },              // chair rows
      { x: 215, y: 398, w: 7, h: 0.8 },
      { x: 215, y: 404, w: 7, h: 0.8 },
      { x: 215, y: 410, w: 7, h: 0.8 },
      { x: 209.5, y: 414.5, w: 1.2, h: 1.2 },        // pamphlet rack by the terminal (the one that goes over)
      { x: 205.5, y: 416.5, w: 4, h: 1 },            // terminal desk
    ],
    terminal: { x: 208, y: 415.5 },
    terminalRadius: 1.6,
    gracieRunTarget: { x: 223, y: 401 },
    quietSpawns: dolQuiet,
    labels: [{ pos: { x: 206.5, y: 382.5 }, text: "NOW SERVING 47" }],
  };

  const r = rng(seed);
  const spawns: Vec2[] = [];
  const blocked = (p: Vec2) => buildings.some((b) => p.x >= b.rect.x - 1.5 && p.x <= b.rect.x + b.rect.w + 1.5 && p.y >= b.rect.y - 1.5 && p.y <= b.rect.y + b.rect.h + 1.5);
  const push = (p: Vec2) => { if (!blocked(p)) spawns.push(p); };
  for (let i = 0; i < 20; i++) { const x = 22 + r() * 223; const side = r() < 0.5 ? 1 : -1; push({ x, y: side * (6 + r() * 9) }); }          // Titus yards
  for (let i = 0; i < 16; i++) { const y = 20 + r() * 345; const side = r() < 0.5 ? 1 : -1; push({ x: 265 + side * (7 + r() * 9), y }); }   // Central yards
  for (let i = 0; i < 12; i++) push({ x: 228 + (r() * 6 - 3), y: 384 + i * 3 });                                                             // the DOL queue

  return {
    bounds: { x: -30, y: -70, w: 360, h: 530 },
    parking,
    dol,
    roads: [
      { rect: { x: -10, y: -4, w: 279, h: 8 }, name: "TITUS ST" },
      { rect: { x: 260, y: -50, w: 10, h: 490 }, name: "CENTRAL AVE" },
      { rect: { x: 215, y: 106, w: 100, h: 8 }, name: "MEEKER ST" },
      { rect: { x: 225, y: 380, w: 30, h: 40 }, name: "DOL LOT" },
      { rect: { x: 255, y: 382, w: 5, h: 10 }, name: "DOL DRIVEWAY" },
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
    starts: {
      carport: { pos: { x: 14, y: 0 }, heading: 0 },
      dol_lot_entry: { pos: { x: 257.5, y: 387 }, heading: Math.PI },            // just inside the driveway, facing west
      dol_stall: { pos: { x: stalls[2].x + stalls[2].w / 2, y: 416.5 }, heading: Math.PI / 2 }, // parked, nose south
    },
  };
}

/** centre + size → Rect */
function c(cx: number, cy: number, w: number, h: number): Rect { return { x: cx - w / 2, y: cy - h / 2, w, h }; }
