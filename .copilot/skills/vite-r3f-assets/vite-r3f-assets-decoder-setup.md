# Decoder Setup (Draco / Meshopt / KTX2)

Compressed assets need decoder/transcoder runtime files. These are not part of your bundle by default — you have to put them somewhere reachable. This is the most common source of "works in dev, breaks in production" bugs in R3F apps.

---

## Quick decision

| Decoder | Default in drei | Files needed | Location |
| --- | --- | --- | --- |
| **Draco** | CDN (gstatic.com) — fine for most | Optional self-host | `public/draco/` if self-hosting |
| **Meshopt** | Bundled with Three — works automatically | None | N/A |
| **KTX2 / Basis** | Not configured by default — you wire it up | `basis_transcoder.js` + `.wasm` | `public/basis/` |

If you're starting fresh and don't need KTX2, you can ship a Meshopt-compressed model and write zero decoder config. drei + Three handle it.

---

## Draco

### Default (CDN — easiest)

drei points to `https://www.gstatic.com/draco/v1/decoders/` automatically. No setup needed unless you have a reason not to use the CDN.

```jsx
const { scene } = useGLTF('/models/car.glb'); // CDN decoder used automatically
```

Tradeoffs:
- ✅ Zero setup, no `public/` files to manage
- ❌ Third-party request (privacy, cookie banners, corporate firewalls block gstatic)
- ❌ Subject to Google's uptime
- ⚠️ Version is implicit — drei chose it, may change

### Self-hosted (recommended for production)

Copy the decoder files from Three to your `public/`:

```bash
# One-time setup
mkdir -p public/draco
cp -r node_modules/three/examples/jsm/libs/draco/* public/draco/
```

You should end up with:
```
public/draco/
  draco_decoder.js
  draco_decoder.wasm
  draco_encoder.js
  draco_encoder.wasm
  draco_wasm_wrapper.js
  gltf/
    draco_decoder.js
    draco_decoder.wasm
    draco_wasm_wrapper.js
```

Note the `gltf/` subfolder — that's the one drei points to when you give it a path.

Then tell drei:

```jsx
// Per-call
const { scene } = useGLTF('/models/car.glb', '/draco/gltf/');

// Or globally (recommended — set once at app start)
useGLTF.setDecoderPath('/draco/gltf/');
```

⚠️ **Trailing slash matters.** `'/draco/gltf'` (no slash) becomes `/draco/gltfdraco_decoder.wasm` — 404. Always end the path with `/`.

### Pinned CDN (compromise)

If you want a stable URL but don't want to self-host:

```jsx
useGLTF.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
```

Pin a specific version. Match it to the version you tested against.

### Build-time copy script

If you want the decoder copy to happen automatically (so a fresh `npm install` Just Works):

```json
{
  "scripts": {
    "postinstall": "node scripts/copy-decoders.js",
    "predev": "node scripts/copy-decoders.js",
    "prebuild": "node scripts/copy-decoders.js"
  }
}
```

```js
// scripts/copy-decoders.js
import { mkdirSync, cpSync, existsSync } from 'fs';

const SRC_DRACO = 'node_modules/three/examples/jsm/libs/draco';
const DST_DRACO = 'public/draco';

if (existsSync(SRC_DRACO)) {
  mkdirSync(DST_DRACO, { recursive: true });
  cpSync(SRC_DRACO, DST_DRACO, { recursive: true });
  console.log('Copied Draco decoder to public/draco');
}
```

---

## Meshopt

drei's `useGLTF` enables Meshopt by default with Three's bundled decoder (imported as JS, no separate WASM file). **Nothing to configure**. If your models are Meshopt-compressed, they just work.

```jsx
const { scene } = useGLTF('/models/car.glb'); // Meshopt enabled automatically
```

Disable if for some reason it conflicts with custom GLTFLoader extensions:

```jsx
const { scene } = useGLTF('/models/car.glb', true, false); // useDraco=true, useMeshOpt=false
```

You almost never need to.

---

## KTX2 (Basis Universal)

KTX2 is the heaviest setup. You need:
1. The basis transcoder files (`basis_transcoder.js` + `.wasm`)
2. A KTX2Loader instance with `setTranscoderPath()`
3. `detectSupport(gl)` called with the WebGL renderer
4. The loader passed to `useGLTF` via `extendLoader`

