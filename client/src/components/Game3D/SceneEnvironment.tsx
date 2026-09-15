/**
 * SceneEnvironment — Image-based lighting for PBR materials (car body, chrome, wet road).
 *
 * Uses Three.js PMREM + RoomEnvironment so reflections work without external HDR assets.
 * Intensity tracks time-of-day and weather.
 */
import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { useGameStore } from '@/stores/gameStore';
import { getWeather } from './Skybox';

export function SceneEnvironment({ lowEnd }: { lowEnd?: boolean }) {
  const { scene, gl } = useThree();

  useEffect(() => {
    if (lowEnd) return;

    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const previousEnv = scene.environment;

    scene.environment = envMap;

    return () => {
      scene.environment = previousEnv;
      envMap.dispose();
      pmrem.dispose();
    };
  }, [scene, gl, lowEnd]);

  useFrame(() => {
    if (lowEnd) return;

    const { timeOfDay, mileage } = useGameStore.getState();
    const weather = getWeather(mileage);

    let target = 0.45;
    if (timeOfDay === 'night') target = 0.12;
    else if (timeOfDay === 'sunset') target = 0.32;
    if (weather === 'rain') target *= 0.75;
    else if (weather === 'overcast') target *= 0.9;

    const current = scene.environmentIntensity ?? 0.45;
    scene.environmentIntensity = THREE.MathUtils.lerp(current, target, 0.05);
  });

  return null;
}
