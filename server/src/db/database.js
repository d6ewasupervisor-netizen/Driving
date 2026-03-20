const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let db = null;
let dbPath = null;

// Wrapper to provide better-sqlite3-compatible API
class DatabaseWrapper {
  constructor(sqliteDb, filePath) {
    this._db = sqliteDb;
    this._path = filePath;
  }

  exec(sql) {
    this._db.run(sql);
    this._save();
    return this;
  }

  prepare(sql) {
    const self = this;
    return {
      run(...params) {
        const stmt = self._db.prepare(sql);
        stmt.bind(params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0]) 
          ? params[0] 
          : params);
        stmt.step();
        stmt.free();
        self._save();
        return { changes: self._db.getRowsModified() };
      },
      get(...params) {
        const stmt = self._db.prepare(sql);
        stmt.bind(params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
          ? params[0]
          : params);
        const result = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return result;
      },
      all(...params) {
        const stmt = self._db.prepare(sql);
        stmt.bind(params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])
          ? params[0]
          : params);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      }
    };
  }

  pragma(setting) {
    this._db.run(`PRAGMA ${setting}`);
    this._save();
  }

  _save() {
    if (this._path) {
      const data = this._db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this._path, buffer);
    }
  }

  close() {
    this._save();
    this._db.close();
  }
}

async function initDatabase() {
  dbPath = process.env.DB_PATH || './data/aigoo.db';
  const dbDir = path.dirname(dbPath);
  
  // Ensure data directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // Initialize sql.js
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  let sqliteDb;
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    sqliteDb = new SQL.Database(fileBuffer);
  } else {
    sqliteDb = new SQL.Database();
  }
  
  db = new DatabaseWrapper(sqliteDb, dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // ==========================================
  // USERS TABLE
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      role TEXT NOT NULL DEFAULT 'player',
      parent_name TEXT,
      invite_code TEXT UNIQUE,
      custom_claims TEXT DEFAULT '{}',
      settings TEXT DEFAULT '{"soundEnabled":true,"notificationsEnabled":true}',
      email_verified INTEGER DEFAULT 0,
      provider TEXT DEFAULT 'email',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_login TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_invite_code ON users(invite_code);
  `);
  
  // ==========================================
  // LINKED ACCOUNTS (parent-player relationships)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS linked_accounts (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      linked_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(parent_id, player_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_linked_parent ON linked_accounts(parent_id);
    CREATE INDEX IF NOT EXISTS idx_linked_player ON linked_accounts(player_id);
  `);
  
  // ==========================================
  // GAME PROGRESS
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS game_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      current_mile INTEGER DEFAULT 0,
      current_chapter INTEGER DEFAULT 1,
      total_play_time_minutes INTEGER DEFAULT 0,
      stress_level INTEGER DEFAULT 50,
      vehicle_health INTEGER DEFAULT 100,
      unlocked_upgrades TEXT DEFAULT '[]',
      lovestops_visited TEXT DEFAULT '[]',
      last_save_location TEXT,
      last_save_timestamp TEXT,
      journey_complete INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_game_progress_user ON game_progress(user_id);
  `);
  
  // ==========================================
  // QUIZ PERFORMANCE
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_performance (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      total_questions_answered INTEGER DEFAULT 0,
      total_correct INTEGER DEFAULT 0,
      overall_accuracy REAL DEFAULT 0.0,
      category_accuracy TEXT DEFAULT '{}',
      missed_questions TEXT DEFAULT '[]',
      test_simulation_scores TEXT DEFAULT '[]',
      ready_for_test_status TEXT DEFAULT 'practicing',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_quiz_performance_user ON quiz_performance(user_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_performance_updated ON quiz_performance(updated_at);
  `);
  
  // ==========================================
  // PARENT MESSAGES (Radio Messages)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS parent_messages (
      id TEXT PRIMARY KEY,
      from_parent_id TEXT NOT NULL,
      from_parent_name TEXT NOT NULL,
      to_player_id TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_at TEXT DEFAULT (datetime('now')),
      read_at TEXT,
      displayed_as_radio INTEGER DEFAULT 0,
      FOREIGN KEY (from_parent_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_player_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_messages_player ON parent_messages(to_player_id);
    CREATE INDEX IF NOT EXISTS idx_messages_player_read ON parent_messages(to_player_id, read_at);
    CREATE INDEX IF NOT EXISTS idx_messages_sent ON parent_messages(sent_at);
  `);
  
  // ==========================================
  // SESSION LOGS
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_start TEXT DEFAULT (datetime('now')),
      session_end TEXT,
      miles_this_session INTEGER DEFAULT 0,
      questions_answered_this_session INTEGER DEFAULT 0,
      correct_this_session INTEGER DEFAULT 0,
      events_triggered TEXT DEFAULT '[]',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_session_user ON session_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_session_start ON session_logs(session_start);
    CREATE INDEX IF NOT EXISTS idx_session_user_start ON session_logs(user_id, session_start);
  `);
  
  // Create sessions table for token management
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
  
  // Create refresh_tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  
  console.log('Database initialized successfully');
  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

module.exports = { initDatabase, getDb };
