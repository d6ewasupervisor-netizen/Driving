const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { calculateReadyStatus } = require('../utils/readyStatus');

const router = express.Router();

/**
 * Helper: Check if parent is linked to player
 */
function isLinkedToPlayer(db, parentId, playerId) {
  const link = db.prepare(`
    SELECT id FROM linked_accounts WHERE parent_id = ? AND player_id = ?
  `).get(parentId, playerId);
  return !!link;
}

/**
 * Helper: Get linked player ID for parent
 */
function getLinkedPlayerId(db, parentId) {
  const link = db.prepare(`
    SELECT player_id FROM linked_accounts WHERE parent_id = ? LIMIT 1
  `).get(parentId);
  return link?.player_id;
}

// ==========================================
// PARENT DASHBOARD ROUTES
// ==========================================

/**
 * GET /api/dashboard/player-progress
 * Get linked player's progress for dashboard
 */
router.get('/player-progress', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const db = getDb();
    
    // Get linked player
    const playerId = getLinkedPlayerId(db, req.user.uid);
    if (!playerId) {
      return res.status(404).json({ error: 'No linked player found. Link a player account first.' });
    }
    
    // Get player info
    const player = db.prepare('SELECT display_name, last_login FROM users WHERE id = ?').get(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Linked player not found' });
    }
    
    // Get game progress
    const progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(playerId);
    
    // Get quiz performance
    const quizPerf = db.prepare('SELECT * FROM quiz_performance WHERE user_id = ?').get(playerId);
    
    // Calculate ready status
    let readyStatus = { status: 'practicing', statusColor: 'red' };
    if (quizPerf) {
      readyStatus = calculateReadyStatus({
        totalQuestionsAnswered: quizPerf.total_questions_answered,
        totalCorrect: quizPerf.total_correct,
        overallAccuracy: quizPerf.overall_accuracy,
        categoryAccuracy: JSON.parse(quizPerf.category_accuracy || '{}'),
        missedQuestions: JSON.parse(quizPerf.missed_questions || '[]'),
        testSimulationScores: JSON.parse(quizPerf.test_simulation_scores || '[]')
      });
    }
    
    // Build response
    const response = {
      playerName: player.display_name,
      lastActiveAt: player.last_login,
      
      // Journey progress
      currentMile: progress?.current_mile || 0,
      percentComplete: Math.round(((progress?.current_mile || 0) / 2800) * 100),
      currentChapter: progress?.current_chapter || 1,
      totalPlayTimeMinutes: progress?.total_play_time_minutes || 0,
      journeyComplete: !!progress?.journey_complete,
      
      // Quiz performance
      overallAccuracy: quizPerf?.overall_accuracy || 0,
      questionsAnswered: quizPerf?.total_questions_answered || 0,
      categoryAccuracy: quizPerf ? (() => {
        const cats = JSON.parse(quizPerf.category_accuracy || '{}');
        delete cats._stats;
        return cats;
      })() : {},
      missedQuestionsCount: quizPerf ? JSON.parse(quizPerf.missed_questions || '[]').length : 0,
      
      // Ready status
      readyForTestStatus: readyStatus.status,
      readyStatusColor: readyStatus.statusColor,
      weakCategories: readyStatus.weakCategories || [],
      strongCategories: readyStatus.strongCategories || [],
      recommendedFocus: readyStatus.recommendedFocus || '',
      
      // Test simulations
      testSimulationHistory: quizPerf ? JSON.parse(quizPerf.test_simulation_scores || '[]') : []
    };
    
    res.json(response);
  } catch (error) {
    console.error('Get player progress error:', error);
    res.status(500).json({ error: 'Failed to get player progress' });
  }
});

/**
 * GET /api/dashboard/missed-questions
 * Get linked player's missed questions
 */
router.get('/missed-questions', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const db = getDb();
    
    const playerId = getLinkedPlayerId(db, req.user.uid);
    if (!playerId) {
      return res.status(404).json({ error: 'No linked player found' });
    }
    
    const quizPerf = db.prepare('SELECT missed_questions FROM quiz_performance WHERE user_id = ?').get(playerId);
    
    if (!quizPerf) {
      return res.json({ missedQuestions: [] });
    }
    
    const missedQuestions = JSON.parse(quizPerf.missed_questions || '[]');
    
    // Sort by times incorrect
    missedQuestions.sort((a, b) => b.timesIncorrect - a.timesIncorrect);
    
    res.json({ missedQuestions });
  } catch (error) {
    console.error('Get missed questions error:', error);
    res.status(500).json({ error: 'Failed to get missed questions' });
  }
});

/**
 * GET /api/dashboard/session-history
 * Get linked player's session history
 */
router.get('/session-history', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const { days = 7 } = req.query;
    const db = getDb();
    
    const playerId = getLinkedPlayerId(db, req.user.uid);
    if (!playerId) {
      return res.status(404).json({ error: 'No linked player found' });
    }
    
    // Get sessions within date range
    const sessions = db.prepare(`
      SELECT * FROM session_logs 
      WHERE user_id = ? AND session_start >= datetime('now', '-${parseInt(days)} days')
      ORDER BY session_start DESC
    `).all(playerId);
    
    // Aggregate stats
    let totalMinutes = 0;
    const sessionsPerDay = {};
    
    sessions.forEach(session => {
      if (session.session_end) {
        const start = new Date(session.session_start);
        const end = new Date(session.session_end);
        const duration = Math.floor((end - start) / 60000);
        totalMinutes += duration;
        
        const dateKey = start.toISOString().split('T')[0];
        if (!sessionsPerDay[dateKey]) {
          sessionsPerDay[dateKey] = { date: dateKey, count: 0, minutes: 0 };
        }
        sessionsPerDay[dateKey].count += 1;
        sessionsPerDay[dateKey].minutes += duration;
      }
    });
    
    res.json({
      totalSessions: sessions.length,
      totalMinutes,
      averageSessionMinutes: sessions.length > 0 ? Math.round(totalMinutes / sessions.length) : 0,
      sessionsPerDay: Object.values(sessionsPerDay).sort((a, b) => b.date.localeCompare(a.date))
    });
  } catch (error) {
    console.error('Get session history error:', error);
    res.status(500).json({ error: 'Failed to get session history' });
  }
});

/**
 * GET /api/dashboard/linked-players
 * Get all linked players for this parent
 */
router.get('/linked-players', verifyToken, requireRole('parent'), (req, res) => {
  try {
    const db = getDb();
    
    const links = db.prepare(`
      SELECT la.player_id, la.linked_at, u.display_name, u.email, u.last_login
      FROM linked_accounts la
      JOIN users u ON u.id = la.player_id
      WHERE la.parent_id = ?
    `).all(req.user.uid);
    
    res.json({
      linkedPlayers: links.map(link => ({
        playerId: link.player_id,
        displayName: link.display_name,
        email: link.email,
        lastLogin: link.last_login,
        linkedAt: link.linked_at
      }))
    });
  } catch (error) {
    console.error('Get linked players error:', error);
    res.status(500).json({ error: 'Failed to get linked players' });
  }
});

module.exports = router;
