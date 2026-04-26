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
    offset:  new THREE.Vector3(0, 3.2, 8),   // behind and above
    lookAt:  new THREE.Vector3(0, 0.8, -12),  // look ahead of car
    lerpPos: 8.0,                              // exponential rate (per second)
    lerpRot: 10.0,
    followHeading: true,
  },
  birdseye: {
    offset:  new THREE.Vector3(0, 10, 3),     // ~10m up
    lookAt:  new THREE.Vector3(0, 0, -3),
    lerpPos: 6.0,
    lerpRot: 8.0,
    followHeading: true,
  },
  profile: {
    offset:  new THREE.Vector3(12, 3, 0),
    lookAt:  new THREE.Vector3(0, 1, -4),
    lerpPos: 7.0,
    lerpRot: 8.0,
    followHeading: false,
  },
};

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
    const [vx, vy, vz] = state.vehiclePosition;
    const heading = state.vehicleHeading;
    const mode = MODES[state.cameraMode];
    const dt = Math.min(delta, 0.05);

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

      // Rotate lookAt
      _rotatedOffset.set(
        mode.lookAt.x * cosH + mode.lookAt.z * sinH,
        mode.lookAt.y,
        -mode.lookAt.x * sinH + mode.lookAt.z * cosH
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
  });

  return null;
}
