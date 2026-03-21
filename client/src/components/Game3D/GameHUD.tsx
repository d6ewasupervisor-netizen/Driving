/**
 * GameHUD — Heads-up display rendered in the HTML layer
 */
import { useCallback } from 'react';
import { useGameStore } from '@/stores/gameStore';

// ─── Speedometer (SVG arc) ────────────────────────────────────────────────────
function Speedometer({ mph }: { mph: number }) {
  const MIN_ANGLE = -135;
  const MAX_ANGLE = 135;
  const MAX_MPH = 80;
  const angle = MIN_ANGLE + ((mph / MAX_MPH) * (MAX_ANGLE - MIN_ANGLE));
  const needleColor = mph < 40 ? '#39ff14' : mph < 55 ? '#ffd93d' : '#ff4444';

  // Arc path (SVG)
  const R = 38;
  const cx = 50;
  const cy = 55;

  function polarToXY(deg: number) {
    const rad = (deg - 90) * (Math.PI / 180);
    return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) };
  }

  const start = polarToXY(MIN_ANGLE);
  const end = polarToXY(MAX_ANGLE);
  const arcPath = `M ${start.x} ${start.y} A ${R} ${R} 0 1 1 ${end.x} ${end.y}`;

  const needle = polarToXY(angle);

  return (
    <svg width="100" height="70" viewBox="0 0 100 70">
      {/* Background arc */}
      <path d={arcPath} fill="none" stroke="#333" strokeWidth="6" strokeLinecap="round" />
      {/* Needle */}
      <line
        x1={cx} y1={cy}
        x2={needle.x} y2={needle.y}
        stroke={needleColor} strokeWidth="2" strokeLinecap="round"
      />
      {/* Center dot */}
      <circle cx={cx} cy={cy} r="3" fill={needleColor} />
      {/* Speed text */}
      <text
        x={cx} y={cy + 16}
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontFamily="monospace"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {mph}
      </text>
      <text x={cx} y={cy + 25} textAnchor="middle" fill="#777" fontSize="7">
        MPH
      </text>
    </svg>
  );
}

// ─── Bar ──────────────────────────────────────────────────────────────────────
function Bar({
  value,
  color,
  label,
}: {
  value: number;
  color: string;
  label: string;
}) {
  const barColor = color === 'fuel' && value < 25 ? '#ff4444' : color;
  return (
    <div style={{ minWidth: '90px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{ color: '#888', fontSize: '10px' }}>{label}</span>
        <span style={{ color: barColor, fontSize: '10px', fontWeight: 700 }}>
          {Math.round(value)}
        </span>
      </div>
      <div style={{ height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{
          width: `${value}%`,
          height: '100%',
          background: barColor,
          borderRadius: '4px',
          transition: 'width 0.2s',
        }} />
      </div>
    </div>
  );
}

// ─── Biome city labels ────────────────────────────────────────────────────────
const BIOME_LABEL: Record<string, string> = {
  city: 'New York → Pittsburgh',
  highway: 'Pittsburgh → Denver',
  rural: 'Denver → Spokane',
};

// ─── HUD ──────────────────────────────────────────────────────────────────────
export function GameHUD() {
  const mileage = useGameStore((s) => s.mileage);
  const currentBiome = useGameStore((s) => s.currentBiome);
  const zCoins = useGameStore((s) => s.zCoins);
  const velocityMph = useGameStore((s) => s.velocityMph);
  const hp = useGameStore((s) => s.hp);
  const fuel = useGameStore((s) => s.fuel);
  const streak = useGameStore((s) => s.streak);
  const zombiesHit = useGameStore((s) => s.zombiesHit);
  const phase = useGameStore((s) => s.phase);
  const setPhase = useGameStore((s) => s.setPhase);

  const handlePause = useCallback(() => setPhase('paused'), [setPhase]);

  if (phase !== 'driving') return null;

  const progress = Math.min(mileage / 2800, 1);

  return (
    <div style={styles.hud}>
      {/* Top row */}
      <div style={styles.topRow}>
        {/* Mileage + Biome */}
        <div style={styles.topLeft}>
          <div style={styles.mileage}>{Math.round(mileage)} mi</div>
          <div style={styles.biomeLabel}>{BIOME_LABEL[currentBiome]}</div>
        </div>

        {/* Progress bar — NYC to Spokane */}
        <div style={styles.topCenter}>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${progress * 100}%` }} />
          </div>
          <div style={styles.progressLabel}>NYC → SPOKANE</div>
        </div>

        {/* Z-Coins + Pause */}
        <div style={styles.topRight}>
          {zombiesHit > 0 && <span style={styles.zombieCount}>🧟 {zombiesHit}</span>}
          <span style={styles.coins}>💰 {zCoins}</span>
          <button style={styles.pauseBtn} onClick={handlePause} aria-label="Pause">
            ⏸
          </button>
        </div>
      </div>

      {/* Bottom row */}
      <div style={styles.bottomRow}>
        {/* Speedometer */}
        <div style={styles.speedoBox}>
          <Speedometer mph={velocityMph} />
        </div>

        {/* HP + Fuel bars */}
        <div style={styles.barsBox}>
          <Bar value={hp} color="#ff6b6b" label="HP" />
          <Bar value={fuel} color={fuel < 25 ? '#ff4444' : '#39ff14'} label="FUEL" />
        </div>

        {/* Streak */}
        {streak > 0 && (
          <div style={styles.streakBox}>
            <div style={styles.streakLabel}>🔥</div>
            <div style={styles.streakValue}>{streak}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  hud: {
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    paddingLeft: 'env(safe-area-inset-left)',
    paddingRight: 'env(safe-area-inset-right)',
    zIndex: 50,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  topRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)',
  },
  topLeft: {
    display: 'flex',
    flexDirection: 'column',
  },
  mileage: {
    color: 'white',
    fontSize: '18px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
  },
  biomeLabel: {
    color: '#aaa',
    fontSize: '10px',
    marginTop: '2px',
  },
  topCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    flex: 1,
    padding: '0 16px',
  },
  progressTrack: {
    width: '100%',
    maxWidth: '220px',
    height: '6px',
    background: '#333',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #ff00ff, #39ff14)',
    borderRadius: '3px',
    transition: 'width 0.3s',
  },
  progressLabel: {
    color: '#666',
    fontSize: '9px',
    letterSpacing: '0.08em',
  },
  topRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    pointerEvents: 'auto',
  },
  zombieCount: {
    color: '#66ff66',
    fontSize: '13px',
    fontWeight: 700,
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
  },
  coins: {
    color: '#ffd93d',
    fontSize: '14px',
    fontWeight: 700,
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
  },
  pauseBtn: {
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid #555',
    borderRadius: '6px',
    color: 'white',
    fontSize: '16px',
    width: '36px',
    height: '36px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRow: {
    display: 'flex',
    alignItems: 'flex-end',
    padding: '8px 12px',
    background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)',
    gap: '12px',
  },
  speedoBox: {},
  barsBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
    maxWidth: '180px',
  },
  streakBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'rgba(0,0,0,0.5)',
    borderRadius: '8px',
    padding: '6px 10px',
    border: '1px solid #ff6b6b',
    marginLeft: 'auto',
  },
  streakLabel: { fontSize: '16px' },
  streakValue: { color: '#ff6b6b', fontSize: '14px', fontWeight: 700 },
};
