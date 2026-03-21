/**
 * RoadChunks — Renders pooled road chunks with Kenney GLB assets.
 * Vehicle travels in -Z direction.
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useGameStore, Biome } from '@/stores/gameStore';
import { ChunkData, CHUNK_LENGTH, initChunks, updateChunks } from '@/systems/RoadChunkManager';
import { registerRoadZombies, RoadZombie } from './CollisionSystem';

// ─── Preload all assets used in chunks ────────────────────────────────────────
useGLTF.preload('/models/road/road-straight.glb');
useGLTF.preload('/models/road/light-curved.glb');
useGLTF.preload('/models/road/construction-cone.glb');
useGLTF.preload('/models/road/sign-highway.glb');
useGLTF.preload('/models/road/construction-barrier.glb');
useGLTF.preload('/models/buildings/building-type-a.glb');
useGLTF.preload('/models/buildings/building-type-b.glb');
useGLTF.preload('/models/buildings/building-type-c.glb');
useGLTF.preload('/models/buildings/building-type-d.glb');
useGLTF.preload('/models/buildings/building-type-e.glb');
useGLTF.preload('/models/buildings/building-sample-tower-a.glb');
useGLTF.preload('/models/buildings/building-sample-tower-b.glb');
useGLTF.preload('/models/zombies/walking_zombie.glb');
useGLTF.preload('/models/nature/low_poly_cactus.glb');

// Kenney road-straight tile is 1×1 unit (X: -0.5→0.5, Z: -0.5→0.5, Y≈0.02 top).
// Scale X×8 for 8m road width, Z×4 so each tile covers 4m along Z.
const ROAD_TILE_SCALE_X = 8;  // 1 * 8 = 8m wide (3 lanes)
const ROAD_TILE_SCALE_Z = 4;  // 1 * 4 = 4m per tile along Z
const ROAD_TILE_LENGTH = 4;   // scaled tile covers 4 world-units along Z
const TILES_PER_CHUNK = Math.ceil(CHUNK_LENGTH / ROAD_TILE_LENGTH); // 50 tiles

// ─── Road surface using tiled GLB ────────────────────────────────────────────
function RoadSurface() {
  const { scene } = useGLTF('/models/road/road-straight.glb');
  const tilePositions = useMemo(() => {
    const positions: number[] = [];
    for (let i = 0; i < TILES_PER_CHUNK; i++) {
      positions.push(-(CHUNK_LENGTH / 2) + i * ROAD_TILE_LENGTH + ROAD_TILE_LENGTH / 2);
    }
    return positions;
  }, []);

  return (
    <>
      {tilePositions.map((z, i) => (
        <primitive
          key={i}
          object={scene.clone(true)}
          position={[0, 0, z]}
          scale={[ROAD_TILE_SCALE_X, 1, ROAD_TILE_SCALE_Z]}
          receiveShadow
        />
      ))}
    </>
  );
}

// ─── City decorations — Kenney suburban buildings + streetlights + zombies ────
const CITY_BUILDING_MODELS = [
  '/models/buildings/building-type-a.glb',
  '/models/buildings/building-type-b.glb',
  '/models/buildings/building-type-c.glb',
  '/models/buildings/building-type-d.glb',
  '/models/buildings/building-type-e.glb',
  '/models/buildings/building-sample-tower-a.glb',
  '/models/buildings/building-sample-tower-b.glb',
];

function CityBuilding({ modelPath, position, rotation }: {
  modelPath: string;
  position: [number, number, number];
  rotation?: number;
}) {
  const { scene } = useGLTF(modelPath);
  return (
    <primitive
      object={scene.clone(true)}
      position={position}
      rotation={[0, rotation ?? 0, 0]}
      scale={5.0}
      castShadow
    />
  );
}

function StreetLight({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/road/light-curved.glb');
  return (
    <primitive
      object={scene.clone(true)}
      position={position}
      scale={4.4}
      castShadow
    />
  );
}

function ZombieDecor({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/zombies/walking_zombie.glb');
  return (
    <primitive
      object={scene.clone(true)}
      position={position}
      scale={0.01}
    />
  );
}

function CityDecorations({ lowEnd }: { lowEnd?: boolean }) {
  // Deterministic layout seeded per-chunk (same positions every time this chunk renders)
  const layout = useMemo(() => {
    const items: Array<{
      type: 'building' | 'light' | 'zombie';
      x: number; z: number;
      modelIdx?: number;
      rot?: number;
    }> = [];
    // 4 buildings per side
    for (let i = 0; i < 4; i++) {
      const z = -75 + i * 40;
      items.push({ type: 'building', x: -10, z, modelIdx: i % CITY_BUILDING_MODELS.length, rot: Math.PI / 2 });
      items.push({ type: 'building', x:  10, z, modelIdx: (i + 2) % CITY_BUILDING_MODELS.length, rot: -Math.PI / 2 });
    }
    // Streetlights every 40m
    for (let i = 0; i < 5; i++) {
      const z = -80 + i * 40;
      items.push({ type: 'light', x: -5.5, z });
      items.push({ type: 'light', x:  5.5, z });
    }
    // Zombies on sidewalks (skip on low-end)
    if (!lowEnd) {
      items.push({ type: 'zombie', x: -6, z: -60 });
      items.push({ type: 'zombie', x:  7, z: -20 });
      items.push({ type: 'zombie', x: -7, z:  40 });
    }
    return items;
  }, [lowEnd]);

  return (
    <>
      {layout.map((item, i) => {
        if (item.type === 'building' && item.modelIdx !== undefined) {
          return (
            <CityBuilding
              key={i}
              modelPath={CITY_BUILDING_MODELS[item.modelIdx]}
              position={[item.x, 0, item.z]}
              rotation={item.rot}
            />
          );
        }
        if (item.type === 'light') {
          return <StreetLight key={i} position={[item.x, 0, item.z]} />;
        }
        if (item.type === 'zombie') {
          return <ZombieDecor key={i} position={[item.x, 0, item.z]} />;
        }
        return null;
      })}
    </>
  );
}

// ─── Road Zombies — hittable zombies that wander on/near the road ─────────────
const MAX_ROAD_ZOMBIES = 20;
const ZOMBIE_SPAWN_AHEAD = 200;
const ZOMBIE_DESPAWN_BEHIND = 40;

// Module-level zombie pool
const roadZombiePool: RoadZombie[] = [];
let nextZombieZ = -80;

function initRoadZombiePool() {
  if (roadZombiePool.length > 0) return;
  for (let i = 0; i < MAX_ROAD_ZOMBIES; i++) {
    roadZombiePool.push({
      position: new THREE.Vector3(0, -100, 0),
      active: false,
      hit: false,
    });
  }
  registerRoadZombies(roadZombiePool);
}

// Seeded random for deterministic placement
function zombieSeeded(seed: number): number {
  const x = Math.sin(seed * 9.123 + seed * 41.789) * 31415.9265;
  return x - Math.floor(x);
}

function RoadZombieInstance({ zombie }: { zombie: RoadZombie }) {
  const { scene } = useGLTF('/models/zombies/walking_zombie.glb');
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    if (zombie.active && !zombie.hit) {
      g.visible = true;
      g.position.copy(zombie.position);
    } else {
      g.visible = false;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      <primitive
        object={scene.clone(true)}
        scale={0.01}
        rotation={[0, Math.random() * Math.PI * 2, 0]}
      />
    </group>
  );
}

function RoadZombies({ lowEnd }: { lowEnd?: boolean }) {
  const count = lowEnd ? 8 : MAX_ROAD_ZOMBIES;

  useEffect(() => {
    initRoadZombiePool();
  }, []);

  useFrame(() => {
    const { vehiclePosition, phase, currentBiome } = useGameStore.getState();
    if (phase !== 'driving') return;
    const playerZ = vehiclePosition[2];

    // Spawn zombies ahead (city biome gets more, others still some)
    const spacing = currentBiome === 'city' ? 30 : 60;
    while (nextZombieZ > playerZ - ZOMBIE_SPAWN_AHEAD) {
      const slot = roadZombiePool.find((z) => !z.active && !z.hit);
      if (!slot) break;

      const seed = Math.round(nextZombieZ * 5.67);
      // Place on or near road — X range -4 to 4
      const x = (zombieSeeded(seed) - 0.5) * 8;
      slot.position.set(x, 0, nextZombieZ);
      slot.active = true;
      slot.hit = false;

      nextZombieZ -= spacing + zombieSeeded(seed + 1) * 20;
    }

    // Recycle zombies behind player
    for (const zombie of roadZombiePool) {
      if (zombie.active && zombie.position.z > playerZ + ZOMBIE_DESPAWN_BEHIND) {
        zombie.active = false;
        zombie.hit = false;
      }
    }
  });

  return (
    <>
      {roadZombiePool.slice(0, count).map((zombie, i) => (
        <RoadZombieInstance key={i} zombie={zombie} />
      ))}
    </>
  );
}

// ─── Highway decorations — barriers, cones, sign ─────────────────────────────
function BarrierModel({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/road/construction-barrier.glb');
  return <primitive object={scene.clone(true)} position={position} castShadow />;
}

function ConeModel({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/road/construction-cone.glb');
  return <primitive object={scene.clone(true)} position={position} />;
}

function SignModel({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/road/sign-highway.glb');
  return <primitive object={scene.clone(true)} position={position} scale={1.5} />;
}

function HighwayDecorations() {
  const layout = useMemo(() => {
    const barriers: [number, number, number][] = [];
    const cones: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) {
      barriers.push([-5, 0, -80 + i * 20]);
      barriers.push([ 5, 0, -80 + i * 20]);
    }
    for (let i = 0; i < 5; i++) {
      cones.push([2, 0, -70 + i * 30]);
    }
    return { barriers, cones };
  }, []);

  return (
    <>
      {layout.barriers.map((pos, i) => <BarrierModel key={`b${i}`} position={pos} />)}
      {layout.cones.map((pos, i) => <ConeModel key={`c${i}`} position={pos} />)}
      <SignModel position={[7, 0, -80]} />
    </>
  );
}

// ─── Rural decorations — procedural trees + cactus hint ──────────────────────
function CactusModel({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/nature/low_poly_cactus.glb');
  return <primitive object={scene.clone(true)} position={position} scale={2} castShadow />;
}

function RuralDecorations() {
  const trees = useMemo(() => {
    const t: Array<{ x: number; z: number; green: string }> = [];
    const greens = ['#2d6a4f', '#40916c'];
    for (let i = 0; i < 10; i++) {
      t.push({ x: -(9 + (i % 3) * 2), z: (i - 5) * 18, green: greens[i % 2] });
      t.push({ x:  (9 + (i % 3) * 2), z: (i - 5) * 18, green: greens[(i + 1) % 2] });
    }
    return t;
  }, []);

  return (
    <>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]}>
          <mesh position={[0, 1, 0]}>
            <cylinderGeometry args={[0.2, 0.25, 2, 6]} />
            <meshStandardMaterial color="#5c3d2e" />
          </mesh>
          <mesh position={[0, 3, 0]}>
            <coneGeometry args={[1.2, 3, 7]} />
            <meshStandardMaterial color={t.green} />
          </mesh>
        </group>
      ))}
      {/* Cacti scattered */}
      <CactusModel position={[-12, 0, -60]} />
      <CactusModel position={[ 14, 0,  20]} />
      <CactusModel position={[-10, 0,  70]} />
    </>
  );
}

