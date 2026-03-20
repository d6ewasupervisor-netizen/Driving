/**
 * useQuiz Hook
 * Manages quiz state and interactions with the server
 */

import { useState, useEffect, useCallback } from "react";
import { 
  loadQuizContent, 
  getRandomQuestion, 
  getRandomQuestionByCategory,
  shuffleAnswers,
  generateTestSimulation
} from "@/lib/quiz-loader";
import { Question, QuizContent, QuizState, Category } from "@/types/quiz";
import { useAuth } from "@/lib/authContext";

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function useQuiz() {
  const { user } = useAuth();
  const [content, setContent] = useState<QuizContent | null>(null);
  const [state, setState] = useState<QuizState>({
    currentQuestion: null,
    selectedAnswer: null,
    isCorrect: null,
    questionsAnswered: 0,
    correctAnswers: 0,
    showExplanation: false
  });
  const [shuffledAnswers, setShuffledAnswers] = useState<string[]>([]);
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load quiz content on mount
  useEffect(() => {
    loadQuizContent()
      .then(data => {
        setContent(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  /**
   * Get the next random question
   */
  const nextQuestion = useCallback((category?: Category) => {
    if (!content) return;
    
    let question: Question | null;
    
    if (category) {
      question = getRandomQuestionByCategory(content, category, answeredIds);
      if (!question) {
        // Fallback to any question in category if all answered
        question = getRandomQuestionByCategory(content, category);
      }
    } else {
      question = getRandomQuestion(content, answeredIds);
    }
    
    if (question) {
      setState(prev => ({
        ...prev,
        currentQuestion: question,
        selectedAnswer: null,
        isCorrect: null,
        showExplanation: false
      }));
      setShuffledAnswers(shuffleAnswers(question));
    }
  }, [content, answeredIds]);

  /**
   * Submit an answer and sync with server
   */
  const submitAnswer = useCallback(async (answer: string) => {
    if (!state.currentQuestion) return null;
    
    const isCorrect = answer === state.currentQuestion.correctAnswer;
    setAnsweredIds(prev => [...prev, state.currentQuestion!.id]);
    
    setState(prev => ({
      ...prev,
      selectedAnswer: answer,
      isCorrect,
      questionsAnswered: prev.questionsAnswered + 1,
      correctAnswers: prev.correctAnswers + (isCorrect ? 1 : 0),
      showExplanation: true
    }));

    // Sync with server if authenticated
    if (user) {
      try {
        const token = localStorage.getItem('aigoo_auth_token');
        await fetch(`${API_URL}/api/quiz/answer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            questionId: state.currentQuestion.id,
            selectedAnswer: answer,
            isCorrect,
            category: state.currentQuestion.category,
            answerFormat: 'multiple_choice'
          })
        });
      } catch (err) {
        console.error('Failed to sync answer:', err);
      }
    }

    return {
      isCorrect,
      correctAnswer: state.currentQuestion.correctAnswer,
      explanation: state.currentQuestion.explanation
    };
  }, [state.currentQuestion, user]);

  /**
   * Show the explanation for the current question
   */
  const showExplanation = useCallback(() => {
    setState(prev => ({ ...prev, showExplanation: true }));
  }, []);

  /**
   * Start a test simulation
   */
  const startTestSimulation = useCallback(() => {
    if (!content) return [];
    
    const questions = generateTestSimulation(content, 40);
    setState({
      currentQuestion: questions[0] || null,
      selectedAnswer: null,
      isCorrect: null,
      questionsAnswered: 0,
      correctAnswers: 0,
      showExplanation: false
    });
    setShuffledAnswers(questions[0] ? shuffleAnswers(questions[0]) : []);
    setAnsweredIds([]);
    
    return questions;
  }, [content]);

  /**
   * Reset the quiz state
   */
  const resetQuiz = useCallback(() => {
    setState({
      currentQuestion: null,
      selectedAnswer: null,
      isCorrect: null,
      questionsAnswered: 0,
      correctAnswers: 0,
      showExplanation: false
    });
    setShuffledAnswers([]);
    setAnsweredIds([]);
  }, []);

  /**
   * Calculate current accuracy
   */
  const accuracy = state.questionsAnswered > 0 
    ? state.correctAnswers / state.questionsAnswered 
    : 0;

  return {
    // State
    loading,
    error,
    content,
    state,
    shuffledAnswers,
    accuracy,
    
    // Actions
    nextQuestion,
    submitAnswer,
    showExplanation,
    startTestSimulation,
    resetQuiz
  };
}

export default useQuiz;
