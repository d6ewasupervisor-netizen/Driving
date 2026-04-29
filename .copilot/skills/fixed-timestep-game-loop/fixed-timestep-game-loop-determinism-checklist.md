# Determinism Checklist

If you want a working replay system, networked rollback, deterministic AI, or just "the game runs the same on different machines," your simulation must be deterministic. Same starting state + same inputs → same outputs, every time.

This is not free. It requires discipline. Below is the complete list of things that quietly break determinism.

---

## The hard requirements (must do)

### 1. Fixed timestep
Already covered in SKILL.md. Simulation must advance by the same `dt` every step. No `useFrame` for game logic.

### 2. Inputs recorded per fixed step
Don't record inputs by wall-clock time or per render frame. Record them by **simulation step number**.

```js
const inputLog = [];
let stepCount = 0;

useBeforePhysicsStep(() => {
  const input = { forward: keys.forward, left: keys.left, ... };
  inputLog.push({ step: stepCount, ...input });
  applyInput(input);
  stepCount++;
});
```

To replay: feed `inputLog[step]` back at each step. Trivial.

### 3. Seeded RNG, not `Math.random`
`Math.random()` is non-deterministic — different across calls and impossible to reproduce. Replace with a seeded RNG.

```js
import { createSeededRNG } from './timing-patterns';
const rng = createSeededRNG(12345);

// Wherever you'd use Math.random():
const v = rng();
const enemy = rng.pick(enemyTypes);
```

For replays, save the seed at the start of the run. To replay, recreate the RNG with the same seed.

For multiple independent random streams (one for AI, one for spawning, one for cosmetics), use multiple seeded RNGs. Don't rely on one RNG being called in a deterministic order across systems — that's hard to maintain.

### 4. No wall-clock time inside the simulation
`Date.now()`, `performance.now()`, `new Date()` — all non-deterministic. They drift between machines and between runs.

If you need a clock inside the simulation, use the **simulation step counter** scaled by the fixed dt:

```js
const simulationTimeSeconds = stepCount * (1 / 60);
```

This is exactly reproducible. If you record stepCount = 1234 in your replay, the simulation time is always 20.567s.

If you genuinely need real time (tracking real wall-clock for "you played for 3 minutes" achievement), keep that *outside* the simulation — measure in event handlers and store separately.

### 5. Stable iteration order
Iterating a `Set` or `Map` does have insertion order in modern JS, but it's easy to accidentally break:

```js
// BAD — Set deduplicates by reference, identity differs across runs
const targets = new Set();
for (const enemy of enemies) targets.add(enemy);
// Iteration order depends on insertion order, which depends on enemy creation order...

// GOOD — sort explicitly before iterating
for (const enemy of [...enemies].sort((a, b) => a.id - b.id)) {
  // ...
}
```

Always sort by a stable key (id, name) before iterating where order matters for the simulation.

### 6. No async inside steps
Async means timing is unpredictable. Never `await` inside `useBeforePhysicsStep` or any fixed-tick callback. Don't fetch, don't read files, don't wait for promises.

If a step needs data from somewhere, fetch it ahead of time and have it ready in a ref.

---

## The soft requirements (best practice)

### 7. Avoid floating-point comparison with `===`
Use `Math.abs(a - b) < EPSILON`. Floating-point math is reproducible *within* a machine but slightly drift-prone after many operations. Comparing with `===` makes the bug visible at random.

### 8. Single-threaded simulation
Web Workers run with their own JS heap; coordinating them deterministically is hard. Keep the simulation on the main thread (or one worker) and message-pass with the other.

If you need multiple workers, design the protocol so order doesn't matter (no race conditions on shared state).

### 9. Avoid garbage collection pressure
GC pauses don't break determinism per se, but they make the spiral of death more likely, which can drop simulation steps if the clamp kicks in. Minimize allocations in hot paths:

- Reuse Vector3, Quaternion, Matrix4 objects (don't allocate per frame)
- Use object pools for entities (zombies, bullets, particles)
- Avoid `.map()`/`.filter()` chains in step callbacks; use for-loops

This is more about performance than determinism, but they're related.

### 10. Be careful with iteration that mutates
```js
// BAD — splicing during iteration
for (let i = 0; i < entities.length; i++) {
  if (entities[i].dead) entities.splice(i, 1);
}

// GOOD — collect and remove after
const toRemove = [];
for (let i = 0; i < entities.length; i++) {
  if (entities[i].dead) toRemove.push(i);
}
for (let i = toRemove.length - 1; i >= 0; i--) {
  entities.splice(toRemove[i], 1);
}
```

The mutation-during-iteration version *can* be deterministic but is fragile. Collect-then-mutate is safer.

---

## The cross-platform problem (hard)

JavaScript floating-point is **mostly** deterministic across machines if everyone is on the same V8 version, but:

- `Math.sin`, `Math.cos`, `Math.sqrt`, `Math.pow` results can differ across browser engines (Chrome vs Firefox vs Safari)
- Different CPU instruction sets (x86 vs ARM) can produce different rounding
- WASM (Rapier!) is bit-exact across runtimes — *if* you don't use any operation that's free to vary (Rapier itself is mostly OK, but not perfectly cross-engine)

**Practical advice:**
- For replay within the same browser/machine: standard floating-point determinism is fine
- For networked games or cross-platform replays: don't trust floats; use fixed-point math, or accept that replays only work on the recording machine
- Most casual games can ignore this and use the simpler "same seed + same inputs = same run on this machine" guarantee

For the K-Pop Zombie Road Warrior brief: same-machine replay is plenty. Worry about cross-platform only if you ship to multiple browsers and need shared leaderboards with replay verification.

---

## Common breakers (what you'll actually mess up)

These are easy to miss in code review. Look for them.

| Pattern | Why it breaks | Fix |
| --- | --- | --- |
| `Math.random()` anywhere in the sim | Non-deterministic | Replace with seeded RNG |
| `new Date()` in game logic | Wall-clock drift | Use step count |
| `performance.now()` in damage cooldown | Drifts | Use step count |
| `setTimeout` in game logic | Variable timing | Use step count or fixed-tick accumulator |
| `Promise.all([...])` for spawning | Resolution order varies | Synchronous spawn loop |
| Iterating `Object.keys()` | Order is *mostly* stable but not guaranteed across operations | Use a sorted array of keys |
| Iterating a `Set` of objects | Order = insertion order, fine if insertion is deterministic | Sort by id before iteration if not |
| Reading `Date.now()` for entity ages | Real time, not sim time | `stepCount - entity.spawnStep` |
| `requestAnimationFrame` callback applying gameplay | Non-deterministic timing | Move to fixed step |
| Comparing floats with `===` | Edge cases drift | `Math.abs(a-b) < EPS` |
| Using `Array.sort()` without compare fn | Stable in modern JS, but coercion-based — bug magnet | Always provide compare fn |
| Reading user-side state (`document`, mouse position, scroll) | Async to sim | Snapshot at step boundary |
| Network calls during step | Async | Pre-fetch, snapshot, apply |

---

## Verification: does my replay actually reproduce?

Quick test:
1. Record a 10-second run, save the input log + initial seed
2. Restart the game with the same seed
3. Replay the inputs at each step
4. At the end, check key game state values: positions, scores, RNG state

If they match exactly, determinism is working. If they drift:
- A small drift (sub-pixel positions) usually means floating-point noise — fine
- A meaningful drift (different score, different enemies alive) means you have a non-determinism bug

To find the bug: add a checksum at every Nth step (hash of all entity positions, scores, RNG state). Run the original and the replay side-by-side, compare checksums each step. The first divergence point is where the bug lives.

---

## The "save the world state" alternative

If full determinism is too expensive (or you don't need replay/rollback), the simpler approach: **save full game state periodically**. On replay, restore the snapshot and step forward from there.

- Pro: doesn't require strict determinism
- Pro: snapshots also enable save/load
- Con: snapshots are large
- Con: replay is still subject to non-determinism over long stretches

For a single-player, single-machine game, this is often enough. Pure determinism is needed for multiplayer rollback netcode, esports replay verification, or speedrun timing — most of which won't apply to T's project.

---

## Start small

Don't try to make a non-deterministic game deterministic in one pass. Pick one thing at a time:
1. Switch to fixed timestep (this skill)
2. Replace `Math.random()` with seeded RNG in the simulation
3. Replace any `Date.now()` / `performance.now()` in game logic
4. Sort before iteration anywhere it matters

After step 4, you have replays that work most of the time on the same machine. That's enough for most projects.
