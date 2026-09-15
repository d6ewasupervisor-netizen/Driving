/**
 * QuizOverlay — Full-screen quiz modal rendered in the HTML layer
 */
import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useGameProgress } from '@/hooks/useGameProgress';
import { AudioManager } from '@/systems/AudioManager';
import { QuietRoads } from '@/systems/QuietRoadsBridge';

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function QuizOverlay() {
  const phase = useGameStore((s) => s.phase);
  const currentQuestion = useGameStore((s) => s.currentQuestion);
  const streak = useGameStore((s) => s.streak);
  const answerQuiz = useGameStore((s) => s.answerQuiz);
  const setPhase = useGameStore((s) => s.setPhase);
  const { recordQuizAnswer } = useGameProgress();

  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<{ correct: boolean; coinsEarned: number } | null>(null);
  const [options, setOptions] = useState<string[]>([]);

  // Shuffle options when question changes
  useEffect(() => {
    if (!currentQuestion) return;
    setSelected(null);
    setResult(null);
    setOptions(
      shuffleArray([currentQuestion.correctAnswer, ...currentQuestion.wrongAnswers])
    );
  }, [currentQuestion]);

  const handleAnswer = useCallback(
    (answer: string) => {
      if (selected || !currentQuestion) return;
      setSelected(answer);
      const res = answerQuiz(answer);
      setResult(res);
      if (currentQuestion.source === 'quietroads') QuietRoads.onQuizAnswered(currentQuestion.id, answer, res.correct);

      // Audio feedback
      if (res.correct) {
        AudioManager.playQuizCorrect();
      } else {
        AudioManager.playQuizWrong();
      }

      // Record to backend (fire and forget)
      recordQuizAnswer(
        currentQuestion.id,
        currentQuestion.category,
        res.correct,
        answer,
        currentQuestion.correctAnswer
      );
    },
    [selected, currentQuestion, answerQuiz, recordQuizAnswer]
  );

  const handleContinue = useCallback(() => {
    if (currentQuestion?.source === 'quietroads') QuietRoads.onQuizClosed();
    setPhase('driving');
    setSelected(null);
    setResult(null);
  }, [setPhase, currentQuestion]);

  if (phase !== 'quiz' || !currentQuestion) return null;

  const categoryLabel = currentQuestion.category.replace(/_/g, ' ').toUpperCase();

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.categoryBadge}>{categoryLabel}</span>
          {streak > 0 && (
            <span style={styles.streakBadge}>🔥 Streak: {streak}</span>
          )}
        </div>

        {/* Question */}
        <p style={styles.question}>{currentQuestion.question}</p>

        {/* Answer buttons */}
        <div style={styles.optionsGrid}>
          {options.map((opt) => {
            let bg = '#1e2a4a';
            if (selected === opt) {
              bg = result?.correct ? '#1a6640' : '#661a1a';
            } else if (selected && opt === currentQuestion.correctAnswer) {
              bg = '#1a6640'; // reveal correct if wrong
            }
            return (
              <button
                key={opt}
                style={{ ...styles.optionBtn, background: bg }}
                onClick={() => handleAnswer(opt)}
                disabled={!!selected}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {/* Result feedback */}
        {result && (
          <div style={styles.feedback}>
            {result.correct ? (
              <p style={styles.correct}>
                대박! +{result.coinsEarned} Z-Coins
              </p>
            ) : (
              <>
                <p style={styles.wrong}>아이고! -10 HP</p>
                {currentQuestion.explanation && (
                  <p style={styles.explanation}>{currentQuestion.explanation}</p>
                )}
              </>
            )}
            <button style={styles.continueBtn} onClick={handleContinue}>
              CONTINUE →
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseCorrect {
          0%,100% { box-shadow: 0 0 0 0 rgba(57,255,20,0.5); }
          50%      { box-shadow: 0 0 0 12px rgba(57,255,20,0); }
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%,60% { transform: translateX(-8px); }
          40%,80% { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
    pointerEvents: 'auto',
  },
  modal: {
    background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
    border: '2px solid #39ff14',
    borderRadius: '12px',
    padding: '1.5rem',
    maxWidth: '480px',
    width: '100%',
    animation: 'fadeIn 0.25s ease',
    boxShadow: '0 0 30px rgba(57,255,20,0.25)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
  },
  categoryBadge: {
    background: '#39ff14',
    color: '#0a0a0a',
    borderRadius: '4px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  streakBadge: {
    color: '#ff6b6b',
    fontSize: '13px',
    fontWeight: 700,
  },
  question: {
    color: 'white',
    fontSize: '18px',
    lineHeight: 1.5,
    marginBottom: '1rem',
  },
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  optionBtn: {
    color: 'white',
    border: '1px solid #334',
    borderRadius: '8px',
    padding: '0.75rem 0.5rem',
    minHeight: '44px',
    cursor: 'pointer',
    fontSize: '14px',
    textAlign: 'left',
    transition: 'background 0.15s',
  },
  feedback: {
    borderTop: '1px solid #334',
    paddingTop: '0.75rem',
  },
  correct: {
    color: '#39ff14',
    fontWeight: 700,
    fontSize: '18px',
    marginBottom: '0.5rem',
  },
  wrong: {
    color: '#ff6b6b',
    fontWeight: 700,
    fontSize: '18px',
    marginBottom: '0.5rem',
  },
  explanation: {
    color: '#aab',
    fontSize: '13px',
    marginBottom: '0.75rem',
  },
  continueBtn: {
    width: '100%',
    background: 'linear-gradient(90deg, #ff00ff, #cc00cc)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    padding: '0.75rem',
    fontWeight: 700,
    fontSize: '16px',
    cursor: 'pointer',
    letterSpacing: '0.05em',
  },
};
