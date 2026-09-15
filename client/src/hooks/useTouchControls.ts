/**
 * useTouchControls — Multi-touch + keyboard + gamepad input for vehicle control
 *
 * Touch layout:
 *   Top 60%:    Steering zone (horizontal drag)
 *   Bot-left:   Brake
 *   Bot-right:  Gas (throttle)
 *
 * Gamepad (Standard mapping):
 *   Left stick X:  Steering (with dead zone)
 *   Right trigger:  Throttle (analog)
 *   Left trigger:   Brake (analog)
 *   A button:       Throttle (digital fallback)
 *   B / X button:   Brake (digital fallback)
 *   Start:          Pause
 *   D-pad L/R:      Steering (digital fallback)
 */
import { useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { useQRStore } from '@/stores/qrStore';

const DEAD_ZONE_PX = 5;
const STEER_DRAG_SCALE = 0.004; // px → steering value
const GAMEPAD_DEAD_ZONE = 0.12; // stick dead zone
const GAMEPAD_POLL_INTERVAL = 16; // ~60fps polling

interface ActiveTouch {
  zone: 'steer' | 'brake' | 'throttle';
  startX: number;
  startY: number;
}

export function useTouchControls() {
  const activeTouch = useRef<Map<number, ActiveTouch>>(new Map());
  const steerValue = useRef(0);
  const gamepadActive = useRef(false);
  const lastPausePress = useRef(0);
  const startPressedRef = useRef(false);

  useEffect(() => {
    const store = () => useGameStore.getState();
    const maybeEnterDriving = (controls: { steering: number; throttle: number; brake: number }) => {
      const phase = store().phase;
      const hasMovementIntent =
        Math.abs(controls.steering) > 0.05 || controls.throttle > 0.05 || controls.brake > 0.05;
      if ((phase === 'menu' || phase === 'paused') && hasMovementIntent) {
        store().setPhase(phase === 'paused' ? store().prePausePhase : 'driving');
      }
    };

    // ── Keyboard ─────────────────────────────────────────────────────────────
    const keys = new Set<string>();

    function applyKeyboard() {
      // keyboard active
      const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
      const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
      const fwd = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
      const back = keys.has('ArrowDown') || keys.has('s') || keys.has('S') || keys.has(' ');

      const sensitivity = store().steeringSensitivity;
      const steering = left ? -1 * sensitivity : right ? 1 * sensitivity : 0;

      const controls = {
        steering: Math.max(-1, Math.min(1, steering)),
        throttle: fwd ? 1 : 0,
        brake: back ? 1 : 0,
      };
      store().setControls(controls);
      maybeEnterDriving(controls);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.key);
      if (e.key === 'h' || e.key === 'H') useQRStore.getState().setHorn(true);
      if (e.key === 'Shift') useQRStore.getState().setRun(true);
      applyKeyboard();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key);
      if (e.key === 'h' || e.key === 'H') useQRStore.getState().setHorn(false);
      if (e.key === 'Shift') useQRStore.getState().setRun(false);
      applyKeyboard();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Touch ─────────────────────────────────────────────────────────────────
    function getZone(clientX: number, clientY: number, el: HTMLElement): ActiveTouch['zone'] {
      const rect = el.getBoundingClientRect();
      const relY = (clientY - rect.top) / rect.height;
      const relX = (clientX - rect.left) / rect.width;

      if (relY < 0.6) return 'steer';
      return relX < 0.5 ? 'brake' : 'throttle';
    }

    function applyTouch() {
      // touch active
      const entries = [...activeTouch.current.values()];
      const hasBrake = entries.some((t) => t.zone === 'brake');
      const hasThrottle = entries.some((t) => t.zone === 'throttle');
      const sensitivity = store().steeringSensitivity;

      const controls = {
        steering: Math.max(-1, Math.min(1, steerValue.current * sensitivity)),
        throttle: hasThrottle ? 1 : 0,
        brake: hasBrake ? 1 : 0,
      };
      store().setControls(controls);
      maybeEnterDriving(controls);
    }

    function onTouchStart(e: TouchEvent) {
      // Taps on UI (quiz answers, dialogue box, horn, menus) are not driving input.
      // preventDefault here would also kill their click events, so leave them alone.
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, a, input, select, textarea, [data-ui]')) return;
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      for (const touch of Array.from(e.changedTouches)) {
        const zone = getZone(touch.clientX, touch.clientY, el);
        activeTouch.current.set(touch.identifier, {
          zone,
          startX: touch.clientX,
          startY: touch.clientY,
        });
      }
      applyTouch();
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      for (const touch of Array.from(e.changedTouches)) {
        const data = activeTouch.current.get(touch.identifier);
        if (data?.zone === 'steer') {
          const dx = touch.clientX - data.startX;
          if (Math.abs(dx) > DEAD_ZONE_PX) {
            steerValue.current = dx * STEER_DRAG_SCALE;
          }
        }
      }
      applyTouch();
    }

    function onTouchEnd(e: TouchEvent) {
      e.preventDefault();
      for (const touch of Array.from(e.changedTouches)) {
        const data = activeTouch.current.get(touch.identifier);
        if (data?.zone === 'steer') {
          steerValue.current = 0;
        }
        activeTouch.current.delete(touch.identifier);
      }
      if (activeTouch.current.size === 0 && keys.size === 0) {
        applyIdleControls();
      } else {
        applyTouch();
      }
    }

    const container = document.getElementById('game-touch-area');
    if (container) {
      container.addEventListener('touchstart', onTouchStart, { passive: false });
      container.addEventListener('touchmove', onTouchMove, { passive: false });
      container.addEventListener('touchend', onTouchEnd, { passive: false });
      container.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    // ── Gamepad ───────────────────────────────────────────────────────────────
    function applyDeadZone(value: number): number {
      return Math.abs(value) < GAMEPAD_DEAD_ZONE ? 0 : value;
    }

    function applyIdleControls() {
      store().setControls({ steering: 0, throttle: 0, brake: 0 });
    }

    function hasActiveTouchInput() {
      return activeTouch.current.size > 0;
    }

    function pollGamepad() {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad: Gamepad | null = null;

      // Find first connected gamepad
      for (const gp of gamepads) {
        if (gp && gp.connected) {
          pad = gp;
          break;
        }
      }

      if (!pad) {
        gamepadActive.current = false;
        startPressedRef.current = false;
        if (keys.size > 0) {
          applyKeyboard();
        } else if (!hasActiveTouchInput()) {
          applyIdleControls();
        }
        return;
      }

      const kbLeft = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
      const kbRight = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
      const kbForward = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
      const kbBack = keys.has('ArrowDown') || keys.has('s') || keys.has('S') || keys.has(' ');

      // Standard gamepad mapping:
      // axes[0] = left stick X, axes[1] = left stick Y
      // buttons[0] = A, buttons[1] = B, buttons[2] = X, buttons[3] = Y
      // buttons[4] = LB, buttons[5] = RB
      // buttons[6] = LT (analog trigger), buttons[7] = RT (analog trigger)
      // buttons[9] = Start/Menu
      // buttons[12] = D-Up, buttons[13] = D-Down, buttons[14] = D-Left, buttons[15] = D-Right

      const stickX = applyDeadZone(pad.axes[0] ?? 0);

      // Triggers — some gamepads report as axes[2]/axes[5], others as buttons[6]/buttons[7]
      let triggerThrottle = 0;
      let triggerBrake = 0;

      // Try button values first (standard mapping)
      if (pad.buttons[7]) {
        triggerThrottle = pad.buttons[7].value; // RT
      }
      if (pad.buttons[6]) {
        triggerBrake = pad.buttons[6].value; // LT
      }

      // Digital fallbacks
      const aButton = pad.buttons[0]?.pressed ?? false;  // A = throttle
      const bButton = pad.buttons[1]?.pressed ?? false;  // B = brake
      const xButton = pad.buttons[2]?.pressed ?? false;  // X = brake alt

      // D-pad steering fallback
      const dpadLeft = pad.buttons[14]?.pressed ?? false;
      const dpadRight = pad.buttons[15]?.pressed ?? false;

      // Combine inputs
      const throttle = Math.max(triggerThrottle, aButton ? 1 : 0);
      const brake = Math.max(triggerBrake, bButton || xButton ? 1 : 0);
      let steering = stickX;
      if (dpadLeft) steering = -1;
      if (dpadRight) steering = 1;

      // Merge keyboard + gamepad so a connected pad with slight stick drift
      // cannot suppress keyboard throttle/brake.
      const kbThrottle = kbForward ? 1 : 0;
      const kbBrake = kbBack ? 1 : 0;
      if (kbLeft || kbRight) steering = kbLeft ? -1 : 1;

      // Only treat real stick/pedal input as gamepad driving. (Any-button checks
      // cause phantom "input" on some drivers and overwrite keyboard with zeros.)
      const eps = 0.02;
      const hasMovementInput =
        Math.abs(steering) > eps ||
        Math.max(throttle, kbThrottle) > eps ||
        Math.max(brake, kbBrake) > eps;

      if (hasMovementInput) {
        gamepadActive.current = true;
        const sensitivity = store().steeringSensitivity;
        const controls = {
          steering: Math.max(-1, Math.min(1, steering * sensitivity)),
          throttle: Math.min(1, Math.max(throttle, kbThrottle)),
          brake: Math.min(1, Math.max(brake, kbBrake)),
        };
        store().setControls(controls);
        maybeEnterDriving(controls);
      } else {
        gamepadActive.current = false;
        if (keys.size > 0) {
          applyKeyboard();
        } else if (!hasActiveTouchInput()) {
          applyIdleControls();
        }
      }

      // Pause button (Start/Menu) — debounced
      const startButton = pad.buttons[9]?.pressed ?? false;
      const now = Date.now();
      if (startButton && !startPressedRef.current && now - lastPausePress.current > 300) {
        lastPausePress.current = now;
        store().togglePause();
      }
      startPressedRef.current = startButton;
    }

    // Poll gamepad at ~60fps
    const gamepadInterval = setInterval(pollGamepad, GAMEPAD_POLL_INTERVAL);

    // Gamepad connection events (for HUD notification)
    const onGamepadConnected = (e: GamepadEvent) => {
      gamepadActive.current = true;
      console.log(`Gamepad connected: ${e.gamepad.id}`);
    };
    const onGamepadDisconnected = () => {
      gamepadActive.current = false;
      startPressedRef.current = false;
    };

    window.addEventListener('gamepadconnected', onGamepadConnected);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('gamepadconnected', onGamepadConnected);
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected);
      clearInterval(gamepadInterval);
      if (container) {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', onTouchEnd);
        container.removeEventListener('touchcancel', onTouchEnd);
      }
    };
  }, []);
}
