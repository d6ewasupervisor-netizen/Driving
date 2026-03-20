/**
 * GameCamera — Smooth follow camera with multiple view modes
 * Cycle with C key: chase → birdseye → profile
 *
 * Chase mode: true chase cam — offset rotates with vehicle heading.
 * Bird's eye / profile: world-aligned offsets (don't rotate with car).
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
    lerpPos: 0.06,
    lerpRot: 0.10,
    followHeading: true,
  },
  birdseye: {
    offset:  new THREE.Vector3(0, 10, 3),     // ~10m up (was 30)
    lookAt:  new THREE.Vector3(0, 0, -3),
    lerpPos: 0.08,
    lerpRot: 0.12,
    followHeading: true,
  },
  profile: {
    offset:  new THREE.Vector3(12, 3, 0),
    lookAt:  new THREE.Vector3(0, 1, -4),
    lerpPos: 0.07,
    lerpRot: 0.10,
    followHeading: false,
  },
};

// Reusable vectors
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _rotatedOffset = new THREE.Vector3();

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

  useFrame(() => {
    const state = useGameStore.getState();
    const [vx, vy, vz] = state.vehiclePosition;
    const heading = state.vehicleHeading;
    const mode = MODES[state.cameraMode];

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

    camera.position.lerp(_targetPos, mode.lerpPos);
    lookRef.current.lerp(_targetLook, mode.lerpRot);
    camera.lookAt(lookRef.current);
  });

  return null;
}
