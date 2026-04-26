---
description: "Use when modifying vehicle physics, suspension, engine, braking, tire grip, steering, Rapier rigid body forces, or debugging vehicle behavior like falling through ground, slingshot effect, or unrealistic speed."
applyTo: "client/src/systems/**"
---

# Vehicle Physics — Hard-Won Rules

## Architecture
`VehicleController.ts` is pure logic called from `useFrame()` in `Vehicle.tsx`. No JSX. Access store via `useGameStore.getState()`.

### Tick flow
1. Read body state (linvel, rotation, quaternion)
2. Compute forward/right/up vectors from quaternion
3. Update engine RPM from wheel contact velocity + gear ratio
4. Auto-shift gears (upshift >6500rpm, downshift <1800rpm)
5. Per-wheel loop: ground check → drive force → brake + ABS
6. Lateral grip correction (90% sideways velocity cancellation via `setLinvel`)
7. Steering via bicycle model (`setAngvel` yaw)
8. Safety clamp (Y > 0.3)
9. Sync to store (position, heading, MPH, RPM, gear)
10. Accumulate mileage + consume fuel

## Critical Rules — DO NOT VIOLATE

### Rapier owns vertical physics
- Rapier handles ALL gravity and ground collision. Never apply custom suspension spring forces in the vertical axis.
- Custom code handles ONLY horizontal: drive, brake, steering, lateral grip.
- **Why**: Custom vertical forces fight Rapier's collision resolver → vehicle oscillates, tunnels through ground, or launches into the sky.

### Force accumulation (slingshot fix)
- `body.resetForces(true)` must be called at the start of `tickVehicle()` if using `addForce`.
- When render FPS > physics step rate, `addForce` stacks until the next physics step. This causes force spikes.
- Currently using `applyImpulseAtPoint` per-wheel which doesn't accumulate, but be aware if switching to `addForce`.

### Ground detection
- Simple height check: `wheelMount.y < (wheel.radius + 0.5)` — no raycasts.
- Road surface is at Y=0. Collider top is at Y=0 with 1m thickness below.

### CCD (Continuous Collision Detection)
- Vehicle RigidBody has `ccd` prop enabled. This prevents tunneling at high speeds.
- Road collider is 1m thick (half-height 0.5, positioned at Y=-0.5). Thin road = tunneling.

### Lateral grip
- Uses direct velocity correction: cancel 90% of sideways velocity via `setLinvel`.
- Do NOT use force-based lateral grip (too weak, causes drifting).

### Steering
- Bicycle model: `targetYaw = -(forwardSpeed * tan(steerAngle)) / WHEELBASE`
- Max steer angle lerps from 0.52rad (low speed) to 0.14rad (high speed).
- Applied via `setAngvel` on Y axis, with 0.8 damping on X/Z.

## Key Constants (don't change without understanding impact)
```
WHEELBASE = 2.4m
PEAK_TORQUE_NM = 350 @ 3500rpm
GEAR_RATIOS = [0, 3.5, 2.1, 1.4, 1.0, 0.8, 0.65]
FINAL_DRIVE = 3.9
MAX_BRAKE_TORQUE = 2500 N·m/wheel
ABS_THRESHOLD = 0.15 (slip ratio)
ABS_PULSE_HZ = 15
METERS_PER_MILE = 400 (game scale)
```

## Common Failure Modes
| Symptom | Likely cause |
|---------|-------------|
| Vehicle falls through road | Road collider too thin, or CCD disabled |
| Vehicle launches upward | Custom vertical forces fighting Rapier |
| Slingshot on resume | Force accumulation (resetForces missing) |
| Vehicle slides sideways | Lateral grip factor too low (needs 0.9) |
| Unrealistic top speed | Gear ratios or torque curve wrong |
| Jittery at rest | linearDamping too low (should be ~0.5) |
| Steering unresponsive | maxSteerAngle too small at current speed |
