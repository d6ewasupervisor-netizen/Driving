require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const gameProgressRoutes = require('./routes/gameProgress');
const quizRoutes = require('./routes/quiz');
const parentDashboardRoutes = require('./routes/parentDashboard');
const messagesRoutes = require('./routes/messages');
const linkingRoutes = require('./routes/linking');
const { initDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Parse allowed origins from env
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

const localhostDev = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Middleware — in dev, allow any localhost origin so alternate Vite ports work
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (!isProd && localhostDev.test(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));
app.use(express.json());

// Async startup
(async () => {
  try {
    // Initialize database (async with sql.js)
    await initDatabase();

    // Routes
    app.use('/api/auth', authRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/game', gameProgressRoutes);
    app.use('/api/quiz', quizRoutes);
    app.use('/api/dashboard', parentDashboardRoutes);
    app.use('/api/messages', messagesRoutes);
    app.use('/api/linking', linkingRoutes);

    // Health check
    app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        project: "Ali's Aigoo Apocalypse",
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error('Server Error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });

    app.listen(PORT, () => {
      console.log(`
  🧟 Ali's Aigoo Apocalypse Server 🧟
  ===================================
  Server running on port ${PORT}
  Environment: ${process.env.NODE_ENV}
  
  Ready to authenticate zombie survivors!
      `);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
