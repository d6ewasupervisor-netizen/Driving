/**
 * GracieQTE — "Gracie's carrier is rattling." One big button, a shrinking window.
 * Tap in time and she settles; miss and the carrier bangs (55 dB).
 */
import { useEffect, useState } from 'react';
import { useQRStore } from '@/stores/qrStore';
import { QuietRoads } from '@/systems/QuietRoadsBridge';
import { WALKER } from '@/quietroads';

export function GracieQTE() {
  const active = useQRStore((s) => s.qteActive);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    setT(0);
    const id = window.setInterval(() => setT(Math.min(1, (performance.now() - start) / (WALKER.QTE_WINDOW_S * 1000))), 40);
    return () => window.clearInterval(id);
  }, [active]);
  if (!active) return null;
  return (
    <div style={styles.wrap}>
      <div style={styles.label}>Gracie's carrier is rattling</div>
      <button data-ui style={styles.btn} onPointerDown={(e) => { e.preventDefault(); QuietRoads.shh(); }}>SHH</button>
      <div style={styles.track}><div style={{ ...styles.fill, width: `${(1 - t) * 100}%` }} /></div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'fixed', left: '50%', top: '38%', transform: 'translate(-50%, -50%)', zIndex: 230, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, pointerEvents: 'none' },
  label: { color: '#ffd93d', fontSize: 14, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,0.8)' },
  btn: { pointerEvents: 'auto', width: 120, height: 120, borderRadius: 60, border: '3px solid #F2A63B', background: 'rgba(120,70,20,0.75)', color: '#fff', fontSize: 28, fontWeight: 900, letterSpacing: '0.15em', touchAction: 'none', userSelect: 'none', boxShadow: '0 0 30px rgba(242,166,59,0.5)' },
  track: { width: 160, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', background: '#F2A63B' },
};
