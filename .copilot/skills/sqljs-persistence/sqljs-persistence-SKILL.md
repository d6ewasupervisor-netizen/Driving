---
name: sqljs-persistence
description: Use sql.js (SQLite compiled to WASM) correctly in browser-based apps — including Vite WASM loading, IndexedDB persistence, schema migrations, prepared statements, and import/export of save files. Use this skill any time the user mentions sql.js, sql-wasm, in-browser SQLite, "SQLite in the browser," IndexedDB-backed database, save data, save game, persistence layer, or asks how to "store the database" / "save the data" in a React + Vite app. Trigger even when the user says "SQLite" without specifying the variant — agents commonly conflate sql.js (browser WASM), better-sqlite3 (Node native), node:sqlite (Node 22+ built-in), and expo-sqlite (React Native), and reach for the wrong one. Strongly prefer this skill over guessing — sql.js has no native filesystem, requires manual export/load to persist, and the Vite WASM setup has specific footguns.
---

# sql.js Persistence Skill

This skill covers using sql.js (SQLite compiled to WebAssembly) for in-browser data storage, with the right persistence pattern (IndexedDB, not localStorage) and the right Vite setup. The default "just install SQLite" instinct produces wrong results because there are at least four different SQLite-for-JS packages and they don't share an API.

**Always do this before writing data layer code:**
1. Confirm the runtime — sql.js is **browser only**. For Node/Express, use `better-sqlite3`.
2. Read `references/setup-vite.md` to get the WASM loading right. Most early failures are here.
3. Read `references/idb-persistence.ts` for the canonical save/load module — it's drop-in.

---

## 1. Identity check (which SQLite is this?)

Pick the right package up front. The wrong one will work in dev and break in production, or vice versa.

| Package | Runtime | API style | When to use |
| --- | --- | --- | --- |
| **`sql.js`** | Browser (WASM) | Synchronous queries, async init | In-browser data, offline-first apps, save games, client-side analytics |
| **`better-sqlite3`** | Node.js (native binding) | Synchronous, very fast | Express/server-side, build scripts, CLI tools |
| **`node:sqlite`** | Node 22+ (built-in) | Sync, similar to better-sqlite3 | Node 22+ servers when you don't want a native dep |
| **`@sqlite.org/sqlite-wasm`** | Browser (WASM) | Async, OPFS-capable | Newer alternative — when you specifically need OPFS persistence and can run in a Web Worker |
| **`expo-sqlite`** | React Native | Async | RN apps |

For T's stack (React + Vite frontend, Express backend, sql.js client store): the frontend uses sql.js, the backend should use `better-sqlite3` (or `node:sqlite` on Node 22+). They are not the same package and don't share APIs. If both ends need the same data, you transfer SQLite files (Uint8Arrays) over the network — the format is identical.

---

## 2. The fundamental fact

**sql.js holds the entire database in memory as a `Uint8Array`.** There is no "file." Every query reads/writes the in-memory image. To persist, you serialize and store it yourself. To restore, you deserialize on startup.

```js
import initSqlJs from 'sql.js';

const SQL = await initSqlJs({ locateFile: file => `/${file}` });

// New empty DB
const db = new SQL.Database();

// Or restore from saved bytes
const db = new SQL.Database(savedUint8Array);

// Export current state
const bytes = db.export(); // Uint8Array — store this
```

Implications:
- Refresh the page → DB is gone unless you saved it.
- `db.export()` is a **full snapshot** every time (no incremental writes). For DBs over ~50MB this gets slow.
- Everything is in memory → 100MB DB means 100MB RAM. Plan accordingly.

---

## 3. Vite + WASM loading

The WASM file (`sql-wasm.wasm`, ~1.5MB) needs to be reachable at a URL. sql.js asks for it via `locateFile(filename)` — you tell it where to look.

The simplest reliable pattern: copy the WASM to `public/` and serve from root.

```js
// src/db/init.ts
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

export const SQL = await initSqlJs({
  locateFile: () => wasmUrl,
});
```

Vite's `?url` import resolves the asset path correctly in dev and production. Alternative: copy the file to `public/` manually and use `locateFile: f => '/' + f` — both work. See `references/setup-vite.md` for full config and the three failure modes you'll hit.

⚠️ Don't use `import wasmUrl from 'sql.js/dist/sql-wasm.wasm'` (without `?url`) — Vite will try to bundle the WASM as a module.

---

## 4. Persisting to IndexedDB (the right way)

