/**
 * TrafficRenderer — NPC vehicles using Kenney car GLBs.
 * Each NPC is a cloned GLB scene driven by TrafficManager state.
 */
import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';
import { NpcState, NPC_COUNT, initNpcs, updateNpcsPositions } from '@/systems/TrafficManager';

// Pool of NPC car models — Kenney cars face +Z, so rotate Math.PI to face -Z
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

// Preload all NPC models
NPC_MODELS.forEach((m) => useGLTF.preload(m));

// One NPC car: reads its slot in npcsRef and updates its group transform
function NpcCar({
  modelPath,
  npcRef,
}: {
  modelPath: string;
  npcRef: React.MutableRefObject<NpcState>;
}) {
  const { scene } = useGLTF(modelPath);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = groupRef.current;
    const npc = npcRef.current;
    if (!g || !npc.active) { if (g) g.visible = false; return; }
    g.position.set(npc.x, 0.0, npc.z);
    g.visible = true;
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive
        object={scene.clone(true)}
        scale={1}
        rotation={[0, Math.PI, 0]}
        castShadow
      />
    </group>
  );
}

export function TrafficRenderer({ lowEnd, onNpcsRef }: {
  lowEnd?: boolean;
  onNpcsRef?: (ref: React.MutableRefObject<NpcState[]>) => void;
}) {
  const npcCount = lowEnd ? 4 : NPC_COUNT;
  const npcsRef = useRef<NpcState[]>([]);
  // Per-npc mutable refs so NpcCar can read without re-render
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
    if (phase !== 'driving') return;
    updateNpcsPositions(npcsRef.current, vehiclePosition[2], delta);
    // Sync slot refs
    npcsRef.current.forEach((npc, i) => {
      if (npcSlotRefs.current[i]) npcSlotRefs.current[i].current = npc;
    });
  });

  return (
    <>
      {Array.from({ length: npcCount }, (_, i) => (
        <NpcCar
          key={i}
          modelPath={NPC_MODELS[i % NPC_MODELS.length]}
          npcRef={npcSlotRefs.current[i]}
        />
      ))}
    </>
  );
}
