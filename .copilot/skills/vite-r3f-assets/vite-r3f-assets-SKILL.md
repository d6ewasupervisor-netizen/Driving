---
name: vite-r3f-assets
description: Asset loading patterns for Vite + React Three Fiber projects — GLTF/GLB models, Draco/Meshopt compression, KTX2 textures, HDR environment maps, audio, and the public-vs-imported decision. Use this skill any time the user mentions Vite asset loading, GLTF, GLB, .glb, .gltf, useGLTF, useTexture, useEnvironment, Draco, Meshopt, KTX2, basis, HDR, EXR, asset paths, model loading, or describes symptoms like "works in dev breaks in build", "404 on textures", "WASM error in production", missing decoders, blob URL issues, or massive 3D model file sizes. Trigger even on vague references like "load the model" or "where do I put the GLB". Strongly prefer this skill over guessing — there are specific Vite footguns (the `node_modules` decoder path trap, the `?url` import requirement, the GLTF+textures bundle problem) that produce silent dev/build divergence and are commonly missed.
---

# Vite + R3F Asset Loading Skill

This skill covers loading 3D assets cleanly in Vite + React Three Fiber projects. The default web app instinct ("just import the file") fails for GLTF bundles because they reference external textures, and the Draco/Meshopt/KTX2 decoders need their WASM/JS files at predictable URLs.

**Always do this before writing asset loading code:**
1. Read `references/asset-decision-tree.md` to decide where the asset lives and how to import it.
2. If the model is over ~5MB, read `references/gltf-pipeline.md` and run the optimizer first. Don't ship raw GLTFs from Blender.
3. If using Draco/Meshopt/KTX2, read `references/decoder-setup.md` for the exact decoder paths.

---

## 1. The two asset locations

Pick one per asset, not both. The decision matters more for 3D apps than typical web apps because models reference external files.

| Location | Hashed? | When to use |
| --- | --- | --- |
| `src/assets/` (or anywhere imported) | ✅ Yes — content hash in filename | Single-file assets you import directly. Hot-reloads in dev. Cache-busted in prod. |
| `public/` | ❌ No — copied as-is | Asset bundles (GLTF + textures), files referenced by URL string at runtime, decoder files, anything you don't `import` from JS. |

**Default to `src/assets/` for single-file assets** (`.glb`, single texture PNG/JPG, single HDR). **Default to `public/` for bundles and runtime-referenced files** (decoders, separated GLTFs).

---

## 2. The GLTF reference problem

A `.glb` is a single binary file containing geometry + textures. A `.gltf` is JSON pointing to **external** `.bin` and texture files.

If you do `import modelUrl from './scene.gltf?url'` and Vite ships the `.gltf` to your build, the texture paths inside the JSON still point to the original folder structure. Vite has no idea those files exist — they're not imported anywhere — so they don't ship. **Result: 404s in production, model loads with no textures.**

Three fixes, in order of preference:

1. **Use `.glb` instead of `.gltf`.** Single file, no external references. Re-export from Blender as GLB, or run `gltf-transform copy in.gltf out.glb`.
2. **Put the whole GLTF bundle in `public/`.** Folder structure is preserved verbatim. Reference by URL: `useGLTF('/models/scene/scene.gltf')`.
3. **Run the asset pipeline anyway.** `gltf-transform optimize` will produce a single optimized GLB. See `references/gltf-pipeline.md`.

For T's stack: prefer GLBs everywhere. The driving game has zero reason to ship separated GLTF bundles.

---

## 3. Loading models with `useGLTF`

```jsx
import { useGLTF } from '@react-three/drei';

// Single-file GLB imported via Vite — recommended
import carUrl from './assets/car.glb?url';

function Car() {
  const { scene, nodes, materials, animations } = useGLTF(carUrl);
  return <primitive object={scene} />;
}

// Preload at module level so first render isn't a Suspense pop
useGLTF.preload(carUrl);
```

`useGLTF`'s full signature:

```ts
useGLTF<T extends string | string[]>(
  path: T,
  useDraco?: boolean | string,    // default: true (CDN), pass string for custom decoder path
  useMeshOpt?: boolean,           // default: true, uses Three's bundled decoder
  extendLoader?: (loader) => void // for KTX2 or other custom loaders
): GLTF & ObjectMap
```

