/**
 * Skybox — Gradient sphere that changes with time of day
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, TimeOfDay } from '@/stores/gameStore';

const SKY_COLORS: Record<TimeOfDay, string> = {
  day: '#4488ff',
  sunset: '#ff7700',
  night: '#0a0a1a',
};

export function Skybox() {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const frameCount = useRef(0);

  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % 60 !== 0) return; // update once per second
    if (!matRef.current) return;
    const tod = useGameStore.getState().timeOfDay;
    matRef.current.color.set(SKY_COLORS[tod]);
  });

  return (
    <mesh ref={meshRef} renderOrder={-1}>
      <sphereGeometry args={[450, 16, 12]} />
      <meshBasicMaterial
        ref={matRef}
        color={SKY_COLORS['day']}
        side={THREE.BackSide}
      />
    </mesh>
  );
}
