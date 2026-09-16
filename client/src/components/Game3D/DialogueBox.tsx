/**
 * DialogueBox — story text for Quiet Roads. Lines and stage directions are
 * tap-to-advance (unless auto_ms); choices render as buttons. Timed choices
 * show a shrinking bar. Whisper is the default volume in this world, so the
 * box is small and quiet; a "shout" line gets a red edge because it cost her.
 */
import { useEffect, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useQRStore } from '@/stores/qrStore';
import { QuietRoads } from '@/systems/QuietRoadsBridge';
import { STILL_FOR_SCENE } from './stills';

export function DialogueBox() {
  const line = useQRStore((s) => s.line);
  const direction = useQRStore((s) => s.direction);
  const choices = useQRStore((s) => s.choices);
  const phase = useGameStore((s) => s.phase);
  const worldMode = useGameStore((s) => s.worldMode);
  const sceneId = useQRStore((s) => s.sceneId);
  const [tick, setTick] = useState(0);

  // Shrinking bar for timed choices
  useEffect(() => {
    if (!choices?.node.timeout_ms) return;
    setTick(0);
    const start = performance.now();
    const id = window.setInterval(() => setTick(Math.min(1, (performance.now() - start) / choices.node.timeout_ms!)), 50);
    return () => window.clearInterval(id);
  }, [choices]);

  if (worldMode !== 'kent' || phase === 'quiz' || phase === 'paused' || phase === 'menu' || phase === 'card') return null;
  if (!line && !direction && !choices) return null;
  const cutscene = phase === 'dialogue';

  const speakerName = line ? (line.speaker_def?.name ?? line.speaker) : '';
  const speakerColor = line?.speaker_def?.color ?? '#ddd';
  const loud = line?.volume === 'shout' || line?.volume === 'raised';
  const radio = line?.voice_bed && line.voice_bed !== 'none';

  return (
    <div data-ui style={{ ...styles.wrap, pointerEvents: cutscene ? 'auto' : 'none' }} onClick={() => { if (!choices) QuietRoads.tap(); }}>
      {cutscene && <div style={styles.dim} />}
      {cutscene && sceneId && STILL_FOR_SCENE[sceneId] && (
        <img src={STILL_FOR_SCENE[sceneId]} alt="" style={styles.still} />
      )}
      <div data-ui onClick={(e) => { if (!cutscene && !choices) { e.stopPropagation(); QuietRoads.tap(); } }} style={{ ...styles.box, pointerEvents: 'auto', borderColor: loud ? '#ff4444' : radio ? '#5DADE2' : 'rgba(255,255,255,0.18)' }}>
        {line && (
          <>
            <div style={{ ...styles.speaker, color: speakerColor }}>
              {radio ? '📻 ' : ''}{speakerName}
              {line.delivery === 'SYS' && <span style={styles.sys}>  · note to self</span>}
            </div>
            <div style={{ ...styles.text, fontStyle: line.emotion === 'reading' ? 'italic' : 'normal' }}>{line.text}</div>
            {line.auto_ms == null && !choices && <div style={styles.hint}>tap</div>}
          </>
        )}
        {direction && !line && (
          <div style={styles.direction}>{direction.node.text}</div>
        )}
        {choices && (
          <div style={styles.choices}>
            {choices.options.map((o) => (
              <button key={o.id} style={styles.choice} onClick={(e) => { e.stopPropagation(); QuietRoads.choose(o.id); }}>
                {o.text}
              </button>
            ))}
            {choices.node.timeout_ms != null && (
              <div style={styles.timerTrack}><div style={{ ...styles.timerFill, width: `${(1 - tick) * 100}%` }} /></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'fixed', inset: 0, zIndex: 220, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' },
  dim: { position: 'absolute', inset: 0, background: 'rgba(5,6,10,0.72)' },
  still: { position: 'absolute', left: '50%', top: 'calc(8% + env(safe-area-inset-top))', transform: 'translateX(-50%)', width: 'min(92vw, 520px)', aspectRatio: '606 / 361', objectFit: 'cover', borderRadius: 10, opacity: 0.92, boxShadow: '0 12px 40px rgba(0,0,0,0.7)', filter: 'saturate(0.85)' },
  box: { position: 'relative', width: 'min(720px, 92vw)', background: 'rgba(10,12,18,0.92)', border: '1px solid', borderRadius: 12, padding: '12px 16px 10px', color: '#eee', fontFamily: 'system-ui, sans-serif', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' },
  speaker: { fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 },
  sys: { color: '#888', fontWeight: 400, textTransform: 'none', letterSpacing: 0 },
  text: { fontSize: 17, lineHeight: 1.4 },
  direction: { fontSize: 15, lineHeight: 1.4, color: '#b8bcc6', fontStyle: 'italic' },
  hint: { position: 'absolute', right: 12, bottom: 6, fontSize: 10, color: '#666', letterSpacing: '0.2em' },
  choices: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 },
  choice: { background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, padding: '12px 14px', fontSize: 15, textAlign: 'left', cursor: 'pointer', minHeight: 48 },
  timerTrack: { height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  timerFill: { height: '100%', background: '#ffd93d', transition: 'width 50ms linear' },
};
