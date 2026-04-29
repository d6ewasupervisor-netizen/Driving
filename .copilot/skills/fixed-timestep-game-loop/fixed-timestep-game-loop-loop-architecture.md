# Loop Architecture

The complete picture of who runs what, when, in an R3F + Rapier game.

---

## The layered loop

```
                    Browser repaint (display rate, 60–240Hz)
                               │
                               ▼
   ┌───────────────────────────────────────────────────────┐
   │ R3F render frame                                      │
   │                                                       │
   │  1. Variable-rate code (useFrame callbacks)           │
   │     • Camera follow                                   │
   │     • Particle updates                                │
   │     • UI animations                                   │
   │     • Visual interpolation                            │
   │                                                       │
   │  2. Physics accumulator                               │
   │     accumulator += min(frameTime, MAX_FRAME_TIME)     │
   │                                                       │
   │  3. Run physics steps until accumulator < FIXED_DT    │
   │     ┌───────────────────────────────────────────────┐ │
   │     │ for each fixed physics step (60Hz):           │ │
   │     │   useBeforePhysicsStep callbacks              │ │
   │     │     • Apply inputs                            │ │
   │     │     • controller.updateVehicle(dt)            │ │
   │     │     • Custom fixed-tick accumulators          │ │
   │     │   Rapier solver runs                          │ │
   │     │   useAfterPhysicsStep callbacks               │ │
   │     │     • Read physics state                      │ │
   │     │     • Update HUD targets                      │ │
   │     │     • Game state checks (win/lose)            │ │
   │     │ accumulator -= FIXED_DT                       │ │
   │     └───────────────────────────────────────────────┘ │
   │                                                       │
   │  4. Render scene (Three.js draw call)                 │
   │     • Rigid body transforms interpolated              │
   │       between last two physics steps                  │
   └───────────────────────────────────────────────────────┘
                               │
                               ▼
                       Pixels on screen
```

In one render frame, physics steps run 0–N times depending on how long the frame took:

- 144Hz display, 60Hz physics: physics runs **0 or 1 times** per frame, alternating
- 60Hz display, 60Hz physics: physics runs **1 time** per frame
- Slow frame (50ms), 60Hz physics: physics runs **3 times** in one frame

That's why putting input in `useFrame` is wrong: at 144Hz, half your input frames don't run physics, the other half run it once. Inputs get applied at irregular intervals.

---

## What R3F + Rapier handles for you

You don't have to write any of this:

- Render loop (`requestAnimationFrame` driving `useFrame`)
- Frame time measurement
- Accumulator
- Spiral-of-death clamp
- Visual interpolation between physics steps for rigid bodies
- Pre/post-step hook scheduling
- Pause when `<Physics paused>` is true

You write:
- The contents of `useFrame` callbacks (visuals)
- The contents of `useBeforePhysicsStep` (inputs)
- The contents of `useAfterPhysicsStep` (state reads)
- Your own custom fixed-tick accumulators **only if** you need a rate different from physics

---

## The decision matrix (full)

| Concern | Hook | Notes |
| --- | --- | --- |
| **Inputs** | | |
| Apply engine force / brake / steer | `useBeforePhysicsStep` | Once per physics step is correct |
| Read keys/gamepad | Outside hooks (event listeners → ref) | Keep state in a ref, read it from the step hook |
| Trigger a one-shot action (jump, fire) | `useBeforePhysicsStep`, with debounce | Once per fixed step |
| **Physics-driven state** | | |
| `controller.updateVehicle(dt)` | `useBeforePhysicsStep` | Apply inputs, then update |
| `body.applyImpulse` | `useBeforePhysicsStep` | Same logic — once per step |
| Read `body.translation()` for game logic | `useAfterPhysicsStep` | Authoritative state |
| Read `controller.currentVehicleSpeed()` | `useAfterPhysicsStep` | |
| Spawn / despawn entities | `useAfterPhysicsStep` | Avoid mid-step mutation |
| **Visual** | | |
| Camera follow target | `useFrame` | Render rate, smooth |
| Smoothed UI numbers | `useFrame` (lerp toward target) | Target set in afterStep |
| Particle motion | `useFrame` | Visual; doesn't affect game |
| Animation mixer | `useFrame(() => mixer.update(dt))` | Mixer is visual blending |
| Post-processing pass updates | `useFrame` | |
| Shader uniforms (time-based) | `useFrame` | |
| Transform a mesh that's NOT a RigidBody | `useFrame` | Visual-only object |
| **Game logic** | | |
| AI step (path planning) | Custom fixed-tick @ 10–20Hz | See `timing-patterns.ts` |
| Cooldowns / weapon timers | `useBeforePhysicsStep` (decrement by 1/60) | |
| Score / health updates triggered by events | `useAfterPhysicsStep` | When event detected |
| Win/lose detection | `useAfterPhysicsStep` | |
| **Side effects** | | |
| Save game (debounced) | `useAfterPhysicsStep` | Triggered after meaningful state change |
| Sound effect trigger | `useAfterPhysicsStep` | After event detection |
| Network sync send | Custom fixed-tick @ 20–30Hz | Bandwidth-aware |
| Analytics event | `useAfterPhysicsStep` | Or in event handlers |