**localStorage is wrong** for sql.js: 5MB cap, strings only (forces base64 → +33% size), synchronous (blocks main thread). IndexedDB has none of these limits and stores `Uint8Array` natively.

The canonical pattern: **one IndexedDB key holds one snapshot.** No relational complexity in IDB — that's what sql.js is for.

```js
// On startup
const saved = await loadDbFromIDB();
const db = saved ? new SQL.Database(saved) : new SQL.Database();
if (!saved) initSchema(db);

// On change (debounced)
await saveDbToIDB(db.export());
```

The minimal IDB wrapper is ~30 lines. See `references/idb-persistence.ts` for a drop-in module that handles open/upgrade, save/load, debounced auto-save, and `beforeunload` flush.

Use **`idb-keyval`** if you want a one-line dependency (~600B):

```js
import { get, set } from 'idb-keyval';

await set('game-save', db.export());
const saved = await get('game-save'); // Uint8Array | undefined
```

---

## 5. Auto-save strategies

Pick based on how often the data changes:

| Strategy | When | How |
| --- | --- | --- |
| **Debounced** | UI-driven changes, occasional writes | `setTimeout(saveFn, 1000)` reset on each change. 1000ms is the sweet spot. |
| **Periodic** | High-frequency writes (game tick, batch ops) | `setInterval(saveFn, 5000)` + dirty flag |
| **On action** | Discrete user moments (level complete, save button) | Call save explicitly |
| **`beforeunload` backstop** | Belt-and-suspenders for tab close | `window.addEventListener('beforeunload', () => saveSync())` |

In practice, combine **debounced + beforeunload**. The beforeunload handler is the safety net; the debounce does the real work. Don't forget that `beforeunload` only allows synchronous work — your save must complete in microtasks, which IndexedDB's async API doesn't guarantee. For tab-close safety, write a sync snapshot to a `sessionStorage` flag and reconcile on next load if needed.

---

## 6. Schema migrations

Persisted data outlives code. Schema changes need migrations.

Use `PRAGMA user_version` — SQLite's built-in version field. It survives across save/load.

```js
const MIGRATIONS = [
  // index 0: v0 → v1
  (db) => {
    db.run(`CREATE TABLE players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score INTEGER DEFAULT 0
    )`);
  },
  // index 1: v1 → v2
  (db) => {
    db.run(`ALTER TABLE players ADD COLUMN best_lap REAL`);
  },
  // index 2: v2 → v3
  (db) => {
    db.run(`CREATE INDEX idx_players_score ON players(score DESC)`);
  },
];

function migrate(db) {
  const result = db.exec('PRAGMA user_version');
  const current = result[0]?.values[0][0] ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      MIGRATIONS[v](db);
      db.run(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
```

Rules: never edit a past migration. Only append new ones. Each migration in a transaction. See `references/migrations.md` for advanced patterns (data migrations, conditional schema based on existing data).

---

## 7. Query patterns

**Always parameterize.** Never concatenate user input into SQL. SQLite is strict about this and the `?` placeholder is universal.

```js
// BAD — SQL injection
db.run(`INSERT INTO players (name) VALUES ('${name}')`);

// GOOD — parameter binding
db.run('INSERT INTO players (name) VALUES (?)', [name]);
```

Three query methods, each returns differently:

```js
// 1. db.run(sql, params?) — DDL/INSERT/UPDATE/DELETE, no return
db.run('INSERT INTO players (name, score) VALUES (?, ?)', ['T', 1000]);

// 2. db.exec(sql) — runs multiple statements; returns [{columns, values}]
const result = db.exec('SELECT id, name FROM players');
// result = [{ columns: ['id', 'name'], values: [[1, 'T'], [2, 'April']] }]
// Note: exec does NOT take a parameter array. Use prepare() for that.

// 3. db.prepare(sql) — for parameterized SELECT or repeated queries
const stmt = db.prepare('SELECT * FROM players WHERE score > ?');
stmt.bind([500]);
while (stmt.step()) {
  const row = stmt.getAsObject(); // { id: 1, name: 'T', score: 1000 }
  console.log(row);
}
stmt.free(); // release prepared statement memory
```

⚠️ **Always call `stmt.free()`** when done with a prepared statement. sql.js leaks WASM memory otherwise.

Helper for one-shot row fetches:

```js
function queryOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
```

---

## 8. Import/export to/from disk

Letting the user download a `.sqlite` file and re-import it:

