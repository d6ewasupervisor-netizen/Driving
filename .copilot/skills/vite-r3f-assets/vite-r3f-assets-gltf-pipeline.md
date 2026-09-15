# GLTF Pipeline (gltf-transform)

Most agents skip this and ship 50MB models from Blender. Don't. The optimizer commonly cuts file size by 80–95% with no visual difference.

`gltf-transform` is the standard tool. Single binary, runs locally, predictable output.

---

## Install

```bash
# As a project dev dependency
npm install -D @gltf-transform/cli

# Run via npx
npx gltf-transform optimize input.glb output.glb

# Or globally
npm install -g @gltf-transform/cli
gltf-transform optimize input.glb output.glb
```

For the encoder pieces (Draco, KTX2 with sharp/toktx), you may need additional CLI deps:

```bash
# KTX2 textures need toktx (from KTX-Software)
# Install: https://github.com/KhronosGroup/KTX-Software/releases
# OR use Docker / WebP textures instead

# Draco encoder is bundled
# WebP/AVIF textures use sharp (auto-installed)
```

---

## The one-liner that handles 90% of cases

```bash
gltf-transform optimize input.glb output.glb \
  --compress meshopt \
  --texture-compress webp \
  --texture-size 1024
```

What this does (the `optimize` command runs a pipeline):
- `dedup` — remove duplicate accessors/textures/materials
- `instance` — convert repeated meshes to GPU instancing
- `palette` — combine small textures into a palette
- `flatten` — collapse unnecessary node hierarchies
- `join` — merge meshes that share materials, reducing draw calls
- `weld` — merge identical vertices
- `simplify` — reduce mesh detail (off by default in optimize)
- `resample` — losslessly compact animation keyframes
- `prune` — remove unused data
- `sparse` — sparse-encode mostly-zero accessors
- `meshopt` — compress geometry, animations, morph targets
- `webp` — compress textures, max 1024px

**Default for `optimize`:**
- `--compress` defaults to `meshopt` (was `draco` in older versions)
- `--texture-compress` defaults to `auto` (re-encodes in original format)
- `--texture-size` defaults to 2048

For most R3F projects, **lower texture size to 1024** (`--texture-size 1024`) — humans can't tell the difference at typical viewing distances and VRAM savings are huge.

---

## Recipes by goal

### Smallest possible file (web delivery, low-end devices)

```bash
gltf-transform optimize input.glb output.glb \
  --compress meshopt \
  --texture-compress webp \
  --texture-size 512 \
  --simplify-ratio 0.5
```

`--simplify-ratio 0.5` cuts triangle count in half. Visible quality loss possible — review the output. Combine with LODs for best results.

### Lowest GPU VRAM (mobile, many models on screen)

```bash
gltf-transform optimize input.glb output.glb \
  --compress meshopt \
  --texture-compress ktx2 \
  --texture-size 1024
```

KTX2 uploads compressed straight to GPU — typical VRAM win is 4–8×. Decoder cost: needs the basis transcoder shipped with your app. See `decoder-setup.md`.

### Best-looking (hero asset, marketing shot)

```bash
gltf-transform optimize input.glb output.glb \
  --compress meshopt \
  --texture-compress auto \
  --texture-size 2048
```

Keep textures at original size, no quality loss on geometry. File will be larger but still meaningfully smaller than the unoptimized input.

### Animation-heavy (characters, vehicle parts)

```bash
gltf-transform optimize input.glb output.glb \
  --compress meshopt \
  --texture-compress webp \
  --texture-size 1024
```

Meshopt handles morph targets and keyframe animation well — Draco doesn't. Use Meshopt for anything animated.

### Static prop with mesh detail that doesn't need preserving

```bash
gltf-transform optimize input.glb output.glb \
  --compress meshopt \
  --texture-compress webp \
  --texture-size 512 \
  --simplify-ratio 0.3
```

Cuts polygons by 70%. Good for background/distance objects.

---

## Step-by-step pipeline (when `optimize` isn't enough)

For control over individual stages:

