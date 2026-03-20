const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const { calculateReadyStatus } = require('../utils/readyStatus');

const router = express.Router();

// Valid quiz categories
const VALID_CATEGORIES = [
  'road_signs', 'right_of_way', 'parking', 'speed_limits', 'emergencies',
  'maintenance', 'defensive_driving', 'weather', 'night_driving', 
  'sharing_road', 'washington_laws'
];

/**
 * GET /api/quiz/performance
 * Get current player's quiz performance
 */
router.get('/performance', verifyToken, requireRole('player'), (req, res) => {
  try {
    const db = getDb();
    let performance = db.prepare('SELECT * FROM quiz_performance WHERE user_id = ?').get(req.user.uid);
    
    // Initialize if not exists
    if (!performance) {
      const id = uuidv4();
      const initialCategoryAccuracy = {};
      VALID_CATEGORIES.forEach(cat => { initialCategoryAccuracy[cat] = 0; });
      
      db.prepare(`
        INSERT INTO quiz_performance (id, user_id, category_accuracy) VALUES (?, ?, ?)
      `).run(id, req.user.uid, JSON.stringify(initialCategoryAccuracy));
      
      performance = db.prepare('SELECT * FROM quiz_performance WHERE id = ?').get(id);
    }
    
    res.json({
      performance: formatPerformance(performance)
    });
  } catch (error) {
    console.error('Get performance error:', error);
    res.status(500).json({ error: 'Failed to get quiz performance' });
  }
});

/**
 * POST /api/quiz/answer
 * Submit a quiz answer - equivalent to submitQuizAnswer Cloud Function
 */
router.post('/answer', verifyToken, requireRole('player'), (req, res) => {
  try {
    const { questionId, selectedAnswer, isCorrect, category, answerFormat } = req.body;
    
    // Validate required fields
    if (!questionId || isCorrect === undefined || !category) {
      return res.status(400).json({ error: 'questionId, isCorrect, and category are required' });
    }
    
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category', validCategories: VALID_CATEGORIES });
    }
    
    const db = getDb();
    
    // Get or create performance record
    let perf = db.prepare('SELECT * FROM quiz_performance WHERE user_id = ?').get(req.user.uid);
    
    if (!perf) {
      const id = uuidv4();
      const initialCategoryAccuracy = {};
      VALID_CATEGORIES.forEach(cat => { initialCategoryAccuracy[cat] = 0; });
      
      db.prepare(`
        INSERT INTO quiz_performance (id, user_id, category_accuracy) VALUES (?, ?, ?)
      `).run(id, req.user.uid, JSON.stringify(initialCategoryAccuracy));
      
      perf = db.prepare('SELECT * FROM quiz_performance WHERE id = ?').get(id);
    }
    
    // Parse existing data
    const categoryAccuracy = JSON.parse(perf.category_accuracy || '{}');
    const missedQuestions = JSON.parse(perf.missed_questions || '[]');
    
    // Track category stats (we need to track totals per category)
    // Store as { category: { answered: n, correct: n } }
    const categoryStats = categoryAccuracy._stats || {};
    if (!categoryStats[category]) {
      categoryStats[category] = { answered: 0, correct: 0 };
    }
    
    // Update totals
    const newTotalAnswered = perf.total_questions_answered + 1;
    const newTotalCorrect = perf.total_correct + (isCorrect ? 1 : 0);
    const newOverallAccuracy = newTotalAnswered > 0 ? newTotalCorrect / newTotalAnswered : 0;
    
    // Update category stats
    categoryStats[category].answered += 1;
    categoryStats[category].correct += (isCorrect ? 1 : 0);
    
    // Calculate category accuracies
    Object.keys(categoryStats).forEach(cat => {
      const stats = categoryStats[cat];
      if (stats.answered > 0) {
        categoryAccuracy[cat] = stats.correct / stats.answered;
      }
    });
    categoryAccuracy._stats = categoryStats;
    
    // Handle missed questions
    if (!isCorrect) {
      const existingMiss = missedQuestions.find(m => m.questionId === questionId);
      if (existingMiss) {
        existingMiss.timesIncorrect += 1;
        existingMiss.lastFormat = answerFormat || 'multiple_choice';
        existingMiss.lastAttemptAt = new Date().toISOString();
      } else {
        missedQuestions.push({
          questionId,
          timesIncorrect: 1,
          lastFormat: answerFormat || 'multiple_choice',
          lastAttemptAt: new Date().toISOString()
        });
      }
    } else {
      // If correct and was in missed questions, update it
      const missIndex = missedQuestions.findIndex(m => m.questionId === questionId);
      if (missIndex >= 0) {
        missedQuestions[missIndex].lastFormat = answerFormat || 'multiple_choice';
        missedQuestions[missIndex].lastAttemptAt = new Date().toISOString();
        // Could remove from missed if answered correctly multiple times, but keeping for tracking
      }
    }
    
    // Calculate ready status
    const readyStatusResult = calculateReadyStatus({
      totalQuestionsAnswered: newTotalAnswered,
      totalCorrect: newTotalCorrect,
      overallAccuracy: newOverallAccuracy,
      categoryAccuracy,
      missedQuestions,
      testSimulationScores: JSON.parse(perf.test_simulation_scores || '[]')
    });
    
    // Update database
    db.prepare(`
      UPDATE quiz_performance SET
        total_questions_answered = ?,
        total_correct = ?,
        overall_accuracy = ?,
        category_accuracy = ?,
        missed_questions = ?,
        ready_for_test_status = ?,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      newTotalAnswered,
      newTotalCorrect,
      newOverallAccuracy,
      JSON.stringify(categoryAccuracy),
      JSON.stringify(missedQuestions),
      readyStatusResult.status,
      req.user.uid
    );
    
    // Update session log if active
    const activeSession = db.prepare(`
      SELECT id FROM session_logs 
      WHERE user_id = ? AND session_end IS NULL 
      ORDER BY session_start DESC LIMIT 1
    `).get(req.user.uid);
    
    if (activeSession) {
      db.prepare(`
        UPDATE session_logs SET 
          questions_answered_this_session = questions_answered_this_session + 1,
          correct_this_session = correct_this_session + ?
        WHERE id = ?
      `).run(isCorrect ? 1 : 0, activeSession.id);
    }
    
    res.json({
      success: true,
      newAccuracy: newOverallAccuracy,
      categoryAccuracy: categoryAccuracy[category],
      readyStatus: readyStatusResult.status,
      isCorrect
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

/**
 * POST /api/quiz/test-simulation
 * Submit test simulation results
 */
router.post('/test-simulation', verifyToken, requireRole('player'), (req, res) => {
  try {
    const { score, totalQuestions, durationMinutes } = req.body;
    
    if (score === undefined || !totalQuestions) {
      return res.status(400).json({ error: 'score and totalQuestions are required' });
    }
    
    const db = getDb();
    
    let perf = db.prepare('SELECT * FROM quiz_performance WHERE user_id = ?').get(req.user.uid);
    
    if (!perf) {
      return res.status(404).json({ error: 'No quiz performance found. Answer some questions first.' });
    }
    
    const percentage = score / totalQuestions;
    const passed = percentage >= 0.8;
    
    const testScores = JSON.parse(perf.test_simulation_scores || '[]');
    testScores.push({
      date: new Date().toISOString(),
      score,
      totalQuestions,
      passed,
      durationMinutes: durationMinutes || null
    });
    
    // Recalculate ready status
    const readyStatusResult = calculateReadyStatus({
      totalQuestionsAnswered: perf.total_questions_answered,
      totalCorrect: perf.total_correct,
      overallAccuracy: perf.overall_accuracy,
      categoryAccuracy: JSON.parse(perf.category_accuracy || '{}'),
      missedQuestions: JSON.parse(perf.missed_questions || '[]'),
      testSimulationScores: testScores
    });
    
    db.prepare(`
      UPDATE quiz_performance SET
        test_simulation_scores = ?,
        ready_for_test_status = ?,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(JSON.stringify(testScores), readyStatusResult.status, req.user.uid);
    
    res.json({
      success: true,
      passed,
      percentage: Math.round(percentage * 100),
      readyStatus: readyStatusResult.status,
      testSimulationsAttempted: testScores.length,
      testSimulationsPassed: testScores.filter(t => t.passed).length
    });
  } catch (error) {
    console.error('Test simulation error:', error);
    res.status(500).json({ error: 'Failed to submit test simulation' });
  }
});

