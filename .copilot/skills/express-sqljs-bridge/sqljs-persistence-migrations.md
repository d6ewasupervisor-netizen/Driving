# Schema Migrations for sql.js

When persisted data outlives code, schema needs versioning. The right tool is SQLite's built-in `PRAGMA user_version` — a 32-bit integer the database carries with it, no extra table needed.

---

## The migration runner

```ts
import type { Database } from 'sql.js';

type Migration = (db: Database) => void;

const MIGRATIONS: Migration[] = [
  // Index 0: from version 0 (fresh) → version 1
  (db) => {
    db.run(`
      CREATE TABLE players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.run(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  },

  // Index 1: version 1 → version 2
  (db) => {
    db.run(`ALTER TABLE players ADD COLUMN best_lap_ms INTEGER`);
  },

  // Index 2: version 2 → version 3
  (db) => {
    db.run(`CREATE INDEX idx_players_score ON players(score DESC)`);
  },

  // Index 3: version 3 → version 4 (data migration example)
  (db) => {
    // Convert score from arbitrary points to a normalized 0–10000 range
    db.run(`UPDATE players SET score = MIN(10000, score * 10) WHERE score IS NOT NULL`);
  },
];

export function migrate(db: Database): void {
  const result = db.exec('PRAGMA user_version');
  const current = (result[0]?.values[0][0] as number | undefined) ?? 0;

  if (current > MIGRATIONS.length) {
    throw new Error(
      `Database version ${current} is newer than this code supports ` +
      `(max ${MIGRATIONS.length}). User may have a save from a future build.`
    );
  }

  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      MIGRATIONS[v](db);
      db.run(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
      console.log(`[migrate] Applied migration ${v} (v${v} → v${v + 1})`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(
        `Migration ${v} (v${v} → v${v + 1}) failed: ${(err as Error).message}`
      );
    }
  }
}
```

---

## Rules

1. **Never edit a past migration.** Once code with that migration has shipped, someone may have run it. Editing it makes their schema diverge from a fresh install.

2. **Always append.** New schema changes go at the end of the array as a new migration.

3. **Each migration is a transaction.** If a migration fails halfway, roll back. SQLite supports DDL inside transactions; use it.

4. **The last statement of every migration sets `user_version`.** This is what tells the runner the migration succeeded. Do it inside the same transaction.

5. **Test migrations from every prior version.** A user on v1 needs to step through 1→2→3→4. Don't write a migration that assumes a v3 schema state without going through 2.

6. **Migrations should be deterministic.** No `Math.random()`, no `Date.now()` in INSERT values without considering replay. SQLite's own `datetime('now')` is fine.

---

## Common patterns

### Adding a column with default

```ts
(db) => {
  db.run(`ALTER TABLE players ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'normal'`);
}
```

### Renaming a column (SQLite 3.25+)

```ts
(db) => {
  db.run(`ALTER TABLE players RENAME COLUMN score TO total_score`);
}
```

### Restructuring a table (when ALTER isn't enough)

SQLite's `ALTER TABLE` is limited. To drop a column on older SQLite, or change a constraint, you do the rename-and-rebuild dance:

```ts
(db) => {
  // Create new table with desired shape
  db.run(`
    CREATE TABLE players_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      total_score INTEGER NOT NULL DEFAULT 0
      -- old "deprecated_field" column dropped
    )
  `);
  // Copy data
  db.run(`INSERT INTO players_new (id, name, total_score) SELECT id, name, score FROM players`);
  // Drop old, rename new
  db.run(`DROP TABLE players`);
  db.run(`ALTER TABLE players_new RENAME TO players`);
  // Recreate indexes
  db.run(`CREATE INDEX idx_players_score ON players(total_score DESC)`);
}
```

The sql.js bundled SQLite version supports modern `ALTER` (3.45+ as of sql.js 1.14). The rename-and-rebuild is still useful for complex changes.

### Pure data migration (no schema change)

```ts
(db) => {
  // Backfill a new field from existing data
  db.run(`UPDATE players SET total_score = score WHERE total_score IS NULL`);
}
```

### Conditional migration

If you need to inspect the data before deciding what to do:

```ts
(db) => {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM players WHERE name = ''`);
  stmt.step();
  const result = stmt.getAsObject() as { count: number };
  stmt.free();

  if (result.count > 0) {
    db.run(`UPDATE players SET name = 'Player ' || id WHERE name = ''`);
  }
}
```

---

## Migrating imported saves

When the user imports a `.sqlite` file from a previous version (or another user), run migrations on it before trusting the data:

```ts
async function importSave(file: File) {
  const buf = await file.arrayBuffer();
  const importedDb = new SQL.Database(new Uint8Array(buf));

  try {
    migrate(importedDb);  // upgrades schema if needed; throws on future versions
  } catch (err) {
    importedDb.close();
    throw err;
  }

  return importedDb;
}
```

If the imported file's `user_version` is higher than your code knows about, the migration runner throws — refuse the import and tell the user to update.

---

## Testing migrations

A simple harness — run all migrations from each version and verify the final schema:

```ts
import { migrate } from './migrations';

async function testAllMigrationPaths(SQL: SqlJsStatic) {
  // Test fresh install
  const fresh = new SQL.Database();
  migrate(fresh);
  expect(getUserVersion(fresh)).toBe(MIGRATIONS.length);

  // Test each upgrade path: install at version N, migrate to current
  for (let startVersion = 0; startVersion < MIGRATIONS.length; startVersion++) {
    const db = new SQL.Database();
    // Apply migrations 0..startVersion
    for (let i = 0; i < startVersion; i++) {
      MIGRATIONS[i](db);
      db.run(`PRAGMA user_version = ${i + 1}`);
    }
    // Now run the runner — should advance to current
    migrate(db);
    expect(getUserVersion(db)).toBe(MIGRATIONS.length);
    db.close();
  }
}

function getUserVersion(db: Database): number {
  const result = db.exec('PRAGMA user_version');
  return result[0]?.values[0][0] as number ?? 0;
}
```

---

## When to break compatibility

If a save is genuinely incompatible (game mechanics changed fundamentally), don't try to migrate. Instead:

1. Detect the old version in the runner.
2. Rename/move the old DB to a backup key in IDB.
3. Create a fresh DB.
4. Show the user a "your save is from an older version, restored as backup" message.

```ts
if (current === 1 && IS_INCOMPATIBLE_BREAK) {
  await archiveOldSave(db);
  db.close();
  // Caller should create a fresh DB after this
  throw new IncompatibleSaveError();
}
```
