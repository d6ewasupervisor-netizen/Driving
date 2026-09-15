/**
 * QuietHUD — Quiet Roads overlay: noise meter (colour + shape + word, so it
 * reads without colour), posted speed limit vs. your speed, objective line,
 * horn button, toasts. Sits alongside the existing GameHUD/EngineHUD.
 */
import { useGameStore } from '@/stores/gameStore';
import { useQRStore } from '@/stores/qrStore';
import { QuietRoads } from '@/systems/QuietRoadsBridge';

const BAND = [
  { word: 'QUIET', color: '#39ff14', shape: '●' },
  { word: 'HEARD', color: '#ffd93d', shape: '▲' },
  { word: 'LOUD',  color: '#ff4444', shape: '■' },
] as const;

export function QuietHUD() {
  const worldMode = useGameStore((s) => s.worldMode);
  const phase = useGameStore((s) => s.phase);
  const velocityMph = useGameStore((s) => s.velocityMph);
  const frame = useQRStore((s) => s.frame);
  const objective = useQRStore((s) => s.objective);
  const toast = useQRStore((s) => s.toast);
  const tp = useQRStore((s) => s.vars.trade_points ?? 0);
  const setHorn = useQRStore((s) => s.setHorn);
  const run = useQRStore((s) => s.run);
  const setRun = useQRStore((s) => s.setRun);

  if (worldMode !== 'kent') return null;
  const driving = phase === 'driving';
  const walking = phase === 'walking';
  const active = driving || walking;
  const band = BAND[frame?.noiseBand ?? 0];
  const db = frame?.noiseDb ?? 20;
  const pct = Math.max(0, Math.min(1, (db - 20) / 80));
  const limit = frame?.speedLimitMph ?? 25;
  const over = velocityMph > limit + 5;
  const counts = QuietRoads.sim.quietSummary();
  const awake = counts.curious + counts.alert + counts.swarm;

  return (
    <div style={styles.root}>
      {/* Noise meter — top centre */}
      {active && (
        <div style={styles.meterWrap}>
          <div style={styles.meterLabel}>
            <span style={{ color: band.color, fontWeight: 800 }}>{band.shape} {band.word}</span>
            <span style={{ color: '#777' }}>{Math.round(db)} dB</span>
          </div>
          <div style={styles.meterTrack}>
            <div style={{ ...styles.meterFill, width: `${pct * 100}%`, background: band.color }} />
            <div style={{ ...styles.meterMark, left: `${((55 - 20) / 80) * 100}%` }} />
            <div style={{ ...styles.meterMark, left: `${((75 - 20) / 80) * 100}%` }} />
          </div>
          <div style={styles.awake}>
            {awake === 0 ? 'nobody\u2019s looking' : `${awake} looking${counts.swarm ? ` · ${counts.swarm} coming` : ''}`}
          </div>
        </div>
      )}

      {/* Speed limit sign — right side under the speedometer */}
      {driving && (
        <div style={{ ...styles.limit, borderColor: over ? '#ff4444' : '#fff', color: over ? '#ff4444' : '#111' }}>
          <div style={styles.limitTitle}>SPEED<br />LIMIT</div>
          <div style={styles.limitNum}>{limit}</div>
        </div>
      )}

      {/* Objective + TP — top left under HP/fuel */}
      {objective && (
        <div style={styles.objective}>
          <div style={styles.objTitle}>OBJECTIVE</div>
          <div>{objective}</div>
        </div>
      )}
      <div style={styles.tp}>TP {Math.round(tp)}</div>

      {/* Horn — big, deliberately in the way, because it should be a decision */}
      {driving && (
        <button
          style={styles.horn}
          onPointerDown={(e) => { e.preventDefault(); setHorn(true); }}
          onPointerUp={() => setHorn(false)}
          onPointerLeave={() => setHorn(false)}
          onPointerCancel={() => setHorn(false)}
          aria-label="Horn (H)"
        >
          HORN
        </button>
      )}

      {walking && (
        <button
          data-ui
          style={{ ...styles.horn, borderColor: run ? '#ffd93d' : '#888', background: run ? 'rgba(120,100,20,0.6)' : 'rgba(30,30,40,0.55)', color: run ? '#ffe680' : '#bbb' }}
          onPointerDown={(e) => { e.preventDefault(); setRun(!run); }}
          aria-label="Run (Shift)"
        >
          {run ? 'RUNNING' : 'WALK'}
        </button>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 210, fontFamily: 'system-ui, sans-serif' },
  meterWrap: { position: 'absolute', top: 'calc(10px + env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)', width: 220 },
  meterLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 12, letterSpacing: '0.1em', marginBottom: 3 },
  meterTrack: { position: 'relative', height: 10, background: 'rgba(0,0,0,0.5)', borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' },
  meterFill: { height: '100%', transition: 'width 80ms linear, background 200ms' },
  meterMark: { position: 'absolute', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.5)' },
  awake: { textAlign: 'center', fontSize: 10, color: '#999', marginTop: 3, letterSpacing: '0.08em' },
  limit: { position: 'absolute', top: 'calc(112px + env(safe-area-inset-top))', right: 16, width: 44, background: '#fff', border: '3px solid', borderRadius: 6, textAlign: 'center', padding: '3px 0', fontWeight: 800, lineHeight: 1 },
  limitTitle: { fontSize: 8, letterSpacing: '0.05em' },
  limitNum: { fontSize: 20, marginTop: 2 },
  objective: { position: 'absolute', top: 'calc(96px + env(safe-area-inset-top))', left: 16, maxWidth: 260, color: '#eee', fontSize: 13, background: 'rgba(0,0,0,0.45)', padding: '6px 10px', borderRadius: 8, borderLeft: '3px solid #F28DB2' },
  objTitle: { fontSize: 9, letterSpacing: '0.2em', color: '#F28DB2', marginBottom: 2 },
  tp: { position: 'absolute', top: 'calc(10px + env(safe-area-inset-top))', right: 16, color: '#ffd93d', fontWeight: 800, fontSize: 13, letterSpacing: '0.08em', background: 'rgba(0,0,0,0.45)', padding: '4px 8px', borderRadius: 6 },
  horn: { position: 'absolute', bottom: 'calc(96px + env(safe-area-inset-bottom))', right: 16, width: 64, height: 64, borderRadius: 32, border: '2px solid #ff4444', background: 'rgba(120,20,20,0.55)', color: '#ff9a9a', fontWeight: 800, fontSize: 11, letterSpacing: '0.1em', pointerEvents: 'auto', touchAction: 'none', userSelect: 'none' },
  toast: { position: 'absolute', bottom: 'calc(180px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', background: 'rgba(10,12,18,0.92)', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 14, border: '1px solid rgba(255,255,255,0.2)', maxWidth: '90vw' },
};
