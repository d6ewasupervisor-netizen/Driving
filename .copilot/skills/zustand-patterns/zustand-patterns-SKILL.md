---
name: zustand-patterns
description: Patterns and footguns for Zustand state management, especially in React Three Fiber + @react-three/rapier projects where re-renders inside the Canvas are expensive. Use this skill any time the user mentions zustand, store, state management, useStore, slice, selector, persist, or asks "where should I put X" / "should this go in state" in a React + R3F context. Trigger even on vague references like "the store", "global state", or "state management for the game". Strongly prefer this skill over guessing — Zustand v5 changed selector semantics such that returning new references now causes infinite loops (not just unnecessary re-renders), and the canonical R3F-friendly patterns (transient subscriptions, refs vs store) are commonly missed.
---

# Zustand Patterns Skill

This skill covers Zustand state management with a strong R3F + Rapier bias. The default React app advice ("just put it in a store") is wrong inside a Canvas — re-rendering a Three.js scene tree is dramatically more expensive than re-rendering a div, and per-frame state updates need to bypass React entirely.

**Always do this before writing store code:**
1. Read `references/decision-tree.md` to decide *where* the state belongs (store / ref / transient).
2. If using TypeScript, read `references/slice-template.md` for the canonical slice pattern.
3. Read `references/selector-patterns.md` for copy-paste recipes.

Assumes Zustand v5. Notes for v4 are inline where behavior differs.

---

## 1. The single rule

**Subscribe to the smallest slice you actually use.** Every component that subscribes re-renders when its selected slice changes. A component reading `useStore(s => s)` re-renders on every state change anywhere in the store. Inside `<Canvas>`, that means re-mounting/re-rendering Three.js components — orders of magnitude more expensive than DOM.

```jsx
// BAD — re-renders on any state change
const state = useStore();

// BAD — re-renders on any state change (object identity changes each call)
const { speed, gear } = useStore(s => ({ speed: s.speed, gear: s.gear }));

// GOOD — primitive selector, only re-renders when speed changes
const speed = useStore(s => s.speed);

// GOOD — multiple primitives, two subscriptions, each independent
const speed = useStore(s => s.speed);
const gear = useStore(s => s.gear);

// GOOD — multiple values, one subscription, with shallow equality
const { speed, gear } = useStore(useShallow(s => ({ speed: s.speed, gear: s.gear })));
```

---

## 2. v5 selector semantics (critical)

**v5 changed behavior**: if a selector returns a new reference (new object/array) on every call, you now get an **infinite loop**, not just over-rendering. Error message: `Maximum update depth exceeded`.

This breaks the v4 idiom of returning `[a, b]` or `{ a, b }` from a selector without `shallow`. Three options:

```js
// Option A — split into multiple primitive selectors (simplest, often best)
const a = useStore(s => s.a);
const b = useStore(s => s.b);

// Option B — use useShallow
import { useShallow } from 'zustand/shallow';
const [a, b] = useStore(useShallow(s => [s.a, s.b]));

// Option C — opt back into v4 behavior with createWithEqualityFn (don't, unless migrating)
import { createWithEqualityFn as create } from 'zustand/traditional';
```

Stable references are also needed for fallbacks — `state.action ?? (() => {})` creates a new function each call, infinite loop. Pull the fallback to module scope: `const NOOP = () => {}; const action = useStore(s => s.action ?? NOOP);`.

---

## 3. Actions colocated with state

Actions live inside the store, not as separate hooks or files. They access `set` and `get` to read/write state.

```js
const useGameStore = create((set, get) => ({
  speed: 0,
  health: 100,
  damage: 0,

  setSpeed: (v) => set({ speed: v }),
  takeDamage: (amount) => set(s => ({ health: s.health - amount })),
  reset: () => set({ speed: 0, health: 100, damage: 0 }),

  // get() reads current state (useful inside actions that depend on other slices)
  applyDamageMultiplier: (mult) => {
    const { health } = get();
    set({ health: health * mult });
  },
}));
```

Action functions never change identity in Zustand, so subscribing to all of them with `useShallow` is safe and a common pattern:

```js
const { setSpeed, takeDamage, reset } = useStore(
  useShallow(s => ({ setSpeed: s.setSpeed, takeDamage: s.takeDamage, reset: s.reset }))
);
```

---

## 4. Transient updates (the R3F killer pattern)

For state that changes per-frame and is read by `useFrame` / `useBeforePhysicsStep` callbacks, **never** subscribe via `useStore` — bypass React entirely with `subscribe`.

```jsx
const speedRef = useRef(useGameStore.getState().speed);

useEffect(() => {
  const unsub = useGameStore.subscribe(s => {
    speedRef.current = s.speed; // updates without re-rendering
  });
  return unsub;
}, []);

useFrame(() => {
  // read speedRef.current — never triggers re-render
  cameraOffset.z = -speedRef.current * 0.05;
});
```

To subscribe to a *specific* slice (so the callback only fires when that slice changes), enable `subscribeWithSelector` middleware:

```js
import { subscribeWithSelector } from 'zustand/middleware';

const useStore = create(subscribeWithSelector((set) => ({
  speed: 0,
  health: 100,
})));

// Now subscribe accepts (selector, callback, options?)
useStore.subscribe(
  s => s.speed,
  (speed, prevSpeed) => { speedRef.current = speed; },
  { fireImmediately: true }
);
```

This is the most important R3F pattern — it lets the HUD-adjacent state stay in the store (single source of truth) while per-frame consumers bypass React.

---

## 5. Store access outside React

`useStore.getState()` and `useStore.setState()` work anywhere — physics callbacks, network handlers, event listeners, browser APIs. They don't trigger re-renders themselves; they update state, and any subscribed components re-render normally.

