/**
 * proceduralBeetlePaint — Grandma June's 40-year-old pink, generated once.
 * Faded pink base, lighter sun-bleached patches, rust blooms with dark cores,
 * a few drip streaks. Returned as a CanvasTexture for the Chassi material.
 * Seeded so the car looks the same every launch.
 */
import * as THREE from 'three';

const SIZE = 1024;

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let cached: THREE.CanvasTexture | null = null;

export function getBeetlePaintTexture(): THREE.CanvasTexture {
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const ctx = c.getContext('2d')!;
  const r = seeded(19760);

  // Base: faded pink (more pink than orange, no shine)
  ctx.fillStyle = '#d98fa8';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Sun-bleached patches — softer, paler pink
  for (let i = 0; i < 26; i++) {
    const x = r() * SIZE, y = r() * SIZE, rad = 60 + r() * 220;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(240,205,215,0.55)');
    g.addColorStop(1, 'rgba(240,205,215,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Grime — darker, dusty pink in streaks
  for (let i = 0; i < 18; i++) {
    const x = r() * SIZE, y = r() * SIZE, rad = 80 + r() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(120,70,85,0.22)');
    g.addColorStop(1, 'rgba(120,70,85,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Rust blooms: irregular blobs, orange-brown halo, dark pitted core, drip below
  const blooms = 34;
  for (let i = 0; i < blooms; i++) {
    const x = r() * SIZE, y = r() * SIZE, rad = 12 + r() * 46;
    // halo
    const halo = ctx.createRadialGradient(x, y, rad * 0.3, x, y, rad * 1.6);
    halo.addColorStop(0, 'rgba(150,80,40,0.55)');
    halo.addColorStop(1, 'rgba(150,80,40,0)');
    ctx.fillStyle = halo; ctx.fillRect(x - rad * 2, y - rad * 2, rad * 4, rad * 4);
    // irregular body
    ctx.beginPath();
    const pts = 9 + Math.floor(r() * 6);
    for (let k = 0; k < pts; k++) {
      const a = (k / pts) * Math.PI * 2;
      const rr = rad * (0.55 + r() * 0.6);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(${110 + Math.floor(r() * 30)},${50 + Math.floor(r() * 20)},${22 + Math.floor(r() * 12)},0.9)`;
    ctx.fill();
    // dark core
    ctx.beginPath(); ctx.arc(x + (r() - 0.5) * rad * 0.4, y + (r() - 0.5) * rad * 0.4, rad * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(48,26,14,0.85)'; ctx.fill();
    // drip
    if (r() < 0.6) {
      const len = rad * (1.5 + r() * 3);
      const g = ctx.createLinearGradient(x, y, x, y + len);
      g.addColorStop(0, 'rgba(130,65,30,0.55)'); g.addColorStop(1, 'rgba(130,65,30,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad * 0.15, y, rad * 0.3, len);
    }
  }

  // Speckle — tiny chips
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(90,45,25,0.5)' : 'rgba(245,220,228,0.35)';
    ctx.fillRect(r() * SIZE, r() * SIZE, 1 + r() * 2, 1 + r() * 2);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  cached = tex;
  return tex;
}

/** Roughness map: rust is rougher than paint. Built from the same seed so spots line up. */
export function getBeetleRoughnessTexture(): THREE.CanvasTexture {
  const paint = getBeetlePaintTexture();
  const src = paint.image as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // pink paint → 0.7 roughness; brown rust (low blue, red>green) → 0.95
    const rr = d[i], gg = d[i + 1], bb = d[i + 2];
    const rusty = rr > gg + 25 && bb < 90 ? 1 : 0;
    const v = Math.round((0.72 + rusty * 0.23) * 255);
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
