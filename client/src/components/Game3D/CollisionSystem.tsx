/**
 * CollisionSystem — Distance-based collision detection with physical response
 *
 * Checks vehicle position against:
 *   - NPC traffic vehicles → damage + knockback audio + speed reduction + NPC push
 *   - Collectibles (coins, fuel cans) → pickup
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';
import { AudioManager } from '@/systems/AudioManager';
import { triggerScreenShake } from './GameCamera';
import { getCollectibles } from './Collectibles';
import { NpcState } from '@/systems/TrafficManager';
import { applyCollisionImpact } from '@/systems/VehicleController';

// ─── Constants ────────────────────────────────────────────────────────────────
// Vehicles are long & narrow, so a circular radius check produces phantom
// "crashing halt" hits whenever you pass an NPC in the adjacent lane (lane
// spacing ~2.8m, old combined radius was 3m). We instead check lateral and
// longitudinal separation independently — i.e. an axis-aligned bounding-box
// overlap test in world space. NPCs and the player both travel along ±Z, so
// world-axis AABB is a fine approximation without rotating into car-local.
const VEHICLE_HALF_WIDTH  = 0.7;   // Beetle ≈1.4m wide
const VEHICLE_HALF_LENGTH = 1.6;   // Beetle ≈3.2m long
const NPC_HALF_WIDTH      = 0.9;   // sedan ≈1.8m wide
const NPC_HALF_LENGTH     = 2.0;   // sedan ≈4.0m long
const COIN_RADIUS = 1.2;
const FUEL_RADIUS = 1.5;
// Combined "near" radius for collectibles only (still circular).
const VEHICLE_PICKUP_RADIUS = 1.0;

const TRAFFIC_DAMAGE = 5;
const TRAFFIC_COOLDOWN = 1.5;
const NPC_KNOCKBACK_STRENGTH = 4.0;
const PLAYER_SPEED_LOSS = 0.45;

// ─── Temp vectors ─────────────────────────────────────────────────────────────
const _vPos = new THREE.Vector3();
const _other = new THREE.Vector3();
const _normal = new THREE.Vector3();

// ─── Component ────────────────────────────────────────────────────────────────
interface CollisionSystemProps {
  npcsRef: React.MutableRefObject<NpcState[]>;
}

export function CollisionSystem({ npcsRef }: CollisionSystemProps) {
  const trafficCooldown = useRef(0);

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    if (store.phase !== 'driving') return;

    const dt = Math.min(delta, 0.05);
    trafficCooldown.current = Math.max(0, trafficCooldown.current - dt);

    _vPos.set(store.vehiclePosition[0], store.vehiclePosition[1], store.vehiclePosition[2]);

    // ── Traffic collisions ──────────────────────────────────────────────────
    // AABB-style overlap on world X (lateral) and world Z (longitudinal).
    // This permits clean adjacent-lane passes and only triggers when the
    // bounding boxes actually overlap.
    if (trafficCooldown.current <= 0 && npcsRef.current) {
      for (const npc of npcsRef.current) {
        if (!npc.active) continue;
        _other.set(npc.x, 0, npc.z);
        const dx = Math.abs(_vPos.x - npc.x);
        const dz = Math.abs(_vPos.z - npc.z);
        const overlapX = dx < (VEHICLE_HALF_WIDTH  + NPC_HALF_WIDTH);
        const overlapZ = dz < (VEHICLE_HALF_LENGTH + NPC_HALF_LENGTH);
        if (overlapX && overlapZ) {
          store.takeDamage(TRAFFIC_DAMAGE);
          store.addTrafficHit();
          AudioManager.playCollision();
          triggerScreenShake(0.6, 0.35);

          applyCollisionImpact(PLAYER_SPEED_LOSS);

          _normal.set(npc.x - _vPos.x, 0, npc.z - _vPos.z);
          const len = _normal.length();
          if (len > 0.01) {
            _normal.divideScalar(len);
            npc.xOffset = (npc.xOffset ?? 0) + _normal.x * NPC_KNOCKBACK_STRENGTH;
            npc.zOffset = (npc.zOffset ?? 0) + _normal.z * NPC_KNOCKBACK_STRENGTH;
          }

          trafficCooldown.current = TRAFFIC_COOLDOWN;
          break;
        }
      }
    }

    // ── Collectible pickups ─────────────────────────────────────────────────
    const collectibles = getCollectibles();
    for (const item of collectibles) {
      if (!item.active || item.collected) continue;
      _other.copy(item.position);
      const dist = _vPos.distanceTo(_other);
      const pickupRadius = item.type === 'coin' ? COIN_RADIUS : FUEL_RADIUS;
      if (dist < VEHICLE_PICKUP_RADIUS + pickupRadius) {
        item.collected = true;
        if (item.type === 'coin') {
          store.addZCoins(3);
          AudioManager.playCoinPickup();
        } else {
          store.collectFuelCan();
          AudioManager.playCoinPickup();
        }
      }
    }
  });

  return null;
}
