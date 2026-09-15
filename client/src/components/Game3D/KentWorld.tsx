/**
 * KentWorld — the Act 0/1 map, built from QuietRoads.sim.map (metres).
 * Core coordinates: x east, y south → world X, Z. Road surface at Y = 0.
 *
 * Buildings are boxes with fixed Rapier cuboid colliders so the Beetle stops
 * against them (the sim's blocked() is for the Quiet; Rapier handles the car).
 * Everything is drawn from data — nothing hand-placed.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { QuietRoads } from '@/systems/QuietRoadsBridge';
import type { Rect, SignDef } from '@/quietroads';

const ROAD_Y = 0.01;
const MARK_Y = 0.02;

function RectPlane({ r, y, color, opacity = 1 }: { r: Rect; y: number; color: string; opacity?: number }) {
  return (
    <mesh position={[r.x + r.w / 2, y, r.y + r.h / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[r.w, r.h]} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} roughness={0.95} />
    </mesh>
  );
}

function Dashes({ a, b, color = '#d8b93c', dash = 3, gap = 3, width = 0.15 }: { a: { x: number; y: number }; b: { x: number; y: number }; color?: string; dash?: number; gap?: number; width?: number }) {
  const segs = useMemo(() => {
    const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy); const ux = dx / L, uy = dy / L;
    const out: { x: number; z: number; len: number }[] = [];
    for (let d = 0; d < L; d += dash + gap) { const len = Math.min(dash, L - d); out.push({ x: a.x + ux * (d + len / 2), z: a.y + uy * (d + len / 2), len }); }
    return { out, rot: Math.atan2(dy, dx) };
  }, [a.x, a.y, b.x, b.y, dash, gap]);
  return (
    <group>
      {segs.out.map((s, i) => (
        <mesh key={i} position={[s.x, MARK_Y, s.z]} rotation={[-Math.PI / 2, 0, -segs.rot]}>
          <planeGeometry args={[s.len, width]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  );
}

function Line({ a, b, color = '#ffffff', width = 0.3 }: { a: { x: number; y: number }; b: { x: number; y: number }; color?: string; width?: number }) {
  const dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy);
  return (
    <mesh position={[(a.x + b.x) / 2, MARK_Y, (a.y + b.y) / 2]} rotation={[-Math.PI / 2, 0, -Math.atan2(dy, dx)]}>
      <planeGeometry args={[L, width]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

function Building({ r, label }: { r: Rect; label?: string }) {
  const h = label === 'KENT MIDDLE' ? 7 : label === 'DOL' ? 5 : 4 + ((r.x * 7 + r.y * 3) % 3);
  const color = label === 'DOL' ? '#8a8f96' : label === 'KENT MIDDLE' ? '#a8895e' : '#7c7368';
  return (
    <RigidBody type="fixed" colliders={false} position={[r.x + r.w / 2, h / 2, r.y + r.h / 2]}>
      <CuboidCollider args={[r.w / 2, h / 2, r.h / 2]} />
      <mesh castShadow receiveShadow>
        <boxGeometry args={[r.w, h, r.h]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      <mesh position={[0, h / 2 + 0.15, 0]}>
        <boxGeometry args={[r.w + 0.6, 0.3, r.h + 0.6]} />
        <meshStandardMaterial color="#3a352f" />
      </mesh>
    </RigidBody>
  );
}

function Sign({ s }: { s: SignDef }) {
  const face = useMemo(() => {
    switch (s.kind) {
      case 'stop': return { geo: <cylinderGeometry args={[0.45, 0.45, 0.05, 8]} />, color: '#c0302b', rot: Math.PI / 8 };
      case 'school': return { geo: <cylinderGeometry args={[0.45, 0.45, 0.05, 5]} />, color: '#e8d63a', rot: Math.PI / 2 };
      case 'rail': return { geo: <cylinderGeometry args={[0.45, 0.45, 0.05, 24]} />, color: '#e8d63a', rot: 0 };
      default: return { geo: <cylinderGeometry args={[0.5, 0.5, 0.05, 4]} />, color: '#e8d63a', rot: 0 };
    }
  }, [s.kind]);
  return (
    <group position={[s.pos.x, 0, s.pos.y]}>
      <mesh position={[0, 1.1, 0]}><cylinderGeometry args={[0.04, 0.04, 2.2, 6]} /><meshStandardMaterial color="#444" /></mesh>
      <mesh position={[0, 2.3, 0]} rotation={[Math.PI / 2, face.rot, 0]} castShadow>
        {face.geo}
        <meshStandardMaterial color={face.color} roughness={0.6} />
      </mesh>
    </group>
  );
}

export function KentWorld() {
  const map = QuietRoads.sim.map;
  return (
    <group>
      {/* Ground + collider (road surface at Y=0, 1 m thick below) */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[map.bounds.w / 2, 0.5, map.bounds.h / 2]} position={[map.bounds.x + map.bounds.w / 2, -0.5, map.bounds.y + map.bounds.h / 2]} friction={0} />
        {/* map edge walls */}
        <CuboidCollider args={[map.bounds.w / 2, 3, 1]} position={[map.bounds.x + map.bounds.w / 2, 3, map.bounds.y]} />
        <CuboidCollider args={[map.bounds.w / 2, 3, 1]} position={[map.bounds.x + map.bounds.w / 2, 3, map.bounds.y + map.bounds.h]} />
        <CuboidCollider args={[1, 3, map.bounds.h / 2]} position={[map.bounds.x, 3, map.bounds.y + map.bounds.h / 2]} />
        <CuboidCollider args={[1, 3, map.bounds.h / 2]} position={[map.bounds.x + map.bounds.w, 3, map.bounds.y + map.bounds.h / 2]} />
      </RigidBody>
      <RectPlane r={map.bounds} y={0} color="#4f5f45" />

      {map.roads.map((r, i) => <RectPlane key={i} r={r.rect} y={ROAD_Y} color={r.name === 'DOL LOT' ? '#5b5e63' : '#3a3d42'} />)}
      {map.centerLines.map(([a, b], i) => <Dashes key={i} a={a} b={b} />)}
      {map.stopLines.map(([a, b], i) => <Line key={i} a={a} b={b} />)}
      {map.schoolZone && <RectPlane r={map.schoolZone} y={MARK_Y} color="#ffe680" opacity={0.12} />}

      {map.rail && (
        <group>
          <RectPlane r={{ x: map.rail.from.x, y: map.rail.from.y - 1.5, w: map.rail.to.x - map.rail.from.x, h: 3 }} y={MARK_Y} color="#6a5a48" />
          <Line a={{ x: map.rail.from.x, y: map.rail.from.y - 0.8 }} b={{ x: map.rail.to.x, y: map.rail.to.y - 0.8 }} color="#3b3b3b" width={0.12} />
          <Line a={{ x: map.rail.from.x, y: map.rail.from.y + 0.8 }} b={{ x: map.rail.to.x, y: map.rail.to.y + 0.8 }} color="#3b3b3b" width={0.12} />
        </group>
      )}

      {map.buildings.map((b, i) => <Building key={i} r={b.rect} label={b.label} />)}
      {map.signs.map((s, i) => <Sign key={i} s={s} />)}

      {/* Grandma's carport */}
      <mesh position={[13.5, 1.4, -13.5]}><boxGeometry args={[7, 0.15, 5]} /><meshStandardMaterial color="#555a60" /></mesh>
      {[[10.5, -11.5], [16.5, -11.5], [10.5, -15.5], [16.5, -15.5]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.7, z]}><cylinderGeometry args={[0.06, 0.06, 1.4, 6]} /><meshStandardMaterial color="#333" /></mesh>
      ))}
    </group>
  );
}

/** Kept for parity with the HUD noise ring; a THREE color per Quiet state. */
export const QUIET_COLORS = [new THREE.Color('#6b6f73'), new THREE.Color('#a39d5c'), new THREE.Color('#c4763a'), new THREE.Color('#b23a3a')];
