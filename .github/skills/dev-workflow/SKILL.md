---
name: dev-workflow
description: "Start the development environment, seed database, check server health, or resume work on the Aigoo Apocalypse project. Use when: starting dev, running the game, seeding data, checking test credentials."
argument-hint: "What to start (e.g., 'start everything', 'seed db', 'check health')"
---

# Development Workflow

## When to Use
- Starting or resuming development
- Seeding the database with test data
- Checking if server/client are running
- Getting test credentials for login

## Quick Start Procedure
1. Start both server + client from project root:
   ```bash
   cd C:\Users\tgaut\Driving
   npm run dev
   ```
   This runs `concurrently` to start Express (port 3001) + Vite (port 5173).

2. If database needs seeding:
   ```bash
   cd C:\Users\tgaut\Driving\server
   npm run seed
   ```

3. Verify server health:
   ```
   GET http://localhost:3001/api/health
   ```

4. Open the game: http://localhost:5173

## Test Credentials
| Role | Email | Password |
|------|-------|----------|
| Player | ali@aigoo.game | ZombieDriver2024! |
| Parent | mom@aigoo.game | ParentWatch2024! |
| Parent | t@aigoo.game | ParentWatch2024! |

## Troubleshooting
- **Port 3001 in use**: Kill the process or change PORT in server `.env`
- **Port 5173 in use**: Vite will auto-increment to 5174
- **npm run dev fails (exit code 1)**: Check that `npm install` was run in root, server, and client directories. Run `npm run install:all` from root.
- **Database errors**: Delete `server/data/*.db` and re-seed
- **Module not found**: Run `npm install` in the failing workspace (server or client)
