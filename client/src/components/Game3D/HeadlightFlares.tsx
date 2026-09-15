/**
 * HeadlightFlares — Lens flare effects for player headlights and NPC taillights.
 *
 * Active during sunset/night. Player flares track the Beetle's headlight positions;
 * NPC flares track the nearest cars ahead (red taillight glow).
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { LensFlare } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';
import { getNpcFlareSources } from './trafficFlareSources';

const VEHICLE_SCALE = 0.75;
const HEADLIGHT_LEFT = new THREE.Vector3(-0.55 * VEHICLE_SCALE, 0.45 * VEHICLE_SCALE, -2.1 * VEHICLE_SCALE);
const HEADLIGHT_RIGHT = new THREE.Vector3(0.55 * VEHICLE_SCALE, 0.45 * VEHICLE_SCALE, -2.1 * VEHICLE_SCALE);

function localHeadlightToWorld(
  local: THREE.Vector3,
  vehiclePos: [number, number, number],
  heading: number,
  out: THREE.Vector3
) {
  const cosH = Math.cos(heading);
  const sinH = Math.sin(heading);
  const rx = local.x * cosH + local.z * sinH;
  const rz = -local.x * sinH + local.z * cosH;
  out.set(vehiclePos[0] + rx, vehiclePos[1] + local.y, vehiclePos[2] + rz);
}

export function HeadlightFlares() {
  const timeOfDay = useGameStore((s) => s.timeOfDay);
  const phase = useGameStore((s) => s.phase);
  const active = phase === 'driving' && (timeOfDay === 'night' || timeOfDay === 'sunset');
  const isNight = timeOfDay === 'night';

  const leftPos = useRef(new THREE.Vector3());
  const rightPos = useRef(new THREE.Vector3());
  const npcPos0 = useRef(new THREE.Vector3(0, -500, 0));
  const npcPos1 = useRef(new THREE.Vector3(0, -500, 0));

  useFrame(() => {
    if (!active) return;

    const { vehiclePosition, vehicleHeading } = useGameStore.getState();
    localHeadlightToWorld(HEADLIGHT_LEFT, vehiclePosition, vehicleHeading, leftPos.current);
    localHeadlightToWorld(HEADLIGHT_RIGHT, vehiclePosition, vehicleHeading, rightPos.current);

    const npcSources = getNpcFlareSources();
    if (npcSources[0]?.strength > 0) {
      npcPos0.current.copy(npcSources[0].position);
    } else {
      npcPos0.current.set(0, -500, 0);
    }
    if (npcSources[1]?.strength > 0) {
      npcPos1.current.copy(npcSources[1].position);
    } else {
      npcPos1.current.set(0, -500, 0);
    }
  });

  if (!active) return null;

  const warmGain = new THREE.Color(isNight ? 22 : 14, isNight ? 18 : 12, isNight ? 12 : 8);
  const redGain = new THREE.Color(28, 8, 6);
  const playerGlare = isNight ? 0.35 : 0.22;

  return (
    <>
      <LensFlare
        lensPosition={leftPos.current}
        glareSize={playerGlare}
        flareSize={isNight ? 0.025 : 0.018}
        flareSpeed={0.4}
        starPoints={5}
        haloScale={0.4}
        animated
        anamorphic
        secondaryGhosts
        aditionalStreaks={false}
        starBurst={false}
        colorGain={warmGain}
        blendFunction={BlendFunction.ADD}
      />
      <LensFlare
        lensPosition={rightPos.current}
        glareSize={playerGlare * 0.9}
        flareSize={isNight ? 0.02 : 0.015}
        flareSpeed={0.35}
        starPoints={5}
        haloScale={0.35}
        animated
        anamorphic
        secondaryGhosts={false}
        aditionalStreaks={false}
        starBurst={false}
        colorGain={warmGain}
        blendFunction={BlendFunction.ADD}
      />
      <LensFlare
        lensPosition={npcPos0.current}
        glareSize={0.22}
        flareSize={0.015}
        flareSpeed={0.15}
        starPoints={4}
        haloScale={0.25}
        animated={false}
        anamorphic
        secondaryGhosts={false}
        aditionalStreaks={false}
        starBurst={false}
        colorGain={redGain}
        blendFunction={BlendFunction.ADD}
      />
      <LensFlare
        lensPosition={npcPos1.current}
        glareSize={0.18}
        flareSize={0.012}
        flareSpeed={0.12}
        starPoints={4}
        haloScale={0.2}
        animated={false}
        anamorphic
        secondaryGhosts={false}
        aditionalStreaks={false}
        starBurst={false}
        colorGain={redGain}
        blendFunction={BlendFunction.ADD}
      />
    </>
  );
}
