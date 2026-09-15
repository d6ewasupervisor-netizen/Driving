/**
 * Procedural stand-ins for Kenney GLBs that reference missing Textures/colormap.png.
 * UV rectangles were measured from the bundled GLBs (see RoadChunks preload paths).
 */
import * as THREE from 'three';

const SIZE = 512;

type UVRect = { minU: number; maxU: number; minV: number; maxV: number };

const ROAD_UV: UVRect = {
  minU: 0.03125,
  maxU: 0.96875,
  minV: 0.7749999761581421,
  maxV: 0.9750000238418579,
};

const BUILDING_NARROW_UV: UVRect = {
  minU: 0.09375,
  maxU: 0.71875,
  minV: 0.2749999761581421,
  maxV: 0.9750000238418579,
};

const BUILDING_WIDE_A_UV: UVRect = {
  minU: 0.09375,
  maxU: 0.96875,
  minV: 0.5466943383216858,
  maxV: 0.9750000238418579,
};

const BUILDING_TOWER_B_UV: UVRect = {
  minU: 0.46875,
  maxU: 0.96875,
  minV: 0.5649999976158142,
  maxV: 0.9750000238418579,
};

function canvasRectFromUV(r: UVRect, w: number, h: number) {
  const x0 = Math.floor(r.minU * w);
  const x1 = Math.ceil(r.maxU * w);
  const y0 = Math.floor((1 - r.maxV) * h);
  const y1 = Math.ceil((1 - r.minV) * h);
  return { x0, y0, x1, y1, rw: x1 - x0, rh: y1 - y0 };
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslCss(h: number, s: number, l: number): string {
  const c = new THREE.Color().setHSL((h % 360) / 360, s, l);
  return `#${c.getHexString()}`;
}

let roadColormapCache: THREE.CanvasTexture | null = null;

export function getSharedRoadColormapTexture(): THREE.CanvasTexture {
  if (roadColormapCache) return roadColormapCache;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context');

  ctx.fillStyle = '#1a1c1f';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const rect = canvasRectFromUV(ROAD_UV, SIZE, SIZE);
  const y1b = rect.y0 + rect.rh;

  const grd = ctx.createLinearGradient(rect.x0, rect.y0, rect.x0 + rect.rw, rect.y0);
  grd.addColorStop(0, '#2c2e32');
  grd.addColorStop(0.5, '#383b40');
  grd.addColorStop(1, '#2c2e32');
  ctx.fillStyle = grd;
  ctx.fillRect(rect.x0, rect.y0, rect.rw, rect.rh);

  const rand = mulberry32(0x726f6164);
  for (let i = 0; i < 800; i++) {
    const px = rect.x0 + rand() * rect.rw;
    const py = rect.y0 + rand() * rect.rh;
    const g = 30 + rand() * 40;
    ctx.fillStyle = `rgba(${g},${g},${g},0.12)`;
    ctx.fillRect(px, py, 1 + rand() * 2, 1 + rand() * 2);
  }

  const cx = rect.x0 + rect.rw / 2;
  const dashLen = Math.max(6, rect.rh * 0.08);
  const gapLen = dashLen * 0.9;
  for (let y = rect.y0; y < y1b - dashLen; y += dashLen + gapLen) {
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(cx - 1.5, y, 3, dashLen);
  }

  ctx.strokeStyle = 'rgba(240,240,245,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rect.x0 + rect.rw * 0.08, rect.y0);
  ctx.lineTo(rect.x0 + rect.rw * 0.08, y1b);
  ctx.moveTo(rect.x0 + rect.rw * 0.92, rect.y0);
  ctx.lineTo(rect.x0 + rect.rw * 0.92, y1b);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  roadColormapCache = tex;
  return tex;
}

let roadMaterialSingleton: THREE.MeshStandardMaterial | null = null;

/** One material shared by all road tiles (same atlas + procedural map). */
export function getSharedRoadMaterial(templateScene: THREE.Object3D): THREE.MeshStandardMaterial {
  if (roadMaterialSingleton) return roadMaterialSingleton;

  let proto: THREE.MeshStandardMaterial | undefined;
  templateScene.traverse((o) => {
    if (proto) return;
    if (o instanceof THREE.Mesh) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m instanceof THREE.MeshStandardMaterial) proto = m;
    }
  });

  const mat = proto ? proto.clone() : new THREE.MeshStandardMaterial({ color: 0xffffff });
  mat.map = getSharedRoadColormapTexture();
  mat.color.setHex(0xffffff);
  mat.roughness = 0.9;
  mat.metalness = 0.05;
  mat.name = 'RoadProceduralColormap';
  mat.needsUpdate = true;
  roadMaterialSingleton = mat;
  return roadMaterialSingleton;
}