/**
 * GET /api/quiz/ready-status
 * Get detailed ready-for-test status
 */
router.get('/ready-status', verifyToken, requireRole('player'), (req, res) => {
  try {
    const db = getDb();
    const perf = db.prepare('SELECT * FROM quiz_performance WHERE user_id = ?').get(req.user.uid);
    
    if (!perf) {
      return res.json({
        status: 'practicing',
        statusColor: 'red',
        message: 'Start answering questions to track your progress!'
      });
    }
    
    const result = calculateReadyStatus({
      totalQuestionsAnswered: perf.total_questions_answered,
      totalCorrect: perf.total_correct,
      overallAccuracy: perf.overall_accuracy,
      categoryAccuracy: JSON.parse(perf.category_accuracy || '{}'),
      missedQuestions: JSON.parse(perf.missed_questions || '[]'),
      testSimulationScores: JSON.parse(perf.test_simulation_scores || '[]')
    });
    
    res.json(result);
  } catch (error) {
    console.error('Ready status error:', error);
    res.status(500).json({ error: 'Failed to get ready status' });
  }
});

/**
 * GET /api/quiz/missed-questions
 * Get list of missed questions for review
 */
router.get('/missed-questions', verifyToken, requireRole('player'), (req, res) => {
  try {
    const db = getDb();
    const perf = db.prepare('SELECT missed_questions FROM quiz_performance WHERE user_id = ?').get(req.user.uid);
    
    if (!perf) {
      return res.json({ missedQuestions: [] });
    }
    
    const missedQuestions = JSON.parse(perf.missed_questions || '[]');
    
    // Sort by times incorrect (most missed first)
    missedQuestions.sort((a, b) => b.timesIncorrect - a.timesIncorrect);
    
    res.json({ missedQuestions });
  } catch (error) {
    console.error('Get missed questions error:', error);
    res.status(500).json({ error: 'Failed to get missed questions' });
  }
});

// Helper function
function formatPerformance(perf) {
  const categoryAccuracy = JSON.parse(perf.category_accuracy || '{}');
  // Remove internal stats object from response
  const { _stats, ...cleanCategoryAccuracy } = categoryAccuracy;
  
  return {
    totalQuestionsAnswered: perf.total_questions_answered,
    totalCorrect: perf.total_correct,
    overallAccuracy: perf.overall_accuracy,
    categoryAccuracy: cleanCategoryAccuracy,
    missedQuestions: JSON.parse(perf.missed_questions || '[]'),
    testSimulationScores: JSON.parse(perf.test_simulation_scores || '[]'),
    readyForTestStatus: perf.ready_for_test_status,
    updatedAt: perf.updated_at
  };
}

module.exports = router;
