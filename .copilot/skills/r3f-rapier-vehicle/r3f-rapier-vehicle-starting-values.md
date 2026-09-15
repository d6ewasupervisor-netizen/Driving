# Vehicle Tuning Starting Values

Three presets. Pick one as a starting point, then tweak. All values assume a roughly car-sized vehicle (chassis ~2m × 0.8m × 4.4m, mass ~1200 kg, wheel radius ~0.35m, gravity -9.81).

If your vehicle is significantly larger or smaller, scale `engineForce`, `brakeForce`, and `maxSuspensionForce` roughly with mass.

---

## Preset 1: Arcade (Mario Kart / Twisted Metal feel)

Forgiving, hard to flip, instant grip, snappy steering. Best for casual games and the K-Pop Zombie Road Warrior brief.

```ts
// Per-wheel suspension (apply to all 4)
suspensionStiffness:        25
maxSuspensionTravel:        0.5
maxSuspensionForce:         100000
suspensionCompression:       4.4
suspensionRelaxation:        2.3
suspensionRestLength:        0.3

// Per-wheel friction (apply to all 4)
frictionSlip:                2.0   // generous traction
sideFrictionStiffness:       1.0

// Per-frame inputs (driving wheels only — typically rear)
engineForce (max):           1200  // strong acceleration
brakeForce (max):            300

// Steering (front wheels)
maxSteerAngle:               0.55  // ~31°
steerLerpFactor:             0.20  // snappy

// Chassis
chassisHalfExtents:          [1.0, 0.4, 2.2]  // wide, low
mass:                        1200
linearDamping:               0.15  // slows down naturally
angularDamping:              0.5   // resists spinout
```

Notes:
- Wide chassis + low CoM = no flipping.
- High `frictionSlip` makes the car feel grippy and responsive.
- `linearDamping` 0.15 gives natural deceleration without needing to brake.

---

## Preset 2: Balanced (GTA / Burnout feel)

Some weight transfer, occasional drift, recoverable but punishes mistakes.

```ts
suspensionStiffness:         30
maxSuspensionTravel:         0.4
maxSuspensionForce:          80000
suspensionCompression:        2.5
suspensionRelaxation:         1.5
suspensionRestLength:         0.25

frictionSlip:                 1.5
sideFrictionStiffness:        0.8

engineForce (max):            900
brakeForce (max):             250

maxSteerAngle:                0.45  // ~26°
steerLerpFactor:              0.12

chassisHalfExtents:           [0.95, 0.45, 2.2]
mass:                         1300
linearDamping:                0.05
angularDamping:               0.3
```

---

## Preset 3: Sim-leaning

Realistic-ish weight transfer, requires throttle control, can spin out. Don't pick this for a game aimed at a teenager learning to drive.

```ts
suspensionStiffness:          40
maxSuspensionTravel:          0.3
maxSuspensionForce:           60000
suspensionCompression:         1.8
suspensionRelaxation:          1.0
suspensionRestLength:          0.2

frictionSlip:                  1.0   // realistic-ish
sideFrictionStiffness:         0.5   // can drift

engineForce (max):             700
brakeForce (max):              200

maxSteerAngle:                 0.35  // ~20°
steerLerpFactor:               0.08

chassisHalfExtents:            [0.9, 0.5, 2.2]
mass:                          1500
linearDamping:                 0.0
angularDamping:                0.1
```

---

## Tuning recipe

If you don't like the feel:

1. **Car flips** → lower `frictionSlip`, lower chassis collider height, widen wheel base.
2. **Car feels floaty / bouncy** → raise `suspensionStiffness`, raise `suspensionCompression` and `suspensionRelaxation`.
3. **Car feels glued / rigid** → lower `suspensionStiffness`, raise `maxSuspensionTravel`.
4. **Steering feels delayed** → raise `steerLerpFactor` (more snappy) or remove smoothing entirely.
5. **Steering feels twitchy** → lower `steerLerpFactor`, lower `maxSteerAngle`.
6. **Won't accelerate fast enough** → raise `engineForce`. If wheels spin without traction, also raise `frictionSlip`.
7. **Top speed too low** → lower `linearDamping`. Engine force fights damping at speed.
8. **Won't stop fast enough** → raise `brakeForce`. Apply to all 4 wheels.
9. **Spins out on turns** → raise `sideFrictionStiffness`, raise `angularDamping`.
10. **Feels weightless** → raise `mass`, or lower `engineForce` proportionally.

---

## Driving-wheel layout

Pick one. Most arcade games use RWD. The K-Pop Zombie Road Warrior brief should use AWD for forgiveness.

```ts
// RWD (rear-wheel drive)
const drivingWheels = [2, 3];     // rear
const steeringWheels = [0, 1];    // front

// AWD (all-wheel drive) — more forgiving
const drivingWheels = [0, 1, 2, 3];
const steeringWheels = [0, 1];

// FWD (front-wheel drive) — understeer-prone
const drivingWheels = [0, 1];
const steeringWheels = [0, 1];
```

When applying engine force, divide by the number of driving wheels so total force matches the preset:

```ts
const perWheelEngine = engineForce / drivingWheels.length;
drivingWheels.forEach(i => controller.setWheelEngineForce(i, perWheelEngine));
```

---

## Why these numbers

- **Stiffness 25–40**: Below 20 the car bottoms out on small bumps; above 50 the suspension barely moves and the car skips on terrain.
- **frictionSlip 1.0–2.5**: Below 1.0 you slide everywhere; above 3.0 the car flips when turning sharply because grip exceeds what the chassis weight can resist.
- **maxSuspensionTravel 0.3–0.5**: This is meters. At 0.5m + 0.3m rest length, total wheel travel is ~0.8m which is generous but stable.
- **engineForce ~1000N for 1200kg**: Gives ~0.8 m/s² baseline accel before friction/damping; feels punchy without overwhelming the tire model.
