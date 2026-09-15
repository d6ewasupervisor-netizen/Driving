/**
 * Skybox — Procedural sky with time-of-day transitions + weather effects
 *
 * Uses drei's Sky (Preetham model) for physically-based sky rendering.
 * Adds procedural fog and rain particle effects.
 */
import { useRef, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore, TimeOfDay } from '@/stores/gameStore';
import { setRoadSurfaceWetness } from './proceduralKenneyTextures';

// ─── Sun position presets ─────────────────────────────────────────────────────
const SUN_POSITIONS: Record<TimeOfDay, [number, number, number]> = {
  day:    [100, 60, -50],
  sunset: [100, 5, -20],
  night:  [100, -10, -50],
};

const SKY_TURBIDITY: Record<TimeOfDay, number> = {
  day: 3,
  sunset: 10,
  night: 20,
};

const SKY_RAYLEIGH: Record<TimeOfDay, number> = {
  day: 1.5,
  sunset: 4,
  night: 0.1,
};

// ─── Weather states ───────────────────────────────────────────────────────────
export type WeatherType = 'clear' | 'overcast' | 'rain';

const WEATHER_CYCLE_MILES = 150; // weather changes every ~150 miles

export function getWeather(mileage: number): WeatherType {
  // Deterministic weather pattern based on mileage
  const cycle = Math.floor(mileage / WEATHER_CYCLE_MILES);
  const pattern: WeatherType[] = ['clear', 'clear', 'overcast', 'rain', 'clear', 'overcast'];
  return pattern[cycle % pattern.length];
}

// ─── Fog colors ───────────────────────────────────────────────────────────────
const FOG_COLORS: Record<TimeOfDay, Record<WeatherType, string>> = {
  day:    { clear: '#88bbff', overcast: '#99aabb', rain: '#667788' },
  sunset: { clear: '#ff8844', overcast: '#886655', rain: '#554433' },
  night:  { clear: '#0a0a1a', overcast: '#080812', rain: '#060610' },
};

const FOG_DENSITY: Record<WeatherType, number> = {
  clear: 0.0008,
  overcast: 0.0020,
  rain: 0.0035,
};

// ─── Rain particles ───────────────────────────────────────────────────────────
const RAIN_COUNT = 800;
const RAIN_AREA = 60;   // XZ spread
const RAIN_HEIGHT = 30;  // Y range

function RainEffect() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const offsets = useMemo(() => {
    const arr = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * RAIN_AREA;
      arr[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
      arr[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
    }
    return arr;
  }, []);

  const _mat = useMemo(() => new THREE.Matrix4(), []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { vehiclePosition } = useGameStore.getState();
    const dt = Math.min(delta, 0.05);

    for (let i = 0; i < RAIN_COUNT; i++) {
      // Fall speed
      offsets[i * 3 + 1] -= 25 * dt; // fast rain

      // Reset when below ground
      if (offsets[i * 3 + 1] < -1) {
        offsets[i * 3] = (Math.random() - 0.5) * RAIN_AREA;
        offsets[i * 3 + 1] = RAIN_HEIGHT + Math.random() * 5;
        offsets[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
      }

      _mat.makeScale(0.02, 0.4, 0.02); // thin streaks
      _mat.setPosition(
        vehiclePosition[0] + offsets[i * 3],
        offsets[i * 3 + 1],
        vehiclePosition[2] + offsets[i * 3 + 2],
      );
      mesh.setMatrixAt(i, _mat);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, RAIN_COUNT]} frustumCulled={false}>
      <cylinderGeometry args={[0.5, 0.5, 1, 3]} />
      <meshBasicMaterial color="#aaccee" transparent opacity={0.3} />
    </instancedMesh>
  );
}

// ─── Stars (night sky) ────────────────────────────────────────────────────────
function Stars() {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(500 * 3);
    for (let i = 0; i < 500; i++) {
      // Distribute on upper hemisphere shell
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.45; // upper hemisphere only
      const r = 400 + Math.random() * 40;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  useFrame(() => {
    if (!pointsRef.current) return;
    const tod = useGameStore.getState().timeOfDay;
    // Only visible at night
    pointsRef.current.visible = tod === 'night';
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial color="#ffffff" size={1.2} sizeAttenuation={false} transparent opacity={0.8} />
    </points>
  );
}

// ─── Main Skybox ──────────────────────────────────────────────────────────────
export function Skybox() {
  const { scene } = useThree();
  const sunRef = useRef(SUN_POSITIONS.day);
  const turbidityRef = useRef(SKY_TURBIDITY.day);
  const rayleighRef = useRef(SKY_RAYLEIGH.day);
  const [weather, setWeather] = useState<WeatherType>('clear');
  const wetnessRef = useRef(0);
  const skyRef = useRef<any>(null);
  const frameCount = useRef(0);

  // Smooth interpolation targets
  const targetSun = useRef(new THREE.Vector3(...SUN_POSITIONS.day));
  const currentSun = useRef(new THREE.Vector3(...SUN_POSITIONS.day));

  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % 30 !== 0) return; // update every ~0.5s

    const state = useGameStore.getState();
    const tod = state.timeOfDay;
    const currentWeather = getWeather(state.mileage);
    setWeather((prev) => (prev === currentWeather ? prev : currentWeather));

    const targetWetness = currentWeather === 'rain' ? 1 : currentWeather === 'overcast' ? 0.35 : 0;
    wetnessRef.current = THREE.MathUtils.lerp(wetnessRef.current, targetWetness, 0.06);
    setRoadSurfaceWetness(wetnessRef.current);

    // Update sun target
    const [sx, sy, sz] = SUN_POSITIONS[tod];
    targetSun.current.set(sx, sy, sz);

    // Smooth interpolation
    currentSun.current.lerp(targetSun.current, 0.05);
    sunRef.current = [currentSun.current.x, currentSun.current.y, currentSun.current.z];
    turbidityRef.current = THREE.MathUtils.lerp(turbidityRef.current, SKY_TURBIDITY[tod], 0.05);
    rayleighRef.current = THREE.MathUtils.lerp(rayleighRef.current, SKY_RAYLEIGH[tod], 0.05);

    // Update fog
    const fogColor = FOG_COLORS[tod][currentWeather];
    const fogDensity = FOG_DENSITY[currentWeather];
    if (!scene.fog) {
      scene.fog = new THREE.FogExp2(fogColor, fogDensity);
    } else {
      (scene.fog as THREE.FogExp2).color.set(fogColor);
      (scene.fog as THREE.FogExp2).density = THREE.MathUtils.lerp(
        (scene.fog as THREE.FogExp2).density,
        fogDensity,
        0.05
      );
    }

    // Also set scene background to match fog for seamless blending
    if (!scene.background || !(scene.background as THREE.Color).isColor) {
      scene.background = new THREE.Color(fogColor);
    } else {
      (scene.background as THREE.Color).set(fogColor);
    }
  });

  return (
    <>
      <Sky
        ref={skyRef}
        distance={450000}
        sunPosition={sunRef.current}
        turbidity={turbidityRef.current}
        rayleigh={rayleighRef.current}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />
      <Stars />
      {weather === 'rain' && <RainEffect />}
    </>
  );
}
