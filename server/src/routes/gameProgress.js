const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// ==========================================
// GAME PROGRESS ROUTES
// ==========================================

/**
 * GET /api/game/progress
 * Get current player's game progress
 */
router.get('/progress', verifyToken, requireRole('player'), (req, res) => {
  try {
    const db = getDb();
    let progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.user.uid);
    
    // Initialize if not exists
    if (!progress) {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO game_progress (id, user_id) VALUES (?, ?)
      `).run(id, req.user.uid);
      progress = db.prepare('SELECT * FROM game_progress WHERE id = ?').get(id);
    }
    
    res.json({
      progress: formatProgress(progress)
    });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ error: 'Failed to get game progress' });
  }
});

/**
 * POST /api/game/progress/save
 * Save game progress - equivalent to saveGameProgress Cloud Function
 */
router.post('/progress/save', verifyToken, requireRole('player'), (req, res) => {
  try {
    const { currentMile, stressLevel, vehicleHealth, unlockedUpgrades, lastSaveLocation } = req.body;
    
    // Validate input ranges
    if (currentMile !== undefined && (currentMile < 0 || currentMile > 2800)) {
      return res.status(400).json({ error: 'Mile must be between 0 and 2800' });
    }
    if (stressLevel !== undefined && (stressLevel < 0 || stressLevel > 100)) {
      return res.status(400).json({ error: 'Stress level must be between 0 and 100' });
    }
    if (vehicleHealth !== undefined && (vehicleHealth < 0 || vehicleHealth > 100)) {
      return res.status(400).json({ error: 'Vehicle health must be between 0 and 100' });
    }
    
    const db = getDb();
    
    // Get or create progress
    let progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.user.uid);
    if (!progress) {
      const id = uuidv4();
      db.prepare('INSERT INTO game_progress (id, user_id) VALUES (?, ?)').run(id, req.user.uid);
      progress = db.prepare('SELECT * FROM game_progress WHERE id = ?').get(id);
    }
    
    // Calculate chapter based on mile
    const currentChapter = calculateChapter(currentMile ?? progress.current_mile);
    const journeyComplete = (currentMile ?? progress.current_mile) >= 2800 ? 1 : 0;
    
    // Build update
    const updates = {
      current_mile: currentMile ?? progress.current_mile,
      current_chapter: currentChapter,
      stress_level: stressLevel ?? progress.stress_level,
      vehicle_health: vehicleHealth ?? progress.vehicle_health,
      unlocked_upgrades: unlockedUpgrades ? JSON.stringify(unlockedUpgrades) : progress.unlocked_upgrades,
      last_save_location: lastSaveLocation ?? progress.last_save_location,
      last_save_timestamp: new Date().toISOString(),
      journey_complete: journeyComplete,
      updated_at: new Date().toISOString()
    };
    
    db.prepare(`
      UPDATE game_progress SET
        current_mile = ?,
        current_chapter = ?,
        stress_level = ?,
        vehicle_health = ?,
        unlocked_upgrades = ?,
        last_save_location = ?,
        last_save_timestamp = ?,
        journey_complete = ?,
        updated_at = ?
      WHERE user_id = ?
    `).run(
      updates.current_mile,
      updates.current_chapter,
      updates.stress_level,
      updates.vehicle_health,
      updates.unlocked_upgrades,
      updates.last_save_location,
      updates.last_save_timestamp,
      updates.journey_complete,
      updates.updated_at,
      req.user.uid
    );
    
    // Log to active session if exists
    const activeSession = db.prepare(`
      SELECT * FROM session_logs 
      WHERE user_id = ? AND session_end IS NULL 
      ORDER BY session_start DESC LIMIT 1
    `).get(req.user.uid);
    
    if (activeSession && currentMile !== undefined) {
      const milesDiff = currentMile - (progress.current_mile || 0);
      if (milesDiff > 0) {
        db.prepare(`
          UPDATE session_logs SET miles_this_session = miles_this_session + ? WHERE id = ?
        `).run(milesDiff, activeSession.id);
      }
    }
    
    res.json({
      success: true,
      message: journeyComplete ? 'Journey complete! Congratulations!' : 'Progress saved',
      journeyComplete: !!journeyComplete
    });
  } catch (error) {
    console.error('Save progress error:', error);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

/**
 * POST /api/game/session/start
 * Start a new game session
 */
router.post('/session/start', verifyToken, requireRole('player'), (req, res) => {
  try {
    const db = getDb();
    
    // End any existing open sessions
    db.prepare(`
      UPDATE session_logs SET session_end = datetime('now') 
      WHERE user_id = ? AND session_end IS NULL
    `).run(req.user.uid);
    
    // Create new session
    const sessionId = uuidv4();
    const startTime = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO session_logs (id, user_id, session_start) VALUES (?, ?, ?)
    `).run(sessionId, req.user.uid, startTime);
    
    res.json({
      sessionId,
      startTime
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

/**
 * POST /api/game/session/end
 * End the current game session
 */
router.post('/session/end', verifyToken, requireRole('player'), (req, res) => {
  try {
    const { sessionId, milesThisSession, questionsAnswered, correctAnswers } = req.body;
    
    const db = getDb();
    
    // Find the session
    const session = db.prepare('SELECT * FROM session_logs WHERE id = ? AND user_id = ?')
      .get(sessionId, req.user.uid);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (session.session_end) {
      return res.status(400).json({ error: 'Session already ended' });
    }
    
    const endTime = new Date().toISOString();
    
    // Update session
    db.prepare(`
      UPDATE session_logs SET
        session_end = ?,
        miles_this_session = COALESCE(?, miles_this_session),
        questions_answered_this_session = COALESCE(?, questions_answered_this_session),
        correct_this_session = COALESCE(?, correct_this_session)
      WHERE id = ?
    `).run(endTime, milesThisSession, questionsAnswered, correctAnswers, sessionId);
    
    // Calculate session duration and update total play time
    const startTime = new Date(session.session_start);
    const duration = Math.floor((new Date(endTime) - startTime) / 60000); // minutes
    
    db.prepare(`
      UPDATE game_progress SET 
        total_play_time_minutes = total_play_time_minutes + ?,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(duration, req.user.uid);
    
    res.json({
      success: true,
      sessionDuration: duration
    });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

/**
 * POST /api/game/upgrades/check
 * Check if player has unlocked a new upgrade
 */
router.post('/upgrades/check', verifyToken, requireRole('player'), (req, res) => {
  try {
    const { chapter } = req.body;
    
    if (!chapter || chapter < 1 || chapter > 5) {
      return res.status(400).json({ error: 'Invalid chapter' });
    }
    
    const db = getDb();
    
    // Get quiz performance for category accuracy
    const quizPerf = db.prepare('SELECT * FROM quiz_performance WHERE user_id = ?').get(req.user.uid);
    if (!quizPerf) {
      return res.json({ unlocked: false, upgradeName: null, reason: 'No quiz data yet' });
    }
    
    const categoryAccuracy = JSON.parse(quizPerf.category_accuracy || '{}');
    
    // Upgrade mapping by chapter
    const upgradeMap = {
      1: { category: 'road_signs', upgrade: 'rally_lights' },
      2: { category: 'right_of_way', upgrade: 'all_weather_tires' },
      3: { category: 'defensive_driving', upgrade: 'reinforced_bumper' },
      4: { category: 'emergencies', upgrade: 'turbo_boost' },
      5: { category: null, upgrade: 'custom_paint' } // All chapters 90%+
    };
    
    const chapterData = upgradeMap[chapter];
    if (!chapterData) {
      return res.json({ unlocked: false, upgradeName: null });
    }
    
    // Get current unlocked upgrades
    const progress = db.prepare('SELECT unlocked_upgrades FROM game_progress WHERE user_id = ?').get(req.user.uid);
    const unlockedUpgrades = JSON.parse(progress?.unlocked_upgrades || '[]');
    
    // Already unlocked?
    if (unlockedUpgrades.includes(chapterData.upgrade)) {
      return res.json({ unlocked: false, upgradeName: null, reason: 'Already unlocked' });
    }
    
    let unlocked = false;
    
    if (chapter === 5) {
      // Custom paint requires ALL categories at 90%+
      const categories = ['road_signs', 'right_of_way', 'parking', 'speed_limits', 'emergencies',
        'maintenance', 'defensive_driving', 'weather', 'night_driving', 'sharing_road'];
      unlocked = categories.every(cat => (categoryAccuracy[cat] || 0) >= 0.9);
    } else {
      // Check specific category accuracy
      const accuracy = categoryAccuracy[chapterData.category] || 0;
      unlocked = accuracy >= 0.9;
    }
    
    if (unlocked) {
      unlockedUpgrades.push(chapterData.upgrade);
      db.prepare(`
        UPDATE game_progress SET unlocked_upgrades = ?, updated_at = datetime('now') WHERE user_id = ?
      `).run(JSON.stringify(unlockedUpgrades), req.user.uid);
    }
    
    res.json({
      unlocked,
      upgradeName: unlocked ? chapterData.upgrade : null
    });
  } catch (error) {
    console.error('Check upgrade error:', error);
    res.status(500).json({ error: 'Failed to check upgrade' });
  }
});

/**
 * POST /api/game/lovestop/visit
 * Record visiting a lovestop
 */
router.post('/lovestop/visit', verifyToken, requireRole('player'), (req, res) => {
  try {
    const { lovestopId } = req.body;
    
    if (!lovestopId) {
      return res.status(400).json({ error: 'Lovestop ID required' });
    }
    
    const db = getDb();
    const progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.user.uid);
    
    if (!progress) {
      return res.status(404).json({ error: 'No game progress found' });
    }
    
    const visited = JSON.parse(progress.lovestops_visited || '[]');
    if (!visited.includes(lovestopId)) {
      visited.push(lovestopId);
      db.prepare(`
        UPDATE game_progress SET lovestops_visited = ?, updated_at = datetime('now') WHERE user_id = ?
      `).run(JSON.stringify(visited), req.user.uid);
    }
    
    res.json({ success: true, lovestopsVisited: visited });
  } catch (error) {
    console.error('Visit lovestop error:', error);
    res.status(500).json({ error: 'Failed to record lovestop visit' });
  }
});

// Helper functions
function calculateChapter(mile) {
  if (mile < 560) return 1;   // 0-20%
  if (mile < 1120) return 2;  // 20-40%
  if (mile < 1680) return 3;  // 40-60%
  if (mile < 2240) return 4;  // 60-80%
  return 5;                   // 80-100%
}

function formatProgress(progress) {
  return {
    currentMile: progress.current_mile,
    currentChapter: progress.current_chapter,
    totalPlayTimeMinutes: progress.total_play_time_minutes,
    stressLevel: progress.stress_level,
    vehicleHealth: progress.vehicle_health,
    unlockedUpgrades: JSON.parse(progress.unlocked_upgrades || '[]'),
    lovestopsVisited: JSON.parse(progress.lovestops_visited || '[]'),
    lastSaveLocation: progress.last_save_location,
    lastSaveTimestamp: progress.last_save_timestamp,
    journeyComplete: !!progress.journey_complete,
    updatedAt: progress.updated_at
  };
}

module.exports = router;