```bash
# 1. Inspect first
gltf-transform inspect input.glb

# 2. Custom pipeline
gltf-transform copy input.glb step0.glb            # always start with a copy
gltf-transform dedup step0.glb step1.glb           # remove duplicates
gltf-transform prune step1.glb step2.glb           # remove unused data
gltf-transform resize step2.glb step3.glb --width 1024 --height 1024
gltf-transform webp step3.glb step4.glb            # compress textures
gltf-transform meshopt step4.glb output.glb --level medium

# Cleanup intermediate files
rm step*.glb
```

Each step is a separate command, so you can stop and inspect at any point. `gltf-transform inspect file.glb` shows you a summary at every stage.

---

## Common gotchas

### Optimize broke my normals/UVs/skinning

`weld` (welding identical vertices) can fail on poorly-authored models. Disable it:

```bash
gltf-transform optimize input.glb output.glb --weld false
```

Same for `flatten` and `join` — disable individually if they cause issues.

### Texture quality is bad after WebP

Default WebP quality is reasonable but lossy. For UI textures or normal maps, exclude them:

```bash
# Compress only baseColor textures
gltf-transform webp input.glb output.glb --slots baseColorTexture
```

Or use lossless WebP for normal maps:

```bash
# (lossless not directly available via CLI flag — use AVIF or skip compression)
gltf-transform webp input.glb output.glb --slots "{baseColorTexture,emissiveTexture}"
```

### KTX2 fails with "toktx not found"

KTX2 encoding requires the `toktx` binary from KTX-Software. Install it from
https://github.com/KhronosGroup/KTX-Software/releases or skip KTX2 in favor of WebP for now.

### File got bigger after optimize

Rare but possible if the input was already heavily optimized or if textures got re-encoded with worse settings. Always run `gltf-transform inspect` on input and output to compare. If output is bigger, check what changed.

---

## Build-time pipeline (npm script)

To run the optimizer automatically before each build:

```json
{
  "scripts": {
    "build:assets": "gltf-transform optimize src/assets/raw/car.glb src/assets/car.glb --compress meshopt --texture-compress webp --texture-size 1024",
    "build": "npm run build:assets && vite build",
    "dev": "npm run build:assets && vite"
  }
}
```

Better — write a small Node script that walks `src/assets/raw/` and processes each file:

```js
// scripts/optimize-assets.mjs
import { execSync } from 'child_process';
import { readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

const RAW = 'src/assets/raw';
const OUT = 'src/assets/models';

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

for (const file of readdirSync(RAW)) {
  if (!file.endsWith('.glb')) continue;
  const inPath = join(RAW, file);
  const outPath = join(OUT, file);

  // Skip if output is newer than input
  if (existsSync(outPath) && statSync(outPath).mtime > statSync(inPath).mtime) {
    console.log(`Skip (up to date): ${file}`);
    continue;
  }

  console.log(`Optimizing ${file}...`);
  execSync(
    `npx gltf-transform optimize "${inPath}" "${outPath}" ` +
    `--compress meshopt --texture-compress webp --texture-size 1024`,
    { stdio: 'inherit' }
  );
}
```

`src/assets/raw/` holds the originals (don't import from there — large, unoptimized). `src/assets/models/` holds the build output (import from here).

Add `src/assets/models/` to `.gitignore` if your raw assets are versioned, since the output is reproducible from input.

---

## Programmatic API (for build scripts or CI)

```js
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const doc = await io.read('input.glb');
await doc.transform(
  dedup(),
  prune(),
  resample(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
);
await io.write('output.glb', doc);
```

Useful for processing many files with custom logic per file.

---

## Inspecting results

```bash
# Quick summary
gltf-transform inspect output.glb

# Diff before/after
gltf-transform inspect input.glb > before.txt
gltf-transform inspect output.glb > after.txt
diff before.txt after.txt

# View in browser
# Open https://gltf.report/ and drag the file in
```

`gltf.report` (by the same author as gltf-transform) is the best free tool for inspecting model contents — texture sizes, draw calls, vertex counts, animation tracks. Drop a model on it before optimizing to know what you're working with.
