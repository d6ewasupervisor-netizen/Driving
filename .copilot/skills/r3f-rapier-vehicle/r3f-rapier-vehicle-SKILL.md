---
name: r3f-rapier-vehicle
description: Build, tune, and debug raycast vehicles in React Three Fiber + @react-three/rapier. Use this skill any time the user mentions a vehicle, car, truck, driving game, raycast vehicle, suspension, wheels, chassis, vehicle controller, or any vague reference to "the driving game" / "the game for Eliana" / "Eliana's project" / a project involving R3F + Rapier physics with a player-driven vehicle. Trigger even when the user asks generic questions like "why does my car flip" or "how do I make wheels not sink" — the answers live here. Strongly prefer this skill over guessing API method names from memory; Rapier vehicle method names are commonly hallucinated (e.g. `setEngineForce` does not exist — it's `setWheelEngineForce`).
---

# R3F + Rapier Raycast Vehicle Skill

This skill covers building a raycast vehicle in React Three Fiber using `@react-three/rapier`, which wraps the Rapier physics engine. It's opinionated toward the arcade/casual feel (Mario Kart, GTA, Twisted Metal) rather than sim racing.

**Always do this before writing vehicle code:**
1. Read `references/rapier-api-cheatsheet.md` to get exact method signatures. Method names are commonly hallucinated.
2. Read `references/starting-values.md` and pick a feel preset rather than guessing numbers.

---

## 1. Pick the right primitive

Three options exist. Default to **(a)** unless there's a specific reason not to.

**(a) Rapier's `DynamicRayCastVehicleController`** — built-in raycast vehicle. Wheels are not physical bodies; they're rays cast downward from the chassis. Suspension force, friction, and engine force are computed analytically and applied to the chassis rigid body. Cheap, stable, arcade-friendly. **Use this.**

**(b) Hinge joints + cylinder colliders as wheels** — physically simulated wheels via `useRevoluteJoint`. More realistic, but harder to tune, more expensive, and prone to joint stretching at high speeds. Only use if you specifically need wheel-on-wheel collision or visible suspension geometry.

**(c) Custom controller** — manually applying forces and ray-casting. Don't, unless you've already shipped (a) and outgrown it.

The rest of this skill assumes (a).

---

## 2. Chassis setup

The chassis is a `<RigidBody type="dynamic">` with a single cuboid collider. The collider is **not** the visual mesh — the visual mesh sits inside the RigidBody and is unrelated to the physics shape.

Rules:
- Collider must be a **cuboid** (or compound of cuboids). Convex hulls work but are slower; don't use the GLTF mesh as the collider.
- Keep the chassis **wider than it is tall**. A tall chassis with high center of mass tips on every turn.
- Set mass via `colliders="cuboid"` density on the collider, or use `<RigidBody mass={...} />`. Around 1000–1500 kg for a car-sized vehicle is sane.
- Lower the visual model so the wheels stick out below the chassis collider — wheel attachment points sit on the collider, not the model.

```jsx
<RigidBody ref={chassisRef} type="dynamic" colliders={false} mass={1200}>
  <CuboidCollider args={[1.0, 0.4, 2.2]} /> {/* half-extents: width, height, length */}
  <CarVisualModel /> {/* purely visual, no collider */}
</RigidBody>
```

`colliders={false}` on the RigidBody is critical — otherwise r3/rapier auto-generates colliders from the mesh and you'll get duplicate collision shapes.

---

## 3. Wheel config

Wheels are added to the controller, not the React tree. They are pure data.

```jsx
const { world } = useRapier();
const controllerRef = useRef(null);

useEffect(() => {
  if (!chassisRef.current) return;
  const controller = world.createVehicleController(chassisRef.current);
  controller.setIndexUpAxis(1); // Y-up (default)
  // setIndexForwardAxis is a setter accessor in TS — use controller.setIndexForwardAxis = 2 for Z-forward
  controllerRef.current = controller;

  // Add 4 wheels: front-left, front-right, rear-left, rear-right
  const suspensionDirection = { x: 0, y: -1, z: 0 };
  const axle = { x: -1, y: 0, z: 0 };
  const restLength = 0.3;
  const radius = 0.35;

  const positions = [
    { x: -0.9, y: -0.2, z: 1.4 },  // FL
    { x:  0.9, y: -0.2, z: 1.4 },  // FR
    { x: -0.9, y: -0.2, z: -1.4 }, // RL
    { x:  0.9, y: -0.2, z: -1.4 }, // RR
  ];

  positions.forEach((pos) => {
    controller.addWheel(pos, suspensionDirection, axle, restLength, radius);
  });

  // Tune all wheels (see references/starting-values.md for presets)
  for (let i = 0; i < 4; i++) {
    controller.setWheelSuspensionStiffness(i, 30);
    controller.setWheelMaxSuspensionTravel(i, 0.5);
    controller.setWheelFrictionSlip(i, 1.5);
    controller.setWheelSideFrictionStiffness(i, 1.0);
    controller.setWheelSuspensionCompression(i, 4.4);
    controller.setWheelSuspensionRelaxation(i, 2.3);
    controller.setWheelMaxSuspensionForce(i, 100000);
  }

  return () => world.removeVehicleController(controller);
}, [world]);
```

**Key fact:** `chassisConnectionCs`, `directionCs`, `axleCs` are all in **chassis-local space**. If your model is rotated 180° from your axle convention, your wheels will steer backwards.

See `references/starting-values.md` for tuned presets per feel.

---

## 4. Visual ↔ physics sync

The controller knows where each wheel *is* in world space. Read it, apply it to a visual mesh ref. Wheels are **not** RigidBodies — never put them in `<RigidBody>`.

```jsx
const wheelRefs = [useRef(), useRef(), useRef(), useRef()];

useAfterPhysicsStep(() => {
  const c = controllerRef.current;
  if (!c) return;
  for (let i = 0; i < 4; i++) {
    const m = wheelRefs[i].current;
    if (!m) continue;
    const cp = c.wheelChassisConnectionPointCs(i);
    const sl = c.wheelSuspensionLength(i);
    const r = c.wheelRotation(i);
    const s = c.wheelSteering(i);
    // Wheel position is connection point offset by suspension length along suspension direction
    m.position.set(cp.x, cp.y - sl, cp.z);
    m.rotation.set(r, s, 0); // adjust order based on your model orientation
  }
});
```

Then place the wheel meshes as children of the chassis RigidBody so they inherit the chassis transform automatically. The local position/rotation you set above is relative to the chassis.

---

## 5. Driving inputs

Apply inputs in `useBeforePhysicsStep`, **not** `useFrame`. With a fixed timestep (default 1/60), `useFrame` may run 0, 1, or 2+ times per physics step — applying engine force in useFrame triple-applies it on slow frames and silently breaks tuning.

```jsx
useBeforePhysicsStep(() => {
  const c = controllerRef.current;
  if (!c) return;

  const accel = keys.forward ? 1 : keys.backward ? -1 : 0;
  const steer = (keys.left ? 1 : 0) + (keys.right ? -1 : 0);
  const brake = keys.brake ? 1 : 0;

  const engineForce = accel * 800; // newtons, see starting-values.md
  const brakeForce = brake * 200;
  const steerAngle = steer * 0.5; // radians, ~28°

  // Rear-wheel drive: only rear wheels (indices 2, 3) get engine force
  c.setWheelEngineForce(2, engineForce);
  c.setWheelEngineForce(3, engineForce);
  // All wheels brake
  for (let i = 0; i < 4; i++) c.setWheelBrake(i, brakeForce);
  // Front wheels (0, 1) steer
  c.setWheelSteering(0, steerAngle);
  c.setWheelSteering(1, steerAngle);

  c.updateVehicle(world.timestep);
});
```

**Smoothing:** apply a low-pass filter to steering inputs so the wheels don't snap instantly. `currentSteer = lerp(currentSteer, targetSteer, 0.15)`. Same for engine force on gamepad-quality feel.

---

## 6. Collision groups

Use `interactionGroups(memberOf, interactsWith)` from r3/rapier — bitmasks are otherwise unwieldy. Suggested layout for a zombie driving game:

| Group | Number | What lives here |
| --- | --- | --- |
| 0 | 1 | World/ground |
| 1 | 2 | Player chassis |
| 2 | 4 | Zombies |
| 3 | 8 | Pickups (sensors) |
| 4 | 16 | Triggers (sensors) |

Wheel ray-casts only need to hit the ground. Pass a filter to `updateVehicle`:

```js
import { QueryFilterFlags } from "@dimforge/rapier3d-compat";
c.updateVehicle(world.timestep, QueryFilterFlags.EXCLUDE_SENSORS, groundGroupMask);
```

This stops wheels from "catching" on zombie colliders or sensor volumes.

---

## 7. Integration footguns (read this section)

These are the bugs that eat days. If something feels broken, check here first.

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Car flips on every turn | Center of mass too high, or `frictionSlip` too high | Lower chassis collider, drop `frictionSlip` to ~1.5, widen wheel base |
| Wheels sink into ground | Suspension `restLength` too short, or wheel attachment too low | Raise chassis connection point so wheel hangs below chassis collider |
| Wheels float above ground | `restLength` too long, or `maxSuspensionTravel` too high | Shorten `restLength` to ~0.3 |
| No traction (spins out) | `frictionSlip` too low, or `sideFrictionStiffness` too low | Raise `frictionSlip` to 1.5–2.5 |
| Drifts sideways at rest | Side friction too low, or chassis sleeping incorrectly | Raise `sideFrictionStiffness`, ensure chassis isn't disabled |
| Physics differs by FPS | Inputs applied in `useFrame` instead of `useBeforePhysicsStep` | Move input application; or set `<Physics timeStep="vary" />` (NOT recommended) |
| Steering reversed | `axleCs` direction wrong relative to your forward axis | Flip x sign on axle vector |
| Wheels visually lag | Reading from controller in `useFrame` before physics stepped | Read in `useAfterPhysicsStep` instead |
| Wheels rotate but car doesn't move | Forgot `controller.updateVehicle(dt)` | Call it once per pre-step, with `world.timestep` |
| Car slides forever, never stops | No rolling resistance | Apply small reverse engine force when no input, or small brake force |
| Vehicle controller is `undefined` | Created before chassis ref attached | Guard with `if (!chassisRef.current) return;` and recreate in effect |

---

## 8. Hooking into Zustand (R3F + Rapier specific)

**Never** store the vehicle controller in Zustand. Refs only. Reasons:
- The controller is a Rapier WASM object — not serializable, not equality-checkable.
- Zustand subscriptions cause React re-renders; you want the controller mutations to bypass React entirely.

**Do** store in Zustand: HUD-facing state (current speed, gear, lap count) — but write to it from `useAfterPhysicsStep`, throttled if the HUD doesn't need 60Hz updates.

```jsx
useAfterPhysicsStep(() => {
  const speed = controllerRef.current?.currentVehicleSpeed() ?? 0;
  // Throttle: only push to store if changed by > 0.5 km/h
  if (Math.abs(speed - lastSpeedRef.current) > 0.5) {
    useGameStore.setState({ speedKph: speed * 3.6 });
    lastSpeedRef.current = speed;
  }
});
```

---

## 9. When to use what hook

| Hook | When to use it |
| --- | --- |
| `useBeforePhysicsStep` | Apply inputs (engine, brake, steer). Call `updateVehicle(dt)`. |
| `useAfterPhysicsStep` | Read controller state. Sync visual wheels. Push HUD updates. |
| `useFrame` | Pure visual concerns (camera follow, particle effects). Never physics writes. |
| `useEffect` | One-time setup (create controller, add wheels). Cleanup on unmount. |

---

## 10. References

- `references/rapier-api-cheatsheet.md` — exact method signatures for `DynamicRayCastVehicleController`. Read before writing controller code.
- `references/starting-values.md` — tuned presets for arcade vs sim feel. Pick one, then tweak.
