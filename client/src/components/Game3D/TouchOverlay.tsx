/**
 * TouchOverlay — Visual indicators for touch controls
 * Shows steering needle arc + brake/throttle fill bars
 */
import { useGameStore } from '@/stores/gameStore';

function SteeringArc({ steering }: { steering: number }) {
  // Map steering -1..1 to angle
  const angle = steering * 45; // max ±45°
  const cx = 50;
  const cy = 50;
  const r = 35;

  // Arc endpoints
  function pt(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const start = pt(-45);
  const end = pt(45);
  const needle = pt(angle);

  return (
    <svg width="90" height="60" viewBox="0 0 100 70" style={{ overflow: 'visible' }}>
      {/* Track arc */}
      <path
        d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`}
        fill="none"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Needle line */}
      <line
        x1={cx} y1={cy}
        x2={needle.x} y2={needle.y}
        stroke="#ff00ff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r="4" fill="#ff00ff" />
    </svg>
  );
}

function PedalBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', width: '60px' }}>
      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{label}</div>
      <div style={{
        width: '28px',
        height: '56px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '14px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}>
        <div style={{
          width: '100%',
          height: `${value * 100}%`,
          background: color,
          borderRadius: '14px',
          transition: 'height 0.05s',
        }} />
      </div>
    </div>
  );
}

export function TouchOverlay() {
  const steering = useGameStore((s) => s.steering);
  const throttle = useGameStore((s) => s.throttle);
  const brake = useGameStore((s) => s.brake);
  const phase = useGameStore((s) => s.phase);

  if (phase !== 'driving' && phase !== 'walking') return null;

  return (
    <div style={styles.container} aria-hidden>
      {/* Steering indicator (center-bottom) */}
      <div style={styles.steerCenter}>
        <SteeringArc steering={steering} />
      </div>

      {/* Brake bar (bottom-left) */}
      <div style={styles.brakeArea}>
        <PedalBar value={brake} color="#ff4444" label={phase === 'walking' ? 'BACK' : 'BRAKE'} />
      </div>

      {/* Throttle bar (bottom-right) */}
      <div style={styles.throttleArea}>
        <PedalBar value={throttle} color="#39ff14" label={phase === 'walking' ? 'WALK' : 'GAS'} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 48,
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  steerCenter: {
    position: 'absolute',
    bottom: '18px',
    left: '50%',
    transform: 'translateX(-50%)',
    opacity: 0.7,
  },
  brakeArea: {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    opacity: 0.7,
  },
  throttleArea: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    opacity: 0.7,
  },
};
