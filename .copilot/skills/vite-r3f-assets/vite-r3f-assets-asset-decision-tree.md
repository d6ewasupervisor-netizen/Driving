# Asset Decision Tree

For any asset, two questions:
1. **Where does it live?** — `src/assets/` (imported) or `public/` (copied as-is)
2. **How is it referenced?** — direct import vs `?url` vs hardcoded URL string

---

## Quick lookup

| Asset type | Location | Import pattern |
| --- | --- | --- |
| Single `.glb` model | `src/assets/` | `import url from './model.glb?url'` then `useGLTF(url)` |
| Multi-file `.gltf` bundle (gltf + bin + textures folder) | `public/models/x/` | `useGLTF('/models/x/scene.gltf')` |
| Single texture (`.png`, `.jpg`) | `src/assets/` | `import url from './tex.jpg?url'` then `useTexture(url)` |
| Many textures (terrain tiles, sprite atlas frames) | `public/textures/` | `useTexture('/textures/grass.jpg')` |
| HDR environment map | `src/assets/` (small) or `public/` (large) | `import url from './env.hdr?url'` |
| Short SFX (engine, hit, click) | `src/assets/` | `import url from './hit.mp3?url'` |
| Music / long audio | `public/audio/` | URL string — enables streaming |
| Decoder files (draco, basis transcoder) | `public/draco/`, `public/basis/` | Set path on loader |
| User-generated / runtime-loaded files | `public/` or fetched via API | Pass URL string to loader |
| Fonts (`.ttf`, `.otf`, drei `<Text>`) | `src/assets/` (single font) or `public/` (many) | `?url` import |
| Sprite atlases / icon SVGs | `src/assets/` | Direct import or `?url` depending on usage |

---

## The rules behind the table

### Use `src/assets/` (imported via `?url`) when:
- The asset is a single self-contained file
- It's the same across all builds (no runtime substitution)
- You want cache-busting via content hash
- It's small enough that bundling overhead doesn't matter (< ~10MB)
- HMR for asset changes is useful

### Use `public/` when:
- The asset references other files (GLTF + textures bundle)
- It's a decoder/transcoder file that another library expects at a specific URL
- You need a stable, predictable URL (analytics, sharing links, deep linking)
- The asset might be replaced at deploy time without rebuilding
- It's large and you'd rather stream than fetch+decode (long audio, video)
- It needs to be reachable by URL from outside your bundle

### Don't:
- Reference `node_modules/` paths in runtime code — `node_modules` doesn't exist in production
- `import` GLTF JSON files directly — Vite parses them as modules, breaks them
- Put assets in `src/` without an import — Vite won't include them in the bundle
- Hardcode `dist/` paths — output dir can change

---

## The `?url` suffix

Vite asset imports default to either inlining (small assets become base64) or returning a URL (larger assets). The behavior depends on file size and config — not predictable.

**Always use `?url` for 3D assets.** It forces URL behavior, which is what `useGLTF`, `useTexture`, and friends need.

```ts
// PREFERRED — explicit, always returns string URL
import modelUrl from './car.glb?url';

// AMBIGUOUS — returns URL for large files, base64 for small
import modelUrl from './car.glb';
```

For tiny one-off textures (icons, UI sprites), `?url` is also fine — consistency wins.

---

## When you have many assets of the same kind

`import.meta.glob` returns a map of paths → import functions. Useful for "load all the level files" or "preload every car model."

```ts
// Eager glob — loads all matching files at startup
const carModels = import.meta.glob('./assets/cars/*.glb', {
  query: '?url',
  import: 'default',
  eager: true,
});
// carModels = { './assets/cars/sedan.glb': '/assets/sedan-abc123.glb', ... }

// Lazy glob — returns import functions, call to load
const carModelsLazy = import.meta.glob('./assets/cars/*.glb', {
  query: '?url',
  import: 'default',
});
// const sedanUrl = await carModelsLazy['./assets/cars/sedan.glb']();
```

Patterns are **relative to the importing file**, not the project root. This trips people up.

For very large libraries (50+ models), prefer `public/` + a manifest JSON listing what's available. Glob imports work but Vite has to enumerate them at build time.

---

## Recipe: dual public/imported approach (mod support)

If you want **base assets bundled** but **user-replaceable assets in `public/`**:

```ts
// Try the user override in public/, fall back to bundled
import defaultCarUrl from './assets/car.glb?url';

async function loadCar() {
  const userOverrideUrl = '/mods/car.glb';
  try {
    const response = await fetch(userOverrideUrl, { method: 'HEAD' });
    if (response.ok) return userOverrideUrl;
  } catch {}
  return defaultCarUrl;
}
```

Useful for the K-Pop Zombie Road Warrior brief if Eliana eventually wants to drop in her own car models.

---

## Recipe: lazy-load big assets

Don't pay 50MB on first paint. Code-split:

```ts
async function loadHeavyScene() {
  const { sceneUrl } = await import('./scenes/level-3-data.ts');
  const { scene } = await new Promise((resolve) => {
    useGLTF.preload(sceneUrl);
    // ... use as needed
  });
}
```

For `useGLTF`, the simpler approach: don't import the URL until you need it. The `?url` import is cheap (just a string), but the `useGLTF` call loads the model — wrap in a Suspense boundary that only mounts when needed.

```jsx
{showLevel3 && (
  <Suspense fallback={<Loader />}>
    <Level3 />
  </Suspense>
)}
```

---

## Asset organization conventions

Suggested structure for an R3F project:

```
src/
  assets/
    models/
      car.glb
      zombie.glb
    textures/
      ground.jpg
      grass-normal.jpg
    audio/
      engine.mp3
      hit.mp3
    hdr/
      sunset.hdr
public/
  draco/                  # decoder files
  basis/                  # KTX2 transcoder
  models/                 # GLTF bundles (if any)
    detailed-city/
      scene.gltf
      scene.bin
      textures/
  audio/
    soundtrack.mp3        # large streaming audio
  mods/                   # user-replaceable
```

The `src/assets/` tree gets bundled with hashes. The `public/` tree gets copied verbatim. Both are conceptually under `assets/` from the user's perspective — the split is purely a build-system concern.
