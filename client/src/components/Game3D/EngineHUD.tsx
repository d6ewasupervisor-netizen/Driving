/**
 * EngineHUD — Displays RPM, gear, speed, ABS status
 * Rendered as an overlay on top of the 3D scene
 */
import { useGameStore } from '@/stores/gameStore';

export function EngineHUD() {
  const rpm = useGameStore((s) => s.engineRPM);
  const gear = useGameStore((s) => s.engineGear);
  const speed = useGameStore((s) => s.engineSpeed);
  const absActive = useGameStore((s) => s.absActive);

  const redline = rpm > 6000;
  const rpmPercent = (rpm / 7000) * 100;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 32,
        right: 32,
        color: '#fff',
        fontFamily: 'monospace',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {/* ABS indicator */}
      {absActive && (
        <div
          style={{
            color: '#f39c12',
            fontSize: 14,
            letterSpacing: 2,
            fontWeight: 'bold',
          }}
        >
          ABS
        </div>
      )}

      {/* Speed */}
      <div style={{ fontSize: 13, color: '#aaa' }}>
        {speed.toFixed(0).padStart(3, ' ')}{' '}
        <span style={{ fontSize: 11 }}>mph</span>
      </div>

      {/* RPM */}
      <div style={{ fontSize: 13, color: redline ? '#e74c3c' : '#aaa' }}>
        {rpm.toFixed(0).padStart(4, ' ')}{' '}
        <span style={{ fontSize: 11 }}>rpm</span>
      </div>

      {/* Gear display */}
      <div
        style={{
          fontSize: 36,
          fontWeight: 'bold',
          color: redline ? '#e74c3c' : '#fff',
          minWidth: 50,
          textAlign: 'center',
        }}
      >
        {gear === 0 ? 'N' : gear}
      </div>

      {/* RPM bar */}
      <div
        style={{
          width: 160,
          height: 6,
          background: '#333',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${rpmPercent}%`,
            height: '100%',
            background: redline ? '#e74c3c' : '#2ecc71',
            borderRadius: 3,
            transition: 'width 0.05s',
          }}
        />
      </div>
    </div>
  );
}
