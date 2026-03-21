/**
 * Lighting — Biome + time-of-day + weather responsive lighting
 *
 * Adjusts ambient, directional (sun), and hemisphere lights based on
 * time of day and weather. Smooth interpolation prevents jarring transitions.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore, TimeOfDay } from '@/stores/gameStore';

// ─── Weather detection (same logic as Skybox) ─────────────────────────────────
type WeatherType = 'clear' | 'overcast' | 'rain';

const WEATHER_CYCLE_MILES = 150;
function getWeather(mileage: number): WeatherType {
  const cycle = Math.floor(mileage / WEATHER_CYCLE_MILES);
  const pattern: WeatherType[] = ['clear', 'clear', 'overcast', 'rain', 'clear', 'overcast'];
  return pattern[cycle % pattern.length];
}

// ─── Intensity presets ────────────────────────────────────────────────────────
interface LightPreset {
  ambient: number;
  sun: number;
  sunColor: string;
  hemiSkyColor: string;
  hemiGroundColor: string;
  hemiIntensity: number;
}

const PRESETS: Record<TimeOfDay, Record<WeatherType, LightPreset>> = {
  day: {
    clear:    { ambient: 0.6,  sun: 2.0, sunColor: '#ffffff', hemiSkyColor: '#88aaff', hemiGroundColor: '#224400', hemiIntensity: 0.3 },
    overcast: { ambient: 0.45, sun: 0.8, sunColor: '#ddddee', hemiSkyColor: '#778899', hemiGroundColor: '#334422', hemiIntensity: 0.2 },
    rain:     { ambient: 0.3,  sun: 0.3, sunColor: '#aabbcc', hemiSkyColor: '#556677', hemiGroundColor: '#223311', hemiIntensity: 0.15 },
  },
  sunset: {
    clear:    { ambient: 0.25, sun: 0.8, sunColor: '#ff9966', hemiSkyColor: '#ff8844', hemiGroundColor: '#331100', hemiIntensity: 0.2 },
    overcast: { ambient: 0.18, sun: 0.4, sunColor: '#cc7755', hemiSkyColor: '#886655', hemiGroundColor: '#221100', hemiIntensity: 0.15 },
    rain:     { ambient: 0.12, sun: 0.15, sunColor: '#997766', hemiSkyColor: '#554433', hemiGroundColor: '#110800', hemiIntensity: 0.1 },
  },
  night: {
    clear:    { ambient: 0.08, sun: 0.0, sunColor: '#ffffff', hemiSkyColor: '#112244', hemiGroundColor: '#000000', hemiIntensity: 0.05 },
    overcast: { ambient: 0.05, sun: 0.0, sunColor: '#ffffff', hemiSkyColor: '#080812', hemiGroundColor: '#000000', hemiIntensity: 0.03 },
    rain:     { ambient: 0.03, sun: 0.0, sunColor: '#ffffff', hemiSkyColor: '#060610', hemiGroundColor: '#000000', hemiIntensity: 0.02 },
  },
};

// ─── Lerp helpers ─────────────────────────────────────────────────────────────
const _c2 = new THREE.Color();

function lerpColor(current: THREE.Color, target: string, t: number) {
  _c2.set(target);
  current.lerp(_c2, t);
}

export function Lighting() {
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const frameCount = useRef(0);

  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % 15 !== 0) return; // update ~4x/sec

    const state = useGameStore.getState();
    const tod = state.timeOfDay;
    const weather = getWeather(state.mileage);
    const preset = PRESETS[tod][weather];
    const t = 0.08; // smooth interpolation speed

    if (ambientRef.current) {
      ambientRef.current.intensity = THREE.MathUtils.lerp(
        ambientRef.current.intensity, preset.ambient, t
      );
    }

    if (dirRef.current) {
      dirRef.current.intensity = THREE.MathUtils.lerp(
        dirRef.current.intensity, preset.sun, t
      );
      lerpColor(dirRef.current.color, preset.sunColor, t);

      // Move shadow camera to follow player
      const [px, , pz] = state.vehiclePosition;
      dirRef.current.position.set(px + 10, 30, pz + 10);
      dirRef.current.target.position.set(px, 0, pz);
      dirRef.current.target.updateMatrixWorld();
    }

    if (hemiRef.current) {
      hemiRef.current.intensity = THREE.MathUtils.lerp(
        hemiRef.current.intensity, preset.hemiIntensity, t
      );
      lerpColor(hemiRef.current.color, preset.hemiSkyColor, t);
      lerpColor(hemiRef.current.groundColor, preset.hemiGroundColor, t);
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.6} />
      <directionalLight
        ref={dirRef}
        position={[10, 30, 10]}
        intensity={2.0}
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
      <hemisphereLight ref={hemiRef} args={['#88aaff', '#224400', 0.3]} />
    </>
  );
}
