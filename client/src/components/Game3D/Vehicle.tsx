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
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { RigidBody, CuboidCollider, RapierRigidBody, useRapier } from '@react-three/rapier';
import { tickVehicle } from '@/systems/VehicleController';
import { useGameStore } from '@/stores/gameStore';
import { VehicleParticles } from './VehicleParticles';

// ─── Collider half-extents (VW Beetle ≈ 1.55m wide, 1.5m tall, 4.1m long) ──
const COLLIDER_HX = 0.78;
const COLLIDER_HY = 0.5;
const COLLIDER_HZ = 2.05;

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
  const { scene: rawScene } = useGLTF('/models/cars/vw_beetle.glb');
  const brake = useGameStore((s) => s.brake);
  const throttle = useGameStore((s) => s.throttle);
  const steering = useGameStore((s) => s.steering);
  const timeOfDay = useGameStore((s) => s.timeOfDay);

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

  // ── Front wheel refs for visual steering ─────────────────────────────────────
  const frontWheelsRef = useRef<THREE.Object3D[]>([]);

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

    // Body — rusty pink, slightly rough like oxidized paint
    applyToMaterial(scene, 'Chassi', (m) => {
      m.color.copy(BODY_COLOR);
      m.map = null;        // discard original texture; use flat colour
      m.roughness = 0.65;
      m.metalness = 0.1;
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
    const frontWheelGroups: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      const name = obj.name.toLowerCase();
      if (name.includes('wheel')) {
        // Detect front vs rear by node name: WheelF_ = front, WheelR_ = rear
        const isFront = name.startsWith('wheelf');
        const suspensionLift = isFront ? FRONT_SUSPENSION_LIFT : REAR_SUSPENSION_LIFT;
        obj.position.y -= suspensionLift;
        if (isFront) {
          obj.scale.set(1.31, 1.215, 1.35); // narrower but taller front tires
          // Only store the parent group nodes (not __0 mesh children) for steering
          // so rotation applies once via parent-child inheritance
          if (!name.includes('__')) frontWheelGroups.push(obj);
        } else {
          obj.scale.set(2.0625, 1.395, 1.55); // wider rear tires
        }
      }
    });
    frontWheelsRef.current = frontWheelGroups;
  }, [scene]);

  // ── Dynamic light / window overrides each frame ───────────────────────────────
  useFrame((_, delta) => {
    // ── Front wheel visual steering (rotate around Y axis) ──────────────────
    // Model is not rotated, so steering sign is negative (left steer = -Y rotation)
    const maxVisualSteerAngle = 0.52; // ~30° max visual turn
    const targetSteerY = -steering * maxVisualSteerAngle;
    for (const wheel of frontWheelsRef.current) {
      wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, targetSteerY, 10 * delta);
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
    <group>
      {/* GLB model natively faces -Z which matches physics forward (-Z).
          No rotation needed. */}
      <group>
        <primitive object={scene} castShadow receiveShadow />
        {/* Opaque interior block to hide baked-in driver figure. */}
        <mesh position={[0, 0.35, 0.15]}>
          <boxGeometry args={[1.2, 0.7, 1.4]} />
          <meshStandardMaterial color="#0a0a0a" />
        </mesh>
      </group>
      {/* Plow in physics space — -Z is forward */}
      <Plow angleDeg={plowAngle} />

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

  const { world, rapier } = useRapier();

  useFrame((_, delta) => {
    if (bodyRef.current) tickVehicle(bodyRef.current, delta, world, rapier);
    updatePlow(delta);
    plowAngleDisplay.current = plowAngle.current;
  });

  return (
    <RigidBody
      ref={bodyRef}
      mass={1400}
      position={[0, 0.5, 0]}
      canSleep={false}
      enabledRotations={[false, true, false]}
      linearDamping={0}
      angularDamping={0.5}
      colliders={false}
      ccd
    >
      {/* Main body collider – sits at body center so Rapier rests it on the road */}
      <CuboidCollider
        args={[COLLIDER_HX, COLLIDER_HY, COLLIDER_HZ]}
        position={[0, 0, 0]}
        friction={0}
        restitution={0.0}
      />
      <VWBeetleModel plowAngle={plowAngleDisplay.current} />
      <VehicleParticles />
    </RigidBody>
  );
}
