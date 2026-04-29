# sql.js + Vite Setup

The exact configuration that works. Plus the three things that go wrong if you don't do this.

---

## Install

```bash
npm install sql.js
npm install -D @types/sql.js   # if using TypeScript
```

`@types/sql.js` is a separate package — don't skip it.

For convenience persistence:
```bash
npm install idb-keyval         # ~600B IDB wrapper, optional
```

---

## Vite config — recommended approach

The cleanest way: use Vite's `?url` import for the WASM file. Vite handles dev + production paths and asset hashing automatically.

```ts
// src/db/init.ts
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let SQL: SqlJsStatic | null = null;

export async function getSQL(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return SQL;
}

export async function createDatabase(data?: Uint8Array): Promise<Database> {
  const sql = await getSQL();
  return new sql.Database(data);
}
```

No `vite.config.ts` changes needed. The `?url` suffix tells Vite to emit the WASM file as an asset and return its URL string.

---

## Alternative: `public/` directory approach

If `?url` doesn't work in your setup (some monorepos, custom Vite plugins), copy the WASM file to `public/`:

```bash
# One-time setup — add to package.json scripts
cp node_modules/sql.js/dist/sql-wasm.wasm public/sql-wasm.wasm
```

```ts
const SQL = await initSqlJs({
  locateFile: (file) => `/${file}`, // resolves to /sql-wasm.wasm
});
```

⚠️ Files in `public/` aren't hashed for cache busting. If you upgrade sql.js, the browser may serve a stale WASM. Add a query string:

```ts
locateFile: (file) => `/${file}?v=1.14.0`,
```

---

## Alternative: CDN (only for prototypes)

```ts
const SQL = await initSqlJs({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.0/dist/${file}`,
});
```

Don't use this in production — adds a third-party dependency, slower than self-hosted, breaks if CDN is down.

---

## Where to initialize

sql.js init is **async**. Don't put `await initSqlJs()` at module top-level if you have any chance of SSR — it'll break hydration. Three options:

### Option A: Lazy-init inside a hook (recommended for React)

```ts
// useDatabase.ts
import { useEffect, useState } from 'react';
import { Database } from 'sql.js';
import { createDatabase } from './init';
import { loadDb } from './idb-persistence';
import { migrate } from './migrations';

export function useDatabase() {
  const [db, setDb] = useState<Database | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadDb();
      const database = await createDatabase(saved);
      migrate(database);
      if (!cancelled) setDb(database);
    })();
    return () => { cancelled = true; };
  }, []);

  return db;
}
```

### Option B: Suspense boundary

```tsx
// dbResource.ts
import { createDatabase } from './init';

const dbPromise = (async () => {
  const saved = await loadDb();
  return createDatabase(saved);
})();

export function getDb() {
  // simple Suspense-compatible resource
  let status: 'pending' | 'success' | 'error' = 'pending';
  let result: Database;
  let error: Error;
  const suspender = dbPromise.then(
    (r) => { status = 'success'; result = r; },
    (e) => { status = 'error'; error = e; }
  );
  return () => {
    if (status === 'pending') throw suspender;
    if (status === 'error') throw error;
    return result;
  };
}
```

### Option C: Zustand store with init action

```ts
import { create } from 'zustand';

export const useDbStore = create<{
  db: Database | null;
  init: () => Promise<void>;
}>((set, get) => ({
  db: null,
  init: async () => {
    if (get().db) return;
    const saved = await loadDb();
    const db = await createDatabase(saved);
    migrate(db);
    set({ db });
  },
}));

// In App.tsx:
useEffect(() => { useDbStore.getState().init(); }, []);
```

---

## The three failure modes

### Failure 1: `WebAssembly.instantiate(): expected magic word ...`

Browser is fetching the WASM file but getting HTML or 404 instead. Common causes:
- `locateFile` returns wrong path
- Dev server SPA fallback returns `index.html` for `/sql-wasm.wasm`
- File not copied to `public/` or `?url` import not used

**Diagnose:** open DevTools Network tab, find the WASM request, check status code and Content-Type. Should be 200 with `application/wasm`.

**Fix:** confirm file path. Try the `?url` import approach if using `public/` doesn't work, or vice versa.

### Failure 2: WASM file missing from production build

Build succeeds, but runtime fails on the deployed site. The WASM file wasn't bundled.

**Diagnose:** `ls dist/` after `vite build` — look for `sql-wasm-*.wasm` (with hash if `?url` import) or `sql-wasm.wasm` (if from `public/`).

**Fix:** if using `?url`, the import must be in code that's actually included in the bundle (not tree-shaken). If using `public/`, confirm `public/sql-wasm.wasm` exists at build time. Add a build step that copies it if needed.

### Failure 3: WASM loads but `initSqlJs is not a function`

The import returned the wrong shape. Two flavors:

```ts
// CommonJS — older
const initSqlJs = require('sql.js');

// ESM — what Vite uses
import initSqlJs from 'sql.js';
```

Both should work, but if you get `not a function`, you may have done:

```ts
import { initSqlJs } from 'sql.js'; // WRONG — it's a default export
```

**Fix:** `import initSqlJs from 'sql.js'` (default export, no curly braces).

---

## TypeScript types

```ts
import initSqlJs, {
  SqlJsStatic,    // The thing initSqlJs() resolves to
  Database,       // The SQL.Database class
  Statement,      // db.prepare() returns this
  QueryExecResult // db.exec() returns Array<this>
} from 'sql.js';
```

If types resolve to `any`, install `@types/sql.js` separately.

---

## Bundle impact

The sql-wasm.wasm file is ~1.5MB raw, ~700KB gzipped. The JS loader is small (~30KB). For a game or tool that needs SQL, this is fine. For an app that *might* use SQL, lazy-load the init module so users who never trigger DB code don't pay the cost.

```ts
// On user action that needs DB
async function openSaves() {
  const { createDatabase } = await import('./db/init');
  // ... use it
}
```

Vite will code-split this dynamic import automatically.
