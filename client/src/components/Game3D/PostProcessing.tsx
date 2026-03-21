/**
 * PostProcessing — Bloom, vignette, and speed-based effects
 *
 * Uses @react-three/postprocessing for clean R3F integration.
 * - Bloom: subtle glow on emissives, intensity scales with speed
 * - Vignette: edge darkening, stronger at night
 * - ChromaticAberration: subtle at high speed for velocity feel
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';

export function PostProcessing({ lowEnd }: { lowEnd?: boolean }) {
  const bloomRef = useRef<any>(null);
  const vignetteRef = useRef<any>(null);
  const chromaRef = useRef<any>(null);

  useFrame(() => {
    const { velocityMph, timeOfDay } = useGameStore.getState();
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
  });

  if (lowEnd) {
    // Minimal effects for low-end devices
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
    </EffectComposer>
  );
}