### Step 1: Copy the transcoder files

```bash
mkdir -p public/basis
cp node_modules/three/examples/jsm/libs/basis/basis_transcoder.js public/basis/
cp node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm public/basis/
```

### Step 2: Wire it up

```jsx
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { KTX2Loader } from 'three-stdlib'; // or 'three/examples/jsm/loaders/KTX2Loader'
import { useMemo } from 'react';

function Model() {
  const { gl } = useThree();

  const ktx2Loader = useMemo(() => {
    const loader = new KTX2Loader();
    loader.setTranscoderPath('/basis/');
    loader.detectSupport(gl);
    return loader;
  }, [gl]);

  const { scene } = useGLTF(
    '/models/scene.glb',
    true,                    // useDraco
    true,                    // useMeshOpt
    (loader) => loader.setKTX2Loader(ktx2Loader)
  );

  return <primitive object={scene} />;
}
```

`detectSupport(gl)` queries the WebGL renderer for which compressed texture formats it supports (S3TC, ETC, ASTC, etc.) and configures the transcoder to output the right one. Without this, KTX2 textures will fail or fall back to slow paths.

`useMemo` matters because creating a new KTX2Loader on every render leaks memory.

### Step 3: Verify

After loading, open DevTools → check the Network tab. You should see the basis transcoder load once, then KTX2 textures load. If you see textures fetching but materials are black, `detectSupport` likely didn't get called.

---

## Combined setup (all three)

For the K-Pop Zombie Road Warrior brief or any production-leaning project, the full setup looks like this. One file, set once at app start.

```jsx
// src/lib/gltf-config.ts
import { useGLTF } from '@react-three/drei';

useGLTF.setDecoderPath('/draco/gltf/');

// KTX2 needs a renderer reference, so it's set up per-component or at root.
// See pattern above for KTX2.
```

```jsx
// src/components/Scene.tsx
import { useThree } from '@react-three/fiber';
import { KTX2Loader } from 'three-stdlib';
import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import '../lib/gltf-config'; // ensures setDecoderPath ran

const useKTX2Loader = () => {
  const { gl } = useThree();
  return useMemo(() => {
    const loader = new KTX2Loader();
    loader.setTranscoderPath('/basis/');
    loader.detectSupport(gl);
    return loader;
  }, [gl]);
};

export function Car() {
  const ktx2Loader = useKTX2Loader();
  const { scene } = useGLTF(
    '/models/car.glb',
    true,
    true,
    (loader) => loader.setKTX2Loader(ktx2Loader)
  );
  return <primitive object={scene} />;
}
```

---

## Version pinning

The decoders evolve. If you hardcode CDN URLs, pin a version:

```jsx
useGLTF.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
```

For self-hosted, the version is whatever shipped with your installed `three` package. When you upgrade `three`, re-run the copy script — your `package.json` `postinstall` covers this if you set it up.

⚠️ **Mismatched decoder version vs encoder version can produce subtle errors.** If a model was Draco-encoded with v1.5.7 and the decoder is v1.4.x, it usually still works but may glitch on edge cases. Keep them in sync where possible.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Failed to fetch decoder.wasm` | Path wrong or `node_modules` reference | Check `useGLTF.setDecoderPath()` value, ensure file exists at that URL |
| Decoder loads but model is broken | Version mismatch | Match encoder/decoder versions; re-encode with current Draco/Meshopt |
| KTX2 texture loads, material is black | `detectSupport(gl)` not called | Add `.detectSupport(gl)` after constructing KTX2Loader |
| Decoder loads on every page nav | KTX2Loader created in render, not memoized | Wrap construction in `useMemo` |
| `WebAssembly.instantiate(): expected magic word` | Server returning HTML 404 page instead of WASM | Network tab will confirm; fix URL or ensure file in `public/` |
| Model loads in dev, decoder 404 in build | Forgot to copy decoder to `public/` before build | Add a build script that copies decoder |
| `KTX2Loader is not a constructor` | Wrong import path | Use `'three-stdlib'` or `'three/examples/jsm/loaders/KTX2Loader'` |
