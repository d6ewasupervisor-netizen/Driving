# Selector Patterns

Copy-paste recipes. All examples assume Zustand v5. If you're on v4, the patterns work but the v5 infinite-loop trap doesn't apply (you'll just over-render).

---

## Primitive selectors

The simplest case. Always free, always correct. Use this whenever you can.

```js
const speed = useStore(s => s.speed);
const isPaused = useStore(s => s.isPaused);
const playerName = useStore(s => s.player.name);
```

The selector compares output via `Object.is`. Numbers, strings, booleans, null, undefined all compare correctly.

---

## Multiple primitives, multiple subscriptions

When a component needs several values, split into separate calls. Each subscribes independently — only the changed one re-renders the component.

```js
const speed = useStore(s => s.speed);
const gear = useStore(s => s.gear);
const rpm = useStore(s => s.rpm);
```

This is **fine** even when you need ten values. Zustand's subscription overhead is tiny. Don't over-optimize into one shallow call unless you have a measured reason.

---

## Object selector with `useShallow`

When you genuinely want one subscription that returns multiple values:

```js
import { useShallow } from 'zustand/shallow';

const { speed, gear, rpm } = useStore(
  useShallow(s => ({ speed: s.speed, gear: s.gear, rpm: s.rpm }))
);
```

Re-renders only when one of the three changes. The selector creates a new object every call, but `useShallow` does a shallow-equal check on its keys before triggering a re-render.

---

## Array destructuring with `useShallow`

Same idea, tuple form. Useful for "value + setter" pairs:

```js
import { useShallow } from 'zustand/shallow';

const [speed, setSpeed] = useStore(
  useShallow(s => [s.speed, s.setSpeed])
);
```

---

## Action-only subscription (free)

Action functions never change identity in Zustand. So pulling all of them out at once is safe without `useShallow`, **but only if you select them individually**:

```js
const setSpeed = useStore(s => s.setSpeed);
const setGear = useStore(s => s.setGear);
const reset = useStore(s => s.reset);
```

Or with `useShallow` for one subscription:

```js
const { setSpeed, setGear, reset } = useStore(
  useShallow(s => ({ setSpeed: s.setSpeed, setGear: s.setGear, reset: s.reset }))
);
```

Pattern: keep actions in a single `actions` namespace inside the store so consumers can pull them all at once:

```js
const useStore = create((set) => ({
  speed: 0,
  gear: 1,
  actions: {
    setSpeed: (v) => set({ speed: v }),
    setGear: (g) => set({ gear: g }),
    reset: () => set({ speed: 0, gear: 1 }),
  },
}));

// Consumer — single primitive subscription, never re-renders (actions object identity stable)
const { setSpeed, setGear } = useStore(s => s.actions);
```

---

## Computed / derived selectors

Compute inside the selector. Return a primitive when possible to skip `useShallow`.

```js
// Returns primitive — no useShallow needed
const totalWeight = useStore(s => s.items.reduce((sum, i) => sum + i.weight, 0));

// Returns array — needs useShallow, OR push the .map inside useMemo at consumer
const itemNames = useStore(useShallow(s => s.items.map(i => i.name)));

// Or: select the array, memoize the map at the consumer
const items = useStore(s => s.items);
const itemNames = useMemo(() => items.map(i => i.name), [items]);
```

---

## Reusable selector hooks (custom hooks)

For selectors used in many places, wrap in a hook. Co-locate with the store file.

```js
// store.js
export const useStore = create(/* ... */);
export const useSpeed = () => useStore(s => s.speed);
export const useIsAlive = () => useStore(s => s.health > 0);
export const usePlayerActions = () => useStore(s => s.actions);
```

This keeps consumers clean and gives you one place to update the selector if state shape changes.

---

## Stable fallback (v5 trap)

Returning a non-deterministic value from a selector causes infinite loops in v5:

```js
// BAD — `() => {}` is a new function each call
const action = useStore(s => s.maybeAction ?? (() => {}));

// GOOD — fallback is module-level
const NOOP = () => {};
const action = useStore(s => s.maybeAction ?? NOOP);

// GOOD — splitting into two selectors
const maybeAction = useStore(s => s.maybeAction);
const action = maybeAction ?? NOOP;
```

Same trap with default objects: `s => s.config ?? {}` is wrong. `const EMPTY_CONFIG = {}; s => s.config ?? EMPTY_CONFIG` is right.

---

## Async actions

Async lives inside the action. The action returns a promise; consumers can `await` it.

```js
const useStore = create((set, get) => ({
  user: null,
  loading: false,
  error: null,

  fetchUser: async (id) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/users/${id}`);
      const user = await res.json();
      set({ user, loading: false });
      return user;
    } catch (error) {
      set({ error, loading: false });
      throw error;
    }
  },
}));

// Consumer
const fetchUser = useStore(s => s.fetchUser);
useEffect(() => { fetchUser(123); }, [fetchUser]);
```

For complex async (cancellation, retries, caching), use TanStack Query. Don't reinvent it inside Zustand.

---

## Transient subscription (no React re-render)

For per-frame readers — see SKILL.md §4.

```js
// With subscribeWithSelector middleware:
useEffect(() => {
  const unsub = useStore.subscribe(
    s => s.speed,                              // selector
    (speed, prevSpeed) => { ref.current = speed; }, // callback
    { fireImmediately: true }                  // run once on mount
  );
  return unsub;
}, []);
```

Without `subscribeWithSelector`, base `subscribe(callback)` fires on every state change with full state — almost always wrong for performance-critical code.

---

## Reading once without subscribing

For event handlers, callbacks, anywhere you need the *current* value without subscribing:

```js
const handleClick = () => {
  const { speed, gear } = useStore.getState();
  console.log(`Stopped at ${speed} in gear ${gear}`);
};
```

`getState()` returns the current state directly. Triggers no subscription, no re-render. Safe to call from anywhere — physics callbacks, timers, network handlers.

---

## Anti-patterns

```js
// ❌ Returns whole state — re-renders on every change
const state = useStore();

// ❌ Returns new object each call — INFINITE LOOP in v5
const obj = useStore(s => ({ a: s.a, b: s.b }));

// ❌ Returns new array each call — INFINITE LOOP in v5
const [a, b] = useStore(s => [s.a, s.b]);

// ❌ Filter or map without useShallow — INFINITE LOOP in v5
const enemies = useStore(s => s.entities.filter(e => e.type === 'zombie'));

// ❌ Conditional subscription — selector must always run
const data = condition ? useStore(s => s.a) : useStore(s => s.b);

// ❌ Selector with side effects
const speed = useStore(s => { console.log(s); return s.speed; });
```