// ─── Chunk geometry ───────────────────────────────────────────────────────────
interface ChunkGeomProps {
  biome: Biome;
  lowEnd?: boolean;
}

function ChunkGeom({ biome, lowEnd }: ChunkGeomProps) {
  return (
    <group>
      {/* Ground/terrain plane underneath everything */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[100, 0.5, CHUNK_LENGTH]} />
        <meshStandardMaterial color="#4a7c3c" roughness={0.9} />
      </mesh>

      {/* Road surface — kenney tiles */}
      <RoadSurface />

      {/* Curbs - lowered to realistic height */}
      <mesh position={[-4.2, 0.04, 0]}>
        <boxGeometry args={[0.2, 0.04, CHUNK_LENGTH]} />
        <meshStandardMaterial color="#888899" />
      </mesh>
      <mesh position={[4.2, 0.04, 0]}>
        <boxGeometry args={[0.2, 0.04, CHUNK_LENGTH]} />
        <meshStandardMaterial color="#888899" />
      </mesh>

      {/* Sidewalks - reduced height */}
      <mesh position={[-5.3, 0.03, 0]}>
        <boxGeometry args={[1.6, 0.03, CHUNK_LENGTH]} />
        <meshStandardMaterial color="#999aaa" />
      </mesh>
      <mesh position={[5.3, 0.03, 0]}>
        <boxGeometry args={[1.6, 0.03, CHUNK_LENGTH]} />
        <meshStandardMaterial color="#999aaa" />
      </mesh>

      {/* Biome decorations */}
      {biome === 'city' && <CityDecorations lowEnd={lowEnd} />}
      {biome === 'highway' && <HighwayDecorations />}
      {biome === 'rural' && <RuralDecorations />}
    </group>
  );
}

