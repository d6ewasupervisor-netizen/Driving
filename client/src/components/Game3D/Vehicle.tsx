/**
 * Vehicle — VW Beetle with custom material overrides
 *
 * GLB material map (from inspection):
 *   Chassi        → car body mesh
 *   Details_03    → front lights (headlights, blinkers) — has emissive texture
 *   Details_01    → rear lights (taillights, reverse) — has emissive texture
 *   Details_02    → body trim / wiper area
 *   WheelF_Left__0 → all four wheels
 *
 * The beetle's local axes (after the baked Y-flip in the GLB):
 *   front = +Z local, rear = -Z local, up = +Y local
 *   We rotate the whole group π about Y so front faces -Z (forward in world).
 *
 * Plow geometry sits in world-space forward (-Z), attached via a pivot group
 * that lets the plow angle between -5° (scraping) and +5° (lifted).
 */
import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';

import * as THREE from 'three';
import { RigidBody, CuboidCollider, RapierRigidBody, useRapier } from '@react-three/rapier';
import { tickVehicle, resetVehicleController } from '@/systems/VehicleController';
import { useGameStore } from '@/stores/gameStore';
import { VehicleParticles } from './VehicleParticles';

// ─── Vehicle scale + collider half-extents ──────────────────────────────────
// VEHICLE_SCALE shrinks the GLB visual + plow (rendered inside the scaled group).
// Collider half-extents are independent and tuned to match the visual silhouette.
// At scale 0.6, the visible car is ~1m wide × 0.6m tall × 2.5m long — reads as a
// compact hatchback in 8m-wide lanes.
const VEHICLE_SCALE = 0.6;
const COLLIDER_HX = 0.5;
const COLLIDER_HY = 0.32;
const COLLIDER_HZ = 1.25;

// ─── Material colours ─────────────────────────────────────────────────────────
const BODY_COLOR        = new THREE.Color('#c47a6a'); // rusty pink
const WINDOW_COLOR      = new THREE.Color('#111111'); // reflective black
const CHROME_COLOR      = new THREE.Color('#d4d4d4'); // chrome wipers
const TAILLIGHT_COLOR   = new THREE.Color('#ff1111'); // red
const REVERSE_COLOR     = new THREE.Color('#ffffff'); // white reverse
const HEADLIGHT_COLOR   = new THREE.Color('#ffffff'); // bright white


// ─── Plow constants ───────────────────────────────────────────────────────────
const PLOW_MIN_DEG  = -5;   // scraping
const PLOW_MAX_DEG  =  5;   // lifted
const PLOW_SPEED    = 60;   // degrees per second
// Plow attachment: simple V-shape at front bumper
// Raised 52" (~1.32m total) and moved back 12" (~0.3m) toward car
// When car rests on ground, RigidBody center is at Y≈0.75
const PLOW_FRONT_Z  = -1.9;  // moved back from -2.2 (12" closer to car)
const PLOW_Y        = 0.62;  // raised to hood/upper bumper level (52" up from ground)
const PLOW_WIDTH    = 1.61;  // total width (extended 8" each end = 16" total)
const PLOW_HEIGHT   = 0.5;   // blade height (extended 8" downward)
const PLOW_DEPTH    = 1.57;  // blade length - extended 12% to meet at center point

// ─── Material traversal helper ────────────────────────────────────────────────
function applyToMaterial(
  scene: THREE.Object3D,
  matName: string,
  fn: (mat: THREE.MeshStandardMaterial) => void
) {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => {
      if (m instanceof THREE.MeshStandardMaterial && m.name === matName) fn(m);
    });
  });
}

