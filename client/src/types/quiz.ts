/**
 * Quiz Types for Ali's Aigoo Apocalypse
 */

export type Category = 
  | "road_signs"
  | "right_of_way"
  | "parking"
  | "speed_limits"
  | "emergencies"
  | "maintenance"
  | "defensive_driving"
  | "weather"
  | "night_driving"
  | "sharing_road"
  | "washington_laws";

export type Difficulty = "easy" | "medium" | "hard";

export type WaTestFrequency = "high" | "medium" | "low";

export interface Question {
  id: string;
  category: Category;
  difficulty: Difficulty;
  title: string;
  question: string;
  correctAnswer: string;
  wrongAnswers: string[];
  explanation: string;
  imagePrompt: string;
  imageUrl: string | null;
  tags: string[];
  waTestFrequency: WaTestFrequency;
  source: string;
}

export interface QuizContent {
  version: string;
  totalQuestions: number;
  categories: Category[];
  questions: Question[];
}

export interface QuizState {
  currentQuestion: Question | null;
  selectedAnswer: string | null;
  isCorrect: boolean | null;
  questionsAnswered: number;
  correctAnswers: number;
  showExplanation: boolean;
}

export interface MissedQuestion {
  questionId: string;
  timesIncorrect: number;
  lastFormat: string;
  lastAttemptAt: string;
}

export interface TestSimulationScore {
  date: string;
  score: number;
  totalQuestions: number;
  passed: boolean;
  durationMinutes: number | null;
}

export interface QuizPerformance {
  totalQuestionsAnswered: number;
  totalCorrect: number;
  overallAccuracy: number;
  categoryAccuracy: Record<Category, number>;
  missedQuestions: MissedQuestion[];
  testSimulationScores: TestSimulationScore[];
  readyForTestStatus: "ready" | "almost" | "practicing";
  updatedAt: string;
}

export interface ReadyStatus {
  status: "ready" | "almost" | "practicing";
  statusColor: "green" | "yellow" | "red";
  overallAccuracy: number;
  questionsAnswered: number;
  weakCategories: string[];
  strongCategories: string[];
  recommendedFocus: string;
  estimatedTestScore: number;
  confidenceLevel: "low" | "medium" | "high";
  testSimulationsPassed: number;
  testSimulationsAttempted: number;
  frequentlyMissedCount: number;
}

export type AlternativeFormat = "true_false" | "scenario" | "fill_blank";

export interface TrueFalseQuestion {
  statement: string;
  correctAnswer: boolean;
}

export interface ScenarioQuestion {
  setup: string;
  correctAction: string;
  incorrectActions: string[];
}
