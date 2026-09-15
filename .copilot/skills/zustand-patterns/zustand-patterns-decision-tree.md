# Decision Tree: Where Does This State Belong?

A flat lookup. Match the question to the row, take the answer.

---

## Quick triage

| Question about your state | Answer |
| --- | --- |
| Does it change every frame? | → **ref** (or transient subscription if also in store) |
| Is it a Three.js / Rapier object? | → **ref**, never store |
| Is it shown in the UI and changes occasionally? | → **store** |
| Is it shown in the UI **and** also read every frame? | → **store + transient subscribe** |
| Should it survive page reload? | → **store with persist middleware** (or sql.js for large data) |
| Is it only used inside one component, no children? | → **useState** |
| Is it derived from other state? | → don't store it; compute on read or use a getter |
| Is it a constant that never changes? | → **module-level const**, not state |
| Is it an asset cache / object pool? | → **useRef** or **module-level** |

---

## Long form, by category

### 1. Three.js / Rapier objects

Never put these in Zustand:
- `THREE.Mesh`, `THREE.Group`, `THREE.Object3D`, `THREE.Material`, `THREE.Texture`
- `RapierRigidBody`, `RapierCollider`, `World`, `DynamicRayCastVehicleController`
- Audio nodes, video elements, canvas refs
- Any class instance with WASM memory or a `.dispose()` method

**Why:** these aren't serializable, can't be equality-checked meaningfully, and putting them in store means Zustand may try to compare them on update — slow at best, broken at worst. They also commonly leak when the component unmounts but the store reference keeps them alive.

**Where instead:** `useRef`. If multiple components need the same object, use `useRef` + Context, or store the *id* in Zustand and resolve via a registry kept outside React.

---

### 2. Per-frame state (60+ Hz updates)

Examples: current vehicle speed, current camera offset, mouse position in 3D space, current zombie count visible on screen, distance to next checkpoint.

**Where:** depends on who reads it.

| Reader | Storage |
| --- | --- |
| Only `useFrame` / physics callbacks | `useRef` |
| Both `useFrame` and HUD (DOM) | Store + transient subscribe in the frame reader |
| Only HUD, ~30Hz acceptable | Store, throttled writes (only update on meaningful change) |

**Critical:** if you put per-frame state in Zustand and subscribe normally via `useStore`, every component that subscribes will re-render at that frequency. Inside `<Canvas>`, this kills performance.

The throttling pattern:
```js
useAfterPhysicsStep(() => {
  const speed = controllerRef.current.currentVehicleSpeed();
  const prev = useGameStore.getState().speed;
  if (Math.abs(speed - prev) > 0.5) {
    useGameStore.setState({ speed });
  }
});
```

---

### 3. UI state

Examples: modal open, current menu screen, paused, settings dialog open, selected loadout.

**Where:** Zustand store. Re-renders on change are correct here — that's how the UI updates.

If the state is purely local to one component (e.g. a dropdown's open state), use `useState` instead. Don't reach for the store for everything.

---

### 4. Game state (player-facing, persistent)

Examples: health, score, lives, level, inventory, quest progress, achievements, settings.

**Where:** Zustand store, with `persist` middleware partializing the things that should survive reload.

For large structured saves (entity lists, level state, replay data) prefer sql.js over localStorage — localStorage caps at ~5MB and is synchronous.

---

### 5. Derived state

Examples: total inventory weight from item list, formatted speed string, computed difficulty multiplier, grid coordinate from world position.

**Don't store.** Compute on read.

```js
// BAD — can drift, requires keeping in sync
const useStore = create((set) => ({
  items: [],
  totalWeight: 0,
  addItem: (item) => set(s => ({
    items: [...s.items, item],
    totalWeight: s.totalWeight + item.weight, // forgot one place → drift
  })),
}));

// GOOD — compute in selector
const totalWeight = useStore(s => s.items.reduce((sum, i) => sum + i.weight, 0));
// Use useShallow if returning more than a primitive
```

If the computation is expensive, memoize at the consumer:
```js
const items = useStore(s => s.items);
const totalWeight = useMemo(() => items.reduce((sum, i) => sum + i.weight, 0), [items]);
```

---

### 6. Transient interaction state

Examples: drag offset, hover target, current touch points, in-progress gesture.

**Where:** `useRef` or `useState` colocated with the component handling the interaction. Don't pollute the store with state that no other component needs.

If you find yourself wanting to hoist this into Zustand, ask whether two components actually need it. Usually no — pass via Context or props instead.

---

### 7. Asset caches, object pools, registries

Examples: loaded GLTF cache, audio buffer cache, zombie pool, particle system pool, material library.

**Where:** module-level or `useRef`.

```js
// module-level cache
const gltfCache = new Map();
export const getCachedGLTF = (url) => gltfCache.get(url);
```

These aren't "state" in the React sense — nothing should re-render when the cache changes. If consumers need to know when a load completes, use a separate Zustand boolean (`assetsReady`) or a Promise.

---

### 8. Cross-system communication

Examples: "the player just damaged a zombie, the audio system should play a hit sound," "the game just paused, all systems should freeze."

**Where:** Zustand store, with `subscribeWithSelector` middleware. The audio system subscribes to the relevant slice of state via `useStore.subscribe(selector, callback)` — no React re-render, just a side-effect callback when state changes.

This is much cleaner than event emitters because the state itself is the source of truth — late subscribers can read current state via `getState()`.

---

## When in doubt

Default to `useState` if the state is local. Default to Zustand if it's shared. Default to `useRef` if it's a Three.js/Rapier object or changes per-frame. Add transient subscriptions only when the same state is shared between React UI and per-frame consumers.
