# Ali's Aigoo Apocalypse — Project Guidelines

## Overview
Educational WA State driver's license test prep game. Player drives a VW Beetle with a plow through a zombie apocalypse, answering quiz questions at mile markers. Built as a monorepo with separate client/server workspaces.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite 5 (port 5173) |
| 3D Engine | React Three Fiber + drei + Rapier physics (`@react-three/rapier`) |
| State | Zustand 5 with `persist` middleware (localStorage) |
| Backend | Express.js (port 3001), CommonJS (`require`) |
| Database | sql.js (pure JS SQLite — no native deps) |
| Auth | JWT (7-day expiry), bcryptjs |
| Path alias | `@/` → `client/src/` via Vite + tsconfig |

## Monorepo Structure
```
/                     # Root: concurrently runs server + client
├── client/           # Vite React app
│   └── src/
│       ├── components/Game3D/   # All 3D scene components (R3F)
│       ├── systems/             # Game systems (pure logic, no JSX)
│       ├── stores/              # Zustand store (single store pattern)
│       ├── hooks/               # React hooks
│       ├── lib/                 # Auth, quiz loading
│       └── types/               # TypeScript types
├── server/           # Express API (CommonJS)
│   └── src/
│       ├── routes/              # REST endpoints
│       ├── db/                  # sql.js wrapper
│       ├── middleware/          # JWT auth
│       └── scripts/             # DB seeding
└── Assets/           # Raw Kenney asset packs (not served)
```

## Build & Run
```bash
npm run dev           # Start both server + client (concurrently)
cd server && npm run seed   # Seed DB with test data
```

## Key Conventions

### Client
- **Systems vs Components**: `systems/` files are pure TS logic called from `useFrame()` — no JSX. `components/Game3D/` are React components.
- **Store access in systems**: Use `useGameStore.getState()` (not hooks) since systems run outside React render cycle.
- **Physics**: Rapier handles all vertical positioning (gravity + collision). Custom code handles only horizontal forces (drive, brake, steering, lateral grip). Never fight Rapier's collision system with custom vertical forces.
- **GLB models**: Loaded via `useGLTF()` from `public/models/`. Preloaded with `useGLTF.preload()`.
- **Vehicle forward direction**: -Z in world space. GLB model natively faces -Z.

### Server
- **CommonJS**: All server files use `require`/`module.exports` (not ESM).
- **sql.js API**: Database wrapper in `db/database.js` exposes a better-sqlite3-compatible sync API on top of async sql.js. Use `getDb()` to access.
- **Auth middleware**: `verifyToken` attaches `req.user` with `uid`, `email`, `role`, `customClaims`.
- **API prefix**: All routes under `/api/` — Vite proxies `/api` → `localhost:3001`.

### General
- Don't add unnecessary comments, docstrings, or type annotations to unchanged code.
- Prefer editing existing files over creating new ones.
- Keep physics constants tuned — don't change values without understanding downstream effects.