**Always preload models that appear early.** Without `useGLTF.preload(url)`, the first render Suspends — your scene flashes empty. Preload at module scope, not inside the component.

```jsx
// Bad — preload runs on every render
function Car() {
  useGLTF.preload(carUrl); // ← wrong location
  const { scene } = useGLTF(carUrl);
  return <primitive object={scene} />;
}

// Good — preload runs once at module load
useGLTF.preload(carUrl);
function Car() {
  const { scene } = useGLTF(carUrl);
  return <primitive object={scene} />;
}
```

⚠️ Wrap consumers in `<Suspense fallback={<Loader />}>`. Without it, the canvas throws.

---

## 4. Draco (geometry compression)

Draco compresses mesh data. Typical reduction: 80–95% on geometry bytes, with mild CPU cost on decode. Use it for any model over a few hundred KB of geometry.

The decoder is a JS+WASM pair the browser fetches. By default drei points to Google's CDN (`https://www.gstatic.com/draco/v1/decoders/`). Three options:

| Decoder source | Tradeoff |
| --- | --- |
| **Google CDN (default)** | Zero setup. Third-party request. Fine for most projects. |
| **Self-hosted in `public/draco/`** | Privacy/reliability. Need to copy decoder files at build time. |
| **`unpkg` pinned version** | Compromise — third-party, but version-pinned. |

To self-host:
```bash
# Copy decoder files to public dir (one-time)
cp -r node_modules/three/examples/jsm/libs/draco public/
```

Then:
```jsx
const { scene } = useGLTF(carUrl, '/draco/'); // string = decoder path
// Or globally:
useGLTF.setDecoderPath('/draco/');
```

⚠️ **Never use a `node_modules/` path as the decoder URL** — `node_modules` doesn't exist in production builds. This is the #1 "works in dev, breaks in build" trap.

See `references/decoder-setup.md` for the exact files to copy and the version-pinning trap.

---

## 5. Meshopt (newer geometry compression)

Meshopt is the modern alternative to Draco — smaller decoder, faster decode, better for animation. drei enables it by default with Three's bundled decoder, no extra setup needed.

```jsx
const { scene } = useGLTF(carUrl); // Meshopt is on by default
```

**When to pick Meshopt over Draco:** new projects, animation-heavy models, when decode time matters (mobile). gltf-transform's `optimize` command defaults to Meshopt now. Use Draco only if you already have Draco-compressed assets or specifically need Draco's slightly better ratio on static geometry.

---

## 6. KTX2 textures

KTX2 = GPU-native compressed texture format (Basis Universal under the hood). Uploads directly to GPU without decompression on the JS side. Big win for VRAM (often 4–8× smaller in GPU memory) and load time.

KTX2 needs a transcoder (also a WASM file). drei doesn't auto-load it — you wire it in via `extendLoader`:

```jsx
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { KTX2Loader } from 'three-stdlib';

const ktx2Loader = new KTX2Loader().setTranscoderPath('/basis/');

function Model() {
  const { gl } = useThree();
  const { scene } = useGLTF(
    '/models/scene.glb',
    true,   // useDraco
    true,   // useMeshOpt
    (loader) => loader.setKTX2Loader(ktx2Loader.detectSupport(gl))
  );
  return <primitive object={scene} />;
}
```

Self-host the basis transcoder:
```bash
cp -r node_modules/three/examples/jsm/libs/basis public/
```

See `references/decoder-setup.md` for full setup including the `detectSupport` requirement.

---

## 7. Single textures with `useTexture`

```jsx
import { useTexture } from '@react-three/drei';
import dirtUrl from './assets/dirt.jpg?url';
import normalUrl from './assets/dirt-normal.jpg?url';

function Ground() {
  const [colorMap, normalMap] = useTexture([dirtUrl, normalUrl]);
  return <meshStandardMaterial map={colorMap} normalMap={normalMap} />;
}
```

For repeating textures, set `wrapS`/`wrapT` and `repeat` after load:

```jsx
import { RepeatWrapping } from 'three';

const colorMap = useTexture(dirtUrl);
colorMap.wrapS = colorMap.wrapT = RepeatWrapping;
colorMap.repeat.set(20, 20);
```

