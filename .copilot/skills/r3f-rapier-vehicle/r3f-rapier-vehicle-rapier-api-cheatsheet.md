# Rapier `DynamicRayCastVehicleController` API Cheatsheet

Verified against `@dimforge/rapier3d` docs (rapier.rs/javascript3d). These method names are commonly hallucinated — copy from here, do not invent.

The controller is created via `world.createVehicleController(chassis)` (where `world` comes from `useRapier()`). Direct construction is also possible but rarely needed in r3/rapier.

---

## Lifecycle

| Method | Signature | Notes |
| --- | --- | --- |
| `world.createVehicleController(chassis)` | `(RigidBody) => DynamicRayCastVehicleController` | Chassis must be dynamic. |
| `world.removeVehicleController(controller)` | `(controller) => void` | Call in effect cleanup. |
| `controller.updateVehicle(dt, filterFlags?, filterGroups?, filterPredicate?)` | `(number, QueryFilterFlags?, number?, (Collider) => boolean)?) => void` | Call once per physics step. `dt` should match `world.timestep`. |
| `controller.numWheels()` | `() => number` | |
| `controller.currentVehicleSpeed()` | `() => number` | Forward speed in m/s. |
| `controller.chassis()` | `() => RigidBody` | |

---

## Chassis axes

The controller needs to know which local axis is "up" and which is "forward".

| Member | Type | Notes |
| --- | --- | --- |
| `controller.indexUpAxis` | get/set: `number` | `0=X, 1=Y, 2=Z`. Default Y. |
| `controller.indexForwardAxis` | getter: `number` | Default Z. |
| `controller.setIndexForwardAxis` | setter: `number` | Setter accessor; assign with `controller.setIndexForwardAxis = 2`. |

---

## Adding wheels

```ts
controller.addWheel(
  chassisConnectionCs: Vector,   // wheel position in chassis-local space
  directionCs: Vector,           // suspension ray direction (typically {0,-1,0})
  axleCs: Vector,                // wheel axle axis in chassis-local space (typically {-1,0,0})
  suspensionRestLength: number,  // rest length of spring
  radius: number,                // wheel radius
): void
```

Wheels are indexed in the order they were added (0..numWheels-1).

---

## Per-wheel setters (write)

All take `(i: number, value)`. Apply each frame in `useBeforePhysicsStep` for inputs, or once at setup for tuning.

| Method | Value type | Purpose |
| --- | --- | --- |
| `setWheelEngineForce` | `number` | Forward force from this wheel (newtons). Driving wheels only. |
| `setWheelBrake` | `number` | Max brake impulse for this wheel. |
| `setWheelSteering` | `number` | Steering angle in radians. Front wheels typically. |
| `setWheelChassisConnectionPointCs` | `Vector` | Move attachment point in chassis-local space. |
| `setWheelDirectionCs` | `Vector` | Suspension ray direction. |
| `setWheelAxleCs` | `Vector` | Wheel axle axis. |
| `setWheelSuspensionRestLength` | `number` | Spring rest length. |
| `setWheelMaxSuspensionTravel` | `number` | Max distance suspension can travel from rest. |
| `setWheelMaxSuspensionForce` | `number` | Cap on spring force (N). |
| `setWheelSuspensionStiffness` | `number` | Spring k. Higher = stiffer ride. |
| `setWheelSuspensionCompression` | `number` | Damping while compressing. |
| `setWheelSuspensionRelaxation` | `number` | Damping while extending. Raise if suspension overshoots. |
| `setWheelFrictionSlip` | `number` | Forward traction. Too high → flips. |
| `setWheelSideFrictionStiffness` | `number` | Side traction multiplier. Too high → unrealistic grip. |
| `setWheelRadius` | `number` | |

---

## Per-wheel getters (read)

All take `(i: number)`. Useful for visual sync, debug overlays, telemetry.

