/**
 * Drop-in IndexedDB persistence for sql.js.
 *
 * Single key, single object store. The whole DB is one Uint8Array snapshot.
 * No external dependencies — uses native IndexedDB API.
 *
 * Usage:
 *   import { loadDb, saveDb, setupAutoSave } from './idb-persistence';
 *
 *   const saved = await loadDb();
 *   const db = new SQL.Database(saved);
 *   migrate(db);
 *
 *   const autoSave = setupAutoSave(db, { debounceMs: 1000 });
 *   // ...later: autoSave.markDirty() after each db.run()
 *   // ...on unmount: autoSave.dispose();
 *
 * If you'd rather not maintain this, swap to idb-keyval — it's ~600 bytes
 * and does the same thing.
 */

import type { Database } from 'sql.js';

const DB_NAME = 'app-storage';
const STORE_NAME = 'sqljs';
const KEY = 'main';
const DB_VERSION = 1;

// ---------- Low-level IDB helpers ----------

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IDB open blocked — close other tabs'));
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const idb = await openIDB();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => idb.close();
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const idb = await openIDB();
  return new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => { idb.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const idb = await openIDB();
  return new Promise<void>((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => { idb.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Public API ----------

/**
 * Load the saved database snapshot from IndexedDB.
 * Returns undefined on first run (no data yet).
 */
export async function loadDb(): Promise<Uint8Array | undefined> {
  try {
    return await idbGet<Uint8Array>(KEY);
  } catch (err) {
    console.error('[sqljs-persistence] Failed to load:', err);
    return undefined;
  }
}

/**
 * Save the current database snapshot to IndexedDB.
 * Pass the result of db.export().
 */
export async function saveDb(bytes: Uint8Array): Promise<void> {
  await idbSet(KEY, bytes);
}

/**
 * Delete the saved database. Use for "reset save" or testing.
 */
export async function clearDb(): Promise<void> {
  await idbDelete(KEY);
}

// ---------- Auto-save controller ----------

export interface AutoSaveOptions {
  /** Debounce window in ms — wait this long after the last change before saving. Default 1000. */
  debounceMs?: number;
  /** Maximum delay before forcing a save, even with continuous changes. Default 10000. */
  maxDelayMs?: number;
  /** Called when a save completes (use for "saved" indicators). */
  onSave?: () => void;
  /** Called on save errors. */
  onError?: (err: Error) => void;
}

export interface AutoSaveController {
  /** Call this after any db.run() / db.exec() that modified state. */
  markDirty(): void;
  /** Force an immediate save. Returns when complete. */
  flush(): Promise<void>;
  /** Stop auto-saving and remove listeners. Call on unmount/teardown. */
  dispose(): void;
}

export function setupAutoSave(
  db: Database,
  options: AutoSaveOptions = {}
): AutoSaveController {
  const debounceMs = options.debounceMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 10000;

  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstDirtyAt: number | null = null;
  let saving = false;
  let saveAgain = false;

  async function performSave() {
    if (saving) {
      saveAgain = true;
      return;
    }
    saving = true;
    dirty = false;
    firstDirtyAt = null;
    try {
      const bytes = db.export();
      await saveDb(bytes);
      options.onSave?.();
    } catch (err) {
      options.onError?.(err as Error);
    } finally {
      saving = false;
      if (saveAgain) {
        saveAgain = false;
        scheduleSave();
      }
    }
  }

  function scheduleSave() {
    if (timer) clearTimeout(timer);

    // If we've been dirty too long, save now regardless of debounce
    if (firstDirtyAt && Date.now() - firstDirtyAt >= maxDelayMs) {
      performSave();
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      performSave();
    }, debounceMs);
  }

  function markDirty() {
    if (!dirty) {
      dirty = true;
      firstDirtyAt = Date.now();
    }
    scheduleSave();
  }

  // beforeunload backstop — try to save synchronously-ish on tab close.
  // IDB writes are async, so this is best-effort.
  function onBeforeUnload() {
    if (dirty || saving) {
      // Trigger save without awaiting — the browser may or may not let it complete.
      performSave();
    }
  }
  window.addEventListener('beforeunload', onBeforeUnload);

  return {
    markDirty,
    flush: async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await performSave();
    },
    dispose: () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('beforeunload', onBeforeUnload);
    },
  };
}

// ---------- Wrapped DB convenience ----------

/**
 * Wraps run/exec to auto-mark dirty, so you don't have to remember.
 *
 *   const wrapped = wrapDbWithAutoSave(db, autoSave);
 *   wrapped.run('INSERT INTO ...'); // auto-saves
 *
 * Tradeoff: read-only operations also touch markDirty (cheap), but writes
 * via the raw db won't trigger save. Use one or the other consistently.
 */
export function wrapDbWithAutoSave(db: Database, controller: AutoSaveController) {
  const writeMethods = new Set(['run', 'exec']);
  return new Proxy(db, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function' && writeMethods.has(String(prop))) {
        return (...args: unknown[]) => {
          const result = (value as Function).apply(target, args);
          controller.markDirty();
          return result;
        };
      }
      return value;
    },
  }) as Database;
}
