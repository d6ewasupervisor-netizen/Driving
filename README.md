# 🧟 Ali's Aigoo Apocalypse 🚗

An educational driving game for WA State driver's license test preparation through gamified learning.

**Journey:** 2,800-mile drive NYC → Spokane Valley, WA  
**Theme:** K-pop zombie apocalypse, N64 Mario Kart visual style  
**Companions:** Mya (stress relief cat) & Gracie (navigator cat)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install all dependencies (root, server, and client)
npm run install:all

# Or install individually:
npm install
cd server && npm install
cd ../client && npm install
```

### Start Development

```bash
# Start both server and client
npm run dev

# Or start individually:
npm run server  # Express API on http://localhost:3001
npm run client  # Vite + React on http://localhost:5173
```

The client URL is Vite’s default; if **5173** is already in use, Vite picks the next free port (5174, 5175, …). Add that origin to **ALLOWED_ORIGINS** on the server if the browser shows CORS errors.

### Seed Test Data

```bash
cd server
npm run seed
```

This creates test accounts and sample data:

| Role | Email | Password | Invite Code |
|------|-------|----------|-------------|
| Player | ali@aigoo.game | ZombieDriver2024! | ALI123 |
| Parent | mom@aigoo.game | ParentWatch2024! | - |
| Parent | t@aigoo.game | ParentWatch2024! | - |

**Seeded Game State:**
- Mile 1247 of 2800 (44% complete)
- Quiz accuracy: 82.7%
- Ready status: Almost Ready 🟡

---

## 🏗️ Project Structure

```
alis-aigoo-apocalypse/
├── server/                    # Local Express.js server
│   ├── src/
│   │   ├── index.js          # Express entry point
│   │   ├── db/database.js    # SQLite schema
│   │   ├── routes/
│   │   │   ├── auth.js       # Authentication
│   │   │   ├── users.js      # User management
│   │   │   ├── gameProgress.js    # Game state
│   │   │   ├── quiz.js       # Quiz performance
│   │   │   ├── parentDashboard.js # Parent APIs
│   │   │   ├── messages.js   # Radio messages
│   │   │   └── linking.js    # Account linking
│   │   ├── middleware/auth.js
│   │   ├── utils/readyStatus.js
│   │   └── scripts/seedUsers.js
│   └── data/                  # SQLite database
│
├── client/                    # Vite + React frontend
│   ├── src/
│   │   ├── lib/
│   │   │   ├── auth.js           # Auth client
│   │   │   ├── authContext.jsx   # React context
│   │   │   ├── quiz-loader.ts    # Quiz content
│   │   │   └── question-reformatter.ts
│   │   ├── hooks/useQuiz.ts
│   │   └── types/quiz.ts
│   └── public/data/questions.json
│
├── local-server.json          # Project config
└── README.md
```

---

## 📊 Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts with roles and settings |
| `linked_accounts` | Parent-player relationships |
| `game_progress` | Journey state (mile, chapter, upgrades) |
| `quiz_performance` | Quiz stats and category accuracy |
| `parent_messages` | Radio messages from parents |
| `session_logs` | Play session tracking |

---

## 📡 Complete API Reference

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/signup` | No | Create account |
| POST | `/api/auth/login` | No | Sign in |
| GET | `/api/auth/me` | Yes | Get current user |
| POST | `/api/auth/refresh` | Yes | Refresh token |
| POST | `/api/auth/logout` | Yes | Sign out |

### Game Progress (Player Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/game/progress` | Get current progress |
| POST | `/api/game/progress/save` | Save game state |
| POST | `/api/game/session/start` | Start play session |
| POST | `/api/game/session/end` | End play session |
| POST | `/api/game/upgrades/check` | Check for new upgrades |
| POST | `/api/game/lovestop/visit` | Record lovestop visit |

### Quiz Performance (Player Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quiz/performance` | Get quiz stats |
| POST | `/api/quiz/answer` | Submit answer |
| POST | `/api/quiz/test-simulation` | Submit test results |
| GET | `/api/quiz/ready-status` | Get ready-for-test status |
| GET | `/api/quiz/missed-questions` | Get missed questions |

### Parent Dashboard (Parent Only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/player-progress` | Full player dashboard |
| GET | `/api/dashboard/missed-questions` | Player's missed questions |
| GET | `/api/dashboard/session-history` | Play time analytics |
| GET | `/api/dashboard/linked-players` | List linked players |

### Messages (Radio System)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/messages/send` | Parent | Send to player |
| GET | `/api/messages/sent` | Parent | Get sent messages |
| GET | `/api/messages/inbox` | Player | Get received messages |
| GET | `/api/messages/unread-count` | Player | Count unread |
| POST | `/api/messages/:id/read` | Player | Mark as read |
| POST | `/api/messages/:id/displayed` | Player | Mark as radio-displayed |
| GET | `/api/messages/next-radio` | Player | Get next for radio |

### Account Linking
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/linking/invite-code` | Player | Get invite code |
| POST | `/api/linking/regenerate-code` | Player | New invite code |
| POST | `/api/linking/link` | Parent | Link to player |
| DELETE | `/api/linking/unlink/:playerId` | Parent | Unlink player |
| GET | `/api/linking/linked-parents` | Player | List linked parents |

---

## 🎯 Ready for Test Algorithm

The system calculates if Ali is ready for the WA State written test:

### 🟢 READY (Green)
- 150+ questions answered
- 85%+ overall accuracy
- All categories ≥75%
- At most 1 category below 80%
- Passed at least one test simulation
- <5 questions missed 3+ times

### 🟡 ALMOST READY (Yellow)
- 100-149 questions answered OR
- 75-84% overall accuracy OR
- 1-2 categories below 75% OR
- No passed test simulation yet

### 🔴 KEEP PRACTICING (Red)
- <100 questions answered OR
- <75% overall accuracy OR
- 3+ categories below 75%

---

## 🚗 Upgrade System

Unlock vehicle upgrades by achieving 90%+ in chapter categories:

| Chapter | Category | Upgrade |
|---------|----------|---------|
| 1 | Road Signs | Rally Lights 💡 |
| 2 | Right of Way | All-Weather Tires 🛞 |
| 3 | Defensive Driving | Reinforced Bumper 🛡️ |
| 4 | Emergencies | Turbo Boost 🚀 |
| All | 90% in all categories | Custom Paint 🎨 |

---

## 📻 Long-Distance Radio

Parents communicate with Ali through the radio system:

```javascript
// Parent sends message
POST /api/messages/send
{ "message": "Great job! Keep practicing those parking questions!" }

// Player receives as radio broadcast
GET /api/messages/next-radio
// Returns unread message for in-game radio animation
```

---

## 🐱 The Cats

**Mya** - Stress Relief  
- Purrs when Ali answers correctly
- Provides calming presence during difficult questions

**Gracie** - Navigator  
- Shows progress on the NYC → Spokane route
- Announces milestones and upcoming challenges

---

## 🛠️ Environment Variables

### Server (`.env`)
```
PORT=3001
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
DB_PATH=./data/aigoo.db
ALLOWED_ORIGINS=http://localhost:5173
```

### Client (`.env.local`)
```
VITE_API_URL=http://localhost:3001
```

---

## 📄 License

Private project for educational purposes.

---

*"Remember: When zombies chase you, always check your mirrors and signal before changing lanes!"* 🧟‍♂️🚗💨
