/**
 * RoadChunks — Renders pooled road chunks with Kenney GLB assets.
 * Vehicle travels in -Z direction.
 */
import { useMemo, useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore, Biome } from '@/stores/gameStore';
import { ChunkData, CHUNK_LENGTH, initChunks, updateChunks } from '@/systems/RoadChunkManager';
import {
  getBuildingColormapTexture,
  getSharedRoadMaterial,
} from './proceduralKenneyTextures';

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
useGLTF.preload('/models/nature/low_poly_cactus.glb');
useGLTF.preload('/models/buildings/building-sample-house-a.glb');
useGLTF.preload('/models/road/road-straight-barrier.glb');

// Kenney road-straight tile is 1×1 unit (X: -0.5→0.5, Z: -0.5→0.5, Y≈0.02 top).
// Scale X×8 for 8m road width, Z×4 so each tile covers 4m along Z.
const ROAD_TILE_SCALE_X = 8;  // 1 * 8 = 8m wide (3 lanes)
const ROAD_TILE_SCALE_Z = 4;  // 1 * 4 = 4m per tile along Z
const ROAD_TILE_LENGTH = 4;   // scaled tile covers 4 world-units along Z
const TILES_PER_CHUNK = Math.ceil(CHUNK_LENGTH / ROAD_TILE_LENGTH); // 50 tiles

// ─── Road surface using tiled GLB + procedural colormap (bundled GLBs miss Textures/colormap.png)
function RoadTileInstance({
  baseScene,
  material,
  z,
}: {
  baseScene: THREE.Object3D;
  material: THREE.MeshStandardMaterial;
  z: number;
}) {
  const object = useMemo(() => {
    const root = baseScene.clone(true);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = material;
    });
    return root;
  }, [baseScene, material]);

  return (
    <primitive
      object={object}
      position={[0, 0, z]}
      scale={[ROAD_TILE_SCALE_X, 1, ROAD_TILE_SCALE_Z]}
      receiveShadow
    />
  );
}

function RoadSurface() {
  const { scene } = useGLTF('/models/road/road-straight.glb');
  const roadMaterial = useMemo(() => getSharedRoadMaterial(scene), [scene]);
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
        <RoadTileInstance key={i} baseScene={scene} material={roadMaterial} z={z} />
      ))}
    </>
  );
}

// ─── City decorations — Kenney suburban buildings + streetlights ──────────
const CITY_BUILDING_MODELS = [
  '/models/buildings/building-type-a.glb',
  '/models/buildings/building-type-b.glb',
  '/models/buildings/building-type-c.glb',
  '/models/buildings/building-type-d.glb',
  '/models/buildings/building-type-e.glb',
  '/models/buildings/building-sample-tower-a.glb',
  '/models/buildings/building-sample-tower-b.glb',
  '/models/buildings/building-sample-house-a.glb',
];

// Seeded random for deterministic decoration variation
function decorSeed(seed: number): number {
  const x = Math.sin(seed * 12.989 + seed * 78.233) * 43758.545;
  return x - Math.floor(x);
}

function CityBuilding({ modelPath, position, rotation }: {
  modelPath: string;
  position: [number, number, number];
  rotation?: number;
}) {
  const { scene } = useGLTF(modelPath);
  const colormap = useMemo(
    () => getBuildingColormapTexture(modelPath, position[0], position[2]),
    [modelPath, position[0], position[2]]
  );
  const object = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
      if (src instanceof THREE.MeshStandardMaterial) {
        const m = src.clone();
        m.map = colormap;
        m.color.setHex(0xffffff);
        m.roughness = 0.88;
        m.metalness = 0.06;
        m.needsUpdate = true;
        obj.material = m;
      }
    });
    return root;
  }, [scene, colormap]);

  return (
    <>
      <primitive
        object={object}
        position={position}
        rotation={[0, rotation ?? 0, 0]}
        scale={5.0}
        castShadow
      />
      <CuboidCollider
        args={[2.5, 6, 2.5]}
        position={[position[0], 6, position[2]]}
        restitution={0.15}
      />
    </>
  );
}

function StreetLight({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/road/light-curved.glb');
  return (
    <>
      <primitive
        object={scene.clone(true)}
        position={position}
        scale={[4.4, 8.8, 4.4]}
        castShadow
      />
      <CuboidCollider
        args={[0.15, 4, 0.15]}
        position={[position[0], 4, position[2]]}
        restitution={0.1}
      />
    </>
  );
}

// Procedural props — no GLB needed
function FireHydrant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.1, 0.12, 0.5, 8]} />
        <meshStandardMaterial color="#cc2222" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.1, 8, 6]} />
        <meshStandardMaterial color="#cc2222" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Dumpster({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={[position[0], 0.5, position[2]]}>
      <boxGeometry args={[1.2, 1.0, 0.8]} />
      <meshStandardMaterial color="#336633" roughness={0.8} metalness={0.2} />
    </mesh>
  );
}