/** Adjust shared road PBR for dry vs wet surfaces (0 = dry, 1 = soaked). */
export function setRoadSurfaceWetness(wetness: number) {
  if (!roadMaterialSingleton) return;
  const w = THREE.MathUtils.clamp(wetness, 0, 1);
  roadMaterialSingleton.roughness = THREE.MathUtils.lerp(0.9, 0.22, w);
  roadMaterialSingleton.metalness = THREE.MathUtils.lerp(0.05, 0.4, w);
  roadMaterialSingleton.envMapIntensity = THREE.MathUtils.lerp(0.3, 1.4, w);
}

function buildingUVForModel(modelPath: string): UVRect {
  if (modelPath.includes('building-sample-tower-b')) return BUILDING_TOWER_B_UV;
  if (
    modelPath.includes('building-sample-tower-a') ||
    modelPath.includes('building-sample-house-a')
  ) {
    return BUILDING_WIDE_A_UV;
  }
  return BUILDING_NARROW_UV;
}

function drawFacade(
  ctx: CanvasRenderingContext2D,
  rect: { x0: number; y0: number; rw: number; rh: number },
  seed: number
) {
  const rand = mulberry32(seed);
  const hue = rand() * 360;
  const wall = hslCss(hue, 0.22 + rand() * 0.18, 0.38 + rand() * 0.12);
  const trim = hslCss((hue + 40 + rand() * 30) % 360, 0.15, 0.28 + rand() * 0.08);
  const roof = hslCss((hue + 120) % 360, 0.12, 0.32 + rand() * 0.1);

  ctx.fillStyle = wall;
  ctx.fillRect(rect.x0, rect.y0, rect.rw, rect.rh);

  const bands = 3 + Math.floor(rand() * 4);
  ctx.fillStyle = trim;
  for (let b = 0; b < bands; b++) {
    const by = rect.y0 + (rect.rh * b) / bands;
    ctx.fillRect(rect.x0, by, rect.rw, Math.max(2, rect.rh * 0.02));
  }

  const cols = 3 + Math.floor(rand() * 4);
  const rows = 4 + Math.floor(rand() * 5);
  const padX = rect.rw * 0.08;
  const padY = rect.rh * 0.06;
  const cellW = (rect.rw - padX * 2) / cols;
  const cellH = (rect.rh - padY * 2) / rows;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (rand() > 0.15) {
        ctx.fillStyle = `rgba(30,40,55,${0.55 + rand() * 0.25})`;
        const wx = rect.x0 + padX + col * cellW + cellW * 0.12;
        const wy = rect.y0 + padY + row * cellH + cellH * 0.15;
        ctx.fillRect(wx, wy, cellW * 0.76, cellH * 0.55);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(wx, wy, cellW * 0.76, cellH * 0.55);
      }
    }
  }

  ctx.fillStyle = roof;
  ctx.fillRect(rect.x0, rect.y0, rect.rw, Math.max(4, rect.rh * 0.08));

  for (let i = 0; i < 400; i++) {
    const px = rect.x0 + rand() * rect.rw;
    const py = rect.y0 + rand() * rect.rh;
    const n = 15 + rand() * 25;
    ctx.fillStyle = `rgba(${n},${n},${n},0.06)`;
    ctx.fillRect(px, py, 1, 1);
  }
}

const buildingTexCache = new Map<string, THREE.CanvasTexture>();

export function getBuildingColormapTexture(modelPath: string, worldX: number, worldZ: number): THREE.CanvasTexture {
  const seedKey =
    Math.floor((worldX + 500) * 13 + (worldZ + 500) * 17) % 100000;
  const cacheKey = `${modelPath}:${seedKey}`;
  const hit = buildingTexCache.get(cacheKey);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context');

  ctx.fillStyle = '#2a2d33';
  ctx.fillRect(0, 0, SIZE, SIZE);

  const uv = buildingUVForModel(modelPath);
  const rect = canvasRectFromUV(uv, SIZE, SIZE);
  const seed = seedKey * 977 + modelPath.length * 131;
  drawFacade(ctx, rect, seed);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;

  if (buildingTexCache.size > 96) {
    const firstKey = buildingTexCache.keys().next().value as string;
    const old = buildingTexCache.get(firstKey);
    old?.dispose();
    buildingTexCache.delete(firstKey);
  }
  buildingTexCache.set(cacheKey, tex);
  return tex;
}
