Step 2: Zustand Store Structure
typescript// src/stores/gameStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════

interface VehicleState {
  position: [number, number, number];    // World position [x, y, z]
  rotation: number;                       // Y-axis rotation in radians
  velocity: number;                       // Current speed (0-60 MPH)
  steeringAngle: number;                  // -1 (left) to 1 (right)
  throttle: number;                       // 0 to 1 (gas pedal)
  brake: number;                          // 0 to 1 (brake pedal)
}

interface GameState {
  phase: 'menu' | 'driving' | 'quiz' | 'paused' | 'gameover';
  mileage: number;                        // Total miles traveled
  lastQuizMile: number;                   // Mile marker of last quiz
  currentBiome: 'city' | 'highway' | 'rural';
}

interface QuizState {
  isActive: boolean;
  currentQuestion: QuizQuestion | null;
  questionsAnswered: number;
  correctAnswers: number;
}

interface QuizQuestion {
  id: string;
  category: string;
  question: string;
  options: string[];
  correctIndex: number;
}

interface EconomyState {
  zCoins: number;                         // Currency earned
  totalEarned: number;                    // Lifetime earnings
  streak: number;                         // Consecutive correct answers
}

interface SettingsState {
  steeringSensitivity: number;            // 0.5 to 2.0 multiplier
  invertSteering: boolean;
  musicVolume: number;
  sfxVolume: number;
}

// ═══════════════════════════════════════════════════════════
// COMBINED STORE TYPE
// ═══════════════════════════════════════════════════════════

interface GameStore {
  vehicle: VehicleState;
  game: GameState;
  quiz: QuizState;
  economy: EconomyState;
  settings: SettingsState;
  
  // Vehicle actions
  setVehiclePosition: (pos: [number, number, number]) => void;
  setVehicleControls: (throttle: number, brake: number, steering: number) => void;
  setVelocity: (v: number) => void;
  
  // Game actions
  setPhase: (phase: GameState['phase']) => void;
  addMileage: (miles: number) => void;
  setBiome: (biome: GameState['currentBiome']) => void;
  
  // Quiz actions
  triggerQuiz: (question: QuizQuestion) => void;
  answerQuiz: (selectedIndex: number) => void;
  closeQuiz: () => void;
  
  // Economy actions
  addZCoins: (amount: number) => void;
  
  // Persistence
  resetProgress: () => void;
}
Key decisions:

persist middleware auto-saves to LocalStorage
Velocity stored as MPH (converted to physics units in controller)
Quiz triggers at mileage intervals via lastQuizMile comparison


Next step: Store implementation with actions and persistence logic.
Ready? (y/k)yJan 20Orchestrated Zustand store implementation with persistence mechanicsOrchestrated Zustand store implementation with persistence mechanicsStep 3: Store Implementation
typescript// src/stores/gameStore.ts (continued)

// ═══════════════════════════════════════════════════════════
// INITIAL STATE VALUES
// ═══════════════════════════════════════════════════════════

const initialVehicle: VehicleState = {
  position: [0, 0.5, 0],
  rotation: 0,
  velocity: 0,
  steeringAngle: 0,
  throttle: 0,
  brake: 0,
};

const initialGame: GameState = {
  phase: 'menu',
  mileage: 0,
  lastQuizMile: 0,
  currentBiome: 'city',                   // NYC starting biome
};

const initialQuiz: QuizState = {
  isActive: false,
  currentQuestion: null,
  questionsAnswered: 0,
  correctAnswers: 0,
};

const initialEconomy: EconomyState = {
  zCoins: 0,
  totalEarned: 0,
  streak: 0,
};

const initialSettings: SettingsState = {
  steeringSensitivity: 1.0,
  invertSteering: false,
  musicVolume: 0.7,
  sfxVolume: 0.8,
};

// ═══════════════════════════════════════════════════════════
// STORE CREATION WITH PERSISTENCE
// ═══════════════════════════════════════════════════════════

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      // State slices
      vehicle: initialVehicle,
      game: initialGame,
      quiz: initialQuiz,
      economy: initialEconomy,
      settings: initialSettings,

      // ─────────────────────────────────────────────────────
      // VEHICLE ACTIONS
      // ─────────────────────────────────────────────────────
      
      setVehiclePosition: (pos) =>
        set((state) => ({ vehicle: { ...state.vehicle, position: pos } })),

      setVehicleControls: (throttle, brake, steering) =>
        set((state) => ({
          vehicle: {
            ...state.vehicle,
            throttle: Math.max(0, Math.min(1, throttle)),      // Clamp 0-1
            brake: Math.max(0, Math.min(1, brake)),            // Clamp 0-1
            steeringAngle: Math.max(-1, Math.min(1, steering)), // Clamp -1 to 1
          },
        })),

      setVelocity: (v) =>
        set((state) => ({ vehicle: { ...state.vehicle, velocity: v } })),

      // ─────────────────────────────────────────────────────
      // GAME ACTIONS
      // ─────────────────────────────────────────────────────
      
      setPhase: (phase) =>
        set((state) => ({ game: { ...state.game, phase } })),

      addMileage: (miles) =>
        set((state) => ({
          game: { ...state.game, mileage: state.game.mileage + miles },
        })),

      setBiome: (biome) =>
        set((state) => ({ game: { ...state.game, currentBiome: biome } })),

      // ─────────────────────────────────────────────────────
      // QUIZ ACTIONS
      // ─────────────────────────────────────────────────────
      
      triggerQuiz: (question) =>
        set((state) => ({
          game: { ...state.game, phase: 'quiz', lastQuizMile: state.game.mileage },
          quiz: { ...state.quiz, isActive: true, currentQuestion: question },
        })),

      answerQuiz: (selectedIndex) => {
        const { quiz, economy } = get();
        const isCorrect = selectedIndex === quiz.currentQuestion?.correctIndex;
        
        // Streak bonus: 10 base + 5 per streak (max 50 bonus)
        const streakBonus = Math.min(economy.streak * 5, 50);
        const reward = isCorrect ? 10 + streakBonus : 0;

        set((state) => ({
          quiz: {
            ...state.quiz,
            questionsAnswered: state.quiz.questionsAnswered + 1,
            correctAnswers: state.quiz.correctAnswers + (isCorrect ? 1 : 0),
          },
          economy: {
            ...state.economy,
            zCoins: state.economy.zCoins + reward,
            totalEarned: state.economy.totalEarned + reward,
            streak: isCorrect ? state.economy.streak + 1 : 0,  // Reset on wrong
          },
        }));

        return isCorrect;                 // Return for UI feedback
      },

      closeQuiz: () =>
        set((state) => ({
          game: { ...state.game, phase: 'driving' },
          quiz: { ...state.quiz, isActive: false, currentQuestion: null },
        })),

      // ─────────────────────────────────────────────────────
      // ECONOMY ACTIONS
      // ─────────────────────────────────────────────────────
      
      addZCoins: (amount) =>
        set((state) => ({
          economy: {
            ...state.economy,
            zCoins: state.economy.zCoins + amount,
            totalEarned: state.economy.totalEarned + amount,
          },
        })),

      // ─────────────────────────────────────────────────────
      // PERSISTENCE
      // ─────────────────────────────────────────────────────
      
      resetProgress: () =>
        set({
          vehicle: initialVehicle,
          game: initialGame,
          quiz: initialQuiz,
          economy: initialEconomy,
          // Note: settings preserved intentionally
        }),
    }),
    {
      name: 'ali-aigoo-save',             // LocalStorage key
      partialize: (state) => ({
        // Only persist these (exclude volatile vehicle state)
        game: state.game,
        quiz: { questionsAnswered: state.quiz.questionsAnswered, correctAnswers: state.quiz.correctAnswers },
        economy: state.economy,
        settings: state.settings,
      }),
    }
  )
);
Key decisions:

Streak bonus caps at 50 to prevent runaway rewards
Vehicle position/velocity NOT persisted (volatile runtime state)
Settings survive resetProgress() for better UX


Next step: Vehicle physics controller with delta scaling and velocity clamping.
Ready? (y/k)yJan 20Architected physics-based vehicle controller with delta scalingArchitected physics-based vehicle controller with delta scalingStep 4: Vehicle Physics Controller
typescript// src/components/Vehicle/VehicleController.ts

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { Vector3 } from 'three';
import { useGameStore } from '../../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// PHYSICS CONSTANTS
// ═══════════════════════════════════════════════════════════

const PHYSICS = {
  // Conversion: 1 MPH = 0.44704 meters/second
  MPH_TO_MS: 0.44704,
  
  // Speed limits (in MPH, converted at runtime)
  MAX_SPEED_MPH: 60,
  REVERSE_MAX_MPH: 10,
  
  // Force multipliers (tuned for Rapier)
  ACCELERATION_FORCE: 12,                 // Forward thrust strength
  BRAKE_FORCE: 20,                        // Braking deceleration
  ENGINE_BRAKE: 3,                        // Passive decel when no input
  
  // Steering
  MAX_STEER_ANGLE: Math.PI / 6,           // 30 degrees max wheel turn
  STEER_SPEED: 4,                         // How fast steering responds
  STEER_RETURN_SPEED: 6,                  // How fast wheels center
  
  // Friction & drag
  LATERAL_FRICTION: 0.95,                 // Side-slip resistance (1 = no slip)
  DRAG_COEFFICIENT: 0.005,                // Air resistance at high speed
};

// ═══════════════════════════════════════════════════════════
// HELPER: Convert MPH to physics velocity
// ═══════════════════════════════════════════════════════════

const mphToVelocity = (mph: number): number => mph * PHYSICS.MPH_TO_MS;
const velocityToMph = (vel: number): number => vel / PHYSICS.MPH_TO_MS;

// ═══════════════════════════════════════════════════════════
// VEHICLE CONTROLLER HOOK
// ═══════════════════════════════════════════════════════════

export function useVehicleController(rigidBodyRef: React.RefObject<RapierRigidBody>) {
  // Store selectors (subscribe only to what we need)
  const throttle = useGameStore((s) => s.vehicle.throttle);
  const brake = useGameStore((s) => s.vehicle.brake);
  const steeringInput = useGameStore((s) => s.vehicle.steeringAngle);
  const phase = useGameStore((s) => s.game.phase);
  const setVelocity = useGameStore((s) => s.setVelocity);
  const setVehiclePosition = useGameStore((s) => s.setVehiclePosition);
  const addMileage = useGameStore((s) => s.addMileage);

  // Internal refs (avoid re-renders)
  const currentSteerAngle = useRef(0);    // Smoothed steering
  const lastPosition = useRef(new Vector3());
  const mileageAccumulator = useRef(0);   // Sub-mile distance tracking

  // Reusable vectors (avoid GC pressure)
  const forwardDir = useRef(new Vector3());
  const velocity = useRef(new Vector3());

  // ─────────────────────────────────────────────────────────
  // MAIN PHYSICS UPDATE (runs every frame)
  // ─────────────────────────────────────────────────────────

  useFrame((_, delta) => {
    const body = rigidBodyRef.current;
    if (!body) return;

    // Skip physics when not driving
    if (phase !== 'driving') {
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);  // Freeze vehicle
      return;
    }

    // Clamp delta to prevent physics explosion on tab-switch
    const dt = Math.min(delta, 0.05);     // Max 50ms step (20 FPS floor)

    // ───────────────────────────────────────────────────────
    // 1. READ CURRENT STATE
    // ───────────────────────────────────────────────────────

    const pos = body.translation();       // {x, y, z}
    const rot = body.rotation();          // Quaternion
    const linvel = body.linvel();         // Linear velocity {x, y, z}

    // Calculate forward direction from rotation
    forwardDir.current.set(0, 0, -1);     // Vehicle faces -Z
    forwardDir.current.applyQuaternion(rot);
    forwardDir.current.y = 0;             // Project to ground plane
    forwardDir.current.normalize();

    // Current forward speed (dot product: + = forward, - = reverse)
    velocity.current.set(linvel.x, 0, linvel.z);
    const forwardSpeed = velocity.current.dot(forwardDir.current);
    const currentMph = velocityToMph(Math.abs(forwardSpeed));

    // ───────────────────────────────────────────────────────
    // 2. APPLY STEERING (smoothed)
    // ───────────────────────────────────────────────────────

    // Smooth steering input for natural feel
    const targetSteer = steeringInput * PHYSICS.MAX_STEER_ANGLE;
    const steerDelta = steeringInput !== 0
      ? PHYSICS.STEER_SPEED * dt
      : PHYSICS.STEER_RETURN_SPEED * dt;

    currentSteerAngle.current = lerpAngle(
      currentSteerAngle.current,
      targetSteer,
      steerDelta
    );

    // Apply angular velocity for turning (scaled by speed)
    const turnRate = currentSteerAngle.current * (forwardSpeed * 0.5);
    body.setAngvel({ x: 0, y: -turnRate, z: 0 }, true);

    // ───────────────────────────────────────────────────────
    // 3. CALCULATE FORCES
    // ───────────────────────────────────────────────────────

    let forceMultiplier = 0;

    // Throttle: accelerate forward (only if under max speed)
    if (throttle > 0 && currentMph < PHYSICS.MAX_SPEED_MPH) {
      // Reduce force as we approach max speed (realistic torque curve)
      const speedRatio = currentMph / PHYSICS.MAX_SPEED_MPH;
      const torqueFalloff = 1 - speedRatio * 0.7;  // 30% force at max
      forceMultiplier = throttle * PHYSICS.ACCELERATION_FORCE * torqueFalloff;
    }

    // Brake: apply opposing force
    if (brake > 0 && Math.abs(forwardSpeed) > 0.1) {
      const brakeDir = forwardSpeed > 0 ? -1 : 1;  // Oppose motion
      forceMultiplier += brakeDir * brake * PHYSICS.BRAKE_FORCE;
    }

    // Engine braking: passive deceleration when coasting
    if (throttle === 0 && brake === 0 && Math.abs(forwardSpeed) > 0.5) {
      const coastDir = forwardSpeed > 0 ? -1 : 1;
      forceMultiplier += coastDir * PHYSICS.ENGINE_BRAKE;
    }

    // ───────────────────────────────────────────────────────
    // 4. APPLY IMPULSE (delta-scaled)
    // ───────────────────────────────────────────────────────

    // Scale force by delta time for frame-rate independence
    const impulse = {
      x: forwardDir.current.x * forceMultiplier * dt,
      y: 0,
      z: forwardDir.current.z * forceMultiplier * dt,
    };

    body.applyImpulse(impulse, true);

    // ───────────────────────────────────────────────────────
    // 5. VELOCITY CLAMPING (hard limit at 60 MPH)
    // ───────────────────────────────────────────────────────

    const maxVel = mphToVelocity(PHYSICS.MAX_SPEED_MPH);
    const currentVel = Math.sqrt(linvel.x ** 2 + linvel.z ** 2);

    if (currentVel > maxVel) {
      const scale = maxVel / currentVel;
      body.setLinvel(
        { x: linvel.x * scale, y: linvel.y, z: linvel.z * scale },
        true
      );
    }

    // ───────────────────────────────────────────────────────
    // 6. LATERAL FRICTION (reduce sliding/drifting)
    // ───────────────────────────────────────────────────────

    // Calculate sideways velocity component
    const rightDir = new Vector3(-forwardDir.current.z, 0, forwardDir.current.x);
    const lateralSpeed = velocity.current.dot(rightDir);

    // Apply counter-force to reduce sideways slip
    const lateralDamping = lateralSpeed * PHYSICS.LATERAL_FRICTION * dt;
    body.applyImpulse(
      { x: -rightDir.x * lateralDamping, y: 0, z: -rightDir.z * lateralDamping },
      true
    );

    // ───────────────────────────────────────────────────────
    // 7. UPDATE STORE (throttled)
    // ───────────────────────────────────────────────────────

    setVelocity(currentMph);
    setVehiclePosition([pos.x, pos.y, pos.z]);

    // Track mileage (convert meters to miles: 1609.34 m/mile)
    const distanceTraveled = lastPosition.current.distanceTo(
      new Vector3(pos.x, pos.y, pos.z)
    );
    mileageAccumulator.current += distanceTraveled / 1609.34;

    // Batch mileage updates (every 0.1 miles to reduce store writes)
    if (mileageAccumulator.current >= 0.1) {
      addMileage(mileageAccumulator.current);
      mileageAccumulator.current = 0;
    }

    lastPosition.current.set(pos.x, pos.y, pos.z);
  });
}

// ═══════════════════════════════════════════════════════════
// UTILITY: Smooth angle interpolation
// ═══════════════════════════════════════════════════════════

function lerpAngle(current: number, target: number, factor: number): number {
  const diff = target - current;
  if (Math.abs(diff) < 0.001) return target;
  return current + diff * Math.min(factor, 1);
}
Key mechanics:

Delta clamped at 50ms prevents physics explosion on tab-switch
Torque falloff simulates realistic acceleration curve
Lateral friction keeps vehicle planted (no ice-skating)
Mileage batched at 0.1-mile intervals to reduce store writes


Next step: Vehicle component that renders the mesh and wires up the controller.
Ready? (y/k)yJan 20Architected React component integrating physics and 3D renderingArchitected React component integrating physics and 3D renderingStep 5: Vehicle Component
typescript// src/components/Vehicle/Vehicle.tsx

import { useRef, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { RigidBody, RapierRigidBody, CuboidCollider } from '@react-three/rapier';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { useVehicleController } from './VehicleController';
import { useGameStore } from '../../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// VEHICLE DIMENSIONS (Pink VW Beetle - voxel scale)
// ═══════════════════════════════════════════════════════════

const VEHICLE = {
  // Collider dimensions (half-extents for Rapier)
  WIDTH: 0.9,                             // ~1.8m total width
  HEIGHT: 0.7,                            // ~1.4m total height
  LENGTH: 2.0,                            // ~4m total length
  
  // Visual offset (model origin adjustment)
  VISUAL_OFFSET_Y: -0.3,
  
  // Physics properties
  MASS: 1200,                             // kg (realistic for Beetle)
  FRICTION: 0.8,
  RESTITUTION: 0.1,                       // Low bounce
};

// ═══════════════════════════════════════════════════════════
// THEME COLORS
// ═══════════════════════════════════════════════════════════

const COLORS = {
  BODY_PINK: '#ff00ff',                   // Neon pink
  ACCENT_GREEN: '#39ff14',                // Toxic green (headlights)
  WHEEL_DARK: '#1a1a1a',
};

// ═══════════════════════════════════════════════════════════
// VEHICLE COMPONENT
// ═══════════════════════════════════════════════════════════

interface VehicleProps {
  modelPath?: string;                     // Optional GLTF path
}

export function Vehicle({ modelPath }: VehicleProps) {
  // Refs
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const meshRef = useRef<Group>(null);

  // Wire up physics controller
  useVehicleController(rigidBodyRef);

  // Get initial position from store (for respawn/load)
  const initialPosition = useGameStore((s) => s.vehicle.position);

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={initialPosition}
      colliders={false}                   // Use custom collider below
      mass={VEHICLE.MASS}
      friction={VEHICLE.FRICTION}
      restitution={VEHICLE.RESTITUTION}
      linearDamping={0.5}                 // Air drag approximation
      angularDamping={2.0}                // Resist spinning out
      enabledRotations={[false, true, false]}  // Lock X/Z rotation (no flipping)
      type="dynamic"
    >
      {/* Collision box (invisible) */}
      <CuboidCollider
        args={[VEHICLE.WIDTH / 2, VEHICLE.HEIGHT / 2, VEHICLE.LENGTH / 2]}
        position={[0, VEHICLE.HEIGHT / 2, 0]}
      />

      {/* Visual mesh group */}
      <group ref={meshRef} position={[0, VEHICLE.VISUAL_OFFSET_Y, 0]}>
        {modelPath ? (
          <GLTFVehicle path={modelPath} />
        ) : (
          <PlaceholderVehicle />
        )}
      </group>
    </RigidBody>
  );
}

// ═══════════════════════════════════════════════════════════
// GLTF MODEL LOADER
// ═══════════════════════════════════════════════════════════

interface GLTFVehicleProps {
  path: string;
}

function GLTFVehicle({ path }: GLTFVehicleProps) {
  const { scene } = useGLTF(path);

  useEffect(() => {
    // Optimize materials for mobile
    scene.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mesh = child as Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        
        // Disable expensive material features
        if (mesh.material instanceof MeshStandardMaterial) {
          mesh.material.envMapIntensity = 0.3;
          mesh.material.roughness = 0.8;   // Less reflective = faster
        }
      }
    });
  }, [scene]);

  return <primitive object={scene} scale={1} />;
}

// ═══════════════════════════════════════════════════════════
// PLACEHOLDER VEHICLE (dev/fallback)
// ═══════════════════════════════════════════════════════════

function PlaceholderVehicle() {
  return (
    <group>
      {/* Main body - voxel Beetle shape */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.6, 0.6, 3.2]} />
        <meshStandardMaterial color={COLORS.BODY_PINK} />
      </mesh>

      {/* Roof/cabin */}
      <mesh position={[0, 0.95, -0.2]} castShadow>
        <boxGeometry args={[1.4, 0.5, 1.6]} />
        <meshStandardMaterial color={COLORS.BODY_PINK} />
      </mesh>

      {/* Hood (front curve approximation) */}
      <mesh position={[0, 0.4, 1.2]} castShadow>
        <boxGeometry args={[1.4, 0.4, 0.8]} />
        <meshStandardMaterial color={COLORS.BODY_PINK} />
      </mesh>

      {/* Headlights (toxic green glow) */}
      <mesh position={[0.5, 0.4, 1.6]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshStandardMaterial
          color={COLORS.ACCENT_GREEN}
          emissive={COLORS.ACCENT_GREEN}
          emissiveIntensity={0.5}
        />
      </mesh>
      <mesh position={[-0.5, 0.4, 1.6]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshStandardMaterial
          color={COLORS.ACCENT_GREEN}
          emissive={COLORS.ACCENT_GREEN}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Wheels (4 corners) */}
      {[
        [0.7, 0.2, 1.0],                  // Front-right
        [-0.7, 0.2, 1.0],                 // Front-left
        [0.7, 0.2, -1.0],                 // Rear-right
        [-0.7, 0.2, -1.0],                // Rear-left
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 0.2, 8]} />
          <meshStandardMaterial color={COLORS.WHEEL_DARK} />
        </mesh>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// PRELOAD GLTF (call in parent component)
// ═══════════════════════════════════════════════════════════

export function preloadVehicleModel(path: string) {
  useGLTF.preload(path);
}
Key features:

enabledRotations={[false, true, false]} prevents vehicle flipping
Placeholder uses ~12 draw calls (voxel aesthetic)
GLTF loader auto-optimizes materials for mobile
Collider sized to match visual bounds


Next step: Touch input handler for steering and pedals.
Ready? (y/k)yJan 20Architected mobile input system with touch controlsArchitected mobile input system with touch controlsStep 6: Touch Input Handler
typescript// src/hooks/useTouchControls.ts

import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// TOUCH ZONE CONFIGURATION
// ═══════════════════════════════════════════════════════════

const TOUCH_CONFIG = {
  // Steering (drag anywhere in top 60% of screen)
  STEER_ZONE_HEIGHT: 0.6,                 // Top 60% for steering
  STEER_DEAD_ZONE: 10,                    // Pixels before registering input
  STEER_MAX_DRAG: 100,                    // Pixels for full lock (-1 or 1)
  
  // Pedals (bottom 40% split left/right)
  PEDAL_ZONE_HEIGHT: 0.4,                 // Bottom 40% for pedals
  PEDAL_DEAD_ZONE: 5,                     // Pixels before registering
  PEDAL_MAX_DRAG: 80,                     // Pixels for full throttle/brake
  
  // Sensitivity defaults
  DEFAULT_SENSITIVITY: 1.0,
};

// ═══════════════════════════════════════════════════════════
// TOUCH STATE TRACKING
// ═══════════════════════════════════════════════════════════

interface TouchState {
  id: number;                             // Touch identifier
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  zone: 'steer' | 'gas' | 'brake';
}

// ═══════════════════════════════════════════════════════════
// TOUCH CONTROLS HOOK
// ═══════════════════════════════════════════════════════════

export function useTouchControls() {
  // Store actions
  const setVehicleControls = useGameStore((s) => s.setVehicleControls);
  const sensitivity = useGameStore((s) => s.settings.steeringSensitivity);
  const invertSteering = useGameStore((s) => s.settings.invertSteering);
  const phase = useGameStore((s) => s.game.phase);

  // Track active touches (supports multi-touch)
  const activeTouches = useRef<Map<number, TouchState>>(new Map());
  
  // Current input values (updated per-frame)
  const inputState = useRef({ throttle: 0, brake: 0, steering: 0 });

  // ─────────────────────────────────────────────────────────
  // HELPER: Determine touch zone
  // ─────────────────────────────────────────────────────────

  const getZone = useCallback((x: number, y: number): TouchState['zone'] => {
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    const pedalZoneTop = screenHeight * (1 - TOUCH_CONFIG.PEDAL_ZONE_HEIGHT);

    // Bottom 40% = pedal zone
    if (y > pedalZoneTop) {
      // Left half = brake, Right half = gas
      return x < screenWidth / 2 ? 'brake' : 'gas';
    }

    // Top 60% = steering zone
    return 'steer';
  }, []);

  // ─────────────────────────────────────────────────────────
  // HELPER: Calculate input values from touches
  // ─────────────────────────────────────────────────────────

  const calculateInputs = useCallback(() => {
    let steering = 0;
    let throttle = 0;
    let brake = 0;

    activeTouches.current.forEach((touch) => {
      const deltaX = touch.currentX - touch.startX;
      const deltaY = touch.startY - touch.currentY;  // Inverted: up = positive

      switch (touch.zone) {
        case 'steer': {
          // Horizontal drag controls steering
          if (Math.abs(deltaX) > TOUCH_CONFIG.STEER_DEAD_ZONE) {
            const rawSteer = deltaX / TOUCH_CONFIG.STEER_MAX_DRAG;
            steering = Math.max(-1, Math.min(1, rawSteer * sensitivity));
            
            // Apply invert setting
            if (invertSteering) steering *= -1;
          }
          break;
        }

        case 'gas': {
          // Vertical drag (up = more gas)
          if (Math.abs(deltaY) > TOUCH_CONFIG.PEDAL_DEAD_ZONE) {
            const rawThrottle = deltaY / TOUCH_CONFIG.PEDAL_MAX_DRAG;
            throttle = Math.max(0, Math.min(1, rawThrottle));
          }
          break;
        }

        case 'brake': {
          // Vertical drag (up = more brake)
          if (Math.abs(deltaY) > TOUCH_CONFIG.PEDAL_DEAD_ZONE) {
            const rawBrake = deltaY / TOUCH_CONFIG.PEDAL_MAX_DRAG;
            brake = Math.max(0, Math.min(1, rawBrake));
          }
          break;
        }
      }
    });

    inputState.current = { throttle, brake, steering };
    setVehicleControls(throttle, brake, steering);
  }, [sensitivity, invertSteering, setVehicleControls]);

  // ─────────────────────────────────────────────────────────
  // TOUCH EVENT HANDLERS
  // ─────────────────────────────────────────────────────────

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Don't process input during quiz/pause
    if (phase !== 'driving') return;

    // Prevent default to avoid scrolling/zooming
    e.preventDefault();

    Array.from(e.changedTouches).forEach((touch) => {
      const zone = getZone(touch.clientX, touch.clientY);
      
      activeTouches.current.set(touch.identifier, {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        zone,
      });
    });

    calculateInputs();
  }, [phase, getZone, calculateInputs]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (phase !== 'driving') return;
    e.preventDefault();

    Array.from(e.changedTouches).forEach((touch) => {
      const existing = activeTouches.current.get(touch.identifier);
      if (existing) {
        existing.currentX = touch.clientX;
        existing.currentY = touch.clientY;
      }
    });

    calculateInputs();
  }, [phase, calculateInputs]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    Array.from(e.changedTouches).forEach((touch) => {
      activeTouches.current.delete(touch.identifier);
    });

    calculateInputs();
  }, [calculateInputs]);

  // ─────────────────────────────────────────────────────────
  // EVENT LISTENER SETUP
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    const options: AddEventListenerOptions = { passive: false };

    document.addEventListener('touchstart', handleTouchStart, options);
    document.addEventListener('touchmove', handleTouchMove, options);
    document.addEventListener('touchend', handleTouchEnd, options);
    document.addEventListener('touchcancel', handleTouchEnd, options);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  // ─────────────────────────────────────────────────────────
  // EXPOSE CURRENT INPUT (for UI indicators)
  // ─────────────────────────────────────────────────────────

  return {
    getInputState: () => inputState.current,
    activeTouchCount: () => activeTouches.current.size,
  };
}
typescript// src/components/UI/TouchOverlay.tsx

import { useTouchControls } from '../../hooks/useTouchControls';
import { useGameStore } from '../../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// VISUAL TOUCH OVERLAY (feedback indicators)
// ═══════════════════════════════════════════════════════════

export function TouchOverlay() {
  const phase = useGameStore((s) => s.game.phase);
  const { throttle, brake, steeringAngle } = useGameStore((s) => s.vehicle);

  // Hide during non-driving phases
  if (phase !== 'driving') return null;

  return (
    <div className="touch-overlay">
      {/* Steering indicator (top center) */}
      <div className="steer-indicator">
        <div
          className="steer-needle"
          style={{ transform: `rotate(${steeringAngle * 45}deg)` }}
        />
      </div>

      {/* Pedal zones (bottom) */}
      <div className="pedal-zone left">
        <div className="pedal-label">BRAKE</div>
        <div className="pedal-fill" style={{ height: `${brake * 100}%` }} />
      </div>

      <div className="pedal-zone right">
        <div className="pedal-label">GAS</div>
        <div className="pedal-fill" style={{ height: `${throttle * 100}%` }} />
      </div>
    </div>
  );
}
css/* src/components/UI/TouchOverlay.css */

.touch-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 100;
}

.steer-indicator {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 60px;
  border: 3px solid rgba(255, 0, 255, 0.5);
  border-radius: 50%;
}

.steer-needle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 24px;
  background: #39ff14;
  transform-origin: bottom center;
  transform: translateX(-50%);
}

.pedal-zone {
  position: absolute;
  bottom: 0;
  width: 30%;
  height: 35%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.pedal-zone.left { left: 5%; }
.pedal-zone.right { right: 5%; }

.pedal-label {
  position: absolute;
  top: 10px;
  width: 100%;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  font-weight: bold;
}

.pedal-fill {
  background: linear-gradient(to top, #39ff14, #ff00ff);
  opacity: 0.6;
  transition: height 0.05s ease-out;
}
Key features:

Multi-touch: steer while pressing gas simultaneously
Dead zones prevent accidental input
Visual feedback shows current input state
passive: false prevents iOS Safari bounce scroll


Next step: Chunk-based infinite road system.
Ready? (y/k)yJan 20Architected infinite road system with pooling and biome transitionsArchitected infinite road system with pooling and biome transitionsStep 7: Chunk-Based Infinite Road System
typescript// src/systems/RoadChunkManager.ts

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Group, InstancedMesh, Object3D, Matrix4 } from 'three';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// CHUNK CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CHUNK_CONFIG = {
  // Dimensions
  LENGTH: 100,                            // Meters per chunk (Z-axis)
  WIDTH: 20,                              // Road width (X-axis)
  
  // Pooling
  CHUNKS_AHEAD: 3,                        // Chunks visible in front
  CHUNKS_BEHIND: 1,                       // Chunks kept behind player
  POOL_SIZE: 5,                           // Total active chunks (3+1+buffer)
  
  // Biome transitions (miles from NYC)
  CITY_END_MILE: 200,                     // NYC → Highway transition
  HIGHWAY_END_MILE: 2200,                 // Highway → Rural transition
  TOTAL_MILES: 2800,                      // NYC to Spokane
  
  // Variation counts per biome
  VARIATIONS_PER_BIOME: 5,
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

type Biome = 'city' | 'highway' | 'rural';

interface ChunkData {
  id: number;                             // Unique chunk ID
  biome: Biome;
  variation: number;                      // 0-4 variation index
  zPosition: number;                      // World Z position
  active: boolean;
}

interface ChunkAssets {
  city: Group[];                          // 5 city variations
  highway: Group[];                       // 5 highway variations
  rural: Group[];                         // 5 rural variations
}

// ═══════════════════════════════════════════════════════════
// ASSET PATHS (GLTF models)
// ═══════════════════════════════════════════════════════════

const ASSET_PATHS: Record<Biome, string[]> = {
  city: [
    '/models/road/city_01.glb',
    '/models/road/city_02.glb',
    '/models/road/city_03.glb',
    '/models/road/city_04.glb',
    '/models/road/city_05.glb',
  ],
  highway: [
    '/models/road/highway_01.glb',
    '/models/road/highway_02.glb',
    '/models/road/highway_03.glb',
    '/models/road/highway_04.glb',
    '/models/road/highway_05.glb',
  ],
  rural: [
    '/models/road/rural_01.glb',
    '/models/road/rural_02.glb',
    '/models/road/rural_03.glb',
    '/models/road/rural_04.glb',
    '/models/road/rural_05.glb',
  ],
};

// ═══════════════════════════════════════════════════════════
// HELPER: Determine biome from mileage
// ═══════════════════════════════════════════════════════════

function getBiomeForMile(mile: number): Biome {
  if (mile < CHUNK_CONFIG.CITY_END_MILE) return 'city';
  if (mile < CHUNK_CONFIG.HIGHWAY_END_MILE) return 'highway';
  return 'rural';
}

// ═══════════════════════════════════════════════════════════
// HELPER: Convert Z position to approximate mile
// ═══════════════════════════════════════════════════════════

function zToMile(z: number): number {
  // 1 mile ≈ 1609 meters, but we compress for gameplay
  // Using 1 chunk (100m) = ~2 miles for pacing
  return Math.abs(z) / CHUNK_CONFIG.LENGTH * 2;
}

// ═══════════════════════════════════════════════════════════
// ROAD CHUNK MANAGER HOOK
// ═══════════════════════════════════════════════════════════

export function useRoadChunkManager() {
  // Store
  const playerZ = useGameStore((s) => s.vehicle.position[2]);
  const mileage = useGameStore((s) => s.game.mileage);
  const setBiome = useGameStore((s) => s.setBiome);

  // Chunk pool
  const chunks = useRef<ChunkData[]>([]);
  const nextChunkId = useRef(0);
  const lastPlayerChunk = useRef(0);

  // ─────────────────────────────────────────────────────────
  // INITIALIZE CHUNK POOL
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    // Create initial chunks around spawn point
    const initialChunks: ChunkData[] = [];
    
    for (let i = -CHUNK_CONFIG.CHUNKS_BEHIND; i <= CHUNK_CONFIG.CHUNKS_AHEAD; i++) {
      const zPos = i * CHUNK_CONFIG.LENGTH;
      const mile = zToMile(zPos);
      const biome = getBiomeForMile(mile);
      
      initialChunks.push({
        id: nextChunkId.current++,
        biome,
        variation: Math.floor(Math.random() * CHUNK_CONFIG.VARIATIONS_PER_BIOME),
        zPosition: zPos,
        active: true,
      });
    }

    chunks.current = initialChunks;
  }, []);

  // ─────────────────────────────────────────────────────────
  // UPDATE CHUNKS BASED ON PLAYER POSITION
  // ─────────────────────────────────────────────────────────

  useFrame(() => {
    // Determine which chunk player is in
    const playerChunkIndex = Math.floor(playerZ / CHUNK_CONFIG.LENGTH);

    // Only update when crossing chunk boundary
    if (playerChunkIndex === lastPlayerChunk.current) return;
    lastPlayerChunk.current = playerChunkIndex;

    // Calculate visible range
    const minVisibleZ = (playerChunkIndex - CHUNK_CONFIG.CHUNKS_BEHIND) * CHUNK_CONFIG.LENGTH;
    const maxVisibleZ = (playerChunkIndex + CHUNK_CONFIG.CHUNKS_AHEAD) * CHUNK_CONFIG.LENGTH;

    // Update biome in store
    const currentBiome = getBiomeForMile(mileage);
    setBiome(currentBiome);

    // Recycle chunks outside visible range
    chunks.current.forEach((chunk) => {
      if (chunk.zPosition < minVisibleZ || chunk.zPosition > maxVisibleZ) {
        chunk.active = false;
      }
    });

    // Spawn new chunks to fill gaps
    for (let z = minVisibleZ; z <= maxVisibleZ; z += CHUNK_CONFIG.LENGTH) {
      const exists = chunks.current.some(
        (c) => c.active && Math.abs(c.zPosition - z) < 1
      );

      if (!exists) {
        // Find inactive chunk to recycle, or create new
        let recycled = chunks.current.find((c) => !c.active);

        if (!recycled) {
          recycled = {
            id: nextChunkId.current++,
            biome: 'city',
            variation: 0,
            zPosition: 0,
            active: false,
          };
          chunks.current.push(recycled);
        }

        // Configure recycled chunk
        const mile = zToMile(z) + mileage;  // Add current progress
        recycled.biome = getBiomeForMile(mile);
        recycled.variation = Math.floor(Math.random() * CHUNK_CONFIG.VARIATIONS_PER_BIOME);
        recycled.zPosition = z;
        recycled.active = true;
      }
    }
  });

  return {
    getActiveChunks: () => chunks.current.filter((c) => c.active),
    config: CHUNK_CONFIG,
  };
}
typescript// src/components/Road/RoadChunks.tsx

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useRoadChunkManager, CHUNK_CONFIG } from '../../systems/RoadChunkManager';

// ═══════════════════════════════════════════════════════════
// ROAD CHUNKS RENDERER
// ═══════════════════════════════════════════════════════════

export function RoadChunks() {
  const { getActiveChunks, config } = useRoadChunkManager();
  const activeChunks = getActiveChunks();

  return (
    <group name="road-chunks">
      {activeChunks.map((chunk) => (
        <RoadChunk
          key={chunk.id}
          biome={chunk.biome}
          variation={chunk.variation}
          position={[0, 0, chunk.zPosition]}
        />
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// INDIVIDUAL ROAD CHUNK
// ═══════════════════════════════════════════════════════════

interface RoadChunkProps {
  biome: 'city' | 'highway' | 'rural';
  variation: number;
  position: [number, number, number];
}

function RoadChunk({ biome, variation, position }: RoadChunkProps) {
  // For now, use placeholder geometry
  // Replace with: const { scene } = useGLTF(ASSET_PATHS[biome][variation]);

  return (
    <group position={position}>
      {/* Ground collision (static) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider
          args={[CHUNK_CONFIG.WIDTH / 2, 0.1, CHUNK_CONFIG.LENGTH / 2]}
          position={[0, -0.1, CHUNK_CONFIG.LENGTH / 2]}
        />
      </RigidBody>

      {/* Visual placeholder */}
      <PlaceholderChunk biome={biome} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// PLACEHOLDER CHUNK (dev/fallback)
// ═══════════════════════════════════════════════════════════

const BIOME_COLORS = {
  city: { road: '#333333', side: '#1a1a1a', accent: '#ff00ff' },
  highway: { road: '#444444', side: '#2d4a2d', accent: '#39ff14' },
  rural: { road: '#555555', side: '#3d2d1d', accent: '#ffaa00' },
};

function PlaceholderChunk({ biome }: { biome: 'city' | 'highway' | 'rural' }) {
  const colors = BIOME_COLORS[biome];
  const length = CHUNK_CONFIG.LENGTH;
  const width = CHUNK_CONFIG.WIDTH;

  return (
    <group>
      {/* Road surface */}
      <mesh position={[0, 0, length / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width * 0.6, length]} />
        <meshStandardMaterial color={colors.road} />
      </mesh>

      {/* Road shoulders/sides */}
      <mesh position={[-width * 0.4, 0, length / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width * 0.2, length]} />
        <meshStandardMaterial color={colors.side} />
      </mesh>
      <mesh position={[width * 0.4, 0, length / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width * 0.2, length]} />
        <meshStandardMaterial color={colors.side} />
      </mesh>

      {/* Center line (dashed effect via segments) */}
      {Array.from({ length: 10 }).map((_, i) => (
        <mesh key={i} position={[0, 0.01, i * 10 + 5]}>
          <boxGeometry args={[0.15, 0.02, 4]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}

      {/* Edge lines */}
      <mesh position={[-width * 0.28, 0.01, length / 2]}>
        <boxGeometry args={[0.1, 0.02, length]} />
        <meshStandardMaterial color={colors.accent} emissive={colors.accent} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[width * 0.28, 0.01, length / 2]}>
        <boxGeometry args={[0.1, 0.02, length]} />
        <meshStandardMaterial color={colors.accent} emissive={colors.accent} emissiveIntensity={0.3} />
      </mesh>

      {/* Biome-specific decorations */}
      {biome === 'city' && <CityDecorations length={length} />}
      {biome === 'highway' && <HighwayDecorations length={length} />}
      {biome === 'rural' && <RuralDecorations length={length} />}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// BIOME DECORATIONS (low-poly placeholders)
// ═══════════════════════════════════════════════════════════

function CityDecorations({ length }: { length: number }) {
  // Buildings on sides
  return (
    <group>
      {[0, 25, 50, 75].map((z) => (
        <group key={z}>
          <mesh position={[-12, 4, z]} castShadow>
            <boxGeometry args={[6, 8, 8]} />
            <meshStandardMaterial color="#2a2a3a" />
          </mesh>
          <mesh position={[12, 3, z + 10]} castShadow>
            <boxGeometry args={[5, 6, 6]} />
            <meshStandardMaterial color="#3a2a4a" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function HighwayDecorations({ length }: { length: number }) {
  // Barriers and signs
  return (
    <group>
      {/* Guard rails */}
      <mesh position={[-8, 0.4, length / 2]}>
        <boxGeometry args={[0.2, 0.8, length]} />
        <meshStandardMaterial color="#666666" />
      </mesh>
      <mesh position={[8, 0.4, length / 2]}>
        <boxGeometry args={[0.2, 0.8, length]} />
        <meshStandardMaterial color="#666666" />
      </mesh>
    </group>
  );
}

function RuralDecorations({ length }: { length: number }) {
  // Trees and fences
  return (
    <group>
      {[10, 40, 70].map((z) => (
        <group key={z}>
          {/* Simple tree (trunk + foliage) */}
          <mesh position={[-10, 1.5, z]} castShadow>
            <cylinderGeometry args={[0.3, 0.4, 3, 6]} />
            <meshStandardMaterial color="#4a3728" />
          </mesh>
          <mesh position={[-10, 4, z]} castShadow>
            <coneGeometry args={[2, 4, 6]} />
            <meshStandardMaterial color="#2d5a2d" />
          </mesh>
        </group>
      ))}
    </group>
  );
}
Key features:

Object pooling recycles chunks (zero allocation during play)
Biome auto-transitions based on mileage progress
Static colliders for ground (no physics overhead)
Seamless stitching via consistent chunk length


Next step: Traffic Manager with instanced NPC vehicles.
Ready? (y/k)yJan 20Architected traffic management system with instanced NPC vehiclesArchitected traffic management system with instanced NPC vehiclesStep 8: Traffic Manager with Instanced NPCs
typescript// src/systems/TrafficManager.ts

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  InstancedMesh,
  Object3D,
  Matrix4,
  Vector3,
  Color,
  MeshStandardMaterial,
  BoxGeometry,
} from 'three';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// TRAFFIC CONFIGURATION
// ═══════════════════════════════════════════════════════════

const TRAFFIC_CONFIG = {
  // Pool size
  MAX_VEHICLES: 8,                        // Hard limit for performance
  MIN_VEHICLES: 5,                        // Minimum active
  
  // Spawn parameters
  SPAWN_AHEAD_MIN: 50,                    // Meters ahead of player (min)
  SPAWN_AHEAD_MAX: 150,                   // Meters ahead of player (max)
  DESPAWN_BEHIND: 30,                     // Meters behind player to despawn
  DESPAWN_AHEAD: 200,                     // Too far ahead = despawn
  
  // Lane configuration
  LANE_WIDTH: 3.5,                        // Meters per lane
  LANES: [-1, 0, 1],                      // Left, center, right (relative)
  
  // Speed (meters per second)
  SPEED_MIN: 15,                          // ~34 MPH (slower traffic)
  SPEED_MAX: 22,                          // ~49 MPH (faster traffic)
  PLAYER_APPROACH_SLOW: 0.7,              // Slow to 70% when player near
  
  // Behavior
  LANE_CHANGE_CHANCE: 0.002,              // Per-frame probability
  LANE_CHANGE_DURATION: 2.0,              // Seconds to complete lane change
  MIN_FOLLOW_DISTANCE: 15,                // Meters behind another NPC
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface NPCVehicle {
  id: number;
  active: boolean;
  
  // Position & movement
  position: Vector3;
  targetLane: number;                     // -1, 0, or 1
  currentLaneX: number;                   // Actual X position (smooth)
  speed: number;                          // Current speed m/s
  baseSpeed: number;                      // Desired speed m/s
  
  // Lane change state
  isChangingLane: boolean;
  laneChangeProgress: number;             // 0 to 1
  laneChangeFrom: number;
  
  // Visual variation
  colorIndex: number;
  scaleVariation: number;
}

// ═══════════════════════════════════════════════════════════
// NPC COLOR PALETTE (voxel aesthetic)
// ═══════════════════════════════════════════════════════════

const NPC_COLORS = [
  '#ff6b6b',                              // Coral red
  '#4ecdc4',                              // Teal
  '#ffe66d',                              // Yellow
  '#95e1d3',                              // Mint
  '#f38181',                              // Salmon
  '#aa96da',                              // Lavender
  '#fcbad3',                              // Pink
  '#a8d8ea',                              // Sky blue
];

// ═══════════════════════════════════════════════════════════
// TRAFFIC MANAGER HOOK
// ═══════════════════════════════════════════════════════════

export function useTrafficManager() {
  // Store
  const playerPos = useGameStore((s) => s.vehicle.position);
  const playerVelocity = useGameStore((s) => s.vehicle.velocity);
  const phase = useGameStore((s) => s.game.phase);

  // NPC pool
  const vehicles = useRef<NPCVehicle[]>([]);
  const nextId = useRef(0);

  // Reusable objects (avoid GC)
  const tempMatrix = useMemo(() => new Matrix4(), []);
  const tempObject = useMemo(() => new Object3D(), []);

  // ─────────────────────────────────────────────────────────
  // INITIALIZE VEHICLE POOL
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    vehicles.current = Array.from({ length: TRAFFIC_CONFIG.MAX_VEHICLES }, (_, i) => ({
      id: nextId.current++,
      active: false,
      position: new Vector3(),
      targetLane: 0,
      currentLaneX: 0,
      speed: 0,
      baseSpeed: 0,
      isChangingLane: false,
      laneChangeProgress: 0,
      laneChangeFrom: 0,
      colorIndex: i % NPC_COLORS.length,
      scaleVariation: 0.9 + Math.random() * 0.2,  // 0.9 to 1.1
    }));
  }, []);

  // ─────────────────────────────────────────────────────────
  // HELPER: Spawn new NPC
  // ─────────────────────────────────────────────────────────

  const spawnVehicle = (playerZ: number): NPCVehicle | null => {
    // Find inactive slot
    const slot = vehicles.current.find((v) => !v.active);
    if (!slot) return null;

    // Random lane
    const lane = TRAFFIC_CONFIG.LANES[
      Math.floor(Math.random() * TRAFFIC_CONFIG.LANES.length)
    ];
    const laneX = lane * TRAFFIC_CONFIG.LANE_WIDTH;

    // Random spawn distance ahead
    const spawnDistance =
      TRAFFIC_CONFIG.SPAWN_AHEAD_MIN +
      Math.random() * (TRAFFIC_CONFIG.SPAWN_AHEAD_MAX - TRAFFIC_CONFIG.SPAWN_AHEAD_MIN);

    // Configure vehicle
    slot.active = true;
    slot.position.set(laneX, 0.5, playerZ - spawnDistance);  // Negative Z = forward
    slot.targetLane = lane;
    slot.currentLaneX = laneX;
    slot.baseSpeed =
      TRAFFIC_CONFIG.SPEED_MIN +
      Math.random() * (TRAFFIC_CONFIG.SPEED_MAX - TRAFFIC_CONFIG.SPEED_MIN);
    slot.speed = slot.baseSpeed;
    slot.isChangingLane = false;
    slot.laneChangeProgress = 0;
    slot.colorIndex = Math.floor(Math.random() * NPC_COLORS.length);

    return slot;
  };

  // ─────────────────────────────────────────────────────────
  // HELPER: Check if lane is clear for lane change
  // ─────────────────────────────────────────────────────────

  const isLaneClear = (vehicle: NPCVehicle, targetLane: number): boolean => {
    const targetX = targetLane * TRAFFIC_CONFIG.LANE_WIDTH;

    for (const other of vehicles.current) {
      if (!other.active || other.id === vehicle.id) continue;

      // Check if other vehicle is in target lane and nearby
      const xDiff = Math.abs(other.currentLaneX - targetX);
      const zDiff = Math.abs(other.position.z - vehicle.position.z);

      if (xDiff < TRAFFIC_CONFIG.LANE_WIDTH * 0.5 && zDiff < TRAFFIC_CONFIG.MIN_FOLLOW_DISTANCE) {
        return false;
      }
    }

    return true;
  };

  // ─────────────────────────────────────────────────────────
  // MAIN UPDATE LOOP
  // ─────────────────────────────────────────────────────────

  const update = (delta: number) => {
    if (phase !== 'driving') return;

    const playerZ = playerPos[2];
    const clampedDelta = Math.min(delta, 0.05);  // Cap at 50ms

    let activeCount = 0;

    vehicles.current.forEach((vehicle) => {
      if (!vehicle.active) return;

      // ─────────────────────────────────────────────────────
      // DESPAWN CHECK
      // ─────────────────────────────────────────────────────

      const distanceBehind = vehicle.position.z - playerZ;
      const distanceAhead = playerZ - vehicle.position.z;

      if (distanceBehind > TRAFFIC_CONFIG.DESPAWN_BEHIND ||
          distanceAhead > TRAFFIC_CONFIG.DESPAWN_AHEAD) {
        vehicle.active = false;
        return;
      }

      activeCount++;

      // ─────────────────────────────────────────────────────
      // SPEED ADJUSTMENT (slow when player approaches)
      // ─────────────────────────────────────────────────────

      const playerMps = playerVelocity * 0.44704;  // MPH to m/s
      const relativeApproach = playerMps - vehicle.speed;

      if (distanceAhead < 30 && distanceAhead > 0 && relativeApproach > 5) {
        // Player catching up fast - slow down
        vehicle.speed = vehicle.baseSpeed * TRAFFIC_CONFIG.PLAYER_APPROACH_SLOW;
      } else {
        // Gradually return to base speed
        vehicle.speed += (vehicle.baseSpeed - vehicle.speed) * 0.02;
      }

      // ─────────────────────────────────────────────────────
      // LANE CHANGE AI
      // ─────────────────────────────────────────────────────

      if (!vehicle.isChangingLane) {
        // Random chance to initiate lane change
        if (Math.random() < TRAFFIC_CONFIG.LANE_CHANGE_CHANCE) {
          // Pick adjacent lane
          const possibleLanes = TRAFFIC_CONFIG.LANES.filter(
            (l) => Math.abs(l - vehicle.targetLane) === 1
          );

          if (possibleLanes.length > 0) {
            const newLane = possibleLanes[Math.floor(Math.random() * possibleLanes.length)];

            if (isLaneClear(vehicle, newLane)) {
              vehicle.isChangingLane = true;
              vehicle.laneChangeFrom = vehicle.targetLane;
              vehicle.targetLane = newLane;
              vehicle.laneChangeProgress = 0;
            }
          }
        }
      }

      // ─────────────────────────────────────────────────────
      // LANE CHANGE EXECUTION (smooth interpolation)
      // ─────────────────────────────────────────────────────

      if (vehicle.isChangingLane) {
        vehicle.laneChangeProgress += clampedDelta / TRAFFIC_CONFIG.LANE_CHANGE_DURATION;

        if (vehicle.laneChangeProgress >= 1) {
          vehicle.laneChangeProgress = 1;
          vehicle.isChangingLane = false;
        }

        // Smooth S-curve interpolation
        const t = vehicle.laneChangeProgress;
        const smoothT = t * t * (3 - 2 * t);  // Smoothstep

        const fromX = vehicle.laneChangeFrom * TRAFFIC_CONFIG.LANE_WIDTH;
        const toX = vehicle.targetLane * TRAFFIC_CONFIG.LANE_WIDTH;
        vehicle.currentLaneX = fromX + (toX - fromX) * smoothT;
      }

      // ─────────────────────────────────────────────────────
      // POSITION UPDATE
      // ─────────────────────────────────────────────────────

      vehicle.position.x = vehicle.currentLaneX;
      vehicle.position.z -= vehicle.speed * clampedDelta;  // Move forward (-Z)
    });

    // ─────────────────────────────────────────────────────────
    // SPAWN NEW VEHICLES IF UNDER MINIMUM
    // ─────────────────────────────────────────────────────────

    while (activeCount < TRAFFIC_CONFIG.MIN_VEHICLES) {
      const spawned = spawnVehicle(playerZ);
      if (!spawned) break;  // Pool exhausted
      activeCount++;
    }
  };

  // ─────────────────────────────────────────────────────────
  // GET INSTANCE DATA FOR RENDERER
  // ─────────────────────────────────────────────────────────

  const getInstanceData = () => {
    return vehicles.current
      .filter((v) => v.active)
      .map((v) => ({
        position: v.position,
        colorIndex: v.colorIndex,
        scale: v.scaleVariation,
      }));
  };

  return { update, getInstanceData, config: TRAFFIC_CONFIG };
}
typescript// src/components/Traffic/TrafficRenderer.tsx

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  InstancedMesh,
  Object3D,
  Color,
  BoxGeometry,
  MeshStandardMaterial,
} from 'three';
import { useTrafficManager, NPC_COLORS } from '../../systems/TrafficManager';

// ═══════════════════════════════════════════════════════════
// TRAFFIC RENDERER (instanced meshes)
// ═══════════════════════════════════════════════════════════

export function TrafficRenderer() {
  const instanceRef = useRef<InstancedMesh>(null);
  const { update, getInstanceData, config } = useTrafficManager();

  // Reusable transform object
  const tempObject = useMemo(() => new Object3D(), []);
  const tempColor = useMemo(() => new Color(), []);

  // Pre-create geometry and material (shared across instances)
  const geometry = useMemo(() => {
    // Simple voxel car: box body
    return new BoxGeometry(1.6, 0.8, 3.2);
  }, []);

  const material = useMemo(() => {
    return new MeshStandardMaterial({
      roughness: 0.7,
      metalness: 0.1,
    });
  }, []);

  // ─────────────────────────────────────────────────────────
  // UPDATE LOOP
  // ─────────────────────────────────────────────────────────

  useFrame((_, delta) => {
    // Update traffic AI
    update(delta);

    // Update instance transforms
    const mesh = instanceRef.current;
    if (!mesh) return;

    const instances = getInstanceData();

    instances.forEach((data, i) => {
      // Set position
      tempObject.position.copy(data.position);
      tempObject.position.y = 0.5;  // Ground offset

      // Set scale (slight variation)
      tempObject.scale.setScalar(data.scale);

      // Face forward (-Z direction)
      tempObject.rotation.set(0, 0, 0);

      // Apply transform to instance
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);

      // Set color
      tempColor.set(NPC_COLORS[data.colorIndex]);
      mesh.setColorAt(i, tempColor);
    });

    // Hide unused instances (move off-screen)
    for (let i = instances.length; i < config.MAX_VEHICLES; i++) {
      tempObject.position.set(0, -100, 0);  // Underground
      tempObject.updateMatrix();
      mesh.setMatrixAt(i, tempObject.matrix);
    }

    // Flag updates
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={instanceRef}
      args={[geometry, material, config.MAX_VEHICLES]}
      castShadow
      receiveShadow
    >
      {/* Geometry and material applied via args */}
    </instancedMesh>
  );
}
typescript// src/components/Traffic/NPCVehicleMesh.tsx

import { useMemo } from 'react';
import { BoxGeometry, MeshStandardMaterial } from 'three';

// ═══════════════════════════════════════════════════════════
// DETAILED NPC MESH (for close-up or future LOD)
// ═══════════════════════════════════════════════════════════

export function NPCVehicleMesh({ color }: { color: string }) {
  return (
    <group>
      {/* Main body */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[1.6, 0.6, 3.2]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Cabin */}
      <mesh position={[0, 0.85, -0.2]} castShadow>
        <boxGeometry args={[1.4, 0.4, 1.4]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Windshield (dark) */}
      <mesh position={[0, 0.85, 0.6]}>
        <boxGeometry args={[1.2, 0.35, 0.1]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* Rear window (dark) */}
      <mesh position={[0, 0.85, -1.0]}>
        <boxGeometry args={[1.2, 0.35, 0.1]} />
        <meshStandardMaterial color="#1a1a2e" />
      </mesh>

      {/* Wheels (4 corners) */}
      {[
        [0.7, 0.2, 1.0],
        [-0.7, 0.2, 1.0],
        [0.7, 0.2, -1.0],
        [-0.7, 0.2, -1.0],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.25, 0.25, 0.2, 8]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      ))}

      {/* Taillights (red) */}
      <mesh position={[0.6, 0.4, -1.6]}>
        <boxGeometry args={[0.2, 0.15, 0.05]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[-0.6, 0.4, -1.6]}>
        <boxGeometry args={[0.2, 0.15, 0.05]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}
Key features:

Single InstancedMesh = 1 draw call for all 8 NPCs
Object pooling with zero runtime allocation
Smoothstep lane changes for natural movement
NPCs slow down when player approaches from behind
Color variation adds visual interest


Next step: Quiz Event System with mileage triggers and JSON loading.
Ready? (y/k)yJan 20Architected comprehensive quiz system with mileage triggersArchitected comprehensive quiz system with mileage triggersStep 9: Quiz Event System
typescript// src/systems/QuizManager.ts

import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// QUIZ CONFIGURATION
// ═══════════════════════════════════════════════════════════

const QUIZ_CONFIG = {
  // Trigger frequency
  MILES_BETWEEN_QUIZZES: 20,              // Quiz every ~20 miles
  INITIAL_GRACE_MILES: 5,                 // No quiz for first 5 miles
  
  // Timing
  ANSWER_FEEDBACK_MS: 1500,               // Show correct/wrong for 1.5s
  AUTO_CLOSE_MS: 3000,                    // Auto-close if no interaction
  
  // Rewards (base values, streak applied in store)
  BASE_REWARD: 10,                        // Z-Coins for correct answer
  WRONG_PENALTY: 0,                       // No penalty (educational focus)
  
  // Categories (mapped to WA DOL sections)
  CATEGORIES: [
    'signs',
    'right-of-way',
    'speed-limits',
    'parking',
    'intersections',
    'emergencies',
    'impaired-driving',
    'sharing-road',
  ],
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface QuizQuestion {
  id: string;
  category: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;                   // Shown after answering
  difficulty?: 'easy' | 'medium' | 'hard';
}

interface QuizBank {
  version: string;
  totalQuestions: number;
  questions: QuizQuestion[];
}

// ═══════════════════════════════════════════════════════════
// QUIZ MANAGER HOOK
// ═══════════════════════════════════════════════════════════

export function useQuizManager() {
  // Store
  const mileage = useGameStore((s) => s.game.mileage);
  const lastQuizMile = useGameStore((s) => s.game.lastQuizMile);
  const phase = useGameStore((s) => s.game.phase);
  const triggerQuiz = useGameStore((s) => s.triggerQuiz);
  const questionsAnswered = useGameStore((s) => s.quiz.questionsAnswered);

  // Question bank
  const questionBank = useRef<QuizQuestion[]>([]);
  const usedQuestionIds = useRef<Set<string>>(new Set());
  const isLoaded = useRef(false);

  // ─────────────────────────────────────────────────────────
  // LOAD QUESTION BANK FROM JSON
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadQuestions() {
      try {
        // Load from public directory (sideloaded JSON)
        const response = await fetch('/data/questions.json');
        
        if (!response.ok) {
          throw new Error(`Failed to load questions: ${response.status}`);
        }

        const data: QuizBank = await response.json();
        questionBank.current = data.questions;
        isLoaded.current = true;

        console.log(`[QuizManager] Loaded ${data.totalQuestions} questions`);
      } catch (error) {
        console.error('[QuizManager] Error loading questions:', error);
        
        // Fallback to embedded sample questions
        questionBank.current = FALLBACK_QUESTIONS;
        isLoaded.current = true;
      }
    }

    loadQuestions();
  }, []);

  // ─────────────────────────────────────────────────────────
  // SELECT NEXT QUESTION (weighted by category coverage)
  // ─────────────────────────────────────────────────────────

  const selectQuestion = useCallback((): QuizQuestion | null => {
    if (!isLoaded.current || questionBank.current.length === 0) {
      return null;
    }

    // Filter out already-used questions
    const available = questionBank.current.filter(
      (q) => !usedQuestionIds.current.has(q.id)
    );

    // Reset if we've used all questions
    if (available.length === 0) {
      usedQuestionIds.current.clear();
      return selectQuestion();  // Recurse with fresh pool
    }

    // Weight by category to ensure coverage
    // (prefer categories with fewer answered questions)
    const categoryCount = new Map<string, number>();
    usedQuestionIds.current.forEach((id) => {
      const q = questionBank.current.find((x) => x.id === id);
      if (q) {
        categoryCount.set(q.category, (categoryCount.get(q.category) || 0) + 1);
      }
    });

    // Sort available by least-used category
    const sorted = [...available].sort((a, b) => {
      const countA = categoryCount.get(a.category) || 0;
      const countB = categoryCount.get(b.category) || 0;
      return countA - countB;
    });

    // Pick from top 20% least-used categories (with randomness)
    const poolSize = Math.max(1, Math.floor(sorted.length * 0.2));
    const selected = sorted[Math.floor(Math.random() * poolSize)];

    // Mark as used
    usedQuestionIds.current.add(selected.id);

    return selected;
  }, []);

  // ─────────────────────────────────────────────────────────
  // CHECK TRIGGER CONDITIONS
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    // Only trigger during driving phase
    if (phase !== 'driving') return;

    // Grace period at start
    if (mileage < QUIZ_CONFIG.INITIAL_GRACE_MILES) return;

    // Check if we've traveled enough since last quiz
    const milesSinceLastQuiz = mileage - lastQuizMile;
    
    if (milesSinceLastQuiz >= QUIZ_CONFIG.MILES_BETWEEN_QUIZZES) {
      const question = selectQuestion();
      
      if (question) {
        triggerQuiz(question);
      }
    }
  }, [mileage, lastQuizMile, phase, selectQuestion, triggerQuiz]);

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  return {
    isLoaded: isLoaded.current,
    totalQuestions: questionBank.current.length,
    questionsRemaining: questionBank.current.length - usedQuestionIds.current.size,
    config: QUIZ_CONFIG,
  };
}

// ═══════════════════════════════════════════════════════════
// FALLBACK QUESTIONS (if JSON fails to load)
// ═══════════════════════════════════════════════════════════

const FALLBACK_QUESTIONS: QuizQuestion[] = [
  {
    id: 'fb-001',
    category: 'signs',
    question: 'What does a red octagonal sign mean?',
    options: ['Yield', 'Stop completely', 'Slow down', 'No entry'],
    correctIndex: 1,
    explanation: 'A red octagon always means STOP. Come to a complete stop at the marked line.',
  },
  {
    id: 'fb-002',
    category: 'right-of-way',
    question: 'At a four-way stop, who goes first?',
    options: [
      'The largest vehicle',
      'The vehicle on the right',
      'The first vehicle to arrive',
      'The vehicle going straight',
    ],
    correctIndex: 2,
    explanation: 'The first vehicle to arrive at the intersection goes first. If two arrive at the same time, yield to the right.',
  },
  {
    id: 'fb-003',
    category: 'speed-limits',
    question: 'What is the default speed limit in a school zone when children are present?',
    options: ['15 MPH', '20 MPH', '25 MPH', '30 MPH'],
    correctIndex: 1,
    explanation: 'In Washington State, the speed limit in school zones is 20 MPH when children are present.',
  },
  {
    id: 'fb-004',
    category: 'parking',
    question: 'How far must you park from a fire hydrant?',
    options: ['10 feet', '15 feet', '20 feet', '25 feet'],
    correctIndex: 1,
    explanation: 'You must park at least 15 feet from a fire hydrant to allow emergency access.',
  },
  {
    id: 'fb-005',
    category: 'intersections',
    question: 'What should you do at a flashing yellow light?',
    options: [
      'Stop completely',
      'Proceed with caution',
      'Speed up to clear intersection',
      'Treat as a stop sign',
    ],
    correctIndex: 1,
    explanation: 'A flashing yellow light means proceed with caution. Slow down and be alert.',
  },
];
typescript// src/components/Quiz/QuizOverlay.tsx

import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { QUIZ_CONFIG } from '../../systems/QuizManager';
import './QuizOverlay.css';

// ═══════════════════════════════════════════════════════════
// QUIZ OVERLAY COMPONENT
// ═══════════════════════════════════════════════════════════

export function QuizOverlay() {
  // Store
  const isActive = useGameStore((s) => s.quiz.isActive);
  const question = useGameStore((s) => s.quiz.currentQuestion);
  const streak = useGameStore((s) => s.economy.streak);
  const answerQuiz = useGameStore((s) => s.answerQuiz);
  const closeQuiz = useGameStore((s) => s.closeQuiz);

  // Local state
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  // ─────────────────────────────────────────────────────────
  // RESET STATE WHEN NEW QUESTION APPEARS
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (isActive && question) {
      setSelectedIndex(null);
      setIsCorrect(null);
      setShowFeedback(false);
    }
  }, [isActive, question?.id]);

  // ─────────────────────────────────────────────────────────
  // HANDLE ANSWER SELECTION
  // ─────────────────────────────────────────────────────────

  const handleAnswer = useCallback((index: number) => {
    if (selectedIndex !== null) return;  // Already answered

    setSelectedIndex(index);
    const correct = answerQuiz(index);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Auto-close after feedback delay
    setTimeout(() => {
      closeQuiz();
    }, QUIZ_CONFIG.ANSWER_FEEDBACK_MS);
  }, [selectedIndex, answerQuiz, closeQuiz]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  if (!isActive || !question) return null;

  const streakBonus = Math.min(streak * 5, 50);
  const potentialReward = QUIZ_CONFIG.BASE_REWARD + streakBonus;

  return (
    <div className="quiz-overlay">
      <div className="quiz-modal">
        {/* Header */}
        <div className="quiz-header">
          <span className="quiz-category">{formatCategory(question.category)}</span>
          {streak > 0 && (
            <span className="quiz-streak">🔥 {streak} streak</span>
          )}
        </div>

        {/* Question */}
        <div className="quiz-question">
          {question.question}
        </div>

        {/* Options */}
        <div className="quiz-options">
          {question.options.map((option, index) => (
            <button
              key={index}
              className={getOptionClass(index, selectedIndex, question.correctIndex, showFeedback)}
              onClick={() => handleAnswer(index)}
              disabled={selectedIndex !== null}
            >
              <span className="option-letter">{String.fromCharCode(65 + index)}</span>
              <span className="option-text">{option}</span>
            </button>
          ))}
        </div>

        {/* Feedback */}
        {showFeedback && (
          <div className={`quiz-feedback ${isCorrect ? 'correct' : 'incorrect'}`}>
            {isCorrect ? (
              <>
                <span className="feedback-icon">✓</span>
                <span className="feedback-text">대박! +{potentialReward} Z-Coins</span>
              </>
            ) : (
              <>
                <span className="feedback-icon">✗</span>
                <span className="feedback-text">아이고! The answer was {String.fromCharCode(65 + question.correctIndex)}</span>
              </>
            )}
            {question.explanation && (
              <p className="feedback-explanation">{question.explanation}</p>
            )}
          </div>
        )}

        {/* Reward preview (before answering) */}
        {!showFeedback && (
          <div className="quiz-reward-preview">
            <span>Potential reward: {potentialReward} Z-Coins</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function formatCategory(category: string): string {
  return category
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getOptionClass(
  index: number,
  selectedIndex: number | null,
  correctIndex: number,
  showFeedback: boolean
): string {
  let className = 'quiz-option';

  if (!showFeedback) {
    if (selectedIndex === index) {
      className += ' selected';
    }
    return className;
  }

  // Show feedback states
  if (index === correctIndex) {
    className += ' correct';
  } else if (index === selectedIndex) {
    className += ' incorrect';
  } else {
    className += ' dimmed';
  }

  return className;
}
css/* src/components/Quiz/QuizOverlay.css */

.quiz-overlay {
  position: fixed;
  inset: 0;
  background: rgba(18, 18, 18, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  animation: fadeIn 0.2s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.quiz-modal {
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border: 2px solid #ff00ff;
  border-radius: 16px;
  padding: 24px;
  max-width: 500px;
  width: 100%;
  box-shadow: 0 0 30px rgba(255, 0, 255, 0.3);
}

.quiz-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.quiz-category {
  background: rgba(57, 255, 20, 0.2);
  color: #39ff14;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
}

.quiz-streak {
  color: #ff6b6b;
  font-size: 14px;
  font-weight: bold;
}

.quiz-question {
  color: #ffffff;
  font-size: 18px;
  line-height: 1.5;
  margin-bottom: 24px;
  text-align: center;
}

.quiz-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quiz-option {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 14px 16px;
  color: #ffffff;
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}

.quiz-option:hover:not(:disabled) {
  border-color: #ff00ff;
  background: rgba(255, 0, 255, 0.1);
}

.quiz-option:disabled {
  cursor: default;
}

.quiz-option.selected {
  border-color: #ff00ff;
  background: rgba(255, 0, 255, 0.2);
}

.quiz-option.correct {
  border-color: #39ff14;
  background: rgba(57, 255, 20, 0.2);
  animation: pulse-correct 0.3s ease;
}

.quiz-option.incorrect {
  border-color: #ff4757;
  background: rgba(255, 71, 87, 0.2);
  animation: shake 0.3s ease;
}

.quiz-option.dimmed {
  opacity: 0.4;
}

@keyframes pulse-correct {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

.option-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: rgba(255, 0, 255, 0.3);
  border-radius: 6px;
  font-weight: bold;
  font-size: 14px;
  flex-shrink: 0;
}

.option-text {
  flex: 1;
}

.quiz-feedback {
  margin-top: 20px;
  padding: 16px;
  border-radius: 12px;
  text-align: center;
  animation: slideUp 0.2s ease-out;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.quiz-feedback.correct {
  background: rgba(57, 255, 20, 0.15);
  border: 1px solid #39ff14;
}

.quiz-feedback.incorrect {
  background: rgba(255, 71, 87, 0.15);
  border: 1px solid #ff4757;
}

.feedback-icon {
  font-size: 24px;
  margin-right: 8px;
}

.feedback-text {
  color: #ffffff;
  font-size: 16px;
  font-weight: bold;
}

.feedback-explanation {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  margin-top: 12px;
  line-height: 1.4;
}

.quiz-reward-preview {
  margin-top: 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

/* Mobile optimizations */
@media (max-width: 480px) {
  .quiz-modal {
    padding: 16px;
    border-radius: 12px;
  }

  .quiz-question {
    font-size: 16px;
  }

  .quiz-option {
    padding: 12px;
    font-size: 14px;
  }
}
typescript// src/data/questions.json (sample structure)
{
  "version": "1.0.0",
  "totalQuestions": 239,
  "questions": [
    {
      "id": "signs-001",
      "category": "signs",
      "question": "What does a yellow diamond-shaped sign indicate?",
      "options": ["Regulatory instruction", "Warning ahead", "Construction zone", "School zone"],
      "correctIndex": 1,
      "explanation": "Yellow diamond signs are warning signs alerting drivers to potential hazards ahead.",
      "difficulty": "easy"
    }
  ]
}
Key features:

Mileage-triggered with initial grace period
Category weighting ensures balanced coverage
Streak bonus shown before answering (motivation)
Korean expressions ("대박", "아이고") for theme
Fallback questions if JSON fails to load
Touch-friendly button sizing (min 44px tap targets)


Next step: Progress persistence and HUD with mileage/Z-Coins display.
Ready? (y/k)YJan 20Identified next development phase for game mechanicsIdentified next development phase for game mechanicsStep 10: Progress Persistence & HUD
typescript// src/systems/ProgressManager.ts

import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// PERSISTENCE CONFIGURATION
// ═══════════════════════════════════════════════════════════

const PERSIST_CONFIG = {
  // Save frequency
  AUTO_SAVE_INTERVAL_MS: 30000,           // Auto-save every 30 seconds
  SAVE_ON_MILESTONE: true,                // Save at quiz completions
  
  // Storage keys
  STORAGE_KEY: 'ali-aigoo-save',          // Primary save
  BACKUP_KEY: 'ali-aigoo-backup',         // Backup save
  
  // Version (for migration)
  SAVE_VERSION: 1,
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface SaveData {
  version: number;
  timestamp: number;
  mileage: number;
  lastQuizMile: number;
  currentBiome: 'city' | 'highway' | 'rural';
  zCoins: number;
  totalEarned: number;
  questionsAnswered: number;
  correctAnswers: number;
  streak: number;
  settings: {
    steeringSensitivity: number;
    invertSteering: boolean;
    musicVolume: number;
    sfxVolume: number;
  };
}

// ═══════════════════════════════════════════════════════════
// PROGRESS MANAGER HOOK
// ═══════════════════════════════════════════════════════════

export function useProgressManager() {
  // Store selectors
  const game = useGameStore((s) => s.game);
  const economy = useGameStore((s) => s.economy);
  const quiz = useGameStore((s) => s.quiz);
  const settings = useGameStore((s) => s.settings);

  // Track last save for dirty checking
  const lastSaveHash = useRef<string>('');
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  // ─────────────────────────────────────────────────────────
  // GENERATE SAVE DATA
  // ─────────────────────────────────────────────────────────

  const generateSaveData = (): SaveData => ({
    version: PERSIST_CONFIG.SAVE_VERSION,
    timestamp: Date.now(),
    mileage: game.mileage,
    lastQuizMile: game.lastQuizMile,
    currentBiome: game.currentBiome,
    zCoins: economy.zCoins,
    totalEarned: economy.totalEarned,
    questionsAnswered: quiz.questionsAnswered,
    correctAnswers: quiz.correctAnswers,
    streak: economy.streak,
    settings: { ...settings },
  });

  // ─────────────────────────────────────────────────────────
  // SAVE TO LOCALSTORAGE
  // ─────────────────────────────────────────────────────────

  const saveProgress = (): boolean => {
    try {
      const data = generateSaveData();
      const json = JSON.stringify(data);
      
      // Check if data actually changed
      const hash = simpleHash(json);
      if (hash === lastSaveHash.current) {
        return false;  // No changes
      }

      // Backup current save before overwriting
      const existingSave = localStorage.getItem(PERSIST_CONFIG.STORAGE_KEY);
      if (existingSave) {
        localStorage.setItem(PERSIST_CONFIG.BACKUP_KEY, existingSave);
      }

      // Write new save
      localStorage.setItem(PERSIST_CONFIG.STORAGE_KEY, json);
      lastSaveHash.current = hash;

      console.log(`[ProgressManager] Saved at ${data.mileage.toFixed(1)} miles`);
      return true;
    } catch (error) {
      console.error('[ProgressManager] Save failed:', error);
      return false;
    }
  };

  // ─────────────────────────────────────────────────────────
  // LOAD FROM LOCALSTORAGE
  // ─────────────────────────────────────────────────────────

  const loadProgress = (): SaveData | null => {
    try {
      const json = localStorage.getItem(PERSIST_CONFIG.STORAGE_KEY);
      if (!json) return null;

      const data: SaveData = JSON.parse(json);

      // Version check (future migration support)
      if (data.version !== PERSIST_CONFIG.SAVE_VERSION) {
        console.warn('[ProgressManager] Save version mismatch, attempting migration');
        return migrateSaveData(data);
      }

      return data;
    } catch (error) {
      console.error('[ProgressManager] Load failed, trying backup:', error);
      
      // Try backup
      try {
        const backup = localStorage.getItem(PERSIST_CONFIG.BACKUP_KEY);
        if (backup) {
          return JSON.parse(backup);
        }
      } catch {
        console.error('[ProgressManager] Backup also failed');
      }

      return null;
    }
  };

  // ─────────────────────────────────────────────────────────
  // AUTO-SAVE TIMER
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    // Start auto-save timer
    saveTimer.current = setInterval(() => {
      if (game.phase === 'driving') {
        saveProgress();
      }
    }, PERSIST_CONFIG.AUTO_SAVE_INTERVAL_MS);

    // Save on unmount/tab close
    const handleBeforeUnload = () => {
      saveProgress();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (saveTimer.current) {
        clearInterval(saveTimer.current);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      saveProgress();  // Final save on cleanup
    };
  }, [game.phase]);

  // ─────────────────────────────────────────────────────────
  // SAVE ON QUIZ COMPLETION
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (PERSIST_CONFIG.SAVE_ON_MILESTONE && quiz.questionsAnswered > 0) {
      saveProgress();
    }
  }, [quiz.questionsAnswered]);

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  return {
    saveProgress,
    loadProgress,
    hasSaveData: () => localStorage.getItem(PERSIST_CONFIG.STORAGE_KEY) !== null,
    deleteSaveData: () => {
      localStorage.removeItem(PERSIST_CONFIG.STORAGE_KEY);
      localStorage.removeItem(PERSIST_CONFIG.BACKUP_KEY);
    },
  };
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function migrateSaveData(oldData: SaveData): SaveData {
  // Future: handle version migrations
  return {
    ...oldData,
    version: PERSIST_CONFIG.SAVE_VERSION,
  };
}
typescript// src/components/UI/GameHUD.tsx

import { useMemo } from 'react';
import { useGameStore } from '../../stores/gameStore';
import './GameHUD.css';

// ═══════════════════════════════════════════════════════════
// HUD CONFIGURATION
// ═══════════════════════════════════════════════════════════

const HUD_CONFIG = {
  TOTAL_MILES: 2800,                      // NYC to Spokane
  BIOME_LABELS: {
    city: 'New York City',
    highway: 'Interstate',
    rural: 'Washington State',
  },
};

// ═══════════════════════════════════════════════════════════
// GAME HUD COMPONENT
// ═══════════════════════════════════════════════════════════

export function GameHUD() {
  // Store selectors (granular to prevent re-renders)
  const mileage = useGameStore((s) => s.game.mileage);
  const currentBiome = useGameStore((s) => s.game.currentBiome);
  const velocity = useGameStore((s) => s.vehicle.velocity);
  const zCoins = useGameStore((s) => s.economy.zCoins);
  const streak = useGameStore((s) => s.economy.streak);
  const phase = useGameStore((s) => s.game.phase);

  // Derived values (memoized)
  const progressPercent = useMemo(
    () => Math.min((mileage / HUD_CONFIG.TOTAL_MILES) * 100, 100),
    [mileage]
  );

  const milesRemaining = useMemo(
    () => Math.max(HUD_CONFIG.TOTAL_MILES - mileage, 0),
    [mileage]
  );

  // Hide during non-driving phases
  if (phase !== 'driving') return null;

  return (
    <div className="game-hud">
      {/* Top bar: Location & Progress */}
      <div className="hud-top">
        <div className="hud-location">
          <span className="location-icon">📍</span>
          <span className="location-text">{HUD_CONFIG.BIOME_LABELS[currentBiome]}</span>
        </div>

        <div className="hud-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
            <div className="progress-marker start">NYC</div>
            <div className="progress-marker end">SPO</div>
          </div>
          <div className="progress-text">
            {milesRemaining.toFixed(0)} miles to go
          </div>
        </div>
      </div>

      {/* Left side: Speedometer */}
      <div className="hud-left">
        <Speedometer speed={velocity} />
      </div>

      {/* Right side: Economy */}
      <div className="hud-right">
        <div className="hud-coins">
          <span className="coin-icon">🪙</span>
          <span className="coin-value">{formatNumber(zCoins)}</span>
        </div>

        {streak > 0 && (
          <div className="hud-streak">
            <span className="streak-icon">🔥</span>
            <span className="streak-value">{streak}</span>
          </div>
        )}
      </div>

      {/* Bottom center: Mileage odometer */}
      <div className="hud-bottom">
        <div className="hud-odometer">
          <span className="odometer-value">{mileage.toFixed(1)}</span>
          <span className="odometer-unit">mi</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPEEDOMETER COMPONENT
// ═══════════════════════════════════════════════════════════

interface SpeedometerProps {
  speed: number;
  maxSpeed?: number;
}

function Speedometer({ speed, maxSpeed = 60 }: SpeedometerProps) {
  // Calculate needle rotation (-135° to +135° range)
  const normalizedSpeed = Math.min(speed / maxSpeed, 1);
  const rotation = -135 + normalizedSpeed * 270;

  // Speed zone colors
  const getSpeedColor = () => {
    if (speed < 25) return '#39ff14';     // Green: safe
    if (speed < 45) return '#ffaa00';     // Yellow: moderate
    return '#ff00ff';                      // Pink: fast
  };

  return (
    <div className="speedometer">
      <svg viewBox="0 0 100 60" className="speedometer-svg">
        {/* Background arc */}
        <path
          d="M 10 55 A 45 45 0 0 1 90 55"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Speed arc (filled portion) */}
        <path
          d="M 10 55 A 45 45 0 0 1 90 55"
          fill="none"
          stroke={getSpeedColor()}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${normalizedSpeed * 141} 141`}
          className="speed-arc"
        />

        {/* Needle */}
        <line
          x1="50"
          y1="55"
          x2="50"
          y2="15"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${rotation} 50 55)`}
          className="speed-needle"
        />

        {/* Center dot */}
        <circle cx="50" cy="55" r="4" fill="#ff00ff" />
      </svg>

      <div className="speedometer-value">
        <span className="speed-number">{Math.round(speed)}</span>
        <span className="speed-unit">MPH</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function formatNumber(num: number): string {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
css/* src/components/UI/GameHUD.css */

.game-hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 50;
  padding: 12px;
  font-family: 'Inter', system-ui, sans-serif;
}

/* ═══════════════════════════════════════════════════════════
   TOP BAR
   ═══════════════════════════════════════════════════════════ */

.hud-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.hud-location {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(18, 18, 18, 0.8);
  padding: 8px 12px;
  border-radius: 20px;
  border: 1px solid rgba(255, 0, 255, 0.3);
}

.location-icon {
  font-size: 14px;
}

.location-text {
  color: #ffffff;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.hud-progress {
  flex: 1;
  max-width: 200px;
}

.progress-bar {
  position: relative;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: visible;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff00ff, #39ff14);
  border-radius: 4px;
  transition: width 0.3s ease-out;
  box-shadow: 0 0 10px rgba(255, 0, 255, 0.5);
}

.progress-marker {
  position: absolute;
  top: 12px;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: bold;
}

.progress-marker.start { left: 0; }
.progress-marker.end { right: 0; }

.progress-text {
  color: rgba(255, 255, 255, 0.7);
  font-size: 10px;
  text-align: center;
  margin-top: 14px;
}

/* ═══════════════════════════════════════════════════════════
   LEFT SIDE (Speedometer)
   ═══════════════════════════════════════════════════════════ */

.hud-left {
  position: absolute;
  left: 12px;
  bottom: 140px;
}

.speedometer {
  width: 100px;
  background: rgba(18, 18, 18, 0.85);
  border-radius: 12px;
  padding: 8px;
  border: 1px solid rgba(255, 0, 255, 0.3);
}

.speedometer-svg {
  width: 100%;
  height: auto;
}

.speed-arc {
  transition: stroke-dasharray 0.1s ease-out;
  filter: drop-shadow(0 0 4px currentColor);
}

.speed-needle {
  transition: transform 0.1s ease-out;
  filter: drop-shadow(0 0 2px #ffffff);
}

.speedometer-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  margin-top: -8px;
}

.speed-number {
  color: #ffffff;
  font-size: 24px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}

.speed-unit {
  color: rgba(255, 255, 255, 0.5);
  font-size: 10px;
  font-weight: 600;
}

/* ═══════════════════════════════════════════════════════════
   RIGHT SIDE (Economy)
   ═══════════════════════════════════════════════════════════ */

.hud-right {
  position: absolute;
  right: 12px;
  top: 70px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.hud-coins {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(18, 18, 18, 0.85);
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid rgba(57, 255, 20, 0.4);
}

.coin-icon {
  font-size: 18px;
}

.coin-value {
  color: #39ff14;
  font-size: 18px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 8px rgba(57, 255, 20, 0.5);
}

.hud-streak {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 107, 107, 0.2);
  padding: 4px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 107, 107, 0.4);
}

.streak-icon {
  font-size: 14px;
}

.streak-value {
  color: #ff6b6b;
  font-size: 14px;
  font-weight: bold;
}

/* ═══════════════════════════════════════════════════════════
   BOTTOM CENTER (Odometer)
   ═══════════════════════════════════════════════════════════ */

.hud-bottom {
  position: absolute;
  bottom: 150px;
  left: 50%;
  transform: translateX(-50%);
}

.hud-odometer {
  display: flex;
  align-items: baseline;
  gap: 4px;
  background: rgba(18, 18, 18, 0.85);
  padding: 6px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.odometer-value {
  color: #ffffff;
  font-size: 20px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}

.odometer-unit {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

/* ═══════════════════════════════════════════════════════════
   MOBILE ADJUSTMENTS
   ═══════════════════════════════════════════════════════════ */

@media (max-width: 480px) {
  .game-hud {
    padding: 8px;
  }

  .speedometer {
    width: 80px;
  }

  .speed-number {
    font-size: 20px;
  }

  .hud-progress {
    max-width: 140px;
  }

  .coin-value {
    font-size: 16px;
  }

  .hud-bottom {
    bottom: 130px;
  }
}

/* ═══════════════════════════════════════════════════════════
   ANIMATIONS
   ═══════════════════════════════════════════════════════════ */

@keyframes coin-pop {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.hud-coins.reward-pop {
  animation: coin-pop 0.3s ease-out;
}
typescript// src/components/UI/PauseMenu.tsx

import { useGameStore } from '../../stores/gameStore';
import { useProgressManager } from '../../systems/ProgressManager';
import './PauseMenu.css';

// ═══════════════════════════════════════════════════════════
// PAUSE MENU COMPONENT
// ═══════════════════════════════════════════════════════════

export function PauseMenu() {
  const phase = useGameStore((s) => s.game.phase);
  const setPhase = useGameStore((s) => s.setPhase);
  const mileage = useGameStore((s) => s.game.mileage);
  const zCoins = useGameStore((s) => s.economy.zCoins);
  const correctAnswers = useGameStore((s) => s.quiz.correctAnswers);
  const questionsAnswered = useGameStore((s) => s.quiz.questionsAnswered);
  const resetProgress = useGameStore((s) => s.resetProgress);

  const { saveProgress, deleteSaveData } = useProgressManager();

  if (phase !== 'paused') return null;

  const accuracy = questionsAnswered > 0
    ? Math.round((correctAnswers / questionsAnswered) * 100)
    : 0;

  const handleResume = () => {
    setPhase('driving');
  };

  const handleSaveQuit = () => {
    saveProgress();
    setPhase('menu');
  };

  const handleNewGame = () => {
    if (confirm('Start a new game? Current progress will be lost.')) {
      deleteSaveData();
      resetProgress();
      setPhase('menu');
    }
  };

  return (
    <div className="pause-overlay">
      <div className="pause-menu">
        <h2 className="pause-title">PAUSED</h2>

        {/* Stats summary */}
        <div className="pause-stats">
          <div className="stat-item">
            <span className="stat-label">Distance</span>
            <span className="stat-value">{mileage.toFixed(1)} mi</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Z-Coins</span>
            <span className="stat-value">{zCoins}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Quiz Accuracy</span>
            <span className="stat-value">{accuracy}%</span>
          </div>
        </div>

        {/* Menu buttons */}
        <div className="pause-buttons">
          <button className="pause-btn primary" onClick={handleResume}>
            Resume
          </button>
          <button className="pause-btn" onClick={handleSaveQuit}>
            Save & Quit
          </button>
          <button className="pause-btn danger" onClick={handleNewGame}>
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
Key features:

Auto-save every 30s + on quiz completion + on tab close
Backup save prevents corruption
Tabular-nums font-variant prevents number jitter
HUD positioned to avoid touch zones
Progress bar shows NYC→Spokane journey
Speedometer color changes with speed zones


Next step: Main Game component wiring everything together.
Ready? (y/k)YJan 21Orchestrated integration of game systems into unified componentOrchestrated integration of game systems into unified componentStep 11: Main Game Component
typescript// src/Game.tsx

import { Suspense, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Preload } from '@react-three/drei';
import { useGameStore } from './stores/gameStore';
import { useProgressManager } from './systems/ProgressManager';
import { useTouchControls } from './hooks/useTouchControls';
import { useQuizManager } from './systems/QuizManager';

// Components
import { Vehicle } from './components/Vehicle/Vehicle';
import { RoadChunks } from './components/Road/RoadChunks';
import { TrafficRenderer } from './components/Traffic/TrafficRenderer';
import { GameCamera } from './components/Camera/GameCamera';
import { Lighting } from './components/Lighting/Lighting';
import { Skybox } from './components/Environment/Skybox';

// UI
import { GameHUD } from './components/UI/GameHUD';
import { TouchOverlay } from './components/UI/TouchOverlay';
import { QuizOverlay } from './components/Quiz/QuizOverlay';
import { PauseMenu } from './components/UI/PauseMenu';
import { MainMenu } from './components/UI/MainMenu';
import { LoadingScreen } from './components/UI/LoadingScreen';

import './Game.css';

// ═══════════════════════════════════════════════════════════
// PERFORMANCE CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CANVAS_CONFIG = {
  // Rendering
  dpr: [1, 1.5] as [number, number],      // Device pixel ratio (capped for mobile)
  performance: {
    min: 0.5,                              // Allow quality reduction under load
  },
  
  // WebGL context
  gl: {
    antialias: false,                      // Disable for performance
    powerPreference: 'high-performance' as const,
    stencil: false,
    depth: true,
  },
  
  // Shadows
  shadows: 'soft' as const,
};

const PHYSICS_CONFIG = {
  gravity: [0, -9.81, 0] as [number, number, number],
  timeStep: 1 / 60,                        // Fixed 60Hz physics
  maxStabilizationIterations: 1,           // Reduce for mobile
  maxVelocityFrictionIterations: 1,
  maxVelocityIterations: 1,
};

// ═══════════════════════════════════════════════════════════
// MAIN GAME COMPONENT
// ═══════════════════════════════════════════════════════════

export function Game() {
  // Store
  const phase = useGameStore((s) => s.game.phase);
  const setPhase = useGameStore((s) => s.setPhase);

  // Systems
  const { loadProgress, hasSaveData } = useProgressManager();
  useTouchControls();
  useQuizManager();

  // ─────────────────────────────────────────────────────────
  // INITIALIZE ON MOUNT
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    // Prevent default touch behaviors (zoom, scroll)
    document.addEventListener('touchmove', preventDefaultTouch, { passive: false });
    document.addEventListener('gesturestart', preventDefaultTouch);
    document.addEventListener('gesturechange', preventDefaultTouch);

    // Lock to portrait on mobile (if supported)
    if (screen.orientation?.lock) {
      screen.orientation.lock('portrait').catch(() => {
        // Silent fail - not all browsers support this
      });
    }

    return () => {
      document.removeEventListener('touchmove', preventDefaultTouch);
      document.removeEventListener('gesturestart', preventDefaultTouch);
      document.removeEventListener('gesturechange', preventDefaultTouch);
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // PAUSE BUTTON HANDLER
  // ─────────────────────────────────────────────────────────

  const handlePause = useCallback(() => {
    if (phase === 'driving') {
      setPhase('paused');
    }
  }, [phase, setPhase]);

  // ─────────────────────────────────────────────────────────
  // KEYBOARD CONTROLS (desktop fallback)
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'driving') setPhase('paused');
        else if (phase === 'paused') setPhase('driving');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, setPhase]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <div className="game-container">
      {/* 3D Canvas */}
      <Canvas {...CANVAS_CONFIG}>
        <Suspense fallback={null}>
          {/* Physics world */}
          <Physics {...PHYSICS_CONFIG}>
            {/* Environment */}
            <Lighting />
            <Skybox biome={useGameStore.getState().game.currentBiome} />

            {/* Game objects */}
            <RoadChunks />
            <Vehicle />
            <TrafficRenderer />

            {/* Camera */}
            <GameCamera />
          </Physics>

          {/* Asset preloading */}
          <Preload all />
        </Suspense>
      </Canvas>

      {/* UI Layers (HTML overlay) */}
      <div className="ui-layer">
        {/* Main menu */}
        {phase === 'menu' && (
          <MainMenu hasSaveData={hasSaveData()} onLoadSave={loadProgress} />
        )}

        {/* In-game HUD */}
        {(phase === 'driving' || phase === 'quiz') && (
          <>
            <GameHUD />
            <TouchOverlay />
            <PauseButton onPause={handlePause} />
          </>
        )}

        {/* Quiz modal */}
        {phase === 'quiz' && <QuizOverlay />}

        {/* Pause menu */}
        {phase === 'paused' && <PauseMenu />}

        {/* Loading indicator */}
        <LoadingScreen />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAUSE BUTTON COMPONENT
// ═══════════════════════════════════════════════════════════

interface PauseButtonProps {
  onPause: () => void;
}

function PauseButton({ onPause }: PauseButtonProps) {
  return (
    <button className="pause-button" onClick={onPause} aria-label="Pause game">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function preventDefaultTouch(e: Event) {
  e.preventDefault();
}
typescript// src/components/Camera/GameCamera.tsx

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, PerspectiveCamera } from 'three';
import { useGameStore } from '../../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// CAMERA CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CAMERA_CONFIG = {
  // Position offset from vehicle
  OFFSET: new Vector3(0, 6, 12),          // Behind and above
  
  // Look-at offset (slightly ahead of vehicle)
  LOOK_AHEAD: 8,
  
  // Smoothing
  POSITION_LERP: 0.08,                    // Camera follow smoothness
  ROTATION_LERP: 0.1,                     // Look-at smoothness
  
  // FOV
  FOV: 60,
  NEAR: 0.1,
  FAR: 500,
};

// ═══════════════════════════════════════════════════════════
// GAME CAMERA COMPONENT
// ═══════════════════════════════════════════════════════════

export function GameCamera() {
  const cameraRef = useRef<PerspectiveCamera>(null);

  // Store
  const playerPosition = useGameStore((s) => s.vehicle.position);
  const phase = useGameStore((s) => s.game.phase);

  // Reusable vectors (avoid GC)
  const targetPosition = useRef(new Vector3());
  const currentPosition = useRef(new Vector3(0, 6, 12));
  const lookAtTarget = useRef(new Vector3());

  useFrame(() => {
    const camera = cameraRef.current;
    if (!camera) return;

    // Calculate target position (behind vehicle)
    targetPosition.current.set(
      playerPosition[0],
      playerPosition[1] + CAMERA_CONFIG.OFFSET.y,
      playerPosition[2] + CAMERA_CONFIG.OFFSET.z
    );

    // Smooth camera movement
    currentPosition.current.lerp(targetPosition.current, CAMERA_CONFIG.POSITION_LERP);
    camera.position.copy(currentPosition.current);

    // Look at point ahead of vehicle
    lookAtTarget.current.set(
      playerPosition[0],
      playerPosition[1] + 1,
      playerPosition[2] - CAMERA_CONFIG.LOOK_AHEAD
    );

    camera.lookAt(lookAtTarget.current);
  });

  return (
    <perspectiveCamera
      ref={cameraRef}
      makeDefault
      fov={CAMERA_CONFIG.FOV}
      near={CAMERA_CONFIG.NEAR}
      far={CAMERA_CONFIG.FAR}
      position={[0, 6, 12]}
    />
  );
}
typescript// src/components/Lighting/Lighting.tsx

import { useGameStore } from '../../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// BIOME-SPECIFIC LIGHTING
// ═══════════════════════════════════════════════════════════

const LIGHTING_PRESETS = {
  city: {
    ambient: 0.4,
    ambientColor: '#4a4a6a',
    sunIntensity: 0.8,
    sunColor: '#ffeedd',
    sunPosition: [50, 80, 30] as [number, number, number],
  },
  highway: {
    ambient: 0.5,
    ambientColor: '#6a8a9a',
    sunIntensity: 1.0,
    sunColor: '#ffffee',
    sunPosition: [60, 100, 40] as [number, number, number],
  },
  rural: {
    ambient: 0.45,
    ambientColor: '#8a9a7a',
    sunIntensity: 0.9,
    sunColor: '#fff8e8',
    sunPosition: [40, 90, 50] as [number, number, number],
  },
};

// ═══════════════════════════════════════════════════════════
// LIGHTING COMPONENT
// ═══════════════════════════════════════════════════════════

export function Lighting() {
  const biome = useGameStore((s) => s.game.currentBiome);
  const preset = LIGHTING_PRESETS[biome];

  return (
    <>
      {/* Ambient fill light */}
      <ambientLight intensity={preset.ambient} color={preset.ambientColor} />

      {/* Main directional (sun) light */}
      <directionalLight
        intensity={preset.sunIntensity}
        color={preset.sunColor}
        position={preset.sunPosition}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={1}
        shadow-camera-far={200}
        shadow-bias={-0.001}
      />

      {/* Subtle rim light (opposite side) */}
      <directionalLight
        intensity={0.2}
        color="#ff00ff"
        position={[-30, 20, -20]}
      />
    </>
  );
}
typescript// src/components/Environment/Skybox.tsx

import { useMemo } from 'react';
import { BackSide } from 'three';

// ═══════════════════════════════════════════════════════════
// SKYBOX COLORS BY BIOME
// ═══════════════════════════════════════════════════════════

const SKY_COLORS = {
  city: {
    top: '#1a1a2e',                        // Dark purple
    bottom: '#4a3f6b',                     // Lighter purple
  },
  highway: {
    top: '#0f0f23',                        // Deep blue
    bottom: '#2d3a4a',                     // Steel blue
  },
  rural: {
    top: '#1a1a1a',                        // Near black
    bottom: '#2a3a2a',                     // Dark green tint
  },
};

// ═══════════════════════════════════════════════════════════
// SKYBOX COMPONENT (gradient sphere)
// ═══════════════════════════════════════════════════════════

interface SkyboxProps {
  biome: 'city' | 'highway' | 'rural';
}

export function Skybox({ biome }: SkyboxProps) {
  const colors = SKY_COLORS[biome];

  // Create gradient shader material
  const shaderMaterial = useMemo(() => ({
    uniforms: {
      topColor: { value: hexToRgb(colors.top) },
      bottomColor: { value: hexToRgb(colors.bottom) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float t = max(0.0, min(1.0, h * 0.5 + 0.5));
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `,
    side: BackSide,
  }), [colors]);

  return (
    <mesh scale={[400, 400, 400]}>
      <sphereGeometry args={[1, 16, 16]} />
      <shaderMaterial attach="material" {...shaderMaterial} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
      ]
    : [0, 0, 0];
}
typescript// src/components/UI/MainMenu.tsx

import { useGameStore } from '../../stores/gameStore';
import './MainMenu.css';

// ═══════════════════════════════════════════════════════════
// MAIN MENU COMPONENT
// ═══════════════════════════════════════════════════════════

interface MainMenuProps {
  hasSaveData: boolean;
  onLoadSave: () => void;
}

export function MainMenu({ hasSaveData, onLoadSave }: MainMenuProps) {
  const setPhase = useGameStore((s) => s.setPhase);
  const resetProgress = useGameStore((s) => s.resetProgress);

  const handleNewGame = () => {
    resetProgress();
    setPhase('driving');
  };

  const handleContinue = () => {
    onLoadSave();
    setPhase('driving');
  };

  return (
    <div className="main-menu">
      <div className="menu-content">
        {/* Title */}
        <div className="menu-title">
          <h1 className="title-main">Ali's</h1>
          <h2 className="title-sub">Aigoo Apocalypse</h2>
          <p className="title-tagline">NYC → Spokane | 2,800 Miles</p>
        </div>

        {/* Decorative car */}
        <div className="menu-car">🚗</div>

        {/* Menu buttons */}
        <div className="menu-buttons">
          {hasSaveData && (
            <button className="menu-btn primary" onClick={handleContinue}>
              Continue Journey
            </button>
          )}
          <button
            className={`menu-btn ${hasSaveData ? '' : 'primary'}`}
            onClick={handleNewGame}
          >
            New Game
          </button>
        </div>

        {/* Footer */}
        <div className="menu-footer">
          <p>Learn to drive. Survive the apocalypse.</p>
          <p className="menu-credits">A T Production 🐱🐱</p>
        </div>
      </div>
    </div>
  );
}
typescript// src/components/UI/LoadingScreen.tsx

import { useProgress } from '@react-three/drei';
import './LoadingScreen.css';

// ═══════════════════════════════════════════════════════════
// LOADING SCREEN COMPONENT
// ═══════════════════════════════════════════════════════════

export function LoadingScreen() {
  const { active, progress } = useProgress();

  if (!active) return null;

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-spinner" />
        <p className="loading-text">Loading... {progress.toFixed(0)}%</p>
        <div className="loading-bar">
          <div
            className="loading-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
css/* src/Game.css */

.game-container {
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #121212;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.ui-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10;
}

.ui-layer > * {
  pointer-events: auto;
}

.pause-button {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 44px;
  height: 44px;
  background: rgba(18, 18, 18, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 100;
}

.pause-button svg {
  width: 20px;
  height: 20px;
}

.pause-button:active {
  background: rgba(255, 0, 255, 0.3);
}
css/* src/components/UI/MainMenu.css */

.main-menu {
  position: fixed;
  inset: 0;
  background: linear-gradient(180deg, #0a0a0f 0%, #1a1a2e 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.menu-content {
  text-align: center;
  padding: 24px;
  max-width: 400px;
}

.menu-title {
  margin-bottom: 32px;
}

.title-main {
  font-size: 48px;
  font-weight: 900;
  color: #ff00ff;
  text-shadow: 0 0 20px rgba(255, 0, 255, 0.6);
  margin: 0;
  line-height: 1;
}

.title-sub {
  font-size: 28px;
  font-weight: 700;
  color: #39ff14;
  text-shadow: 0 0 15px rgba(57, 255, 20, 0.5);
  margin: 8px 0 0 0;
}

.title-tagline {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  margin-top: 12px;
}

.menu-car {
  font-size: 64px;
  margin: 24px 0;
  animation: bounce 2s ease-in-out infinite;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 32px;
}

.menu-btn {
  padding: 16px 32px;
  font-size: 18px;
  font-weight: 600;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.menu-btn:hover {
  border-color: #ff00ff;
  background: rgba(255, 0, 255, 0.1);
}

.menu-btn.primary {
  background: linear-gradient(135deg, #ff00ff, #aa00aa);
  border-color: #ff00ff;
  box-shadow: 0 0 20px rgba(255, 0, 255, 0.4);
}

.menu-btn.primary:hover {
  box-shadow: 0 0 30px rgba(255, 0, 255, 0.6);
}

.menu-footer {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
}

.menu-credits {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.6);
}
css/* src/components/UI/LoadingScreen.css */

.loading-screen {
  position: fixed;
  inset: 0;
  background: #121212;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.loading-content {
  text-align: center;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid rgba(255, 0, 255, 0.2);
  border-top-color: #ff00ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: #ffffff;
  font-size: 14px;
  margin-bottom: 12px;
}

.loading-bar {
  width: 200px;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.loading-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff00ff, #39ff14);
  transition: width 0.2s ease-out;
}
Key integration points:

Canvas renders 3D scene with physics
UI layer overlays HTML components
Touch prevention stops iOS Safari bounce/zoom
Portrait lock attempted (graceful fallback)
Escape key toggles pause on desktop
Loading screen shows asset progress


Next step: Edge cases, optimizations, and architecture diagram.
Ready? (y/k)YJan 21Orchestrated comprehensive implementation wrap-up strategyOrchestrated comprehensive implementation wrap-up strategyStep 12: Edge Cases, Optimizations & Architecture
System Architecture Diagram
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ALI'S AIGOO APOCALYPSE                           │
│                         Mobile-First 3D Driving Game                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              ENTRY POINT                                    │
│                                                                             │
│  main.tsx ──► App.tsx ──► Game.tsx                                         │
│                              │                                              │
│                    ┌─────────┴─────────┐                                    │
│                    ▼                   ▼                                    │
│              <Canvas>            <UI Layer>                                 │
│            (3D Scene)          (HTML Overlay)                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           STATE MANAGEMENT                                  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Zustand Store (gameStore.ts)                     │   │
│  ├──────────────┬──────────────┬──────────────┬──────────────┬─────────┤   │
│  │   vehicle    │     game     │     quiz     │   economy    │ settings│   │
│  ├──────────────┼──────────────┼──────────────┼──────────────┼─────────┤   │
│  │ position     │ phase        │ isActive     │ zCoins       │ steer   │   │
│  │ velocity     │ mileage      │ currentQ     │ totalEarned  │ sens.   │   │
│  │ steering     │ lastQuizMile │ answered     │ streak       │ volume  │   │
│  │ throttle     │ currentBiome │ correct      │              │         │   │
│  │ brake        │              │              │              │         │   │
│  └──────────────┴──────────────┴──────────────┴──────────────┴─────────┘   │
│                                    │                                        │
│                     ┌──────────────┴──────────────┐                         │
│                     ▼                              ▼                        │
│            LocalStorage                    persist middleware               │
│         (ali-aigoo-save)                  (auto-hydration)                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            3D SCENE GRAPH                                   │
│                                                                             │
│  <Canvas>                                                                   │
│    └─ <Physics> (Rapier)                                                    │
│         ├─ <Lighting>          ── Ambient + Directional + Rim              │
│         ├─ <Skybox>            ── Gradient sphere (biome-colored)          │
│         ├─ <RoadChunks>        ── Object-pooled infinite road              │
│         │    └─ <RoadChunk> ×5 ── Static RigidBody + visuals               │
│         ├─ <Vehicle>           ── Dynamic RigidBody + controller           │
│         │    └─ <VehicleController> (useFrame hook)                        │
│         ├─ <TrafficRenderer>   ── InstancedMesh (8 NPCs, 1 draw call)      │
│         └─ <GameCamera>        ── Smooth follow camera                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEMS                                        │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ RoadChunkManager│  │ TrafficManager  │  │   QuizManager   │             │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤             │
│  │ • Chunk pooling │  │ • NPC spawning  │  │ • Mileage trigger│            │
│  │ • Biome transit │  │ • Lane AI       │  │ • Question select│            │
│  │ • Z-position    │  │ • Instancing    │  │ • Category weight│            │
│  │   recycling     │  │ • Speed adjust  │  │ • Streak tracking│            │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                                  │
│  │ProgressManager  │  │ TouchControls   │                                  │
│  ├─────────────────┤  ├─────────────────┤                                  │
│  │ • Auto-save 30s │  │ • Multi-touch   │                                  │
│  │ • Backup saves  │  │ • Zone detection│                                  │
│  │ • Tab close save│  │ • Dead zones    │                                  │
│  │ • Version migr. │  │ • Sensitivity   │                                  │
│  └─────────────────┘  └─────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            UI COMPONENTS                                    │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │  MainMenu   │ │   GameHUD   │ │ QuizOverlay │ │  PauseMenu  │           │
│  ├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤           │
│  │ New/Continue│ │ Speedometer │ │ Question    │ │ Stats       │           │
│  │ Title       │ │ Progress bar│ │ Options A-D │ │ Resume      │           │
│  │             │ │ Z-Coins     │ │ Feedback    │ │ Save & Quit │           │
│  │             │ │ Odometer    │ │ Streak      │ │ New Game    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                                             │
│  ┌─────────────┐ ┌─────────────┐                                           │
│  │TouchOverlay │ │LoadingScreen│                                           │
│  ├─────────────┤ ├─────────────┤                                           │
│  │ Steer needle│ │ Spinner     │                                           │
│  │ Pedal fills │ │ Progress %  │                                           │
│  └─────────────┘ └─────────────┘                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW                                         │
│                                                                             │
│  Touch Input ──► useTouchControls ──► setVehicleControls() ──► Store       │
│                                                                             │
│  useFrame ──► VehicleController ──► Rapier Physics ──► setVelocity()       │
│           ──► addMileage() ──► QuizManager check ──► triggerQuiz()         │
│                                                                             │
│  QuizOverlay ──► answerQuiz() ──► addZCoins() ──► closeQuiz()              │
│                                                                             │
│  ProgressManager ──► saveProgress() ──► LocalStorage                        │
└─────────────────────────────────────────────────────────────────────────────┘

Edge Cases & Mitigations
typescript// src/utils/edgeCases.ts

// ═══════════════════════════════════════════════════════════
// 1. THERMAL THROTTLING DETECTION
// ═══════════════════════════════════════════════════════════

interface PerformanceMonitor {
  frameCount: number;
  lastCheck: number;
  avgFps: number;
  throttleLevel: 'none' | 'light' | 'heavy';
}

const perfMonitor: PerformanceMonitor = {
  frameCount: 0,
  lastCheck: performance.now(),
  avgFps: 60,
  throttleLevel: 'none',
};

export function updatePerformanceMonitor(delta: number) {
  perfMonitor.frameCount++;
  
  const now = performance.now();
  const elapsed = now - perfMonitor.lastCheck;
  
  // Check every 2 seconds
  if (elapsed >= 2000) {
    perfMonitor.avgFps = (perfMonitor.frameCount / elapsed) * 1000;
    perfMonitor.frameCount = 0;
    perfMonitor.lastCheck = now;
    
    // Detect throttling levels
    if (perfMonitor.avgFps < 30) {
      perfMonitor.throttleLevel = 'heavy';
    } else if (perfMonitor.avgFps < 45) {
      perfMonitor.throttleLevel = 'light';
    } else {
      perfMonitor.throttleLevel = 'none';
    }
  }
  
  return perfMonitor;
}

export function getQualitySettings(throttleLevel: string) {
  switch (throttleLevel) {
    case 'heavy':
      return {
        shadowMapSize: 256,
        trafficCount: 3,
        chunkDetail: 'low',
        particlesEnabled: false,
      };
    case 'light':
      return {
        shadowMapSize: 512,
        trafficCount: 5,
        chunkDetail: 'medium',
        particlesEnabled: false,
      };
    default:
      return {
        shadowMapSize: 1024,
        trafficCount: 8,
        chunkDetail: 'high',
        particlesEnabled: true,
      };
  }
}

// ═══════════════════════════════════════════════════════════
// 2. LOW-END DEVICE DETECTION
// ═══════════════════════════════════════════════════════════

export function detectDeviceCapability(): 'low' | 'mid' | 'high' {
  // Check hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency || 2;
  
  // Check device memory (if available)
  const memory = (navigator as any).deviceMemory || 4;
  
  // Check WebGL capabilities
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  
  let gpuTier = 'mid';
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      // Basic GPU detection
      if (renderer.includes('Mali-4') || renderer.includes('Adreno 3')) {
        gpuTier = 'low';
      } else if (renderer.includes('Apple') || renderer.includes('Adreno 6')) {
        gpuTier = 'high';
      }
    }
  }
  
  // Composite score
  if (cores <= 2 || memory <= 2 || gpuTier === 'low') {
    return 'low';
  } else if (cores >= 6 && memory >= 6 && gpuTier === 'high') {
    return 'high';
  }
  
  return 'mid';
}

// ═══════════════════════════════════════════════════════════
// 3. QUIZ INTERRUPTION HANDLING
// ═══════════════════════════════════════════════════════════

export function handleQuizInterruption(
  reason: 'visibility' | 'focus' | 'error',
  currentQuestion: any,
  onRestore: () => void
) {
  // Store interrupted quiz state
  const interruptedState = {
    questionId: currentQuestion?.id,
    timestamp: Date.now(),
    reason,
  };
  
  sessionStorage.setItem('quiz-interrupted', JSON.stringify(interruptedState));
  
  // On restore, check if quiz should resume
  const restore = () => {
    const stored = sessionStorage.getItem('quiz-interrupted');
    if (!stored) return;
    
    const state = JSON.parse(stored);
    const elapsed = Date.now() - state.timestamp;
    
    // Only restore if within 5 minutes
    if (elapsed < 5 * 60 * 1000) {
      onRestore();
    }
    
    sessionStorage.removeItem('quiz-interrupted');
  };
  
  return restore;
}

// ═══════════════════════════════════════════════════════════
// 4. VISIBILITY CHANGE HANDLING
// ═══════════════════════════════════════════════════════════

export function setupVisibilityHandling(
  onHidden: () => void,
  onVisible: () => void
) {
  let wasHidden = false;
  
  const handleVisibilityChange = () => {
    if (document.hidden) {
      wasHidden = true;
      onHidden();
    } else if (wasHidden) {
      wasHidden = false;
      onVisible();
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // iOS Safari specific
  window.addEventListener('pagehide', onHidden);
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) onVisible();
  });
  
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', onHidden);
  };
}

// ═══════════════════════════════════════════════════════════
// 5. TOUCH INPUT EDGE CASES
// ═══════════════════════════════════════════════════════════

export function sanitizeTouchInput(
  rawSteering: number,
  rawThrottle: number,
  rawBrake: number
) {
  // Handle NaN from division by zero
  const steering = Number.isFinite(rawSteering) ? rawSteering : 0;
  const throttle = Number.isFinite(rawThrottle) ? rawThrottle : 0;
  const brake = Number.isFinite(rawBrake) ? rawBrake : 0;
  
  // Clamp values
  return {
    steering: Math.max(-1, Math.min(1, steering)),
    throttle: Math.max(0, Math.min(1, throttle)),
    brake: Math.max(0, Math.min(1, brake)),
  };
}

// ═══════════════════════════════════════════════════════════
// 6. PHYSICS EXPLOSION PREVENTION
// ═══════════════════════════════════════════════════════════

export function clampPhysicsDelta(rawDelta: number): number {
  // Prevent physics explosion after tab switch
  // Max 50ms step (20 FPS floor)
  return Math.min(rawDelta, 0.05);
}

export function detectPhysicsAnomaly(
  velocity: { x: number; y: number; z: number },
  position: { x: number; y: number; z: number }
): boolean {
  // Check for NaN
  if (!Number.isFinite(velocity.x + velocity.y + velocity.z)) {
    return true;
  }
  
  // Check for extreme values
  const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
  if (speed > 1000) return true;  // Way over max speed
  
  // Check if vehicle fell through world
  if (position.y < -50) return true;
  
  return false;
}

export function resetVehiclePhysics(
  rigidBody: any,
  safePosition: [number, number, number]
) {
  rigidBody.setTranslation({ x: safePosition[0], y: safePosition[1], z: safePosition[2] }, true);
  rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

// ═══════════════════════════════════════════════════════════
// 7. MEMORY LEAK PREVENTION
// ═══════════════════════════════════════════════════════════

export function createDisposableGeometry<T extends { dispose: () => void }>(
  factory: () => T
): { get: () => T; dispose: () => void } {
  let instance: T | null = null;
  
  return {
    get: () => {
      if (!instance) {
        instance = factory();
      }
      return instance;
    },
    dispose: () => {
      if (instance) {
        instance.dispose();
        instance = null;
      }
    },
  };
}

// ═══════════════════════════════════════════════════════════
// 8. LOCALSTORAGE QUOTA HANDLING
// ═══════════════════════════════════════════════════════════

export function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      // Try to clear old data
      console.warn('[Storage] Quota exceeded, clearing old saves');
      
      // Remove backup first
      localStorage.removeItem('ali-aigoo-backup');
      
      // Retry
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

Performance Optimizations
typescript// src/utils/optimizations.ts

// ═══════════════════════════════════════════════════════════
// 1. DRAW CALL BUDGET MONITORING
// ═══════════════════════════════════════════════════════════

export function logRenderInfo(gl: WebGLRenderingContext, renderer: any) {
  if (process.env.NODE_ENV !== 'development') return;
  
  const info = renderer.info;
  console.log(`
    Draw calls: ${info.render.calls}
    Triangles: ${info.render.triangles}
    Geometries: ${info.memory.geometries}
    Textures: ${info.memory.textures}
  `);
  
  // Warn if over budget
  if (info.render.calls > 100) {
    console.warn('[Performance] Draw calls over budget (100)');
  }
  if (info.render.triangles > 100000) {
    console.warn('[Performance] Triangles over budget (100K)');
  }
}

// ═══════════════════════════════════════════════════════════
// 2. FRUSTUM CULLING HELPERS
// ═══════════════════════════════════════════════════════════

import { Frustum, Matrix4, Box3, Vector3 } from 'three';

const frustum = new Frustum();
const projScreenMatrix = new Matrix4();

export function isInFrustum(
  camera: any,
  objectPosition: Vector3,
  radius: number
): boolean {
  projScreenMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  frustum.setFromProjectionMatrix(projScreenMatrix);
  
  return frustum.containsPoint(objectPosition);
}

// ═══════════════════════════════════════════════════════════
// 3. OBJECT POOLING UTILITY
// ═══════════════════════════════════════════════════════════

export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  
  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    initialSize: number = 10
  ) {
    this.factory = factory;
    this.reset = reset;
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }
  
  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }
  
  release(obj: T): void {
    this.reset(obj);
    this.pool.push(obj);
  }
  
  get size(): number {
    return this.pool.length;
  }
}

// ═══════════════════════════════════════════════════════════
// 4. THROTTLED STORE UPDATES
// ═══════════════════════════════════════════════════════════

export function createThrottledUpdater<T>(
  updateFn: (value: T) => void,
  minInterval: number = 16 // ~60fps
) {
  let lastUpdate = 0;
  let pendingValue: T | null = null;
  let rafId: number | null = null;
  
  return (value: T) => {
    const now = performance.now();
    
    if (now - lastUpdate >= minInterval) {
      updateFn(value);
      lastUpdate = now;
      pendingValue = null;
    } else {
      pendingValue = value;
      
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          if (pendingValue !== null) {
            updateFn(pendingValue);
            lastUpdate = performance.now();
            pendingValue = null;
          }
          rafId = null;
        });
      }
    }
  };
}

// ═══════════════════════════════════════════════════════════
// 5. TEXTURE OPTIMIZATION
// ═══════════════════════════════════════════════════════════

import { TextureLoader, NearestFilter, LinearMipMapLinearFilter } from 'three';

export function loadOptimizedTexture(
  url: string,
  isPixelArt: boolean = true
) {
  const loader = new TextureLoader();
  
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => {
        if (isPixelArt) {
          // Crisp pixels for voxel aesthetic
          texture.magFilter = NearestFilter;
          texture.minFilter = NearestFilter;
        } else {
          texture.minFilter = LinearMipMapLinearFilter;
        }
        
        texture.generateMipmaps = !isPixelArt;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

// ═══════════════════════════════════════════════════════════
// 6. GEOMETRY MERGING FOR STATIC OBJECTS
// ═══════════════════════════════════════════════════════════

import { BufferGeometry, Mesh } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeStaticMeshes(meshes: Mesh[]): BufferGeometry | null {
  if (meshes.length === 0) return null;
  
  const geometries = meshes.map((mesh) => {
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    return geo;
  });
  
  return mergeGeometries(geometries, false);
}

// ═══════════════════════════════════════════════════════════
// 7. MOBILE-SPECIFIC OPTIMIZATIONS
// ═══════════════════════════════════════════════════════════

export function getMobileOptimizations() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
  
  if (!isMobile) {
    return {
      dpr: Math.min(window.devicePixelRatio, 2),
      shadowsEnabled: true,
      shadowMapSize: 1024,
      antialias: true,
      maxTraffic: 8,
    };
  }
  
  // Mobile optimizations
  return {
    dpr: Math.min(window.devicePixelRatio, 1.5),  // Cap DPR
    shadowsEnabled: true,
    shadowMapSize: 512,                            // Smaller shadows
    antialias: false,                              // No AA on mobile
    maxTraffic: 5,                                 // Fewer NPCs
  };
}

// ═══════════════════════════════════════════════════════════
// 8. ASSET PRELOADING STRATEGY
// ═══════════════════════════════════════════════════════════

export async function preloadGameAssets(
  onProgress: (loaded: number, total: number) => void
) {
  const assets = [
    // Critical (load first)
    { url: '/models/vehicle/beetle.glb', priority: 1 },
    { url: '/data/questions.json', priority: 1 },
    
    // Road chunks (load second)
    { url: '/models/road/city_01.glb', priority: 2 },
    { url: '/models/road/highway_01.glb', priority: 2 },
    { url: '/models/road/rural_01.glb', priority: 2 },
    
    // Variations (load last)
    { url: '/models/road/city_02.glb', priority: 3 },
    { url: '/models/road/city_03.glb', priority: 3 },
    // ... etc
  ];
  
  const sorted = assets.sort((a, b) => a.priority - b.priority);
  let loaded = 0;
  
  for (const asset of sorted) {
    await fetch(asset.url);  // Trigger cache
    loaded++;
    onProgress(loaded, sorted.length);
  }
}
```

---

### Final File Structure
```
src/
├── main.tsx                    # Entry point
├── App.tsx                     # Root component
├── Game.tsx                    # Main game orchestrator
├── Game.css
│
├── stores/
│   └── gameStore.ts            # Zustand state management
│
├── systems/
│   ├── RoadChunkManager.ts     # Infinite road generation
│   ├── TrafficManager.ts       # NPC vehicle AI
│   ├── QuizManager.ts          # Quiz trigger & selection
│   └── ProgressManager.ts      # Save/load persistence
│
├── hooks/
│   └── useTouchControls.ts     # Touch input handling
│
├── components/
│   ├── Vehicle/
│   │   ├── Vehicle.tsx         # Vehicle mesh & physics
│   │   └── VehicleController.ts # Physics update loop
│   │
│   ├── Road/
│   │   └── RoadChunks.tsx      # Road chunk renderer
│   │
│   ├── Traffic/
│   │   ├── TrafficRenderer.tsx # Instanced NPC rendering
│   │   └── NPCVehicleMesh.tsx  # NPC mesh definition
│   │
│   ├── Camera/
│   │   └── GameCamera.tsx      # Follow camera
│   │
│   ├── Lighting/
│   │   └── Lighting.tsx        # Scene lighting
│   │
│   ├── Environment/
│   │   └── Skybox.tsx          # Gradient sky
│   │
│   ├── Quiz/
│   │   ├── QuizOverlay.tsx     # Quiz modal
│   │   └── QuizOverlay.css
│   │
│   └── UI/
│       ├── GameHUD.tsx         # In-game HUD
│       ├── GameHUD.css
│       ├── TouchOverlay.tsx    # Touch feedback
│       ├── TouchOverlay.css
│       ├── MainMenu.tsx        # Title screen
│       ├── MainMenu.css
│       ├── PauseMenu.tsx       # Pause screen
│       ├── PauseMenu.css
│       ├── LoadingScreen.tsx   # Asset loading
│       └── LoadingScreen.css
│
├── utils/
│   ├── edgeCases.ts            # Error handling
│   └── optimizations.ts        # Performance utilities
│
└── data/
    └── questions.json          # Quiz question bank (239 Q's)

public/
├── models/
│   ├── vehicle/
│   │   └── beetle.glb
│   └── road/
│       ├── city_01-05.glb
│       ├── highway_01-05.glb
│       └── rural_01-05.glb
│
└── data/
    └── questions.json

Performance Budget Summary
MetricTargetImplementationDraw calls<100Instanced traffic (1), merged road chunksTriangles<100KVoxel aesthetic, LOD fallbacksFrame rate60 FPSFixed physics step, throttled updatesMemory<150MBObject pooling, geometry disposalLoad time<3sAsset prioritization, code splittingInput latency<16msDirect touch → store updates

That completes the core implementation. Want me to continue with any of the following?

Keyboard controls (desktop WASD fallback)
Audio system (engine sounds, quiz feedback)
Chibi zombie pedestrian hazards
Cat companion UI (Mya & Gracie dashboard helpers)
4Jan 21Architected interactive cat companion system for educational gameArchitected interactive cat companion system for educational gameStep 13: Cat Companion UI (Mya & Gracie)
typescript// src/systems/CatCompanionManager.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// CAT COMPANION CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CAT_CONFIG = {
  // Personality traits
  MYA: {
    name: 'Mya',
    role: 'navigator',                    // Gives directions & hints
    personality: 'calm',                  // Measured, supportive
    color: '#ff9ff3',                     // Soft pink
    emoji: '🐱',
  },
  GRACIE: {
    name: 'Gracie',
    role: 'hype',                         // Reactions & encouragement
    personality: 'energetic',             // Excitable, expressive
    color: '#ffeaa7',                     // Soft yellow
    emoji: '😺',
  },
  
  // Timing
  IDLE_COMMENT_INTERVAL: 45000,           // Random comment every 45s
  REACTION_DURATION: 3000,                // How long reactions show
  HINT_DELAY: 8000,                       // Delay before quiz hint offered
  
  // Behavior triggers
  SPEED_WARNING_THRESHOLD: 55,            // MPH to trigger speed warning
  STREAK_CELEBRATION_THRESHOLD: 3,        // Streak count to celebrate
  MILESTONE_MILES: [100, 500, 1000, 1500, 2000, 2500],
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

type CatName = 'mya' | 'gracie';
type CatMood = 'neutral' | 'happy' | 'excited' | 'worried' | 'sleepy' | 'thinking';
type MessagePriority = 'low' | 'medium' | 'high';

interface CatMessage {
  id: string;
  cat: CatName;
  text: string;
  mood: CatMood;
  priority: MessagePriority;
  duration: number;
  timestamp: number;
}

interface CatState {
  mood: CatMood;
  isAnimating: boolean;
  lastSpoke: number;
}

// ═══════════════════════════════════════════════════════════
// DIALOGUE BANKS
// ═══════════════════════════════════════════════════════════

const DIALOGUE = {
  // ─────────────────────────────────────────────────────────
  // QUIZ REACTIONS
  // ─────────────────────────────────────────────────────────
  quizCorrect: {
    mya: [
      "Nicely done, Ali. You're learning fast.",
      "Correct! Your T would be proud.",
      "That's the one. Steady progress.",
      "Perfect. You've got good instincts.",
      "Right answer. Keep that focus.",
    ],
    gracie: [
      "대박!! You got it! 🎉",
      "YESSS! Ali, you're amazing!",
      "Woohoo! Brain power activated!",
      "That's my human! So smart!",
      "아이고, you're on FIRE! 🔥",
    ],
  },
  
  quizWrong: {
    mya: [
      "That's okay. We'll get the next one.",
      "Remember this for the real test, Ali.",
      "Learning moment. No worries.",
      "The correct answer is worth remembering.",
      "Mistakes help us learn. Onward.",
    ],
    gracie: [
      "Aww, so close! You've got this!",
      "아이고... but hey, next one's yours!",
      "Shake it off! We believe in you!",
      "It happens! Still the best driver ever!",
      "Quick reset! *paw bump* 🐾",
    ],
  },
  
  quizHint: {
    mya: [
      "Think about what you learned in the guide...",
      "Consider the safest option for everyone.",
      "What would a defensive driver do?",
      "Remember: safety first, always.",
      "Take your time. No rush here.",
    ],
    gracie: [
      "Ooh ooh! I think I know this one!",
      "Psst... trust your gut feeling!",
      "*whispers* You studied this!",
      "You've totally seen this before!",
      "C'mon brain, you can do it!",
    ],
  },
  
  // ─────────────────────────────────────────────────────────
  // STREAK REACTIONS
  // ─────────────────────────────────────────────────────────
  streak: {
    mya: [
      "Impressive streak. Stay focused.",
      "{count} in a row. Well done.",
      "Consistent performance. I'm impressed.",
      "You're really getting these down.",
    ],
    gracie: [
      "{count} STREAK! 대박대박대박!!",
      "UNSTOPPABLE! {count} correct!",
      "Ali's on a ROLL! 🎊",
      "Streak mode ACTIVATED! {count}!",
    ],
  },
  
  // ─────────────────────────────────────────────────────────
  // DRIVING COMMENTS
  // ─────────────────────────────────────────────────────────
  speedWarning: {
    mya: [
      "Ali, we're getting a bit fast.",
      "Might want to ease off the gas.",
      "Speed limit is usually 60 here.",
      "Let's keep it safe, okay?",
    ],
    gracie: [
      "Wheeee—wait, too fast too fast!",
      "아이고! My fur is flying back!",
      "Slow down, speed racer!",
      "*grips seat* We're not in a race!",
    ],
  },
  
  braking: {
    mya: [
      "Good braking distance.",
      "Smooth stop. Well done.",
      "Remember: brake early, brake smooth.",
    ],
    gracie: [
      "Woah! *slides forward* Nice stop!",
      "Eep! Good reflexes!",
      "*adjusts position* All good!",
    ],
  },
  
  // ─────────────────────────────────────────────────────────
  // MILESTONE CELEBRATIONS
  // ─────────────────────────────────────────────────────────
  milestone: {
    mya: [
      "{miles} miles down. You're doing great.",
      "Checkpoint: {miles} miles. Steady progress.",
      "{miles} miles! Spokane's getting closer.",
      "Great driving. {miles} miles complete.",
    ],
    gracie: [
      "{miles} MILES! 🎉 Party time!",
      "WE DID IT! {miles} miles! 대박!",
      "{miles} down! Spokane here we come!",
      "Milestone! *happy dance* {miles} miles!",
    ],
  },
  
  // ─────────────────────────────────────────────────────────
  // BIOME TRANSITIONS
  // ─────────────────────────────────────────────────────────
  biomeChange: {
    city: {
      mya: [
        "Urban area. Watch for pedestrians.",
        "City driving requires extra attention.",
        "More intersections ahead. Stay alert.",
      ],
      gracie: [
        "Ooh, city lights! So pretty!",
        "Look at all the buildings!",
        "City vibes! 🌃",
      ],
    },
    highway: {
      mya: [
        "Highway driving. Maintain your lane.",
        "Open road. Keep consistent speed.",
        "Good highway etiquette is key.",
      ],
      gracie: [
        "Highway time! Let's cruise!",
        "Open road! *stretches* Nice.",
        "Vroom vroom! Highway mode!",
      ],
    },
    rural: {
      mya: [
        "Rural roads. Watch for wildlife.",
        "Less traffic, but stay attentive.",
        "Washington countryside. Beautiful.",
      ],
      gracie: [
        "Trees! So many trees! 🌲",
        "Ooh, is that a farm? Moo!",
        "Country roads! *hums*",
      ],
    },
  },
  
  // ─────────────────────────────────────────────────────────
  // IDLE CHATTER
  // ─────────────────────────────────────────────────────────
  idle: {
    mya: [
      "The road stretches on. We're making good time.",
      "*yawn* Let me know if you need a hint.",
      "Your form is improving, Ali.",
      "T will be so proud when you pass that test.",
      "Stay hydrated. That goes for both of us.",
      "Remember: mirrors, signal, maneuver.",
      "*watching the road* You've got good focus.",
    ],
    gracie: [
      "*kneading the seat* This is comfy.",
      "Are we there yet? ...Just kidding!",
      "I spy with my little eye... a road!",
      "*grooming* Gotta look good for Spokane.",
      "What if zombies like K-pop too? 🤔",
      "*tail swishing* Adventure time!",
      "You're the best driver, Ali. Fact.",
    ],
  },
  
  // ─────────────────────────────────────────────────────────
  // GAME START/END
  // ─────────────────────────────────────────────────────────
  gameStart: {
    mya: [
      "Ready when you are, Ali. Let's make it to Spokane.",
      "Seatbelts on. Mirrors adjusted. Let's go.",
    ],
    gracie: [
      "ROAD TRIP! This is gonna be awesome!",
      "Spokane or bust! Let's gooo! 🚗",
    ],
  },
  
  gameResume: {
    mya: [
      "Welcome back. Ready to continue?",
      "Shall we pick up where we left off?",
    ],
    gracie: [
      "You're back! I missed you! Well, I napped.",
      "Ali! *purrs* Let's keep going!",
    ],
  },
};

// ═══════════════════════════════════════════════════════════
// CAT COMPANION MANAGER HOOK
// ═══════════════════════════════════════════════════════════

export function useCatCompanionManager() {
  // Store
  const phase = useGameStore((s) => s.game.phase);
  const mileage = useGameStore((s) => s.game.mileage);
  const velocity = useGameStore((s) => s.vehicle.velocity);
  const currentBiome = useGameStore((s) => s.game.currentBiome);
  const streak = useGameStore((s) => s.economy.streak);
  const quizActive = useGameStore((s) => s.quiz.isActive);
  const currentQuestion = useGameStore((s) => s.quiz.currentQuestion);
  
  // State
  const [messageQueue, setMessageQueue] = useState<CatMessage[]>([]);
  const [activeMessage, setActiveMessage] = useState<CatMessage | null>(null);
  const [catStates, setCatStates] = useState<Record<CatName, CatState>>({
    mya: { mood: 'neutral', isAnimating: false, lastSpoke: 0 },
    gracie: { mood: 'neutral', isAnimating: false, lastSpoke: 0 },
  });
  
  // Refs
  const lastMilestone = useRef(0);
  const lastBiome = useRef(currentBiome);
  const idleTimer = useRef<NodeJS.Timeout | null>(null);
  const hintTimer = useRef<NodeJS.Timeout | null>(null);
  const messageId = useRef(0);

  // ─────────────────────────────────────────────────────────
  // QUEUE MESSAGE
  // ─────────────────────────────────────────────────────────

  const queueMessage = useCallback((
    cat: CatName,
    text: string,
    mood: CatMood = 'neutral',
    priority: MessagePriority = 'medium',
    duration: number = CAT_CONFIG.REACTION_DURATION
  ) => {
    const message: CatMessage = {
      id: `msg-${messageId.current++}`,
      cat,
      text,
      mood,
      priority,
      duration,
      timestamp: Date.now(),
    };
    
    setMessageQueue((prev) => {
      // High priority messages go to front
      if (priority === 'high') {
        return [message, ...prev];
      }
      return [...prev, message];
    });
  }, []);

  // ─────────────────────────────────────────────────────────
  // GET RANDOM DIALOGUE
  // ─────────────────────────────────────────────────────────

  const getDialogue = useCallback((
    category: keyof typeof DIALOGUE,
    cat: CatName,
    replacements?: Record<string, string | number>
  ): string => {
    const pool = (DIALOGUE[category] as any)[cat];
    if (!pool || pool.length === 0) return '';
    
    let text = pool[Math.floor(Math.random() * pool.length)];
    
    // Apply replacements
    if (replacements) {
      Object.entries(replacements).forEach(([key, value]) => {
        text = text.replace(`{${key}}`, String(value));
      });
    }
    
    return text;
  }, []);

  // ─────────────────────────────────────────────────────────
  // PROCESS MESSAGE QUEUE
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (activeMessage || messageQueue.length === 0) return;
    
    const next = messageQueue[0];
    setActiveMessage(next);
    setMessageQueue((prev) => prev.slice(1));
    
    // Update cat state
    setCatStates((prev) => ({
      ...prev,
      [next.cat]: {
        ...prev[next.cat],
        mood: next.mood,
        isAnimating: true,
        lastSpoke: Date.now(),
      },
    }));
    
    // Auto-dismiss after duration
    const timer = setTimeout(() => {
      setActiveMessage(null);
      setCatStates((prev) => ({
        ...prev,
        [next.cat]: {
          ...prev[next.cat],
          mood: 'neutral',
          isAnimating: false,
        },
      }));
    }, next.duration);
    
    return () => clearTimeout(timer);
  }, [activeMessage, messageQueue]);

  // ─────────────────────────────────────────────────────────
  // QUIZ REACTIONS
  // ─────────────────────────────────────────────────────────

  const reactToQuizAnswer = useCallback((isCorrect: boolean) => {
    // Alternate between cats, with Gracie more likely on correct
    const cat: CatName = isCorrect
      ? (Math.random() > 0.3 ? 'gracie' : 'mya')
      : (Math.random() > 0.5 ? 'mya' : 'gracie');
    
    const category = isCorrect ? 'quizCorrect' : 'quizWrong';
    const mood: CatMood = isCorrect ? 'excited' : 'worried';
    
    queueMessage(cat, getDialogue(category, cat), mood, 'high');
  }, [queueMessage, getDialogue]);

  const offerHint = useCallback(() => {
    if (!quizActive) return;
    
    // Mya offers strategic hints, Gracie offers encouragement
    const cat: CatName = Math.random() > 0.5 ? 'mya' : 'gracie';
    queueMessage(cat, getDialogue('quizHint', cat), 'thinking', 'medium');
  }, [quizActive, queueMessage, getDialogue]);

  // ─────────────────────────────────────────────────────────
  // QUIZ HINT TIMER
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (quizActive && currentQuestion) {
      // Start hint timer when quiz opens
      hintTimer.current = setTimeout(() => {
        offerHint();
      }, CAT_CONFIG.HINT_DELAY);
    } else {
      // Clear timer when quiz closes
      if (hintTimer.current) {
        clearTimeout(hintTimer.current);
        hintTimer.current = null;
      }
    }
    
    return () => {
      if (hintTimer.current) {
        clearTimeout(hintTimer.current);
      }
    };
  }, [quizActive, currentQuestion, offerHint]);

  // ─────────────────────────────────────────────────────────
  // STREAK CELEBRATION
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (streak > 0 && streak % CAT_CONFIG.STREAK_CELEBRATION_THRESHOLD === 0) {
      const cat: CatName = Math.random() > 0.4 ? 'gracie' : 'mya';
      queueMessage(
        cat,
        getDialogue('streak', cat, { count: streak }),
        'excited',
        'medium'
      );
    }
  }, [streak, queueMessage, getDialogue]);

  // ─────────────────────────────────────────────────────────
  // SPEED WARNING
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'driving') return;
    
    if (velocity > CAT_CONFIG.SPEED_WARNING_THRESHOLD) {
      const cat: CatName = Math.random() > 0.5 ? 'gracie' : 'mya';
      queueMessage(cat, getDialogue('speedWarning', cat), 'worried', 'high', 4000);
    }
  }, [Math.floor(velocity / 10), phase]); // Debounce by 10 MPH increments

  // ─────────────────────────────────────────────────────────
  // MILESTONE DETECTION
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    const milestone = CAT_CONFIG.MILESTONE_MILES.find(
      (m) => mileage >= m && lastMilestone.current < m
    );
    
    if (milestone) {
      lastMilestone.current = milestone;
      
      // Both cats celebrate milestones
      queueMessage(
        'gracie',
        getDialogue('milestone', 'gracie', { miles: milestone }),
        'excited',
        'high',
        4000
      );
      
      setTimeout(() => {
        queueMessage(
          'mya',
          getDialogue('milestone', 'mya', { miles: milestone }),
          'happy',
          'medium'
        );
      }, 2000);
    }
  }, [mileage, queueMessage, getDialogue]);

  // ─────────────────────────────────────────────────────────
  // BIOME CHANGE DETECTION
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (currentBiome !== lastBiome.current) {
      lastBiome.current = currentBiome;
      
      const biomeDialogue = DIALOGUE.biomeChange[currentBiome];
      const cat: CatName = Math.random() > 0.5 ? 'mya' : 'gracie';
      const pool = biomeDialogue[cat];
      const text = pool[Math.floor(Math.random() * pool.length)];
      
      queueMessage(cat, text, 'neutral', 'low');
    }
  }, [currentBiome, queueMessage]);

  // ─────────────────────────────────────────────────────────
  // IDLE CHATTER
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'driving') {
      if (idleTimer.current) clearInterval(idleTimer.current);
      return;
    }
    
    idleTimer.current = setInterval(() => {
      // Only if no recent messages
      const now = Date.now();
      const myaRecent = now - catStates.mya.lastSpoke < 30000;
      const gracieRecent = now - catStates.gracie.lastSpoke < 30000;
      
      if (myaRecent && gracieRecent) return;
      
      const cat: CatName = !myaRecent ? 'mya' : 'gracie';
      const mood: CatMood = Math.random() > 0.7 ? 'sleepy' : 'neutral';
      
      queueMessage(cat, getDialogue('idle', cat), mood, 'low');
    }, CAT_CONFIG.IDLE_COMMENT_INTERVAL);
    
    return () => {
      if (idleTimer.current) clearInterval(idleTimer.current);
    };
  }, [phase, catStates, queueMessage, getDialogue]);

  // ─────────────────────────────────────────────────────────
  // GAME START MESSAGE
  // ─────────────────────────────────────────────────────────

  const triggerGameStart = useCallback((isResume: boolean) => {
    const category = isResume ? 'gameResume' : 'gameStart';
    
    queueMessage('mya', getDialogue(category, 'mya'), 'neutral', 'high');
    setTimeout(() => {
      queueMessage('gracie', getDialogue(category, 'gracie'), 'excited', 'medium');
    }, 1500);
  }, [queueMessage, getDialogue]);

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  return {
    activeMessage,
    catStates,
    reactToQuizAnswer,
    triggerGameStart,
    queueMessage,
    config: CAT_CONFIG,
  };
}

Ready for the Cat Companion UI components? (y/k)YJan 21Architected Cat Companion UI components and integration frameworkArchitected Cat Companion UI components and integration frameworkStep 14: Cat Companion UI Components
typescript// src/components/Companions/CatCompanions.tsx

import { useEffect, useRef } from 'react';
import { useCatCompanionManager } from '../../systems/CatCompanionManager';
import { useGameStore } from '../../stores/gameStore';
import './CatCompanions.css';

// ═══════════════════════════════════════════════════════════
// CAT VISUAL CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CAT_VISUALS = {
  mya: {
    name: 'Mya',
    position: 'left',
    baseColor: '#ff9ff3',
    accentColor: '#fd79a8',
    eyeColor: '#2d3436',
    // Pixel art sprite states (CSS classes)
    sprites: {
      neutral: 'mya-neutral',
      happy: 'mya-happy',
      excited: 'mya-excited',
      worried: 'mya-worried',
      sleepy: 'mya-sleepy',
      thinking: 'mya-thinking',
    },
  },
  gracie: {
    name: 'Gracie',
    position: 'right',
    baseColor: '#ffeaa7',
    accentColor: '#fdcb6e',
    eyeColor: '#2d3436',
    sprites: {
      neutral: 'gracie-neutral',
      happy: 'gracie-happy',
      excited: 'gracie-excited',
      worried: 'gracie-worried',
      sleepy: 'gracie-sleepy',
      thinking: 'gracie-thinking',
    },
  },
};

// ═══════════════════════════════════════════════════════════
// MAIN CAT COMPANIONS COMPONENT
// ═══════════════════════════════════════════════════════════

export function CatCompanions() {
  const phase = useGameStore((s) => s.game.phase);
  const { activeMessage, catStates, triggerGameStart } = useCatCompanionManager();
  
  // Track if we've shown start message
  const hasShownStart = useRef(false);

  // Trigger game start message
  useEffect(() => {
    if (phase === 'driving' && !hasShownStart.current) {
      hasShownStart.current = true;
      const hasSave = localStorage.getItem('ali-aigoo-save') !== null;
      triggerGameStart(hasSave);
    }
  }, [phase, triggerGameStart]);

  // Hide during menu
  if (phase === 'menu') return null;

  return (
    <div className="cat-companions">
      {/* Mya (left side) */}
      <CatAvatar
        cat="mya"
        config={CAT_VISUALS.mya}
        state={catStates.mya}
        message={activeMessage?.cat === 'mya' ? activeMessage : null}
      />

      {/* Gracie (right side) */}
      <CatAvatar
        cat="gracie"
        config={CAT_VISUALS.gracie}
        state={catStates.gracie}
        message={activeMessage?.cat === 'gracie' ? activeMessage : null}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CAT AVATAR COMPONENT
// ═══════════════════════════════════════════════════════════

interface CatAvatarProps {
  cat: 'mya' | 'gracie';
  config: typeof CAT_VISUALS.mya;
  state: { mood: string; isAnimating: boolean };
  message: { text: string; mood: string } | null;
}

function CatAvatar({ cat, config, state, message }: CatAvatarProps) {
  const spriteClass = config.sprites[state.mood as keyof typeof config.sprites] || config.sprites.neutral;

  return (
    <div className={`cat-avatar cat-${config.position}`}>
      {/* Speech bubble */}
      {message && (
        <div className={`speech-bubble bubble-${config.position}`}>
          <span className="bubble-name">{config.name}</span>
          <p className="bubble-text">{message.text}</p>
          <div className="bubble-tail" />
        </div>
      )}

      {/* Cat sprite container */}
      <div
        className={`cat-sprite ${spriteClass} ${state.isAnimating ? 'animating' : ''}`}
        style={{ '--cat-color': config.baseColor, '--cat-accent': config.accentColor } as React.CSSProperties}
      >
        <CatPixelArt cat={cat} mood={state.mood} />
      </div>

      {/* Name tag */}
      <div className="cat-nametag" style={{ backgroundColor: config.baseColor }}>
        {config.name}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CAT PIXEL ART (SVG-based for crisp scaling)
// ═══════════════════════════════════════════════════════════

interface CatPixelArtProps {
  cat: 'mya' | 'gracie';
  mood: string;
}

function CatPixelArt({ cat, mood }: CatPixelArtProps) {
  const config = CAT_VISUALS[cat];
  
  // Eye states based on mood
  const getEyeState = () => {
    switch (mood) {
      case 'excited': return 'sparkle';
      case 'happy': return 'happy';
      case 'worried': return 'wide';
      case 'sleepy': return 'closed';
      case 'thinking': return 'side';
      default: return 'normal';
    }
  };

  const eyeState = getEyeState();

  return (
    <svg
      viewBox="0 0 32 32"
      className="cat-svg"
      style={{ imageRendering: 'pixelated' }}
    >
      {/* ─────────────────────────────────────────────────────
          CAT BODY (chibi voxel style)
          ───────────────────────────────────────────────────── */}
      
      {/* Ears */}
      <polygon
        points="6,8 9,2 12,8"
        fill={config.baseColor}
        className="cat-ear left"
      />
      <polygon
        points="20,8 23,2 26,8"
        fill={config.baseColor}
        className="cat-ear right"
      />
      
      {/* Inner ears */}
      <polygon
        points="7,7 9,4 11,7"
        fill={config.accentColor}
      />
      <polygon
        points="21,7 23,4 25,7"
        fill={config.accentColor}
      />

      {/* Head */}
      <rect x="6" y="6" width="20" height="16" rx="4" fill={config.baseColor} />

      {/* Face markings (Mya has stripes, Gracie has spots) */}
      {cat === 'mya' && (
        <>
          <rect x="8" y="10" width="2" height="4" fill={config.accentColor} opacity="0.5" />
          <rect x="22" y="10" width="2" height="4" fill={config.accentColor} opacity="0.5" />
        </>
      )}
      {cat === 'gracie' && (
        <>
          <circle cx="10" cy="12" r="1.5" fill={config.accentColor} opacity="0.5" />
          <circle cx="22" cy="12" r="1.5" fill={config.accentColor} opacity="0.5" />
        </>
      )}

      {/* Eyes */}
      <CatEyes eyeState={eyeState} />

      {/* Nose */}
      <polygon points="16,15 14,17 18,17" fill={config.accentColor} />

      {/* Mouth (changes with mood) */}
      <CatMouth mood={mood} />

      {/* Whiskers */}
      <g stroke={config.eyeColor} strokeWidth="0.5" opacity="0.6">
        <line x1="4" y1="15" x2="10" y2="14" />
        <line x1="4" y1="17" x2="10" y2="17" />
        <line x1="22" y1="14" x2="28" y2="15" />
        <line x1="22" y1="17" x2="28" y2="17" />
      </g>

      {/* Body (simplified, mostly hidden) */}
      <ellipse cx="16" cy="26" rx="8" ry="5" fill={config.baseColor} />

      {/* Paws (visible at bottom) */}
      <ellipse cx="11" cy="30" rx="3" ry="2" fill={config.baseColor} />
      <ellipse cx="21" cy="30" rx="3" ry="2" fill={config.baseColor} />
      
      {/* Paw pads */}
      <circle cx="11" cy="30" r="1" fill={config.accentColor} />
      <circle cx="21" cy="30" r="1" fill={config.accentColor} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// CAT EYES SUB-COMPONENT
// ═══════════════════════════════════════════════════════════

function CatEyes({ eyeState }: { eyeState: string }) {
  const eyeColor = '#2d3436';
  
  switch (eyeState) {
    case 'sparkle':
      return (
        <g className="eyes-sparkle">
          {/* Large sparkling eyes */}
          <ellipse cx="11" cy="12" rx="2.5" ry="3" fill={eyeColor} />
          <ellipse cx="21" cy="12" rx="2.5" ry="3" fill={eyeColor} />
          {/* Sparkle highlights */}
          <circle cx="10" cy="11" r="1" fill="#ffffff" />
          <circle cx="20" cy="11" r="1" fill="#ffffff" />
          <circle cx="12" cy="13" r="0.5" fill="#ffffff" />
          <circle cx="22" cy="13" r="0.5" fill="#ffffff" />
        </g>
      );
    
    case 'happy':
      return (
        <g className="eyes-happy">
          {/* Curved happy eyes (^_^) */}
          <path d="M9,12 Q11,10 13,12" stroke={eyeColor} strokeWidth="1.5" fill="none" />
          <path d="M19,12 Q21,10 23,12" stroke={eyeColor} strokeWidth="1.5" fill="none" />
        </g>
      );
    
    case 'wide':
      return (
        <g className="eyes-wide">
          {/* Wide worried eyes */}
          <circle cx="11" cy="12" r="3" fill="#ffffff" stroke={eyeColor} strokeWidth="1" />
          <circle cx="21" cy="12" r="3" fill="#ffffff" stroke={eyeColor} strokeWidth="1" />
          <circle cx="11" cy="12" r="1.5" fill={eyeColor} />
          <circle cx="21" cy="12" r="1.5" fill={eyeColor} />
        </g>
      );
    
    case 'closed':
      return (
        <g className="eyes-closed">
          {/* Sleeping eyes (-_-) */}
          <line x1="9" y1="12" x2="13" y2="12" stroke={eyeColor} strokeWidth="1.5" />
          <line x1="19" y1="12" x2="23" y2="12" stroke={eyeColor} strokeWidth="1.5" />
        </g>
      );
    
    case 'side':
      return (
        <g className="eyes-side">
          {/* Looking to the side (thinking) */}
          <ellipse cx="11" cy="12" rx="2" ry="2.5" fill={eyeColor} />
          <ellipse cx="21" cy="12" rx="2" ry="2.5" fill={eyeColor} />
          {/* Pupils shifted */}
          <circle cx="12" cy="12" r="0.8" fill="#ffffff" />
          <circle cx="22" cy="12" r="0.8" fill="#ffffff" />
        </g>
      );
    
    default: // normal
      return (
        <g className="eyes-normal">
          <ellipse cx="11" cy="12" rx="2" ry="2.5" fill={eyeColor} />
          <ellipse cx="21" cy="12" rx="2" ry="2.5" fill={eyeColor} />
          <circle cx="10" cy="11" r="0.8" fill="#ffffff" />
          <circle cx="20" cy="11" r="0.8" fill="#ffffff" />
        </g>
      );
  }
}

// ═══════════════════════════════════════════════════════════
// CAT MOUTH SUB-COMPONENT
// ═══════════════════════════════════════════════════════════

function CatMouth({ mood }: { mood: string }) {
  const mouthColor = '#2d3436';
  
  switch (mood) {
    case 'excited':
      return (
        <g className="mouth-excited">
          {/* Big open smile */}
          <path d="M13,18 Q16,22 19,18" fill={mouthColor} />
          <path d="M14,18 Q16,20 18,18" fill="#ff9ff3" /> {/* Tongue */}
        </g>
      );
    
    case 'happy':
      return (
        <path
          d="M13,18 Q16,20 19,18"
          stroke={mouthColor}
          strokeWidth="1"
          fill="none"
          className="mouth-happy"
        />
      );
    
    case 'worried':
      return (
        <path
          d="M14,19 Q16,18 18,19"
          stroke={mouthColor}
          strokeWidth="1"
          fill="none"
          className="mouth-worried"
        />
      );
    
    case 'sleepy':
      return (
        <ellipse cx="16" cy="18" rx="1.5" ry="1" fill={mouthColor} className="mouth-sleepy" />
      );
    
    default:
      return (
        <g className="mouth-neutral">
          <line x1="16" y1="17" x2="16" y2="18" stroke={mouthColor} strokeWidth="1" />
          <path d="M14,18 Q16,19 18,18" stroke={mouthColor} strokeWidth="0.8" fill="none" />
        </g>
      );
  }
}
css/* src/components/Companions/CatCompanions.css */

/* ═══════════════════════════════════════════════════════════
   CONTAINER
   ═══════════════════════════════════════════════════════════ */

.cat-companions {
  position: fixed;
  bottom: 160px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 0 8px;
  pointer-events: none;
  z-index: 60;
}

/* ═══════════════════════════════════════════════════════════
   CAT AVATAR
   ═══════════════════════════════════════════════════════════ */

.cat-avatar {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 70px;
}

.cat-avatar.cat-left {
  align-items: flex-start;
}

.cat-avatar.cat-right {
  align-items: flex-end;
}

/* ═══════════════════════════════════════════════════════════
   CAT SPRITE
   ═══════════════════════════════════════════════════════════ */

.cat-sprite {
  width: 56px;
  height: 56px;
  background: rgba(18, 18, 18, 0.6);
  border-radius: 12px;
  padding: 4px;
  border: 2px solid var(--cat-color, #ff9ff3);
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.cat-sprite.animating {
  animation: cat-bounce 0.4s ease;
  border-color: var(--cat-accent, #fd79a8);
  box-shadow: 0 0 15px var(--cat-color);
}

@keyframes cat-bounce {
  0%, 100% { transform: translateY(0); }
  25% { transform: translateY(-6px); }
  50% { transform: translateY(-3px); }
  75% { transform: translateY(-5px); }
}

.cat-svg {
  width: 100%;
  height: 100%;
}

/* ═══════════════════════════════════════════════════════════
   MOOD ANIMATIONS
   ═══════════════════════════════════════════════════════════ */

/* Excited - bouncing ears */
.cat-sprite.animating .cat-ear {
  animation: ear-wiggle 0.3s ease infinite;
}

@keyframes ear-wiggle {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(5deg); }
}

.cat-sprite.animating .cat-ear.right {
  animation-delay: 0.15s;
}

/* Sleepy - slow breathing */
.mya-sleepy .cat-svg,
.gracie-sleepy .cat-svg {
  animation: sleepy-breathe 2s ease-in-out infinite;
}

@keyframes sleepy-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

/* Thinking - slight tilt */
.mya-thinking,
.gracie-thinking {
  animation: thinking-tilt 2s ease-in-out infinite;
}

@keyframes thinking-tilt {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(3deg); }
}

/* Worried - subtle shake */
.mya-worried .cat-svg,
.gracie-worried .cat-svg {
  animation: worried-shake 0.5s ease infinite;
}

@keyframes worried-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-1px); }
  75% { transform: translateX(1px); }
}

/* Sparkle eyes animation */
.eyes-sparkle circle:nth-child(3),
.eyes-sparkle circle:nth-child(4) {
  animation: sparkle-twinkle 0.8s ease-in-out infinite;
}

@keyframes sparkle-twinkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.5); }
}

/* ═══════════════════════════════════════════════════════════
   NAME TAG
   ═══════════════════════════════════════════════════════════ */

.cat-nametag {
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: bold;
  color: #121212;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ═══════════════════════════════════════════════════════════
   SPEECH BUBBLE
   ═══════════════════════════════════════════════════════════ */

.speech-bubble {
  position: absolute;
  bottom: 75px;
  background: rgba(26, 26, 46, 0.95);
  border: 2px solid #ff00ff;
  border-radius: 12px;
  padding: 10px 14px;
  max-width: 200px;
  min-width: 120px;
  box-shadow: 0 4px 20px rgba(255, 0, 255, 0.3);
  animation: bubble-appear 0.3s ease-out;
  pointer-events: auto;
}

.speech-bubble.bubble-left {
  left: 0;
}

.speech-bubble.bubble-right {
  right: 0;
}

@keyframes bubble-appear {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.9);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.bubble-name {
  display: block;
  font-size: 10px;
  font-weight: bold;
  color: #39ff14;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.bubble-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: #ffffff;
}

/* Bubble tail (triangle pointing down) */
.bubble-tail {
  position: absolute;
  bottom: -10px;
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 10px solid #ff00ff;
}

.bubble-left .bubble-tail {
  left: 20px;
}

.bubble-right .bubble-tail {
  right: 20px;
}

.bubble-tail::after {
  content: '';
  position: absolute;
  top: -12px;
  left: -8px;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid rgba(26, 26, 46, 0.95);
}

/* ═══════════════════════════════════════════════════════════
   MOBILE ADJUSTMENTS
   ═══════════════════════════════════════════════════════════ */

@media (max-width: 400px) {
  .cat-companions {
    bottom: 140px;
  }

  .cat-avatar {
    width: 60px;
  }

  .cat-sprite {
    width: 48px;
    height: 48px;
  }

  .speech-bubble {
    max-width: 160px;
    min-width: 100px;
    padding: 8px 10px;
  }

  .bubble-text {
    font-size: 12px;
  }
}

/* ═══════════════════════════════════════════════════════════
   DURING QUIZ - MOVE CATS UP
   ═══════════════════════════════════════════════════════════ */

.quiz-active .cat-companions {
  bottom: auto;
  top: 80px;
}

.quiz-active .speech-bubble {
  bottom: auto;
  top: 75px;
}

.quiz-active .bubble-tail {
  bottom: auto;
  top: -10px;
  border-top: none;
  border-bottom: 10px solid #ff00ff;
}

.quiz-active .bubble-tail::after {
  top: 4px;
  border-top: none;
  border-bottom: 8px solid rgba(26, 26, 46, 0.95);
}
typescript// src/components/Companions/CatCompanionIntegration.tsx

import { useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useCatCompanionManager } from '../../systems/CatCompanionManager';

// ═══════════════════════════════════════════════════════════
// QUIZ ANSWER INTEGRATION
// ═══════════════════════════════════════════════════════════

export function useCatQuizIntegration() {
  const { reactToQuizAnswer } = useCatCompanionManager();
  
  // Extend the store's answerQuiz to trigger cat reactions
  const originalAnswerQuiz = useGameStore.getState().answerQuiz;
  
  useEffect(() => {
    // Wrap answerQuiz with cat reaction
    useGameStore.setState({
      answerQuiz: (selectedIndex: number) => {
        const result = originalAnswerQuiz(selectedIndex);
        
        // Trigger cat reaction after a brief delay
        setTimeout(() => {
          reactToQuizAnswer(result);
        }, 300);
        
        return result;
      },
    });
    
    // Restore original on unmount
    return () => {
      useGameStore.setState({ answerQuiz: originalAnswerQuiz });
    };
  }, [reactToQuizAnswer, originalAnswerQuiz]);
}
typescript// src/components/Companions/CatDashboard.tsx

import { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import './CatDashboard.css';

// ═══════════════════════════════════════════════════════════
// CAT DASHBOARD (expanded stats panel)
// ═══════════════════════════════════════════════════════════

export function CatDashboard() {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const mileage = useGameStore((s) => s.game.mileage);
  const zCoins = useGameStore((s) => s.economy.zCoins);
  const correctAnswers = useGameStore((s) => s.quiz.correctAnswers);
  const questionsAnswered = useGameStore((s) => s.quiz.questionsAnswered);
  const streak = useGameStore((s) => s.economy.streak);
  const phase = useGameStore((s) => s.game.phase);

  if (phase !== 'driving' && phase !== 'quiz') return null;

  const accuracy = questionsAnswered > 0
    ? Math.round((correctAnswers / questionsAnswered) * 100)
    : 0;

  const progressPercent = Math.min((mileage / 2800) * 100, 100);

  // Mya's assessment based on performance
  const getAssessment = () => {
    if (questionsAnswered < 5) return "Let's learn together!";
    if (accuracy >= 90) return "Outstanding progress, Ali!";
    if (accuracy >= 75) return "You're doing well. Keep it up.";
    if (accuracy >= 60) return "Good effort. Practice makes perfect.";
    return "We'll get there. Don't give up!";
  };

  // Gracie's reaction based on streak
  const getStreakReaction = () => {
    if (streak === 0) return "Next one's yours! 💪";
    if (streak >= 10) return "LEGENDARY! 🌟🌟🌟";
    if (streak >= 5) return "You're on fire! 🔥";
    if (streak >= 3) return "Keep it going! ⚡";
    return "Nice start! ✨";
  };

  return (
    <div className={`cat-dashboard ${isExpanded ? 'expanded' : ''}`}>
      {/* Toggle button */}
      <button
        className="dashboard-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? 'Collapse dashboard' : 'Expand dashboard'}
      >
        <span className="toggle-icon">{isExpanded ? '▼' : '▲'}</span>
        <span className="toggle-label">Cat Console</span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="dashboard-content">
          {/* Trip progress */}
          <div className="dashboard-section">
            <h4 className="section-title">🚗 Trip Progress</h4>
            <div className="progress-display">
              <div className="progress-bar-mini">
                <div
                  className="progress-fill-mini"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="progress-label">
                {mileage.toFixed(1)} / 2,800 mi
              </span>
            </div>
          </div>

          {/* Quiz stats */}
          <div className="dashboard-section">
            <h4 className="section-title">📝 Quiz Stats</h4>
            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-value">{questionsAnswered}</span>
                <span className="stat-label">Answered</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{accuracy}%</span>
                <span className="stat-label">Accuracy</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{streak}</span>
                <span className="stat-label">Streak</span>
              </div>
              <div className="stat-box">
                <span className="stat-value">{zCoins}</span>
                <span className="stat-label">Z-Coins</span>
              </div>
            </div>
          </div>

          {/* Cat assessments */}
          <div className="dashboard-section cat-assessments">
            <div className="assessment mya">
              <span className="assessment-avatar">🐱</span>
              <div className="assessment-content">
                <span className="assessment-name">Mya</span>
                <p className="assessment-text">{getAssessment()}</p>
              </div>
            </div>
            <div className="assessment gracie">
              <span className="assessment-avatar">😺</span>
              <div className="assessment-content">
                <span className="assessment-name">Gracie</span>
                <p className="assessment-text">{getStreakReaction()}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
css/* src/components/Companions/CatDashboard.css */

/* ═══════════════════════════════════════════════════════════
   DASHBOARD CONTAINER
   ═══════════════════════════════════════════════════════════ */

.cat-dashboard {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 360px;
  background: rgba(18, 18, 18, 0.95);
  border: 2px solid rgba(255, 0, 255, 0.4);
  border-bottom: none;
  border-radius: 16px 16px 0 0;
  z-index: 70;
  transition: transform 0.3s ease;
  pointer-events: auto;
}

.cat-dashboard:not(.expanded) {
  transform: translateX(-50%) translateY(calc(100% - 44px));
}

/* ═══════════════════════════════════════════════════════════
   TOGGLE BUTTON
   ═══════════════════════════════════════════════════════════ */

.dashboard-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 44px;
  background: transparent;
  border: none;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.toggle-icon {
  font-size: 10px;
  transition: transform 0.3s ease;
}

.expanded .toggle-icon {
  transform: rotate(180deg);
}

.toggle-label {
  color: #ff00ff;
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD CONTENT
   ═══════════════════════════════════════════════════════════ */

.dashboard-content {
  padding: 12px 16px 20px;
  animation: slide-up 0.3s ease;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ═══════════════════════════════════════════════════════════
   SECTIONS
   ═══════════════════════════════════════════════════════════ */

.dashboard-section {
  margin-bottom: 16px;
}

.dashboard-section:last-child {
  margin-bottom: 0;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ═══════════════════════════════════════════════════════════
   PROGRESS BAR
   ═══════════════════════════════════════════════════════════ */

.progress-display {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar-mini {
  flex: 1;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill-mini {
  height: 100%;
  background: linear-gradient(90deg, #ff00ff, #39ff14);
  border-radius: 4px;
  transition: width 0.5s ease;
}

.progress-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

/* ═══════════════════════════════════════════════════════════
   STATS GRID
   ═══════════════════════════════════════════════════════════ */

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stat-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.stat-value {
  font-size: 18px;
  font-weight: bold;
  color: #39ff14;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  margin-top: 2px;
}

/* ═══════════════════════════════════════════════════════════
   CAT ASSESSMENTS
   ═══════════════════════════════════════════════════════════ */

.cat-assessments {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.assessment {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
}

.assessment.mya {
  background: rgba(255, 159, 243, 0.1);
  border: 1px solid rgba(255, 159, 243, 0.3);
}

.assessment.gracie {
  background: rgba(255, 234, 167, 0.1);
  border: 1px solid rgba(255, 234, 167, 0.3);
}

.assessment-avatar {
  font-size: 24px;
  line-height: 1;
}

.assessment-content {
  flex: 1;
}

.assessment-name {
  display: block;
  font-size: 11px;
  font-weight: bold;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 2px;
}

.assessment.mya .assessment-name {
  color: #ff9ff3;
}

.assessment.gracie .assessment-name {
  color: #ffeaa7;
}

.assessment-text {
  margin: 0;
  font-size: 13px;
  color: #ffffff;
  line-height: 1.3;
}

/* ═══════════════════════════════════════════════════════════
   MOBILE ADJUSTMENTS
   ═══════════════════════════════════════════════════════════ */

@media (max-width: 360px) {
  .cat-dashboard {
    width: 95%;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat-value {
    font-size: 16px;
  }
}

Now let's update Game.tsx to include the cat companions:
typescript// src/Game.tsx (updated imports and render)

// Add to imports:
import { CatCompanions } from './components/Companions/CatCompanions';
import { CatDashboard } from './components/Companions/CatDashboard';
import { useCatQuizIntegration } from './components/Companions/CatCompanionIntegration';

// Add inside Game component:
export function Game() {
  // ... existing code ...
  
  // Integrate cats with quiz system
  useCatQuizIntegration();

  // ... existing code ...

  return (
    <div className={`game-container ${phase === 'quiz' ? 'quiz-active' : ''}`}>
      {/* 3D Canvas */}
      <Canvas {...CANVAS_CONFIG}>
        {/* ... existing 3D content ... */}
      </Canvas>

      {/* UI Layers */}
      <div className="ui-layer">
        {/* ... existing UI ... */}

        {/* Cat Companions (add after GameHUD) */}
        {(phase === 'driving' || phase === 'quiz') && (
          <>
            <CatCompanions />
            <CatDashboard />
          </>
        )}

        {/* ... rest of existing UI ... */}
      </div>
    </div>
  );
}

Key features implemented:
FeatureDescriptionDual personalitiesMya (calm navigator) vs Gracie (energetic hype)Contextual reactionsQuiz answers, speed warnings, milestones, biomesMood-based animationsEyes, mouth, and body change with moodSpeech bubblesAnimated appearance with tail pointing to catIdle chatterRandom comments every 45s during drivingQuiz hintsOffered after 8s if player hasn't answeredStreak celebrationsSpecial reactions at 3, 6, 9+ streaksCat DashboardExpandable stats panel with cat assessmentsKorean expressions대박, 아이고 for authentic K-pop themeMobile-optimizedRepositions during quiz, responsive sizing

Want me to continue with any of the following?

Keyboard controls (desktop WASD fallback)
Audio system (engine sounds, quiz feedback, cat meows)
Chibi zombie pedestrian hazards
3Jan 21Architected interactive zombie hazard system with stress-reactive mechanicsArchitected interactive zombie hazard system with stress-reactive mechanicsStep 15: Chibi Zombie Pedestrian Hazards
typescript// src/systems/ZombieManager.ts

import { useRef, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// ZOMBIE CONFIGURATION
// ═══════════════════════════════════════════════════════════

const ZOMBIE_CONFIG = {
  // Pool size
  MAX_ZOMBIES: 12,                        // Performance budget
  MIN_ZOMBIES: 4,                         // Minimum active
  
  // Spawn parameters
  SPAWN_AHEAD_MIN: 40,                    // Meters ahead (min)
  SPAWN_AHEAD_MAX: 120,                   // Meters ahead (max)
  SPAWN_SIDE_RANGE: 12,                   // X-axis spawn range
  DESPAWN_BEHIND: 25,                     // Meters behind to despawn
  
  // Movement speeds (meters per second)
  WANDER_SPEED: 1.5,                      // Idle wandering
  ALERT_SPEED: 3.0,                       // When player nearby
  FLEE_SPEED: 4.5,                        // Running from danger
  
  // Behavior thresholds
  ALERT_RADIUS: 20,                       // Distance to notice player
  FLEE_RADIUS: 8,                         // Distance to run away
  ROAD_CROSS_CHANCE: 0.003,               // Per-frame chance to cross
  
  // Stress reaction (higher stress = more erratic zombies)
  STRESS_SPEED_MULTIPLIER: 1.5,           // Speed boost at max stress
  STRESS_SPAWN_MULTIPLIER: 1.5,           // More zombies at max stress
  
  // Animation timing
  WANDER_DIRECTION_CHANGE: 3000,          // ms between direction changes
  GROAN_INTERVAL: 5000,                   // ms between groans
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

type ZombieType = 'walker' | 'crawler' | 'dancer' | 'sleeper' | 'fan';
type ZombieState = 'idle' | 'wander' | 'alert' | 'flee' | 'crossing' | 'dancing';

interface Zombie {
  id: number;
  active: boolean;
  type: ZombieType;
  state: ZombieState;
  
  // Position & movement
  position: Vector3;
  targetPosition: Vector3;
  rotation: number;                       // Y-axis facing
  speed: number;
  
  // Behavior timers
  stateTimer: number;
  lastDirectionChange: number;
  
  // Visual variation
  colorVariant: number;                   // 0-4 color variations
  scaleVariant: number;                   // Size variation
  animationOffset: number;                // Desync animations
}

// ═══════════════════════════════════════════════════════════
// ZOMBIE TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════

const ZOMBIE_TYPES: Record<ZombieType, {
  name: string;
  baseSpeed: number;
  behavior: string;
  spawnWeight: number;                    // Relative spawn probability
}> = {
  walker: {
    name: 'Walker',
    baseSpeed: 1.5,
    behavior: 'Shambles around aimlessly',
    spawnWeight: 40,
  },
  crawler: {
    name: 'Crawler',
    baseSpeed: 0.8,
    behavior: 'Crawls on the ground',
    spawnWeight: 15,
  },
  dancer: {
    name: 'K-Pop Zombie',
    baseSpeed: 2.0,
    behavior: 'Dances to unheard music',
    spawnWeight: 20,
  },
  sleeper: {
    name: 'Sleeper',
    baseSpeed: 0.5,
    behavior: 'Stands still until disturbed',
    spawnWeight: 15,
  },
  fan: {
    name: 'Superfan',
    baseSpeed: 3.0,
    behavior: 'Rushes toward pink cars',
    spawnWeight: 10,
  },
};

// ═══════════════════════════════════════════════════════════
// STRESS SYSTEM
// ═══════════════════════════════════════════════════════════

interface StressState {
  level: number;                          // 0 to 1
  sources: {
    speed: number;                        // From driving fast
    nearMiss: number;                     // From close calls
    wrongAnswers: number;                 // From quiz mistakes
  };
}

function calculateStress(
  velocity: number,
  recentNearMisses: number,
  wrongAnswerStreak: number
): number {
  // Speed stress (0-0.4)
  const speedStress = Math.min((velocity - 40) / 50, 1) * 0.4;
  
  // Near miss stress (0-0.3)
  const nearMissStress = Math.min(recentNearMisses / 3, 1) * 0.3;
  
  // Quiz stress (0-0.3)
  const quizStress = Math.min(wrongAnswerStreak / 3, 1) * 0.3;
  
  return Math.max(0, Math.min(1, speedStress + nearMissStress + quizStress));
}

// ═══════════════════════════════════════════════════════════
// ZOMBIE MANAGER HOOK
// ═══════════════════════════════════════════════════════════

export function useZombieManager() {
  // Store
  const playerPos = useGameStore((s) => s.vehicle.position);
  const playerVelocity = useGameStore((s) => s.vehicle.velocity);
  const phase = useGameStore((s) => s.game.phase);
  const currentBiome = useGameStore((s) => s.game.currentBiome);
  const correctAnswers = useGameStore((s) => s.quiz.correctAnswers);
  const questionsAnswered = useGameStore((s) => s.quiz.questionsAnswered);
  
  // State
  const zombies = useRef<Zombie[]>([]);
  const nextId = useRef(0);
  const nearMissCount = useRef(0);
  const nearMissDecayTimer = useRef(0);
  const stressLevel = useRef(0);

  // ─────────────────────────────────────────────────────────
  // INITIALIZE ZOMBIE POOL
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    zombies.current = Array.from({ length: ZOMBIE_CONFIG.MAX_ZOMBIES }, () =>
      createInactiveZombie(nextId.current++)
    );
  }, []);

  // ─────────────────────────────────────────────────────────
  // HELPER: Create inactive zombie
  // ─────────────────────────────────────────────────────────

  function createInactiveZombie(id: number): Zombie {
    return {
      id,
      active: false,
      type: 'walker',
      state: 'idle',
      position: new Vector3(),
      targetPosition: new Vector3(),
      rotation: 0,
      speed: 0,
      stateTimer: 0,
      lastDirectionChange: 0,
      colorVariant: Math.floor(Math.random() * 5),
      scaleVariant: 0.8 + Math.random() * 0.4,
      animationOffset: Math.random() * Math.PI * 2,
    };
  }

  // ─────────────────────────────────────────────────────────
  // HELPER: Select random zombie type (weighted)
  // ─────────────────────────────────────────────────────────

  const selectZombieType = useCallback((): ZombieType => {
    const totalWeight = Object.values(ZOMBIE_TYPES).reduce(
      (sum, t) => sum + t.spawnWeight,
      0
    );
    let random = Math.random() * totalWeight;
    
    for (const [type, config] of Object.entries(ZOMBIE_TYPES)) {
      random -= config.spawnWeight;
      if (random <= 0) {
        return type as ZombieType;
      }
    }
    
    return 'walker';
  }, []);

  // ─────────────────────────────────────────────────────────
  // HELPER: Spawn zombie
  // ─────────────────────────────────────────────────────────

  const spawnZombie = useCallback((playerZ: number): Zombie | null => {
    const slot = zombies.current.find((z) => !z.active);
    if (!slot) return null;

    const type = selectZombieType();
    const typeConfig = ZOMBIE_TYPES[type];
    
    // Random spawn position ahead of player
    const spawnDistance =
      ZOMBIE_CONFIG.SPAWN_AHEAD_MIN +
      Math.random() * (ZOMBIE_CONFIG.SPAWN_AHEAD_MAX - ZOMBIE_CONFIG.SPAWN_AHEAD_MIN);
    
    // Spawn on sidewalks/sides (avoid direct road center)
    const side = Math.random() > 0.5 ? 1 : -1;
    const xOffset = (5 + Math.random() * ZOMBIE_CONFIG.SPAWN_SIDE_RANGE) * side;

    slot.active = true;
    slot.type = type;
    slot.state = type === 'sleeper' ? 'idle' : 'wander';
    slot.position.set(xOffset, 0, playerZ - spawnDistance);
    slot.targetPosition.copy(slot.position);
    slot.rotation = Math.random() * Math.PI * 2;
    slot.speed = typeConfig.baseSpeed;
    slot.stateTimer = 0;
    slot.lastDirectionChange = Date.now();
    slot.colorVariant = Math.floor(Math.random() * 5);
    slot.scaleVariant = 0.8 + Math.random() * 0.4;

    return slot;
  }, [selectZombieType]);

  // ─────────────────────────────────────────────────────────
  // HELPER: Update zombie behavior
  // ─────────────────────────────────────────────────────────

  const updateZombieBehavior = useCallback((
    zombie: Zombie,
    playerPosition: Vector3,
    playerSpeed: number,
    stress: number,
    delta: number
  ) => {
    const distToPlayer = zombie.position.distanceTo(playerPosition);
    const now = Date.now();
    
    // Apply stress multiplier to speed
    const stressSpeedBoost = 1 + (stress * (ZOMBIE_CONFIG.STRESS_SPEED_MULTIPLIER - 1));
    const effectiveSpeed = zombie.speed * stressSpeedBoost;

    // ─────────────────────────────────────────────────────
    // STATE MACHINE
    // ─────────────────────────────────────────────────────

    switch (zombie.state) {
      case 'idle':
        // Sleepers wake up when player is close
        if (zombie.type === 'sleeper' && distToPlayer < ZOMBIE_CONFIG.ALERT_RADIUS) {
          zombie.state = 'alert';
          zombie.stateTimer = 0;
        }
        // Small chance to start wandering
        else if (Math.random() < 0.001) {
          zombie.state = 'wander';
        }
        break;

      case 'wander':
        // Change direction periodically
        if (now - zombie.lastDirectionChange > ZOMBIE_CONFIG.WANDER_DIRECTION_CHANGE) {
          zombie.lastDirectionChange = now;
          
          // Random new target nearby
          const wanderAngle = Math.random() * Math.PI * 2;
          const wanderDist = 3 + Math.random() * 5;
          zombie.targetPosition.set(
            zombie.position.x + Math.cos(wanderAngle) * wanderDist,
            0,
            zombie.position.z + Math.sin(wanderAngle) * wanderDist
          );
          
          // Small chance to cross the road
          if (Math.random() < ZOMBIE_CONFIG.ROAD_CROSS_CHANCE * (1 + stress)) {
            zombie.state = 'crossing';
            zombie.targetPosition.set(
              -zombie.position.x,  // Cross to other side
              0,
              zombie.position.z - 5
            );
          }
        }
        
        // React to player proximity
        if (distToPlayer < ZOMBIE_CONFIG.ALERT_RADIUS) {
          zombie.state = 'alert';
        }
        break;

      case 'alert':
        // Face the player
        const toPlayer = new Vector3().subVectors(playerPosition, zombie.position);
        zombie.rotation = Math.atan2(toPlayer.x, toPlayer.z);
        
        // Flee if player gets too close
        if (distToPlayer < ZOMBIE_CONFIG.FLEE_RADIUS) {
          zombie.state = 'flee';
          
          // Run away from player
          const fleeDir = new Vector3().subVectors(zombie.position, playerPosition).normalize();
          zombie.targetPosition.set(
            zombie.position.x + fleeDir.x * 15,
            0,
            zombie.position.z + fleeDir.z * 15
          );
        }
        // Return to wander if player moves away
        else if (distToPlayer > ZOMBIE_CONFIG.ALERT_RADIUS * 1.5) {
          zombie.state = 'wander';
        }
        break;

      case 'flee':
        // Run away quickly
        zombie.speed = ZOMBIE_CONFIG.FLEE_SPEED;
        
        // Return to alert state when far enough
        if (distToPlayer > ZOMBIE_CONFIG.ALERT_RADIUS) {
          zombie.state = 'alert';
          zombie.speed = ZOMBIE_TYPES[zombie.type].baseSpeed;
        }
        break;

      case 'crossing':
        // Cross the road - don't change target until reached
        if (zombie.position.distanceTo(zombie.targetPosition) < 1) {
          zombie.state = 'wander';
        }
        break;

      case 'dancing':
        // K-Pop zombies dance in place (handled in animation)
        if (zombie.type === 'dancer') {
          // Occasionally move while dancing
          if (Math.random() < 0.005) {
            const danceMove = new Vector3(
              (Math.random() - 0.5) * 2,
              0,
              (Math.random() - 0.5) * 2
            );
            zombie.targetPosition.add(danceMove);
          }
        }
        break;
    }

    // ─────────────────────────────────────────────────────
    // SPECIAL TYPE BEHAVIORS
    // ─────────────────────────────────────────────────────

    // K-Pop zombies randomly start dancing
    if (zombie.type === 'dancer' && zombie.state === 'wander') {
      if (Math.random() < 0.002) {
        zombie.state = 'dancing';
        zombie.stateTimer = 3000 + Math.random() * 5000;  // Dance for 3-8 seconds
      }
    }

    // Superfans rush toward the player's pink car
    if (zombie.type === 'fan' && distToPlayer < ZOMBIE_CONFIG.ALERT_RADIUS * 1.5) {
      zombie.state = 'alert';
      zombie.targetPosition.copy(playerPosition);
      zombie.speed = ZOMBIE_TYPES.fan.baseSpeed;
    }

    // ─────────────────────────────────────────────────────
    // MOVEMENT
    // ─────────────────────────────────────────────────────

    if (zombie.state !== 'idle' && zombie.state !== 'dancing') {
      const direction = new Vector3()
        .subVectors(zombie.targetPosition, zombie.position)
        .normalize();
      
      if (direction.length() > 0.1) {
        zombie.position.x += direction.x * effectiveSpeed * delta;
        zombie.position.z += direction.z * effectiveSpeed * delta;
        zombie.rotation = Math.atan2(direction.x, direction.z);
      }
    }

    // Keep on ground
    zombie.position.y = zombie.type === 'crawler' ? 0.2 : 0;

  }, []);

  // ─────────────────────────────────────────────────────────
  // MAIN UPDATE LOOP
  // ─────────────────────────────────────────────────────────

  const update = useCallback((delta: number) => {
    if (phase !== 'driving') return;

    const playerPosition = new Vector3(playerPos[0], playerPos[1], playerPos[2]);
    const playerZ = playerPos[2];
    const clampedDelta = Math.min(delta, 0.05);

    // Calculate stress
    const wrongAnswerStreak = questionsAnswered - correctAnswers;
    stressLevel.current = calculateStress(
      playerVelocity,
      nearMissCount.current,
      wrongAnswerStreak
    );

    // Decay near miss count
    nearMissDecayTimer.current += delta * 1000;
    if (nearMissDecayTimer.current > 3000) {
      nearMissCount.current = Math.max(0, nearMissCount.current - 1);
      nearMissDecayTimer.current = 0;
    }

    let activeCount = 0;

    // Update each zombie
    zombies.current.forEach((zombie) => {
      if (!zombie.active) return;

      // Despawn check
      const distanceBehind = zombie.position.z - playerZ;
      if (distanceBehind > ZOMBIE_CONFIG.DESPAWN_BEHIND) {
        zombie.active = false;
        return;
      }

      activeCount++;

      // Update behavior
      updateZombieBehavior(
        zombie,
        playerPosition,
        playerVelocity,
        stressLevel.current,
        clampedDelta
      );

      // Check for near miss
      const distToPlayer = zombie.position.distanceTo(playerPosition);
      if (distToPlayer < 3 && distToPlayer > 1.5) {
        // Close call!
        nearMissCount.current = Math.min(nearMissCount.current + 1, 5);
      }
    });

    // Spawn new zombies
    // More zombies spawn at higher stress levels
    const targetCount = Math.floor(
      ZOMBIE_CONFIG.MIN_ZOMBIES +
      (ZOMBIE_CONFIG.MAX_ZOMBIES - ZOMBIE_CONFIG.MIN_ZOMBIES) *
      stressLevel.current * ZOMBIE_CONFIG.STRESS_SPAWN_MULTIPLIER
    );

    while (activeCount < Math.min(targetCount, ZOMBIE_CONFIG.MAX_ZOMBIES)) {
      const spawned = spawnZombie(playerZ);
      if (!spawned) break;
      activeCount++;
    }

  }, [phase, playerPos, playerVelocity, correctAnswers, questionsAnswered, spawnZombie, updateZombieBehavior]);

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  return {
    update,
    getActiveZombies: () => zombies.current.filter((z) => z.active),
    getStressLevel: () => stressLevel.current,
    config: ZOMBIE_CONFIG,
    types: ZOMBIE_TYPES,
  };
}

Ready for the Zombie Renderer component? (y/k)YJan 21Architected zombie renderer with instanced mesh performance optimizationArchitected zombie renderer with instanced mesh performance optimizationStep 16: Zombie Renderer Component
typescript// src/components/Zombies/ZombieRenderer.tsx

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  InstancedMesh,
  Object3D,
  Color,
  Matrix4,
  Vector3,
  MeshStandardMaterial,
} from 'three';
import { useZombieManager } from '../../systems/ZombieManager';

// ═══════════════════════════════════════════════════════════
// ZOMBIE COLOR PALETTE (neon apocalypse theme)
// ═══════════════════════════════════════════════════════════

const ZOMBIE_COLORS = {
  // Skin tones (sickly greens/grays)
  skin: [
    '#7bed9f',                            // Mint green
    '#2ed573',                            // Toxic green
    '#a4b0be',                            // Gray
    '#57606f',                            // Dark gray
    '#c8d6e5',                            // Pale
  ],
  // Clothing accents
  clothes: [
    '#ff6b81',                            // Pink (K-pop fan)
    '#5352ed',                            // Purple
    '#ffa502',                            // Orange
    '#1e90ff',                            // Blue
    '#2f3542',                            // Dark
  ],
  // Glow colors for eyes
  glow: '#39ff14',                        // Toxic green
};

// ═══════════════════════════════════════════════════════════
// ZOMBIE RENDERER COMPONENT
// ═══════════════════════════════════════════════════════════

export function ZombieRenderer() {
  // Refs for instanced meshes (separate for body parts)
  const bodyRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  
  const { update, getActiveZombies, config } = useZombieManager();

  // Reusable objects
  const tempObject = useMemo(() => new Object3D(), []);
  const tempColor = useMemo(() => new Color(), []);
  const tempMatrix = useMemo(() => new Matrix4(), []);

  // ─────────────────────────────────────────────────────────
  // UPDATE LOOP
  // ─────────────────────────────────────────────────────────

  useFrame((state, delta) => {
    // Update zombie AI
    update(delta);

    const bodyMesh = bodyRef.current;
    const headMesh = headRef.current;
    if (!bodyMesh || !headMesh) return;

    const zombies = getActiveZombies();
    const time = state.clock.elapsedTime;

    zombies.forEach((zombie, i) => {
      // ─────────────────────────────────────────────────────
      // ANIMATION CALCULATIONS
      // ─────────────────────────────────────────────────────

      const animOffset = zombie.animationOffset;
      const bobSpeed = zombie.state === 'flee' ? 12 : zombie.state === 'dancing' ? 8 : 4;
      const bobHeight = zombie.state === 'dancing' ? 0.15 : 0.05;
      
      // Vertical bob
      const bob = Math.sin(time * bobSpeed + animOffset) * bobHeight;
      
      // Sway for walking
      const sway = Math.sin(time * (bobSpeed / 2) + animOffset) * 0.1;
      
      // Dance rotation for K-pop zombies
      const danceRotation = zombie.state === 'dancing'
        ? Math.sin(time * 4 + animOffset) * 0.3
        : 0;

      // Crawler stays low
      const heightOffset = zombie.type === 'crawler' ? 0.3 : 0.8;

      // ─────────────────────────────────────────────────────
      // BODY TRANSFORM
      // ─────────────────────────────────────────────────────

      tempObject.position.set(
        zombie.position.x + sway,
        heightOffset + bob,
        zombie.position.z
      );
      tempObject.rotation.set(
        zombie.type === 'crawler' ? Math.PI / 4 : 0,  // Crawlers lean forward
        zombie.rotation + danceRotation,
        0
      );
      tempObject.scale.setScalar(zombie.scaleVariant);
      tempObject.updateMatrix();
      bodyMesh.setMatrixAt(i, tempObject.matrix);

      // ─────────────────────────────────────────────────────
      // HEAD TRANSFORM (offset from body)
      // ─────────────────────────────────────────────────────

      const headBob = Math.sin(time * bobSpeed * 1.2 + animOffset) * 0.03;
      const headTilt = zombie.state === 'alert'
        ? Math.sin(time * 2) * 0.15
        : 0;

      tempObject.position.set(
        zombie.position.x + sway,
        heightOffset + 0.6 + bob + headBob,
        zombie.position.z
      );
      tempObject.rotation.set(
        headTilt,
        zombie.rotation + danceRotation,
        zombie.state === 'dancing' ? Math.sin(time * 6) * 0.2 : 0
      );
      tempObject.scale.setScalar(zombie.scaleVariant);
      tempObject.updateMatrix();
      headMesh.setMatrixAt(i, tempObject.matrix);

      // ─────────────────────────────────────────────────────
      // COLORS
      // ─────────────────────────────────────────────────────

      tempColor.set(ZOMBIE_COLORS.skin[zombie.colorVariant]);
      bodyMesh.setColorAt(i, tempColor);
      headMesh.setColorAt(i, tempColor);
    });

    // Hide unused instances
    for (let i = zombies.length; i < config.MAX_ZOMBIES; i++) {
      tempObject.position.set(0, -100, 0);
      tempObject.updateMatrix();
      bodyMesh.setMatrixAt(i, tempObject.matrix);
      headMesh.setMatrixAt(i, tempObject.matrix);
    }

    // Flag updates
    bodyMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    if (headMesh.instanceColor) headMesh.instanceColor.needsUpdate = true;
  });

  return (
    <group name="zombies">
      {/* Body instances */}
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, config.MAX_ZOMBIES]}
        castShadow
        receiveShadow
      >
        <ZombieBodyGeometry />
        <meshStandardMaterial vertexColors roughness={0.8} />
      </instancedMesh>

      {/* Head instances */}
      <instancedMesh
        ref={headRef}
        args={[undefined, undefined, config.MAX_ZOMBIES]}
        castShadow
      >
        <ZombieHeadGeometry />
        <meshStandardMaterial vertexColors roughness={0.7} />
      </instancedMesh>

      {/* Glowing eyes (separate pass for emissive) */}
      <ZombieEyeGlow />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// ZOMBIE BODY GEOMETRY (chibi voxel style)
// ═══════════════════════════════════════════════════════════

function ZombieBodyGeometry() {
  return (
    <group>
      {/* Torso - chunky box */}
      <boxGeometry args={[0.5, 0.6, 0.3]} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// ZOMBIE HEAD GEOMETRY
// ═══════════════════════════════════════════════════════════

function ZombieHeadGeometry() {
  return (
    <boxGeometry args={[0.45, 0.45, 0.4]} />
  );
}

// ═══════════════════════════════════════════════════════════
// ZOMBIE EYE GLOW (non-instanced for simplicity)
// ═══════════════════════════════════════════════════════════

function ZombieEyeGlow() {
  const { getActiveZombies } = useZombieManager();
  const groupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    
    const zombies = getActiveZombies();
    const time = state.clock.elapsedTime;
    
    // Update eye positions to match zombie heads
    groupRef.current.children.forEach((eyePair, i) => {
      if (i >= zombies.length) {
        eyePair.visible = false;
        return;
      }
      
      const zombie = zombies[i];
      eyePair.visible = true;
      
      const bobSpeed = zombie.state === 'flee' ? 12 : zombie.state === 'dancing' ? 8 : 4;
      const bob = Math.sin(time * bobSpeed + zombie.animationOffset) * 0.05;
      const heightOffset = zombie.type === 'crawler' ? 0.3 : 0.8;
      
      eyePair.position.set(
        zombie.position.x,
        heightOffset + 0.65 + bob,
        zombie.position.z + 0.2
      );
      eyePair.rotation.y = zombie.rotation;
      eyePair.scale.setScalar(zombie.scaleVariant);
      
      // Blink occasionally
      const blink = Math.sin(time * 0.5 + zombie.animationOffset * 10) > 0.95;
      eyePair.scale.y = blink ? 0.1 : zombie.scaleVariant;
    });
  });

  // Pre-create eye pairs for all possible zombies
  const eyePairs = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => (
      <group key={i} visible={false}>
        {/* Left eye */}
        <mesh position={[-0.12, 0, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial
            color={ZOMBIE_COLORS.glow}
            emissive={ZOMBIE_COLORS.glow}
            emissiveIntensity={2}
          />
        </mesh>
        {/* Right eye */}
        <mesh position={[0.12, 0, 0]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial
            color={ZOMBIE_COLORS.glow}
            emissive={ZOMBIE_COLORS.glow}
            emissiveIntensity={2}
          />
        </mesh>
      </group>
    ));
  }, []);

  return <group ref={groupRef}>{eyePairs}</group>;
}
typescript// src/components/Zombies/ZombieDetailMesh.tsx

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { Group } from 'three';

// ═══════════════════════════════════════════════════════════
// DETAILED ZOMBIE MESH (for close-up / future LOD)
// ═══════════════════════════════════════════════════════════

interface ZombieDetailMeshProps {
  type: 'walker' | 'crawler' | 'dancer' | 'sleeper' | 'fan';
  skinColor: string;
  clothesColor: string;
  state: string;
}

export function ZombieDetailMesh({
  type,
  skinColor,
  clothesColor,
  state,
}: ZombieDetailMeshProps) {
  const groupRef = useRef<Group>(null);

  // Animation
  useFrame((state) => {
    if (!groupRef.current) return;
    
    const time = state.clock.elapsedTime;
    
    // Idle sway
    groupRef.current.rotation.z = Math.sin(time * 2) * 0.05;
  });

  return (
    <group ref={groupRef}>
      {/* ─────────────────────────────────────────────────────
          BODY
          ───────────────────────────────────────────────────── */}
      
      {/* Torso */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.3]} />
        <meshStandardMaterial color={clothesColor} />
      </mesh>

      {/* Shirt torn effect */}
      <mesh position={[0.15, 0.6, 0.16]} castShadow>
        <boxGeometry args={[0.15, 0.2, 0.02]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>

      {/* ─────────────────────────────────────────────────────
          HEAD
          ───────────────────────────────────────────────────── */}
      
      {/* Main head */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.45, 0.45, 0.4]} />
        <meshStandardMaterial color={skinColor} />
      </mesh>

      {/* Hair (messy) */}
      <mesh position={[0, 1.25, 0]} castShadow>
        <boxGeometry args={[0.5, 0.15, 0.45]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>

      {/* Hair strands */}
      {[0.15, -0.1, 0.05].map((x, i) => (
        <mesh key={i} position={[x, 1.35, 0.1]} rotation={[0.3, 0, (i - 1) * 0.2]}>
          <boxGeometry args={[0.08, 0.15, 0.05]} />
          <meshStandardMaterial color="#2d3436" />
        </mesh>
      ))}

      {/* Eyes */}
      <mesh position={[-0.12, 1.0, 0.21]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial
          color="#39ff14"
          emissive="#39ff14"
          emissiveIntensity={1.5}
        />
      </mesh>
      <mesh position={[0.12, 1.0, 0.21]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial
          color="#39ff14"
          emissive="#39ff14"
          emissiveIntensity={1.5}
        />
      </mesh>

      {/* Mouth (open, groaning) */}
      <mesh position={[0, 0.85, 0.2]}>
        <boxGeometry args={[0.2, 0.1, 0.05]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* ─────────────────────────────────────────────────────
          ARMS
          ───────────────────────────────────────────────────── */}
      
      {/* Left arm (reaching forward) */}
      <group position={[-0.35, 0.6, 0]} rotation={[0.8, 0, 0.2]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.15, 0.4, 0.15]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.45, 0]} castShadow>
          <boxGeometry args={[0.12, 0.12, 0.1]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>

      {/* Right arm (hanging) */}
      <group position={[0.35, 0.6, 0]} rotation={[0.3, 0, -0.1]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <boxGeometry args={[0.15, 0.4, 0.15]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
        <mesh position={[0, -0.45, 0]} castShadow>
          <boxGeometry args={[0.12, 0.12, 0.1]} />
          <meshStandardMaterial color={skinColor} />
        </mesh>
      </group>

      {/* ─────────────────────────────────────────────────────
          LEGS
          ───────────────────────────────────────────────────── */}
      
      {/* Left leg */}
      <mesh position={[-0.12, 0.1, 0]} castShadow>
        <boxGeometry args={[0.18, 0.5, 0.2]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>

      {/* Right leg */}
      <mesh position={[0.12, 0.1, 0]} castShadow>
        <boxGeometry args={[0.18, 0.5, 0.2]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>

      {/* Feet */}
      <mesh position={[-0.12, -0.1, 0.05]} castShadow>
        <boxGeometry args={[0.18, 0.1, 0.25]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0.12, -0.1, 0.05]} castShadow>
        <boxGeometry args={[0.18, 0.1, 0.25]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>

      {/* ─────────────────────────────────────────────────────
          TYPE-SPECIFIC ACCESSORIES
          ───────────────────────────────────────────────────── */}
      
      {type === 'fan' && <FanAccessories />}
      {type === 'dancer' && <DancerAccessories />}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// K-POP FAN ACCESSORIES
// ═══════════════════════════════════════════════════════════

function FanAccessories() {
  return (
    <group>
      {/* Light stick (holding in right hand) */}
      <group position={[0.45, 0.3, 0.2]} rotation={[0.5, 0, 0.3]}>
        {/* Handle */}
        <mesh>
          <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        {/* Light */}
        <mesh position={[0, 0.2, 0]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial
            color="#ff00ff"
            emissive="#ff00ff"
            emissiveIntensity={2}
          />
        </mesh>
      </group>

      {/* Fan headband */}
      <mesh position={[0, 1.3, 0]}>
        <torusGeometry args={[0.28, 0.03, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#ff00ff" />
      </mesh>

      {/* Headband ears */}
      <mesh position={[-0.2, 1.4, 0]} rotation={[0, 0, -0.3]}>
        <coneGeometry args={[0.08, 0.15, 4]} />
        <meshStandardMaterial color="#ff00ff" />
      </mesh>
      <mesh position={[0.2, 1.4, 0]} rotation={[0, 0, 0.3]}>
        <coneGeometry args={[0.08, 0.15, 4]} />
        <meshStandardMaterial color="#ff00ff" />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// K-POP DANCER ACCESSORIES
// ═══════════════════════════════════════════════════════════

function DancerAccessories() {
  return (
    <group>
      {/* Sparkly jacket */}
      <mesh position={[0, 0.5, -0.01]} castShadow>
        <boxGeometry args={[0.55, 0.65, 0.32]} />
        <meshStandardMaterial
          color="#5352ed"
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Sunglasses */}
      <group position={[0, 1.02, 0.22]}>
        {/* Frame */}
        <mesh>
          <boxGeometry args={[0.4, 0.08, 0.02]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
        {/* Left lens */}
        <mesh position={[-0.12, 0, 0.01]}>
          <boxGeometry args={[0.12, 0.08, 0.01]} />
          <meshStandardMaterial
            color="#ff00ff"
            transparent
            opacity={0.7}
          />
        </mesh>
        {/* Right lens */}
        <mesh position={[0.12, 0, 0.01]}>
          <boxGeometry args={[0.12, 0.08, 0.01]} />
          <meshStandardMaterial
            color="#ff00ff"
            transparent
            opacity={0.7}
          />
        </mesh>
      </group>

      {/* Chain necklace */}
      <mesh position={[0, 0.75, 0.16]}>
        <torusGeometry args={[0.15, 0.015, 8, 16]} />
        <meshStandardMaterial color="#ffd700" metalness={1} roughness={0.3} />
      </mesh>
    </group>
  );
}
typescript// src/components/Zombies/ZombieEffects.tsx

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Points, PointMaterial } from '@react-three/drei';
import { useZombieManager } from '../../systems/ZombieManager';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════
// ZOMBIE PARTICLE EFFECTS
// ═══════════════════════════════════════════════════════════

export function ZombieEffects() {
  const { getActiveZombies, getStressLevel } = useZombieManager();
  const pointsRef = useRef<THREE.Points>(null);

  // Pre-allocate particle positions
  const particleCount = 50;
  const positions = useMemo(() => {
    return new Float32Array(particleCount * 3);
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;

    const zombies = getActiveZombies();
    const time = state.clock.elapsedTime;
    const stress = getStressLevel();

    // Only show particles at higher stress levels
    pointsRef.current.visible = stress > 0.3;

    if (stress <= 0.3) return;

    // Generate particle positions around zombies
    let particleIndex = 0;
    
    zombies.forEach((zombie) => {
      // More particles for alert/flee states
      const particlesForZombie = 
        zombie.state === 'flee' ? 5 :
        zombie.state === 'alert' ? 3 : 1;

      for (let i = 0; i < particlesForZombie && particleIndex < particleCount; i++) {
        const angle = time * 2 + i * (Math.PI * 2 / particlesForZombie) + zombie.animationOffset;
        const radius = 0.5 + Math.sin(time * 3 + i) * 0.2;
        const height = 0.5 + Math.sin(time * 4 + i * 0.5) * 0.3;

        positions[particleIndex * 3] = zombie.position.x + Math.cos(angle) * radius;
        positions[particleIndex * 3 + 1] = height;
        positions[particleIndex * 3 + 2] = zombie.position.z + Math.sin(angle) * radius;

        particleIndex++;
      }
    });

    // Hide unused particles
    for (let i = particleIndex; i < particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100;
      positions[i * 3 + 2] = 0;
    }

    // Update geometry
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        color="#39ff14"
        transparent
        opacity={0.6}
        sizeAttenuation
      />
    </points>
  );
}

// ═══════════════════════════════════════════════════════════
// STRESS INDICATOR (screen vignette)
// ═══════════════════════════════════════════════════════════

export function StressVignette() {
  const { getStressLevel } = useZombieManager();

  useFrame(() => {
    const stress = getStressLevel();
    // Could update a shader uniform here for vignette effect
  });

  // For now, using CSS overlay (see StressVignette.css)
  return null;
}
typescript// src/components/UI/StressIndicator.tsx

import { useEffect, useState } from 'react';
import { useZombieManager } from '../../systems/ZombieManager';
import { useGameStore } from '../../stores/gameStore';
import './StressIndicator.css';

// ═══════════════════════════════════════════════════════════
// STRESS INDICATOR UI
// ═══════════════════════════════════════════════════════════

export function StressIndicator() {
  const phase = useGameStore((s) => s.game.phase);
  const { getStressLevel } = useZombieManager();
  const [stress, setStress] = useState(0);

  // Update stress periodically (avoid re-render every frame)
  useEffect(() => {
    if (phase !== 'driving') return;

    const interval = setInterval(() => {
      setStress(getStressLevel());
    }, 100);

    return () => clearInterval(interval);
  }, [phase, getStressLevel]);

  if (phase !== 'driving' || stress < 0.2) return null;

  const getStressLabel = () => {
    if (stress >= 0.8) return 'CHAOS';
    if (stress >= 0.6) return 'TENSE';
    if (stress >= 0.4) return 'ALERT';
    return 'CALM';
  };

  const getStressColor = () => {
    if (stress >= 0.8) return '#ff0000';
    if (stress >= 0.6) return '#ff6b6b';
    if (stress >= 0.4) return '#ffa502';
    return '#39ff14';
  };

  return (
    <div className="stress-indicator">
      {/* Vignette overlay */}
      <div
        className="stress-vignette"
        style={{
          opacity: stress * 0.4,
          boxShadow: `inset 0 0 ${100 + stress * 150}px rgba(255, 0, 0, ${stress * 0.3})`,
        }}
      />

      {/* Stress meter */}
      <div className="stress-meter">
        <div className="stress-label" style={{ color: getStressColor() }}>
          {getStressLabel()}
        </div>
        <div className="stress-bar-container">
          <div
            className="stress-bar-fill"
            style={{
              width: `${stress * 100}%`,
              backgroundColor: getStressColor(),
            }}
          />
        </div>
        <div className="stress-icon">
          {stress >= 0.6 ? '😱' : stress >= 0.4 ? '😰' : '😐'}
        </div>
      </div>
    </div>
  );
}
css/* src/components/UI/StressIndicator.css */

/* ═══════════════════════════════════════════════════════════
   STRESS VIGNETTE
   ═══════════════════════════════════════════════════════════ */

.stress-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 40;
  transition: opacity 0.3s ease, box-shadow 0.3s ease;
}

/* ═══════════════════════════════════════════════════════════
   STRESS METER
   ═══════════════════════════════════════════════════════════ */

.stress-indicator {
  pointer-events: none;
}

.stress-meter {
  position: fixed;
  top: 60px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(18, 18, 18, 0.8);
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 55;
}

.stress-label {
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
  min-width: 45px;
  transition: color 0.3s ease;
}

.stress-bar-container {
  width: 60px;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.stress-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.2s ease, background-color 0.3s ease;
}

.stress-icon {
  font-size: 16px;
  transition: transform 0.2s ease;
}

/* Shake animation at high stress */
@keyframes stress-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}

.stress-meter:has(.stress-bar-fill[style*="width: 8"]),
.stress-meter:has(.stress-bar-fill[style*="width: 9"]),
.stress-meter:has(.stress-bar-fill[style*="width: 100"]) {
  animation: stress-shake 0.2s ease infinite;
}

/* ═══════════════════════════════════════════════════════════
   MOBILE ADJUSTMENTS
   ═══════════════════════════════════════════════════════════ */

@media (max-width: 400px) {
  .stress-meter {
    top: 55px;
    padding: 4px 8px;
  }

  .stress-label {
    font-size: 9px;
    min-width: 38px;
  }

  .stress-bar-container {
    width: 45px;
  }
}
typescript// src/components/Zombies/ZombieCollisions.tsx

import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { useGameStore } from '../../stores/gameStore';
import { useZombieManager } from '../../systems/ZombieManager';
import { useCatCompanionManager } from '../../systems/CatCompanionManager';

// ═══════════════════════════════════════════════════════════
// COLLISION CONFIGURATION
// ═══════════════════════════════════════════════════════════

const COLLISION_CONFIG = {
  ZOMBIE_RADIUS: 0.5,                     // Collision radius
  VEHICLE_RADIUS: 1.5,                    // Vehicle collision radius
  NEAR_MISS_RADIUS: 2.5,                  // Near miss detection
  COLLISION_COOLDOWN: 2000,               // ms between collision events
};

// ═══════════════════════════════════════════════════════════
// COLLISION HANDLER HOOK
// ═══════════════════════════════════════════════════════════

export function useZombieCollisions() {
  const playerPos = useGameStore((s) => s.vehicle.position);
  const phase = useGameStore((s) => s.game.phase);
  const { getActiveZombies } = useZombieManager();
  const { queueMessage } = useCatCompanionManager();

  const lastCollisionTime = useRef(0);
  const lastNearMissTime = useRef(0);

  useEffect(() => {
    if (phase !== 'driving') return;

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const playerPosition = new Vector3(playerPos[0], playerPos[1], playerPos[2]);
      const zombies = getActiveZombies();

      zombies.forEach((zombie) => {
        const distance = playerPosition.distanceTo(zombie.position);

        // Direct collision
        if (distance < COLLISION_CONFIG.VEHICLE_RADIUS + COLLISION_CONFIG.ZOMBIE_RADIUS) {
          if (now - lastCollisionTime.current > COLLISION_CONFIG.COLLISION_COOLDOWN) {
            lastCollisionTime.current = now;
            handleCollision(zombie.type);
          }
        }
        // Near miss
        else if (distance < COLLISION_CONFIG.NEAR_MISS_RADIUS) {
          if (now - lastNearMissTime.current > COLLISION_CONFIG.COLLISION_COOLDOWN) {
            lastNearMissTime.current = now;
            handleNearMiss();
          }
        }
      });
    }, 100); // Check every 100ms

    return () => clearInterval(checkInterval);
  }, [phase, playerPos, getActiveZombies, queueMessage]);

  // ─────────────────────────────────────────────────────────
  // COLLISION HANDLERS
  // ─────────────────────────────────────────────────────────

  const handleCollision = (zombieType: string) => {
    // Zombies are hazards but don't cause game over
    // They scatter and the cats react

    const collisionMessages = {
      mya: [
        "Careful! That could have been a real pedestrian.",
        "Always check for pedestrians, Ali.",
        "Defensive driving means expecting the unexpected.",
      ],
      gracie: [
        "아이고! Zombie bump!",
        "Whoa! Close encounter of the undead kind!",
        "They're fine... probably? They're already zombies!",
      ],
    };

    const cat = Math.random() > 0.5 ? 'mya' : 'gracie';
    const messages = collisionMessages[cat];
    const text = messages[Math.floor(Math.random() * messages.length)];

    queueMessage(cat, text, 'worried', 'high', 4000);
  };

  const handleNearMiss = () => {
    const nearMissMessages = {
      mya: [
        "Close call. Good awareness.",
        "You avoided that one. Stay alert.",
      ],
      gracie: [
        "Phew! That was close!",
        "Nice reflexes! 💨",
        "*deep breath* We're okay!",
      ],
    };

    // Only comment sometimes (don't spam)
    if (Math.random() > 0.3) return;

    const cat = Math.random() > 0.6 ? 'gracie' : 'mya';
    const messages = nearMissMessages[cat];
    const text = messages[Math.floor(Math.random() * messages.length)];

    queueMessage(cat, text, 'worried', 'low', 2500);
  };
}

Now update Game.tsx to include zombies:
typescript// src/Game.tsx (add zombie imports and components)

// Add to imports:
import { ZombieRenderer } from './components/Zombies/ZombieRenderer';
import { ZombieEffects } from './components/Zombies/ZombieEffects';
import { StressIndicator } from './components/UI/StressIndicator';
import { useZombieCollisions } from './components/Zombies/ZombieCollisions';

// Add inside Game component:
export function Game() {
  // ... existing hooks ...
  
  // Zombie collision detection
  useZombieCollisions();

  return (
    <div className={`game-container ${phase === 'quiz' ? 'quiz-active' : ''}`}>
      <Canvas {...CANVAS_CONFIG}>
        <Suspense fallback={null}>
          <Physics {...PHYSICS_CONFIG}>
            {/* Environment */}
            <Lighting />
            <Skybox biome={useGameStore.getState().game.currentBiome} />

            {/* Game objects */}
            <RoadChunks />
            <Vehicle />
            <TrafficRenderer />
            
            {/* Zombies (add after traffic) */}
            <ZombieRenderer />
            <ZombieEffects />

            {/* Camera */}
            <GameCamera />
          </Physics>
          <Preload all />
        </Suspense>
      </Canvas>

      {/* UI Layers */}
      <div className="ui-layer">
        {/* ... existing UI ... */}

        {/* Stress indicator (add with HUD) */}
        {phase === 'driving' && <StressIndicator />}

        {/* ... rest of UI ... */}
      </div>
    </div>
  );
}

Key features implemented:
FeatureDescription5 zombie typesWalker, Crawler, Dancer, Sleeper, SuperfanWeighted spawningCommon walkers, rare superfansState machine AIIdle → Wander → Alert → Flee → CrossingStress systemSpeed + near misses + wrong answers = chaosK-Pop themedDancer zombies, Superfans with lightsticksChibi voxel styleBlocky bodies, glowing green eyesInstanced renderingSingle draw call for all zombiesCat reactionsComments on collisions and near missesVisual feedbackStress vignette, particle effectsEducational tie-in"That could have been a real pedestrian"

Zombie Behavior Summary:
TypeSpeedBehaviorWalker1.5 m/sShambles aimlessly, flees when closeCrawler0.8 m/sCrawls on ground, slow but low profileDancer2.0 m/sStops to dance, distracted by musicSleeper0.5 m/sStands still until player approachesSuperfan3.0 m/sRushes toward pink VW Beetle

Want me to continue with:

Keyboard controls (desktop WASD fallback)
Audio system (engine sounds, zombie groans, cat meows)
2Jan 21Architected comprehensive audio system with multiple sound categoriesArchitected comprehensive audio system with multiple sound categoriesStep 17: Audio System
typescript// src/systems/AudioManager.ts

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// AUDIO CONFIGURATION
// ═══════════════════════════════════════════════════════════

const AUDIO_CONFIG = {
  // Master volumes (0-1)
  MASTER_VOLUME: 0.8,
  
  // Category volumes
  CATEGORIES: {
    engine: 0.6,
    sfx: 0.8,
    zombie: 0.5,
    cat: 0.7,
    music: 0.4,
    ui: 0.6,
  },
  
  // Engine sound parameters
  ENGINE: {
    IDLE_FREQUENCY: 80,                   // Hz at idle
    MAX_FREQUENCY: 250,                   // Hz at max speed
    IDLE_VOLUME: 0.3,
    MAX_VOLUME: 0.8,
    RUMBLE_FREQUENCY: 40,                 // Low rumble undertone
  },
  
  // Zombie sounds
  ZOMBIE: {
    GROAN_INTERVAL_MIN: 4000,             // ms
    GROAN_INTERVAL_MAX: 10000,
    MAX_DISTANCE: 30,                     // Meters for 3D audio falloff
    MAX_SIMULTANEOUS: 3,                  // Limit concurrent groans
  },
  
  // Timing
  FADE_DURATION: 0.3,                     // Seconds for volume fades
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

type SoundCategory = keyof typeof AUDIO_CONFIG.CATEGORIES;

interface SoundInstance {
  id: string;
  source: AudioBufferSourceNode | OscillatorNode;
  gainNode: GainNode;
  category: SoundCategory;
  isLooping: boolean;
}

interface AudioState {
  isInitialized: boolean;
  isMuted: boolean;
  activeInstances: Map<string, SoundInstance>;
}

// ═══════════════════════════════════════════════════════════
// SOUND ASSET PATHS
// ═══════════════════════════════════════════════════════════

const SOUND_PATHS = {
  // Engine (procedurally generated, no file needed)
  
  // UI
  uiClick: '/audio/ui/click.mp3',
  uiHover: '/audio/ui/hover.mp3',
  
  // Quiz
  quizCorrect: '/audio/quiz/correct.mp3',
  quizWrong: '/audio/quiz/wrong.mp3',
  quizAppear: '/audio/quiz/appear.mp3',
  streakBonus: '/audio/quiz/streak.mp3',
  
  // Zombies
  zombieGroan1: '/audio/zombie/groan1.mp3',
  zombieGroan2: '/audio/zombie/groan2.mp3',
  zombieGroan3: '/audio/zombie/groan3.mp3',
  zombieShuffle: '/audio/zombie/shuffle.mp3',
  zombieAlert: '/audio/zombie/alert.mp3',
  
  // Cats
  catMeow1: '/audio/cat/meow1.mp3',
  catMeow2: '/audio/cat/meow2.mp3',
  catPurr: '/audio/cat/purr.mp3',
  catChirp: '/audio/cat/chirp.mp3',
  catHiss: '/audio/cat/hiss.mp3',
  
  // Vehicle
  horn: '/audio/vehicle/horn.mp3',
  brake: '/audio/vehicle/brake.mp3',
  
  // Ambient
  cityAmbient: '/audio/ambient/city.mp3',
  highwayAmbient: '/audio/ambient/highway.mp3',
  ruralAmbient: '/audio/ambient/rural.mp3',
  
  // Music (K-pop inspired, royalty-free)
  menuMusic: '/audio/music/menu.mp3',
  gameMusic: '/audio/music/driving.mp3',
};

// ═══════════════════════════════════════════════════════════
// AUDIO MANAGER HOOK
// ═══════════════════════════════════════════════════════════

export function useAudioManager() {
  // Store
  const musicVolume = useGameStore((s) => s.settings.musicVolume);
  const sfxVolume = useGameStore((s) => s.settings.sfxVolume);
  const phase = useGameStore((s) => s.game.phase);

  // Audio context (lazy init on user interaction)
  const audioContext = useRef<AudioContext | null>(null);
  const masterGain = useRef<GainNode | null>(null);
  const categoryGains = useRef<Map<SoundCategory, GainNode>>(new Map());
  
  // Sound buffers cache
  const bufferCache = useRef<Map<string, AudioBuffer>>(new Map());
  
  // Active instances
  const activeInstances = useRef<Map<string, SoundInstance>>(new Map());
  
  // State
  const isInitialized = useRef(false);
  const isMuted = useRef(false);

  // ─────────────────────────────────────────────────────────
  // INITIALIZE AUDIO CONTEXT
  // ─────────────────────────────────────────────────────────

  const initialize = useCallback(async () => {
    if (isInitialized.current) return;

    try {
      // Create audio context
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create master gain
      masterGain.current = audioContext.current.createGain();
      masterGain.current.gain.value = AUDIO_CONFIG.MASTER_VOLUME;
      masterGain.current.connect(audioContext.current.destination);
      
      // Create category gains
      Object.entries(AUDIO_CONFIG.CATEGORIES).forEach(([category, volume]) => {
        const gain = audioContext.current!.createGain();
        gain.gain.value = volume;
        gain.connect(masterGain.current!);
        categoryGains.current.set(category as SoundCategory, gain);
      });
      
      isInitialized.current = true;
      console.log('[AudioManager] Initialized');
      
      // Preload critical sounds
      await preloadSounds([
        'uiClick',
        'quizCorrect',
        'quizWrong',
      ]);
      
    } catch (error) {
      console.error('[AudioManager] Init failed:', error);
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // RESUME AUDIO CONTEXT (required after user interaction)
  // ─────────────────────────────────────────────────────────

  const resume = useCallback(async () => {
    if (audioContext.current?.state === 'suspended') {
      await audioContext.current.resume();
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // LOAD SOUND BUFFER
  // ─────────────────────────────────────────────────────────

  const loadSound = useCallback(async (key: keyof typeof SOUND_PATHS): Promise<AudioBuffer | null> => {
    if (!audioContext.current) return null;
    
    // Check cache
    if (bufferCache.current.has(key)) {
      return bufferCache.current.get(key)!;
    }
    
    try {
      const response = await fetch(SOUND_PATHS[key]);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.current.decodeAudioData(arrayBuffer);
      
      bufferCache.current.set(key, audioBuffer);
      return audioBuffer;
    } catch (error) {
      console.warn(`[AudioManager] Failed to load: ${key}`, error);
      return null;
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // PRELOAD MULTIPLE SOUNDS
  // ─────────────────────────────────────────────────────────

  const preloadSounds = useCallback(async (keys: (keyof typeof SOUND_PATHS)[]) => {
    await Promise.all(keys.map(loadSound));
  }, [loadSound]);

  // ─────────────────────────────────────────────────────────
  // PLAY SOUND (one-shot)
  // ─────────────────────────────────────────────────────────

  const playSound = useCallback(async (
    key: keyof typeof SOUND_PATHS,
    options: {
      category?: SoundCategory;
      volume?: number;
      pitch?: number;
      loop?: boolean;
      id?: string;
    } = {}
  ): Promise<string | null> => {
    if (!audioContext.current || !masterGain.current || isMuted.current) return null;
    
    await resume();
    
    const buffer = await loadSound(key);
    if (!buffer) return null;
    
    const {
      category = 'sfx',
      volume = 1,
      pitch = 1,
      loop = false,
      id = `${key}-${Date.now()}`,
    } = options;
    
    // Create source
    const source = audioContext.current.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = pitch;
    source.loop = loop;
    
    // Create gain for this instance
    const gainNode = audioContext.current.createGain();
    gainNode.gain.value = volume;
    
    // Connect: source → gain → category gain → master → destination
    const categoryGain = categoryGains.current.get(category);
    source.connect(gainNode);
    gainNode.connect(categoryGain || masterGain.current);
    
    // Track instance
    const instance: SoundInstance = {
      id,
      source,
      gainNode,
      category,
      isLooping: loop,
    };
    activeInstances.current.set(id, instance);
    
    // Cleanup on end
    source.onended = () => {
      activeInstances.current.delete(id);
    };
    
    source.start();
    
    return id;
  }, [loadSound, resume]);

  // ─────────────────────────────────────────────────────────
  // STOP SOUND
  // ─────────────────────────────────────────────────────────

  const stopSound = useCallback((id: string, fadeOut: boolean = true) => {
    const instance = activeInstances.current.get(id);
    if (!instance || !audioContext.current) return;
    
    if (fadeOut) {
      // Fade out
      instance.gainNode.gain.linearRampToValueAtTime(
        0,
        audioContext.current.currentTime + AUDIO_CONFIG.FADE_DURATION
      );
      setTimeout(() => {
        try {
          instance.source.stop();
        } catch {}
        activeInstances.current.delete(id);
      }, AUDIO_CONFIG.FADE_DURATION * 1000);
    } else {
      try {
        instance.source.stop();
      } catch {}
      activeInstances.current.delete(id);
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // STOP ALL SOUNDS IN CATEGORY
  // ─────────────────────────────────────────────────────────

  const stopCategory = useCallback((category: SoundCategory, fadeOut: boolean = true) => {
    activeInstances.current.forEach((instance, id) => {
      if (instance.category === category) {
        stopSound(id, fadeOut);
      }
    });
  }, [stopSound]);

  // ─────────────────────────────────────────────────────────
  // SET CATEGORY VOLUME
  // ─────────────────────────────────────────────────────────

  const setCategoryVolume = useCallback((category: SoundCategory, volume: number) => {
    const gain = categoryGains.current.get(category);
    if (gain && audioContext.current) {
      gain.gain.linearRampToValueAtTime(
        Math.max(0, Math.min(1, volume)),
        audioContext.current.currentTime + 0.1
      );
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // MUTE / UNMUTE
  // ─────────────────────────────────────────────────────────

  const setMuted = useCallback((muted: boolean) => {
    isMuted.current = muted;
    if (masterGain.current && audioContext.current) {
      masterGain.current.gain.linearRampToValueAtTime(
        muted ? 0 : AUDIO_CONFIG.MASTER_VOLUME,
        audioContext.current.currentTime + 0.1
      );
    }
  }, []);

  // ─────────────────────────────────────────────────────────
  // UPDATE VOLUMES FROM SETTINGS
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    setCategoryVolume('music', musicVolume);
  }, [musicVolume, setCategoryVolume]);

  useEffect(() => {
    setCategoryVolume('sfx', sfxVolume);
    setCategoryVolume('ui', sfxVolume);
    setCategoryVolume('cat', sfxVolume);
    setCategoryVolume('zombie', sfxVolume * 0.7);
  }, [sfxVolume, setCategoryVolume]);

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  return {
    initialize,
    resume,
    playSound,
    stopSound,
    stopCategory,
    setCategoryVolume,
    setMuted,
    preloadSounds,
    isInitialized: () => isInitialized.current,
    getAudioContext: () => audioContext.current,
    config: AUDIO_CONFIG,
    paths: SOUND_PATHS,
  };
}

Ready for the Engine Sound Generator? (y/k)YJan 21Architected audio integration and component consolidation strategyArchitected audio integration and component consolidation strategyStep 18: Engine Sound Generator
typescript// src/systems/EngineSoundGenerator.ts

import { useRef, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../stores/gameStore';
import { useAudioManager } from './AudioManager';

// ═══════════════════════════════════════════════════════════
// ENGINE SOUND CONFIGURATION
// ═══════════════════════════════════════════════════════════

const ENGINE_CONFIG = {
  // Frequency ranges (Hz)
  BASE_FREQ: 85,                          // Idle frequency
  MAX_FREQ: 280,                          // Max RPM frequency
  RUMBLE_FREQ: 42,                        // Low-end rumble
  
  // Harmonic overtones (ratios)
  HARMONICS: [1, 2, 3, 4],                // Fundamental + overtones
  HARMONIC_GAINS: [1.0, 0.5, 0.25, 0.12], // Volume per harmonic
  
  // Volume envelope
  IDLE_VOLUME: 0.15,
  MAX_VOLUME: 0.45,
  ACCELERATION_BOOST: 0.1,                // Extra volume when throttle pressed
  
  // Smoothing (lower = smoother)
  FREQUENCY_SMOOTHING: 0.08,
  VOLUME_SMOOTHING: 0.1,
  
  // Deceleration "pop" effect
  DECEL_POP_CHANCE: 0.02,                 // Per-frame when decelerating
  DECEL_POP_VOLUME: 0.3,
  
  // VW Beetle character
  AIR_COOLED_FLUTTER: 0.015,              // Slight frequency wobble
  FLUTTER_SPEED: 8,                       // Hz of flutter
};

// ═══════════════════════════════════════════════════════════
// ENGINE SOUND GENERATOR HOOK
// ═══════════════════════════════════════════════════════════

export function useEngineSoundGenerator() {
  // Store
  const velocity = useGameStore((s) => s.vehicle.velocity);
  const throttle = useGameStore((s) => s.vehicle.throttle);
  const brake = useGameStore((s) => s.vehicle.brake);
  const phase = useGameStore((s) => s.game.phase);
  const sfxVolume = useGameStore((s) => s.settings.sfxVolume);

  // Audio manager
  const { getAudioContext, isInitialized } = useAudioManager();

  // Audio nodes
  const oscillators = useRef<OscillatorNode[]>([]);
  const gains = useRef<GainNode[]>([]);
  const masterGain = useRef<GainNode | null>(null);
  const rumbleOsc = useRef<OscillatorNode | null>(null);
  const rumbleGain = useRef<GainNode | null>(null);
  const noiseNode = useRef<AudioBufferSourceNode | null>(null);
  const noiseGain = useRef<GainNode | null>(null);

  // Smoothed values
  const currentFreq = useRef(ENGINE_CONFIG.BASE_FREQ);
  const currentVolume = useRef(ENGINE_CONFIG.IDLE_VOLUME);
  const lastVelocity = useRef(0);

  // State
  const isRunning = useRef(false);

  // ─────────────────────────────────────────────────────────
  // CREATE ENGINE SOUND
  // ─────────────────────────────────────────────────────────

  const startEngine = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx || isRunning.current) return;

    try {
      // Master gain for engine
      masterGain.current = ctx.createGain();
      masterGain.current.gain.value = 0;
      masterGain.current.connect(ctx.destination);

      // Create oscillators for each harmonic
      ENGINE_CONFIG.HARMONICS.forEach((ratio, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = i === 0 ? 'sawtooth' : 'triangle';
        osc.frequency.value = ENGINE_CONFIG.BASE_FREQ * ratio;
        gain.gain.value = ENGINE_CONFIG.HARMONIC_GAINS[i];

        osc.connect(gain);
        gain.connect(masterGain.current!);

        oscillators.current.push(osc);
        gains.current.push(gain);

        osc.start();
      });

      // Low rumble (sub-bass)
      rumbleOsc.current = ctx.createOscillator();
      rumbleGain.current = ctx.createGain();
      rumbleOsc.current.type = 'sine';
      rumbleOsc.current.frequency.value = ENGINE_CONFIG.RUMBLE_FREQ;
      rumbleGain.current.gain.value = 0.3;
      rumbleOsc.current.connect(rumbleGain.current);
      rumbleGain.current.connect(masterGain.current);
      rumbleOsc.current.start();

      // Noise layer (air-cooled engine character)
      const noiseBuffer = createNoiseBuffer(ctx, 2);
      noiseNode.current = ctx.createBufferSource();
      noiseNode.current.buffer = noiseBuffer;
      noiseNode.current.loop = true;
      noiseGain.current = ctx.createGain();
      noiseGain.current.gain.value = 0.02;
      noiseNode.current.connect(noiseGain.current);
      noiseGain.current.connect(masterGain.current);
      noiseNode.current.start();

      // Fade in
      masterGain.current.gain.linearRampToValueAtTime(
        ENGINE_CONFIG.IDLE_VOLUME * sfxVolume,
        ctx.currentTime + 0.5
      );

      isRunning.current = true;
      console.log('[EngineSound] Started');

    } catch (error) {
      console.error('[EngineSound] Start failed:', error);
    }
  }, [getAudioContext, sfxVolume]);

  // ─────────────────────────────────────────────────────────
  // STOP ENGINE SOUND
  // ─────────────────────────────────────────────────────────

  const stopEngine = useCallback(() => {
    const ctx = getAudioContext();
    if (!ctx || !isRunning.current) return;

    try {
      // Fade out
      if (masterGain.current) {
        masterGain.current.gain.linearRampToValueAtTime(
          0,
          ctx.currentTime + 0.3
        );
      }

      // Stop after fade
      setTimeout(() => {
        oscillators.current.forEach((osc) => {
          try { osc.stop(); } catch {}
        });
        oscillators.current = [];
        gains.current = [];

        try { rumbleOsc.current?.stop(); } catch {}
        try { noiseNode.current?.stop(); } catch {}

        rumbleOsc.current = null;
        rumbleGain.current = null;
        noiseNode.current = null;
        noiseGain.current = null;
        masterGain.current = null;

        isRunning.current = false;
        console.log('[EngineSound] Stopped');
      }, 350);

    } catch (error) {
      console.error('[EngineSound] Stop failed:', error);
    }
  }, [getAudioContext]);

  // ─────────────────────────────────────────────────────────
  // UPDATE ENGINE SOUND (per frame)
  // ─────────────────────────────────────────────────────────

  const updateEngine = useCallback((time: number) => {
    const ctx = getAudioContext();
    if (!ctx || !isRunning.current || !masterGain.current) return;

    // Calculate target frequency based on velocity
    const speedRatio = Math.min(velocity / 60, 1);  // 0-1 based on 60 MPH max
    const targetFreq = ENGINE_CONFIG.BASE_FREQ +
      (ENGINE_CONFIG.MAX_FREQ - ENGINE_CONFIG.BASE_FREQ) * speedRatio;

    // Add air-cooled flutter
    const flutter = Math.sin(time * ENGINE_CONFIG.FLUTTER_SPEED) *
      ENGINE_CONFIG.AIR_COOLED_FLUTTER * targetFreq;

    // Smooth frequency transition
    currentFreq.current += (targetFreq + flutter - currentFreq.current) *
      ENGINE_CONFIG.FREQUENCY_SMOOTHING;

    // Update oscillator frequencies
    oscillators.current.forEach((osc, i) => {
      osc.frequency.setValueAtTime(
        currentFreq.current * ENGINE_CONFIG.HARMONICS[i],
        ctx.currentTime
      );
    });

    // Update rumble frequency (slower response)
    if (rumbleOsc.current) {
      const rumbleFreq = ENGINE_CONFIG.RUMBLE_FREQ +
        (speedRatio * 20) +
        (Math.sin(time * 3) * 2);
      rumbleOsc.current.frequency.setValueAtTime(rumbleFreq, ctx.currentTime);
    }

    // Calculate target volume
    let targetVolume = ENGINE_CONFIG.IDLE_VOLUME +
      (ENGINE_CONFIG.MAX_VOLUME - ENGINE_CONFIG.IDLE_VOLUME) * speedRatio;

    // Boost on acceleration
    if (throttle > 0.1) {
      targetVolume += ENGINE_CONFIG.ACCELERATION_BOOST * throttle;
    }

    // Slight reduction on braking
    if (brake > 0.1) {
      targetVolume *= (1 - brake * 0.2);
    }

    // Smooth volume transition
    currentVolume.current += (targetVolume - currentVolume.current) *
      ENGINE_CONFIG.VOLUME_SMOOTHING;

    // Apply master volume
    masterGain.current.gain.setValueAtTime(
      currentVolume.current * sfxVolume,
      ctx.currentTime
    );

    // Deceleration pop effect
    const isDecelerating = velocity < lastVelocity.current - 2 && velocity > 10;
    if (isDecelerating && Math.random() < ENGINE_CONFIG.DECEL_POP_CHANCE) {
      playDecelPop(ctx);
    }

    lastVelocity.current = velocity;
  }, [getAudioContext, velocity, throttle, brake, sfxVolume]);

  // ─────────────────────────────────────────────────────────
  // DECELERATION POP EFFECT
  // ─────────────────────────────────────────────────────────

  const playDecelPop = useCallback((ctx: AudioContext) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.value = 60 + Math.random() * 40;

    gain.gain.setValueAtTime(ENGINE_CONFIG.DECEL_POP_VOLUME * sfxVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }, [sfxVolume]);

  // ─────────────────────────────────────────────────────────
  // LIFECYCLE: Start/stop based on game phase
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isInitialized()) return;

    if (phase === 'driving') {
      startEngine();
    } else {
      stopEngine();
    }

    return () => {
      stopEngine();
    };
  }, [phase, isInitialized, startEngine, stopEngine]);

  // ─────────────────────────────────────────────────────────
  // FRAME UPDATE
  // ─────────────────────────────────────────────────────────

  useFrame((state) => {
    if (phase === 'driving') {
      updateEngine(state.clock.elapsedTime);
    }
  });

  return {
    startEngine,
    stopEngine,
    isRunning: () => isRunning.current,
  };
}

// ═══════════════════════════════════════════════════════════
// HELPER: Create noise buffer
// ═══════════════════════════════════════════════════════════

function createNoiseBuffer(ctx: AudioContext, duration: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  // Pink noise approximation (filtered white noise)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;

    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;

    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }

  return buffer;
}
typescript// src/systems/SFXManager.ts

import { useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useAudioManager } from './AudioManager';

// ═══════════════════════════════════════════════════════════
// SFX MANAGER (Quiz, UI, Cats, Zombies)
// ═══════════════════════════════════════════════════════════

export function useSFXManager() {
  const { playSound, stopSound, isInitialized } = useAudioManager();

  // Store subscriptions for reactive sounds
  const lastStreak = useRef(0);
  const lastPhase = useRef<string>('');

  // ─────────────────────────────────────────────────────────
  // UI SOUNDS
  // ─────────────────────────────────────────────────────────

  const playUIClick = useCallback(() => {
    playSound('uiClick', { category: 'ui', volume: 0.5 });
  }, [playSound]);

  const playUIHover = useCallback(() => {
    playSound('uiHover', { category: 'ui', volume: 0.3 });
  }, [playSound]);

  // ─────────────────────────────────────────────────────────
  // QUIZ SOUNDS
  // ─────────────────────────────────────────────────────────

  const playQuizAppear = useCallback(() => {
    playSound('quizAppear', { category: 'sfx', volume: 0.6 });
  }, [playSound]);

  const playQuizCorrect = useCallback(() => {
    playSound('quizCorrect', { category: 'sfx', volume: 0.7 });
  }, [playSound]);

  const playQuizWrong = useCallback(() => {
    playSound('quizWrong', { category: 'sfx', volume: 0.6 });
  }, [playSound]);

  const playStreakBonus = useCallback(() => {
    playSound('streakBonus', { category: 'sfx', volume: 0.8, pitch: 1.1 });
  }, [playSound]);

  // ─────────────────────────────────────────────────────────
  // CAT SOUNDS
  // ─────────────────────────────────────────────────────────

  const playCatMeow = useCallback((variant: 1 | 2 = 1) => {
    const key = variant === 1 ? 'catMeow1' : 'catMeow2';
    const pitch = 0.9 + Math.random() * 0.2;  // Slight variation
    playSound(key, { category: 'cat', volume: 0.6, pitch });
  }, [playSound]);

  const playCatPurr = useCallback(() => {
    return playSound('catPurr', {
      category: 'cat',
      volume: 0.4,
      loop: true,
      id: 'cat-purr',
    });
  }, [playSound]);

  const stopCatPurr = useCallback(() => {
    stopSound('cat-purr', true);
  }, [stopSound]);

  const playCatChirp = useCallback(() => {
    playSound('catChirp', { category: 'cat', volume: 0.5 });
  }, [playSound]);

  const playCatHiss = useCallback(() => {
    playSound('catHiss', { category: 'cat', volume: 0.6 });
  }, [playSound]);

  // ─────────────────────────────────────────────────────────
  // ZOMBIE SOUNDS
  // ─────────────────────────────────────────────────────────

  const playZombieGroan = useCallback(() => {
    const variant = Math.ceil(Math.random() * 3) as 1 | 2 | 3;
    const key = `zombieGroan${variant}` as keyof typeof import('./AudioManager').SOUND_PATHS;
    const pitch = 0.7 + Math.random() * 0.4;
    playSound(key as any, { category: 'zombie', volume: 0.4, pitch });
  }, [playSound]);

  const playZombieAlert = useCallback(() => {
    playSound('zombieAlert', { category: 'zombie', volume: 0.5 });
  }, [playSound]);

  // ─────────────────────────────────────────────────────────
  // VEHICLE SOUNDS
  // ─────────────────────────────────────────────────────────

  const playHorn = useCallback(() => {
    playSound('horn', { category: 'sfx', volume: 0.7 });
  }, [playSound]);

  const playBrakeSqueal = useCallback(() => {
    playSound('brake', { category: 'sfx', volume: 0.5 });
  }, [playSound]);

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  return {
    // UI
    playUIClick,
    playUIHover,

    // Quiz
    playQuizAppear,
    playQuizCorrect,
    playQuizWrong,
    playStreakBonus,

    // Cats
    playCatMeow,
    playCatPurr,
    stopCatPurr,
    playCatChirp,
    playCatHiss,

    // Zombies
    playZombieGroan,
    playZombieAlert,

    // Vehicle
    playHorn,
    playBrakeSqueal,
  };
}
typescript// src/systems/AmbientSoundManager.ts

import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useAudioManager } from './AudioManager';

// ═══════════════════════════════════════════════════════════
// AMBIENT SOUND CONFIGURATION
// ═══════════════════════════════════════════════════════════

const AMBIENT_CONFIG = {
  CROSSFADE_DURATION: 2000,               // ms for biome transitions
  VOLUME: 0.25,
};

// ═══════════════════════════════════════════════════════════
// AMBIENT SOUND MANAGER HOOK
// ═══════════════════════════════════════════════════════════

export function useAmbientSoundManager() {
  const { playSound, stopSound, setCategoryVolume, isInitialized } = useAudioManager();

  // Store
  const currentBiome = useGameStore((s) => s.game.currentBiome);
  const phase = useGameStore((s) => s.game.phase);
  const musicVolume = useGameStore((s) => s.settings.musicVolume);

  // Active ambient track
  const currentAmbientId = useRef<string | null>(null);
  const lastBiome = useRef<string | null>(null);

  // ─────────────────────────────────────────────────────────
  // GET AMBIENT TRACK FOR BIOME
  // ─────────────────────────────────────────────────────────

  const getAmbientTrack = (biome: string): keyof typeof import('./AudioManager').SOUND_PATHS => {
    switch (biome) {
      case 'city': return 'cityAmbient';
      case 'highway': return 'highwayAmbient';
      case 'rural': return 'ruralAmbient';
      default: return 'highwayAmbient';
    }
  };

  // ─────────────────────────────────────────────────────────
  // START AMBIENT FOR BIOME
  // ─────────────────────────────────────────────────────────

  const startAmbient = useCallback(async (biome: string) => {
    if (!isInitialized()) return;

    const track = getAmbientTrack(biome);

    // Stop previous (with fade)
    if (currentAmbientId.current) {
      stopSound(currentAmbientId.current, true);
    }

    // Start new
    const id = await playSound(track as any, {
      category: 'music',
      volume: AMBIENT_CONFIG.VOLUME,
      loop: true,
      id: `ambient-${biome}`,
    });

    currentAmbientId.current = id;
    lastBiome.current = biome;
  }, [isInitialized, playSound, stopSound]);

  // ─────────────────────────────────────────────────────────
  // STOP AMBIENT
  // ─────────────────────────────────────────────────────────

  const stopAmbient = useCallback(() => {
    if (currentAmbientId.current) {
      stopSound(currentAmbientId.current, true);
      currentAmbientId.current = null;
    }
  }, [stopSound]);

  // ─────────────────────────────────────────────────────────
  // REACT TO BIOME CHANGES
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'driving') {
      stopAmbient();
      return;
    }

    if (currentBiome !== lastBiome.current) {
      startAmbient(currentBiome);
    }
  }, [phase, currentBiome, startAmbient, stopAmbient]);

  // ─────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopAmbient();
    };
  }, [stopAmbient]);

  return {
    startAmbient,
    stopAmbient,
  };
}
typescript// src/systems/ZombieSoundManager.ts

import { useRef, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../stores/gameStore';
import { useZombieManager } from './ZombieManager';
import { useSFXManager } from './SFXManager';

// ═══════════════════════════════════════════════════════════
// ZOMBIE SOUND CONFIGURATION
// ═══════════════════════════════════════════════════════════

const ZOMBIE_SOUND_CONFIG = {
  GROAN_INTERVAL_MIN: 3000,               // ms between groans
  GROAN_INTERVAL_MAX: 8000,
  MAX_DISTANCE: 25,                       // Max distance to hear zombies
  ALERT_SOUND_COOLDOWN: 2000,             // ms between alert sounds
  MAX_CONCURRENT_GROANS: 2,
};

// ═══════════════════════════════════════════════════════════
// ZOMBIE SOUND MANAGER HOOK
// ═══════════════════════════════════════════════════════════

export function useZombieSoundManager() {
  const { getActiveZombies, getStressLevel } = useZombieManager();
  const { playZombieGroan, playZombieAlert } = useSFXManager();

  // Store
  const playerPos = useGameStore((s) => s.vehicle.position);
  const phase = useGameStore((s) => s.game.phase);

  // Timing
  const lastGroanTime = useRef(0);
  const lastAlertTime = useRef(0);
  const groanCooldown = useRef(ZOMBIE_SOUND_CONFIG.GROAN_INTERVAL_MIN);
  const activeGroans = useRef(0);

  // ─────────────────────────────────────────────────────────
  // UPDATE ZOMBIE SOUNDS
  // ─────────────────────────────────────────────────────────

  useFrame(() => {
    if (phase !== 'driving') return;

    const now = Date.now();
    const zombies = getActiveZombies();
    const playerPosition = new Vector3(playerPos[0], playerPos[1], playerPos[2]);
    const stress = getStressLevel();

    // Find nearby zombies
    const nearbyZombies = zombies.filter((z) => {
      const dist = z.position.distanceTo(playerPosition);
      return dist < ZOMBIE_SOUND_CONFIG.MAX_DISTANCE;
    });

    if (nearbyZombies.length === 0) return;

    // Adjust groan frequency based on stress
    groanCooldown.current = ZOMBIE_SOUND_CONFIG.GROAN_INTERVAL_MIN +
      (1 - stress) * (ZOMBIE_SOUND_CONFIG.GROAN_INTERVAL_MAX - ZOMBIE_SOUND_CONFIG.GROAN_INTERVAL_MIN);

    // Random groans from nearby zombies
    if (now - lastGroanTime.current > groanCooldown.current) {
      if (activeGroans.current < ZOMBIE_SOUND_CONFIG.MAX_CONCURRENT_GROANS) {
        // Pick a random nearby zombie
        const zombie = nearbyZombies[Math.floor(Math.random() * nearbyZombies.length)];
        const distance = zombie.position.distanceTo(playerPosition);

        // Volume based on distance
        const volume = 1 - (distance / ZOMBIE_SOUND_CONFIG.MAX_DISTANCE);

        if (volume > 0.1) {
          playZombieGroan();
          activeGroans.current++;

          // Reset after sound finishes
          setTimeout(() => {
            activeGroans.current = Math.max(0, activeGroans.current - 1);
          }, 2000);
        }

        lastGroanTime.current = now;
      }
    }

    // Alert sound when zombie enters alert state
    const alertedZombie = nearbyZombies.find((z) => z.state === 'alert');
    if (alertedZombie && now - lastAlertTime.current > ZOMBIE_SOUND_CONFIG.ALERT_SOUND_COOLDOWN) {
      playZombieAlert();
      lastAlertTime.current = now;
    }
  });
}
typescript// src/systems/CatSoundManager.ts

import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useCatCompanionManager } from './CatCompanionManager';
import { useSFXManager } from './SFXManager';

// ═══════════════════════════════════════════════════════════
// CAT SOUND CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CAT_SOUND_CONFIG = {
  MEOW_CHANCE_ON_MESSAGE: 0.3,            // Chance to meow when speaking
  CHIRP_CHANCE_EXCITED: 0.5,              // Chance to chirp when excited
  HISS_CHANCE_WORRIED: 0.2,               // Chance to hiss when worried
  PURR_DURING_CALM: true,                 // Purr during low-stress driving
  STRESS_THRESHOLD_PURR: 0.3,             // Stop purring above this stress
};

// ═══════════════════════════════════════════════════════════
// CAT SOUND MANAGER HOOK
// ═══════════════════════════════════════════════════════════

export function useCatSoundManager() {
  const {
    playCatMeow,
    playCatPurr,
    stopCatPurr,
    playCatChirp,
    playCatHiss,
  } = useSFXManager();

  const { activeMessage, catStates } = useCatCompanionManager();

  // Store
  const phase = useGameStore((s) => s.game.phase);
  const streak = useGameStore((s) => s.economy.streak);

  // State
  const isPurring = useRef(false);
  const lastMessageId = useRef<string | null>(null);

  // ─────────────────────────────────────────────────────────
  // REACT TO CAT MESSAGES
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeMessage || activeMessage.id === lastMessageId.current) return;
    lastMessageId.current = activeMessage.id;

    const { mood, cat } = activeMessage;

    // Sound based on mood
    switch (mood) {
      case 'excited':
        if (Math.random() < CAT_SOUND_CONFIG.CHIRP_CHANCE_EXCITED) {
          playCatChirp();
        } else if (Math.random() < CAT_SOUND_CONFIG.MEOW_CHANCE_ON_MESSAGE) {
          playCatMeow(cat === 'mya' ? 1 : 2);
        }
        break;

      case 'worried':
        if (Math.random() < CAT_SOUND_CONFIG.HISS_CHANCE_WORRIED) {
          playCatHiss();
        }
        break;

      case 'happy':
        if (Math.random() < CAT_SOUND_CONFIG.MEOW_CHANCE_ON_MESSAGE) {
          playCatMeow(cat === 'mya' ? 1 : 2);
        }
        break;

      default:
        // Occasional meow on neutral messages
        if (Math.random() < CAT_SOUND_CONFIG.MEOW_CHANCE_ON_MESSAGE * 0.5) {
          playCatMeow(Math.random() > 0.5 ? 1 : 2);
        }
    }
  }, [activeMessage, playCatMeow, playCatChirp, playCatHiss]);

  // ─────────────────────────────────────────────────────────
  // STREAK CELEBRATION SOUNDS
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (streak > 0 && streak % 3 === 0) {
      // Chirp on streak milestones
      playCatChirp();
    }
  }, [streak, playCatChirp]);

  // ─────────────────────────────────────────────────────────
  // PURRING DURING CALM DRIVING
  // ─────────────────────────────────────────────────────────

  // Note: Purring logic would check stress level and toggle
  // This is a simplified version
  useEffect(() => {
    if (phase !== 'driving') {
      if (isPurring.current) {
        stopCatPurr();
        isPurring.current = false;
      }
    }
  }, [phase, stopCatPurr]);

  return {
    playCatMeow,
    playCatChirp,
    playCatHiss,
  };
}typescript// src/components/Audio/AudioIntegration.tsx

import { useEffect, useCallback } from 'react';
import { useAudioManager } from '../../systems/AudioManager';
import { useEngineSoundGenerator } from '../../systems/EngineSoundGenerator';
import { useSFXManager } from '../../systems/SFXManager';
import { useAmbientSoundManager } from '../../systems/AmbientSoundManager';
import { useZombieSoundManager } from '../../systems/ZombieSoundManager';
import { useCatSoundManager } from '../../systems/CatSoundManager';
import { useGameStore } from '../../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// AUDIO INTEGRATION COMPONENT
// ═══════════════════════════════════════════════════════════

export function AudioIntegration() {
  const { initialize, resume, isInitialized } = useAudioManager();
  const { playQuizAppear, playQuizCorrect, playQuizWrong, playStreakBonus } = useSFXManager();

  // Initialize other audio systems (they self-manage)
  useEngineSoundGenerator();
  useAmbientSoundManager();
  useZombieSoundManager();
  useCatSoundManager();

  // Store subscriptions
  const phase = useGameStore((s) => s.game.phase);
  const quizActive = useGameStore((s) => s.quiz.isActive);
  const streak = useGameStore((s) => s.economy.streak);

  // ─────────────────────────────────────────────────────────
  // INITIALIZE ON FIRST INTERACTION
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    const handleFirstInteraction = async () => {
      if (!isInitialized()) {
        await initialize();
      }
      await resume();
    };

    // Listen for first user interaction
    const events = ['touchstart', 'mousedown', 'keydown'];
    events.forEach((event) => {
      document.addEventListener(event, handleFirstInteraction, { once: true });
    });

    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, handleFirstInteraction);
      });
    };
  }, [initialize, resume, isInitialized]);

  // ─────────────────────────────────────────────────────────
  // QUIZ SOUNDS
  // ─────────────────────────────────────────────────────────

  // Quiz appear sound
  useEffect(() => {
    if (quizActive) {
      playQuizAppear();
    }
  }, [quizActive, playQuizAppear]);

  // This component doesn't render anything
  return null;
}

// ═══════════════════════════════════════════════════════════
// QUIZ ANSWER SOUND HOOK (use in QuizOverlay)
// ═══════════════════════════════════════════════════════════

export function useQuizSounds() {
  const { playQuizCorrect, playQuizWrong, playStreakBonus } = useSFXManager();
  const streak = useGameStore((s) => s.economy.streak);

  const playAnswerSound = useCallback((isCorrect: boolean) => {
    if (isCorrect) {
      playQuizCorrect();

      // Bonus sound for streaks
      if (streak > 0 && (streak + 1) % 3 === 0) {
        setTimeout(() => playStreakBonus(), 300);
      }
    } else {
      playQuizWrong();
    }
  }, [playQuizCorrect, playQuizWrong, playStreakBonus, streak]);

  return { playAnswerSound };
}
typescript// src/components/UI/AudioSettings.tsx

import { useGameStore } from '../../stores/gameStore';
import { useAudioManager } from '../../systems/AudioManager';
import './AudioSettings.css';

// ═══════════════════════════════════════════════════════════
// AUDIO SETTINGS COMPONENT
// ═══════════════════════════════════════════════════════════

interface AudioSettingsProps {
  onClose?: () => void;
}

export function AudioSettings({ onClose }: AudioSettingsProps) {
  // Store
  const musicVolume = useGameStore((s) => s.settings.musicVolume);
  const sfxVolume = useGameStore((s) => s.settings.sfxVolume);

  // Direct state update (settings are persisted by zustand)
  const setMusicVolume = (volume: number) => {
    useGameStore.setState((state) => ({
      settings: { ...state.settings, musicVolume: volume },
    }));
  };

  const setSfxVolume = (volume: number) => {
    useGameStore.setState((state) => ({
      settings: { ...state.settings, sfxVolume: volume },
    }));
  };

  return (
    <div className="audio-settings">
      <h3 className="settings-title">Audio Settings</h3>

      {/* Music Volume */}
      <div className="setting-row">
        <label className="setting-label">
          <span className="label-icon">🎵</span>
          <span className="label-text">Music & Ambient</span>
        </label>
        <div className="slider-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={musicVolume}
            onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
            className="volume-slider"
          />
          <span className="volume-value">{Math.round(musicVolume * 100)}%</span>
        </div>
      </div>

      {/* SFX Volume */}
      <div className="setting-row">
        <label className="setting-label">
          <span className="label-icon">🔊</span>
          <span className="label-text">Sound Effects</span>
        </label>
        <div className="slider-container">
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={sfxVolume}
            onChange={(e) => setSfxVolume(parseFloat(e.target.value))}
            className="volume-slider"
          />
          <span className="volume-value">{Math.round(sfxVolume * 100)}%</span>
        </div>
      </div>

      {/* Quick presets */}
      <div className="preset-buttons">
        <button
          className="preset-btn"
          onClick={() => {
            setMusicVolume(0);
            setSfxVolume(0);
          }}
        >
          🔇 Mute All
        </button>
        <button
          className="preset-btn"
          onClick={() => {
            setMusicVolume(0.5);
            setSfxVolume(0.8);
          }}
        >
          🔈 Default
        </button>
        <button
          className="preset-btn"
          onClick={() => {
            setMusicVolume(0.7);
            setSfxVolume(1.0);
          }}
        >
          🔊 Loud
        </button>
      </div>

      {onClose && (
        <button className="close-btn" onClick={onClose}>
          Done
        </button>
      )}
    </div>
  );
}
css/* src/components/UI/AudioSettings.css */

.audio-settings {
  background: rgba(26, 26, 46, 0.95);
  border: 2px solid rgba(255, 0, 255, 0.4);
  border-radius: 16px;
  padding: 20px;
  max-width: 320px;
  width: 100%;
}

.settings-title {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: bold;
  color: #ffffff;
  text-align: center;
}

.setting-row {
  margin-bottom: 20px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.label-icon {
  font-size: 18px;
}

.label-text {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  font-weight: 500;
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.volume-slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  outline: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #ff00ff, #39ff14);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(255, 0, 255, 0.5);
}

.volume-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  background: linear-gradient(135deg, #ff00ff, #39ff14);
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.volume-value {
  min-width: 45px;
  text-align: right;
  color: #39ff14;
  font-size: 14px;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}

.preset-buttons {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.preset-btn {
  flex: 1;
  padding: 8px 4px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #ffffff;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-btn:hover {
  background: rgba(255, 0, 255, 0.2);
  border-color: #ff00ff;
}

.preset-btn:active {
  transform: scale(0.95);
}

.close-btn {
  width: 100%;
  margin-top: 16px;
  padding: 12px;
  background: linear-gradient(135deg, #ff00ff, #aa00aa);
  border: none;
  border-radius: 10px;
  color: #ffffff;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn:hover {
  box-shadow: 0 0 20px rgba(255, 0, 255, 0.5);
}

Now update Game.tsx and QuizOverlay to include audio:
typescript// src/Game.tsx (add audio import and component)

// Add to imports:
import { AudioIntegration } from './components/Audio/AudioIntegration';

// Add inside Game component return, after ui-layer div opens:
export function Game() {
  // ... existing code ...

  return (
    <div className={`game-container ${phase === 'quiz' ? 'quiz-active' : ''}`}>
      {/* Audio System (invisible) */}
      <AudioIntegration />

      <Canvas {...CANVAS_CONFIG}>
        {/* ... existing 3D content ... */}
      </Canvas>

      {/* ... existing UI ... */}
    </div>
  );
}
typescript// src/components/Quiz/QuizOverlay.tsx (add sound integration)

// Add import:
import { useQuizSounds } from '../Audio/AudioIntegration';

// Inside QuizOverlay component:
export function QuizOverlay() {
  // ... existing code ...
  
  const { playAnswerSound } = useQuizSounds();

  // Update handleAnswer to include sound:
  const handleAnswer = useCallback((index: number) => {
    if (selectedIndex !== null) return;

    setSelectedIndex(index);
    const correct = answerQuiz(index);
    setIsCorrect(correct);
    setShowFeedback(true);

    // Play sound effect
    playAnswerSound(correct);

    setTimeout(() => {
      closeQuiz();
    }, QUIZ_CONFIG.ANSWER_FEEDBACK_MS);
  }, [selectedIndex, answerQuiz, closeQuiz, playAnswerSound]);

  // ... rest of component ...
}
```

---

**Audio System Summary:**

| Component | Description |
|-----------|-------------|
| **AudioManager** | Core Web Audio API wrapper, buffer cache, category gains |
| **EngineSoundGenerator** | Procedural VW Beetle engine (oscillators + harmonics + noise) |
| **SFXManager** | One-shot sounds (UI, quiz, cats, zombies, vehicle) |
| **AmbientSoundManager** | Biome-based ambient loops with crossfade |
| **ZombieSoundManager** | Distance-based groans, alert sounds |
| **CatSoundManager** | Mood-reactive meows, chirps, purrs, hisses |
| **AudioSettings** | Volume sliders, quick presets |

**Engine Sound Features:**
- Sawtooth + triangle harmonics for realistic timbre
- Low rumble sub-bass layer
- Pink noise for air-cooled character
- Frequency flutter for authenticity
- Deceleration "pop" effects
- Volume boost on acceleration

**Sound Categories:**
| Category | Default Volume | Contains |
|----------|---------------|----------|
| engine | 0.6 | Procedural engine |
| sfx | 0.8 | Quiz, vehicle, UI |
| zombie | 0.5 | Groans, alerts |
| cat | 0.7 | Meows, purrs, hisses |
| music | 0.4 | Ambient loops |
| ui | 0.6 | Clicks, hovers |

---

**Placeholder Audio Files Needed:**
```
public/audio/
├── ui/
│   ├── click.mp3         (~50KB)
│   └── hover.mp3         (~20KB)
├── quiz/
│   ├── correct.mp3       (~100KB)
│   ├── wrong.mp3         (~80KB)
│   ├── appear.mp3        (~60KB)
│   └── streak.mp3        (~120KB)
├── zombie/
│   ├── groan1.mp3        (~150KB)
│   ├── groan2.mp3        (~150KB)
│   ├── groan3.mp3        (~150KB)
│   ├── shuffle.mp3       (~100KB)
│   └── alert.mp3         (~80KB)
├── cat/
│   ├── meow1.mp3         (~100KB)
│   ├── meow2.mp3         (~100KB)
│   ├── purr.mp3          (~200KB, loopable)
│   ├── chirp.mp3         (~60KB)
│   └── hiss.mp3          (~80KB)
├── vehicle/
│   ├── horn.mp3          (~150KB)
│   └── brake.mp3         (~100KB)
├── ambient/
│   ├── city.mp3          (~500KB, loopable)
│   ├── highway.mp3       (~500KB, loopable)
│   └── rural.mp3         (~500KB, loopable)
└── music/
    ├── menu.mp3          (~1MB, loopable)
    └── driving.mp3       (~1MB, loopable)

Want me to continue with:

Keyboard controls (desktop WASD fallback)
Final integration & package.json (dependencies, scripts, full project structure)
1Jan 21Architected integrated keyboard and touch control interfaceArchitected integrated keyboard and touch control interfaceStep 19: Keyboard Controls (Desktop Fallback)
typescript// src/hooks/useKeyboardControls.ts

import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// KEYBOARD CONFIGURATION
// ═══════════════════════════════════════════════════════════

const KEY_CONFIG = {
  // Movement keys (multiple bindings per action)
  BINDINGS: {
    throttle: ['KeyW', 'ArrowUp'],
    brake: ['KeyS', 'ArrowDown'],
    steerLeft: ['KeyA', 'ArrowLeft'],
    steerRight: ['KeyD', 'ArrowRight'],
    horn: ['KeyH', 'Space'],
    pause: ['Escape', 'KeyP'],
  },
  
  // Input behavior
  STEERING_SPEED: 3.0,                    // How fast steering responds
  STEERING_RETURN_SPEED: 5.0,             // How fast steering centers
  THROTTLE_SPEED: 4.0,                    // How fast throttle responds
  BRAKE_SPEED: 6.0,                       // How fast brake responds
  INPUT_DECAY: 8.0,                       // How fast inputs decay when released
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface KeyState {
  throttle: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  horn: boolean;
}

interface SmoothInputs {
  throttle: number;
  brake: number;
  steering: number;
}

// ═══════════════════════════════════════════════════════════
// KEYBOARD CONTROLS HOOK
// ═══════════════════════════════════════════════════════════

export function useKeyboardControls() {
  // Store
  const setVehicleControls = useGameStore((s) => s.setVehicleControls);
  const phase = useGameStore((s) => s.game.phase);
  const setPhase = useGameStore((s) => s.setPhase);

  // Key states (raw boolean)
  const keyState = useRef<KeyState>({
    throttle: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    horn: false,
  });

  // Smoothed inputs (0-1 range)
  const smoothInputs = useRef<SmoothInputs>({
    throttle: 0,
    brake: 0,
    steering: 0,
  });

  // Animation frame
  const frameId = useRef<number | null>(null);
  const lastTime = useRef(performance.now());

  // Horn callback (optional, for audio integration)
  const onHornPress = useRef<(() => void) | null>(null);

  // ─────────────────────────────────────────────────────────
  // CHECK IF KEY MATCHES ACTION
  // ─────────────────────────────────────────────────────────

  const isKeyBound = useCallback((code: string, action: keyof typeof KEY_CONFIG.BINDINGS): boolean => {
    return KEY_CONFIG.BINDINGS[action].includes(code);
  }, []);

  // ─────────────────────────────────────────────────────────
  // HANDLE KEY DOWN
  // ─────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const code = e.code;

    // Pause toggle (works in any phase)
    if (isKeyBound(code, 'pause')) {
      e.preventDefault();
      if (phase === 'driving') {
        setPhase('paused');
      } else if (phase === 'paused') {
        setPhase('driving');
      }
      return;
    }

    // Only process driving inputs during driving phase
    if (phase !== 'driving') return;

    // Prevent default for bound keys
    if (Object.values(KEY_CONFIG.BINDINGS).flat().includes(code)) {
      e.preventDefault();
    }

    // Update key states
    if (isKeyBound(code, 'throttle')) keyState.current.throttle = true;
    if (isKeyBound(code, 'brake')) keyState.current.brake = true;
    if (isKeyBound(code, 'steerLeft')) keyState.current.steerLeft = true;
    if (isKeyBound(code, 'steerRight')) keyState.current.steerRight = true;
    
    // Horn (trigger once on press)
    if (isKeyBound(code, 'horn') && !keyState.current.horn) {
      keyState.current.horn = true;
      onHornPress.current?.();
    }
  }, [phase, setPhase, isKeyBound]);

  // ─────────────────────────────────────────────────────────
  // HANDLE KEY UP
  // ─────────────────────────────────────────────────────────

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const code = e.code;

    // Update key states
    if (isKeyBound(code, 'throttle')) keyState.current.throttle = false;
    if (isKeyBound(code, 'brake')) keyState.current.brake = false;
    if (isKeyBound(code, 'steerLeft')) keyState.current.steerLeft = false;
    if (isKeyBound(code, 'steerRight')) keyState.current.steerRight = false;
    if (isKeyBound(code, 'horn')) keyState.current.horn = false;
  }, [isKeyBound]);

  // ─────────────────────────────────────────────────────────
  // HANDLE WINDOW BLUR (release all keys)
  // ─────────────────────────────────────────────────────────

  const handleBlur = useCallback(() => {
    keyState.current = {
      throttle: false,
      brake: false,
      steerLeft: false,
      steerRight: false,
      horn: false,
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // SMOOTH INPUT UPDATE LOOP
  // ─────────────────────────────────────────────────────────

  const updateInputs = useCallback(() => {
    const now = performance.now();
    const delta = Math.min((now - lastTime.current) / 1000, 0.05); // Cap at 50ms
    lastTime.current = now;

    const keys = keyState.current;
    const inputs = smoothInputs.current;

    // ─────────────────────────────────────────────────────
    // THROTTLE (smooth ramp up/down)
    // ─────────────────────────────────────────────────────

    if (keys.throttle) {
      inputs.throttle = Math.min(1, inputs.throttle + KEY_CONFIG.THROTTLE_SPEED * delta);
    } else {
      inputs.throttle = Math.max(0, inputs.throttle - KEY_CONFIG.INPUT_DECAY * delta);
    }

    // ─────────────────────────────────────────────────────
    // BRAKE (smooth ramp up/down)
    // ─────────────────────────────────────────────────────

    if (keys.brake) {
      inputs.brake = Math.min(1, inputs.brake + KEY_CONFIG.BRAKE_SPEED * delta);
    } else {
      inputs.brake = Math.max(0, inputs.brake - KEY_CONFIG.INPUT_DECAY * delta);
    }

    // ─────────────────────────────────────────────────────
    // STEERING (smooth with auto-center)
    // ─────────────────────────────────────────────────────

    const steerInput = (keys.steerRight ? 1 : 0) - (keys.steerLeft ? 1 : 0);

    if (steerInput !== 0) {
      // Steer toward input direction
      const targetSteering = steerInput;
      const steerDelta = KEY_CONFIG.STEERING_SPEED * delta;
      
      if (inputs.steering < targetSteering) {
        inputs.steering = Math.min(targetSteering, inputs.steering + steerDelta);
      } else if (inputs.steering > targetSteering) {
        inputs.steering = Math.max(targetSteering, inputs.steering - steerDelta);
      }
    } else {
      // Auto-center when no input
      const returnDelta = KEY_CONFIG.STEERING_RETURN_SPEED * delta;
      
      if (inputs.steering > 0) {
        inputs.steering = Math.max(0, inputs.steering - returnDelta);
      } else if (inputs.steering < 0) {
        inputs.steering = Math.min(0, inputs.steering + returnDelta);
      }
    }

    // ─────────────────────────────────────────────────────
    // APPLY TO STORE (only during driving)
    // ─────────────────────────────────────────────────────

    if (phase === 'driving') {
      setVehicleControls(inputs.throttle, inputs.brake, inputs.steering);
    }

    // Continue loop
    frameId.current = requestAnimationFrame(updateInputs);
  }, [phase, setVehicleControls]);

  // ─────────────────────────────────────────────────────────
  // SETUP EVENT LISTENERS
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    // Start input update loop
    frameId.current = requestAnimationFrame(updateInputs);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);

      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
      }
    };
  }, [handleKeyDown, handleKeyUp, handleBlur, updateInputs]);

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  return {
    setHornCallback: (callback: () => void) => {
      onHornPress.current = callback;
    },
    getInputState: () => ({ ...smoothInputs.current }),
    isKeyPressed: (action: keyof typeof KEY_CONFIG.BINDINGS) => {
      switch (action) {
        case 'throttle': return keyState.current.throttle;
        case 'brake': return keyState.current.brake;
        case 'steerLeft': return keyState.current.steerLeft;
        case 'steerRight': return keyState.current.steerRight;
        case 'horn': return keyState.current.horn;
        default: return false;
      }
    },
    config: KEY_CONFIG,
  };
}typescript// src/components/UI/KeyboardOverlay.tsx

import { useState, useEffect } from 'react';
import { useKeyboardControls } from '../../hooks/useKeyboardControls';
import { useGameStore } from '../../stores/gameStore';
import './KeyboardOverlay.css';

// ═══════════════════════════════════════════════════════════
// KEYBOARD OVERLAY COMPONENT
// ═══════════════════════════════════════════════════════════

export function KeyboardOverlay() {
  const phase = useGameStore((s) => s.game.phase);
  const { isKeyPressed, config } = useKeyboardControls();
  
  // Detect if user is on desktop (has keyboard)
  const [isDesktop, setIsDesktop] = useState(false);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    // Simple desktop detection
    const hasKeyboard = !('ontouchstart' in window) && 
      !navigator.maxTouchPoints;
    setIsDesktop(hasKeyboard);

    // Hide hint after 10 seconds
    const timer = setTimeout(() => setShowHint(false), 10000);
    return () => clearTimeout(timer);
  }, []);

  // Only show on desktop during driving
  if (!isDesktop || phase !== 'driving') return null;

  return (
    <div className="keyboard-overlay">
      {/* Initial hint */}
      {showHint && (
        <div className="keyboard-hint">
          <span>Use</span>
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
          <span>or</span>
          <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
          <span>to drive</span>
          <button 
            className="hint-dismiss"
            onClick={() => setShowHint(false)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Active key indicators */}
      <div className="key-indicators">
        <div className="key-row">
          <KeyIndicator 
            label="W" 
            subLabel="↑" 
            active={isKeyPressed('throttle')} 
          />
        </div>
        <div className="key-row">
          <KeyIndicator 
            label="A" 
            subLabel="←" 
            active={isKeyPressed('steerLeft')} 
          />
          <KeyIndicator 
            label="S" 
            subLabel="↓" 
            active={isKeyPressed('brake')} 
          />
          <KeyIndicator 
            label="D" 
            subLabel="→" 
            active={isKeyPressed('steerRight')} 
          />
        </div>
      </div>

      {/* Additional controls hint */}
      <div className="extra-controls">
        <span className="control-hint">
          <kbd>H</kbd> Horn
        </span>
        <span className="control-hint">
          <kbd>Esc</kbd> Pause
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// KEY INDICATOR COMPONENT
// ═══════════════════════════════════════════════════════════

interface KeyIndicatorProps {
  label: string;
  subLabel?: string;
  active: boolean;
}

function KeyIndicator({ label, subLabel, active }: KeyIndicatorProps) {
  return (
    <div className={`key-indicator ${active ? 'active' : ''}`}>
      <span className="key-main">{label}</span>
      {subLabel && <span className="key-sub">{subLabel}</span>}
    </div>
  );
}
css/* src/components/UI/KeyboardOverlay.css */

/* ═══════════════════════════════════════════════════════════
   KEYBOARD OVERLAY CONTAINER
   ═══════════════════════════════════════════════════════════ */

.keyboard-overlay {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 55;
  pointer-events: none;
}

/* ═══════════════════════════════════════════════════════════
   INITIAL HINT BANNER
   ═══════════════════════════════════════════════════════════ */

.keyboard-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(18, 18, 18, 0.9);
  border: 1px solid rgba(255, 0, 255, 0.4);
  border-radius: 12px;
  padding: 10px 16px;
  margin-bottom: 12px;
  animation: hint-appear 0.3s ease-out;
  pointer-events: auto;
}

@keyframes hint-appear {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.keyboard-hint span {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}

.keyboard-hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  font-weight: bold;
}

.hint-dismiss {
  margin-left: 8px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
  pointer-events: auto;
}

.hint-dismiss:hover {
  color: #ff00ff;
}

/* ═══════════════════════════════════════════════════════════
   KEY INDICATORS (WASD display)
   ═══════════════════════════════════════════════════════════ */

.key-indicators {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.key-row {
  display: flex;
  gap: 4px;
}

.key-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: rgba(18, 18, 18, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  transition: all 0.1s ease;
}

.key-indicator.active {
  background: rgba(255, 0, 255, 0.3);
  border-color: #ff00ff;
  box-shadow: 0 0 15px rgba(255, 0, 255, 0.5);
  transform: scale(0.95);
}

.key-main {
  color: #ffffff;
  font-size: 16px;
  font-weight: bold;
  line-height: 1;
}

.key-sub {
  color: rgba(255, 255, 255, 0.4);
  font-size: 10px;
  line-height: 1;
  margin-top: 2px;
}

.key-indicator.active .key-main {
  color: #ff00ff;
  text-shadow: 0 0 8px #ff00ff;
}

.key-indicator.active .key-sub {
  color: rgba(255, 0, 255, 0.7);
}

/* ═══════════════════════════════════════════════════════════
   EXTRA CONTROLS
   ═══════════════════════════════════════════════════════════ */

.extra-controls {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.control-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.control-hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 4px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.7);
  font-family: inherit;
  font-size: 10px;
}

/* ═══════════════════════════════════════════════════════════
   HIDE ON MOBILE (redundant but safe)
   ═══════════════════════════════════════════════════════════ */

@media (max-width: 768px), (pointer: coarse) {
  .keyboard-overlay {
    display: none;
  }
}
typescript// src/hooks/useUnifiedInput.ts

import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// UNIFIED INPUT MANAGER
// Combines touch and keyboard input sources
// ═══════════════════════════════════════════════════════════

interface InputState {
  throttle: number;
  brake: number;
  steering: number;
  source: 'touch' | 'keyboard' | 'none';
}

interface InputSource {
  throttle: number;
  brake: number;
  steering: number;
  active: boolean;
}

export function useUnifiedInput() {
  const setVehicleControls = useGameStore((s) => s.setVehicleControls);
  const phase = useGameStore((s) => s.game.phase);

  // Input sources
  const touchInput = useRef<InputSource>({
    throttle: 0,
    brake: 0,
    steering: 0,
    active: false,
  });

  const keyboardInput = useRef<InputSource>({
    throttle: 0,
    brake: 0,
    steering: 0,
    active: false,
  });

  // Combined output
  const currentInput = useRef<InputState>({
    throttle: 0,
    brake: 0,
    steering: 0,
    source: 'none',
  });

  // ─────────────────────────────────────────────────────────
  // UPDATE FROM TOUCH SOURCE
  // ─────────────────────────────────────────────────────────

  const updateTouchInput = useCallback((throttle: number, brake: number, steering: number) => {
    touchInput.current = {
      throttle,
      brake,
      steering,
      active: throttle > 0 || brake > 0 || Math.abs(steering) > 0.01,
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // UPDATE FROM KEYBOARD SOURCE
  // ─────────────────────────────────────────────────────────

  const updateKeyboardInput = useCallback((throttle: number, brake: number, steering: number) => {
    keyboardInput.current = {
      throttle,
      brake,
      steering,
      active: throttle > 0 || brake > 0 || Math.abs(steering) > 0.01,
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // COMBINE INPUTS (priority: most recent active source)
  // ─────────────────────────────────────────────────────────

  const combineInputs = useCallback(() => {
    const touch = touchInput.current;
    const keyboard = keyboardInput.current;

    // Determine active source (prefer touch if both active)
    let source: 'touch' | 'keyboard' | 'none' = 'none';
    let throttle = 0;
    let brake = 0;
    let steering = 0;

    if (touch.active && keyboard.active) {
      // Both active: combine (allows hybrid control)
      source = 'touch'; // Primary
      throttle = Math.max(touch.throttle, keyboard.throttle);
      brake = Math.max(touch.brake, keyboard.brake);
      // Steering: prefer touch if significantly different from center
      steering = Math.abs(touch.steering) > 0.1 ? touch.steering : keyboard.steering;
    } else if (touch.active) {
      source = 'touch';
      throttle = touch.throttle;
      brake = touch.brake;
      steering = touch.steering;
    } else if (keyboard.active) {
      source = 'keyboard';
      throttle = keyboard.throttle;
      brake = keyboard.brake;
      steering = keyboard.steering;
    }

    currentInput.current = { throttle, brake, steering, source };

    // Apply to store
    if (phase === 'driving') {
      setVehicleControls(throttle, brake, steering);
    }
  }, [phase, setVehicleControls]);

  // ─────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────

  return {
    updateTouchInput,
    updateKeyboardInput,
    combineInputs,
    getCurrentInput: () => ({ ...currentInput.current }),
    getActiveSource: () => currentInput.current.source,
  };
}
typescript// src/hooks/useTouchControls.ts (updated to use unified input)

import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useUnifiedInput } from './useUnifiedInput';

// ... (keep existing TOUCH_CONFIG and types) ...

export function useTouchControls() {
  const phase = useGameStore((s) => s.game.phase);
  const sensitivity = useGameStore((s) => s.settings.steeringSensitivity);
  const invertSteering = useGameStore((s) => s.settings.invertSteering);

  // Use unified input instead of direct store update
  const { updateTouchInput, combineInputs } = useUnifiedInput();

  // ... (keep existing refs and zone detection) ...

  // ─────────────────────────────────────────────────────────
  // CALCULATE INPUTS (updated to use unified input)
  // ─────────────────────────────────────────────────────────

  const calculateInputs = useCallback(() => {
    let steering = 0;
    let throttle = 0;
    let brake = 0;

    activeTouches.current.forEach((touch) => {
      // ... (keep existing calculation logic) ...
    });

    inputState.current = { throttle, brake, steering };
    
    // Update unified input instead of direct store
    updateTouchInput(throttle, brake, steering);
    combineInputs();
  }, [sensitivity, invertSteering, updateTouchInput, combineInputs]);

  // ... (keep rest of existing implementation) ...
}
typescript// src/hooks/useKeyboardControls.ts (updated to use unified input)

// ... (keep existing imports and config) ...

import { useUnifiedInput } from './useUnifiedInput';

export function useKeyboardControls() {
  const phase = useGameStore((s) => s.game.phase);
  const setPhase = useGameStore((s) => s.setPhase);

  // Use unified input instead of direct store update
  const { updateKeyboardInput, combineInputs } = useUnifiedInput();

  // ... (keep existing refs and key handling) ...

  // ─────────────────────────────────────────────────────────
  // SMOOTH INPUT UPDATE LOOP (updated)
  // ─────────────────────────────────────────────────────────

  const updateInputs = useCallback(() => {
    // ... (keep existing smoothing logic) ...

    // Update unified input instead of direct store
    if (phase === 'driving') {
      updateKeyboardInput(inputs.throttle, inputs.brake, inputs.steering);
      combineInputs();
    }

    frameId.current = requestAnimationFrame(updateInputs);
  }, [phase, updateKeyboardInput, combineInputs]);

  // ... (keep rest of existing implementation) ...
}
typescript// src/components/UI/ControlsHelp.tsx

import { useState } from 'react';
import './ControlsHelp.css';

// ═══════════════════════════════════════════════════════════
// CONTROLS HELP MODAL
// ═══════════════════════════════════════════════════════════

interface ControlsHelpProps {
  onClose: () => void;
}

export function ControlsHelp({ onClose }: ControlsHelpProps) {
  const [activeTab, setActiveTab] = useState<'touch' | 'keyboard'>('touch');

  return (
    <div className="controls-help-overlay" onClick={onClose}>
      <div className="controls-help-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="help-title">How to Drive</h2>

        {/* Tab buttons */}
        <div className="help-tabs">
          <button
            className={`help-tab ${activeTab === 'touch' ? 'active' : ''}`}
            onClick={() => setActiveTab('touch')}
          >
            📱 Touch
          </button>
          <button
            className={`help-tab ${activeTab === 'keyboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('keyboard')}
          >
            ⌨️ Keyboard
          </button>
        </div>

        {/* Touch controls */}
        {activeTab === 'touch' && (
          <div className="help-content">
            <div className="help-diagram touch-diagram">
              <div className="diagram-zone steering-zone">
                <span className="zone-label">Steering Zone</span>
                <span className="zone-hint">Drag left/right</span>
              </div>
              <div className="diagram-zone pedal-zone-left">
                <span className="zone-label">Brake</span>
                <span className="zone-hint">Drag up</span>
              </div>
              <div className="diagram-zone pedal-zone-right">
                <span className="zone-label">Gas</span>
                <span className="zone-hint">Drag up</span>
              </div>
            </div>

            <ul className="help-list">
              <li><strong>Steer:</strong> Drag horizontally in top 60% of screen</li>
              <li><strong>Accelerate:</strong> Drag up on right side (bottom 40%)</li>
              <li><strong>Brake:</strong> Drag up on left side (bottom 40%)</li>
              <li><strong>Pause:</strong> Tap pause button (top right)</li>
            </ul>
          </div>
        )}

        {/* Keyboard controls */}
        {activeTab === 'keyboard' && (
          <div className="help-content">
            <div className="help-diagram keyboard-diagram">
              <div className="key-layout">
                <div className="key-row">
                  <div className="key-box">W<span className="key-action">Gas</span></div>
                </div>
                <div className="key-row">
                  <div className="key-box">A<span className="key-action">Left</span></div>
                  <div className="key-box">S<span className="key-action">Brake</span></div>
                  <div className="key-box">D<span className="key-action">Right</span></div>
                </div>
              </div>
              <div className="key-divider">or</div>
              <div className="key-layout arrows">
                <div className="key-row">
                  <div className="key-box">↑</div>
                </div>
                <div className="key-row">
                  <div className="key-box">←</div>
                  <div className="key-box">↓</div>
                  <div className="key-box">→</div>
                </div>
              </div>
            </div>

            <ul className="help-list">
              <li><kbd>W</kbd> / <kbd>↑</kbd> — Accelerate</li>
              <li><kbd>S</kbd> / <kbd>↓</kbd> — Brake</li>
              <li><kbd>A</kbd> / <kbd>←</kbd> — Steer Left</li>
              <li><kbd>D</kbd> / <kbd>→</kbd> — Steer Right</li>
              <li><kbd>H</kbd> / <kbd>Space</kbd> — Horn</li>
              <li><kbd>Esc</kbd> / <kbd>P</kbd> — Pause</li>
            </ul>
          </div>
        )}

        <button className="help-close-btn" onClick={onClose}>
          Got it!
        </button>
      </div>
    </div>
  );
}
css/* src/components/UI/ControlsHelp.css */

/* ═══════════════════════════════════════════════════════════
   OVERLAY
   ═══════════════════════════════════════════════════════════ */

.controls-help-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  padding: 20px;
  animation: fade-in 0.2s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ═══════════════════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════════════════ */

.controls-help-modal {
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border: 2px solid #ff00ff;
  border-radius: 20px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 0 40px rgba(255, 0, 255, 0.3);
  animation: modal-appear 0.3s ease;
}

@keyframes modal-appear {
  from {
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.help-title {
  margin: 0 0 20px 0;
  font-size: 22px;
  font-weight: bold;
  color: #ffffff;
  text-align: center;
}

/* ═══════════════════════════════════════════════════════════
   TABS
   ═══════════════════════════════════════════════════════════ */

.help-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.help-tab {
  flex: 1;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.help-tab:hover {
  border-color: rgba(255, 0, 255, 0.3);
}

.help-tab.active {
  background: rgba(255, 0, 255, 0.15);
  border-color: #ff00ff;
  color: #ffffff;
}

/* ═══════════════════════════════════════════════════════════
   CONTENT
   ═══════════════════════════════════════════════════════════ */

.help-content {
  animation: content-fade 0.2s ease;
}

@keyframes content-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* ═══════════════════════════════════════════════════════════
   TOUCH DIAGRAM
   ═══════════════════════════════════════════════════════════ */

.help-diagram {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
}

.touch-diagram {
  height: 180px;
  position: relative;
}

.diagram-zone {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.2);
}

.steering-zone {
  top: 0;
  left: 0;
  right: 0;
  height: 60%;
  background: rgba(255, 0, 255, 0.1);
}

.pedal-zone-left {
  bottom: 0;
  left: 0;
  width: 50%;
  height: 40%;
  background: rgba(255, 100, 100, 0.1);
}

.pedal-zone-right {
  bottom: 0;
  right: 0;
  width: 50%;
  height: 40%;
  background: rgba(57, 255, 20, 0.1);
}

.zone-label {
  color: #ffffff;
  font-size: 14px;
  font-weight: bold;
}

.zone-hint {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  margin-top: 4px;
}

/* ═══════════════════════════════════════════════════════════
   KEYBOARD DIAGRAM
   ═══════════════════════════════════════════════════════════ */

.keyboard-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 20px;
}

.key-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.key-layout .key-row {
  display: flex;
  gap: 6px;
}

.key-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  color: #ffffff;
  font-size: 18px;
  font-weight: bold;
}

.key-action {
  font-size: 9px;
  font-weight: normal;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 2px;
}

.key-divider {
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
}

/* ═══════════════════════════════════════════════════════════
   HELP LIST
   ═══════════════════════════════════════════════════════════ */

.help-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.help-list li {
  padding: 8px 0;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.help-list li:last-child {
  border-bottom: none;
}

.help-list strong {
  color: #39ff14;
}

.help-list kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  margin-right: 4px;
}

/* ═══════════════════════════════════════════════════════════
   CLOSE BUTTON
   ═══════════════════════════════════════════════════════════ */

.help-close-btn {
  width: 100%;
  margin-top: 20px;
  padding: 14px;
  background: linear-gradient(135deg, #ff00ff, #aa00aa);
  border: none;
  border-radius: 12px;
  color: #ffffff;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.help-close-btn:hover {
  box-shadow: 0 0 25px rgba(255, 0, 255, 0.5);
  transform: translateY(-2px);
}

.help-close-btn:active {
  transform: translateY(0);
}

Now update Game.tsx to include keyboard controls:
typescript// src/Game.tsx (add keyboard imports and components)

// Add to imports:
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { KeyboardOverlay } from './components/UI/KeyboardOverlay';
import { ControlsHelp } from './components/UI/ControlsHelp';

// Add inside Game component:
export function Game() {
  // ... existing hooks ...
  
  // Keyboard controls
  const { setHornCallback } = useKeyboardControls();
  
  // Controls help modal state
  const [showControlsHelp, setShowControlsHelp] = useState(false);

  // Connect horn to audio
  useEffect(() => {
    // This would connect to the SFX manager's playHorn
    setHornCallback(() => {
      // playHorn(); // from useSFXManager
      console.log('HONK!');
    });
  }, [setHornCallback]);

  return (
    <div className={`game-container ${phase === 'quiz' ? 'quiz-active' : ''}`}>
      {/* ... existing Canvas and UI ... */}

      <div className="ui-layer">
        {/* ... existing UI components ... */}

        {/* Keyboard overlay (desktop only) */}
        {phase === 'driving' && <KeyboardOverlay />}

        {/* Controls help modal */}
        {showControlsHelp && (
          <ControlsHelp onClose={() => setShowControlsHelp(false)} />
        )}
      </div>
    </div>
  );
}
Add a help button to the MainMenu:
typescript// src/components/UI/MainMenu.tsx (add controls help button)

// Add state:
const [showHelp, setShowHelp] = useState(false);

// Add button after menu buttons:
<div className="menu-buttons">
  {/* ... existing buttons ... */}
  <button
    className="menu-btn secondary"
    onClick={() => setShowHelp(true)}
  >
    How to Play
  </button>
</div>

{/* Add modal */}
{showHelp && <ControlsHelp onClose={() => setShowHelp(false)} />}

Keyboard Controls Summary:
KeyAlternativeActionW↑AccelerateS↓BrakeA←Steer LeftD→Steer RightHSpaceHornEscPPause/Resume
Features Implemented:
FeatureDescriptionSmooth input rampingKeys don't cause instant 0→1 jumpsAuto-centering steeringSteering returns to center when releasedUnified input systemTouch + keyboard can work simultaneouslyVisual feedbackOn-screen WASD display shows active keysInitial hintFirst-time players see control hintHelp modalTabbed view of touch and keyboard controlsDesktop detectionKeyboard UI only shows on non-touch devicesWindow blur handlingKeys release when window loses focus

That completes the keyboard controls implementation. The game now supports:

Mobile: Touch controls (primary)
Desktop: WASD/Arrow keys (fallback)
Hybrid: Both simultaneously

Want me to provide the Final integration & package.json with full project structure, dependencies, and build scripts?YJan 21Orchestrated comprehensive project integration and deployment frameworkOrchestrated comprehensive project integration and deployment frameworkStep 20: Final Integration & Project Setup
json// package.json

{
  "name": "ali-aigoo-apocalypse",
  "version": "1.0.0",
  "description": "K-Pop Zombie Road Warrior - Educational Driving Game",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "type-check": "tsc --noEmit",
    "clean": "rm -rf dist node_modules/.vite",
    "analyze": "vite build --mode analyze"
  },
  "dependencies": {
    "@react-three/drei": "^9.96.1",
    "@react-three/fiber": "^8.15.12",
    "@react-three/rapier": "^1.2.1",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "three": "^0.160.0",
    "zustand": "^4.4.7"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@types/three": "^0.160.0",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "@typescript-eslint/parser": "^6.14.0",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "eslint": "^8.55.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.5",
    "postcss": "^8.4.32",
    "rollup-plugin-visualizer": "^5.12.0",
    "terser": "^5.26.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.8",
    "vite-plugin-compression": "^0.5.1"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "browserslist": [
    ">0.5%",
    "last 2 versions",
    "not dead",
    "iOS >= 13",
    "Android >= 8"
  ]
}
typescript// vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import viteCompression from 'vite-plugin-compression';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Gzip compression for production
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // Bundle analyzer (only in analyze mode)
    mode === 'analyze' && visualizer({
      open: true,
      filename: 'dist/stats.html',
      gzipSize: true,
    }),
  ].filter(Boolean),

  // Build configuration
  build: {
    target: 'es2020',
    minify: 'terser',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor chunks for better caching
          'react-vendor': ['react', 'react-dom'],
          'three-vendor': ['three'],
          'r3f-vendor': ['@react-three/fiber', '@react-three/drei'],
          'physics-vendor': ['@react-three/rapier'],
        },
      },
    },
    // Increase chunk size warning limit
    chunkSizeWarningLimit: 1000,
    // Asset optimization
    assetsInlineLimit: 4096,
  },

  // Development server
  server: {
    port: 3000,
    host: true, // Allow network access for mobile testing
    open: true,
  },

  // Preview server (for testing production builds)
  preview: {
    port: 4173,
    host: true,
  },

  // Resolve aliases
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@systems': '/src/systems',
      '@hooks': '/src/hooks',
      '@stores': '/src/stores',
      '@utils': '/src/utils',
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-three/rapier',
      'zustand',
    ],
  },
}));
json// tsconfig.json

{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Paths */
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"],
      "@systems/*": ["src/systems/*"],
      "@hooks/*": ["src/hooks/*"],
      "@stores/*": ["src/stores/*"],
      "@utils/*": ["src/utils/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
json// tsconfig.node.json

{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
html<!-- index.html -->

<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    
    <!-- PWA Meta Tags -->
    <meta name="theme-color" content="#121212" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="mobile-web-app-capable" content="yes" />
    
    <!-- SEO -->
    <meta name="description" content="Ali's Aigoo Apocalypse - Learn to drive while surviving the K-Pop zombie apocalypse! Educational driving game for WA State permit test prep." />
    <meta name="keywords" content="driving game, permit test, WA state, educational, zombies, k-pop" />
    
    <!-- Open Graph -->
    <meta property="og:title" content="Ali's Aigoo Apocalypse" />
    <meta property="og:description" content="K-Pop Zombie Road Warrior - NYC to Spokane in 2,800 miles" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="/og-image.png" />
    
    <!-- Favicon -->
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    
    <!-- Preconnect to CDNs -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    
    <!-- Font (optional, uses system fonts by default) -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet" />
    
    <title>Ali's Aigoo Apocalypse</title>
    
    <!-- Prevent iOS zoom on input focus -->
    <style>
      * {
        -webkit-tap-highlight-color: transparent;
      }
      
      /* Prevent overscroll/bounce */
      html, body {
        overscroll-behavior: none;
        overflow: hidden;
        position: fixed;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
typescript// src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Error boundary for production
if (import.meta.env.PROD) {
  window.onerror = (message, source, lineno, colno, error) => {
    console.error('Global error:', { message, source, lineno, colno, error });
    // Could send to analytics here
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
typescript// src/App.tsx

import { Suspense, lazy, useState, useEffect } from 'react';
import { LoadingScreen } from './components/UI/LoadingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy load the game for better initial load time
const Game = lazy(() => import('./Game'));

function App() {
  const [isReady, setIsReady] = useState(false);

  // Check for WebGL support
  useEffect(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    
    if (!gl) {
      alert('WebGL is not supported on this device. Please try a different browser.');
      return;
    }

    setIsReady(true);
  }, []);

  if (!isReady) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <Game />
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
typescript// src/components/ErrorBoundary.tsx

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Game crashed:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-screen">
          <div className="error-content">
            <h1>😱 아이고!</h1>
            <p>Something went wrong with the game.</p>
            <p className="error-details">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button onClick={this.handleReload}>
              Restart Game
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
typescript// src/Game.tsx (FINAL INTEGRATED VERSION)

import { Suspense, useEffect, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Preload } from '@react-three/drei';

// Store
import { useGameStore } from './stores/gameStore';

// Systems
import { useProgressManager } from './systems/ProgressManager';
import { useTouchControls } from './hooks/useTouchControls';
import { useKeyboardControls } from './hooks/useKeyboardControls';
import { useQuizManager } from './systems/QuizManager';

// 3D Components
import { Vehicle } from './components/Vehicle/Vehicle';
import { RoadChunks } from './components/Road/RoadChunks';
import { TrafficRenderer } from './components/Traffic/TrafficRenderer';
import { ZombieRenderer } from './components/Zombies/ZombieRenderer';
import { ZombieEffects } from './components/Zombies/ZombieEffects';
import { GameCamera } from './components/Camera/GameCamera';
import { Lighting } from './components/Lighting/Lighting';
import { Skybox } from './components/Environment/Skybox';

// Audio
import { AudioIntegration } from './components/Audio/AudioIntegration';
import { useSFXManager } from './systems/SFXManager';

// UI Components
import { GameHUD } from './components/UI/GameHUD';
import { TouchOverlay } from './components/UI/TouchOverlay';
import { KeyboardOverlay } from './components/UI/KeyboardOverlay';
import { QuizOverlay } from './components/Quiz/QuizOverlay';
import { PauseMenu } from './components/UI/PauseMenu';
import { MainMenu } from './components/UI/MainMenu';
import { LoadingScreen } from './components/UI/LoadingScreen';
import { StressIndicator } from './components/UI/StressIndicator';
import { ControlsHelp } from './components/UI/ControlsHelp';

// Companions
import { CatCompanions } from './components/Companions/CatCompanions';
import { CatDashboard } from './components/Companions/CatDashboard';
import { useCatQuizIntegration } from './components/Companions/CatCompanionIntegration';

// Collisions
import { useZombieCollisions } from './components/Zombies/ZombieCollisions';

// Styles
import './styles/Game.css';

// ═══════════════════════════════════════════════════════════
// CANVAS CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CANVAS_CONFIG = {
  dpr: [1, 1.5] as [number, number],
  performance: { min: 0.5 },
  gl: {
    antialias: false,
    powerPreference: 'high-performance' as const,
    stencil: false,
    depth: true,
  },
  shadows: 'soft' as const,
};

const PHYSICS_CONFIG = {
  gravity: [0, -9.81, 0] as [number, number, number],
  timeStep: 1 / 60,
  maxStabilizationIterations: 1,
  maxVelocityFrictionIterations: 1,
  maxVelocityIterations: 1,
};

// ═══════════════════════════════════════════════════════════
// MAIN GAME COMPONENT
// ═══════════════════════════════════════════════════════════

function Game() {
  // Store
  const phase = useGameStore((s) => s.game.phase);
  const setPhase = useGameStore((s) => s.setPhase);
  const currentBiome = useGameStore((s) => s.game.currentBiome);

  // Local state
  const [showControlsHelp, setShowControlsHelp] = useState(false);

  // Systems
  const { loadProgress, hasSaveData } = useProgressManager();
  useTouchControls();
  const { setHornCallback } = useKeyboardControls();
  useQuizManager();
  useCatQuizIntegration();
  useZombieCollisions();

  // Audio
  const { playHorn } = useSFXManager();

  // ─────────────────────────────────────────────────────────
  // CONNECT HORN TO AUDIO
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    setHornCallback(() => {
      playHorn();
    });
  }, [setHornCallback, playHorn]);

  // ─────────────────────────────────────────────────────────
  // PREVENT DEFAULT BEHAVIORS
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    const preventDefaults = (e: Event) => e.preventDefault();

    document.addEventListener('touchmove', preventDefaults, { passive: false });
    document.addEventListener('gesturestart', preventDefaults);
    document.addEventListener('gesturechange', preventDefaults);

    // Lock orientation on mobile
    if (screen.orientation?.lock) {
      screen.orientation.lock('portrait').catch(() => {});
    }

    return () => {
      document.removeEventListener('touchmove', preventDefaults);
      document.removeEventListener('gesturestart', preventDefaults);
      document.removeEventListener('gesturechange', preventDefaults);
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // PAUSE HANDLER
  // ─────────────────────────────────────────────────────────

  const handlePause = useCallback(() => {
    if (phase === 'driving') {
      setPhase('paused');
    }
  }, [phase, setPhase]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <div className={`game-container ${phase === 'quiz' ? 'quiz-active' : ''}`}>
      {/* Audio System */}
      <AudioIntegration />

      {/* 3D Canvas */}
      <Canvas {...CANVAS_CONFIG}>
        <Suspense fallback={null}>
          <Physics {...PHYSICS_CONFIG}>
            {/* Environment */}
            <Lighting />
            <Skybox biome={currentBiome} />

            {/* Game Objects */}
            <RoadChunks />
            <Vehicle />
            <TrafficRenderer />
            <ZombieRenderer />
            <ZombieEffects />

            {/* Camera */}
            <GameCamera />
          </Physics>

          <Preload all />
        </Suspense>
      </Canvas>

      {/* UI Layer */}
      <div className="ui-layer">
        {/* Main Menu */}
        {phase === 'menu' && (
          <MainMenu
            hasSaveData={hasSaveData()}
            onLoadSave={loadProgress}
            onShowHelp={() => setShowControlsHelp(true)}
          />
        )}

        {/* In-Game UI */}
        {(phase === 'driving' || phase === 'quiz') && (
          <>
            <GameHUD />
            <TouchOverlay />
            <KeyboardOverlay />
            <StressIndicator />
            <CatCompanions />
            <CatDashboard />
            <PauseButton onPause={handlePause} />
          </>
        )}

        {/* Quiz Modal */}
        {phase === 'quiz' && <QuizOverlay />}

        {/* Pause Menu */}
        {phase === 'paused' && <PauseMenu />}

        {/* Controls Help Modal */}
        {showControlsHelp && (
          <ControlsHelp onClose={() => setShowControlsHelp(false)} />
        )}

        {/* Loading Screen */}
        <LoadingScreen />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAUSE BUTTON COMPONENT
// ═══════════════════════════════════════════════════════════

interface PauseButtonProps {
  onPause: () => void;
}

function PauseButton({ onPause }: PauseButtonProps) {
  return (
    <button className="pause-button" onClick={onPause} aria-label="Pause game">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    </button>
  );
}

export default Game;
css/* src/styles/global.css */

/* ═══════════════════════════════════════════════════════════
   CSS RESET & BASE STYLES
   ═══════════════════════════════════════════════════════════ */

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #121212;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Prevent text selection during gameplay */
body {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: none;
}

/* Allow text selection in specific areas */
input, textarea, [contenteditable] {
  user-select: text;
  -webkit-user-select: text;
}

/* ═══════════════════════════════════════════════════════════
   THEME VARIABLES
   ═══════════════════════════════════════════════════════════ */

:root {
  /* Primary colors */
  --color-primary: #ff00ff;
  --color-secondary: #39ff14;
  --color-background: #121212;
  --color-surface: #1a1a2e;
  
  /* Text colors */
  --color-text: #ffffff;
  --color-text-muted: rgba(255, 255, 255, 0.6);
  --color-text-dim: rgba(255, 255, 255, 0.4);
  
  /* Status colors */
  --color-success: #39ff14;
  --color-error: #ff4757;
  --color-warning: #ffa502;
  
  /* Cat colors */
  --color-mya: #ff9ff3;
  --color-gracie: #ffeaa7;
  
  /* Zombie colors */
  --color-zombie-glow: #39ff14;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* Border radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
  
  /* Transitions */
  --transition-fast: 0.1s ease;
  --transition-normal: 0.2s ease;
  --transition-slow: 0.3s ease;
  
  /* Z-index layers */
  --z-game: 1;
  --z-hud: 50;
  --z-companions: 60;
  --z-overlay: 100;
  --z-modal: 200;
  --z-loading: 300;
}

/* ═══════════════════════════════════════════════════════════
   ERROR SCREEN
   ═══════════════════════════════════════════════════════════ */

.error-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background);
  padding: var(--spacing-lg);
}

.error-content {
  text-align: center;
  max-width: 400px;
}

.error-content h1 {
  font-size: 48px;
  margin-bottom: var(--spacing-md);
}

.error-content p {
  color: var(--color-text-muted);
  margin-bottom: var(--spacing-sm);
}

.error-details {
  font-family: monospace;
  font-size: 12px;
  color: var(--color-error);
  background: rgba(255, 71, 87, 0.1);
  padding: var(--spacing-sm);
  border-radius: var(--radius-md);
  margin: var(--spacing-md) 0;
  word-break: break-word;
}

.error-content button {
  padding: var(--spacing-md) var(--spacing-xl);
  background: var(--color-primary);
  border: none;
  border-radius: var(--radius-lg);
  color: var(--color-text);
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
}

/* ═══════════════════════════════════════════════════════════
   SAFE AREA INSETS (for notched devices)
   ═══════════════════════════════════════════════════════════ */

@supports (padding: env(safe-area-inset-top)) {
  .game-hud {
    padding-top: max(12px, env(safe-area-inset-top));
    padding-left: max(12px, env(safe-area-inset-left));
    padding-right: max(12px, env(safe-area-inset-right));
  }
  
  .cat-dashboard {
    padding-bottom: env(safe-area-inset-bottom);
  }
}

/* ═══════════════════════════════════════════════════════════
   SCROLLBAR STYLING (for any scrollable areas)
   ═══════════════════════════════════════════════════════════ */

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 0, 255, 0.3);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 0, 255, 0.5);
}

/* ═══════════════════════════════════════════════════════════
   FOCUS STYLES (accessibility)
   ═══════════════════════════════════════════════════════════ */

:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

button:focus-visible {
  box-shadow: 0 0 0 3px rgba(255, 0, 255, 0.4);
}

/* ═══════════════════════════════════════════════════════════
   REDUCED MOTION
   ═══════════════════════════════════════════════════════════ */

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

Now the **complete file structure**:
```
ali-aigoo-apocalypse/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── .gitignore
├── .eslintrc.cjs
├── README.md
│
├── public/
│   ├── favicon.svg
│   ├── apple-touch-icon.png
│   ├── og-image.png
│   │
│   ├── data/
│   │   └── questions.json              # 239 quiz questions
│   │
│   ├── models/
│   │   ├── vehicle/
│   │   │   └── beetle.glb              # Player car model
│   │   └── road/
│   │       ├── city_01.glb - city_05.glb
│   │       ├── highway_01.glb - highway_05.glb
│   │       └── rural_01.glb - rural_05.glb
│   │
│   └── audio/
│       ├── ui/
│       │   ├── click.mp3
│       │   └── hover.mp3
│       ├── quiz/
│       │   ├── correct.mp3
│       │   ├── wrong.mp3
│       │   ├── appear.mp3
│       │   └── streak.mp3
│       ├── zombie/
│       │   ├── groan1.mp3
│       │   ├── groan2.mp3
│       │   ├── groan3.mp3
│       │   ├── shuffle.mp3
│       │   └── alert.mp3
│       ├── cat/
│       │   ├── meow1.mp3
│       │   ├── meow2.mp3
│       │   ├── purr.mp3
│       │   ├── chirp.mp3
│       │   └── hiss.mp3
│       ├── vehicle/
│       │   ├── horn.mp3
│       │   └── brake.mp3
│       ├── ambient/
│       │   ├── city.mp3
│       │   ├── highway.mp3
│       │   └── rural.mp3
│       └── music/
│           ├── menu.mp3
│           └── driving.mp3
│
└── src/
    ├── main.tsx                         # Entry point
    ├── App.tsx                          # Root component
    ├── Game.tsx                         # Main game orchestrator
    │
    ├── stores/
    │   └── gameStore.ts                 # Zustand state management
    │
    ├── systems/
    │   ├── RoadChunkManager.ts          # Infinite road generation
    │   ├── TrafficManager.ts            # NPC vehicle AI
    │   ├── ZombieManager.ts             # Zombie AI & spawning
    │   ├── QuizManager.ts               # Quiz trigger & selection
    │   ├── ProgressManager.ts           # Save/load persistence
    │   ├── CatCompanionManager.ts       # Cat dialogue & reactions
    │   ├── AudioManager.ts              # Core audio API
    │   ├── EngineSoundGenerator.ts      # Procedural engine audio
    │   ├── SFXManager.ts                # Sound effects
    │   ├── AmbientSoundManager.ts       # Biome ambient loops
    │   ├── ZombieSoundManager.ts        # Zombie audio
    │   └── CatSoundManager.ts           # Cat audio
    │
    ├── hooks/
    │   ├── useTouchControls.ts          # Touch input handling
    │   ├── useKeyboardControls.ts       # Keyboard input handling
    │   └── useUnifiedInput.ts           # Combined input manager
    │
    ├── components/
    │   ├── ErrorBoundary.tsx            # Error boundary
    │   │
    │   ├── Vehicle/
    │   │   ├── Vehicle.tsx              # Vehicle mesh & physics
    │   │   └── VehicleController.ts     # Physics update loop
    │   │
    │   ├── Road/
    │   │   └── RoadChunks.tsx           # Road chunk renderer
    │   │
    │   ├── Traffic/
    │   │   ├── TrafficRenderer.tsx      # Instanced NPC rendering
    │   │   └── NPCVehicleMesh.tsx       # NPC mesh definition
    │   │
    │   ├── Zombies/
    │   │   ├── ZombieRenderer.tsx       # Instanced zombie rendering
    │   │   ├── ZombieDetailMesh.tsx     # Detailed zombie mesh
    │   │   ├── ZombieEffects.tsx        # Particle effects
    │   │   └── ZombieCollisions.tsx     # Collision detection
    │   │
    │   ├── Camera/
    │   │   └── GameCamera.tsx           # Follow camera
    │   │
    │   ├── Lighting/
    │   │   └── Lighting.tsx             # Scene lighting
    │   │
    │   ├── Environment/
    │   │   └── Skybox.tsx               # Gradient sky
    │   │
    │   ├── Quiz/
    │   │   ├── QuizOverlay.tsx          # Quiz modal
    │   │   └── QuizOverlay.css
    │   │
    │   ├── Companions/
    │   │   ├── CatCompanions.tsx        # Cat avatars & speech
    │   │   ├── CatCompanions.css
    │   │   ├── CatDashboard.tsx         # Expandable stats panel
    │   │   ├── CatDashboard.css
    │   │   └── CatCompanionIntegration.tsx
    │   │
    │   ├── Audio/
    │   │   └── AudioIntegration.tsx     # Audio system init
    │   │
    │   └── UI/
    │       ├── GameHUD.tsx              # In-game HUD
    │       ├── GameHUD.css
    │       ├── TouchOverlay.tsx         # Touch feedback
    │       ├── TouchOverlay.css
    │       ├── KeyboardOverlay.tsx      # Keyboard indicators
    │       ├── KeyboardOverlay.css
    │       ├── MainMenu.tsx             # Title screen
    │       ├── MainMenu.css
    │       ├── PauseMenu.tsx            # Pause screen
    │       ├── PauseMenu.css
    │       ├── LoadingScreen.tsx        # Asset loading
    │       ├── LoadingScreen.css
    │       ├── StressIndicator.tsx      # Stress meter
    │       ├── StressIndicator.css
    │       ├── ControlsHelp.tsx         # Controls help modal
    │       ├── ControlsHelp.css
    │       ├── AudioSettings.tsx        # Volume sliders
    │       └── AudioSettings.css
    │
    ├── utils/
    │   ├── edgeCases.ts                 # Error handling utilities
    │   └── optimizations.ts             # Performance utilities
    │
    └── styles/
        ├── global.css                   # Global styles & reset
        └── Game.css                     # Game container styles
```

---
```
// .gitignore

# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
build/

# Cache
.vite/
*.tsbuildinfo

# Environment
.env
.env.local
.env.*.local

# Editor
.idea/
.vscode/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Testing
coverage/

# Misc
*.local
javascript// .eslintrc.cjs

module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};

Build & Deploy Commands:
bash# Install dependencies
npm install

# Development (hot reload)
npm run dev

# Type checking
npm run type-check

# Lint
npm run lint

# Production build
npm run build

# Preview production build locally
npm run preview

# Analyze bundle size
npm run analyze

# Clean cache
npm run clean

Performance Budget Verification:
MetricTargetExpectedInitial JS (gzipped)<200KB~150KBInitial CSS (gzipped)<20KB~12KBDraw calls<100~15-25Triangles<100K~30-50KFrame rate60 FPS60 FPS on mid-range 2020 mobileTime to Interactive<3s~2s on 4G

Final Summary - Complete Feature List:
CategoryFeaturesDrivingPhysics-based controls, momentum, braking, 60 MPH maxInputTouch (mobile), Keyboard WASD/Arrows (desktop), unified systemRoadInfinite chunks, 3 biomes (city/highway/rural), seamless transitionsTraffic5-8 instanced NPCs, lane AI, speed adjustmentZombies5 types, stress-reactive behavior, K-pop themedQuiz239 WA DOL questions, streak bonuses, category weightingCompanionsMya & Gracie cats, contextual dialogue, mood animationsAudioProcedural engine, SFX, ambient, cat/zombie soundsPersistenceLocalStorage auto-save, backup saves, settingsUIHUD, stress meter, cat dashboard, controls helpPerformanceInstanced meshes, object pooling, chunk recycling

That completes the full implementation of Ali's Aigoo Apocalypse! 🎮🚗🧟‍♂️🐱Ok, how do I put it all together to get it to work?Jan 21Orchestrated practical assembly instructions for project implementationOrchestrated practical assembly instructions for project implementationAssembly Guide
Step 1: Create the project
bash# Create project folder
mkdir ali-aigoo-apocalypse
cd ali-aigoo-apocalypse

# Initialize with package.json (copy the one I provided)
# Then install dependencies
npm install

Step 2: Create folder structure
bash# Create all directories
mkdir -p src/{components/{UI,Vehicle,Road,Traffic,Zombies,Camera,Lighting,Environment,Quiz,Companions,Audio},systems,hooks,stores,utils,styles}
mkdir -p public/{data,audio/{ui,quiz,zombie,cat,vehicle,ambient,music}}

Step 3: Create files in order
Start with these foundation files (copy from the steps I provided):
OrderFileFrom Step1package.jsonStep 202vite.config.tsStep 203tsconfig.jsonStep 204tsconfig.node.jsonStep 205index.htmlStep 206src/main.tsxStep 207src/App.tsxStep 208src/styles/global.cssStep 209src/components/ErrorBoundary.tsxStep 2010src/stores/gameStore.tsStep 1
Then add systems, components, etc. from each step.

Step 4: Add placeholder assets
For now, create empty placeholder files so the app compiles:
bash# Create placeholder questions.json
echo '[]' > public/data/questions.json

Step 5: Simplify for first run
The full Game.tsx has many imports. Create a minimal version first:
typescript// src/Game.tsx (MINIMAL VERSION TO START)

import { Canvas } from '@react-three/fiber';
import { useGameStore } from './stores/gameStore';
import './styles/Game.css';

function Game() {
  return (
    <div className="game-container">
      <Canvas>
        <ambientLight intensity={0.5} />
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="hotpink" />
        </mesh>
      </Canvas>
      <div className="ui-layer">
        <h1 style={{ color: 'white', position: 'absolute', top: 20, left: 20 }}>
          Ali's Aigoo Apocalypse
        </h1>
      </div>
    </div>
  );
}

export default Game;
css/* src/styles/Game.css */

.game-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.ui-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ui-layer > * {
  pointer-events: auto;
}

Step 6: Run it
bashnpm run dev
You should see a pink cube. If that works, your foundation is solid.

Step 7: Add components incrementally
Add one system at a time, testing after each:

gameStore.ts → verify state works
Vehicle + physics → verify movement
Touch controls → verify input
Road chunks → verify infinite road
Quiz system → verify questions load
Continue adding...


The practical reality:
Given the volume of code across 20 steps, I recommend I create a single consolidated zip-ready file structure for you.
Want me to create a complete, copy-paste-ready version of each core file in sequence? I can organize it as:

All config files (5 files)
Store (1 file)
All systems (12 files)
All hooks (3 files)
All components (25+ files)

This would be more practical than hunting through 20 steps. Yes?Yes pleaseJan 21Orchestrated systematic file organization for project deliveryOrchestrated systematic file organization for project deliveryPart 1: Config & Entry Files
I'll provide everything in sequence. Create each file as we go.

File 1: package.json
json{
  "name": "ali-aigoo-apocalypse",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@react-three/drei": "^9.96.1",
    "@react-three/fiber": "^8.15.12",
    "@react-three/rapier": "^1.2.1",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "three": "^0.160.0",
    "zustand": "^4.4.7"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@types/three": "^0.160.0",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.8"
  }
}

File 2: vite.config.ts
typescriptimport { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    port: 3000,
    host: true,
    open: true,
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});

File 3: tsconfig.json
json{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}

File 4: tsconfig.node.json
json{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}

File 5: index.html
html<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#121212" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <title>Ali's Aigoo Apocalypse</title>
    <style>
      * { -webkit-tap-highlight-color: transparent; }
      html, body { overscroll-behavior: none; overflow: hidden; position: fixed; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>

File 6: src/main.tsx
typescriptimport React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

File 7: src/App.tsx
typescriptimport { Suspense, lazy } from 'react';
import { LoadingScreen } from './components/UI/LoadingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

const Game = lazy(() => import('./Game'));

function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <Game />
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;

File 8: src/components/ErrorBoundary.tsx
typescriptimport { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Game crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#121212',
          color: 'white',
          flexDirection: 'column',
          gap: '16px',
          padding: '20px',
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: '48px', margin: 0 }}>😱 아이고!</h1>
          <p>Something went wrong.</p>
          <p style={{ fontSize: '12px', color: '#ff4757', fontFamily: 'monospace' }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              background: '#ff00ff',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Restart Game
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

File 9: src/styles/global.css
css*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #121212;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}

body {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: none;
}

:root {
  --color-primary: #ff00ff;
  --color-secondary: #39ff14;
  --color-background: #121212;
  --color-surface: #1a1a2e;
  --color-text: #ffffff;
  --color-text-muted: rgba(255, 255, 255, 0.6);
  --color-success: #39ff14;
  --color-error: #ff4757;
  --color-warning: #ffa502;
  --color-mya: #ff9ff3;
  --color-gracie: #ffeaa7;
}

:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

File 10: src/styles/Game.css
css.game-container {
  width: 100%;
  height: 100%;
  position: relative;
  background: #121212;
}

.game-container.quiz-active canvas {
  filter: blur(2px);
}

.ui-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 50;
}

.ui-layer > * {
  pointer-events: auto;
}

.pause-button {
  position: fixed;
  top: 12px;
  right: 12px;
  width: 44px;
  height: 44px;
  background: rgba(18, 18, 18, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 60;
  transition: all 0.2s ease;
}

.pause-button:hover {
  border-color: #ff00ff;
  background: rgba(255, 0, 255, 0.2);
}

.pause-button svg {
  width: 20px;
  height: 20px;
}

@supports (padding: env(safe-area-inset-top)) {
  .pause-button {
    top: max(12px, env(safe-area-inset-top));
    right: max(12px, env(safe-area-inset-right));
  }
}

Ready for Part 2: Game Store? (y/k)YJan 21Assembled complete game store file implementationAssembled complete game store file implementationPart 2: Game Store
File 11: src/stores/gameStore.ts
typescriptimport { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export type GamePhase = 'loading' | 'menu' | 'driving' | 'quiz' | 'paused' | 'gameover' | 'victory';
export type Biome = 'city' | 'highway' | 'rural';

export interface Question {
  id: string;
  category: string;
  question: string;
  answers: string[];
  correctIndex: number;
  explanation?: string;
}

interface VehicleState {
  position: [number, number, number];
  rotation: [number, number, number];
  velocity: number;
  throttle: number;
  brake: number;
  steering: number;
}

interface GameState {
  phase: GamePhase;
  currentBiome: Biome;
  distanceTraveled: number;
  totalDistance: number;
  currentCheckpoint: number;
  totalCheckpoints: number;
  sessionStartTime: number;
  playTime: number;
}

interface QuizState {
  isActive: boolean;
  currentQuestion: Question | null;
  questionsAnswered: number;
  correctAnswers: number;
  categoryStats: Record<string, { correct: number; total: number }>;
  lastAnswerCorrect: boolean | null;
  questionHistory: string[];
}

interface EconomyState {
  coins: number;
  streak: number;
  bestStreak: number;
  multiplier: number;
}

interface SettingsState {
  musicVolume: number;
  sfxVolume: number;
  steeringSensitivity: number;
  invertSteering: boolean;
  showTutorial: boolean;
  reducedMotion: boolean;
}

interface CatState {
  mya: {
    mood: 'happy' | 'worried' | 'excited' | 'neutral';
    lastMessage: string;
    messageTime: number;
  };
  gracie: {
    mood: 'happy' | 'worried' | 'excited' | 'neutral';
    lastMessage: string;
    messageTime: number;
  };
}

interface GameStore {
  // State slices
  vehicle: VehicleState;
  game: GameState;
  quiz: QuizState;
  economy: EconomyState;
  settings: SettingsState;
  cats: CatState;

  // Vehicle actions
  setVehiclePosition: (position: [number, number, number]) => void;
  setVehicleRotation: (rotation: [number, number, number]) => void;
  setVehicleVelocity: (velocity: number) => void;
  setVehicleControls: (throttle: number, brake: number, steering: number) => void;

  // Game actions
  setPhase: (phase: GamePhase) => void;
  setBiome: (biome: Biome) => void;
  addDistance: (distance: number) => void;
  advanceCheckpoint: () => void;
  resetGame: () => void;

  // Quiz actions
  startQuiz: (question: Question) => void;
  answerQuiz: (answerIndex: number) => boolean;
  closeQuiz: () => void;

  // Economy actions
  addCoins: (amount: number) => void;
  incrementStreak: () => void;
  resetStreak: () => void;

  // Settings actions
  updateSettings: (settings: Partial<SettingsState>) => void;

  // Cat actions
  setCatMood: (cat: 'mya' | 'gracie', mood: CatState['mya']['mood']) => void;
  setCatMessage: (cat: 'mya' | 'gracie', message: string) => void;
}

// ═══════════════════════════════════════════════════════════
// INITIAL STATE
// ═══════════════════════════════════════════════════════════

const initialVehicle: VehicleState = {
  position: [0, 0.5, 0],
  rotation: [0, 0, 0],
  velocity: 0,
  throttle: 0,
  brake: 0,
  steering: 0,
};

const initialGame: GameState = {
  phase: 'menu',
  currentBiome: 'city',
  distanceTraveled: 0,
  totalDistance: 2800,
  currentCheckpoint: 0,
  totalCheckpoints: 28,
  sessionStartTime: 0,
  playTime: 0,
};

const initialQuiz: QuizState = {
  isActive: false,
  currentQuestion: null,
  questionsAnswered: 0,
  correctAnswers: 0,
  categoryStats: {},
  lastAnswerCorrect: null,
  questionHistory: [],
};

const initialEconomy: EconomyState = {
  coins: 0,
  streak: 0,
  bestStreak: 0,
  multiplier: 1,
};

const initialSettings: SettingsState = {
  musicVolume: 0.5,
  sfxVolume: 0.8,
  steeringSensitivity: 1.0,
  invertSteering: false,
  showTutorial: true,
  reducedMotion: false,
};

const initialCats: CatState = {
  mya: {
    mood: 'neutral',
    lastMessage: '',
    messageTime: 0,
  },
  gracie: {
    mood: 'neutral',
    lastMessage: '',
    messageTime: 0,
  },
};

// ═══════════════════════════════════════════════════════════
// STORE CREATION
// ═══════════════════════════════════════════════════════════

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    vehicle: initialVehicle,
    game: initialGame,
    quiz: initialQuiz,
    economy: initialEconomy,
    settings: loadSettings(),
    cats: initialCats,

    // ─────────────────────────────────────────────────────────
    // VEHICLE ACTIONS
    // ─────────────────────────────────────────────────────────

    setVehiclePosition: (position) =>
      set((state) => ({
        vehicle: { ...state.vehicle, position },
      })),

    setVehicleRotation: (rotation) =>
      set((state) => ({
        vehicle: { ...state.vehicle, rotation },
      })),

    setVehicleVelocity: (velocity) =>
      set((state) => ({
        vehicle: { ...state.vehicle, velocity },
      })),

    setVehicleControls: (throttle, brake, steering) =>
      set((state) => ({
        vehicle: { ...state.vehicle, throttle, brake, steering },
      })),

    // ─────────────────────────────────────────────────────────
    // GAME ACTIONS
    // ─────────────────────────────────────────────────────────

    setPhase: (phase) =>
      set((state) => {
        const updates: Partial<GameState> = { phase };

        if (phase === 'driving' && state.game.phase === 'menu') {
          updates.sessionStartTime = Date.now();
        }

        return { game: { ...state.game, ...updates } };
      }),

    setBiome: (biome) =>
      set((state) => ({
        game: { ...state.game, currentBiome: biome },
      })),

    addDistance: (distance) =>
      set((state) => ({
        game: {
          ...state.game,
          distanceTraveled: state.game.distanceTraveled + distance,
        },
      })),

    advanceCheckpoint: () =>
      set((state) => ({
        game: {
          ...state.game,
          currentCheckpoint: Math.min(
            state.game.currentCheckpoint + 1,
            state.game.totalCheckpoints
          ),
        },
      })),

    resetGame: () =>
      set({
        vehicle: initialVehicle,
        game: { ...initialGame, phase: 'menu' },
        quiz: initialQuiz,
        economy: initialEconomy,
        cats: initialCats,
      }),

    // ─────────────────────────────────────────────────────────
    // QUIZ ACTIONS
    // ─────────────────────────────────────────────────────────

    startQuiz: (question) =>
      set((state) => ({
        quiz: {
          ...state.quiz,
          isActive: true,
          currentQuestion: question,
          lastAnswerCorrect: null,
        },
        game: { ...state.game, phase: 'quiz' },
      })),

    answerQuiz: (answerIndex) => {
      const { quiz, economy } = get();
      const question = quiz.currentQuestion;

      if (!question) return false;

      const isCorrect = answerIndex === question.correctIndex;
      const category = question.category;

      // Update category stats
      const categoryStats = { ...quiz.categoryStats };
      if (!categoryStats[category]) {
        categoryStats[category] = { correct: 0, total: 0 };
      }
      categoryStats[category].total += 1;
      if (isCorrect) {
        categoryStats[category].correct += 1;
      }

      // Calculate coins
      let coinsEarned = 0;
      let newStreak = economy.streak;
      let newMultiplier = economy.multiplier;

      if (isCorrect) {
        newStreak += 1;
        newMultiplier = 1 + Math.floor(newStreak / 3) * 0.5;
        coinsEarned = Math.floor(10 * newMultiplier);
      } else {
        newStreak = 0;
        newMultiplier = 1;
      }

      set((state) => ({
        quiz: {
          ...state.quiz,
          questionsAnswered: state.quiz.questionsAnswered + 1,
          correctAnswers: state.quiz.correctAnswers + (isCorrect ? 1 : 0),
          categoryStats,
          lastAnswerCorrect: isCorrect,
          questionHistory: [...state.quiz.questionHistory, question.id],
        },
        economy: {
          ...state.economy,
          coins: state.economy.coins + coinsEarned,
          streak: newStreak,
          bestStreak: Math.max(state.economy.bestStreak, newStreak),
          multiplier: newMultiplier,
        },
      }));

      return isCorrect;
    },

    closeQuiz: () =>
      set((state) => ({
        quiz: {
          ...state.quiz,
          isActive: false,
          currentQuestion: null,
        },
        game: { ...state.game, phase: 'driving' },
      })),

    // ─────────────────────────────────────────────────────────
    // ECONOMY ACTIONS
    // ─────────────────────────────────────────────────────────

    addCoins: (amount) =>
      set((state) => ({
        economy: {
          ...state.economy,
          coins: state.economy.coins + amount,
        },
      })),

    incrementStreak: () =>
      set((state) => {
        const newStreak = state.economy.streak + 1;
        return {
          economy: {
            ...state.economy,
            streak: newStreak,
            bestStreak: Math.max(state.economy.bestStreak, newStreak),
            multiplier: 1 + Math.floor(newStreak / 3) * 0.5,
          },
        };
      }),

    resetStreak: () =>
      set((state) => ({
        economy: {
          ...state.economy,
          streak: 0,
          multiplier: 1,
        },
      })),

    // ─────────────────────────────────────────────────────────
    // SETTINGS ACTIONS
    // ─────────────────────────────────────────────────────────

    updateSettings: (newSettings) =>
      set((state) => {
        const updated = { ...state.settings, ...newSettings };
        saveSettings(updated);
        return { settings: updated };
      }),

    // ─────────────────────────────────────────────────────────
    // CAT ACTIONS
    // ─────────────────────────────────────────────────────────

    setCatMood: (cat, mood) =>
      set((state) => ({
        cats: {
          ...state.cats,
          [cat]: { ...state.cats[cat], mood },
        },
      })),

    setCatMessage: (cat, message) =>
      set((state) => ({
        cats: {
          ...state.cats,
          [cat]: {
            ...state.cats[cat],
            lastMessage: message,
            messageTime: Date.now(),
          },
        },
      })),
  }))
);

// ═══════════════════════════════════════════════════════════
// PERSISTENCE HELPERS
// ═══════════════════════════════════════════════════════════

const SETTINGS_KEY = 'ali-aigoo-settings';

function loadSettings(): SettingsState {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      return { ...initialSettings, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return initialSettings;
}

function saveSettings(settings: SettingsState): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// SELECTORS (for performance optimization)
// ═══════════════════════════════════════════════════════════

export const selectVehiclePosition = (state: GameStore) => state.vehicle.position;
export const selectVehicleVelocity = (state: GameStore) => state.vehicle.velocity;
export const selectGamePhase = (state: GameStore) => state.game.phase;
export const selectCurrentBiome = (state: GameStore) => state.game.currentBiome;
export const selectDistanceTraveled = (state: GameStore) => state.game.distanceTraveled;
export const selectQuizActive = (state: GameStore) => state.quiz.isActive;
export const selectCurrentQuestion = (state: GameStore) => state.quiz.currentQuestion;
export const selectCoins = (state: GameStore) => state.economy.coins;
export const selectStreak = (state: GameStore) => state.economy.streak;
export const selectMultiplier = (state: GameStore) => state.economy.multiplier;

Ready for Part 3: Core UI Components (LoadingScreen, MainMenu, PauseMenu, GameHUD)? (y/k)YJan 21Orchestrated UI component architecture for game development continuationOrchestrated UI component architecture for game development continuationPart 3: Core UI Components
File 12: src/components/UI/LoadingScreen.tsx
typescriptimport { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import './LoadingScreen.css';

export function LoadingScreen() {
  const phase = useGameStore((s) => s.game.phase);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('Initializing...');

  useEffect(() => {
    if (phase !== 'loading') return;

    const stages = [
      { progress: 20, text: 'Loading assets...' },
      { progress: 40, text: 'Preparing road...' },
      { progress: 60, text: 'Waking up zombies...' },
      { progress: 80, text: 'Feeding the cats...' },
      { progress: 100, text: 'Ready!' },
    ];

    let currentStage = 0;
    const interval = setInterval(() => {
      if (currentStage < stages.length) {
        setProgress(stages[currentStage].progress);
        setLoadingText(stages[currentStage].text);
        currentStage++;
      } else {
        clearInterval(interval);
      }
    }, 400);

    return () => clearInterval(interval);
  }, [phase]);

  if (phase !== 'loading') return null;

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <h1 className="loading-title">
          <span className="title-ali">Ali's</span>
          <span className="title-aigoo">아이고</span>
          <span className="title-apocalypse">Apocalypse</span>
        </h1>

        <div className="loading-car">🚗</div>

        <div className="loading-bar-container">
          <div
            className="loading-bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <p className="loading-text">{loadingText}</p>

        <div className="loading-cats">
          <span className="cat-emoji">🐱</span>
          <span className="cat-emoji">🐱</span>
        </div>
      </div>
    </div>
  );
}

File 13: src/components/UI/LoadingScreen.css
css.loading-screen {
  position: fixed;
  inset: 0;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}

.loading-content {
  text-align: center;
  padding: 20px;
}

.loading-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 32px;
}

.title-ali {
  font-size: 24px;
  color: #ff9ff3;
  font-weight: 600;
}

.title-aigoo {
  font-size: 48px;
  color: #ff00ff;
  font-weight: 900;
  text-shadow: 0 0 20px rgba(255, 0, 255, 0.5);
}

.title-apocalypse {
  font-size: 20px;
  color: #39ff14;
  font-weight: 700;
  letter-spacing: 4px;
  text-transform: uppercase;
}

.loading-car {
  font-size: 48px;
  margin-bottom: 24px;
  animation: car-bounce 1s ease-in-out infinite;
}

@keyframes car-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.loading-bar-container {
  width: 200px;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  margin: 0 auto 16px;
}

.loading-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff00ff, #39ff14);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.loading-text {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  margin-bottom: 24px;
}

.loading-cats {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.cat-emoji {
  font-size: 32px;
  animation: cat-wiggle 0.5s ease-in-out infinite alternate;
}

.cat-emoji:nth-child(2) {
  animation-delay: 0.25s;
}

@keyframes cat-wiggle {
  from { transform: rotate(-5deg); }
  to { transform: rotate(5deg); }
}

File 14: src/components/UI/MainMenu.tsx
typescriptimport { useState } from 'react';
import { useGameStore } from '../../stores/gameStore';
import './MainMenu.css';

interface MainMenuProps {
  hasSaveData?: boolean;
  onLoadSave?: () => void;
  onShowHelp?: () => void;
}

export function MainMenu({ hasSaveData, onLoadSave, onShowHelp }: MainMenuProps) {
  const setPhase = useGameStore((s) => s.setPhase);
  const [showCredits, setShowCredits] = useState(false);

  const handleNewGame = () => {
    useGameStore.getState().resetGame();
    setPhase('driving');
  };

  const handleContinue = () => {
    onLoadSave?.();
    setPhase('driving');
  };

  return (
    <div className="main-menu">
      <div className="menu-content">
        {/* Title */}
        <div className="menu-title">
          <span className="title-line-1">Ali's</span>
          <span className="title-line-2">아이고</span>
          <span className="title-line-3">Apocalypse</span>
        </div>

        {/* Subtitle */}
        <p className="menu-subtitle">
          NYC → Spokane Valley | 2,800 Miles
        </p>

        {/* Car and cats */}
        <div className="menu-characters">
          <span className="menu-cat left">🐱</span>
          <span className="menu-car">🚗</span>
          <span className="menu-cat right">🐱</span>
        </div>

        {/* Buttons */}
        <div className="menu-buttons">
          {hasSaveData && (
            <button className="menu-btn primary" onClick={handleContinue}>
              Continue Journey
            </button>
          )}

          <button
            className={`menu-btn ${hasSaveData ? 'secondary' : 'primary'}`}
            onClick={handleNewGame}
          >
            New Game
          </button>

          <button className="menu-btn secondary" onClick={onShowHelp}>
            How to Play
          </button>

          <button
            className="menu-btn text"
            onClick={() => setShowCredits(true)}
          >
            Credits
          </button>
        </div>

        {/* Tagline */}
        <p className="menu-tagline">
          Learn to drive. Survive the apocalypse.<br />
          Pass the WA State permit test! 🧟‍♂️
        </p>
      </div>

      {/* Credits modal */}
      {showCredits && (
        <div className="credits-overlay" onClick={() => setShowCredits(false)}>
          <div className="credits-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Credits</h2>
            <p><strong>Ali's Aigoo Apocalypse</strong></p>
            <p>A driving education game</p>
            <br />
            <p>Made with 💜 for Ali</p>
            <p>Featuring Mya & Gracie</p>
            <br />
            <p className="credits-tech">
              Built with React, Three.js, and determination
            </p>
            <button onClick={() => setShowCredits(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

File 15: src/components/UI/MainMenu.css
css.main-menu {
  position: fixed;
  inset: 0;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.menu-content {
  text-align: center;
  max-width: 400px;
  width: 100%;
}

/* Title */
.menu-title {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 8px;
}

.title-line-1 {
  font-size: 28px;
  color: #ff9ff3;
  font-weight: 600;
}

.title-line-2 {
  font-size: 64px;
  color: #ff00ff;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 0 30px rgba(255, 0, 255, 0.6);
  animation: title-glow 2s ease-in-out infinite alternate;
}

@keyframes title-glow {
  from { text-shadow: 0 0 30px rgba(255, 0, 255, 0.6); }
  to { text-shadow: 0 0 50px rgba(255, 0, 255, 0.9), 0 0 80px rgba(255, 0, 255, 0.4); }
}

.title-line-3 {
  font-size: 24px;
  color: #39ff14;
  font-weight: 700;
  letter-spacing: 6px;
  text-transform: uppercase;
}

.menu-subtitle {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  margin-bottom: 24px;
}

/* Characters */
.menu-characters {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 32px;
}

.menu-car {
  font-size: 48px;
  animation: car-drive 1s ease-in-out infinite;
}

@keyframes car-drive {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(3px) rotate(1deg); }
  75% { transform: translateX(-3px) rotate(-1deg); }
}

.menu-cat {
  font-size: 32px;
}

.menu-cat.left {
  animation: cat-peek 2s ease-in-out infinite;
}

.menu-cat.right {
  animation: cat-peek 2s ease-in-out infinite 0.5s;
}

@keyframes cat-peek {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

/* Buttons */
.menu-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.menu-btn {
  width: 100%;
  padding: 16px 24px;
  border: none;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.menu-btn.primary {
  background: linear-gradient(135deg, #ff00ff, #aa00aa);
  color: white;
  box-shadow: 0 4px 20px rgba(255, 0, 255, 0.4);
}

.menu-btn.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(255, 0, 255, 0.6);
}

.menu-btn.primary:active {
  transform: translateY(0);
}

.menu-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.menu-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 0, 255, 0.5);
}

.menu-btn.text {
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  padding: 8px;
}

.menu-btn.text:hover {
  color: rgba(255, 255, 255, 0.8);
}

/* Tagline */
.menu-tagline {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  line-height: 1.6;
}

/* Credits modal */
.credits-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}

.credits-modal {
  background: #1a1a2e;
  border: 2px solid #ff00ff;
  border-radius: 16px;
  padding: 24px;
  max-width: 300px;
  text-align: center;
}

.credits-modal h2 {
  color: #ff00ff;
  margin: 0 0 16px 0;
}

.credits-modal p {
  color: rgba(255, 255, 255, 0.8);
  margin: 4px 0;
  font-size: 14px;
}

.credits-tech {
  color: rgba(255, 255, 255, 0.4) !important;
  font-size: 11px !important;
}

.credits-modal button {
  margin-top: 20px;
  padding: 10px 24px;
  background: #ff00ff;
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 600;
  cursor: pointer;
}

File 16: src/components/UI/PauseMenu.tsx
typescriptimport { useGameStore } from '../../stores/gameStore';
import './PauseMenu.css';

export function PauseMenu() {
  const setPhase = useGameStore((s) => s.setPhase);
  const resetGame = useGameStore((s) => s.resetGame);
  const distanceTraveled = useGameStore((s) => s.game.distanceTraveled);
  const questionsAnswered = useGameStore((s) => s.quiz.questionsAnswered);
  const correctAnswers = useGameStore((s) => s.quiz.correctAnswers);
  const coins = useGameStore((s) => s.economy.coins);

  const handleResume = () => {
    setPhase('driving');
  };

  const handleMainMenu = () => {
    resetGame();
    setPhase('menu');
  };

  const accuracy = questionsAnswered > 0
    ? Math.round((correctAnswers / questionsAnswered) * 100)
    : 0;

  return (
    <div className="pause-menu">
      <div className="pause-content">
        <h1 className="pause-title">Paused</h1>

        {/* Stats */}
        <div className="pause-stats">
          <div className="stat-item">
            <span className="stat-value">{Math.round(distanceTraveled)}</span>
            <span className="stat-label">Miles</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{coins}</span>
            <span className="stat-label">Coins</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{accuracy}%</span>
            <span className="stat-label">Quiz Accuracy</span>
          </div>
        </div>

        {/* Quiz progress */}
        <div className="pause-quiz-progress">
          <span>{correctAnswers} / {questionsAnswered} questions correct</span>
        </div>

        {/* Buttons */}
        <div className="pause-buttons">
          <button className="pause-btn primary" onClick={handleResume}>
            Resume
          </button>
          <button className="pause-btn secondary" onClick={handleMainMenu}>
            Main Menu
          </button>
        </div>

        {/* Tip */}
        <p className="pause-tip">
          💡 Tip: Answer quiz questions correctly to earn coins and streaks!
        </p>
      </div>
    </div>
  );
}

File 17: src/components/UI/PauseMenu.css
css.pause-menu {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
  animation: fade-in 0.2s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.pause-content {
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border: 2px solid rgba(255, 0, 255, 0.5);
  border-radius: 20px;
  padding: 32px 24px;
  max-width: 340px;
  width: 100%;
  text-align: center;
  animation: slide-up 0.3s ease;
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.pause-title {
  font-size: 32px;
  font-weight: 900;
  color: #ff00ff;
  margin: 0 0 24px 0;
  text-shadow: 0 0 20px rgba(255, 0, 255, 0.5);
}

/* Stats grid */
.pause-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 12px 8px;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #39ff14;
}

.stat-label {
  display: block;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 4px;
}

/* Quiz progress */
.pause-quiz-progress {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 24px;
}

.pause-quiz-progress span {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}

/* Buttons */
.pause-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.pause-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pause-btn.primary {
  background: linear-gradient(135deg, #ff00ff, #aa00aa);
  color: white;
}

.pause-btn.primary:hover {
  box-shadow: 0 0 20px rgba(255, 0, 255, 0.5);
  transform: translateY(-2px);
}

.pause-btn.secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.pause-btn.secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Tip */
.pause-tip {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  margin: 0;
}

File 18: src/components/UI/GameHUD.tsx
typescriptimport { useGameStore } from '../../stores/gameStore';
import './GameHUD.css';

export function GameHUD() {
  const velocity = useGameStore((s) => s.vehicle.velocity);
  const distanceTraveled = useGameStore((s) => s.game.distanceTraveled);
  const totalDistance = useGameStore((s) => s.game.totalDistance);
  const currentBiome = useGameStore((s) => s.game.currentBiome);
  const coins = useGameStore((s) => s.economy.coins);
  const streak = useGameStore((s) => s.economy.streak);
  const multiplier = useGameStore((s) => s.economy.multiplier);

  const progressPercent = Math.min((distanceTraveled / totalDistance) * 100, 100);

  const getBiomeLabel = () => {
    switch (currentBiome) {
      case 'city': return '🏙️ City';
      case 'highway': return '🛣️ Highway';
      case 'rural': return '🌾 Rural';
      default: return currentBiome;
    }
  };

  return (
    <div className="game-hud">
      {/* Top bar */}
      <div className="hud-top-bar">
        {/* Coins */}
        <div className="hud-coins">
          <span className="coin-icon">🪙</span>
          <span className="coin-value">{coins}</span>
        </div>

        {/* Streak */}
        {streak > 0 && (
          <div className="hud-streak">
            <span className="streak-icon">🔥</span>
            <span className="streak-value">{streak}</span>
            {multiplier > 1 && (
              <span className="streak-multiplier">×{multiplier.toFixed(1)}</span>
            )}
          </div>
        )}

        {/* Biome */}
        <div className="hud-biome">
          {getBiomeLabel()}
        </div>
      </div>

      {/* Speedometer */}
      <div className="hud-speedometer">
        <span className="speed-value">{Math.round(velocity)}</span>
        <span className="speed-unit">MPH</span>
      </div>

      {/* Progress bar */}
      <div className="hud-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
          <div
            className="progress-car"
            style={{ left: `${progressPercent}%` }}
          >
            🚗
          </div>
        </div>
        <div className="progress-labels">
          <span>NYC</span>
          <span className="progress-distance">
            {Math.round(distanceTraveled)} / {totalDistance} mi
          </span>
          <span>Spokane</span>
        </div>
      </div>
    </div>
  );
}

File 19: src/components/UI/GameHUD.css
css.game-hud {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  padding: 12px;
  pointer-events: none;
  z-index: 50;
}

/* Top bar */
.hud-top-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  padding-right: 56px; /* Space for pause button */
}

/* Coins */
.hud-coins {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(18, 18, 18, 0.8);
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.coin-icon {
  font-size: 16px;
}

.coin-value {
  color: #ffd700;
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* Streak */
.hud-streak {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(18, 18, 18, 0.8);
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid rgba(255, 100, 50, 0.3);
  animation: streak-pulse 1s ease-in-out infinite;
}

@keyframes streak-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(255, 100, 50, 0); }
  50% { box-shadow: 0 0 10px rgba(255, 100, 50, 0.3); }
}

.streak-icon {
  font-size: 14px;
}

.streak-value {
  color: #ff6b35;
  font-size: 16px;
  font-weight: 700;
}

.streak-multiplier {
  color: #39ff14;
  font-size: 12px;
  font-weight: 600;
  margin-left: 2px;
}

/* Biome */
.hud-biome {
  margin-left: auto;
  background: rgba(18, 18, 18, 0.8);
  padding: 6px 12px;
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
}

/* Speedometer */
.hud-speedometer {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: rgba(18, 18, 18, 0.9);
  border: 2px solid rgba(255, 0, 255, 0.4);
  border-radius: 16px;
  padding: 12px 20px;
  text-align: center;
  z-index: 55;
}

.speed-value {
  display: block;
  font-size: 36px;
  font-weight: 900;
  color: #39ff14;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.speed-unit {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Progress bar */
.hud-progress {
  position: fixed;
  bottom: 20px;
  left: 20px;
  right: 100px;
  z-index: 55;
}

.progress-bar {
  position: relative;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: visible;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff00ff, #39ff14);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-car {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 16px;
  transition: left 0.3s ease;
}

.progress-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
}

.progress-labels span {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
}

.progress-distance {
  color: rgba(255, 255, 255, 0.7) !important;
  font-variant-numeric: tabular-nums;
}

/* Mobile adjustments */
@media (max-width: 400px) {
  .hud-speedometer {
    padding: 8px 14px;
  }

  .speed-value {
    font-size: 28px;
  }

  .hud-progress {
    right: 80px;
  }
}

/* Safe area support */
@supports (padding: env(safe-area-inset-top)) {
  .game-hud {
    padding-top: max(12px, env(safe-area-inset-top));
    padding-left: max(12px, env(safe-area-inset-left));
    padding-right: max(12px, env(safe-area-inset-right));
  }

  .hud-speedometer {
    bottom: max(20px, env(safe-area-inset-bottom));
    right: max(20px, env(safe-area-inset-right));
  }

  .hud-progress {
    bottom: max(20px, env(safe-area-inset-bottom));
    left: max(20px, env(safe-area-inset-left));
  }
}

Ready for Part 4: Touch & Keyboard Controls? (y/k)YJan 21Orchestrated interactive control systems and interface componentsOrchestrated interactive control systems and interface componentsPart 4: Touch & Keyboard Controls
File 20: src/hooks/useTouchControls.ts
typescriptimport { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const TOUCH_CONFIG = {
  STEERING_ZONE_HEIGHT: 0.6,
  PEDAL_ZONE_HEIGHT: 0.4,
  DEAD_ZONE: 0.05,
  MAX_STEER_DISTANCE: 100,
  MAX_PEDAL_DISTANCE: 80,
  SMOOTHING: 0.15,
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface TouchData {
  id: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  zone: 'steering' | 'throttle' | 'brake';
}

// ═══════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════

export function useTouchControls() {
  const phase = useGameStore((s) => s.game.phase);
  const sensitivity = useGameStore((s) => s.settings.steeringSensitivity);
  const invertSteering = useGameStore((s) => s.settings.invertSteering);
  const setVehicleControls = useGameStore((s) => s.setVehicleControls);

  const activeTouches = useRef<Map<number, TouchData>>(new Map());
  const inputState = useRef({ throttle: 0, brake: 0, steering: 0 });
  const smoothedState = useRef({ throttle: 0, brake: 0, steering: 0 });
  const frameId = useRef<number | null>(null);

  // ─────────────────────────────────────────────────────────
  // DETERMINE TOUCH ZONE
  // ─────────────────────────────────────────────────────────

  const getZone = useCallback((x: number, y: number): TouchData['zone'] => {
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    const normalizedY = y / screenHeight;

    if (normalizedY < TOUCH_CONFIG.STEERING_ZONE_HEIGHT) {
      return 'steering';
    }

    return x < screenWidth / 2 ? 'brake' : 'throttle';
  }, []);

  // ─────────────────────────────────────────────────────────
  // CALCULATE INPUTS
  // ─────────────────────────────────────────────────────────

  const calculateInputs = useCallback(() => {
    let steering = 0;
    let throttle = 0;
    let brake = 0;

    activeTouches.current.forEach((touch) => {
      const deltaX = touch.currentX - touch.startX;
      const deltaY = touch.startY - touch.currentY;

      switch (touch.zone) {
        case 'steering': {
          const normalized = deltaX / TOUCH_CONFIG.MAX_STEER_DISTANCE;
          const clamped = Math.max(-1, Math.min(1, normalized * sensitivity));
          const withDeadZone = Math.abs(clamped) < TOUCH_CONFIG.DEAD_ZONE ? 0 : clamped;
          steering = invertSteering ? -withDeadZone : withDeadZone;
          break;
        }
        case 'throttle': {
          const normalized = deltaY / TOUCH_CONFIG.MAX_PEDAL_DISTANCE;
          throttle = Math.max(0, Math.min(1, normalized));
          break;
        }
        case 'brake': {
          const normalized = deltaY / TOUCH_CONFIG.MAX_PEDAL_DISTANCE;
          brake = Math.max(0, Math.min(1, normalized));
          break;
        }
      }
    });

    inputState.current = { throttle, brake, steering };
  }, [sensitivity, invertSteering]);

  // ─────────────────────────────────────────────────────────
  // SMOOTHING LOOP
  // ─────────────────────────────────────────────────────────

  const updateLoop = useCallback(() => {
    const input = inputState.current;
    const smoothed = smoothedState.current;

    smoothed.throttle += (input.throttle - smoothed.throttle) * TOUCH_CONFIG.SMOOTHING;
    smoothed.brake += (input.brake - smoothed.brake) * TOUCH_CONFIG.SMOOTHING;
    smoothed.steering += (input.steering - smoothed.steering) * TOUCH_CONFIG.SMOOTHING;

    if (phase === 'driving') {
      setVehicleControls(smoothed.throttle, smoothed.brake, smoothed.steering);
    }

    frameId.current = requestAnimationFrame(updateLoop);
  }, [phase, setVehicleControls]);

  // ─────────────────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────────────────

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (phase !== 'driving') return;

    Array.from(e.changedTouches).forEach((touch) => {
      const zone = getZone(touch.clientX, touch.clientY);
      activeTouches.current.set(touch.identifier, {
        id: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        zone,
      });
    });

    calculateInputs();
  }, [phase, getZone, calculateInputs]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (phase !== 'driving') return;
    e.preventDefault();

    Array.from(e.changedTouches).forEach((touch) => {
      const data = activeTouches.current.get(touch.identifier);
      if (data) {
        data.currentX = touch.clientX;
        data.currentY = touch.clientY;
      }
    });

    calculateInputs();
  }, [phase, calculateInputs]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    Array.from(e.changedTouches).forEach((touch) => {
      activeTouches.current.delete(touch.identifier);
    });

    calculateInputs();
  }, [calculateInputs]);

  // ─────────────────────────────────────────────────────────
  // SETUP
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    const options = { passive: false };

    document.addEventListener('touchstart', handleTouchStart, options);
    document.addEventListener('touchmove', handleTouchMove, options);
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);

    frameId.current = requestAnimationFrame(updateLoop);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);

      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
      }
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, updateLoop]);

  return {
    getInputState: () => ({ ...smoothedState.current }),
    getActiveTouches: () => activeTouches.current.size,
  };
}

File 21: src/hooks/useKeyboardControls.ts
typescriptimport { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const KEY_CONFIG = {
  BINDINGS: {
    throttle: ['KeyW', 'ArrowUp'],
    brake: ['KeyS', 'ArrowDown'],
    steerLeft: ['KeyA', 'ArrowLeft'],
    steerRight: ['KeyD', 'ArrowRight'],
    horn: ['KeyH', 'Space'],
    pause: ['Escape', 'KeyP'],
  },
  STEERING_SPEED: 3.0,
  STEERING_RETURN_SPEED: 5.0,
  THROTTLE_SPEED: 4.0,
  BRAKE_SPEED: 6.0,
  INPUT_DECAY: 8.0,
};

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

interface KeyState {
  throttle: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  horn: boolean;
}

// ═══════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════

export function useKeyboardControls() {
  const phase = useGameStore((s) => s.game.phase);
  const setPhase = useGameStore((s) => s.setPhase);
  const setVehicleControls = useGameStore((s) => s.setVehicleControls);

  const keyState = useRef<KeyState>({
    throttle: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    horn: false,
  });

  const smoothInputs = useRef({ throttle: 0, brake: 0, steering: 0 });
  const frameId = useRef<number | null>(null);
  const lastTime = useRef(performance.now());
  const onHornPress = useRef<(() => void) | null>(null);

  // ─────────────────────────────────────────────────────────
  // KEY BINDING CHECK
  // ─────────────────────────────────────────────────────────

  const isKeyBound = useCallback((code: string, action: keyof typeof KEY_CONFIG.BINDINGS): boolean => {
    return KEY_CONFIG.BINDINGS[action].includes(code);
  }, []);

  // ─────────────────────────────────────────────────────────
  // KEY DOWN HANDLER
  // ─────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const code = e.code;

    // Pause toggle
    if (isKeyBound(code, 'pause')) {
      e.preventDefault();
      if (phase === 'driving') {
        setPhase('paused');
      } else if (phase === 'paused') {
        setPhase('driving');
      }
      return;
    }

    if (phase !== 'driving') return;

    // Prevent default for game keys
    if (Object.values(KEY_CONFIG.BINDINGS).flat().includes(code)) {
      e.preventDefault();
    }

    if (isKeyBound(code, 'throttle')) keyState.current.throttle = true;
    if (isKeyBound(code, 'brake')) keyState.current.brake = true;
    if (isKeyBound(code, 'steerLeft')) keyState.current.steerLeft = true;
    if (isKeyBound(code, 'steerRight')) keyState.current.steerRight = true;

    if (isKeyBound(code, 'horn') && !keyState.current.horn) {
      keyState.current.horn = true;
      onHornPress.current?.();
    }
  }, [phase, setPhase, isKeyBound]);

  // ─────────────────────────────────────────────────────────
  // KEY UP HANDLER
  // ─────────────────────────────────────────────────────────

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    const code = e.code;

    if (isKeyBound(code, 'throttle')) keyState.current.throttle = false;
    if (isKeyBound(code, 'brake')) keyState.current.brake = false;
    if (isKeyBound(code, 'steerLeft')) keyState.current.steerLeft = false;
    if (isKeyBound(code, 'steerRight')) keyState.current.steerRight = false;
    if (isKeyBound(code, 'horn')) keyState.current.horn = false;
  }, [isKeyBound]);

  // ─────────────────────────────────────────────────────────
  // BLUR HANDLER (release all keys)
  // ─────────────────────────────────────────────────────────

  const handleBlur = useCallback(() => {
    keyState.current = {
      throttle: false,
      brake: false,
      steerLeft: false,
      steerRight: false,
      horn: false,
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // INPUT SMOOTHING LOOP
  // ─────────────────────────────────────────────────────────

  const updateInputs = useCallback(() => {
    const now = performance.now();
    const delta = Math.min((now - lastTime.current) / 1000, 0.05);
    lastTime.current = now;

    const keys = keyState.current;
    const inputs = smoothInputs.current;

    // Throttle
    if (keys.throttle) {
      inputs.throttle = Math.min(1, inputs.throttle + KEY_CONFIG.THROTTLE_SPEED * delta);
    } else {
      inputs.throttle = Math.max(0, inputs.throttle - KEY_CONFIG.INPUT_DECAY * delta);
    }

    // Brake
    if (keys.brake) {
      inputs.brake = Math.min(1, inputs.brake + KEY_CONFIG.BRAKE_SPEED * delta);
    } else {
      inputs.brake = Math.max(0, inputs.brake - KEY_CONFIG.INPUT_DECAY * delta);
    }

    // Steering
    const steerInput = (keys.steerRight ? 1 : 0) - (keys.steerLeft ? 1 : 0);

    if (steerInput !== 0) {
      const target = steerInput;
      const steerDelta = KEY_CONFIG.STEERING_SPEED * delta;

      if (inputs.steering < target) {
        inputs.steering = Math.min(target, inputs.steering + steerDelta);
      } else if (inputs.steering > target) {
        inputs.steering = Math.max(target, inputs.steering - steerDelta);
      }
    } else {
      const returnDelta = KEY_CONFIG.STEERING_RETURN_SPEED * delta;

      if (inputs.steering > 0) {
        inputs.steering = Math.max(0, inputs.steering - returnDelta);
      } else if (inputs.steering < 0) {
        inputs.steering = Math.min(0, inputs.steering + returnDelta);
      }
    }

    // Apply to store
    if (phase === 'driving') {
      setVehicleControls(inputs.throttle, inputs.brake, inputs.steering);
    }

    frameId.current = requestAnimationFrame(updateInputs);
  }, [phase, setVehicleControls]);

  // ─────────────────────────────────────────────────────────
  // SETUP
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    frameId.current = requestAnimationFrame(updateInputs);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);

      if (frameId.current) {
        cancelAnimationFrame(frameId.current);
      }
    };
  }, [handleKeyDown, handleKeyUp, handleBlur, updateInputs]);

  return {
    setHornCallback: (callback: () => void) => {
      onHornPress.current = callback;
    },
    getInputState: () => ({ ...smoothInputs.current }),
    isKeyPressed: (action: keyof typeof KEY_CONFIG.BINDINGS) => {
      switch (action) {
        case 'throttle': return keyState.current.throttle;
        case 'brake': return keyState.current.brake;
        case 'steerLeft': return keyState.current.steerLeft;
        case 'steerRight': return keyState.current.steerRight;
        case 'horn': return keyState.current.horn;
        default: return false;
      }
    },
    config: KEY_CONFIG,
  };
}

File 22: src/components/UI/TouchOverlay.tsx
typescriptimport { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../stores/gameStore';
import './TouchOverlay.css';

export function TouchOverlay() {
  const phase = useGameStore((s) => s.game.phase);
  const throttle = useGameStore((s) => s.vehicle.throttle);
  const brake = useGameStore((s) => s.vehicle.brake);
  const steering = useGameStore((s) => s.vehicle.steering);

  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  if (!isTouchDevice || phase !== 'driving') return null;

  return (
    <div className="touch-overlay">
      {/* Steering zone indicator */}
      <div className="touch-zone steering-zone">
        <div className="zone-label">← Steer →</div>
        <div className="steering-indicator">
          <div
            className="steering-marker"
            style={{ transform: `translateX(${steering * 40}px)` }}
          />
        </div>
      </div>

      {/* Pedal zones */}
      <div className="touch-zone pedal-zones">
        {/* Brake */}
        <div className="pedal-zone brake-zone">
          <div className="pedal-label">BRAKE</div>
          <div className="pedal-meter">
            <div
              className="pedal-fill brake-fill"
              style={{ height: `${brake * 100}%` }}
            />
          </div>
        </div>

        {/* Throttle */}
        <div className="pedal-zone throttle-zone">
          <div className="pedal-label">GAS</div>
          <div className="pedal-meter">
            <div
              className="pedal-fill throttle-fill"
              style={{ height: `${throttle * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Swipe hint (first time only) */}
      <TouchHint />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TOUCH HINT COMPONENT
// ═══════════════════════════════════════════════════════════

function TouchHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="touch-hint">
      <div className="hint-row">
        <span>👆 Drag up for gas/brake</span>
      </div>
      <div className="hint-row">
        <span>👈👉 Drag sideways to steer</span>
      </div>
    </div>
  );
}

File 23: src/components/UI/TouchOverlay.css
css.touch-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 45;
}

/* Steering zone */
.steering-zone {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 60%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 20px;
}

.zone-label {
  color: rgba(255, 255, 255, 0.2);
  font-size: 12px;
  margin-bottom: 8px;
}

.steering-indicator {
  width: 100px;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  position: relative;
}

.steering-marker {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 16px;
  background: #ff00ff;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 10px rgba(255, 0, 255, 0.5);
  transition: transform 0.05s ease;
}

/* Pedal zones */
.pedal-zones {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 40%;
  display: flex;
}

.pedal-zone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 80px;
}

.pedal-label {
  color: rgba(255, 255, 255, 0.3);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1px;
  margin-bottom: 8px;
}

.pedal-meter {
  width: 30px;
  height: 60px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.pedal-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  transition: height 0.05s ease;
}

.brake-fill {
  background: linear-gradient(to top, #ff4757, #ff6b81);
}

.throttle-fill {
  background: linear-gradient(to top, #39ff14, #7bed9f);
}

/* Touch hint */
.touch-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  padding: 16px 24px;
  border-radius: 12px;
  animation: hint-fade 5s ease-out forwards;
}

@keyframes hint-fade {
  0%, 80% { opacity: 1; }
  100% { opacity: 0; }
}

.hint-row {
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  margin: 8px 0;
  text-align: center;
}

/* Hide on desktop */
@media (hover: hover) and (pointer: fine) {
  .touch-overlay {
    display: none;
  }
}

File 24: src/components/UI/KeyboardOverlay.tsx
typescriptimport { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useKeyboardControls } from '../../hooks/useKeyboardControls';
import './KeyboardOverlay.css';

export function KeyboardOverlay() {
  const phase = useGameStore((s) => s.game.phase);
  const { isKeyPressed } = useKeyboardControls();

  const [isDesktop, setIsDesktop] = useState(false);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const hasKeyboard = !('ontouchstart' in window) && !navigator.maxTouchPoints;
    setIsDesktop(hasKeyboard);

    const timer = setTimeout(() => setShowHint(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  if (!isDesktop || phase !== 'driving') return null;

  return (
    <div className="keyboard-overlay">
      {/* Initial hint */}
      {showHint && (
        <div className="keyboard-hint">
          <span>Use</span>
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
          <span>or</span>
          <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
          <span>to drive</span>
          <button className="hint-dismiss" onClick={() => setShowHint(false)}>✕</button>
        </div>
      )}

      {/* Key indicators */}
      <div className="key-indicators">
        <div className="key-row">
          <KeyIndicator label="W" active={isKeyPressed('throttle')} />
        </div>
        <div className="key-row">
          <KeyIndicator label="A" active={isKeyPressed('steerLeft')} />
          <KeyIndicator label="S" active={isKeyPressed('brake')} />
          <KeyIndicator label="D" active={isKeyPressed('steerRight')} />
        </div>
      </div>

      {/* Extra controls */}
      <div className="extra-controls">
        <span className="control-hint"><kbd>H</kbd> Horn</span>
        <span className="control-hint"><kbd>Esc</kbd> Pause</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// KEY INDICATOR COMPONENT
// ═══════════════════════════════════════════════════════════

interface KeyIndicatorProps {
  label: string;
  active: boolean;
}

function KeyIndicator({ label, active }: KeyIndicatorProps) {
  return (
    <div className={`key-indicator ${active ? 'active' : ''}`}>
      <span className="key-main">{label}</span>
    </div>
  );
}

File 25: src/components/UI/KeyboardOverlay.css
css.keyboard-overlay {
  position: fixed;
  bottom: 20px;
  left: 20px;
  z-index: 55;
  pointer-events: none;
}

/* Hint banner */
.keyboard-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(18, 18, 18, 0.9);
  border: 1px solid rgba(255, 0, 255, 0.4);
  border-radius: 12px;
  padding: 10px 16px;
  margin-bottom: 12px;
  animation: hint-appear 0.3s ease-out;
  pointer-events: auto;
}

@keyframes hint-appear {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.keyboard-hint span {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}

.keyboard-hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  font-weight: bold;
}

.hint-dismiss {
  margin-left: 8px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
}

.hint-dismiss:hover {
  color: #ff00ff;
}

/* Key indicators */
.key-indicators {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.key-row {
  display: flex;
  gap: 4px;
}

.key-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: rgba(18, 18, 18, 0.8);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  transition: all 0.1s ease;
}

.key-indicator.active {
  background: rgba(255, 0, 255, 0.3);
  border-color: #ff00ff;
  box-shadow: 0 0 15px rgba(255, 0, 255, 0.5);
  transform: scale(0.95);
}

.key-main {
  color: #ffffff;
  font-size: 16px;
  font-weight: bold;
}

.key-indicator.active .key-main {
  color: #ff00ff;
  text-shadow: 0 0 8px #ff00ff;
}

/* Extra controls */
.extra-controls {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.control-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.control-hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 4px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.7);
  font-family: inherit;
  font-size: 10px;
}

/* Hide on mobile */
@media (max-width: 768px), (pointer: coarse) {
  .keyboard-overlay {
    display: none;
  }
}

File 26: src/components/UI/ControlsHelp.tsx
typescriptimport { useState } from 'react';
import './ControlsHelp.css';

interface ControlsHelpProps {
  onClose: () => void;
}

export function ControlsHelp({ onClose }: ControlsHelpProps) {
  const [activeTab, setActiveTab] = useState<'touch' | 'keyboard'>('touch');

  return (
    <div className="controls-help-overlay" onClick={onClose}>
      <div className="controls-help-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="help-title">How to Drive</h2>

        {/* Tabs */}
        <div className="help-tabs">
          <button
            className={`help-tab ${activeTab === 'touch' ? 'active' : ''}`}
            onClick={() => setActiveTab('touch')}
          >
            📱 Touch
          </button>
          <button
            className={`help-tab ${activeTab === 'keyboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('keyboard')}
          >
            ⌨️ Keyboard
          </button>
        </div>

        {/* Touch controls */}
        {activeTab === 'touch' && (
          <div className="help-content">
            <div className="help-diagram touch-diagram">
              <div className="diagram-zone steering">
                <span className="zone-label">Steering Zone</span>
                <span className="zone-hint">Drag left/right</span>
              </div>
              <div className="diagram-zone brake">
                <span className="zone-label">Brake</span>
                <span className="zone-hint">Drag up</span>
              </div>
              <div className="diagram-zone gas">
                <span className="zone-label">Gas</span>
                <span className="zone-hint">Drag up</span>
              </div>
            </div>

            <ul className="help-list">
              <li><strong>Steer:</strong> Drag horizontally (top 60%)</li>
              <li><strong>Accelerate:</strong> Drag up (bottom right)</li>
              <li><strong>Brake:</strong> Drag up (bottom left)</li>
            </ul>
          </div>
        )}

        {/* Keyboard controls */}
        {activeTab === 'keyboard' && (
          <div className="help-content">
            <div className="help-diagram keyboard-diagram">
              <div className="key-layout">
                <div className="key-row"><div className="key-box">W</div></div>
                <div className="key-row">
                  <div className="key-box">A</div>
                  <div className="key-box">S</div>
                  <div className="key-box">D</div>
                </div>
              </div>
              <div className="key-divider">or</div>
              <div className="key-layout">
                <div className="key-row"><div className="key-box">↑</div></div>
                <div className="key-row">
                  <div className="key-box">←</div>
                  <div className="key-box">↓</div>
                  <div className="key-box">→</div>
                </div>
              </div>
            </div>

            <ul className="help-list">
              <li><kbd>W</kbd> / <kbd>↑</kbd> — Accelerate</li>
              <li><kbd>S</kbd> / <kbd>↓</kbd> — Brake</li>
              <li><kbd>A</kbd> / <kbd>←</kbd> — Steer Left</li>
              <li><kbd>D</kbd> / <kbd>→</kbd> — Steer Right</li>
              <li><kbd>H</kbd> / <kbd>Space</kbd> — Horn</li>
              <li><kbd>Esc</kbd> / <kbd>P</kbd> — Pause</li>
            </ul>
          </div>
        )}

        <button className="help-close-btn" onClick={onClose}>
          Got it!
        </button>
      </div>
    </div>
  );
}

File 27: src/components/UI/ControlsHelp.css
css.controls-help-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  padding: 20px;
  animation: fade-in 0.2s ease;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.controls-help-modal {
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border: 2px solid #ff00ff;
  border-radius: 20px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 0 40px rgba(255, 0, 255, 0.3);
  animation: modal-appear 0.3s ease;
}

@keyframes modal-appear {
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.help-title {
  margin: 0 0 20px 0;
  font-size: 22px;
  font-weight: bold;
  color: #ffffff;
  text-align: center;
}

/* Tabs */
.help-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.help-tab {
  flex: 1;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.help-tab:hover {
  border-color: rgba(255, 0, 255, 0.3);
}

.help-tab.active {
  background: rgba(255, 0, 255, 0.15);
  border-color: #ff00ff;
  color: #ffffff;
}

/* Content */
.help-content {
  animation: content-fade 0.2s ease;
}

@keyframes content-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Touch diagram */
.help-diagram {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
}

.touch-diagram {
  height: 180px;
  position: relative;
}

.diagram-zone {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.2);
}

.diagram-zone.steering {
  top: 0;
  left: 0;
  right: 0;
  height: 60%;
  background: rgba(255, 0, 255, 0.1);
}

.diagram-zone.brake {
  bottom: 0;
  left: 0;
  width: 50%;
  height: 40%;
  background: rgba(255, 100, 100, 0.1);
}

.diagram-zone.gas {
  bottom: 0;
  right: 0;
  width: 50%;
  height: 40%;
  background: rgba(57, 255, 20, 0.1);
}

.zone-label {
  color: #ffffff;
  font-size: 14px;
  font-weight: bold;
}

.zone-hint {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  margin-top: 4px;
}

/* Keyboard diagram */
.keyboard-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 20px;
}

.key-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.key-layout .key-row {
  display: flex;
  gap: 6px;
}

.key-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  color: #ffffff;
  font-size: 16px;
  font-weight: bold;
}

.key-divider {
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
}

/* Help list */
.help-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.help-list li {
  padding: 8px 0;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.help-list li:last-child {
  border-bottom: none;
}

.help-list strong {
  color: #39ff14;
}

.help-list kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  margin-right: 4px;
}

/* Close button */
.help-close-btn {
  width: 100%;
  margin-top: 20px;
  padding: 14px;
  background: linear-gradient(135deg, #ff00ff, #aa00aa);
  border: none;
  border-radius: 12px;
  color: #ffffff;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.help-close-btn:hover {
  box-shadow: 0 0 25px rgba(255, 0, 255, 0.5);
  transform: translateY(-2px);
}

.help-close-btn:active {
  transform: translateY(0);
}

Ready for Part 5: 3D Components (Vehicle, Road, Camera, Lighting, Skybox)? (y/k)YMar 12Orchestrated 3D component delivery sequenceOrchestrated 3D component delivery sequencePart 5: 3D Components
File 28: src/components/Vehicle/Vehicle.tsx
typescriptimport { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { Group, Vector3 } from 'three';
import { useGameStore } from '../../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// PHYSICS CONFIGURATION
// ═══════════════════════════════════════════════════════════

const VEHICLE_CONFIG = {
  // Dimensions
  WIDTH: 1.8,
  HEIGHT: 1.4,
  LENGTH: 4.0,

  // Physics
  MASS: 1200,
  MAX_SPEED_MPH: 60,
  ACCELERATION_FORCE: 14,
  BRAKE_FORCE: 22,
  ENGINE_BRAKE: 3,
  TURN_SPEED: 2.5,
  LATERAL_FRICTION: 0.92,

  // Conversion
  MPH_TO_MS: 0.44704,
  MS_TO_MPH: 2.23694,
};

// ═══════════════════════════════════════════════════════════
// VEHICLE COMPONENT
// ═══════════════════════════════════════════════════════════

export function Vehicle() {
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const meshRef = useRef<Group>(null);

  // Store
  const phase = useGameStore((s) => s.game.phase);
  const throttle = useGameStore((s) => s.vehicle.throttle);
  const brake = useGameStore((s) => s.vehicle.brake);
  const steering = useGameStore((s) => s.vehicle.steering);
  const setVehiclePosition = useGameStore((s) => s.setVehiclePosition);
  const setVehicleRotation = useGameStore((s) => s.setVehicleRotation);
  const setVehicleVelocity = useGameStore((s) => s.setVehicleVelocity);
  const addDistance = useGameStore((s) => s.addDistance);

  // Tracking
  const lastPosition = useRef(new Vector3(0, 0, 0));
  const accumulatedDistance = useRef(0);

  // ─────────────────────────────────────────────────────────
  // PHYSICS UPDATE
  // ─────────────────────────────────────────────────────────

  useFrame((_, delta) => {
    if (!rigidBodyRef.current || phase !== 'driving') return;

    const rb = rigidBodyRef.current;
    const clampedDelta = Math.min(delta, 0.05);

    // Get current state
    const position = rb.translation();
    const rotation = rb.rotation();
    const linvel = rb.linvel();

    // Calculate forward direction (local Z axis)
    const forward = new Vector3(0, 0, -1);
    forward.applyQuaternion({
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w,
    } as any);

    // Calculate current speed
    const velocity = new Vector3(linvel.x, linvel.y, linvel.z);
    const forwardSpeed = velocity.dot(forward);
    const speedMPH = Math.abs(forwardSpeed) * VEHICLE_CONFIG.MS_TO_MPH;

    // ─────────────────────────────────────────────────────
    // ACCELERATION / BRAKING
    // ─────────────────────────────────────────────────────

    let forceMultiplier = 0;

    if (throttle > 0.01) {
      // Throttle force (reduces at high speed)
      const speedRatio = speedMPH / VEHICLE_CONFIG.MAX_SPEED_MPH;
      const torqueFalloff = 1 - speedRatio * 0.7;
      forceMultiplier = throttle * VEHICLE_CONFIG.ACCELERATION_FORCE * torqueFalloff;
    } else if (brake > 0.01) {
      // Brake force (opposite to motion)
      const brakeDir = forwardSpeed > 0 ? -1 : 1;
      forceMultiplier = brake * VEHICLE_CONFIG.BRAKE_FORCE * brakeDir;
    } else if (Math.abs(forwardSpeed) > 0.5) {
      // Engine braking
      const brakeDir = forwardSpeed > 0 ? -1 : 1;
      forceMultiplier = VEHICLE_CONFIG.ENGINE_BRAKE * brakeDir;
    }

    // Apply force
    if (Math.abs(forceMultiplier) > 0.01) {
      const force = forward.clone().multiplyScalar(forceMultiplier * VEHICLE_CONFIG.MASS * clampedDelta);
      rb.applyImpulse({ x: force.x, y: 0, z: force.z }, true);
    }

    // ─────────────────────────────────────────────────────
    // STEERING
    // ─────────────────────────────────────────────────────

    if (Math.abs(steering) > 0.01 && Math.abs(forwardSpeed) > 1) {
      const turnDirection = forwardSpeed > 0 ? -1 : 1;
      const speedFactor = Math.min(speedMPH / 20, 1);
      const angularVelocity = steering * VEHICLE_CONFIG.TURN_SPEED * turnDirection * speedFactor;

      rb.setAngvel({ x: 0, y: angularVelocity, z: 0 }, true);
    } else {
      // Dampen angular velocity
      const angvel = rb.angvel();
      rb.setAngvel({ x: angvel.x * 0.9, y: angvel.y * 0.9, z: angvel.z * 0.9 }, true);
    }

    // ─────────────────────────────────────────────────────
    // LATERAL FRICTION (prevent sliding)
    // ─────────────────────────────────────────────────────

    const right = new Vector3(1, 0, 0);
    right.applyQuaternion({
      x: rotation.x,
      y: rotation.y,
      z: rotation.z,
      w: rotation.w,
    } as any);

    const lateralSpeed = velocity.dot(right);
    const lateralDamping = right.clone().multiplyScalar(-lateralSpeed * VEHICLE_CONFIG.LATERAL_FRICTION);

    rb.setLinvel(
      {
        x: linvel.x + lateralDamping.x,
        y: linvel.y,
        z: linvel.z + lateralDamping.z,
      },
      true
    );

    // ─────────────────────────────────────────────────────
    // SPEED CLAMPING
    // ─────────────────────────────────────────────────────

    const maxSpeedMS = VEHICLE_CONFIG.MAX_SPEED_MPH * VEHICLE_CONFIG.MPH_TO_MS;
    const currentLinvel = rb.linvel();
    const currentSpeed = Math.sqrt(currentLinvel.x ** 2 + currentLinvel.z ** 2);

    if (currentSpeed > maxSpeedMS) {
      const scale = maxSpeedMS / currentSpeed;
      rb.setLinvel(
        {
          x: currentLinvel.x * scale,
          y: currentLinvel.y,
          z: currentLinvel.z * scale,
        },
        true
      );
    }

    // ─────────────────────────────────────────────────────
    // UPDATE STORE
    // ─────────────────────────────────────────────────────

    setVehiclePosition([position.x, position.y, position.z]);
    setVehicleRotation([rotation.x, rotation.y, rotation.z]);
    setVehicleVelocity(speedMPH);

    // Track distance
    const currentPos = new Vector3(position.x, position.y, position.z);
    const distanceMeters = currentPos.distanceTo(lastPosition.current);
    lastPosition.current.copy(currentPos);

    // Convert to miles (1 mile = 1609.34 meters)
    // For gameplay, we scale it up significantly
    const distanceMiles = distanceMeters * 0.01;
    accumulatedDistance.current += distanceMiles;

    // Batch distance updates
    if (accumulatedDistance.current >= 0.1) {
      addDistance(accumulatedDistance.current);
      accumulatedDistance.current = 0;
    }
  });

  // ─────────────────────────────────────────────────────────
  // RESET ON GAME START
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase === 'driving' && rigidBodyRef.current) {
      rigidBodyRef.current.setTranslation({ x: 0, y: 0.7, z: 0 }, true);
      rigidBodyRef.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      lastPosition.current.set(0, 0.7, 0);
    }
  }, [phase]);

  return (
    <RigidBody
      ref={rigidBodyRef}
      type="dynamic"
      position={[0, 0.7, 0]}
      colliders={false}
      mass={VEHICLE_CONFIG.MASS}
      linearDamping={0.5}
      angularDamping={2.0}
      enabledRotations={[false, true, false]}
    >
      <CuboidCollider
        args={[
          VEHICLE_CONFIG.WIDTH / 2,
          VEHICLE_CONFIG.HEIGHT / 2,
          VEHICLE_CONFIG.LENGTH / 2,
        ]}
        friction={0.8}
        restitution={0.1}
      />

      <group ref={meshRef}>
        <PlaceholderVehicle />
      </group>
    </RigidBody>
  );
}

// ═══════════════════════════════════════════════════════════
// PLACEHOLDER VEHICLE MESH
// ═══════════════════════════════════════════════════════════

function PlaceholderVehicle() {
  return (
    <group>
      {/* Main body */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[1.6, 0.6, 3.6]} />
        <meshStandardMaterial color="#ff00ff" metalness={0.3} roughness={0.7} />
      </mesh>

      {/* Cabin */}
      <mesh position={[0, 0.55, -0.2]}>
        <boxGeometry args={[1.4, 0.5, 1.8]} />
        <meshStandardMaterial color="#ff69b4" metalness={0.2} roughness={0.8} />
      </mesh>

      {/* Headlights */}
      <mesh position={[0.5, 0.1, -1.85]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshStandardMaterial color="#39ff14" emissive="#39ff14" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[-0.5, 0.1, -1.85]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshStandardMaterial color="#39ff14" emissive="#39ff14" emissiveIntensity={0.8} />
      </mesh>

      {/* Taillights */}
      <mesh position={[0.5, 0.1, 1.85]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[-0.5, 0.1, 1.85]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.5} />
      </mesh>

      {/* Wheels */}
      <Wheel position={[0.85, -0.3, -1.1]} />
      <Wheel position={[-0.85, -0.3, -1.1]} />
      <Wheel position={[0.85, -0.3, 1.1]} />
      <Wheel position={[-0.85, -0.3, 1.1]} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// WHEEL COMPONENT
// ═══════════════════════════════════════════════════════════

interface WheelProps {
  position: [number, number, number];
}

function Wheel({ position }: WheelProps) {
  return (
    <mesh position={position} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.35, 0.35, 0.25, 16]} />
      <meshStandardMaterial color="#1a1a1a" metalness={0.1} roughness={0.9} />
    </mesh>
  );
}

File 29: src/components/Road/RoadChunks.tsx
typescriptimport { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import { Vector3 } from 'three';
import { useGameStore } from '../../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const ROAD_CONFIG = {
  CHUNK_LENGTH: 100,
  CHUNK_WIDTH: 20,
  CHUNKS_AHEAD: 3,
  CHUNKS_BEHIND: 1,
  LANE_WIDTH: 3.5,
  LANE_COUNT: 3,
};

// ═══════════════════════════════════════════════════════════
// ROAD CHUNKS COMPONENT
// ═══════════════════════════════════════════════════════════

export function RoadChunks() {
  const playerZ = useGameStore((s) => s.vehicle.position[2]);
  const currentBiome = useGameStore((s) => s.game.currentBiome);
  const setBiome = useGameStore((s) => s.setBiome);
  const distanceTraveled = useGameStore((s) => s.game.distanceTraveled);

  // Calculate which chunks should be visible
  const chunks = useMemo(() => {
    const currentChunk = Math.floor(-playerZ / ROAD_CONFIG.CHUNK_LENGTH);
    const chunkList: number[] = [];

    for (let i = -ROAD_CONFIG.CHUNKS_BEHIND; i <= ROAD_CONFIG.CHUNKS_AHEAD; i++) {
      chunkList.push(currentChunk + i);
    }

    return chunkList;
  }, [Math.floor(-playerZ / ROAD_CONFIG.CHUNK_LENGTH)]);

  // Update biome based on distance
  useFrame(() => {
    let newBiome: 'city' | 'highway' | 'rural' = 'city';

    if (distanceTraveled > 2200) {
      newBiome = 'rural';
    } else if (distanceTraveled > 200) {
      newBiome = 'highway';
    }

    if (newBiome !== currentBiome) {
      setBiome(newBiome);
    }
  });

  return (
    <group>
      {chunks.map((chunkIndex) => (
        <RoadChunk
          key={chunkIndex}
          index={chunkIndex}
          biome={currentBiome}
        />
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// SINGLE ROAD CHUNK
// ═══════════════════════════════════════════════════════════

interface RoadChunkProps {
  index: number;
  biome: 'city' | 'highway' | 'rural';
}

function RoadChunk({ index, biome }: RoadChunkProps) {
  const zPosition = -index * ROAD_CONFIG.CHUNK_LENGTH - ROAD_CONFIG.CHUNK_LENGTH / 2;

  return (
    <group position={[0, 0, zPosition]}>
      {/* Road surface */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, -0.05, 0]} receiveShadow>
          <boxGeometry args={[ROAD_CONFIG.CHUNK_WIDTH, 0.1, ROAD_CONFIG.CHUNK_LENGTH]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </mesh>
      </RigidBody>

      {/* Road markings */}
      <RoadMarkings length={ROAD_CONFIG.CHUNK_LENGTH} />

      {/* Side decorations */}
      <RoadDecorations biome={biome} chunkIndex={index} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// ROAD MARKINGS
// ═══════════════════════════════════════════════════════════

interface RoadMarkingsProps {
  length: number;
}

function RoadMarkings({ length }: RoadMarkingsProps) {
  const dashCount = Math.floor(length / 8);

  return (
    <group position={[0, 0.01, 0]}>
      {/* Center dashed line */}
      {Array.from({ length: dashCount }).map((_, i) => (
        <mesh key={`center-${i}`} position={[0, 0, -length / 2 + i * 8 + 2]}>
          <boxGeometry args={[0.15, 0.02, 4]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}

      {/* Left edge line */}
      <mesh position={[-ROAD_CONFIG.CHUNK_WIDTH / 2 + 0.5, 0, 0]}>
        <boxGeometry args={[0.15, 0.02, length]} />
        <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={0.3} />
      </mesh>

      {/* Right edge line */}
      <mesh position={[ROAD_CONFIG.CHUNK_WIDTH / 2 - 0.5, 0, 0]}>
        <boxGeometry args={[0.15, 0.02, length]} />
        <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={0.3} />
      </mesh>

      {/* Lane dividers */}
      {Array.from({ length: dashCount }).map((_, i) => (
        <group key={`lanes-${i}`}>
          <mesh position={[-ROAD_CONFIG.LANE_WIDTH, 0, -length / 2 + i * 8 + 2]}>
            <boxGeometry args={[0.1, 0.02, 3]} />
            <meshStandardMaterial color="#888888" />
          </mesh>
          <mesh position={[ROAD_CONFIG.LANE_WIDTH, 0, -length / 2 + i * 8 + 2]}>
            <boxGeometry args={[0.1, 0.02, 3]} />
            <meshStandardMaterial color="#888888" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// ROAD DECORATIONS (biome-specific)
// ═══════════════════════════════════════════════════════════

interface RoadDecorationsProps {
  biome: 'city' | 'highway' | 'rural';
  chunkIndex: number;
}

function RoadDecorations({ biome, chunkIndex }: RoadDecorationsProps) {
  // Seeded random for consistent generation
  const seed = chunkIndex * 12345;
  const random = (offset: number) => {
    const x = Math.sin(seed + offset) * 10000;
    return x - Math.floor(x);
  };

  const decorations = useMemo(() => {
    const items: { position: [number, number, number]; type: string }[] = [];
    const count = biome === 'city' ? 6 : biome === 'highway' ? 4 : 8;

    for (let i = 0; i < count; i++) {
      const side = random(i) > 0.5 ? 1 : -1;
      const xOffset = (ROAD_CONFIG.CHUNK_WIDTH / 2 + 3 + random(i + 100) * 8) * side;
      const zOffset = (random(i + 200) - 0.5) * ROAD_CONFIG.CHUNK_LENGTH * 0.9;

      items.push({
        position: [xOffset, 0, zOffset],
        type: biome,
      });
    }

    return items;
  }, [biome, chunkIndex]);

  return (
    <group>
      {decorations.map((dec, i) => (
        <DecorationItem key={i} position={dec.position} type={dec.type} seed={seed + i} />
      ))}
    </group>
  );
}

// ═══════════════════════════════════════════════════════════
// DECORATION ITEM
// ═══════════════════════════════════════════════════════════

interface DecorationItemProps {
  position: [number, number, number];
  type: string;
  seed: number;
}

function DecorationItem({ position, type, seed }: DecorationItemProps) {
  const height = 2 + (Math.sin(seed) + 1) * 4;

  switch (type) {
    case 'city':
      // Building
      return (
        <mesh position={[position[0], height / 2, position[2]]}>
          <boxGeometry args={[4 + Math.sin(seed) * 2, height, 4 + Math.cos(seed) * 2]} />
          <meshStandardMaterial color="#2a2a4a" />
        </mesh>
      );

    case 'highway':
      // Guard rail / light pole
      return (
        <group position={position}>
          <mesh position={[0, 2, 0]}>
            <cylinderGeometry args={[0.1, 0.15, 4, 8]} />
            <meshStandardMaterial color="#666666" metalness={0.6} />
          </mesh>
          <mesh position={[0, 4.2, 0]}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshStandardMaterial color="#ffff88" emissive="#ffff44" emissiveIntensity={0.3} />
          </mesh>
        </group>
      );

    case 'rural':
      // Tree
      return (
        <group position={position}>
          <mesh position={[0, 1.5, 0]}>
            <cylinderGeometry args={[0.2, 0.3, 3, 8]} />
            <meshStandardMaterial color="#4a3728" />
          </mesh>
          <mesh position={[0, 4, 0]}>
            <coneGeometry args={[2, 4, 8]} />
            <meshStandardMaterial color="#2d5a27" />
          </mesh>
        </group>
      );

    default:
      return null;
  }
}

File 30: src/components/Camera/GameCamera.tsx
typescriptimport { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CAMERA_CONFIG = {
  OFFSET: new Vector3(0, 6, 12),
  LOOK_AHEAD: 8,
  POSITION_LERP: 0.08,
  LOOK_LERP: 0.1,
};

// ═══════════════════════════════════════════════════════════
// GAME CAMERA COMPONENT
// ═══════════════════════════════════════════════════════════

export function GameCamera() {
  const { camera } = useThree();
  const position = useGameStore((s) => s.vehicle.position);
  const rotation = useGameStore((s) => s.vehicle.rotation);
  const velocity = useGameStore((s) => s.vehicle.velocity);
  const phase = useGameStore((s) => s.game.phase);

  const targetPosition = useRef(new Vector3());
  const targetLookAt = useRef(new Vector3());
  const currentPosition = useRef(new Vector3(0, 6, 12));
  const currentLookAt = useRef(new Vector3(0, 0, 0));

  useFrame(() => {
    if (phase !== 'driving' && phase !== 'quiz') return;

    const vehiclePos = new Vector3(position[0], position[1], position[2]);

    // Calculate camera offset based on vehicle rotation
    const offset = CAMERA_CONFIG.OFFSET.clone();
    const yRotation = rotation[1];

    // Rotate offset around Y axis
    const cos = Math.cos(-yRotation);
    const sin = Math.sin(-yRotation);
    const rotatedOffset = new Vector3(
      offset.x * cos - offset.z * sin,
      offset.y,
      offset.x * sin + offset.z * cos
    );

    // Target camera position
    targetPosition.current.copy(vehiclePos).add(rotatedOffset);

    // Look ahead based on velocity
    const lookAheadDistance = CAMERA_CONFIG.LOOK_AHEAD * (velocity / 60);
    const forward = new Vector3(0, 0, -1);
    forward.applyAxisAngle(new Vector3(0, 1, 0), -yRotation);

    targetLookAt.current.copy(vehiclePos).add(forward.multiplyScalar(lookAheadDistance));
    targetLookAt.current.y += 1;

    // Smooth interpolation
    currentPosition.current.lerp(targetPosition.current, CAMERA_CONFIG.POSITION_LERP);
    currentLookAt.current.lerp(targetLookAt.current, CAMERA_CONFIG.LOOK_LERP);

    // Apply to camera
    camera.position.copy(currentPosition.current);
    camera.lookAt(currentLookAt.current);
  });

  return null;
}

File 31: src/components/Lighting/Lighting.tsx
typescriptimport { useGameStore } from '../../stores/gameStore';

// ═══════════════════════════════════════════════════════════
// BIOME LIGHTING PRESETS
// ═══════════════════════════════════════════════════════════

const LIGHTING_PRESETS = {
  city: {
    ambient: 0.4,
    directionalIntensity: 0.6,
    directionalColor: '#ffeedd',
    rimColor: '#ff00ff',
  },
  highway: {
    ambient: 0.5,
    directionalIntensity: 0.8,
    directionalColor: '#ffffee',
    rimColor: '#ffaa00',
  },
  rural: {
    ambient: 0.6,
    directionalIntensity: 1.0,
    directionalColor: '#ffffff',
    rimColor: '#88ff88',
  },
};

// ═══════════════════════════════════════════════════════════
// LIGHTING COMPONENT
// ═══════════════════════════════════════════════════════════

export function Lighting() {
  const currentBiome = useGameStore((s) => s.game.currentBiome);
  const preset = LIGHTING_PRESETS[currentBiome];

  return (
    <>
      {/* Ambient light */}
      <ambientLight intensity={preset.ambient} />

      {/* Main directional light (sun) */}
      <directionalLight
        position={[10, 20, 5]}
        intensity={preset.directionalIntensity}
        color={preset.directionalColor}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={100}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />

      {/* Fill light */}
      <directionalLight
        position={[-5, 10, -10]}
        intensity={0.2}
        color="#8888ff"
      />

      {/* Rim light (pink accent) */}
      <pointLight
        position={[0, 5, 15]}
        intensity={0.5}
        color={preset.rimColor}
        distance={30}
      />

      {/* Ground reflection */}
      <hemisphereLight
        intensity={0.3}
        color="#ffffff"
        groundColor="#ff00ff"
      />
    </>
  );
}

File 32: src/components/Environment/Skybox.tsx
typescriptimport { useMemo } from 'react';
import { BackSide, Color } from 'three';

// ═══════════════════════════════════════════════════════════
// BIOME SKY COLORS
// ═══════════════════════════════════════════════════════════

const SKY_COLORS = {
  city: {
    top: '#1a1a2e',
    bottom: '#4a4a6a',
  },
  highway: {
    top: '#2a2a4e',
    bottom: '#6a6a9a',
  },
  rural: {
    top: '#3a5a7a',
    bottom: '#8ac0e0',
  },
};

// ═══════════════════════════════════════════════════════════
// SKYBOX COMPONENT
// ═══════════════════════════════════════════════════════════

interface SkyboxProps {
  biome: 'city' | 'highway' | 'rural';
}

export function Skybox({ biome }: SkyboxProps) {
  const colors = SKY_COLORS[biome];

  return (
    <mesh scale={[-1, 1, 1]}>
      <sphereGeometry args={[500, 32, 32]} />
      <GradientMaterial topColor={colors.top} bottomColor={colors.bottom} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════
// GRADIENT MATERIAL
// ═══════════════════════════════════════════════════════════

interface GradientMaterialProps {
  topColor: string;
  bottomColor: string;
}

function GradientMaterial({ topColor, bottomColor }: GradientMaterialProps) {
  const shader = useMemo(() => ({
    uniforms: {
      topColor: { value: new Color(topColor) },
      bottomColor: { value: new Color(bottomColor) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float t = max(0.0, min(1.0, h * 0.5 + 0.5));
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `,
  }), [topColor, bottomColor]);

  return (
    <shaderMaterial
      attach="material"
      args={[shader]}
      side={BackSide}
    />
  );
}

File 33: src/Game.tsx (Main Game Component)
typescriptimport { Suspense, useEffect, useState, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';

// Store
import { useGameStore } from './stores/gameStore';

// Hooks
import { useTouchControls } from './hooks/useTouchControls';
import { useKeyboardControls } from './hooks/useKeyboardControls';

// 3D Components
import { Vehicle } from './components/Vehicle/Vehicle';
import { RoadChunks } from './components/Road/RoadChunks';
import { GameCamera } from './components/Camera/GameCamera';
import { Lighting } from './components/Lighting/Lighting';
import { Skybox } from './components/Environment/Skybox';

// UI Components
import { GameHUD } from './components/UI/GameHUD';
import { TouchOverlay } from './components/UI/TouchOverlay';
import { KeyboardOverlay } from './components/UI/KeyboardOverlay';
import { PauseMenu } from './components/UI/PauseMenu';
import { MainMenu } from './components/UI/MainMenu';
import { LoadingScreen } from './components/UI/LoadingScreen';
import { ControlsHelp } from './components/UI/ControlsHelp';

// Styles
import './styles/Game.css';

// ═══════════════════════════════════════════════════════════
// CANVAS CONFIGURATION
// ═══════════════════════════════════════════════════════════

const CANVAS_CONFIG = {
  dpr: [1, 1.5] as [number, number],
  gl: {
    antialias: false,
    powerPreference: 'high-performance' as const,
    stencil: false,
    depth: true,
  },
  shadows: true,
};

const PHYSICS_CONFIG = {
  gravity: [0, -9.81, 0] as [number, number, number],
  timeStep: 1 / 60,
};

// ═══════════════════════════════════════════════════════════
// MAIN GAME COMPONENT
// ═══════════════════════════════════════════════════════════

function Game() {
  // Store
  const phase = useGameStore((s) => s.game.phase);
  const setPhase = useGameStore((s) => s.setPhase);
  const currentBiome = useGameStore((s) => s.game.currentBiome);

  // Local state
  const [showControlsHelp, setShowControlsHelp] = useState(false);

  // Initialize controls
  useTouchControls();
  useKeyboardControls();

  // ─────────────────────────────────────────────────────────
  // PREVENT DEFAULT BEHAVIORS
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    const preventDefaults = (e: Event) => e.preventDefault();

    document.addEventListener('touchmove', preventDefaults, { passive: false });
    document.addEventListener('gesturestart', preventDefaults);
    document.addEventListener('gesturechange', preventDefaults);

    return () => {
      document.removeEventListener('touchmove', preventDefaults);
      document.removeEventListener('gesturestart', preventDefaults);
      document.removeEventListener('gesturechange', preventDefaults);
    };
  }, []);

  // ─────────────────────────────────────────────────────────
  // PAUSE HANDLER
  // ─────────────────────────────────────────────────────────

  const handlePause = useCallback(() => {
    if (phase === 'driving') {
      setPhase('paused');
    }
  }, [phase, setPhase]);

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <div className="game-container">
      {/* 3D Canvas */}
      <Canvas {...CANVAS_CONFIG}>
        <Suspense fallback={null}>
          <Physics {...PHYSICS_CONFIG}>
            {/* Environment */}
            <Lighting />
            <Skybox biome={currentBiome} />

            {/* Game Objects */}
            <RoadChunks />
            <Vehicle />

            {/* Camera */}
            <GameCamera />
          </Physics>
        </Suspense>
      </Canvas>

      {/* UI Layer */}
      <div className="ui-layer">
        {/* Main Menu */}
        {phase === 'menu' && (
          <MainMenu
            onShowHelp={() => setShowControlsHelp(true)}
          />
        )}

        {/* In-Game UI */}
        {phase === 'driving' && (
          <>
            <GameHUD />
            <TouchOverlay />
            <KeyboardOverlay />
            <PauseButton onPause={handlePause} />
          </>
        )}

        {/* Pause Menu */}
        {phase === 'paused' && <PauseMenu />}

        {/* Controls Help Modal */}
        {showControlsHelp && (
          <ControlsHelp onClose={() => setShowControlsHelp(false)} />
        )}

        {/* Loading Screen */}
        <LoadingScreen />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PAUSE BUTTON COMPONENT
// ═══════════════════════════════════════════════════════════

interface PauseButtonProps {
  onPause: () => void;
}

function PauseButton({ onPause }: PauseButtonProps) {
  return (
    <button className="pause-button" onClick={onPause} aria-label="Pause game">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    </button>
  );
}

export default Game;

That completes Part 5. You now have a working foundation:

✅ Config files
✅ Store
✅ UI Components (menus, HUD)
✅ Input Controls (touch + keyboard)
✅ 3D Components (vehicle, road, camera, lighting, skybox)
✅ Main Game component

To test:
bashnpm install
npm run dev
You should see the main menu. Click "New Game" and you'll be driving