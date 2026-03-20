/**
 * LovesStopScreen — Love's Truck Stop fuel encounter overlay
 * Triggered when phase === 'gasStation'
 */
import { useCallback } from 'react';
import { useGameStore } from '@/stores/gameStore';

function FuelBar({ fuel }: { fuel: number }) {
  const color = fuel > 50 ? '#39ff14' : fuel > 25 ? '#ffd93d' : '#ff4444';
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ color: '#aaa', fontSize: '12px' }}>FUEL</span>
        <span style={{ color, fontSize: '12px', fontWeight: 700 }}>{Math.round(fuel)}%</span>
      </div>
      <div style={{ height: '12px', background: '#333', borderRadius: '6px', overflow: 'hidden' }}>
        <div style={{
          width: `${fuel}%`,
          height: '100%',
          background: color,
          borderRadius: '6px',
          transition: 'width 0.3s',
        }} />
      </div>
    </div>
  );
}

export function LovesStopScreen() {
  const phase = useGameStore((s) => s.phase);
  const fuel = useGameStore((s) => s.fuel);
  const zCoins = useGameStore((s) => s.zCoins);
  const refuel = useGameStore((s) => s.refuel);
  const setPhase = useGameStore((s) => s.setPhase);

  const fillCost = Math.ceil((100 - fuel) * 0.3);
  const canAfford = zCoins >= fillCost;
  const alreadyFull = fuel >= 100;

  const handleFillUp = useCallback(() => {
    refuel();
  }, [refuel]);

  const handleSkip = useCallback(() => {
    setPhase('driving');
  }, [setPhase]);

  if (phase !== 'gasStation') return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Sign */}
        <div style={styles.sign}>
          <div style={styles.signText}>LOVE'S</div>
          <div style={styles.signSub}>Travel Stop</div>
        </div>

        <h2 style={styles.title}>⛽ Fuel Stop!</h2>

        <FuelBar fuel={fuel} />

        <div style={styles.coinRow}>
          <span style={styles.coinLabel}>Z-Coins Balance:</span>
          <span style={styles.coinValue}>💰 {zCoins}</span>
        </div>

        {!alreadyFull && (
          <div style={styles.costRow}>
            <span style={styles.costLabel}>Fill Cost:</span>
            <span style={{ ...styles.costValue, color: canAfford ? '#39ff14' : '#ff4444' }}>
              {fillCost} Z-Coins
            </span>
          </div>
        )}

        <div style={styles.tipBox}>
          <span style={styles.tipLabel}>💡 T's Tip:</span>
          <span style={styles.tipText}>"Always fill up before you're on empty!"</span>
        </div>

        <div style={styles.btnRow}>
          {!alreadyFull ? (
            <button
              style={{ ...styles.btn, ...styles.btnFill, opacity: canAfford ? 1 : 0.5 }}
              onClick={handleFillUp}
              disabled={!canAfford}
            >
              ⛽ FILL UP ({fillCost} Z)
            </button>
          ) : (
            <div style={{ ...styles.btn, ...styles.btnFill, opacity: 0.5 }}>
              Tank Full ✓
            </div>
          )}
          <button style={{ ...styles.btn, ...styles.btnSkip }} onClick={handleSkip}>
            Skip →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Out of Gas ───────────────────────────────────────────────────────────────
export function OutOfGasScreen() {
  const phase = useGameStore((s) => s.phase);
  const resetProgress = useGameStore((s) => s.resetProgress);

  if (phase !== 'outOfGas') return null;

  return (
    <div style={styles.overlay}>
      <div style={{ ...styles.modal, textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '1rem' }}>⛽</div>
        <h2 style={{ color: '#ff4444', marginBottom: '0.5rem', fontSize: '28px' }}>
          OUT OF GAS!
        </h2>
        <p style={{ color: '#aaa', marginBottom: '0.5rem' }}>
          You ran out of fuel on the road.
        </p>
        <div style={styles.tipBox}>
          <span style={styles.tipLabel}>💡 T's Tip:</span>
          <span style={styles.tipText}>"Keep an eye on that fuel gauge, driver!"</span>
        </div>
        <button
          style={{ ...styles.btn, ...styles.btnFill, marginTop: '1rem' }}
          onClick={resetProgress}
        >
          🔄 TRY AGAIN
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
    padding: '1rem',
    pointerEvents: 'auto',
  },
  modal: {
    background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
    border: '2px solid #ff6b35',
    borderRadius: '16px',
    padding: '2rem',
    maxWidth: '420px',
    width: '100%',
    boxShadow: '0 0 40px rgba(255,107,53,0.3)',
  },
  sign: {
    background: 'linear-gradient(90deg, #e63900, #ff6b00)',
    borderRadius: '8px',
    padding: '0.5rem 1rem',
    textAlign: 'center',
    marginBottom: '1rem',
    boxShadow: '0 0 20px rgba(230,57,0,0.6)',
  },
  signText: {
    color: 'white',
    fontWeight: 900,
    fontSize: '28px',
    letterSpacing: '0.1em',
  },
  signSub: {
    color: '#ffe4cc',
    fontSize: '12px',
    letterSpacing: '0.2em',
  },
  title: {
    color: 'white',
    fontSize: '22px',
    marginBottom: '1.25rem',
    textAlign: 'center',
  },
  coinRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
  },
  coinLabel: { color: '#aaa', fontSize: '14px' },
  coinValue: { color: '#ffd93d', fontSize: '14px', fontWeight: 700 },
  costRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  costLabel: { color: '#aaa', fontSize: '14px' },
  costValue: { fontSize: '14px', fontWeight: 700 },
  tipBox: {
    background: '#0d1a2e',
    borderRadius: '8px',
    padding: '0.75rem',
    marginBottom: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  tipLabel: { color: '#ffd93d', fontSize: '12px', fontWeight: 700 },
  tipText: { color: '#ccd', fontSize: '13px', fontStyle: 'italic' },
  btnRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '0.75rem',
  },
  btn: {
    borderRadius: '8px',
    padding: '0.75rem',
    fontWeight: 700,
    fontSize: '15px',
    cursor: 'pointer',
    border: 'none',
    minHeight: '44px',
  },
  btnFill: {
    background: 'linear-gradient(90deg, #e63900, #ff9500)',
    color: 'white',
    boxShadow: '0 0 15px rgba(230,57,0,0.4)',
  },
  btnSkip: {
    background: '#2a2a3a',
    color: '#aaa',
    border: '1px solid #445',
  },
};