```js
// Export
const bytes = db.export();
const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'save.sqlite';
a.click();
URL.revokeObjectURL(a.href);

// Import (from <input type="file">)
input.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const buf = await file.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buf));
  // run migrations on imported DB before trusting it
  migrate(db);
});
```

The exported file opens in any SQLite GUI (DB Browser for SQLite, DBeaver, the `sqlite3` CLI). Useful for debugging.

---

## 9. Performance & limits

- **WASM init is async, queries are sync.** A `SELECT` blocks the main thread. For DBs > a few MB or queries that scan large tables, move sql.js into a Web Worker.
- **`db.export()` cost scales with DB size.** ~5ms per MB on modern hardware. Debounce the save, don't call it on every write.
- **Memory = DB size.** A 50MB DB uses 50MB+ of WASM heap.
- **WASM file is ~1.5MB.** Real impact on first load. Consider lazy-loading the DB module (only init when actually needed).
- **Single connection.** sql.js doesn't have multi-process concurrency concerns, but if you split work across Workers you need to designate one as the writer.

When sql.js gets slow:
1. First — use indexes. Most "sql.js is slow" complaints are missing indexes.
2. Move queries to a Web Worker (`worker.sql-wasm.js` ships with sql.js).
3. If you genuinely need page-level reads on a 100MB+ DB, consider `@sqlite.org/sqlite-wasm` with OPFS — but it requires running in a Worker and has more setup. Not a default.

---

## 10. The architectural split (sql.js + Express)

If sql.js is **just the client store** for a save game, settings, or local cache → great. Keep server data in `better-sqlite3` on the Express side.

If sql.js is being used to query **the same data the server has** → smell. Either:
- Server is the source of truth, client cache → fine, sync via API.
- Client is the source of truth, server is just static → consider whether you need the server at all.
- Both are independently writing → you have a sync problem; consider CRDTs or event sourcing, neither is sql.js's job.

For T's stack: assume sql.js is for client-only state (save data, replay buffers, local stats) and `better-sqlite3` is for server state (user accounts, leaderboards, vendor data). They communicate via JSON over Express endpoints. SQLite files can also be transferred wholesale (Uint8Array → response body) if needed.

---

## 11. Footguns

| Symptom | Cause | Fix |
| --- | --- | --- |
| `WebAssembly.instantiate(): expected magic word` | WASM file served with wrong MIME or path 404 | Check `locateFile` returns reachable URL; verify file in `public/` or via `?url` import |
| `Module not found: 'sql.js'` | Mistyped — package is `sql.js` (with dot) | `npm i sql.js` and `import initSqlJs from 'sql.js'` |
| `db is not a function` | `initSqlJs()` returns the SQL namespace, not a DB | `const SQL = await initSqlJs(); const db = new SQL.Database();` |
| Data lost on refresh | No persistence layer | Add IDB save/load — see §4 |
| `QuotaExceededError` writing to localStorage | Used localStorage instead of IDB | Use IDB; see `references/idb-persistence.ts` |
| Save file corrupted | Wrote Uint8Array as JSON / through `JSON.stringify` | Store as raw `Uint8Array` in IDB; never stringify binary |
| WASM file missing in production build | Vite didn't include it | Use `?url` import or copy to `public/` |
| Memory grows over time | Forgot `stmt.free()` on prepared statements | Always free statements after use |
| Migration runs twice | Forgot to set `user_version` after migration | Wrap migration in transaction including `PRAGMA user_version = N` |
| Slow query, freezes UI | Big query on main thread | Move sql.js into Web Worker, OR add indexes |
| `Error: near "?": syntax error` | Tried to bind params to `db.exec()` | Use `db.prepare()` or `db.run(sql, params)` — `exec` doesn't bind |
| Data wrong type in row | sql.js returns numbers/strings only; no booleans/dates | Store booleans as 0/1, dates as ISO strings or unix timestamps |
| TypeScript can't find types | `@types/sql.js` is separate | `npm i -D @types/sql.js` |
| In React, `await initSqlJs()` at module level breaks SSR | Top-level await + SSR mismatch | Lazy-init inside an effect or a Suspense boundary |

---

## 12. References

- `references/setup-vite.md` — exact package install + Vite config + the three failure modes you'll hit. Read this before writing any sql.js code in a new project.
- `references/idb-persistence.ts` — drop-in TypeScript module: `loadDb()`, `saveDb()`, `setupAutoSave(db, options)`, with debouncing and beforeunload.
- `references/migrations.md` — full migration runner with PRAGMA version tracking, data migrations, and rollback patterns.