function Bench({ position, rotation }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation ?? 0, 0]}>
      {/* Seat */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.8, 0.05, 0.3]} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
      {/* Legs */}
      {[-0.35, 0.35].map((x, i) => (
        <mesh key={i} position={[x, 0.15, 0]}>
          <boxGeometry args={[0.04, 0.3, 0.25]} />
          <meshStandardMaterial color="#555555" metalness={0.5} />
        </mesh>
      ))}
      {/* Back */}
      <mesh position={[0, 0.5, -0.12]}>
        <boxGeometry args={[0.8, 0.35, 0.04]} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
    </group>
  );
}

function CityDecorations({ lowEnd, variation }: { lowEnd?: boolean; variation: number }) {
  const layout = useMemo(() => {
    const items: Array<{
      type: 'building' | 'light' | 'hydrant' | 'dumpster' | 'bench';
      x: number; z: number;
      modelIdx?: number;
      rot?: number;
    }> = [];

    // 5-6 buildings per side with variation-seeded model selection
    const buildingCount = 4 + (variation % 3);
    for (let i = 0; i < buildingCount; i++) {
      const z = -85 + i * (170 / buildingCount);
      const seedL = decorSeed(variation * 100 + i * 7);
      const seedR = decorSeed(variation * 100 + i * 7 + 50);
      const modelL = Math.floor(seedL * CITY_BUILDING_MODELS.length);
      const modelR = Math.floor(seedR * CITY_BUILDING_MODELS.length);
      const scatterL = (decorSeed(variation * 10 + i) - 0.5) * 4;
      const scatterR = (decorSeed(variation * 10 + i + 30) - 0.5) * 4;
      items.push({ type: 'building', x: -10 - Math.abs(scatterL), z, modelIdx: modelL, rot: Math.PI / 2 });
      items.push({ type: 'building', x:  10 + Math.abs(scatterR), z, modelIdx: modelR, rot: -Math.PI / 2 });
    }

    // Streetlights every 40m
    for (let i = 0; i < 5; i++) {
      const z = -80 + i * 40;
      items.push({ type: 'light', x: -5.5, z });
      items.push({ type: 'light', x:  5.5, z });
    }

    // Fire hydrants (2-3 per chunk)
    const hydrantCount = 2 + (variation % 2);
    for (let i = 0; i < hydrantCount; i++) {
      const z = -70 + i * 55 + decorSeed(variation + i * 13) * 20;
      const side = decorSeed(variation + i * 17) > 0.5 ? 5.0 : -5.0;
      items.push({ type: 'hydrant', x: side, z });
    }

    // Dumpsters (1-2 per chunk)
    if (!lowEnd) {
      items.push({ type: 'dumpster', x: -6.5, z: -30 + variation * 15 });
      if (variation % 3 === 0) {
        items.push({ type: 'dumpster', x: 7, z: 50 - variation * 10 });
      }
    }

    // Benches
    if (!lowEnd) {
      items.push({ type: 'bench', x: -5.0, z: -50 + variation * 8, rot: Math.PI / 2 });
      items.push({ type: 'bench', x: 5.0, z: 20 + variation * 12, rot: -Math.PI / 2 });
    }

    return items;
  }, [lowEnd, variation]);

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
        if (item.type === 'hydrant') {
          return <FireHydrant key={i} position={[item.x, 0, item.z]} />;
        }
        if (item.type === 'dumpster') {
          return <Dumpster key={i} position={[item.x, 0, item.z]} />;
        }
        if (item.type === 'bench') {
          return <Bench key={i} position={[item.x, 0, item.z]} rotation={item.rot} />;
        }
        return null;
      })}
    </>
  );
}