---

## 8. HDR / environment maps

```jsx
import { Environment } from '@react-three/drei';

// Preset (drei ships a few)
<Environment preset="sunset" />

// Custom HDR (put in public/ for stable URL, or import with ?url)
<Environment files="/hdr/zombie-night.hdr" background />
```

For an HDR file in `src/assets/`:
```jsx
import hdrUrl from './assets/zombie-night.hdr?url';
<Environment files={hdrUrl} background />
```

⚠️ Vite doesn't recognize `.hdr` or `.exr` as assets by default. Add to `vite.config.ts`:

```ts
export default defineConfig({
  assetsInclude: ['**/*.hdr', '**/*.exr'],
});
```

---

## 9. Audio

Same rules as textures: small fixed sounds → `src/assets/` with `?url`, large or many → `public/`.

```jsx
import { PositionalAudio } from '@react-three/drei';
import engineUrl from './assets/engine.mp3?url';

<PositionalAudio url={engineUrl} loop autoplay />
```

For Tone.js or Web Audio API directly, prefer `public/` so the file path is stable and you can stream rather than fetch+decode.

---

## 10. Build verification checklist

After `vite build`, before deploying, check:

```bash
# Inspect the dist
ls -la dist/assets/        # hashed assets — should include .glb files
ls -la dist/               # public/ contents — decoders, etc.

# Specifically check
ls dist/assets/*.glb       # imported GLBs
ls dist/draco/             # if self-hosting Draco
ls dist/basis/             # if using KTX2
```

If you self-host decoders and they're missing from `dist/`, the `public/` copy step didn't run. Vite copies `public/` automatically — if files are missing, they were never in `public/` in the first place.

For a quick sanity test: `npx serve dist` → open the browser → check Network tab for any 404s on assets, decoders, textures.

---

## 11. Footgun table

| Symptom | Cause | Fix |
| --- | --- | --- |
| GLTF loads but no textures in production | Imported `.gltf` instead of `.glb`; external textures missing | Convert to GLB or move bundle to `public/` |
| `Failed to load decoder.wasm` in prod | Decoder path points to `node_modules/` | Move decoders to `public/` and update path |
| Model loads in dev, 404 in build | Asset referenced by string path that's not in `public/` | Use `?url` import OR move to `public/` |
| `"Module not found: ./scene.glb"` | Vite doesn't recognize the file extension | Add to `assetsInclude` in vite config |
| Draco model loads from CDN works dev, fails behind firewall | gstatic.com blocked | Self-host decoder, set custom path |
| KTX2 texture shows as black | Forgot `detectSupport(gl)` on KTX2Loader | Add `.detectSupport(gl)` after construction |
| Scene flashes empty before model appears | Forgot `useGLTF.preload(url)` | Add preload at module scope |
| `Suspense boundary missing` error | Component using `useGLTF` not wrapped in Suspense | Wrap in `<Suspense fallback={...}>` |
| 50MB+ GLB shipped to users | Skipped the optimization pipeline | Run `gltf-transform optimize` — see references |
| Scene HDR loads in dev, 404 in prod | `.hdr` extension not in `assetsInclude` | Add to vite config |
| Texture appears blurry / low-res | Texture too compressed by gltf-transform `--texture-size` | Increase target size or exclude texture from compression |
| `THREE.WebGLRenderer: extension not supported` | KTX2 transcoder picked an unsupported format | `detectSupport(gl)` again — must run after renderer ready |
| Hot reload triggers full reload on asset change | Asset is in `public/` | This is correct behavior — `public/` files don't HMR |
| `import.meta.glob` returns empty in build | Glob pattern path is wrong | Vite glob patterns are relative to the importing file, not project root |

---

## 12. References

- `references/asset-decision-tree.md` — for any asset, where it goes (`src/assets/` vs `public/` vs CDN) and how to reference it.
- `references/gltf-pipeline.md` — `gltf-transform` recipes for compressing models. The `optimize` one-liner that handles 90% of cases, plus the custom pipeline for fine control.
- `references/decoder-setup.md` — exact files to copy for Draco / Meshopt / KTX2 decoders, paths to set, version-pinning notes, the CDN-vs-self-hosted decision.
