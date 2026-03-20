/**
 * Lighting — Biome + time-of-day responsive lighting
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, TimeOfDay } from '@/stores/gameStore';

const DAY_AMBIENT = 0.6;
const NIGHT_AMBIENT = 0.08;
const SUNSET_AMBIENT = 0.25;

const DAY_SUN_INTENSITY = 2.0;
const NIGHT_SUN_INTENSITY = 0.0;
const SUNSET_SUN_INTENSITY = 0.8;

function intensityFor(tod: TimeOfDay, day: number, sunset: number, night: number) {
  if (tod === 'day') return day;
  if (tod === 'sunset') return sunset;
  return night;
}

export function Lighting() {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const frameCount = useRef(0);

  useFrame(() => {
    // Only update every 30 frames (lighting changes slowly)
    frameCount.current++;
    if (frameCount.current % 30 !== 0) return;

    const tod = useGameStore.getState().timeOfDay;

    if (ambientRef.current) {
      ambientRef.current.intensity = intensityFor(tod, DAY_AMBIENT, SUNSET_AMBIENT, NIGHT_AMBIENT);
    }
    if (dirRef.current) {
      dirRef.current.intensity = intensityFor(tod, DAY_SUN_INTENSITY, SUNSET_SUN_INTENSITY, NIGHT_SUN_INTENSITY);

      // Color shift at sunset
      if (tod === 'sunset') {
        dirRef.current.color.set('#ff9966');
      } else {
        dirRef.current.color.set('#ffffff');
      }
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={DAY_AMBIENT} />
      <directionalLight
        ref={dirRef}
        position={[10, 30, 10]}
        intensity={DAY_SUN_INTENSITY}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={200}
        shadow-camera-near={0.5}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      {/* Subtle fill light */}
      <hemisphereLight args={['#88aaff', '#224400', 0.3]} />
    </>
  );
}
