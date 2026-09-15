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
import { useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { RigidBody, CuboidCollider, RapierRigidBody, useRapier } from '@react-three/rapier';
import { tickVehicle, resetVehicleController, registerVehicleBody } from '@/systems/VehicleController';
import { useGameStore } from '@/stores/gameStore';
import { VehicleParticles } from './VehicleParticles';
import {
  buildWheelRigs,
  attachWheelHubsToAnchor,
  updateWheelRigs,
  type WheelRig,
} from './wheelRig';
import { getBeetlePaintTexture, getBeetleRoughnessTexture } from './proceduralBeetlePaint';

// ─── Collider half-extents (scaled 0.75× for better road proportion) ─────────
const VEHICLE_SCALE = 0.75;
const COLLIDER_HX = 0.58;
const COLLIDER_HY = 0.38;
const COLLIDER_HZ = 1.54;

// ─── Material colours ─────────────────────────────────────────────────────────
const BODY_COLOR        = new THREE.Color('#ffffff'); // paint comes from the texture (faded pink + rust)
const WINDOW_COLOR      = new THREE.Color('#111111'); // reflective black
const CHROME_COLOR      = new THREE.Color('#d4d4d4'); // chrome wipers
const TAILLIGHT_COLOR   = new THREE.Color('#ff1111'); // red
const REVERSE_COLOR     = new THREE.Color('#ffffff'); // white reverse
const HEADLIGHT_COLOR   = new THREE.Color('#ffffff'); // bright white


// ─── Plow constants (model units; group is scaled 0.75×) ─────────────────────
// GLB bounds: front bumper ends at z = -2.23, body x = ±0.78, hood line ≈ y 0.8.
const PLOW_MIN_DEG  = -5;   // scraping
const PLOW_MAX_DEG  =  5;   // lifted
const PLOW_SPEED    = 60;   // degrees per second
const PLOW_MOUNT_Z  = -2.30; // just ahead of the bumper (hinge)
const PLOW_TIP_Z    = -3.35; // forward point of the V
const PLOW_HALF_W   = 1.02;  // wings reach a little wider than the body
const PLOW_Y_BOTTOM = 0.10;  // scraper edge just above the road
const PLOW_HEIGHT   = 0.62;
const PLOW_THICK    = 0.09;
const ARMOR_COLOR   = '#6d7278'; // filing-cabinet gray (Tuna's scrap)

// ─── Door armor (model units) — doors sit between the wheels ─────────────────
const DOOR_Z_FROM = -1.02, DOOR_Z_TO = 0.88;
const DOOR_Y_FROM = 0.42,  DOOR_Y_TO = 1.12;
const DOOR_X      = 0.80;

useGLTF.preload('/models/cars/vw_beetle.glb');

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

// ─── Plow — a proper V-wedge in front of the bumper ───────────────────────────
// Two steel wings meet at a forward tip, braced back to the bumper, with a
// hardened scraper edge along the bottom. Pivots ±5° at the mount for Q/E.
function Plow({ angleDeg }: { angleDeg: number }) {
  const pivotRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (pivotRef.current) pivotRef.current.rotation.x = (angleDeg * Math.PI) / 180;
  }, [angleDeg]);

  const wingLen = Math.hypot(PLOW_HALF_W, PLOW_MOUNT_Z - PLOW_TIP_Z);
  const wingYaw = Math.atan2(PLOW_HALF_W, PLOW_MOUNT_Z - PLOW_TIP_Z); // angle from car axis
  const midY = PLOW_Y_BOTTOM + PLOW_HEIGHT / 2;
  const tipLocalZ = PLOW_TIP_Z - PLOW_MOUNT_Z; // negative: forward of the hinge
  const wingCenterZ = tipLocalZ / 2;
  const wingCenterX = PLOW_HALF_W / 2;

  const steel = <meshStandardMaterial color={ARMOR_COLOR} metalness={0.55} roughness={0.62} />;

  return (
    <group ref={pivotRef} position={[0, 0, PLOW_MOUNT_Z]}>
      {/* Left wing (−X) — runs from the tip back to the left mount */}
      <mesh position={[-wingCenterX, midY, wingCenterZ]} rotation={[0, wingYaw, 0]} castShadow>
        <boxGeometry args={[PLOW_THICK, PLOW_HEIGHT, wingLen]} />
        {steel}
      </mesh>
      {/* Right wing (+X) */}
      <mesh position={[wingCenterX, midY, wingCenterZ]} rotation={[0, -wingYaw, 0]} castShadow>
        <boxGeometry args={[PLOW_THICK, PLOW_HEIGHT, wingLen]} />
        {steel}
      </mesh>
      {/* Tip post */}
      <mesh position={[0, midY, tipLocalZ + 0.03]} castShadow>
        <boxGeometry args={[0.16, PLOW_HEIGHT + 0.06, 0.16]} />
        <meshStandardMaterial color="#4a4f55" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* Scraper edge — darker, worn, along the bottom of both wings */}
      <mesh position={[-wingCenterX, PLOW_Y_BOTTOM + 0.03, wingCenterZ]} rotation={[0, wingYaw, 0]}>
        <boxGeometry args={[PLOW_THICK + 0.05, 0.06, wingLen]} />
        <meshStandardMaterial color="#2c2f33" metalness={0.8} roughness={0.35} />
      </mesh>
      <mesh position={[wingCenterX, PLOW_Y_BOTTOM + 0.03, wingCenterZ]} rotation={[0, -wingYaw, 0]}>
        <boxGeometry args={[PLOW_THICK + 0.05, 0.06, wingLen]} />
        <meshStandardMaterial color="#2c2f33" metalness={0.8} roughness={0.35} />
      </mesh>
      {/* Top rail across the wings' rear edge */}
      <mesh position={[0, PLOW_Y_BOTTOM + PLOW_HEIGHT + 0.02, -0.02]}>
        <boxGeometry args={[PLOW_HALF_W * 2 + 0.1, 0.05, 0.08]} />
        <meshStandardMaterial color="#444" metalness={0.9} roughness={0.3} />
      </mesh>
      {/* Bracing struts back to the bumper */}
      {[-0.55, 0.55].map((x) => (
        <mesh key={x} position={[x, midY + 0.05, 0.18]} rotation={[0, 0, 0]}>
          <boxGeometry args={[0.06, 0.06, 0.4]} />
          <meshStandardMaterial color="#444" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Door armor — filing-cabinet plates bolted over both doors ────────────────
function DoorArmor() {
  const len = DOOR_Z_TO - DOOR_Z_FROM;
  const hgt = DOOR_Y_TO - DOOR_Y_FROM;
  const cz = (DOOR_Z_FROM + DOOR_Z_TO) / 2;
  const cy = (DOOR_Y_FROM + DOOR_Y_TO) / 2;
  const bolts: [number, number][] = [];
  for (let i = 0; i < 6; i++) { const z = DOOR_Z_FROM + 0.12 + (i / 5) * (len - 0.24); bolts.push([z, DOOR_Y_FROM + 0.08]); bolts.push([z, DOOR_Y_TO - 0.08]); }
  const side = (sign: 1 | -1) => (
    <group key={sign}>
      <mesh position={[sign * DOOR_X, cy, cz]} castShadow>
        <boxGeometry args={[0.05, hgt, len]} />
        <meshStandardMaterial color={ARMOR_COLOR} metalness={0.45} roughness={0.7} />
      </mesh>
      {/* a second, slightly offset plate so it reads as overlapping scrap */}
      <mesh position={[sign * (DOOR_X + 0.03), cy - 0.12, cz + 0.15]}>
        <boxGeometry args={[0.03, hgt * 0.55, len * 0.6]} />
        <meshStandardMaterial color="#7a7f86" metalness={0.45} roughness={0.75} />
      </mesh>
      {bolts.map(([z, y], i) => (
        <mesh key={i} position={[sign * (DOOR_X + 0.035), y, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.022, 0.022, 0.02, 6]} />
          <meshStandardMaterial color="#2f3236" metalness={0.8} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
  return <group>{side(1)}{side(-1)}</group>;
}

// ─── VW Beetle model with material overrides ──────────────────────────────────
function VWBeetleModel({ plowAngle }: { plowAngle: number }) {
  const { scene: rawScene } = useGLTF('/models/cars/vw_beetle.glb');
  const brake = useGameStore((s) => s.brake);
  const throttle = useGameStore((s) => s.throttle);
  const steering = useGameStore((s) => s.steering);
  const velocityMph = useGameStore((s) => s.velocityMph);
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const bodyGroupRef = useRef<THREE.Group>(null);
  const wheelsAnchorRef = useRef<THREE.Group>(null);
  const bouncePhase = useRef(0);
  const wheelRigsRef = useRef<WheelRig[]>([]);

  // Headlight refs
  const leftLightRef = useRef<THREE.SpotLight>(null);
  const rightLightRef = useRef<THREE.SpotLight>(null);
  const leftTargetRef = useRef<THREE.Object3D>(null);
  const rightTargetRef = useRef<THREE.Object3D>(null);

  // Clone once so we don't mutate the cached GLB
  const scene = useMemo(() => rawScene.clone(true), [rawScene]);

  // ── Blinker state (flash at ~1.5 Hz when steering) ──────────────────────────
  const blinkerOn = useRef(false);
  const blinkerTimer = useRef(0);

  // ── Apply material overrides once on mount ───────────────────────────────────
  useEffect(() => {
    // Remove interior passengers / any mesh that looks like a person inside
    // Hide anything positioned inside the cabin area (Y roughly 0.1–0.6, near center)
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const name = obj.name.toLowerCase();
      // Hide interior/cabin/passenger meshes — common Sketchfab beetle extras
      if (name.includes('person') || name.includes('driver') ||
          name.includes('passenger') || name.includes('interior') ||
          name.includes('seat') || name.includes('steer')) {
        obj.visible = false;
      }
    });

    // Body — faded pink with rust, matte (Grandma's 1976 paint, forty years of Kent weather)
    applyToMaterial(scene, 'Chassi', (m) => {
      m.color.copy(BODY_COLOR);
      m.map = getBeetlePaintTexture();
      m.roughnessMap = getBeetleRoughnessTexture();
      m.roughness = 1.0;      // scaled by roughnessMap (0.72 paint / 0.95 rust)
      m.metalness = 0.0;
      m.envMapIntensity = 0.25;
      m.needsUpdate = true;
    });

    // Details_02 — chrome wipers / trim
    applyToMaterial(scene, 'Details_02', (m) => {
      m.color.copy(CHROME_COLOR);
      m.map = null;
      m.roughness = 0.1;
      m.metalness = 1.0;
      m.needsUpdate = true;
    });

    // Raise car body independent of wheels - move wheels down relative to body
    // Suspension lift: 8" = ~0.2m front, 6" = ~0.1492m rear (reduced 2" each)
    const FRONT_SUSPENSION_LIFT = 0.1992; // 8 inches (reduced 2" from 10")
    const REAR_SUSPENSION_LIFT = 0.1492;  // 6 inches (reduced 2" from 8")
    scene.traverse((obj) => {
      const name = obj.name.toLowerCase();
      if (!name.includes('wheel') || name.includes('__')) return;
      const isFront = name.startsWith('wheelf');
      obj.position.y -= isFront ? FRONT_SUSPENSION_LIFT : REAR_SUSPENSION_LIFT;
      if (isFront) {
        obj.scale.set(1.31, 1.215, 1.35);
      } else {
        obj.scale.set(2.0625, 1.395, 1.55);
      }
    });

    const rigs = buildWheelRigs(scene);
    wheelRigsRef.current = rigs;
  }, [scene]);

  useLayoutEffect(() => {
    if (!wheelsAnchorRef.current || wheelRigsRef.current.length === 0) return;
    attachWheelHubsToAnchor(wheelRigsRef.current, wheelsAnchorRef.current);
  }, [scene]);

  // ── Dynamic light / window overrides each frame ───────────────────────────────
  useFrame((_, delta) => {
    // ── Wheel spin + steering (separate hub vs mesh to avoid Euler coupling) ──
    const speedMs = velocityMph * 0.44704;
    const wheelRadius = 0.34 * VEHICLE_SCALE;
    const spinRate = wheelRadius > 0 ? speedMs / wheelRadius : 0;
    const maxVisualSteerAngle = 0.52;
    const targetSteerY = -steering * maxVisualSteerAngle;
    updateWheelRigs(wheelRigsRef.current, spinRate, delta, targetSteerY, 10);

    // ── Suspension bounce on body only (wheels stay on the road) ─────────────
    if (bodyGroupRef.current) {
      bouncePhase.current += delta * (2 + velocityMph * 0.08);
      const bounceAmp = 0.012 + Math.min(velocityMph / 70, 1) * 0.025;
      bodyGroupRef.current.position.y =
        Math.sin(bouncePhase.current) * bounceAmp +
        Math.sin(bouncePhase.current * 2.3) * bounceAmp * 0.35;
    }

    // ── Headlight intensity based on time of day ──────────────────────────────
    const headlightIntensity = timeOfDay === 'night' ? 15 : timeOfDay === 'sunset' ? 8 : 2;
    if (leftLightRef.current) leftLightRef.current.intensity = headlightIntensity;
    if (rightLightRef.current) rightLightRef.current.intensity = headlightIntensity;
    if (leftLightRef.current && leftTargetRef.current) {
      leftLightRef.current.target = leftTargetRef.current;
    }
    if (rightLightRef.current && rightTargetRef.current) {
      rightLightRef.current.target = rightTargetRef.current;
    }

    // Blinker flash
    blinkerTimer.current += delta;
    if (blinkerTimer.current >= 0.33) {
      blinkerTimer.current = 0;
      blinkerOn.current = !blinkerOn.current;
    }
    const blinkerActive = Math.abs(steering) > 0.1;

    // Reverse lights: brake while stopped (speed near 0)
    // We approximate: brake held and low forward speed = reverse lights
    const reverseLights = brake > 0.5 && throttle < 0.1;

    // --- Details_03: headlights + blinkers (front)
    applyToMaterial(scene, 'Details_03', (m) => {
      // Headlights always on
      m.emissive.copy(HEADLIGHT_COLOR);
      m.emissiveIntensity = 3.0;
      // Tint base slightly amber for blinker areas; white for headlights
      m.color.set(blinkerActive && blinkerOn.current ? '#ff9900' : '#ffffff');
      m.roughness = 0.05;
      m.metalness = 0.1;
    });

    // --- Details_01: taillights + reverse lights (rear)
    // Only apply emissive to meshes at the REAR (positive Z) to avoid affecting bumpers/handles
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mat = obj.material;
      if (!mat || !(mat instanceof THREE.MeshStandardMaterial) || mat.name !== 'Details_01') return;
      
      // Check if mesh is at the rear of the car (Z > 1.5 in local space indicates rear)
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      const isRear = obj.position.z > 1.5;
      
      if (isRear) {
        if (reverseLights) {
          mat.emissive.copy(REVERSE_COLOR);
          mat.emissiveIntensity = 4.0;
          mat.color.copy(REVERSE_COLOR);
        } else {
          mat.emissive.copy(TAILLIGHT_COLOR);
          mat.emissiveIntensity = brake > 0.1 ? 3.0 : 1.2; // brighter when braking
          mat.color.copy(TAILLIGHT_COLOR);
        }
        mat.roughness = 0.05;
        mat.metalness = 0.05;
      }
    });

    // Windows — traverse by mesh name to find window geometry within Details meshes
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      // The Sketchfab beetle groups glass within the Chassi mesh using a separate
      // draw call; we tint everything in Chassi that appears to be a window
      // by looking for semi-transparent areas (can't discriminate easily without UV).
      // Instead we handle it by name: the node "Details_02" contains glass trim.
      if (obj.name.includes('Details_02')) {
        const m = obj.material as THREE.MeshStandardMaterial;
        if (m) {
          m.color.copy(WINDOW_COLOR);
          m.roughness = 0.0;
          m.metalness = 0.9;
          m.envMapIntensity = 2.0;
        }
      }
    });
  });

  return (
    <group scale={VEHICLE_SCALE}>
      <group ref={bodyGroupRef}>
        <group>
          <primitive object={scene} castShadow receiveShadow />
          {/* Opaque interior block to hide baked-in driver figure. */}
          <mesh position={[0, 0.35, 0.15]}>
            <boxGeometry args={[1.2, 0.7, 1.4]} />
            <meshStandardMaterial color="#0a0a0a" />
          </mesh>
        </group>
        <Plow angleDeg={plowAngle} />
        <DoorArmor />
      </group>
      {/* Wheels outside bounce group — roll on road, body bounces above */}
      <group ref={wheelsAnchorRef} />

      {/* Headlight SpotLights — project forward from front of car */}
      <spotLight
        ref={leftLightRef}
        position={[-0.55, 0.45, -2.1]}
        angle={0.45}
        penumbra={0.6}
        distance={40}
        intensity={2}
        color="#ffe8c0"
        castShadow={false}
      />
      <object3D ref={leftTargetRef} position={[-0.55, -0.5, -15]} />

      <spotLight
        ref={rightLightRef}
        position={[0.55, 0.45, -2.1]}
        angle={0.45}
        penumbra={0.6}
        distance={40}
        intensity={2}
        color="#ffe8c0"
        castShadow={false}
      />
      <object3D ref={rightTargetRef} position={[0.55, -0.5, -15]} />
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
    registerVehicleBody(bodyRef.current);
    return () => registerVehicleBody(null);
  }, []);

  useEffect(() => {
    if (!bodyRef.current) return;
    resetVehicleController();
    bodyRef.current.setTranslation({ x: 0, y: 0.5, z: 0 }, true);
    bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    bodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  }, [resetCounter]);

  useFrame((_, delta) => {
    if (bodyRef.current) tickVehicle(bodyRef.current, delta, world, rapier);
    updatePlow(delta);
    plowAngleDisplay.current = plowAngle.current;
  });

  return (
    <RigidBody
      ref={bodyRef}
      mass={1200}
      position={[0, 0.5, 0]}
      canSleep={false}
      enabledRotations={[false, true, false]}
      linearDamping={0}
      angularDamping={2.5}
      colliders={false}
      ccd
    >
      {/* Collider biased toward rear (+Z) so the nose doesn't dive or wander */}
      <CuboidCollider
        args={[COLLIDER_HX, COLLIDER_HY, COLLIDER_HZ]}
        position={[0, -0.05, 0.38]}
        friction={0}
        restitution={0.2}
      />
      <VWBeetleModel plowAngle={plowAngleDisplay.current} />
      <VehicleParticles />
    </RigidBody>
  );
}
