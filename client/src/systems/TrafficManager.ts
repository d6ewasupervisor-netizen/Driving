/**
 * TrafficManager — NPC vehicle state management
 * 8 pooled NPCs, updated each frame, written to InstancedMesh via dummy matrix.
 */
import * as THREE from 'three';

export const NPC_COUNT = 8;
const NPC_COUNT_LOW_END = 4;

export const LANE_POSITIONS = [-3.5, 0, 3.5] as const;
const NPC_MIN_SPEED = 10; // m/s (~22 mph)
const NPC_MAX_SPEED = 18; // m/s (~40 mph)
const RESPAWN_AHEAD_DIST = 150;
const RECYCLE_BEHIND_DIST = 100;
const SLOW_PROXIMITY = 15; // m — slow to 50% if player within this distance
const LANE_CHANGE_INTERVAL_MIN = 5;  // seconds
const LANE_CHANGE_INTERVAL_MAX = 15; // seconds

export const NPC_COLORS = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff922b', '#cc5de8', '#20c997', '#a8d8ea',
];

export interface NpcState {
  laneIndex: number;
  targetLaneIndex: number;
  zPosition: number;
  speedMs: number;
  laneChangeCooldown: number; // seconds until next lane change
  colorIndex: number;
  laneChangeT: number; // 0–1 blend for smooth lane transitions
  currentX: number;   // smoothed world X
  // Convenience fields read by TrafficRenderer each frame
  x: number;
  z: number;
  active: boolean;
}

function randomSpeed() {
  return NPC_MIN_SPEED + Math.random() * (NPC_MAX_SPEED - NPC_MIN_SPEED);
}

function randomLane() {
  return Math.floor(Math.random() * 3);
}

function randomCooldown() {
  return LANE_CHANGE_INTERVAL_MIN + Math.random() * (LANE_CHANGE_INTERVAL_MAX - LANE_CHANGE_INTERVAL_MIN);
}

function spawnAhead(playerZ: number, excludeColor: Set<number>): NpcState {
  const lane = randomLane();
  let colorIndex: number;
  do { colorIndex = Math.floor(Math.random() * NPC_COUNT); }
  while (excludeColor.has(colorIndex) && excludeColor.size < NPC_COUNT);

  const x = LANE_POSITIONS[lane];
  const z = playerZ - RESPAWN_AHEAD_DIST - Math.random() * 100;
  return {
    laneIndex: lane,
    targetLaneIndex: lane,
    zPosition: z,
    speedMs: randomSpeed(),
    laneChangeCooldown: randomCooldown(),
    colorIndex,
    laneChangeT: 1,
    currentX: x,
    x,
    z,
    active: true,
  };
}

export function initNpcs(playerZ: number, lowEnd = false): NpcState[] {
  const count = lowEnd ? NPC_COUNT_LOW_END : NPC_COUNT;
  const usedColors = new Set<number>();
  return Array.from({ length: count }, (_, i) => {
    const lane = randomLane();
    const colorIndex = i % NPC_COUNT;
    usedColors.add(colorIndex);
    const x = LANE_POSITIONS[lane];
    const z = playerZ - (i + 1) * 30 - Math.random() * 50;
    return {
      laneIndex: lane,
      targetLaneIndex: lane,
      zPosition: z,
      speedMs: randomSpeed(),
      laneChangeCooldown: randomCooldown(),
      colorIndex,
      laneChangeT: 1,
      currentX: x,
      x,
      z,
      active: true,
    };
  });
}

const _dummy = new THREE.Object3D();

export function updateNpcs(
  npcs: NpcState[],
  playerZ: number,
  delta: number,
  instancedMesh: THREE.InstancedMesh | null
): void {
  const usedColors = new Set(npcs.map((n) => n.colorIndex));
  const clampedDelta = Math.min(delta, 0.05);

  for (let i = 0; i < npcs.length; i++) {
    const npc = npcs[i];

    // ── Recycle if too far behind ────────────────────────────────────────────
    if (npc.zPosition > playerZ + RECYCLE_BEHIND_DIST) {
      usedColors.delete(npc.colorIndex);
      const spawned = spawnAhead(playerZ, usedColors);
      usedColors.add(spawned.colorIndex);
      Object.assign(npc, spawned);
      continue;
    }

    // ── Slow if player ahead in same lane ────────────────────────────────────
    // Approximate: player is always near lane 1 (center) for simplicity
    const distToPlayer = playerZ - npc.zPosition;
    const slowDown = npc.laneIndex === 1 && distToPlayer > 0 && distToPlayer < SLOW_PROXIMITY;
    const effectiveSpeed = slowDown ? npc.speedMs * 0.5 : npc.speedMs;

    // ── Move forward ─────────────────────────────────────────────────────────
    npc.zPosition -= effectiveSpeed * clampedDelta;

    // ── Lane change cooldown ─────────────────────────────────────────────────
    npc.laneChangeCooldown -= clampedDelta;
    if (npc.laneChangeCooldown <= 0 && npc.laneChangeT >= 1) {
      // Pick a new lane
      const options = [0, 1, 2].filter((l) => l !== npc.laneIndex);
      npc.targetLaneIndex = options[Math.floor(Math.random() * 2)];
      npc.laneChangeT = 0;
      npc.laneChangeCooldown = randomCooldown();
    }

    // ── Smooth lane interpolation (smoothstep) ────────────────────────────────
    if (npc.laneChangeT < 1) {
      npc.laneChangeT = Math.min(1, npc.laneChangeT + clampedDelta * 0.8);
      const t = npc.laneChangeT;
      const smooth = t * t * (3 - 2 * t);
      const fromX = LANE_POSITIONS[npc.laneIndex];
      const toX = LANE_POSITIONS[npc.targetLaneIndex];
      npc.currentX = fromX + (toX - fromX) * smooth;
      if (npc.laneChangeT >= 1) {
        npc.laneIndex = npc.targetLaneIndex;
        npc.currentX = LANE_POSITIONS[npc.laneIndex];
      }
    }

    // ── Sync convenience fields ───────────────────────────────────────────────
    npc.x = npc.currentX;
    npc.z = npc.zPosition;
    npc.active = true;

    // ── Write to InstancedMesh (legacy path) ──────────────────────────────────
    if (instancedMesh) {
      _dummy.position.set(npc.currentX, 0.45, npc.zPosition);
      _dummy.rotation.set(0, Math.PI, 0); // face forward (-Z)
      _dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, _dummy.matrix);
    }
  }

  if (instancedMesh) {
    instancedMesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * updateNpcsPositions — same logic as updateNpcs but without InstancedMesh.
 * Used by the GLB-based TrafficRenderer.
 */
export function updateNpcsPositions(
  npcs: NpcState[],
  playerZ: number,
  delta: number
): void {
  updateNpcs(npcs, playerZ, delta, null);
}
