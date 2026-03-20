/**
 * useTouchControls — Multi-touch + keyboard input for vehicle control
 * Touch layout:
 *   Top 60%:    Steering zone (horizontal drag)
 *   Bot-left:   Brake
 *   Bot-right:  Gas (throttle)
 */
import { useEffect, useRef } from 'react';
import { useGameStore } from '@/stores/gameStore';

const DEAD_ZONE_PX = 5;
const STEER_DRAG_SCALE = 0.004; // px → steering value

interface ActiveTouch {
  zone: 'steer' | 'brake' | 'throttle';
  startX: number;
  startY: number;
}

export function useTouchControls() {
  const activeTouch = useRef<Map<number, ActiveTouch>>(new Map());
  const steerValue = useRef(0);

  useEffect(() => {
    const store = () => useGameStore.getState();

    // ── Keyboard ─────────────────────────────────────────────────────────────
    const keys = new Set<string>();

    function applyKeyboard() {
      const left = keys.has('ArrowLeft') || keys.has('a') || keys.has('A');
      const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D');
      const fwd = keys.has('ArrowUp') || keys.has('w') || keys.has('W');
      const back = keys.has('ArrowDown') || keys.has('s') || keys.has('S') || keys.has(' ');

      const sensitivity = store().steeringSensitivity;
      const steering = left ? -1 * sensitivity : right ? 1 * sensitivity : 0;

      store().setControls({
        steering: Math.max(-1, Math.min(1, steering)),
        throttle: fwd ? 1 : 0,
        brake: back ? 1 : 0,
      });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.key);
      applyKeyboard();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key);
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
      const entries = [...activeTouch.current.values()];
      const hasBrake = entries.some((t) => t.zone === 'brake');
      const hasThrottle = entries.some((t) => t.zone === 'throttle');
      const sensitivity = store().steeringSensitivity;

      store().setControls({
        steering: Math.max(-1, Math.min(1, steerValue.current * sensitivity)),
        throttle: hasThrottle ? 1 : 0,
        brake: hasBrake ? 1 : 0,
      });
    }

    function onTouchStart(e: TouchEvent) {
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
      applyTouch();
    }

    // Find the game container for touch events
    const container = document.getElementById('game-touch-area');
    if (container) {
      container.addEventListener('touchstart', onTouchStart, { passive: false });
      container.addEventListener('touchmove', onTouchMove, { passive: false });
      container.addEventListener('touchend', onTouchEnd, { passive: false });
      container.addEventListener('touchcancel', onTouchEnd, { passive: false });
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (container) {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', onTouchEnd);
        container.removeEventListener('touchcancel', onTouchEnd);
      }
    };
  }, []);
}
