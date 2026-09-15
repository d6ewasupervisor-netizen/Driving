/**
 * QuietSwarm — all 48 of the Quiet as two InstancedMeshes (body + head), coloured
 * by awareness state, positioned from QuietRoads.sim.quiet.list every frame.
 * Two draw calls total. Swap for a skinned GLB later; the sim doesn't care.
 */
import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { QuietRoads } from '@/systems/QuietRoadsBridge';
import { QUIET_COLORS } from './KentWorld';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

export function QuietSwarm() {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const headRef = useRef<THREE.InstancedMesh>(null);
  const count = QuietRoads.sim.quiet.list.length;
  const colorArr = useMemo(() => new Float32Array(count * 3), [count]);
  const lastState = useRef<number[]>(new Array(count).fill(-1));

  useFrame((state) => {
    const body = bodyRef.current, head = headRef.current;
    if (!body || !head) return;
    const t = state.clock.elapsedTime;
    const list = QuietRoads.sim.quiet.list;
    let colorDirty = false;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      // core heading 0 = +X toward +Z; face the body along it (box is symmetric, so a sway sells motion)
      const sway = z.state >= 2 ? Math.sin(t * 6 + i) * 0.08 : Math.sin(t * 0.7 + i) * 0.02;
      _q.setFromAxisAngle(_up, -z.facing);
      _p.set(z.pos.x, 0.85, z.pos.y);
      _s.set(1, 1, 1);
      _m.compose(_p, _q, _s);
      _m.multiply(new THREE.Matrix4().makeRotationZ(sway));
      body.setMatrixAt(i, _m);
      _p.set(z.pos.x, 1.75, z.pos.y);
      _m.compose(_p, _q, _s);
      head.setMatrixAt(i, _m);
      if (lastState.current[i] !== z.state) {
        lastState.current[i] = z.state;
        const c = QUIET_COLORS[z.state];
        colorArr[i * 3] = c.r; colorArr[i * 3 + 1] = c.g; colorArr[i * 3 + 2] = c.b;
        colorDirty = true;
      }
    }
    body.instanceMatrix.needsUpdate = true;
    head.instanceMatrix.needsUpdate = true;
    if (colorDirty) {
      body.instanceColor!.needsUpdate = true;
      head.instanceColor!.needsUpdate = true;
    }
  });

  const instanceColor = useMemo(() => new THREE.InstancedBufferAttribute(colorArr, 3), [colorArr]);

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} castShadow frustumCulled={false}>
        <boxGeometry args={[0.55, 1.5, 0.35]} />
        <meshStandardMaterial roughness={0.9} />
        <primitive object={instanceColor} attach="instanceColor" />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, count]} castShadow frustumCulled={false}>
        <sphereGeometry args={[0.2, 8, 6]} />
        <meshStandardMaterial roughness={0.9} />
        <primitive object={instanceColor.clone()} attach="instanceColor" />
      </instancedMesh>
    </group>
  );
}