// ─── Highway decorations — barriers, cones, sign ─────────────────────────────
function BarrierModel({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/road/construction-barrier.glb');
  return (
    <>
      <primitive object={scene.clone(true)} position={position} castShadow />
      <CuboidCollider
        args={[0.3, 0.3, 0.2]}
        position={[position[0], 0.3, position[2]]}
        restitution={0.2}
      />
    </>
  );
}

function ConeModel({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/road/construction-cone.glb');
  return <primitive object={scene.clone(true)} position={position} />;
}

function SignModel({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/road/sign-highway.glb');
  return <primitive object={scene.clone(true)} position={position} scale={1.5} />;
}

// Procedural guardrail — metal posts + rail
function Guardrail({ side, length }: { side: 'left' | 'right'; length: number }) {
  const x = side === 'left' ? -5.5 : 5.5;
  const posts = useMemo(() => {
    const p: number[] = [];
    for (let z = -length / 2; z < length / 2; z += 8) p.push(z);
    return p;
  }, [length]);

  return (
    <group>
      <CuboidCollider
        args={[0.1, 0.4, length / 2]}
        position={[x, 0.3, 0]}
        restitution={0.3}
      />
      {/* Continuous rail */}
      <mesh position={[x, 0.45, 0]}>
        <boxGeometry args={[0.06, 0.15, length]} />
        <meshStandardMaterial color="#aaaaaa" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Posts */}
      {posts.map((z, i) => (
        <mesh key={i} position={[x, 0.22, z]}>
          <boxGeometry args={[0.05, 0.45, 0.05]} />
          <meshStandardMaterial color="#888888" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function HighwayDecorations({ variation }: { variation: number }) {
  const layout = useMemo(() => {
    const barriers: [number, number, number][] = [];
    const cones: [number, number, number][] = [];
    const signs: [number, number, number][] = [];

    // Barriers — varied spacing using variation seed
    const barrierCount = 6 + (variation % 4);
    const spacing = 160 / barrierCount;
    for (let i = 0; i < barrierCount; i++) {
      const z = -80 + i * spacing;
      barriers.push([-5.2, 0, z]);
      barriers.push([ 5.2, 0, z]);
    }

    // Cones — some chunks have more roadwork
    const coneCount = 3 + (variation % 4);
    for (let i = 0; i < coneCount; i++) {
      const z = -70 + i * (140 / coneCount) + decorSeed(variation + i * 3) * 10;
      const x = 1.5 + decorSeed(variation + i * 7) * 2;
      cones.push([x, 0, z]);
    }

    // Highway signs — 1-2 per chunk
    signs.push([7, 0, -80 + variation * 15]);
    if (variation % 2 === 0) {
      signs.push([-7, 0, 30 + variation * 10]);
    }

    return { barriers, cones, signs };
  }, [variation]);

  return (
    <>
      {/* Guardrails along both sides */}
      <Guardrail side="left" length={CHUNK_LENGTH} />
      <Guardrail side="right" length={CHUNK_LENGTH} />

      {layout.barriers.map((pos, i) => <BarrierModel key={`b${i}`} position={pos} />)}
      {layout.cones.map((pos, i) => <ConeModel key={`c${i}`} position={pos} />)}
      {layout.signs.map((pos, i) => <SignModel key={`s${i}`} position={pos} />)}

      {/* Grass verge strips */}
      <mesh position={[-7, -0.01, 0]} receiveShadow>
        <boxGeometry args={[3, 0.02, CHUNK_LENGTH]} />
        <meshStandardMaterial color="#3a6b2a" roughness={1} />
      </mesh>
      <mesh position={[7, -0.01, 0]} receiveShadow>
        <boxGeometry args={[3, 0.02, CHUNK_LENGTH]} />
        <meshStandardMaterial color="#3a6b2a" roughness={1} />
      </mesh>
    </>
  );
}

// ─── Rural decorations — procedural trees + cactus hint ──────────────────────
function CactusModel({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/nature/low_poly_cactus.glb');
  return <primitive object={scene.clone(true)} position={position} scale={2} castShadow />;
}

// Procedural rock
function Rock({ position, scale }: { position: [number, number, number]; scale?: number }) {
  const s = scale ?? 1;
  return (
    <mesh position={position} rotation={[0, position[0] * 2, 0]}>
      <dodecahedronGeometry args={[0.5 * s, 0]} />
      <meshStandardMaterial color="#777766" roughness={0.95} flatShading />
    </mesh>
  );
}

// Procedural bush
function Bush({ position, color }: { position: [number, number, number]; color?: string }) {
  return (
    <mesh position={[position[0], 0.4, position[2]]}>
      <sphereGeometry args={[0.6, 6, 5]} />
      <meshStandardMaterial color={color || '#2d6a4f'} roughness={0.9} flatShading />
    </mesh>
  );
}

// Fence section
function FenceSection({ x, zStart, zEnd }: { x: number; zStart: number; zEnd: number }) {
  const length = Math.abs(zEnd - zStart);
  const midZ = (zStart + zEnd) / 2;
  const postCount = Math.floor(length / 4);
  const posts = useMemo(() => {
    const p: number[] = [];
    for (let i = 0; i <= postCount; i++) {
      p.push(zStart + (i / postCount) * (zEnd - zStart));
    }
    return p;
  }, [postCount, zStart, zEnd]);

  return (
    <group>
      <CuboidCollider
        args={[0.08, 0.4, length / 2]}
        position={[x, 0.35, midZ]}
        restitution={0.2}
      />
      {/* Horizontal rails */}
      <mesh position={[x, 0.5, midZ]}>
        <boxGeometry args={[0.04, 0.04, length]} />
        <meshStandardMaterial color="#8B6914" roughness={0.9} />
      </mesh>
      <mesh position={[x, 0.25, midZ]}>
        <boxGeometry args={[0.04, 0.04, length]} />
        <meshStandardMaterial color="#8B6914" roughness={0.9} />
      </mesh>
      {/* Posts */}
      {posts.map((z, i) => (
        <mesh key={i} position={[x, 0.35, z]}>
          <boxGeometry args={[0.06, 0.7, 0.06]} />
          <meshStandardMaterial color="#6B4914" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function RuralDecorations({ variation }: { variation: number }) {
  const layout = useMemo(() => {
    const greens = ['#2d6a4f', '#40916c', '#358856', '#4a9a5c'];
    const trees: Array<{ x: number; z: number; green: string; trunkH: number; crownR: number; crownH: number }> = [];
    const rocks: Array<{ x: number; z: number; scale: number }> = [];
    const bushes: Array<{ x: number; z: number; color: string }> = [];
    const cacti: [number, number, number][] = [];

    // Trees — more varied with seeded sizes
    const treeCount = 10 + (variation % 4);
    for (let i = 0; i < treeCount; i++) {
      const seed = decorSeed(variation * 50 + i);
      const side = seed > 0.5 ? 1 : -1;
      const dist = 8 + seed * 6;
      const z = -90 + i * (180 / treeCount) + (decorSeed(variation + i * 3) - 0.5) * 10;
      const trunkH = 1.5 + decorSeed(variation + i * 11) * 1.5;
      const crownR = 0.8 + decorSeed(variation + i * 13) * 1.0;
      const crownH = 2 + decorSeed(variation + i * 17) * 2;
      trees.push({
        x: side * dist,
        z,
        green: greens[Math.floor(decorSeed(variation + i * 7) * greens.length)],
        trunkH,
        crownR,
        crownH,
      });
    }

    // Rocks — scattered between trees
    const rockCount = 4 + (variation % 3);
    for (let i = 0; i < rockCount; i++) {
      const seed = decorSeed(variation * 30 + i * 19);
      const side = seed > 0.5 ? 1 : -1;
      rocks.push({
        x: side * (7 + seed * 8),
        z: -80 + i * 40 + decorSeed(variation + i * 23) * 15,
        scale: 0.5 + decorSeed(variation + i * 29) * 1.5,
      });
    }

    // Bushes — clustered near trees
    const bushCount = 5 + (variation % 3);
    for (let i = 0; i < bushCount; i++) {
      const seed = decorSeed(variation * 20 + i * 31);
      const side = seed > 0.5 ? 1 : -1;
      bushes.push({
        x: side * (6.5 + seed * 5),
        z: -70 + i * 30 + decorSeed(variation + i * 37) * 15,
        color: greens[Math.floor(seed * greens.length)],
      });
    }

    // Cacti — more varied positions
    const cactusCount = 2 + (variation % 3);
    for (let i = 0; i < cactusCount; i++) {
      const seed = decorSeed(variation * 40 + i * 41);
      const side = seed > 0.5 ? 1 : -1;
      cacti.push([side * (10 + seed * 6), 0, -60 + i * 50 + seed * 20]);
    }

    return { trees, rocks, bushes, cacti };
  }, [variation]);

  // Fence on one side (alternating per variation)
  const fenceSide = variation % 2 === 0 ? -6.5 : 6.5;

  return (
    <>
      {layout.trees.map((t, i) => (
        <group key={`t${i}`} position={[t.x, 0, t.z]}>
          <mesh position={[0, t.trunkH / 2, 0]}>
            <cylinderGeometry args={[0.15, 0.22, t.trunkH, 6]} />
            <meshStandardMaterial color="#5c3d2e" />
          </mesh>
          <mesh position={[0, t.trunkH + t.crownH / 2 - 0.3, 0]}>
            <coneGeometry args={[t.crownR, t.crownH, 7]} />
            <meshStandardMaterial color={t.green} flatShading />
          </mesh>
        </group>
      ))}
      {layout.rocks.map((r, i) => (
        <Rock key={`r${i}`} position={[r.x, 0.2, r.z]} scale={r.scale} />
      ))}
      {layout.bushes.map((b, i) => (
        <Bush key={`b${i}`} position={[b.x, 0, b.z]} color={b.color} />
      ))}
      {layout.cacti.map((pos, i) => (
        <CactusModel key={`c${i}`} position={pos} />
      ))}
      {/* Fence along one side */}
      <FenceSection x={fenceSide} zStart={-90} zEnd={90} />
    </>
  );
}

// ─── Chunk geometry ───────────────────────────────────────────────────────────
const GROUND_COLORS: Record<Biome, string> = {
  city: '#3a5a2c',     // darker urban grass
  highway: '#4a7c3c',  // standard green
  rural: '#5a8a3a',    // brighter pastoral
};

const SIDEWALK_COLORS: Record<Biome, string> = {
  city: '#888899',
  highway: '#777788',
  rural: '#8a8878',    // slightly earthy
};

interface ChunkGeomProps {
  biome: Biome;
  variation: number;
  lowEnd?: boolean;
}

function ChunkGeom({ biome, variation, lowEnd }: ChunkGeomProps) {
  return (
    <group>
      {/* Ground/terrain plane underneath everything */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[100, 0.5, CHUNK_LENGTH]} />
        <meshStandardMaterial color={GROUND_COLORS[biome]} roughness={0.9} />
      </mesh>

      {/* Road surface — kenney tiles */}
      <RoadSurface />

      {/* Curbs - lowered to realistic height */}
      <mesh position={[-4.2, 0.04, 0]}>
        <boxGeometry args={[0.2, 0.04, CHUNK_LENGTH]} />
        <meshStandardMaterial color={SIDEWALK_COLORS[biome]} />
      </mesh>
      <mesh position={[4.2, 0.04, 0]}>
        <boxGeometry args={[0.2, 0.04, CHUNK_LENGTH]} />
        <meshStandardMaterial color={SIDEWALK_COLORS[biome]} />
      </mesh>

      {/* Sidewalks - reduced height */}
      <mesh position={[-5.3, 0.03, 0]}>
        <boxGeometry args={[1.6, 0.03, CHUNK_LENGTH]} />
        <meshStandardMaterial color={SIDEWALK_COLORS[biome]} />
      </mesh>
      <mesh position={[5.3, 0.03, 0]}>
        <boxGeometry args={[1.6, 0.03, CHUNK_LENGTH]} />
        <meshStandardMaterial color={SIDEWALK_COLORS[biome]} />
      </mesh>

      {/* Biome decorations */}
      {biome === 'city' && <CityDecorations lowEnd={lowEnd} variation={variation} />}
      {biome === 'highway' && <HighwayDecorations variation={variation} />}
      {biome === 'rural' && <RuralDecorations variation={variation} />}
    </group>
  );
}

// ─── Chunk list ───────────────────────────────────────────────────────────────
export function RoadChunks({ lowEnd }: { lowEnd?: boolean }) {
  const [chunks, setChunks] = useState<ChunkData[]>(() => initChunks());
  const frameRef = useRef(0);

  const vehiclePosition = useGameStore((s) => s.vehiclePosition);
  const currentBiome = useGameStore((s) => s.currentBiome);
  const resetCounter = useGameStore((s) => s.resetCounter);

  useEffect(() => {
    setChunks(initChunks());
  }, [resetCounter]);

  useFrame(() => {
    // Update chunk positions every 10 frames (save CPU)
    frameRef.current++;
    if (frameRef.current % 10 === 0) {
      setChunks((prev) => updateChunks(prev, vehiclePosition[2], currentBiome));
    }
  });

  return (
    <>
      {chunks.map((chunk) => (
        <RigidBody
          key={`${chunk.id}-${chunk.gen}`}
          type="fixed"
          position={[0, 0, chunk.zPosition]}
          colliders={false}
        >
          {/* Road surface collider - thick slab to prevent tunneling */}
          <CuboidCollider
            args={[6, 0.5, CHUNK_LENGTH / 2]}
            position={[0, -0.5, 0]}
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
          <ChunkGeom biome={chunk.biome} variation={chunk.variation} lowEnd={lowEnd} />
        </RigidBody>
      ))}
    </>
  );
}
