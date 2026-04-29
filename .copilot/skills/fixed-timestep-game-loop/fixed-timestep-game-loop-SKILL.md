---
name: fixed-timestep-game-loop
description: Build deterministic, frame-rate-independent game loops in React Three Fiber + @react-three/rapier. Covers fixed timestep theory, the right hook for each kind of update (useBeforePhysicsStep / useAfterPhysicsStep / useFrame), visual interpolation, pause and time scaling, the spiral-of-death clamp, and recording/replaying inputs deterministically. Use this skill any time the user mentions game loop, fixed timestep, dt, delta time, useFrame, "physics behaves differently on different machines", high refresh rate issues, replay system, slow motion, pause, time scaling, accumulator pattern, frame-rate independence, or determinism. Trigger even on vague phrasing like "the physics feels weird at 144Hz" or "my game runs faster on my desktop than on my laptop." Strongly prefer this skill over guessing — the most common mistake (input handling in useFrame instead of useBeforePhysicsStep) silently breaks tuning, and the second most common (assuming useFrame's delta is constant) breaks gameplay on any non-60Hz display.
---

# Fixed Timestep Game Loop Skill

This skill is about *when* code runs, not *what* code does. Most R3F games render at the display's refresh rate but want physics and game logic on a fixed cadence. Get the cadence right and `dt` becomes predictable, replays reproduce, and a 144Hz monitor doesn't break the simulation. Get it wrong and "physics feels different on every machine" — the bug everyone has and few diagnose correctly.

**Always do this before writing per-frame code:**
1. Decide whether the code should run **per render** (variable rate, visual only) or **per fixed step** (deterministic, gameplay/physics).
2. Pick the right hook from `references/loop-architecture.md` — there's a decision table.
3. If the code involves time-based motion (camera follow, animations, particles), use the variable `dt` from `useFrame` properly: `position += velocity * dt`, never `position += 0.05`.

---

## 1. The fundamental problem

`useFrame(callback)` runs once per browser repaint. The browser repaints at the display's refresh rate — 60Hz, 90Hz, 120Hz, 144Hz, sometimes 240Hz. The `delta` argument tells you how long the previous frame took.

Two consequences:

**Consequence A: variable `dt`.**
- 60Hz: `dt ≈ 0.0167s`
- 144Hz: `dt ≈ 0.0069s`
- Janky frame: `dt ≈ 0.05s` or worse

If your code is `position.x += 0.1` (no `dt`), the player moves twice as fast on a 144Hz monitor. Always multiply by `dt`: `position.x += velocity * dt`.

**Consequence B: physics non-determinism.**
Even with `dt` multiplication, calling a physics step with variable `dt` makes the simulation non-deterministic. Same inputs from the same starting state produce different outputs depending on frame timing. Replays don't reproduce. Networked game state diverges. A fast machine and a slow machine running the same level land in different places.

The solution is **fixed timestep**: the simulation always advances by the same `dt` (e.g., 1/60s), regardless of how often render frames happen. The render loop runs at the display rate; the simulation runs at a fixed rate; the two are decoupled.

---

## 2. The classic accumulator pattern

The reference is Glenn Fiedler's "[Fix Your Timestep!](https://gafferongames.com/post/fix_your_timestep/)" — required reading if you're implementing this from scratch. The shape:

```
each rendered frame:
  frameTime = how long since last frame
  accumulator += min(frameTime, MAX_FRAME_TIME)  // clamp to prevent spiral of death
  while accumulator >= FIXED_DT:
    simulate(FIXED_DT)
    accumulator -= FIXED_DT
  alpha = accumulator / FIXED_DT  // residual fraction, 0..1
  render(interpolate(prevState, currentState, alpha))
```

Two state copies (`prevState`, `currentState`) let you interpolate the rendered position between simulation steps. Without interpolation, on a 144Hz display showing 60Hz physics, the camera sees the same simulation state for ~2.4 frames in a row and you get visual stutter even though the sim is correct.

**You don't need to implement this manually for physics — `@react-three/rapier` does it for you.** But you do need to understand it because:
- Game logic outside physics still needs the same treatment if you want determinism
- The hooks you call have specific timing relationships to the inner loop
- The "spiral of death" clamp is real and you need to be aware of it

---

## 3. What `@react-three/rapier` already does

`<Physics timeStep={1/60} />` runs the accumulator internally. By default:
- Physics steps at exactly 60Hz, regardless of render rate
- Rigid body visual transforms are interpolated between steps (`interpolation={true}` is the default)
- The render loop runs at display rate via R3F's `useFrame`

```jsx
<Canvas>
  <Physics timeStep={1/60} interpolation={true}>
    {/* world */}
  </Physics>
</Canvas>
```

Three callback hooks, three meanings:

| Hook | Runs | Purpose |
| --- | --- | --- |
| `useBeforePhysicsStep` | Once per **physics step** (fixed rate) | Apply inputs: forces, impulses, vehicle controller commands |
| `useAfterPhysicsStep` | Once per **physics step** (fixed rate) | Read physics state: positions, velocities, contact info |
| `useFrame` | Once per **render frame** (variable rate) | Visuals only: camera follow, particles, post-processing |

**The single most common bug** in R3F + Rapier games: applying input forces inside `useFrame`. At 144Hz, `useFrame` runs ~2.4× per physics step, so engine force is applied 2–3× per step. The car is mysteriously faster on better monitors. The fix is moving input application to `useBeforePhysicsStep` — covered in the `r3f-rapier-vehicle` skill.

### `timeStep="vary"` — when (if ever) to use it

```jsx
<Physics timeStep="vary" />
```

With `"vary"`, physics steps with the actual frame delta. Determinism is gone. Interpolation has no effect (no separation between steps and frames). Don't use this for gameplay — only for pure physics demos where determinism doesn't matter and you want the simulation to "feel" tied to whatever frame rate the user has.

For everything else, leave `timeStep={1/60}`.

---

## 4. The decision: where does this code go?

| If the code… | Goes in | Reason |
| --- | --- | --- |
| Reads keyboard/gamepad and applies forces | `useBeforePhysicsStep` | Inputs must be applied once per physics step, deterministically |
| Calls `controller.updateVehicle(dt)` | `useBeforePhysicsStep` | After inputs, before step |
| Reads physics state for HUD/AI | `useAfterPhysicsStep` | After step completes, before next render |
| Updates HUD numbers (speed, score) | `useAfterPhysicsStep` (throttled) | Source: physics state. Don't update HUD per frame if physics ran 0 times this frame |
| Camera follow | `useFrame` | Visual; should run smoothly at render rate |
| Particle system updates | `useFrame` | Visual; render-rate is fine |
| Post-processing | `useFrame` | Visual |
| Animation mixer (`mixer.update(dt)`) | `useFrame` | Visual blending; doesn't affect game state |
| Time-of-day / lighting changes | `useFrame` | Visual |
| AI decision-making (path planning, target selection) | Custom fixed-tick hook (see refs) | Want it deterministic, but rate independent of physics |
| Cooldown timers (weapon fire interval) | `useBeforePhysicsStep` or fixed tick | Want consistent across machines |
| Game-over check / win condition | `useAfterPhysicsStep` | Reads physics state |
| Network message dispatch | Custom fixed tick or `useAfterPhysicsStep` | Want consistent rate |

Rule of thumb: **if it affects the simulation state, it's fixed-rate. If it's purely how things look, it's variable-rate.**

---

## 5. Visual interpolation

Rapier-managed rigid bodies interpolate automatically. For non-physics game state — a HUD counter ticking up smoothly, a non-physics object that moves on a custom schedule — you may need to interpolate manually.

The pattern: store `prev` and `current`, interpolate by `alpha`.

```jsx
const prevScoreRef = useRef(0);
const currentScoreRef = useRef(0);
const accumRef = useRef(0);

useBeforePhysicsStep(() => {
  prevScoreRef.current = currentScoreRef.current;
  currentScoreRef.current += 10; // grew by 10 per fixed step
});

useFrame((state, dt) => {
  // alpha is hard to get precisely from r3/rapier today (no public API).
  // Pragmatic substitute: smoothing toward the current value at render rate.
  // For visible UI, this looks identical to true interpolation.
  const target = currentScoreRef.current;
  const visible = scoreVisibleRef.current ?? target;
  scoreVisibleRef.current = visible + (target - visible) * Math.min(1, dt * 12);
  hudRef.current.textContent = Math.round(scoreVisibleRef.current);
});
```

For HUD smoothing, lerp-to-target at render rate is good enough. True alpha-based interpolation matters for predictive game state and replay/rollback systems — premature for most projects.

---

## 6. Game tick vs physics tick

Sometimes game logic should run at a different cadence than physics. Common case: **AI decisions every 100ms, physics every 16.67ms.** Running AI per physics step works but wastes CPU on cheap logic; running AI in `useFrame` makes it variable-rate.

Pattern: a separate fixed-tick accumulator.

```jsx
const aiAccumRef = useRef(0);
const AI_TICK = 1 / 10; // 10Hz

useBeforePhysicsStep(() => {
  aiAccumRef.current += 1 / 60; // physics rate
  while (aiAccumRef.current >= AI_TICK) {
    aiAccumRef.current -= AI_TICK;
    runAIStep(AI_TICK);
  }
});
```

`references/timing-patterns.ts` has a reusable `useFixedTick(rate, callback)` hook.

For T's K-Pop Zombie project: zombies don't need physics-rate AI. A 10–20Hz AI tick reduces CPU on swarm scenes dramatically, with no visible difference.

---

## 7. Pause and time scaling

### Pause

The clean way: stop physics. R3F + Rapier supports `paused`:

```jsx
const [paused, setPaused] = useState(false);
<Physics paused={paused} timeStep={1/60}>
```

When paused:
- `useBeforePhysicsStep` and `useAfterPhysicsStep` don't fire
- `useFrame` still fires (so the menu can animate)
- Rigid body positions don't change

If you have custom fixed-tick accumulators outside Rapier, they need their own pause check. Don't accumulate frame time while paused or the game runs many steps in a single frame when unpaused (close cousin of the spiral of death).

### Slow motion / fast forward

Multiply the physics timestep by a scale factor:

```jsx
const [timeScale, setTimeScale] = useState(1.0); // 0.25 = quarter speed; 2 = double speed
<Physics timeStep={(1/60) / timeScale}>
```

Counterintuitive: slow motion = *smaller* `timeStep` (each step covers less wall time), so for the same wall-clock second, more steps run. Fast forward = *larger* `timeStep`, fewer steps per wall second.

⚠️ Large `timeStep` values (>1/30s) make Rapier's solver less stable. Rapidly increasing fast-forward can cause tunneling, joint stretching, and other artifacts. Cap fast-forward at ~2× for arcade-feel games.

### Slow-mo for VFX, not UI

Time scale should affect physics and game logic. It should usually **not** affect UI animations or post-processing — the menu shouldn't crawl when the world is in bullet time. Keep UI animations on `useFrame` with real `dt`, not scaled.

```jsx
// Physics-affecting time
useBeforePhysicsStep(() => {
  // applies the scaled timeStep automatically via Rapier's setting
});

// UI animation — real time, ignores game time scale
useFrame((state, realDt) => {
  hudFadeRef.current.opacity += realDt * fadeRate;
});
```

---

## 8. The spiral of death

When a single render frame takes longer than `MAX_FRAME_TIME`, the accumulator builds up. The next frame must run multiple physics steps to catch up. Running multiple steps takes longer. Accumulator builds more. Worse next frame. Game freezes.

The fix is **clamping frame time** before adding to the accumulator:

```
accumulator += min(frameTime, MAX_FRAME_TIME)
```

Typical `MAX_FRAME_TIME = 0.25s`. Translation: "if a frame takes longer than 250ms, drop the excess time on the floor — better to run in slow motion than freeze."

R3F + Rapier handles this internally. But your custom fixed-tick accumulators don't. **If you implement `useFixedTick` (see refs), include the clamp.**

Causes of long frames worth knowing:
- Tab backgrounded then refocused (browsers throttle background tabs; coming back can produce huge `dt`)
- Garbage collection pause
- A heavy synchronous operation in `useFrame` (loading a model, large sort)
- DevTools profiling pause
- Mobile thermal throttling

---

## 9. Determinism for replays

If you want a replay system or networked rollback, the simulation must be **deterministic** — same inputs from the same starting state always produce the same outputs.

Requirements for determinism in JS:
- ✅ Fixed timestep (this skill)
- ✅ Inputs recorded per fixed step, not per frame
- ✅ No `Math.random()` without a seeded RNG (use mulberry32 or similar)
- ✅ No `Date.now()` or `performance.now()` in simulation code
- ✅ Stable iteration order (don't iterate `Set` or `Map` and hope order matters; sort first)
- ⚠️ Floating-point determinism across machines is JS-engine dependent — same V8 version is fine, cross-browser is iffy, cross-platform is unreliable

**Recording inputs per fixed step:**

```jsx
const inputLog = useRef([]);
const stepCount = useRef(0);

useBeforePhysicsStep(() => {
  const input = {
    step: stepCount.current,
    forward: keys.forward,
    left: keys.left,
    right: keys.right,
    brake: keys.brake,
  };
  inputLog.current.push(input);
  applyInput(input);
  stepCount.current++;
});
```

To replay: iterate the log and feed each input back at its step. Don't replay by recording positions — that defeats determinism and bloats files.

`references/determinism-checklist.md` has the full list of things that break determinism and how to avoid them.

---

## 10. Footgun table

| Symptom | Cause | Fix |
| --- | --- | --- |
| Game runs faster on 144Hz display | Code uses `+= 0.1` without `dt` multiply | Multiply by `dt`: `+= speed * dt` |
| Engine force feels stronger on better hardware | Force applied in `useFrame`, not `useBeforePhysicsStep` | Move to `useBeforePhysicsStep` |
| HUD counter stutters | Update happens in `useAfterPhysicsStep` (60Hz) but display is 144Hz | Update in `useFrame` with smoothing toward target |
| Replay diverges from original | Variable `dt`, or non-deterministic randomness, or input recorded per frame | Fix timestep, seed RNG, record per fixed step |
| Game freezes after tab refocus | Spiral of death from accumulated background time | Clamp `dt` to 0.25s before accumulating |
| Pause doesn't pause physics | Custom timer not respecting pause flag | Check `paused` in custom accumulators |
| Slow motion makes UI crawl too | Used scaled time everywhere | Use real `dt` for UI, scaled for physics |
| Fast forward breaks physics | `timeStep > 1/30` makes solver unstable | Cap fast-forward; for true >2× use multiple sub-steps at normal rate |
| Animations stutter on 60Hz monitor but smooth on 144Hz | Probably interpolation off | Set `interpolation={true}` on `<Physics>` (default) |
| AI is expensive at 60Hz, smooth at 30Hz | AI running per physics step | Use a separate fixed-tick at lower rate (10–20Hz) |
| `useFrame` callback fires twice in dev | React StrictMode double-invocation | Tolerate it (it goes away in production) or guard with a ref |
| Two computers run the same level differently | No fixed timestep, or floating-point drift | Switch to fixed timestep; for true cross-platform use deterministic floats or a fixed-point lib |
| Physics drift while user holds two keys at once | Inputs read in `useFrame` and accumulated, applied in step | Read inputs in `useBeforePhysicsStep` from a key-state ref maintained outside |
| Pause unpause causes huge jump | Frame time accumulated while paused | Reset accumulators on unpause, or skip accumulation while paused |
| `useFrame` doesn't run | Component not inside `<Canvas>` | All R3F hooks need Canvas context |
| Score updates feel laggy | Throttled to physics rate via `useAfterPhysicsStep` | Update target in `useAfterPhysicsStep`, smooth toward it in `useFrame` |

---

## 11. References

- `references/loop-architecture.md` — the full layered loop diagram, what R3F + Rapier does for you, what you build yourself, and where every kind of update belongs.
- `references/timing-patterns.ts` — reusable hooks: `useFixedTick(rate, callback)` for game-tick separate from physics, `useTimeScale()` for slow motion, `useFrameSmoothed(target, factor)` for HUD smoothing toward a fixed-rate target.
- `references/determinism-checklist.md` — the complete list of things that break determinism (RNG, time, iteration order, floats), with fixes and a small seeded RNG.
