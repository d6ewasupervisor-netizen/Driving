---
description: "Use when modifying Express routes, database queries, JWT auth, API endpoints, or server middleware."
applyTo: "server/src/**"
---

# Server API

## Architecture
Express.js server (CommonJS) on port 3001. All files use `require`/`module.exports`.

### Database
- `sql.js` (pure JS SQLite, no native deps) — async init, sync queries after
- Wrapper in `db/database.js` exposes better-sqlite3-compatible API: `db.prepare(sql).get(params)`, `.all(params)`, `.run(params)`
- Access via `const db = getDb();`
- Init is async: `await initDatabase()` in server startup

### Auth Flow
- JWT with 7-day expiry, secret from `process.env.JWT_SECRET`
- `verifyToken` middleware: reads `Authorization: Bearer <token>` header
- Attaches `req.user` = `{ uid, email, displayName, role, customClaims, emailVerified }`
- Role-based access: `requireRole('parent')` middleware

### API Routes (all prefixed `/api/`)
| Route file | Prefix | Purpose |
|------------|--------|---------|
| auth.js | /api/auth | login, register |
| users.js | /api/users | user management |
| gameProgress.js | /api/game | save/load progress |
| quiz.js | /api/quiz | quiz questions |
| parentDashboard.js | /api/dashboard | parent monitoring |
| messages.js | /api/messages | parent-child messages |
| linking.js | /api/linking | parent-child account linking |

### Conventions
- Vite proxies `/api` → `localhost:3001` (configured in `vite.config.ts`)
- Error responses: `{ error: 'message' }` with appropriate HTTP status
- All routes use async handlers with try/catch
- Seeding: `cd server && npm run seed` (creates test users + sample data)

### Test Credentials
- Player: ali@aigoo.game / ZombieDriver2024!
- Parent: mom@aigoo.game / ParentWatch2024!
