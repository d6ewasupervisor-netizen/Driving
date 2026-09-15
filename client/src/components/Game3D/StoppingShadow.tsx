/**
 * StoppingShadow — where the car would stop if the brake went down right now.
 * Reaction distance (lighter) + braking distance (darker), with an end bar.
 * Length comes from the sim frame; drawn flat on the road ahead of the car.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';
import { useQRStore } from '@/stores/qrStore';
import { reactionDistanceM, VEHICLE } from '@/quietroads';
import { getCurrentSpeedMs } from '@/systems/VehicleController';

const FRONT_OFFSET = 2.1; // metres from car centre to the plow tip

export function StoppingShadow() {
  const group = useRef<THREE.Group>(null);
  const react = useRef<THREE.Mesh>(null);
  const brake = useRef<THREE.Mesh>(null);
  const bar = useRef<THREE.Mesh>(null);
  const reactMat = useRef<THREE.MeshBasicMaterial>(null);
  const brakeMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(() => {
    const g = group.current; if (!g) return;
    const st = useGameStore.getState();
    const f = useQRStore.getState().frame;
    const total = f?.stoppingM ?? 0;
    const visible = st.worldMode === 'kent' && total > 0.5;
    g.visible = visible;
    if (!visible) return;
    const [x, , z] = st.vehiclePosition;
    g.position.set(x, 0.03, z);
    g.rotation.set(0, st.vehicleHeading, 0);
    const rd = Math.min(total, reactionDistanceM(getCurrentSpeedMs()));
    const bd = Math.max(0, total - rd);
    const w = VEHICLE.WIDTH_M * 0.9;
    if (react.current) { react.current.scale.set(w, 1, Math.max(rd, 0.01)); react.current.position.z = -(FRONT_OFFSET + rd / 2); }
    if (brake.current) { brake.current.scale.set(w, 1, Math.max(bd, 0.01)); brake.current.position.z = -(FRONT_OFFSET + rd + bd / 2); }
    if (bar.current) bar.current.position.z = -(FRONT_OFFSET + total);
    const skid = f?.skidding ?? false;
    if (reactMat.current) { reactMat.current.color.set(skid ? '#f2735a' : '#d9d9e6'); reactMat.current.opacity = skid ? 0.3 : 0.16; }
    if (brakeMat.current) { brakeMat.current.color.set(skid ? '#f2735a' : '#bfc2cc'); brakeMat.current.opacity = skid ? 0.4 : 0.26; }
  });

  return (
    <group ref={group}>
      <mesh ref={react} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={reactMat} transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh ref={brake} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={brakeMat} transparent opacity={0.26} depthWrite={false} />
      </mesh>
      <mesh ref={bar} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[VEHICLE.WIDTH_M * 1.1, 0.25]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </group>
  );
}
