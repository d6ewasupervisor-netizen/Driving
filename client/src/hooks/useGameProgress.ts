/**
 * Game Progress Hook - Manages saving/loading game state to backend
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/authContext';

const API_BASE = 'http://localhost:3001/api';

export interface GameProgress {
  currentMile: number;
  hp: number;
  fuel: number;
  zCoins: number;
  questionsAnswered: number;
  correctAnswers: number;
  completedEncounters: string[];
  lastSaveLocation: string;
}

export interface QuizStats {
  totalAnswered: number;
  totalCorrect: number;
  categoryStats: Record<string, { answered: number; correct: number }>;
}

export function useGameProgress() {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, _setError] = useState<string | null>(null);
  const [savedProgress, setSavedProgress] = useState<GameProgress | null>(null);

  // Load progress on mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const loadProgress = async () => {
      try {
        const res = await fetch(`${API_BASE}/game/progress`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSavedProgress({
            currentMile: data.progress.currentMile || 0,
            hp: data.progress.vehicleHealth || 100,
            fuel: 100,
            zCoins: data.progress.zCoins || 0,
            questionsAnswered: data.progress.questionsAnswered || 0,
            correctAnswers: data.progress.correctAnswers || 0,
            completedEncounters: data.progress.completedEncounters || [],
            lastSaveLocation: data.progress.lastSaveLocation || 'New York, NY'
          });
        }
      } catch (err) {
        console.error('Failed to load progress:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProgress();
  }, [token]);

  // Save progress
  const saveProgress = useCallback(async (progress: Partial<GameProgress>) => {
    if (!token) return;

    try {
      await fetch(`${API_BASE}/game/progress/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currentMile: progress.currentMile,
          vehicleHealth: progress.hp,
          stressLevel: 100 - (progress.hp || 100), // Inverse of HP
          lastSaveLocation: progress.lastSaveLocation
        })
      });
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  }, [token]);

  // Record quiz answer
  const recordQuizAnswer = useCallback(async (
    questionId: string,
    category: string,
    correct: boolean,
    selectedAnswer: string,
    correctAnswer: string
  ) => {
    if (!token) return;

    try {
      await fetch(`${API_BASE}/quiz/record`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          questionId,
          category,
          selectedAnswer,
          correctAnswer,
          isCorrect: correct
        })
      });
    } catch (err) {
      console.error('Failed to record quiz answer:', err);
    }
  }, [token]);

  // Complete journey
  const completeJourney = useCallback(async (finalStats: {
    questionsAnswered: number;
    correctAnswers: number;
    zCoins: number;
  }) => {
    if (!token) return;

    try {
      await fetch(`${API_BASE}/game/progress/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currentMile: 2800,
          vehicleHealth: 100,
          journeyComplete: true,
          ...finalStats
        })
      });
    } catch (err) {
      console.error('Failed to complete journey:', err);
    }
  }, [token]);

  return {
    loading,
    error,
    savedProgress,
    saveProgress,
    recordQuizAnswer,
    completeJourney,
    isLoggedIn: !!user
  };
}
