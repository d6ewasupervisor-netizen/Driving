/**
 * QuizManager — Loads questions and watches mileage triggers.
 * Implemented as a React hook used in Game3D.tsx.
 */
import { useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { loadQuizContent, getRandomQuestion } from '@/lib/quiz-loader';
import { Question, QuizContent, Category } from '@/types/quiz';

// ─── Fallback questions (if JSON load fails) ──────────────────────────────────
const FALLBACK_QUESTIONS: Question[] = [
  {
    id: 'fallback_1',
    category: 'road_signs' as Category,
    difficulty: 'easy',
    title: 'Stop Sign',
    question: 'What must you do at a stop sign?',
    correctAnswer: 'Come to a complete stop',
    wrongAnswers: ['Slow down to 5 mph', 'Yield if traffic is present', 'Flash your lights'],
    explanation: 'A stop sign requires a complete stop before the stop line.',
    imagePrompt: '',
    imageUrl: null,
    tags: [],
    waTestFrequency: 'high',
    source: 'fallback',
  },
  {
    id: 'fallback_2',
    category: 'right_of_way' as Category,
    difficulty: 'easy',
    title: 'Four-Way Stop',
    question: 'At a four-way stop, who goes first?',
    correctAnswer: 'The driver who arrived first',
    wrongAnswers: ['The driver on the right', 'The driver going straight', 'The driver turning left'],
    explanation: 'At a four-way stop, the first vehicle to arrive has the right of way.',
    imagePrompt: '',
    imageUrl: null,
    tags: [],
    waTestFrequency: 'high',
    source: 'fallback',
  },
  {
    id: 'fallback_3',
    category: 'speed_limits' as Category,
    difficulty: 'easy',
    title: 'School Zone',
    question: 'What is the default speed in a school zone when children are present?',
    correctAnswer: '20 mph',
    wrongAnswers: ['25 mph', '15 mph', '30 mph'],
    explanation: 'School zones require 20 mph when children are present.',
    imagePrompt: '',
    imageUrl: null,
    tags: [],
    waTestFrequency: 'medium',
    source: 'fallback',
  },
  {
    id: 'fallback_4',
    category: 'defensive_driving' as Category,
    difficulty: 'medium',
    title: 'Following Distance',
    question: 'What is the recommended following distance in normal conditions?',
    correctAnswer: '3-second rule',
    wrongAnswers: ['1-second rule', '2-second rule', '5-second rule'],
    explanation: 'Maintain a 3-second following distance to allow adequate stopping time.',
    imagePrompt: '',
    imageUrl: null,
    tags: [],
    waTestFrequency: 'high',
    source: 'fallback',
  },
  {
    id: 'fallback_5',
    category: 'emergencies' as Category,
    difficulty: 'medium',
    title: 'Emergency Vehicle',
    question: 'When an emergency vehicle approaches with sirens, you should:',
    correctAnswer: 'Pull over to the right and stop',
    wrongAnswers: ['Speed up to clear the road', 'Stop where you are', 'Pull into the nearest parking lot'],
    explanation: 'You must pull over to the right curb and stop when an emergency vehicle approaches.',
    imagePrompt: '',
    imageUrl: null,
    tags: [],
    waTestFrequency: 'high',
    source: 'fallback',
  },
];

export function useQuizManager() {
  const contentRef = useRef<QuizContent | null>(null);
  const loadedRef = useRef(false);

  const quizActive = useGameStore((s) => s.quizActive);
  const phase = useGameStore((s) => s.phase);
  const answeredIds = useGameStore((s) => s.answeredIds);
  const triggerQuiz = useGameStore((s) => s.triggerQuiz);

  // ── Load questions on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    loadQuizContent()
      .then((content) => { contentRef.current = content; })
      .catch(() => {
        // Use fallback questions
        contentRef.current = {
          version: '1.0',
          totalQuestions: FALLBACK_QUESTIONS.length,
          categories: [...new Set(FALLBACK_QUESTIONS.map((q) => q.category))],
          questions: FALLBACK_QUESTIONS,
        };
      });
  }, []);

  // ── Trigger quiz when quizActive is set by store ─────────────────────────
  useEffect(() => {
    if (!quizActive || phase !== 'driving') return;

    const content = contentRef.current;
    if (!content) return;

    // Reset exclusion list if all questions answered
    const validExcludeIds =
      answeredIds.length >= content.questions.length ? [] : answeredIds;

    const question = getRandomQuestion(content, validExcludeIds);
    triggerQuiz(question);
  }, [quizActive]); // eslint-disable-line react-hooks/exhaustive-deps
}
