/**
 * LoadingScreen — shown while R3F assets load
 * Uses useProgress from @react-three/drei
 */
import { useProgress } from '@react-three/drei';

export function LoadingScreen() {
  const { progress, active } = useProgress();

  if (!active) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.inner}>
        <div style={styles.car}>🚗</div>
        <h2 style={styles.title}>LOADING...</h2>
        <div style={styles.barTrack}>
          <div style={{ ...styles.barFill, width: `${progress}%` }} />
        </div>
        <p style={styles.pct}>{Math.round(progress)}%</p>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes carSlide {
          0%,100% { transform: translateX(-10px); }
          50%      { transform: translateX(10px); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: '#0a0a12',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  inner: {
    textAlign: 'center',
    padding: '2rem',
  },
  car: {
    fontSize: '56px',
    display: 'inline-block',
    animation: 'carSlide 1s ease-in-out infinite',
    marginBottom: '1rem',
  },
  title: {
    color: '#ff00ff',
    fontFamily: '"Black Ops One", Impact, sans-serif',
    fontSize: '28px',
    letterSpacing: '0.1em',
    marginBottom: '1.5rem',
    textShadow: '0 0 20px rgba(255,0,255,0.5)',
  },
  barTrack: {
    width: '240px',
    height: '8px',
    background: '#222',
    borderRadius: '4px',
    overflow: 'hidden',
    margin: '0 auto',
  },
  barFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #ff00ff, #39ff14)',
    borderRadius: '4px',
    transition: 'width 0.2s',
  },
  pct: {
    color: '#555',
    fontSize: '13px',
    marginTop: '0.5rem',
  },
};