// ─── Plow geometry — simple V-shape at front bumper ──────────────────────────
function Plow({ angleDeg }: { angleDeg: number }) {
  const pivotRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (pivotRef.current) {
      pivotRef.current.rotation.x = (angleDeg * Math.PI) / 180;
    }
  }, [angleDeg]);

  // Simple V-plow: two angled panels forming /\ shape pointing FORWARD
  // The blades angle INWARD to form a point in the -Z (forward) direction
  // Adjusted to bring tips together at front
  const leftAngle = (Math.PI * 50) / 180;  // 50° (45° + 5°)
  const rightAngle = (Math.PI * 45) / 180; // 45° (40° + 5°)
  const tiltAngle = (Math.PI * 5) / 180;   // 5° tilt - base further from car than top

  return (
    <group ref={pivotRef} position={[0, PLOW_Y, PLOW_FRONT_Z]}>
      {/* Left blade - starts at front-left corner of car, rotates inward (-angle) to meet at front point */}
      <mesh
        position={[-PLOW_WIDTH / 2.2, 0.05, -0.15]}
        rotation={[-tiltAngle, -leftAngle, 0]}
        castShadow
      >
        <boxGeometry args={[0.04, PLOW_HEIGHT, PLOW_DEPTH]} />
        <meshStandardMaterial color="#555555" metalness={0.8} roughness={0.4} />
      </mesh>

      {/* Right blade - starts at front-right corner of car, rotates inward (+angle) to meet at front point */}
      <mesh
        position={[PLOW_WIDTH / 2.2, 0.05, -0.15]}
        rotation={[-tiltAngle, rightAngle, 0]}
        castShadow
      >
        <boxGeometry args={[0.04, PLOW_HEIGHT, PLOW_DEPTH]} />
        <meshStandardMaterial color="#555555" metalness={0.8} roughness={0.4} />
      </mesh>

      {/* Mounting bracket */}
      <mesh position={[0, PLOW_HEIGHT / 2, 0]} castShadow>
        <boxGeometry args={[PLOW_WIDTH * 0.8, 0.06, 0.06]} />
        <meshStandardMaterial color="#444444" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ─── VW Beetle model with material overrides ──────────────────────────────────
function VWBeetleModel({ plowAngle }: { plowAngle: number }) {
  // Temporarily render a box instead of GLB to test if the issue is with the model loading
  return (
    <group scale={VEHICLE_SCALE}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 1, 4]} />
        <meshStandardMaterial color="red" />
      </mesh>
      {/* Plow in physics space — -Z is forward */}
      <Plow angleDeg={plowAngle} />
    </group>
  );
}

// ─── Plow angle controlled via keyboard (Q/E) or store ────────────────────────
function usePlowAngle() {
  const plowAngle = useRef(0); // degrees
  const keysRef = useRef({ up: false, down: false });

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q') keysRef.current.up   = true;
      if (e.key === 'e' || e.key === 'E') keysRef.current.down = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'q' || e.key === 'Q') keysRef.current.up   = false;
      if (e.key === 'e' || e.key === 'E') keysRef.current.down = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  const update = (delta: number) => {
    if (keysRef.current.up)   plowAngle.current = Math.min(PLOW_MAX_DEG, plowAngle.current + PLOW_SPEED * delta);
    if (keysRef.current.down) plowAngle.current = Math.max(PLOW_MIN_DEG, plowAngle.current - PLOW_SPEED * delta);
  };

  return { plowAngle, update };
}

// ─── Vehicle component ────────────────────────────────────────────────────────
export function Vehicle() {
  const bodyRef = useRef<RapierRigidBody>(null);
  const { plowAngle, update: updatePlow } = usePlowAngle();
  const plowAngleDisplay = useRef(0);
  const resetCounter = useGameStore((s) => s.resetCounter);

  const { world, rapier } = useRapier();

  useEffect(() => {
    if (!bodyRef.current) return;
    resetVehicleController();
    bodyRef.current.setTranslation({ x: 0, y: 0.7, z: 0 }, true);
    bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }, [resetCounter]);

  // ── Apply inputs and forces at fixed physics timestep ─────────────────────
  // OPTIMIZATION: useBeforePhysicsStep ensures tickVehicle runs once per fixed
  // physics step (1/60s), not once per render frame. This is critical for:
  // • Deterministic input handling across refresh rates
  // • Correct force application (no triple-force on 144Hz displays)
  // • Consistent vehicle behavior on all machines
  useBeforePhysicsStep((deltaTime) => {
    if (bodyRef.current) tickVehicle(bodyRef.current, deltaTime, world, rapier);
  });

  // ── Update plow visuals at render rate (visual-only, safe in useFrame) ────
  useFrame((_, delta) => {
    updatePlow(delta);
    plowAngleDisplay.current = plowAngle.current;
  });

  return (
    <RigidBody
      ref={bodyRef}
      mass={1200}
      position={[0, 0.7, 0]}
      canSleep={false}
      enabledRotations={[false, true, false]}
      linearDamping={0.5}
      angularDamping={1.0}
      colliders={false}
      ccd
    >
      {/* Main body collider – shifted down so the rigid-body origin (the visible
          car's center) rests higher above the road. Without this offset the
          visible chassis sits flush with the asphalt and the wheel cuffs scrape.
          Friction is non-zero so the vehicle can climb curbs / sidewalks
          instead of skating along them. */}
      <CuboidCollider
        args={[COLLIDER_HX, COLLIDER_HY, COLLIDER_HZ]}
        position={[0, -0.2, 0]}
        friction={0.45}
        restitution={0.12}
      />
      <VWBeetleModel plowAngle={plowAngleDisplay.current} />
      <VehicleParticles />
    </RigidBody>
  );
}
