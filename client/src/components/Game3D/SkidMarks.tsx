/**
 * SkidMarks — Dark tire marks left on the road when drifting/braking hard
 *
 * Uses a ring buffer of instanced flat quads that stick to the road surface.
 * Marks fade over time and are recycled when the buffer wraps.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';
import { getSlipState } from '@/systems/VehicleController';

const MAX_MARKS = 300;
const MARK_LIFETIME = 8; // seconds before fade-out
const EMIT_INTERVAL = 0.03; // seconds between marks when slipping

// Rear wheel offsets in world space (we'll compute from vehicle pos + heading)
const REAR_LEFT_LOCAL = new THREE.Vector3(-0.9, 0, 1.5);
const REAR_RIGHT_LOCAL = new THREE.Vector3(0.9, 0, 1.5);

interface SkidMark {
  age: number;
  active: boolean;
}

const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _headingQuat = new THREE.Quaternion();
const _flatQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _pos = new THREE.Vector3();
const _color = new THREE.Color();

export function SkidMarks() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const nextIdx = useRef(0);
  const emitTimer = useRef(0);

  const marks = useMemo<SkidMark[]>(() => {
    return Array.from({ length: MAX_MARKS }, () => ({
      age: MARK_LIFETIME + 1, // start expired
      active: false,
    }));
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { vehiclePosition, vehicleHeading, phase } = useGameStore.getState();
    const slip = getSlipState();
    const dt = Math.min(delta, 0.05);

    // ── Emit new marks when slipping ──────────────────────────────────────
    emitTimer.current += dt;
    if (phase === 'driving' && slip.slipAmount > 0.2 && emitTimer.current > EMIT_INTERVAL) {
      emitTimer.current = 0;

      const cosH = Math.cos(vehicleHeading);
      const sinH = Math.sin(vehicleHeading);

      // Place marks at both rear wheel positions
      for (const localPos of [REAR_LEFT_LOCAL, REAR_RIGHT_LOCAL]) {
        // Rotate local offset by heading
        const wx = vehiclePosition[0] + localPos.x * cosH + localPos.z * sinH;
        const wz = vehiclePosition[2] - localPos.x * sinH + localPos.z * cosH;

        const idx = nextIdx.current;
        marks[idx].age = 0;
        marks[idx].active = true;

        _headingQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), vehicleHeading);
        _quat.copy(_headingQuat).multiply(_flatQuat);
        _pos.set(wx, 0.015, wz);
        _mat.compose(_pos, _quat, new THREE.Vector3(0.25, 0.6, 1));
        mesh.setMatrixAt(idx, _mat);

        nextIdx.current = (nextIdx.current + 1) % MAX_MARKS;
      }
    }

    // ── Age and fade all marks ────────────────────────────────────────────
    for (let i = 0; i < MAX_MARKS; i++) {
      const mark = marks[i];
      if (!mark.active) {
        _mat.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _mat);
        continue;
      }

      mark.age += dt;
      if (mark.age > MARK_LIFETIME) {
        mark.active = false;
        _mat.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _mat);
        continue;
      }

      // Fade: full opacity → transparent over lifetime
      const fade = 1 - mark.age / MARK_LIFETIME;
      const brightness = 0.05 + fade * 0.1; // dark rubber marks
      _color.setRGB(brightness, brightness, brightness);
      mesh.setColorAt(i, _color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_MARKS]}
      frustumCulled={false}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        color="#111111"
        transparent
        opacity={0.7}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}
