/**
 * Reusable timing pattern hooks for R3F + Rapier games.
 *
 * - useFixedTick: run a callback at a fixed Hz independent of physics rate (e.g. AI)
 * - useTimeScale: slow-mo / fast-forward for physics, with sane caps
 * - useFrameSmoothed: smooth a HUD value toward a fixed-rate target at render rate
 * - useKeyState: read keyboard state from a ref maintained outside hooks
 * - createSeededRNG: deterministic Math.random replacement for replays
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier';

// ============================================================
// useFixedTick
// ============================================================

/**
 * Run `callback(dt)` at a fixed rate (Hz), driven by the physics step.
 * Useful for things that should be deterministic but cheaper than physics
 * (AI decisions at 10Hz while physics runs at 60Hz).
 *
 * The callback is called with the FIXED dt, not the actual elapsed time —
 * this is the whole point of a fixed timestep.
 *
 * @param hz - Tick rate in Hz (e.g., 10 for 10Hz, 1/0.1 for every 100ms)
 * @param callback - Called with the fixed dt for this tick rate
 *
 * Example:
 *   useFixedTick(10, () => { runAI(); }); // runs ~10x per second
 */
export function useFixedTick(hz: number, callback: (dt: number) => void) {
  const fixedDt = 1 / hz;
  const accumRef = useRef(0);
  const callbackRef = useRef(callback);
  const { world } = useRapier();

  // Keep the latest callback without re-subscribing
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useBeforePhysicsStep(() => {
    accumRef.current += world.timestep;

    // Clamp to prevent spiral of death after a long pause/freeze
    if (accumRef.current > 0.25) {
      accumRef.current = fixedDt; // run at most one step on resume
    }

    while (accumRef.current >= fixedDt) {
      accumRef.current -= fixedDt;
      callbackRef.current(fixedDt);
    }
  });
}

// ============================================================
// useTimeScale
// ============================================================

/**
 * Compute a Rapier-compatible timeStep value for a given time scale.
 * Caps at 2x to keep the solver stable.
 *
 *   const timeStep = useTimeScale(0.25); // quarter speed
 *   <Physics timeStep={timeStep}>
 *
 * NOTE: at slowest speeds the solver runs MORE steps per wall second,
 * which is more expensive. Don't go below 0.1.
 *
 * @param scale - 1.0 = normal, 0.5 = half speed, 2.0 = double speed
 * @returns timeStep value to pass to <Physics timeStep={...}>
 */
export function useTimeScale(scale: number): number {
  const clamped = Math.max(0.1, Math.min(2.0, scale));
  return (1 / 60) / clamped;
}

// ============================================================
// useFrameSmoothed
// ============================================================

/**
 * Smooth a value toward a target at render rate. The target is updated
 * at fixed rate (in useAfterPhysicsStep typically); this hook reads it
 * each render frame and smooths the visible value.
 *
 *   const targetRef = useRef(0);
 *   useAfterPhysicsStep(() => { targetRef.current = computeNewSpeed(); });
 *   const visibleRef = useFrameSmoothed(targetRef, 12);
 *   useFrame(() => { hudEl.textContent = Math.round(visibleRef.current); });
 *
 * @param targetRef - Ref containing the target value (updated at fixed rate)
 * @param speed - Smoothing speed; ~12 feels good for HUD numbers, lower = lazier
 * @returns Ref containing the smoothed visible value
 */
export function useFrameSmoothed(
  targetRef: React.MutableRefObject<number>,
  speed: number = 12
): React.MutableRefObject<number> {
  const visibleRef = useRef(targetRef.current);

  useFrame((_, dt) => {
    const target = targetRef.current;
    const current = visibleRef.current;
    // Frame-rate-independent exponential smoothing
    const t = 1 - Math.exp(-speed * dt);
    visibleRef.current = current + (target - current) * t;
  });

  return visibleRef;
}

// ============================================================
// useKeyState
// ============================================================