---

## What goes outside hooks entirely

Some things shouldn't be in any per-frame loop:

- **Asset loading**: `useGLTF`, `useTexture` — these run once via Suspense
- **Component setup**: creating Rapier controllers, configuring loaders — `useEffect` with cleanup
- **DOM event handlers**: keyboard, mouse, touch — `addEventListener`, write to a ref that hooks read
- **Network connection setup**: WebSocket establishment, auth — top-level effect or app-init
- **Audio context creation**: Tone.js / Web Audio setup — once, on user interaction

Per-frame code calling into these (creating a new texture inside `useFrame`, opening a WebSocket inside `useBeforePhysicsStep`) is almost always wrong.

---

## Recommended file shape for a player vehicle

```jsx
// PlayerVehicle.tsx
import { useRapier, useBeforePhysicsStep, useAfterPhysicsStep } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import { useKeyState } from './useKeyState';      // event listeners → ref
import { useGameStore } from './gameStore';

export function PlayerVehicle() {
  const { world } = useRapier();
  const chassisRef = useRef(null);
  const controllerRef = useRef(null);
  const wheelRefs = [useRef(), useRef(), useRef(), useRef()];
  const keys = useKeyState();
  const cameraTargetRef = useRef(new Vector3());

  // ---- ONE-TIME SETUP ----
  useEffect(() => {
    if (!chassisRef.current) return;
    const c = world.createVehicleController(chassisRef.current);
    // ... add wheels, set tuning ...
    controllerRef.current = c;
    return () => world.removeVehicleController(c);
  }, [world]);

  // ---- INPUT (fixed-rate) ----
  useBeforePhysicsStep(() => {
    const c = controllerRef.current;
    if (!c) return;
    const accel = keys.current.forward ? 1 : 0;
    c.setWheelEngineForce(2, accel * 1200);
    c.setWheelEngineForce(3, accel * 1200);
    c.setWheelSteering(0, (keys.current.left ? 1 : 0) - (keys.current.right ? 1 : 0));
    c.updateVehicle(world.timestep);
  });

  // ---- STATE READ (fixed-rate) ----
  useAfterPhysicsStep(() => {
    const c = controllerRef.current;
    if (!c) return;
    const speed = c.currentVehicleSpeed();
    // Update HUD target (component will smooth toward it)
    if (Math.abs(speed - useGameStore.getState().speed) > 0.5) {
      useGameStore.setState({ speed });
    }
    // Update wheel visuals at fixed rate (Rapier interpolates the chassis)
    const t = chassisRef.current.translation();
    cameraTargetRef.current.set(t.x, t.y, t.z);
  });

  // ---- VISUALS (variable-rate) ----
  useFrame((state, dt) => {
    // Smooth camera follow toward target updated in after-step
    state.camera.position.lerp(cameraTargetRef.current, Math.min(1, dt * 4));
  });

  return (
    <RigidBody ref={chassisRef} type="dynamic" colliders={false} mass={1200}>
      <CuboidCollider args={[1.0, 0.4, 2.2]} />
      <CarVisualModel wheelRefs={wheelRefs} />
    </RigidBody>
  );
}
```

This is the canonical shape. Each hook has a clear responsibility. Inputs come in via a ref maintained outside hooks. State updates flow: input → physics → game store → UI smoothing.

---

## Anti-patterns to recognize

**Anti-pattern A: All-in-`useFrame`**
```jsx
useFrame((state, dt) => {
  // Reads keys
  // Applies forces      ← wrong
  // Updates physics     ← wrong
  // Reads physics       ← wrong
  // Updates HUD
  // Moves camera
});
```
Everything runs at variable rate. Physics non-deterministic. Inputs irregular. The bug at 144Hz is invisible until someone tests on a different monitor.

**Anti-pattern B: Mutex-style guarding**
```jsx
useFrame((state, dt) => {
  if (frameCount % 4 === 0) {
    // Physics-rate code, hand-throttled to ~15Hz
  }
});
```
Approximates fixed rate but isn't fixed — frame rate determines actual rate. Don't reinvent the accumulator. Use the right hook.

**Anti-pattern C: useEffect dependency on per-frame state**
```jsx
useEffect(() => {
  // recreate controller
}, [keys.forward]); // ← runs every input change
```
Effects aren't for per-frame work. Setup once, mutate inside hooks.
