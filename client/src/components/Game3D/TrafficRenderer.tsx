/**
 * TrafficRenderer — NPC vehicles using Kenney car GLBs.
 * Each NPC is a cloned GLB with wheel spin, lane-change steering, and emissive lights.
 */
import { useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';
import { NpcState, NPC_COUNT, initNpcs, updateNpcsPositions } from '@/systems/TrafficManager';
import {
  tintNpcBody,
  applyNpcHeadTailLights,
  npcColorForIndex,
} from './npcCarUtils';
import {
  buildWheelRigs,
  attachWheelHubsToAnchor,
  updateWheelRigs,
  type WheelRig,
} from './wheelRig';
import { setNpcFlareSources } from './trafficFlareSources';

const NPC_MODELS = [
  '/models/cars/sedan-sports.glb',
  '/models/cars/suv.glb',
  '/models/cars/truck.glb',
  '/models/cars/taxi.glb',
  '/models/cars/police.glb',
  '/models/cars/van.glb',
  '/models/cars/hatchback-sports.glb',
  '/models/cars/sedan.glb',
];

const NPC_SCALE = 1.4;
const WHEEL_RADIUS = 0.35 * NPC_SCALE;
const TAILLIGHT_Z_OFFSET = 1.85 * NPC_SCALE;

NPC_MODELS.forEach((m) => useGLTF.preload(m));

function NpcCar({
  modelPath,
  npcRef,
  colorIndex,
}: {
  modelPath: string;
  npcRef: React.MutableRefObject<NpcState>;
  colorIndex: number;
}) {
  const { scene, animations } = useGLTF(modelPath);
  const groupRef = useRef<THREE.Group>(null);
  const wheelsAnchorRef = useRef<THREE.Group>(null);
  const wheelRigsRef = useRef<WheelRig[]>([]);
  const flashPhase = useRef(Math.random() * Math.PI * 2);
  const isPolice = modelPath.includes('police');
  const isTaxi = modelPath.includes('taxi');

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    tintNpcBody(clone, npcColorForIndex(colorIndex));
    return clone;
  }, [scene, colorIndex]);

  const { actions, mixer } = useAnimations(animations, groupRef);

  useEffect(() => {
    wheelRigsRef.current = buildWheelRigs(clonedScene);
  }, [clonedScene]);

  useLayoutEffect(() => {
    if (!wheelsAnchorRef.current || wheelRigsRef.current.length === 0) return;
    attachWheelHubsToAnchor(wheelRigsRef.current, wheelsAnchorRef.current);
  }, [clonedScene]);

  useEffect(() => {
    if (animations.length === 0) return;
    const action = Object.values(actions)[0];
    if (action) {
      action.reset().fadeIn(0.2).play();
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    return () => {
      action?.fadeOut(0.2);
    };
  }, [actions, animations]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    const npc = npcRef.current;
    if (!g || !npc.active) {
      if (g) g.visible = false;
      return;
    }

    const dt = Math.min(delta, 0.05);
    g.position.set(npc.x, 0.0, npc.z);

    const laneDelta = npc.targetLaneIndex - npc.laneIndex;
    const steerYaw =
      npc.laneChangeT < 1 ? laneDelta * 0.12 * (1 - npc.laneChangeT) : 0;
    g.rotation.set(0, Math.PI + steerYaw, 0);
    g.visible = true;

    const spinRate = WHEEL_RADIUS > 0 ? npc.speedMs / WHEEL_RADIUS : 0;
    updateWheelRigs(wheelRigsRef.current, spinRate, dt, steerYaw * 0.6, 8);

    if (mixer) mixer.update(dt);

    flashPhase.current += dt * (isPolice ? 10 : 4);
    const policeFlash = isPolice ? (Math.sin(flashPhase.current) > 0 ? 1 : 0) : 0;
    const taxiFlash = isTaxi ? 0.5 + 0.5 * Math.sin(flashPhase.current) : 0;

    const timeOfDay = useGameStore.getState().timeOfDay;
    const lightsOn = timeOfDay === 'night' || timeOfDay === 'sunset';

    applyNpcHeadTailLights(clonedScene, {
      headlightIntensity: lightsOn ? 1.8 : 0.3,
      taillightIntensity: lightsOn ? 1.4 : 0.5,
      policeFlash,
      taxiFlash,
      isPolice,
      isTaxi,
    });
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive object={clonedScene} scale={NPC_SCALE} castShadow />
      <group ref={wheelsAnchorRef} scale={NPC_SCALE} />
    </group>
  );
}

function updateNpcFlareSources(npcs: NpcState[], playerZ: number) {
  const ahead = npcs
    .filter((n) => n.active && playerZ - n.z > 2 && playerZ - n.z < 90)
    .sort((a, b) => a.z - b.z)
    .slice(0, 2);

  setNpcFlareSources(
    ahead.map((npc) => {
      const dist = playerZ - npc.z;
      const strength = THREE.MathUtils.clamp(1 - (dist - 5) / 85, 0.15, 1);
      return {
        x: npc.x,
        y: 0.55 * NPC_SCALE,
        z: npc.z + TAILLIGHT_Z_OFFSET,
        strength,
      };
    })
  );
}

export function TrafficRenderer({
  lowEnd,
  onNpcsRef,
}: {
  lowEnd?: boolean;
  onNpcsRef?: (ref: React.MutableRefObject<NpcState[]>) => void;
}) {
  const npcCount = lowEnd ? 4 : NPC_COUNT;
  const npcsRef = useRef<NpcState[]>([]);
  const npcSlotRefs = useRef<React.MutableRefObject<NpcState>[]>(
    Array.from({ length: npcCount }, () => ({ current: {} as NpcState }))
  );

  const vehiclePosition = useGameStore((s) => s.vehiclePosition);
  const phase = useGameStore((s) => s.phase);
  const resetCounter = useGameStore((s) => s.resetCounter);

  useEffect(() => {
    npcsRef.current = initNpcs(vehiclePosition[2], lowEnd);
    npcsRef.current.forEach((npc, i) => {
      if (npcSlotRefs.current[i]) npcSlotRefs.current[i].current = npc;
    });
    onNpcsRef?.(npcsRef);
  }, [resetCounter]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    if (phase !== 'driving') {
      setNpcFlareSources([]);
      return;
    }
    updateNpcsPositions(npcsRef.current, vehiclePosition[2], delta);
    npcsRef.current.forEach((npc, i) => {
      if (npcSlotRefs.current[i]) npcSlotRefs.current[i].current = npc;
    });
    updateNpcFlareSources(npcsRef.current, vehiclePosition[2]);
  });

  return (
    <>
      {Array.from({ length: npcCount }, (_, i) => (
        <NpcCar
          key={i}
          modelPath={NPC_MODELS[i % NPC_MODELS.length]}
          npcRef={npcSlotRefs.current[i]}
          colorIndex={i}
        />
      ))}
    </>
  );
}
