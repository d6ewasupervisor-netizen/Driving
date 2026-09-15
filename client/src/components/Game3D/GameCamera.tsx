/**
 * GameCamera — Smooth follow camera with multiple view modes + screen shake
 * Cycle with C key: chase → birdseye → profile
 *
 * Chase mode: true chase cam — offset rotates with vehicle heading.
 * Bird's eye / profile: world-aligned offsets (don't rotate with car).
 * Screen shake: triggered by collisions, decays exponentially.
 */
import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, CameraMode } from '@/stores/gameStore';

// ─── Per-mode config ──────────────────────────────────────────────────────────
interface ModeConfig {
  offset: THREE.Vector3;   // local offset (rotated by heading for chase; world for others)
  lookAt: THREE.Vector3;   // local look-at offset
  lerpPos: number;
  lerpRot: number;
  followHeading: boolean;  // whether offset rotates with vehicle
}

const MODES: Record<CameraMode, ModeConfig> = {
  chase: {
    offset:  new THREE.Vector3(0, 2.6, 6.5),  // behind and above (closer in)
    lookAt:  new THREE.Vector3(0, 0.6, -8),    // look ahead of car
    lerpPos: 18.0,                              // tight follow — keeps up at top speed
    lerpRot: 14.0,
    followHeading: true,
  },
  birdseye: {
    offset:  new THREE.Vector3(0, 9, 3),
    lookAt:  new THREE.Vector3(0, 0, -3),
    lerpPos: 12.0,
    lerpRot: 10.0,
    followHeading: true,
  },
  profile: {
    offset:  new THREE.Vector3(10, 2.5, 0),
    lookAt:  new THREE.Vector3(0, 0.8, -3),
    lerpPos: 12.0,
    lerpRot: 10.0,
    followHeading: false,
  },
  // Quiet Roads: behind and above, pitched down so the stopping shadow reads on the road
  // while the block ahead stays visible. lookAt.z is extended with speed (see below).
  quiet: {
    offset:  new THREE.Vector3(0, 7.0, 9.0),
    lookAt:  new THREE.Vector3(0, 0.0, -8),
    lerpPos: 10.0,
    lerpRot: 9.0,
    followHeading: true,
  },
};
const QUIET_LOOKAHEAD_PER_MPH = 0.16; // metres of extra aim per mph
// On foot (Quiet Roads 1.3): fixed north-up, closer and steeper so the aisles read.
const WALK_OFFSET = new THREE.Vector3(0, 6.0, 5.5);
const WALK_LOOKAT = new THREE.Vector3(0, 0.4, -2.5);

// ─── Screen shake (module-level for easy triggering) ──────────────────────────
let _shakeIntensity = 0;
let _shakeDecay = 0;

/** Trigger screen shake. intensity: 0-1, duration in seconds */
export function triggerScreenShake(intensity = 0.5, duration = 0.3) {
  _shakeIntensity = Math.max(_shakeIntensity, intensity);
  _shakeDecay = intensity / duration;
}

// Reusable vectors
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _rotatedOffset = new THREE.Vector3();
const _shakeOffset = new THREE.Vector3();

const BASE_FOV = 75;
const MAX_FOV_BOOST = 9;

export function GameCamera() {
  const { camera } = useThree();
  const lookRef = useRef(new THREE.Vector3());

  // ── C key cycles camera mode ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') {
        useGameStore.getState().cycleCameraMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useFrame((_, delta) => {
    const state = useGameStore.getState();
    const walking = state.phase === 'walking';
    const [vx, vy, vz] = walking ? state.walkerPosition : state.vehiclePosition;
    const heading = walking ? 0 : state.vehicleHeading;
    const mode = walking
      ? { offset: WALK_OFFSET, lookAt: WALK_LOOKAT, lerpPos: 8, lerpRot: 8, followHeading: true }
      : MODES[state.cameraMode];
    const dt = Math.min(delta, 0.05);
    const speedNorm = Math.min(1, state.velocityMph / 70);

    if (mode.followHeading) {
      // Rotate offset and lookAt around Y by vehicle heading
      const cosH = Math.cos(heading);
      const sinH = Math.sin(heading);

      // Rotate offset
      _rotatedOffset.set(
        mode.offset.x * cosH + mode.offset.z * sinH,
        mode.offset.y,
        -mode.offset.x * sinH + mode.offset.z * cosH
      );
      _targetPos.set(vx + _rotatedOffset.x, vy + _rotatedOffset.y, vz + _rotatedOffset.z);

      // Rotate lookAt (quiet mode leads the aim with speed so faster = see farther)
      const lookZ = state.cameraMode === 'quiet'
        ? mode.lookAt.z - state.velocityMph * QUIET_LOOKAHEAD_PER_MPH
        : mode.lookAt.z;
      _rotatedOffset.set(
        mode.lookAt.x * cosH + lookZ * sinH,
        mode.lookAt.y,
        -mode.lookAt.x * sinH + lookZ * cosH
      );
      _targetLook.set(vx + _rotatedOffset.x, vy + _rotatedOffset.y, vz + _rotatedOffset.z);
    } else {
      _targetPos.set(vx + mode.offset.x, vy + mode.offset.y, vz + mode.offset.z);
      _targetLook.set(vx + mode.lookAt.x, vy + mode.lookAt.y, vz + mode.lookAt.z);
    }

    // ── Apply screen shake ────────────────────────────────────────────────
    if (_shakeIntensity > 0.001) {
      _shakeOffset.set(
        (Math.random() - 0.5) * 2 * _shakeIntensity,
        (Math.random() - 0.5) * 1.5 * _shakeIntensity,
        (Math.random() - 0.5) * 1.5 * _shakeIntensity,
      );
      _targetPos.add(_shakeOffset);

      // Decay shake
      _shakeIntensity = Math.max(0, _shakeIntensity - _shakeDecay * dt);
    }

    const posFactor = 1 - Math.exp(-mode.lerpPos * dt);
    const rotFactor = 1 - Math.exp(-mode.lerpRot * dt);
    camera.position.lerp(_targetPos, posFactor);
    lookRef.current.lerp(_targetLook, rotFactor);
    camera.lookAt(lookRef.current);

    // Speed-based FOV — subtle sense of velocity in chase mode
    if (camera instanceof THREE.PerspectiveCamera) {
      const fovBoost = state.cameraMode === 'chase' ? speedNorm * MAX_FOV_BOOST : speedNorm * 3;
      const targetFov = BASE_FOV + fovBoost;
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-4 * dt));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
