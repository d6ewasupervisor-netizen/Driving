/**
 * Shared flare positions updated by TrafficRenderer, read by HeadlightFlares.
 */
import * as THREE from 'three';

export interface TrafficFlareSource {
  position: THREE.Vector3;
  color: THREE.Color;
  /** Target opacity multiplier 0–1 */
  strength: number;
}

const MAX_NPC_FLARES = 2;
const pool: TrafficFlareSource[] = [
  { position: new THREE.Vector3(), color: new THREE.Color('#ff3333'), strength: 0 },
  { position: new THREE.Vector3(), color: new THREE.Color('#ff3333'), strength: 0 },
];

export function getNpcFlareSources(): readonly TrafficFlareSource[] {
  return pool;
}

/** Write up to two NPC taillight flare sources (world space). */
export function setNpcFlareSources(
  entries: Array<{ x: number; y: number; z: number; strength: number }>
) {
  for (let i = 0; i < MAX_NPC_FLARES; i++) {
    const slot = pool[i];
    const entry = entries[i];
    if (!entry) {
      slot.strength = 0;
      continue;
    }
    slot.position.set(entry.x, entry.y, entry.z);
    slot.strength = entry.strength;
  }
}