/**
 * Maintain a ref of currently-pressed keys, updated by DOM events.
 * Read from useBeforePhysicsStep — never read from useFrame for inputs
 * that affect the simulation.
 *
 *   const keys = useKeyState({ forward: 'w', left: 'a', right: 'd', brake: ' ' });
 *   useBeforePhysicsStep(() => {
 *     if (keys.current.forward) applyEngine();
 *   });
 */
export function useKeyState<T extends Record<string, string>>(
  bindings: T
): React.MutableRefObject<Record<keyof T, boolean>> {
  const stateRef = useRef(
    Object.keys(bindings).reduce((acc, k) => ({ ...acc, [k]: false }), {} as any)
  );
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      for (const action in bindingsRef.current) {
        if (bindingsRef.current[action].toLowerCase() === k) {
          stateRef.current[action] = true;
        }
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      for (const action in bindingsRef.current) {
        if (bindingsRef.current[action].toLowerCase() === k) {
          stateRef.current[action] = false;
        }
      }
    };
    const onBlur = () => {
      // Reset all keys when window loses focus — prevents "stuck key" bug
      for (const action in stateRef.current) {
        stateRef.current[action] = false;
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return stateRef;
}

// ============================================================
// createSeededRNG
// ============================================================

/**
 * Deterministic seeded RNG (mulberry32). Use anywhere you'd use Math.random()
 * if you want reproducible runs (replays, networked game state, tests).
 *
 *   const rng = createSeededRNG(12345);
 *   const v = rng();           // 0 <= v < 1
 *   const i = rng.int(0, 10);  // 0 <= i < 10
 *
 * mulberry32 is fast, has a 2^32 period (huge for game purposes), and good
 * statistical quality. Don't use for cryptography.
 */
export function createSeededRNG(seed: number) {
  let s = seed | 0;
  const next = () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(next, {
    /** integer in [min, max) */
    int: (min: number, max: number) => Math.floor(next() * (max - min)) + min,
    /** float in [min, max) */
    range: (min: number, max: number) => min + next() * (max - min),
    /** boolean with probability p */
    chance: (p: number) => next() < p,
    /** pick a random item from an array */
    pick: <T>(arr: T[]): T => arr[Math.floor(next() * arr.length)],
    /** Fisher-Yates shuffle (mutates input) */
    shuffle: <T>(arr: T[]): T[] => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    /** Get current seed state (for save/restore) */
    getState: () => s,
    /** Set seed state (for save/restore) */
    setState: (state: number) => { s = state | 0; },
  });
}

// ============================================================
// Usage example: putting it together for a vehicle
// ============================================================

/*
function PlayerVehicle() {
  const { world } = useRapier();
  const controllerRef = useRef<DynamicRayCastVehicleController | null>(null);
  const speedTargetRef = useRef(0);

  const keys = useKeyState({
    forward: 'w', backward: 's', left: 'a', right: 'd', brake: ' ',
  });

  // Inputs at physics rate (deterministic)
  useBeforePhysicsStep(() => {
    const c = controllerRef.current;
    if (!c) return;
    const fwd = keys.current.forward ? 1 : keys.current.backward ? -1 : 0;
    const steer = (keys.current.left ? 1 : 0) - (keys.current.right ? 1 : 0);
    c.setWheelEngineForce(2, fwd * 1200);
    c.setWheelEngineForce(3, fwd * 1200);
    c.setWheelSteering(0, steer * 0.5);
    c.setWheelSteering(1, steer * 0.5);
    c.updateVehicle(world.timestep);
  });

  // State reads at physics rate
  useAfterPhysicsStep(() => {
    speedTargetRef.current = controllerRef.current?.currentVehicleSpeed() ?? 0;
  });

  // AI runs at 10Hz, not 60Hz
  useFixedTick(10, (dt) => {
    runZombieAI(dt); // dt is always 0.1
  });

  // HUD smoothed to render rate
  const speedVisibleRef = useFrameSmoothed(speedTargetRef, 8);
  useFrame(() => {
    document.getElementById('speedo')!.textContent =
      Math.round(speedVisibleRef.current * 3.6).toString(); // m/s -> km/h
  });

  return (...);
}
*/