| Method | Returns | Purpose |
| --- | --- | --- |
| `wheelChassisConnectionPointCs` | `Vector` | Where the wheel attaches to the chassis (local). |
| `wheelDirectionCs` | `Vector` | Suspension direction (local). |
| `wheelAxleCs` | `Vector` | Axle axis (local). |
| `wheelSuspensionLength` | `number` | Current spring length (rest length ± travel). |
| `wheelSuspensionRestLength` | `number` | |
| `wheelSuspensionStiffness` | `number` | |
| `wheelSuspensionCompression` | `number` | |
| `wheelSuspensionRelaxation` | `number` | |
| `wheelMaxSuspensionTravel` | `number` | |
| `wheelMaxSuspensionForce` | `number` | |
| `wheelRadius` | `number` | |
| `wheelRotation` | `number` | Current wheel spin angle (radians). Apply to visual mesh. |
| `wheelSteering` | `number` | Current steering angle. |
| `wheelFrictionSlip` | `number` | |
| `wheelSideFrictionStiffness` | `number` | |
| `wheelEngineForce` | `number` | Last applied engine force. |
| `wheelBrake` | `number` | Last applied brake. |
| `wheelIsInContact` | `boolean` | Is the ray hitting ground? |
| `wheelGroundObject` | `Collider \| null` | Which collider it hit. |
| `wheelContactPoint` | `Vector` | World-space hit point. |
| `wheelContactNormal` | `Vector` | World-space ground normal. |
| `wheelHardPoint` | `Vector` | World-space ray origin. |
| `wheelSuspensionForce` | `number` | Last applied spring force. |
| `wheelForwardImpulse` | `number` | Last forward impulse. |
| `wheelSideImpulse` | `number` | Last side impulse. |

---

## Common name confusions

These are the wrong names that pattern-matching produces. Don't use them.

| Wrong (does not exist) | Correct |
| --- | --- |
| `setEngineForce(force)` | `setWheelEngineForce(i, force)` (per wheel!) |
| `setBrake(force)` | `setWheelBrake(i, force)` |
| `setSteering(angle)` | `setWheelSteering(i, angle)` |
| `vehicle.update(dt)` | `controller.updateVehicle(dt)` |
| `controller.step(dt)` | `controller.updateVehicle(dt)` |
| `addWheel({ position, ... })` (object arg) | `addWheel(connection, direction, axle, restLen, radius)` (positional) |
| `controller.wheels[i]` | Per-wheel getters: `controller.wheelXxx(i)` |

---

## r3/rapier hooks

| Hook | Purpose |
| --- | --- |
| `useRapier()` | Returns `{ world, rapier, ... }`. Get the world to create the controller. |
| `useBeforePhysicsStep(cb)` | Run before each physics step. Apply inputs here. |
| `useAfterPhysicsStep(cb)` | Run after each physics step. Read controller state here. |

`<Physics />` props worth knowing:

| Prop | Default | Notes |
| --- | --- | --- |
| `timeStep` | `1/60` | Number for fixed step, `"vary"` for frame-delta (loses determinism). |
| `interpolation` | `true` | Smooth visuals between fixed steps. Has no effect with `"vary"`. |
| `updateLoop` | `"follow"` | `"follow"` runs in useFrame; `"independent"` runs its own RAF (for on-demand rendering). |
| `gravity` | `[0, -9.81, 0]` | |

---

## QueryFilterFlags (for `updateVehicle` ground filtering)

```ts
import { QueryFilterFlags } from "@dimforge/rapier3d-compat";

QueryFilterFlags.EXCLUDE_FIXED
QueryFilterFlags.EXCLUDE_KINEMATIC
QueryFilterFlags.EXCLUDE_DYNAMIC
QueryFilterFlags.EXCLUDE_SENSORS
QueryFilterFlags.EXCLUDE_SOLIDS
QueryFilterFlags.ONLY_DYNAMIC
QueryFilterFlags.ONLY_KINEMATIC
QueryFilterFlags.ONLY_FIXED
```

Bitwise-OR combine. For vehicles, almost always `EXCLUDE_SENSORS`.
