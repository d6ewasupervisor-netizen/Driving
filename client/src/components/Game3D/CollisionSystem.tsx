/**
 * CollisionSystem — Distance-based collision detection
 *
 * Checks vehicle position against:
 *   - NPC traffic vehicles → damage + knockback audio
 *   - Road zombies → splat + coins
 *   - Collectibles (coins, fuel cans) → pickup
 *
 * Runs in useFrame, lightweight sphere-vs-sphere checks.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';
import { AudioManager } from '@/systems/AudioManager';
import { getCollectibles } from './Collectibles';
import { NpcState } from '@/systems/TrafficManager';

// ─── Constants ────────────────────────────────────────────────────────────────
const VEHICLE_RADIUS = 2.0;       // collision sphere radius for player car
const NPC_RADIUS = 1.8;           // NPC car collision radius
const ZOMBIE_RADIUS = 0.6;        // zombie collision radius
const COIN_RADIUS = 1.2;          // coin pickup radius (generous)
const FUEL_RADIUS = 1.5;          // fuel can pickup radius (generous)

const TRAFFIC_DAMAGE = 5;         // HP per traffic collision
const TRAFFIC_COOLDOWN = 1.5;     // seconds between traffic damage ticks
const ZOMBIE_COOLDOWN = 0.3;      // seconds between zombie hits (rapid plow)

// ─── Zombie state (module-level, shared with RoadChunks) ──────────────────────
export interface RoadZombie {
  position: THREE.Vector3;
  active: boolean;
  hit: boolean;
}

let _roadZombies: RoadZombie[] = [];

export function registerRoadZombies(zombies: RoadZombie[]) {
  _roadZombies = zombies;
}

export function getRoadZombies(): RoadZombie[] {
  return _roadZombies;
}

// ─── Temp vectors ─────────────────────────────────────────────────────────────
const _vPos = new THREE.Vector3();
const _other = new THREE.Vector3();

// ─── Component ────────────────────────────────────────────────────────────────
interface CollisionSystemProps {
  npcsRef: React.MutableRefObject<NpcState[]>;
}

export function CollisionSystem({ npcsRef }: CollisionSystemProps) {
  const trafficCooldown = useRef(0);
  const zombieCooldown = useRef(0);

  useFrame((_, delta) => {
    const store = useGameStore.getState();
    if (store.phase !== 'driving') return;

    const dt = Math.min(delta, 0.05);
    trafficCooldown.current = Math.max(0, trafficCooldown.current - dt);
    zombieCooldown.current = Math.max(0, zombieCooldown.current - dt);

    _vPos.set(store.vehiclePosition[0], store.vehiclePosition[1], store.vehiclePosition[2]);

    // ── Traffic collisions ──────────────────────────────────────────────────
    if (trafficCooldown.current <= 0 && npcsRef.current) {
      for (const npc of npcsRef.current) {
        if (!npc.active) continue;
        _other.set(npc.x, 0, npc.z);
        const dist = _vPos.distanceTo(_other);
        if (dist < VEHICLE_RADIUS + NPC_RADIUS) {
          store.takeDamage(TRAFFIC_DAMAGE);
          store.addTrafficHit();
          AudioManager.playCollision();
          trafficCooldown.current = TRAFFIC_COOLDOWN;
          break; // only one hit per cooldown
        }
      }
    }

    // ── Zombie collisions ───────────────────────────────────────────────────
    if (zombieCooldown.current <= 0) {
      for (const zombie of _roadZombies) {
        if (!zombie.active || zombie.hit) continue;
        _other.copy(zombie.position);
        const dist = _vPos.distanceTo(_other);
        if (dist < VEHICLE_RADIUS + ZOMBIE_RADIUS) {
          zombie.hit = true;
          zombie.active = false;
          store.addZombieHit();
          AudioManager.playZombieSplat();
          zombieCooldown.current = ZOMBIE_COOLDOWN;
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
      if (dist < VEHICLE_RADIUS + pickupRadius) {
        item.collected = true;
        if (item.type === 'coin') {
          store.addZCoins(3);
          AudioManager.playCoinPickup();
        } else {
          store.collectFuelCan();
          AudioManager.playCoinPickup(); // reuse chime for now
        }
      }
    }
  });

  return null;
}
