/**
 * Helpers for Kenney NPC car GLBs — wheel discovery, body tinting, emissive lights.
 */
import * as THREE from 'three';
import { NPC_COLORS } from '@/systems/TrafficManager';

const BODY_MAT_SKIP = /glass|window|light|emissive|chrome|wheel|tire/i;

export function findWheelNodes(root: THREE.Object3D): THREE.Object3D[] {
  const wheels: THREE.Object3D[] = [];
  root.traverse((obj) => {
    const name = obj.name.toLowerCase();
    if (!name.includes('wheel') && !name.includes('tire')) return;
    if (name.includes('__')) return;
    wheels.push(obj);
  });
  return wheels;
}

export function findFrontWheelNodes(root: THREE.Object3D): Set<THREE.Object3D> {
  const front = new Set<THREE.Object3D>();
  root.traverse((obj) => {
    const name = obj.name.toLowerCase();
    if (!name.includes('wheel') && !name.includes('tire')) return;
    if (name.includes('front') || name.includes('wheel_f') || name.startsWith('wheelf')) {
      front.add(obj);
    }
  });
  return front;
}

export function tintNpcBody(root: THREE.Object3D, colorHex: string) {
  const color = new THREE.Color(colorHex);
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      if (BODY_MAT_SKIP.test(mat.name) || BODY_MAT_SKIP.test(obj.name)) continue;
      mat.color.copy(color);
      mat.roughness = 0.55;
      mat.metalness = 0.15;
      mat.needsUpdate = true;
    }
  });
}

export function applyNpcHeadTailLights(
  root: THREE.Object3D,
  {
    headlightIntensity,
    taillightIntensity,
    policeFlash,
    taxiFlash,
    isPolice,
    isTaxi,
  }: {
    headlightIntensity: number;
    taillightIntensity: number;
    policeFlash: number;
    taxiFlash: number;
    isPolice?: boolean;
    isTaxi?: boolean;
  }
) {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const name = obj.name.toLowerCase();
    const mat = obj.material;
    if (!(mat instanceof THREE.MeshStandardMaterial)) return;

    const z = obj.position.z;
    const y = obj.position.y;
    const isFront = z > 0.15;
    const isRear = z < -0.15;

    if (isPolice && y > 0.35 && (name.includes('light') || name.includes('bar') || name.includes('top'))) {
      const blue = policeFlash > 0;
      mat.emissive.set(blue ? '#2266ff' : '#ff2222');
      mat.emissiveIntensity = 3;
      return;
    }

    if (isTaxi && isRear && (name.includes('sign') || name.includes('taxi') || y > 0.4)) {
      mat.emissive.set('#ffcc00');
      mat.emissiveIntensity = 1.5 + taxiFlash * 1.5;
      return;
    }

    const namedLight =
      name.includes('light') || name.includes('head') || name.includes('tail') || name.includes('rear');

    if (namedLight && isFront) {
      mat.emissive.set('#fff4dd');
      mat.emissiveIntensity = headlightIntensity;
    } else if (namedLight && isRear) {
      mat.emissive.set('#ff2222');
      mat.emissiveIntensity = taillightIntensity;
    } else if (!namedLight && isFront && Math.abs(obj.position.x) > 0.15 && y < 0.5) {
      // Kenney cars: headlight strips on front corners
      mat.emissive.set('#ffe8c8');
      mat.emissiveIntensity = headlightIntensity * 0.85;
    } else if (!namedLight && isRear && Math.abs(obj.position.x) > 0.1 && y < 0.55) {
      mat.emissive.set('#ff2222');
      mat.emissiveIntensity = taillightIntensity;
    }
  });
}

export function npcColorForIndex(index: number): string {
  return NPC_COLORS[index % NPC_COLORS.length];
}
