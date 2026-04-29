/**
 * VehicleController — Simple arcade vehicle physics
 *
 * Design goals (after the "300mph surge" overhaul):
 *   • Predictable, hard-capped top speed (no aero-drag terminal velocity).
 *   • Smooth, monotonic acceleration — no gear-shift pulsing.
 *   • Driveable feel: ~0→top in ~5s, easy braking, gentle reverse.
 *
 * Forward speed is tracked as a module-level scalar `currentSpeed` (m/s).
 * Each frame we set the rigid-body's linear velocity directly so Rapier's
 * collision solver still handles contacts with world geometry.
 *
 * Engine "RPM" and "gear" are *purely cosmetic* — derived from speed for
 * the HUD only. They no longer feed back into the torque/accel curve, which
 * was the cause of the oscillating surge.
 */
import { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';

// ─── Tunables ────────────────────────────────────────────────────────────────
const MPH_TO_MS = 0.44704;

// Speed envelope
const MAX_FORWARD_MPH = 75;                    // hard cap
const MAX_REVERSE_MPH = 15;
const MAX_FORWARD_MS = MAX_FORWARD_MPH * MPH_TO_MS;
const MAX_REVERSE_MS = MAX_REVERSE_MPH * MPH_TO_MS;

// Acceleration / deceleration (m/s²)
const FORWARD_ACCEL = 7.0;     // ~0→75mph in ~4.8s
const BRAKE_DECEL   = 12.0;    // strong, predictable
const REVERSE_ACCEL = 4.0;
const COAST_DECEL   = 1.5;     // engine + rolling friction when off throttle

// Steering — semi-sim model (Forza Horizon / Rocket League feel)
//
// Architecture (no double-filtering — that was the source of the lag):
//   1. Raw input → deadzone + learned center-bias → "steerRaw" (-1..1)
//   2. Rate limiter (NOT exponential smoothing) → "smoothedSteering"
//      Reaches full lock in ~1/STEER_INPUT_RATE seconds, no perceptible lag.
//   3. Speed-scaled max steer angle → bicycle-model target yaw rate
//   4. Grip-limited cap on yaw rate (LAT_GRIP_MS2) — prevents impossible
//      cornering at speed and produces understeer-on-the-edge feel.
//   5. Yaw rate blended toward target at YAW_GAIN (single filter only).
const WHEELBASE         = 2.4;

// Reduced maximum steering angles for more realistic response
const STEER_MAX_LOW     = 0.42;   // ~24° at low speed (a bit tighter for parking)
const STEER_MAX_HIGH    = 0.09;   // ~5°  at top speed
const STEER_FULL_SPEED  = MAX_FORWARD_MS;

// Rate limiter on input (1/s) — full lock travel takes ~1/8 s. High enough
// that the player perceives "instant", low enough to filter pad jitter.
const STEER_INPUT_RATE  = 8.0;

// Yaw-rate controller (single-stage)
const YAW_GAIN          = 18.0;   // turn-in responsiveness (1/s)
const YAW_GAIN_RECENTER = 26.0;   // stronger self-centering when input released

// Grip cap — peak lateral acceleration the tires can sustain (m/s²).
// At 75 mph (≈33.5 m/s) this caps yaw rate at ~14/33.5 ≈ 0.42 rad/s,
// matching a Forza-style "front tires saturate, car pushes wide" feel.
const LAT_GRIP_MS2      = 14.0;

// Deadzone + center bias (gamepad drift compensation — keep)
// Bias-learning window must be WIDER than realistic worn-stick rest (~0.20)
// or the bias never trains and the car pulls toward the resting direction.
const STEER_DEADZONE    = 0.10;
const STEER_BIAS_WINDOW = 0.50;   // train bias whenever |raw input| stays in this band
const STEER_CENTER_TRACK = 4.0;   // slow learn so brief pad sweeps through 0 don't pollute

// Lateral grip (cancel sideways velocity)
const LATERAL_GRIP_RATE = 8.0;   // hug the lane harder – faster sideways decay

// Smoothing
const THROTTLE_SMOOTH_UP   = 6.0;
const THROTTLE_SMOOTH_DOWN = 5.0;

// Mileage / fuel
const MILEAGE_BATCH    = 0.1;
const METERS_PER_MILE  = 400;
const FUEL_PER_BATCH   = 0.08;

// HUD-only engine display
const IDLE_RPM     = 800;
const REDLINE_RPM  = 7000;
const HUD_GEAR_TOP_MPH = [0, 12, 25, 40, 55, 65, 80]; // gear i ends at this mph

// ─── Module-level state ──────────────────────────────────────────────────────
let mileageAccumulator = 0;
let currentSpeed = 0;          // m/s, signed (positive = forward)
let smoothedThrottle = 0;
let smoothedBrake = 0;
let smoothedSteering = 0;      // smoothed -1..1 input
let steerCenterBias = 0;       // learned neutral offset

let _lateralSlip = 0;
let _brakeSlip = 0;
let _isAnyWheelSlipping = false;

export function getSlipState() {
  return {
    lateralSlip: _lateralSlip,
    brakeSlip: _brakeSlip,
    isSlipping: _isAnyWheelSlipping,
    slipAmount: Math.min(1, Math.max(_lateralSlip, _brakeSlip) * 3),
  };
}

/** Called by CollisionSystem to simulate impact with an NPC. */
export function applyCollisionImpact(factor: number): void {
  currentSpeed *= 1 - factor;
}

// ─── Legacy exports (kept for API compatibility) ─────────────────────────────
export function getSlipRatio(wheelAngularVel: number, contactVel: number, radius: number): number {
  const ws = wheelAngularVel * radius;
  return (ws - contactVel) / Math.max(Math.abs(contactVel), 0.1);
}
export function getPacejkaForce(slip: number, normal: number, mu: number): number {
  const D = mu * normal;
  return D * Math.sin(1.9 * Math.atan(10 * slip - 0.97 * (10 * slip - Math.atan(10 * slip))));
}

// ─── HUD-only engine derivation ──────────────────────────────────────────────
function deriveHudGear(speedMph: number): number {
  for (let i = 1; i < HUD_GEAR_TOP_MPH.length; i++) {
    if (speedMph < HUD_GEAR_TOP_MPH[i]) return i;
  }
  return HUD_GEAR_TOP_MPH.length - 1;
}

function deriveHudRpm(speedMph: number, gear: number): number {
  const lo = HUD_GEAR_TOP_MPH[gear - 1];
  const hi = HUD_GEAR_TOP_MPH[gear] || MAX_FORWARD_MPH;
  const t = THREE.MathUtils.clamp((speedMph - lo) / Math.max(1, hi - lo), 0, 1);
  return THREE.MathUtils.lerp(IDLE_RPM + 600, REDLINE_RPM - 800, t);
}

// ─── Main tick ───────────────────────────────────────────────────────────────
export function tickVehicle(
  body: RapierRigidBody,
  delta: number,
  _world?: any,
  _rapier?: any,
): void {
  const store = useGameStore.getState();
  const { steering, throttle: throttleInput, brake: brakeInput, phase } = store;

  if (phase !== 'driving') return;

  const dt = Math.min(delta, 0.05);

  // ── Orientation ────────────────────────────────────────────────────────
  const rot = body.rotation();
  const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  if (quat.lengthSq() < 1e-6) quat.set(0, 0, 0, 1);
  else quat.normalize();

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat).normalize();
  const right   = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).normalize();

  // ── Sample real velocity ───────────────────────────────────────────────
  // We only read the lateral component (for grip decay & slip metrics) and
  // the vertical (to preserve gravity). The forward component is *intentionally
  // not* echoed back into `currentSpeed`: solver-side micro-collisions with
  // chunk seams, curbs, or scenery would otherwise show up as sudden speed
  // drops ("invisible wall" / stutter). NPC impacts route through
  // applyCollisionImpact() explicitly, which is the only sanctioned external
  // speed change.
  const linvel = body.linvel();
  const lateralSpeed = right.x * linvel.x + right.z * linvel.z;

  // ── Smooth pedal inputs (kills throttle-induced surging) ──────────────
  if (throttleInput > smoothedThrottle) {
    smoothedThrottle = Math.min(throttleInput, smoothedThrottle + THROTTLE_SMOOTH_UP * dt);
  } else {
    smoothedThrottle = Math.max(throttleInput, smoothedThrottle - THROTTLE_SMOOTH_DOWN * dt);
  }
  if (brakeInput > smoothedBrake) {
    smoothedBrake = Math.min(brakeInput, smoothedBrake + THROTTLE_SMOOTH_UP * dt);
  } else {
    smoothedBrake = Math.max(brakeInput, smoothedBrake - THROTTLE_SMOOTH_DOWN * dt);
  }
  // Steering input: deadzone + bias calibration, then RATE-LIMITED slew.
  // Rate limiting (vs. exponential smoothing) gives instant response with
  // a guaranteed max d|steer|/dt — no perceptible lag, but no jitter either.
  //
  // Bias-learning window (STEER_BIAS_WINDOW) must comfortably exceed the
  // resting position of a worn analog stick (typically up to ~0.25). If the
  // window is too narrow the stick's rest value never enters it, the bias
  // never trains, and the car pulls toward the rest direction.
  if (Math.abs(steering) < STEER_BIAS_WINDOW) {
    steerCenterBias += (steering - steerCenterBias) * Math.min(STEER_CENTER_TRACK * dt, 1);
  }
  let steerRaw = steering - steerCenterBias;
  if (Math.abs(steerRaw) < STEER_DEADZONE) {
    steerRaw = 0;
  } else {
    const s = Math.sign(steerRaw);
    steerRaw = s * Math.min(1, (Math.abs(steerRaw) - STEER_DEADZONE) / (1 - STEER_DEADZONE));
  }
  // Rate limiter: linear approach toward target at STEER_INPUT_RATE units/sec.
  // Snap-to-zero on release prevents any "drift back to center" lag.
  const maxStep = STEER_INPUT_RATE * dt;
  const diff = steerRaw - smoothedSteering;
  if (steerRaw === 0 && Math.abs(smoothedSteering) < maxStep) {
    smoothedSteering = 0;
  } else if (Math.abs(diff) <= maxStep) {
    smoothedSteering = steerRaw;
  } else {
    smoothedSteering += Math.sign(diff) * maxStep;
  }

  // ── Pedal logic ────────────────────────────────────────────────────────
  // Forward: throttle accelerates up to MAX_FORWARD_MS, brake decelerates.
  // At rest with brake held (no throttle): enter reverse.
  let accel = 0;
  let isReversing = false;

  if (currentSpeed > 0.2) {
    // Moving forward
    if (smoothedThrottle > 0) accel += FORWARD_ACCEL * smoothedThrottle;
    if (smoothedBrake > 0)    accel -= BRAKE_DECEL    * smoothedBrake;
    if (smoothedThrottle <= 0.01 && smoothedBrake <= 0.01) accel -= COAST_DECEL;
  } else if (currentSpeed < -0.2) {
    // Moving in reverse
    isReversing = true;
    if (smoothedBrake > 0)    accel -= REVERSE_ACCEL * smoothedBrake;
    if (smoothedThrottle > 0) accel += BRAKE_DECEL    * smoothedThrottle; // throttle = brake-out-of-reverse
    if (smoothedThrottle <= 0.01 && smoothedBrake <= 0.01) accel += COAST_DECEL;
  } else {
    // Near stop
    if (smoothedThrottle > 0.05) accel += FORWARD_ACCEL * smoothedThrottle;
    else if (smoothedBrake > 0.05) {
      accel -= REVERSE_ACCEL * smoothedBrake;
      isReversing = true;
    }
  }

  // ── Integrate, then HARD CLAMP to envelope ─────────────────────────────
  currentSpeed += accel * dt;
  if (currentSpeed >  MAX_FORWARD_MS) currentSpeed =  MAX_FORWARD_MS;
  if (currentSpeed < -MAX_REVERSE_MS) currentSpeed = -MAX_REVERSE_MS;

  // Snap to zero in the dead band so coasting actually stops
  if (smoothedThrottle <= 0.01 && smoothedBrake <= 0.01 && Math.abs(currentSpeed) < 0.2) {
    currentSpeed = 0;
  }
  // Brake-to-stop guard (prevent sign flip from over-braking)
  if (!isReversing && smoothedBrake > 0 && smoothedThrottle <= 0.01 &&
      currentSpeed > 0 && currentSpeed - BRAKE_DECEL * smoothedBrake * dt < 0) {
    currentSpeed = 0;
  }
  if (isReversing && smoothedThrottle > 0 && smoothedBrake <= 0.01 &&
      currentSpeed < 0 && currentSpeed + BRAKE_DECEL * smoothedThrottle * dt > 0) {
    currentSpeed = 0;
  }

  // ── Slip-state for audio/particles (kept simple) ──────────────────────
  _lateralSlip = Math.abs(lateralSpeed) / Math.max(1, Math.abs(currentSpeed));
  _brakeSlip   = smoothedBrake > 0.5 && Math.abs(currentSpeed) > 8 ? smoothedBrake * 0.6 : 0;
  _isAnyWheelSlipping = _lateralSlip > 0.15 || _brakeSlip > 0.2;

  // ── Apply velocity ────────────────────────────────────────────────────
  // Lateral velocity decays exponentially → solid grip, no slingshot.
  const lateralDecay = Math.exp(-LATERAL_GRIP_RATE * dt);
  const newLateral = lateralSpeed * lateralDecay;

  body.setLinvel(
    {
      x: forward.x * currentSpeed + right.x * newLateral,
      y: linvel.y, // let Rapier handle vertical (gravity + ground)
      z: forward.z * currentSpeed + right.z * newLateral,
    },
    true,
  );

  // ── Steering: bicycle model + grip-limited yaw rate (single-stage filter) ─
  // Modern semi-sim feel: the bicycle model gives a *desired* yaw rate from
  // steering angle and speed; we then cap it by what the front tires can
  // physically sustain (a = v·ω → ω_max = LAT_GRIP_MS2 / |v|). Beyond the cap
  // the car understeers ("pushes wide"), exactly like a real grippy hatchback.
  const absSpd = Math.abs(currentSpeed);
  if (absSpd > 0.5) {
    const speedT = Math.min(absSpd / STEER_FULL_SPEED, 1);
    const maxSteer = THREE.MathUtils.lerp(STEER_MAX_LOW, STEER_MAX_HIGH, speedT);
    const steerAngle = smoothedSteering * maxSteer;
    const curvature = Math.tan(steerAngle) / WHEELBASE;
    let targetYaw = -(currentSpeed * curvature);

    // Grip cap — peak lateral acceleration the tires can sustain
    const yawCap = LAT_GRIP_MS2 / Math.max(absSpd, 1);
    if (targetYaw >  yawCap) targetYaw =  yawCap;
    if (targetYaw < -yawCap) targetYaw = -yawCap;

    // Single-stage blend. Stronger gain when recentering than when turning in
    // — gives a confident, tight feel without wobble.
    const gain = (smoothedSteering === 0) ? YAW_GAIN_RECENTER : YAW_GAIN;
    const blend = 1 - Math.exp(-gain * dt); // frame-rate independent
    const angvel = body.angvel();
    let newYaw = angvel.y + (targetYaw - angvel.y) * blend;
    if (Math.abs(newYaw) < 1e-3) newYaw = 0;
    body.setAngvel({ x: 0, y: newYaw, z: 0 }, true);
  } else {
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  // ── Safety: keep above ground ─────────────────────────────────────────
  {
    const p = body.translation();
    if (p.y < 0.3) {
      body.setTranslation({ x: p.x, y: 0.3, z: p.z }, true);
      const lv = body.linvel();
      if (lv.y < 0) body.setLinvel({ x: lv.x, y: 0, z: lv.z }, true);
    }
  }

  // ── Sync to store ─────────────────────────────────────────────────────
  const finalPos = body.translation();
  store.setVehiclePosition([finalPos.x, finalPos.y, finalPos.z]);

  const heading = Math.atan2(-forward.x, -forward.z);
  store.setVehicleHeading(heading);

  const displayMph = Math.abs(currentSpeed) / MPH_TO_MS;
  const displayMphRounded = Math.round(displayMph);
  store.setVelocityMph(displayMphRounded);

  // HUD-only engine (cosmetic — does not feed back into physics)
  const hudGear = isReversing ? -1 : deriveHudGear(displayMph);
  const hudRpm  = isReversing
    ? IDLE_RPM + 1500 * Math.min(absSpd / MAX_REVERSE_MS, 1)
    : deriveHudRpm(displayMph, Math.max(1, hudGear));
  store.setEngineRPM(Math.round(hudRpm));
  store.setEngineGear(hudGear);
  store.setEngineSpeed(displayMphRounded);

  store.setABSActive(smoothedBrake > 0.5 && absSpd > 8);

  // ── Mileage ───────────────────────────────────────────────────────────
  if (currentSpeed > 0.5) {
    mileageAccumulator += (currentSpeed * dt) / METERS_PER_MILE;
    if (mileageAccumulator >= MILEAGE_BATCH) {
      store.addMileage(mileageAccumulator);
      store.consumeFuel(FUEL_PER_BATCH);
      mileageAccumulator = 0;
    }
  }
}

export function resetVehicleController(): void {
  mileageAccumulator = 0;
  currentSpeed = 0;
  smoothedThrottle = 0;
  smoothedBrake = 0;
  smoothedSteering = 0;
  steerCenterBias = 0;
  _lateralSlip = 0;
  _brakeSlip = 0;
  _isAnyWheelSlipping = false;
}
