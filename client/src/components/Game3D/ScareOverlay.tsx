/**
 * ScareOverlay — the card game's Quiet visuals, in the 3D game.
 *   edge:  a swarm is close — the palm on the glass creeps in from the side and pulses
 *   flood: soft-fail — the windshield fills with handprints, then the mirror contact
 * Reads the sim four times a second; no per-frame React.
 */
import { useEffect, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useQRStore } from '@/stores/qrStore';
import { QuietRoads } from '@/systems/QuietRoadsBridge';

export function ScareOverlay() {
  const worldMode = useGameStore((s) => s.worldMode);
  const scare = useQRStore((s) => s.scare);
  const [near, setNear] = useState(0);

  useEffect(() => {
    if (worldMode !== 'kent') return;
    const id = window.setInterval(() => {
      const g = useGameStore.getState();
      if (g.phase !== 'driving' && g.phase !== 'walking') { setNear(0); return; }
      const p = QuietRoads.sim.playerPos;
      let n = 0;
      for (const q of QuietRoads.sim.quiet.list) {
        if (q.zone !== QuietRoads.sim.playerZone || q.state < 3) continue;
        if (Math.hypot(q.pos.x - p.x, q.pos.y - p.y) < 6) n++;
      }
      setNear(n);
    }, 250);
    return () => window.clearInterval(id);
  }, [worldMode]);

  if (worldMode !== 'kent') return null;
  const edge = scare === 'edge' || (near >= 1 && scare === 'none');
  const flood = scare === 'flood';
  const intensity = Math.min(1, near / 3);
  return (
    <div style={styles.root} aria-hidden>
      {edge && (
        <>
          <img src="/quiet/palm.webp" alt="" style={{ ...styles.palm, opacity: 0.35 + intensity * 0.5, transform: `translate(${-8 + intensity * 10}%, 0) scale(${0.9 + intensity * 0.25})` }} />
          <div style={{ ...styles.vignette, opacity: 0.25 + intensity * 0.5 }} />
        </>
      )}
      {flood && (
        <>
          <img src="/quiet/flood.webp" alt="" style={styles.flood} />
          <img src="/quiet/contact.webp" alt="" style={styles.contact} />
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 205, overflow: 'hidden' },
  palm: { position: 'absolute', left: 0, top: '10%', height: '70%', mixBlendMode: 'screen', transition: 'opacity 300ms, transform 300ms', animation: 'qr-palm 1.6s ease-in-out infinite alternate' },
  vignette: { position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(60,0,0,0.6) 100%)', transition: 'opacity 300ms' },
  flood: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'screen', opacity: 0.85 },
  contact: { position: 'absolute', right: '4%', bottom: '18%', width: '46%', opacity: 0.95, filter: 'contrast(1.1)', animation: 'qr-contact 220ms steps(2) 3' },
};
