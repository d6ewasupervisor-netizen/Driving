/**
 * Ready for Test Algorithm
 * 
 * Determines if the player is ready to take the WA State driver's license written test.
 * Test format: 40 questions, 80% passing (32/40)
 */

const CATEGORIES = [
  'road_signs', 'right_of_way', 'parking', 'speed_limits', 'emergencies',
  'maintenance', 'defensive_driving', 'weather', 'night_driving', 'sharing_road'
];

/**
 * Calculate ready-for-test status based on quiz performance data
 * 
 * @param {Object} data - Quiz performance data
 * @returns {Object} - Detailed status result
 */
function calculateReadyStatus(data) {
  const {
    totalQuestionsAnswered = 0,
    totalCorrect = 0,
    overallAccuracy = 0,
    categoryAccuracy = {},
    missedQuestions = [],
    testSimulationScores = []
  } = data;
  
  // Remove internal stats if present
  const { _stats, ...cleanCategoryAccuracy } = categoryAccuracy;
  
  // Calculate metrics
  const metrics = {
    questionsAnswered: totalQuestionsAnswered,
    overallAccuracy: overallAccuracy,
    
    // Category analysis
    categoriesBelow75: [],
    categoriesBelow80: [],
    strongCategories: [],
    weakCategories: [],
    
    // Test simulations
    testSimulationsAttempted: testSimulationScores.length,
    testSimulationsPassed: testSimulationScores.filter(t => t.passed).length,
    hasPassedSimulation: testSimulationScores.some(t => t.passed),
    
    // Missed questions
    frequentlyMissed: missedQuestions.filter(m => m.timesIncorrect >= 3).length
  };
  
  // Analyze each category
  CATEGORIES.forEach(cat => {
    const accuracy = cleanCategoryAccuracy[cat] || 0;
    
    if (accuracy < 0.75) {
      metrics.categoriesBelow75.push(cat);
      metrics.weakCategories.push(cat);
    } else if (accuracy < 0.80) {
      metrics.categoriesBelow80.push(cat);
      metrics.weakCategories.push(cat);
    } else if (accuracy >= 0.85) {
      metrics.strongCategories.push(cat);
    }
  });
  
  // Determine status
  let status = 'practicing';
  let statusColor = 'red';
  let confidenceLevel = 'low';
  
  // 🟢 READY (Green) criteria
  const isReady = (
    totalQuestionsAnswered >= 150 &&
    overallAccuracy >= 0.85 &&
    metrics.categoriesBelow75.length === 0 &&
    metrics.categoriesBelow80.length <= 1 &&
    metrics.hasPassedSimulation &&
    metrics.frequentlyMissed < 5
  );
  
  // 🟡 ALMOST READY (Yellow) criteria
  const isAlmost = (
    (totalQuestionsAnswered >= 100 && totalQuestionsAnswered < 150) ||
    (overallAccuracy >= 0.75 && overallAccuracy < 0.85) ||
    (metrics.categoriesBelow75.length >= 1 && metrics.categoriesBelow75.length <= 2) ||
    (!metrics.hasPassedSimulation && metrics.testSimulationsAttempted > 0) ||
    (metrics.frequentlyMissed >= 5 && metrics.frequentlyMissed <= 10)
  );
  
  if (isReady) {
    status = 'ready';
    statusColor = 'green';
    confidenceLevel = 'high';
  } else if (isAlmost) {
    status = 'almost';
    statusColor = 'yellow';
    confidenceLevel = 'medium';
  }
  
  // Generate recommended focus
  let recommendedFocus = '';
  if (metrics.weakCategories.length > 0) {
    const weakestCategory = metrics.weakCategories[0];
    recommendedFocus = `Focus on ${formatCategoryName(weakestCategory)} questions`;
  } else if (!metrics.hasPassedSimulation) {
    recommendedFocus = 'Try taking a practice test simulation';
  } else if (metrics.frequentlyMissed > 0) {
    recommendedFocus = 'Review your frequently missed questions';
  } else if (totalQuestionsAnswered < 150) {
    recommendedFocus = `Answer ${150 - totalQuestionsAnswered} more questions`;
  } else {
    recommendedFocus = 'You\'re doing great! Keep practicing to stay sharp';
  }
  
  // Estimate test score (based on current accuracy with some variance)
  const estimatedTestScore = Math.round(40 * overallAccuracy);
  
  return {
    status,
    statusColor,
    overallAccuracy: Math.round(overallAccuracy * 100) / 100,
    questionsAnswered: totalQuestionsAnswered,
    weakCategories: metrics.weakCategories,
    strongCategories: metrics.strongCategories,
    recommendedFocus,
    estimatedTestScore,
    confidenceLevel,
    testSimulationsPassed: metrics.testSimulationsPassed,
    testSimulationsAttempted: metrics.testSimulationsAttempted,
    frequentlyMissedCount: metrics.frequentlyMissed,
    
    // Additional details
    details: {
      meetsQuestionMinimum: totalQuestionsAnswered >= 150,
      meetsAccuracyThreshold: overallAccuracy >= 0.85,
      categoriesBelowThreshold: metrics.categoriesBelow75.length,
      hasPassedSimulation: metrics.hasPassedSimulation
    }
  };
}

/**
 * Format category name for display
 */
function formatCategoryName(category) {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = { calculateReadyStatus, formatCategoryName, CATEGORIES };
