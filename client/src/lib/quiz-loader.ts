/**
 * Quiz Content Loader
 * Loads and manages quiz questions from static JSON file
 */

import { QuizContent, Question, Category } from "@/types/quiz";

let cachedContent: QuizContent | null = null;

/**
 * Load quiz content from JSON file
 * Caches the result for subsequent calls
 */
export async function loadQuizContent(): Promise<QuizContent> {
  if (cachedContent) return cachedContent;
  
  const response = await fetch("/data/questions.json");
  if (!response.ok) {
    throw new Error("Failed to load quiz content");
  }
  
  cachedContent = await response.json();
  return cachedContent!;
}

/**
 * Get all questions for a specific category
 */
export function getQuestionsByCategory(
  content: QuizContent, 
  category: Category
): Question[] {
  return content.questions.filter(q => q.category === category);
}

/**
 * Get a random question, optionally excluding already answered questions
 */
export function getRandomQuestion(
  content: QuizContent,
  excludeIds?: string[]
): Question {
  const available = excludeIds 
    ? content.questions.filter(q => !excludeIds.includes(q.id))
    : content.questions;
  
  if (available.length === 0) {
    // If all questions answered, allow repeats
    return content.questions[Math.floor(Math.random() * content.questions.length)];
  }
  
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Get a random question from a specific category
 */
export function getRandomQuestionByCategory(
  content: QuizContent,
  category: Category,
  excludeIds?: string[]
): Question | null {
  const categoryQuestions = getQuestionsByCategory(content, category);
  const available = excludeIds
    ? categoryQuestions.filter(q => !excludeIds.includes(q.id))
    : categoryQuestions;
  
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Get questions that the player has missed
 */
export function getWeakCategoryQuestions(
  content: QuizContent,
  missedQuestionIds: string[],
  limit: number = 10
): Question[] {
  return content.questions
    .filter(q => missedQuestionIds.includes(q.id))
    .slice(0, limit);
}

/**
 * Generate a test simulation with random questions
 * Tries to balance across categories
 */
export function generateTestSimulation(
  content: QuizContent,
  questionCount: number = 40
): Question[] {
  const categories = content.categories;
  const questionsPerCategory = Math.floor(questionCount / categories.length);
  const extraQuestions = questionCount % categories.length;
  
  const selectedQuestions: Question[] = [];
  
  // Get questions from each category
  categories.forEach((category, index) => {
    const categoryQuestions = getQuestionsByCategory(content, category);
    const shuffled = [...categoryQuestions].sort(() => Math.random() - 0.5);
    const count = questionsPerCategory + (index < extraQuestions ? 1 : 0);
    selectedQuestions.push(...shuffled.slice(0, count));
  });
  
  // Shuffle the final selection
  return selectedQuestions.sort(() => Math.random() - 0.5);
}

/**
 * Shuffle answer options for a question
 */
export function shuffleAnswers(question: Question): string[] {
  const allAnswers = [question.correctAnswer, ...question.wrongAnswers];
  return allAnswers.sort(() => Math.random() - 0.5);
}

/**
 * Get question by ID
 */
export function getQuestionById(
  content: QuizContent,
  questionId: string
): Question | undefined {
  return content.questions.find(q => q.id === questionId);
}

/**
 * Get questions by difficulty
 */
export function getQuestionsByDifficulty(
  content: QuizContent,
  difficulty: "easy" | "medium" | "hard"
): Question[] {
  return content.questions.filter(q => q.difficulty === difficulty);
}

/**
 * Get questions by WA test frequency
 */
export function getHighFrequencyQuestions(content: QuizContent): Question[] {
  return content.questions.filter(q => q.waTestFrequency === "high");
}

/**
 * Get category statistics
 */
export function getCategoryStats(content: QuizContent): Record<Category, number> {
  const stats: Record<string, number> = {};
  
  content.questions.forEach(q => {
    stats[q.category] = (stats[q.category] || 0) + 1;
  });
  
  return stats as Record<Category, number>;
}

/**
 * Clear cached content (useful for testing or forcing reload)
 */
export function clearCache(): void {
  cachedContent = null;
}