// ─── Chunk list ───────────────────────────────────────────────────────────────
export function RoadChunks({ lowEnd }: { lowEnd?: boolean }) {
  const [chunks, setChunks] = useState<ChunkData[]>(() => initChunks());
  const frameRef = useRef(0);

  const vehiclePosition = useGameStore((s) => s.vehiclePosition);
  const currentBiome = useGameStore((s) => s.currentBiome);

  useFrame(() => {
    // Update chunk positions every 10 frames (save CPU)
    frameRef.current++;
    if (frameRef.current % 10 === 0) {
      setChunks((prev) => updateChunks(prev, vehiclePosition[2], currentBiome));
    }
  });

  return (
    <>
      <RoadZombies lowEnd={lowEnd} />
      {chunks.map((chunk) => (
        <RigidBody
          key={`${chunk.id}-${chunk.gen}`}
          type="fixed"
          position={[0, 0, chunk.zPosition]}
          colliders={false}
        >
          {/* Road surface collider - thin slab */}
          <CuboidCollider
            args={[6, 0.05, CHUNK_LENGTH / 2]}
            position={[0, -0.05, 0]}
            friction={0.9}
            restitution={0.0}
          />
          {/* Terrain/ground plane - large area to catch off-road vehicles */}
          <CuboidCollider
            args={[50, 0.5, CHUNK_LENGTH / 2]}
            position={[0, -1, 0]}
            friction={0.7}
            restitution={0.0}
          />
          {/* Curb colliders - prevent flying off road */}
          <CuboidCollider
            args={[0.15, 0.08, CHUNK_LENGTH / 2]}
            position={[-4.2, 0.04, 0]}
            friction={0.8}
            restitution={0.1}
          />
          <CuboidCollider
            args={[0.15, 0.08, CHUNK_LENGTH / 2]}
            position={[4.2, 0.04, 0]}
            friction={0.8}
            restitution={0.1}
          />
          <ChunkGeom biome={chunk.biome} lowEnd={lowEnd} />
        </RigidBody>
      ))}
    </>
  );
}
