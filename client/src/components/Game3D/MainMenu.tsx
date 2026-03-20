/**
 * MainMenu — shown when phase === 'menu'
 */
import { useCallback } from 'react';
import { useGameStore } from '@/stores/gameStore';

const BIOME_LABEL: Record<string, string> = {
  city: 'New York',
  highway: 'Pittsburgh',
  rural: 'Denver',
};

export function MainMenu({ onExit }: { onExit?: () => void }) {
  const phase = useGameStore((s) => s.phase);
  const mileage = useGameStore((s) => s.mileage);
  const currentBiome = useGameStore((s) => s.currentBiome);
  const setPhase = useGameStore((s) => s.setPhase);
  const resetProgress = useGameStore((s) => s.resetProgress);

  const handleNewGame = useCallback(() => {
    resetProgress();
    setPhase('driving');
  }, [resetProgress, setPhase]);

  const handleContinue = useCallback(() => {
    setPhase('driving');
  }, [setPhase]);

  if (phase !== 'menu') return null;

  const hasSave = mileage > 0;

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        {/* Bouncing car */}
        <div style={styles.carBounce}>🚗</div>

        <h1 style={styles.title}>K-POP ZOMBIE<br />ROAD WARRIOR</h1>
        <p style={styles.subtitle}>NYC → Spokane, WA</p>
        <p style={styles.tagline}>
          Drive, dodge, and ace your road test!
        </p>

        <div style={styles.btnStack}>
          <button style={{ ...styles.btn, ...styles.btnNew }} onClick={handleNewGame}>
            🚀 NEW GAME
          </button>

          {hasSave && (
            <button style={{ ...styles.btn, ...styles.btnContinue }} onClick={handleContinue}>
              ▶ CONTINUE
              <span style={styles.saveSummary}>
                Mile {Math.round(mileage)} • {BIOME_LABEL[currentBiome] ?? 'En Route'}
              </span>
            </button>
          )}

          {onExit && (
            <button style={{ ...styles.btn, ...styles.btnExit }} onClick={onExit}>
              ← Dashboard
            </button>
          )}
        </div>

        <p style={styles.credit}>Ali's Aigoo Apocalypse</p>
      </div>

      <style>{`
        @keyframes bounce {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-12px); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: '#121212',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
    pointerEvents: 'auto',
  },
  container: {
    textAlign: 'center',
    padding: '2rem',
    maxWidth: '380px',
    width: '100%',
  },
  carBounce: {
    fontSize: '56px',
    display: 'inline-block',
    animation: 'bounce 1.2s ease-in-out infinite',
    marginBottom: '0.5rem',
  },
  title: {
    color: '#ff00ff',
    fontFamily: '"Black Ops One", "Impact", sans-serif',
    fontSize: '32px',
    lineHeight: 1.1,
    textShadow: '0 0 20px rgba(255,0,255,0.6)',
    marginBottom: '0.5rem',
  },
  subtitle: {
    color: '#39ff14',
    fontSize: '14px',
    letterSpacing: '0.2em',
    marginBottom: '0.25rem',
  },
  tagline: {
    color: '#888',
    fontSize: '13px',
    marginBottom: '2rem',
  },
  btnStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  btn: {
    borderRadius: '10px',
    padding: '0.9rem 1.5rem',
    fontWeight: 700,
    fontSize: '16px',
    cursor: 'pointer',
    border: 'none',
    minHeight: '52px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    transition: 'opacity 0.15s',
  },
  btnNew: {
    background: 'linear-gradient(90deg, #ff00ff, #cc00cc)',
    color: 'white',
    boxShadow: '0 0 20px rgba(255,0,255,0.4)',
    fontSize: '18px',
    letterSpacing: '0.05em',
  },
  btnContinue: {
    background: 'linear-gradient(90deg, #1a4a1a, #2d7a2d)',
    color: '#39ff14',
    border: '1px solid #39ff14',
  },
  saveSummary: {
    fontSize: '11px',
    color: '#6bcb77',
    fontWeight: 400,
  },
  btnExit: {
    background: 'transparent',
    color: '#666',
    border: '1px solid #333',
  },
  credit: {
    color: '#333',
    fontSize: '11px',
    letterSpacing: '0.1em',
  },
};
