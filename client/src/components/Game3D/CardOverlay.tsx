/**
 * CardOverlay — a PINK MENACE card, portrait. Image on top, the hook, the scene,
 * then the decision. After a pick: the result, right or wrong, the debrief, and
 * the DOL/PSDP source. Dossiers and beats have no decision; they read and continue.
 *
 * Shown for story cards (runner `card` nodes) and for in-world hazard cards.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQRStore } from '@/stores/qrStore';
import { QuietRoads } from '@/systems/QuietRoadsBridge';
import { CardDeck, type Card, type CardOption } from '@/quietroads';

export function CardOverlay() {
  const active = useQRStore((s) => s.card);
  const card: Card | undefined = useMemo(() => (active ? QuietRoads.deck.get(active.id) : undefined), [active]);
  const [picked, setPicked] = useState<CardOption | null>(null);
  const [imgReady, setImgReady] = useState(false);

  useEffect(() => { setPicked(null); setImgReady(false); }, [active?.id]);

  if (!active || !card) return null;
  const graded = CardDeck.isGraded(card);
  const options = card.options ?? [];

  const finish = () => {
    QuietRoads.finishCard({
      card: card.card_id,
      option: picked?.id ?? null,
      correct: graded ? (picked?.correct ?? false) : null,
      noise: picked?.state_delta?.noise,
      time_cost: picked?.state_delta?.time_cost,
    });
  };

  return (
    <div data-ui style={styles.wrap}>
      <div style={styles.scroll}>
        {card.image && (
          <div style={styles.imgBox}>
            <img
              src={card.image}
              alt=""
              onLoad={() => setImgReady(true)}
              style={{ ...styles.img, opacity: imgReady ? 1 : 0 }}
            />
            <div style={styles.imgFade} />
            <div style={styles.kicker}>{card.zone ?? card.act} · {card.card_type.replace(/-/g, ' ')}</div>
          </div>
        )}
        <div style={styles.body}>
          <h2 style={styles.title}>{card.title}</h2>
          {card.hook && <p style={styles.hook}>{card.hook}</p>}
          {card.scene && <p style={styles.scene}>{card.scene}</p>}

          {graded && !picked && (
            <>
              {card.decision && <p style={styles.decision}>{card.decision}</p>}
              <div style={styles.options}>
                {options.map((o) => (
                  <button key={o.id} data-ui style={styles.option} onClick={() => setPicked(o)}>
                    <span style={styles.optionId}>{o.id.toUpperCase()}</span>
                    <span>{o.text}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {picked && (
            <div style={{ ...styles.result, borderColor: picked.correct ? '#39ff14' : '#ff4444' }}>
              <div style={{ ...styles.verdict, color: picked.correct ? '#39ff14' : '#ff4444' }}>
                {picked.correct ? 'RIGHT' : 'WRONG'}
                {picked.state_delta?.noise != null && picked.state_delta.noise > 0 && (
                  <span style={styles.noiseTag}> · noise +{picked.state_delta.noise}</span>
                )}
              </div>
              <p style={styles.resultText}>{picked.result}</p>
            </div>
          )}

          {(picked || !graded) && card.debrief && (
            <div style={styles.debrief}>
              <div style={styles.debriefLabel}>DEBRIEF</div>
              <p style={styles.debriefText}>{card.debrief}</p>
              {card.source?.dol_section && card.source.dol_section !== 'n/a' && (
                <div style={styles.source}>WA Driver Guide {card.source.dol_section}{card.source.psdp_skill && card.source.psdp_skill !== 'n/a' ? ` · ${card.source.psdp_skill}` : ''}</div>
              )}
            </div>
          )}

          {(picked || !graded) && (
            <button data-ui style={styles.continue} onClick={finish}>CONTINUE</button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { position: 'fixed', inset: 0, zIndex: 240, background: '#07080c', pointerEvents: 'auto', fontFamily: 'system-ui, sans-serif', color: '#e8e6e1' },
  scroll: { position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  imgBox: { position: 'relative', width: '100%', aspectRatio: '3 / 4', maxHeight: '58vh', overflow: 'hidden', background: '#0e0f14' },
  img: { width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', transition: 'opacity 300ms', display: 'block' },
  imgFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 90, background: 'linear-gradient(to bottom, rgba(7,8,12,0), #07080c)' },
  kicker: { position: 'absolute', top: 'calc(10px + env(safe-area-inset-top))', left: 14, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#F28DB2', background: 'rgba(0,0,0,0.55)', padding: '4px 8px', borderRadius: 4 },
  body: { padding: '4px 18px calc(24px + env(safe-area-inset-bottom))' },
  title: { fontSize: 22, margin: '6px 0 4px', fontWeight: 800, letterSpacing: '-0.01em' },
  hook: { fontSize: 15, color: '#F28DB2', margin: '0 0 10px', fontStyle: 'italic' },
  scene: { fontSize: 15.5, lineHeight: 1.5, margin: '0 0 14px', color: '#d6d3cc' },
  decision: { fontSize: 16, fontWeight: 700, margin: '0 0 10px', color: '#fff' },
  options: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 },
  option: { display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)', borderRadius: 10, padding: '12px 12px', fontSize: 15, lineHeight: 1.35, cursor: 'pointer', minHeight: 52 },
  optionId: { flex: '0 0 auto', width: 22, height: 22, borderRadius: 11, background: 'rgba(242,141,178,0.25)', color: '#F28DB2', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  result: { border: '1px solid', borderRadius: 10, padding: '10px 12px', marginBottom: 12, background: 'rgba(255,255,255,0.03)' },
  verdict: { fontSize: 12, letterSpacing: '0.2em', fontWeight: 800, marginBottom: 6 },
  noiseTag: { color: '#ffd93d', letterSpacing: 0, fontWeight: 600 },
  resultText: { margin: 0, fontSize: 15, lineHeight: 1.45 },
  debrief: { borderLeft: '3px solid #F28DB2', padding: '6px 12px', marginBottom: 16 },
  debriefLabel: { fontSize: 10, letterSpacing: '0.2em', color: '#F28DB2', marginBottom: 4 },
  debriefText: { margin: 0, fontSize: 15, lineHeight: 1.45 },
  source: { marginTop: 6, fontSize: 11, color: '#8a8f99' },
  continue: { width: '100%', padding: '16px', fontSize: 15, fontWeight: 800, letterSpacing: '0.15em', background: '#F28DB2', color: '#1a0a12', border: 'none', borderRadius: 10, cursor: 'pointer' },
};