```js
// Inside useBeforePhysicsStep — not React, but can still write to store
useBeforePhysicsStep(() => {
  const speed = controllerRef.current.currentVehicleSpeed();
  // Throttle: only update store when changed meaningfully
  if (Math.abs(speed - useGameStore.getState().speed) > 0.5) {
    useGameStore.setState({ speed });
  }
});
```

⚠️ Middleware that modifies `set`/`get` (like `immer`, `devtools`) does **not** affect `getState`/`setState` calls. If you need immer outside React, call the action method instead of `setState` directly.

---

## 6. Slice pattern (when the store grows)

For stores beyond ~10 fields, split into slices. Each slice is a `StateCreator` returning a partial state object. Combine with object spread.

```ts
import { create, StateCreator } from 'zustand';

interface PlayerSlice {
  health: number;
  takeDamage: (n: number) => void;
}

interface WorldSlice {
  zombieCount: number;
  spawnZombie: () => void;
}

type GameStore = PlayerSlice & WorldSlice;

const createPlayerSlice: StateCreator<GameStore, [], [], PlayerSlice> = (set) => ({
  health: 100,
  takeDamage: (n) => set(s => ({ health: s.health - n })),
});

const createWorldSlice: StateCreator<GameStore, [], [], WorldSlice> = (set) => ({
  zombieCount: 0,
  spawnZombie: () => set(s => ({ zombieCount: s.zombieCount + 1 })),
});

export const useGameStore = create<GameStore>()((...a) => ({
  ...createPlayerSlice(...a),
  ...createWorldSlice(...a),
}));
```

Cross-slice access works because each slice's `set`/`get` sees the combined state. See `references/slice-template.md` for the full template with middleware.

---

## 7. Persistence

The `persist` middleware syncs to `localStorage` (or any storage). Use **`partialize`** to avoid persisting transient/derived state.

```js
import { persist, createJSONStorage } from 'zustand/middleware';

const useStore = create(persist(
  (set) => ({
    // saved
    highScore: 0,
    settings: { volume: 0.8, difficulty: 'normal' },
    // not saved
    currentSpeed: 0,
    isPaused: false,
  }),
  {
    name: 'kpop-zombie-save',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      highScore: state.highScore,
      settings: state.settings,
    }),
    version: 1,
    migrate: (persisted, version) => {
      if (version === 0) { /* migrate */ }
      return persisted;
    },
  }
));
```

⚠️ v5 change: `persist` no longer stores initial state at creation time. State is only persisted after the first explicit update.

For larger save data (game state with arrays of entities, etc.), prefer SQLite (sql.js) over localStorage — see the `sqljs-persistence` skill.

---

## 8. What goes where: refs vs store vs transient

Quick decisions (full flowchart in `references/decision-tree.md`):

| What | Where | Why |
| --- | --- | --- |
| `RapierRigidBody`, `THREE.Mesh`, vehicle controller | `useRef` | Not serializable; identity matters; mutations should bypass React |
| Player health, score, gear, settings | Zustand store | UI shows it; persists; cross-component shared |
| Current speed (60Hz read by camera + HUD) | Store + transient subscribe | Source of truth in store; bypasses re-render via subscribe |
| Mouse position, hover state in 3D | Refs or transient | Updates per-frame; React shouldn't see it |
| Modal open, menu route, paused | Zustand store | Re-renders are appropriate here |
| Object pools, asset cache, texture refs | `useRef` or module-level | Not state; React shouldn't track |
| Dialogue progress, quest state | Zustand store | Cross-component, persists |

---

## 9. Common footguns

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Maximum update depth exceeded` | Selector returns new reference each call (v5) | Split into primitives, use `useShallow`, or pull constant to module scope |
| HUD updates 60Hz, scene jank | HUD subscribes to position/speed via `useStore` | Move per-frame state to refs + transient subscriptions |
| Action triggers full Canvas re-render | Component subscribed to whole store | Subscribe to specific slice via selector |
| `setState` works but UI doesn't update | Reading via `getState()` in a component | Subscribe via `useStore(selector)` instead |
| State resets on hot reload | Vite HMR re-runs `create()` | Move store to its own module; don't re-create on render |
| Three.js object stored in Zustand | Mistake | Move to `useRef`; store the *id* in Zustand if needed |
| Action identity changes | Action defined inline in component | Define inside `create()` — actions never change identity there |
| Store grows to 30+ fields, hard to navigate | No slicing | Split into slices (see §6) |
| Persisted state has stale shape after refactor | No version migration | Add `version` + `migrate` to persist config |
| `subscribe` callback fires for every change | Using base `subscribe` without selector middleware | Add `subscribeWithSelector` middleware |

---

## 10. TypeScript

Always use the curried `create<T>()(...)` form to preserve type inference through middleware:

```ts
// CORRECT
const useStore = create<GameStore>()(persist(
  (set) => ({ /* ... */ }),
  { name: 'save' }
));

// WRONG — loses inference inside middleware
const useStore = create<GameStore>(persist(
  (set) => ({ /* ... */ }),
  { name: 'save' }
));
```

For slices, `StateCreator<TStore, Mis, Mos, TSlice>` — the middleware mutators (`Mis`/`Mos`) match what the combined store uses. See `references/slice-template.md`.

---

## 11. References

- `references/decision-tree.md` — where does this state belong? Refs / store / transient / module-level.
- `references/selector-patterns.md` — copy-paste selectors for primitive, object-via-shallow, derived/computed, and async patterns.
- `references/slice-template.md` — TS slice pattern, with persist + devtools middleware composed correctly.
