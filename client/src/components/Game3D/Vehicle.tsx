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
 * The beetle's local axes:
 *   front = -Z local (natively faces -Z, matching world forward)
 *   No rotation needed — GLB already faces the correct direction.
 *
 * Plow geometry sits in world-space forward (-Z), attached via a pivot group
 * that lets the plow angle between -5° (scraping) and +5° (lifted).
 */
import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';
import { useGLTF } from '@react-three/drei';

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

// ─── Wheel + suspension constants ─────────────────────────────────────────────
const REAR_WHEEL_SCALE  = 2.0;   // 2× bigger rear tires
const FRONT_WHEEL_SCALE = 1.33;  // 1.33× bigger front tires
const REAR_WHEEL_DROP   = -0.25; // how far below body the rear wheels sit
const FRONT_WHEEL_DROP  = -0.15; // how far below body the front wheels sit
// Suspension coil visual
const COIL_RADIUS       = 0.04;
const COIL_COLOR        = '#888888';

// ─── Suspension coil spring visual ────────────────────────────────────────────
function SuspensionCoil({ position, height }: { position: [number, number, number]; height: number }) {
  return (
    <group position={position}>
      {/* Shock absorber cylinder */}
      <mesh castShadow>
        <cylinderGeometry args={[COIL_RADIUS, COIL_RADIUS, height, 8]} />
        <meshStandardMaterial color={COIL_COLOR} metalness={0.9} roughness={0.3} />
      </mesh>
      {/* Coil spring (torus rings stacked) */}
      {[0.25, 0.0, -0.25].map((yOff, i) => (
        <mesh key={i} position={[0, yOff * height, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[COIL_RADIUS * 2.5, COIL_RADIUS * 0.6, 6, 12]} />
          <meshStandardMaterial color="#666666" metalness={0.8} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

// ─── VW Beetle model with material overrides ──────────────────────────────────
function VWBeetleModel({ plowAngle }: { plowAngle: number }) {
  const { scene } = useGLTF('/models/cars/vw_beetle.glb');
  const [model, setModel] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const mat = child.material as THREE.MeshStandardMaterial;
      if (!mat?.name) return;

      // Body → classic VW light blue
      if (mat.name === 'Chassi') {
        child.material = mat.clone();
        (child.material as THREE.MeshStandardMaterial).color.set('#6BA5C9');
      } else if (mat.name === 'Details_02') {
        child.material = mat.clone();
        (child.material as THREE.MeshStandardMaterial).color.set('#333333');
      }
    });

    // Scale wheels + drop them for suspension gap
    const wheelNodes: Record<string, { scale: number; drop: number }> = {
      WheelF_Left:  { scale: FRONT_WHEEL_SCALE, drop: FRONT_WHEEL_DROP },
      WheelF_Right: { scale: FRONT_WHEEL_SCALE, drop: FRONT_WHEEL_DROP },
      WheelR_Left:  { scale: REAR_WHEEL_SCALE,  drop: REAR_WHEEL_DROP },
      WheelR_Right: { scale: REAR_WHEEL_SCALE,  drop: REAR_WHEEL_DROP },
    };
    clone.traverse((child) => {
      const cfg = wheelNodes[child.name];
      if (cfg) {
        child.scale.multiplyScalar(cfg.scale);
        child.position.y += cfg.drop;
      }
    });

    setModel(clone);
  }, [scene]);

  // Suspension coil positions (in GLB-local space before VEHICLE_SCALE)
  // Front wheels are roughly at X ±0.65, rear at X ±0.65
  const suspensions: [number, number, number][] = [
    [-0.65, -0.05, -0.9],  // front-left
    [ 0.65, -0.05, -0.9],  // front-right
    [-0.65, -0.1,   0.8],  // rear-left
    [ 0.65, -0.1,   0.8],  // rear-right
  ];

  return (
    <group scale={VEHICLE_SCALE}>
      {/* GLB natively faces -Z — no rotation needed */}
      {model && <primitive object={model} />}
      {/* Visible suspension coils */}
      {suspensions.map((pos, i) => (
        <SuspensionCoil
          key={i}
          position={pos}
          height={i < 2 ? 0.35 : 0.45}
        />
      ))}
      {/* Plow in physics space — -Z is forward */}
      <Plow angleDeg={plowAngle} />
    </group>
  );
}

useGLTF.preload('/models/cars/vw_beetle.glb');

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

  const { rapier } = useRapier();

  useEffect(() => {
    if (!bodyRef.current) return;
    resetVehicleController();
    bodyRef.current.setTranslation({ x: 0, y: 0.7, z: 0 }, true);
    bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }, [resetCounter]);

  // ── Apply inputs and forces at fixed physics timestep ─────────────────────
  // useBeforePhysicsStep runs once per fixed physics step (1/60s).
  // The delta is the fixed timestep configured in <Physics timeStep={1/60}>.
  useBeforePhysicsStep((world) => {
    if (bodyRef.current) tickVehicle(bodyRef.current, 1 / 60, world, rapier);
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
        restitution={0.35}
      />
      <VWBeetleModel plowAngle={plowAngleDisplay.current} />
      <VehicleParticles />
    </RigidBody>
  );
}
