# TypeScript Slice Template

The canonical pattern for a Zustand store split into typed slices, with `persist` and `subscribeWithSelector` middleware composed correctly. Use this as a starting template for any store beyond ~10 fields.

---

## Minimal slice (no middleware)

```ts
import { create, StateCreator } from 'zustand';

// --- Slice definitions ---

interface PlayerSlice {
  health: number;
  maxHealth: number;
  takeDamage: (amount: number) => void;
  heal: (amount: number) => void;
}

interface WorldSlice {
  zombieCount: number;
  spawnZombie: () => void;
  killZombie: () => void;
}

interface UISlice {
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
}

// Combined store type
type GameStore = PlayerSlice & WorldSlice & UISlice;

// --- Slice creators ---

const createPlayerSlice: StateCreator<GameStore, [], [], PlayerSlice> = (set, get) => ({
  health: 100,
  maxHealth: 100,
  takeDamage: (amount) => set(s => ({ health: Math.max(0, s.health - amount) })),
  heal: (amount) => set(s => ({ health: Math.min(s.maxHealth, s.health + amount) })),
});

const createWorldSlice: StateCreator<GameStore, [], [], WorldSlice> = (set) => ({
  zombieCount: 0,
  spawnZombie: () => set(s => ({ zombieCount: s.zombieCount + 1 })),
  killZombie: () => set(s => ({ zombieCount: Math.max(0, s.zombieCount - 1) })),
});

const createUISlice: StateCreator<GameStore, [], [], UISlice> = (set) => ({
  isPaused: false,
  setPaused: (paused) => set({ isPaused: paused }),
});

// --- Combine ---

export const useGameStore = create<GameStore>()((...a) => ({
  ...createPlayerSlice(...a),
  ...createWorldSlice(...a),
  ...createUISlice(...a),
}));
```

The `(...a)` spreads `[set, get, store]` into each creator, so all slices share the same store instance. Cross-slice access works because each `set`/`get` sees the combined state.

---

## With `persist` middleware

`persist`'s mutator type is `["zustand/persist", unknown]`. Slices need to know about it via the `Mis` type parameter so TS infers `set`/`get` correctly.

```ts
import { create, StateCreator } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type Middlewares = [['zustand/persist', unknown]];

const createPlayerSlice: StateCreator<
  GameStore,
  Middlewares,           // mutators in
  [],                    // mutators out (none added by this slice)
  PlayerSlice            // slice shape
> = (set, get) => ({
  health: 100,
  maxHealth: 100,
  takeDamage: (amount) => set(s => ({ health: Math.max(0, s.health - amount) })),
  heal: (amount) => set(s => ({ health: Math.min(s.maxHealth, s.health + amount) })),
});

// (other slice creators get the same Middlewares parameter)

export const useGameStore = create<GameStore>()(
  persist(
    (...a) => ({
      ...createPlayerSlice(...a),
      ...createWorldSlice(...a),
      ...createUISlice(...a),
    }),
    {
      name: 'kpop-zombie-save',
      storage: createJSONStorage(() => localStorage),
      // Only persist the things that should survive reload
      partialize: (state) => ({
        health: state.health,
        maxHealth: state.maxHealth,
        zombieCount: state.zombieCount,
        // isPaused intentionally not persisted
      }),
      version: 1,
      migrate: (persisted: any, version) => {
        if (version === 0) {
          // example: rename field
          persisted.maxHealth = persisted.maxHp ?? 100;
          delete persisted.maxHp;
        }
        return persisted as GameStore;
      },
    }
  )
);
```

---

## With both `persist` and `subscribeWithSelector`

Order matters. `subscribeWithSelector` augments the store API; `persist` augments behavior. Compose innermost-out:

```ts
import { create, StateCreator } from 'zustand';
import { persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';

type Middlewares = [
  ['zustand/subscribeWithSelector', never],
  ['zustand/persist', unknown],
];

const createPlayerSlice: StateCreator<
  GameStore,
  Middlewares,
  [],
  PlayerSlice
> = (set) => ({
  health: 100,
  maxHealth: 100,
  takeDamage: (amount) => set(s => ({ health: Math.max(0, s.health - amount) })),
  heal: (amount) => set(s => ({ health: Math.min(s.maxHealth, s.health + amount) })),
});

// (other slice creators get the same Middlewares parameter)

export const useGameStore = create<GameStore>()(
  subscribeWithSelector(
    persist(
      (...a) => ({
        ...createPlayerSlice(...a),
        ...createWorldSlice(...a),
        ...createUISlice(...a),
      }),
      {
        name: 'kpop-zombie-save',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          health: state.health,
          maxHealth: state.maxHealth,
        }),
      }
    )
  )
);

// Now you can use the selector form of subscribe:
useGameStore.subscribe(
  s => s.health,
  (health, prevHealth) => {
    if (health < prevHealth) playHurtSound();
  }
);
```

**Order rule:** middleware applied earliest is innermost. `subscribeWithSelector(persist(...))` means `persist` wraps the creator, `subscribeWithSelector` wraps `persist`. The outer one's API is what consumers see — so `subscribeWithSelector` outermost makes its enhanced `subscribe` available on the final hook.

---

## Actions namespace pattern (recommended)

Group actions under a single key so consumers can pull them all in one stable subscription. Combines well with slices.

```ts
interface PlayerSlice {
  health: number;
  maxHealth: number;
  playerActions: {
    takeDamage: (amount: number) => void;
    heal: (amount: number) => void;
    reset: () => void;
  };
}

const createPlayerSlice: StateCreator<GameStore, Middlewares, [], PlayerSlice> = (set) => ({
  health: 100,
  maxHealth: 100,
  playerActions: {
    takeDamage: (amount) => set(s => ({ health: Math.max(0, s.health - amount) })),
    heal: (amount) => set(s => ({ health: Math.min(s.maxHealth, s.health + amount) })),
    reset: () => set({ health: 100 }),
  },
});

// Consumer — actions object identity is stable, so this is one subscription that never re-renders
const { takeDamage, heal } = useGameStore(s => s.playerActions);
```

⚠️ The action namespace itself never changes identity, but `useShallow` is wasted here — you'd be doing a shallow check on a stable reference. Just select it directly.

---

## Cross-slice access

Inside any action, `get()` returns the full combined state — slices can read each other freely.

```ts
const createPlayerSlice: StateCreator<GameStore, Middlewares, [], PlayerSlice> = (set, get) => ({
  health: 100,
  maxHealth: 100,
  playerActions: {
    takeDamage: (amount) => {
      // Read from another slice
      if (get().isPaused) return;
      set(s => ({ health: Math.max(0, s.health - amount) }));
    },
    // ...
  },
});
```

For circular dependencies between slices, refactor — usually one slice should own the data and the other just calls actions.

---

## Selector hooks file (optional but recommended)

Co-locate reusable selectors with the store. Keeps consumers clean and gives you one update site if state shape changes.

```ts
// gameStore.ts
export const useGameStore = create<GameStore>()(/* ... */);

// Selectors
export const useHealth = () => useGameStore(s => s.health);
export const useIsAlive = () => useGameStore(s => s.health > 0);
export const usePlayerActions = () => useGameStore(s => s.playerActions);
export const useWorldActions = () => useGameStore(s => s.worldActions);
export const useIsPaused = () => useGameStore(s => s.isPaused);
```
