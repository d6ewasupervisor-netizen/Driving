/**
 * Performance utilities — thermal throttle detection + low-end device check
 */

// Rolling frame delta average (60 frames)
const DELTA_WINDOW = 60;
const deltas: number[] = [];
let slowFrameSeconds = 0;

/**
 * Call each frame with the frame delta.
 * Returns true if throttling is detected (avg delta > 50ms for 5+ seconds).
 */
export function recordDelta(delta: number): boolean {
  deltas.push(delta);
  if (deltas.length > DELTA_WINDOW) deltas.shift();

  const avg = deltas.reduce((s, d) => s + d, 0) / deltas.length;

  if (avg > 0.05) {
    slowFrameSeconds += delta;
  } else {
    slowFrameSeconds = Math.max(0, slowFrameSeconds - delta * 2);
  }

  return slowFrameSeconds > 5;
}

/**
 * Check if this is a low-end device at mount time.
 */
export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const lowCores = navigator.hardwareConcurrency <= 4;
  const oldAndroid = /Android.*Chrome\/[0-6]/.test(navigator.userAgent);
  return lowCores || oldAndroid;
}

/**
 * Reduce pixel ratio on a WebGL renderer to save GPU.
 */
export function applyThrottledQuality(gl: WebGLRenderingContext | null): void {
  if (gl && 'setPixelRatio' in gl) {
    (gl as unknown as { setPixelRatio: (r: number) => void }).setPixelRatio(1);
  }
}
