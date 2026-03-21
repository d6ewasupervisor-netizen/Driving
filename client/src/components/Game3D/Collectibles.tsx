/**
 * Collectibles — Spawns coins and fuel cans along the road.
 *
 * Uses a ring-buffer pool. Items are placed deterministically using seeded
 * positions ahead of the player and recycled once passed.
 *
 * Collision detection is distance-based (checked in CollisionSystem).
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_COINS = 30;
const MAX_FUEL_CANS = 5;
const SPAWN_AHEAD = 250;    // metres ahead of player to spawn
const DESPAWN_BEHIND = 50;  // metres behind player to recycle
const COIN_SPACING = 25;    // metres between coin clusters
const FUEL_SPACING = 400;   // metres between fuel cans

export interface CollectibleState {
  position: THREE.Vector3;
  type: 'coin' | 'fuel';
  collected: boolean;
  active: boolean;
}

// Shared temp
const _mat = new THREE.Matrix4();
const _color = new THREE.Color();

// ─── Seeded pseudo-random (deterministic per-position) ────────────────────────
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Module-level collectible state (readable by CollisionSystem) ─────────────
let _collectibles: CollectibleState[] = [];
let _nextCoinZ = -50;
let _nextFuelZ = -200;

export function getCollectibles(): CollectibleState[] {
  return _collectibles;
}

// ─── Component ────────────────────────────────────────────────────────────────
export function Collectibles() {
  const coinMeshRef = useRef<THREE.InstancedMesh>(null);
  const fuelMeshRef = useRef<THREE.InstancedMesh>(null);
  const rotationRef = useRef(0);

  // Initialize pool
  useMemo(() => {
    _collectibles = [];
    _nextCoinZ = -50;
    _nextFuelZ = -200;
    for (let i = 0; i < MAX_COINS + MAX_FUEL_CANS; i++) {
      _collectibles.push({
        position: new THREE.Vector3(0, -100, 0), // off-screen
        type: i < MAX_COINS ? 'coin' : 'fuel',
        collected: false,
        active: false,
      });
    }
  }, []);

  useFrame((_, delta) => {
    const { vehiclePosition, phase } = useGameStore.getState();
    if (phase !== 'driving') return;

    const playerZ = vehiclePosition[2];
    const dt = Math.min(delta, 0.05);
    rotationRef.current += dt * 2; // spin animation

    // ── Spawn coins ahead ─────────────────────────────────────────────────
    while (_nextCoinZ > playerZ - SPAWN_AHEAD) {
      // Find inactive coin slot
      const slot = _collectibles.find((c) => c.type === 'coin' && !c.active);
      if (!slot) break;

      const seed = Math.round(_nextCoinZ * 7.31);
      const laneX = (seededRandom(seed) - 0.5) * 6; // anywhere across road width
      slot.position.set(laneX, 0.5, _nextCoinZ);
      slot.collected = false;
      slot.active = true;

      _nextCoinZ -= COIN_SPACING + seededRandom(seed + 1) * 15;
    }

    // ── Spawn fuel cans ahead ─────────────────────────────────────────────
    while (_nextFuelZ > playerZ - SPAWN_AHEAD) {
      const slot = _collectibles.find((c) => c.type === 'fuel' && !c.active);
      if (!slot) break;

      const seed = Math.round(_nextFuelZ * 3.17);
      const laneX = (seededRandom(seed) - 0.5) * 5;
      slot.position.set(laneX, 0.4, _nextFuelZ);
      slot.collected = false;
      slot.active = true;

      _nextFuelZ -= FUEL_SPACING + seededRandom(seed + 1) * 100;
    }

    // ── Update instances ──────────────────────────────────────────────────
    const coinMesh = coinMeshRef.current;
    const fuelMesh = fuelMeshRef.current;

    let coinIdx = 0;
    let fuelIdx = 0;

    for (const item of _collectibles) {
      // Recycle items behind player
      if (item.active && item.position.z > playerZ + DESPAWN_BEHIND) {
        item.active = false;
      }

      if (item.type === 'coin' && coinMesh && coinIdx < MAX_COINS) {
        if (item.active && !item.collected) {
          // Floating, spinning coin
          const yBob = 0.5 + Math.sin(rotationRef.current * 3 + item.position.x) * 0.15;
          _mat.makeRotationY(rotationRef.current + item.position.z * 0.1);
          _mat.setPosition(item.position.x, yBob, item.position.z);
          coinMesh.setMatrixAt(coinIdx, _mat);
          _color.setRGB(1.0, 0.85, 0.2); // gold
          coinMesh.setColorAt(coinIdx, _color);
        } else {
          _mat.makeScale(0, 0, 0);
          coinMesh.setMatrixAt(coinIdx, _mat);
        }
        coinIdx++;
      }

      if (item.type === 'fuel' && fuelMesh && fuelIdx < MAX_FUEL_CANS) {
        if (item.active && !item.collected) {
          const yBob = 0.4 + Math.sin(rotationRef.current * 2 + item.position.z) * 0.1;
          _mat.makeRotationY(rotationRef.current * 0.5);
          _mat.setPosition(item.position.x, yBob, item.position.z);
          fuelMesh.setMatrixAt(fuelIdx, _mat);
          _color.setRGB(0.2, 0.8, 0.3); // green
          fuelMesh.setColorAt(fuelIdx, _color);
        } else {
          _mat.makeScale(0, 0, 0);
          fuelMesh.setMatrixAt(fuelIdx, _mat);
        }
        fuelIdx++;
      }
    }

    if (coinMesh) {
      coinMesh.instanceMatrix.needsUpdate = true;
      if (coinMesh.instanceColor) coinMesh.instanceColor.needsUpdate = true;
    }
    if (fuelMesh) {
      fuelMesh.instanceMatrix.needsUpdate = true;
      if (fuelMesh.instanceColor) fuelMesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Coins — flat cylinders (disc-like) */}
      <instancedMesh
        ref={coinMeshRef}
        args={[undefined, undefined, MAX_COINS]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.3, 0.3, 0.06, 12]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={0.4}
          metalness={0.8}
          roughness={0.2}
        />
      </instancedMesh>

      {/* Fuel cans — boxes */}
      <instancedMesh
        ref={fuelMeshRef}
        args={[undefined, undefined, MAX_FUEL_CANS]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.35, 0.5, 0.25]} />
        <meshStandardMaterial
          color="#22cc55"
          emissive="#22cc55"
          emissiveIntensity={0.3}
          metalness={0.3}
          roughness={0.5}
        />
      </instancedMesh>
    </>
  );
}
