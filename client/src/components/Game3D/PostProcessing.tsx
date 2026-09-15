/**
 * PostProcessing — Bloom, vignette, speed-based effects, and weather color grading
 *
 * Uses @react-three/postprocessing for clean R3F integration.
 * - Bloom: subtle glow on emissives, intensity scales with speed
 * - Vignette: edge darkening, stronger at night
 * - ChromaticAberration: subtle at high speed for velocity feel
 * - BrightnessContrast + HueSaturation: time-of-day and weather mood
 * - Noise: rain-on-windshield grain during storms
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  BrightnessContrast,
  HueSaturation,
  Noise,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';
import { getWeather } from './Skybox';
import { HeadlightFlares } from './HeadlightFlares';

export function PostProcessing({ lowEnd }: { lowEnd?: boolean }) {
  const bloomRef = useRef<any>(null);
  const vignetteRef = useRef<any>(null);
  const chromaRef = useRef<any>(null);
  const brightnessRef = useRef<any>(null);
  const hueSatRef = useRef<any>(null);
  const noiseRef = useRef<any>(null);

  useFrame(() => {
    const { velocityMph, timeOfDay, mileage } = useGameStore.getState();
    const weather = getWeather(mileage);
    const speedNorm = Math.min(1, velocityMph / 70);

    // Dynamic bloom — brighter at speed
    if (bloomRef.current) {
      bloomRef.current.intensity = 0.2 + speedNorm * 0.5;
    }

    // Vignette — stronger at night/sunset
    if (vignetteRef.current) {
      const base = timeOfDay === 'night' ? 0.55 : timeOfDay === 'sunset' ? 0.45 : 0.3;
      vignetteRef.current.darkness = base + speedNorm * 0.1;
    }

    // Chromatic aberration — subtle at high speed
    if (chromaRef.current && !lowEnd) {
      const offset = speedNorm > 0.6 ? (speedNorm - 0.6) * 0.003 : 0;
      chromaRef.current.offset = new THREE.Vector2(offset, offset);
    }

    // Weather / time color grading
    if (brightnessRef.current) {
      let brightness = 0;
      let contrast = 0;
      if (timeOfDay === 'night') {
        brightness = -0.06;
        contrast = 0.12;
      } else if (timeOfDay === 'sunset') {
        brightness = 0.02;
        contrast = 0.08;
      }
      if (weather === 'rain') {
        brightness -= 0.08;
        contrast += 0.1;
      } else if (weather === 'overcast') {
        brightness -= 0.03;
        contrast += 0.05;
      }
      brightnessRef.current.brightness = brightness;
      brightnessRef.current.contrast = contrast;
    }

    if (hueSatRef.current) {
      let hue = 0;
      let saturation = 0;
      if (timeOfDay === 'sunset') {
        hue = 0.04;
        saturation = 0.08;
      } else if (timeOfDay === 'night') {
        hue = -0.02;
        saturation = -0.25;
      }
      if (weather === 'rain') {
        hue -= 0.02;
        saturation -= 0.18;
      }
      hueSatRef.current.hue = hue;
      hueSatRef.current.saturation = saturation;
    }

    // Rain noise — windshield static
    if (noiseRef.current) {
      noiseRef.current.opacity = weather === 'rain' ? 0.08 : 0;
    }
  });

  if (lowEnd) {
    return (
      <EffectComposer multisampling={0}>
        <Vignette
          ref={vignetteRef}
          offset={0.3}
          darkness={0.35}
          blendFunction={BlendFunction.NORMAL}
        />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={4}>
      <Bloom
        ref={bloomRef}
        intensity={0.3}
        luminanceThreshold={0.8}
        luminanceSmoothing={0.4}
        mipmapBlur
      />
      <BrightnessContrast ref={brightnessRef} brightness={0} contrast={0} />
      <HueSaturation ref={hueSatRef} hue={0} saturation={0} />
      <Vignette
        ref={vignetteRef}
        offset={0.3}
        darkness={0.4}
        blendFunction={BlendFunction.NORMAL}
      />
      <ChromaticAberration
        ref={chromaRef}
        offset={new THREE.Vector2(0, 0)}
        radialModulation
        modulationOffset={0.5}
        blendFunction={BlendFunction.NORMAL}
      />
      <Noise
        ref={noiseRef}
        opacity={0}
        blendFunction={BlendFunction.OVERLAY}
      />
      <HeadlightFlares />
    </EffectComposer>
  );
}
