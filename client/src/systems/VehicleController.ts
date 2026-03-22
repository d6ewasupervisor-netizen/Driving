/**
 * VehicleController — Direct velocity-based vehicle physics
 *
 * Instead of applying impulses at wheel contact points (which is unpredictable
 * with variable timesteps and causes oscillation), this controller computes
 * a net forward acceleration from engine/brake/drag forces and directly updates
 * the rigid body's velocity. This guarantees:
 *   - Braking can never overshoot to reverse
 *   - Acceleration is smooth and frame-rate independent
 *   - Reverse engages only after a deliberate pause at standstill
 */
import { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';

// ─── Engine parameters ───────────────────────────────────────────────────────
const IDLE_RPM = 800;
const REDLINE_RPM = 7000;
const PEAK_TORQUE_RPM = 3500;
const PEAK_TORQUE_NM = 350;
const GEAR_RATIOS = [0, 3.5, 2.1, 1.4, 1.0, 0.8, 0.65];
const FINAL_DRIVE = 1.63;
const WHEEL_RADIUS = 0.35;
const WHEELBASE = 2.4;

// Shifting thresholds
const UPSHIFT_RPM = 6500;
const DOWNSHIFT_RPM = 1800;

// Braking
const MAX_BRAKE_DECEL = 8.0;         // m/s² (~0.82g — firm but realistic)

// Drag
const AERO_DRAG_COEFF = 0.5;
const ROLLING_RESISTANCE_N = 200;

// Reverse
const MAX_REVERSE_MPH = 15;
const REVERSE_ACCEL = 1.2;           // m/s² (gentle)

// Traction: rear axle weight fraction × friction coeff
const VEHICLE_MASS = 1400;
const MAX_DRIVE_ACCEL = (9.81 * 0.45 * 0.8);  // ~3.53 m/s² traction ceiling

// Game metrics
const MPH_TO_MS = 0.44704;
const MILEAGE_BATCH = 0.1;
const METERS_PER_MILE = 400;
const FUEL_PER_BATCH = 0.08;

// Wheel mount positions (for ground detection only)
const WHEEL_POSITIONS = [
  new THREE.Vector3(-0.9, -0.3, 1.5),
  new THREE.Vector3(0.9, -0.3, 1.5),
  new THREE.Vector3(-0.9, -0.3, -1.5),
  new THREE.Vector3(0.9, -0.3, -1.5),
];

// ─── Module-level state ──────────────────────────────────────────────────────
let mileageAccumulator = 0;

let _lateralSlip = 0;
let _brakeSlip = 0;
let _isAnyWheelSlipping = false;

/** Slip state for audio / particle systems */
export function getSlipState() {
  return {
    lateralSlip: _lateralSlip,
    brakeSlip: _brakeSlip,
    isSlipping: _isAnyWheelSlipping,
    slipAmount: Math.min(1, Math.max(_lateralSlip, _brakeSlip) * 3),
  };
}

// Engine state
const engine = { rpm: IDLE_RPM, gear: 1, throttle: 0 };

// ─── Engine helpers ──────────────────────────────────────────────────────────

function getTorqueMultiplier(rpm: number): number {
  if (rpm < PEAK_TORQUE_RPM) {
    return 0.6 + 0.4 * (rpm / PEAK_TORQUE_RPM);
  }
  const x = (rpm - PEAK_TORQUE_RPM) / (REDLINE_RPM - PEAK_TORQUE_RPM);
  return Math.max(0.15, 1.0 - 0.6 * x * x);
}

function rpmFromSpeed(speedMs: number, gear: number): number {
  if (gear <= 0) return IDLE_RPM;
  const wheelRPS = Math.abs(speedMs) / WHEEL_RADIUS;
  const engineRPM = wheelRPS * GEAR_RATIOS[gear] * FINAL_DRIVE * 60;
  return Math.max(IDLE_RPM, Math.min(engineRPM, REDLINE_RPM));
}

function autoShift(rpm: number, gear: number): number {
  if (rpm > UPSHIFT_RPM && gear < 6) return gear + 1;
  if (rpm < DOWNSHIFT_RPM && gear > 1) return gear - 1;
  return gear;
}

/** Drive acceleration (m/s²) for current engine state */
function getDriveAccel(throttle: number, rpm: number, gear: number): number {
  if (gear <= 0 || throttle <= 0) return 0;
  const torqueNm = PEAK_TORQUE_NM * getTorqueMultiplier(rpm) * throttle;
  const wheelTorqueNm = torqueNm * GEAR_RATIOS[gear] * FINAL_DRIVE;
  const driveForceN = wheelTorqueNm / WHEEL_RADIUS;
  const accel = driveForceN / VEHICLE_MASS;
  return Math.min(accel, MAX_DRIVE_ACCEL);
}

// Kept for backward compat (exported but unused externally)
export function getSlipRatio(wheelAngularVel: number, contactVel: number, radius: number): number {
  const ws = wheelAngularVel * radius;
  return (ws - contactVel) / Math.max(Math.abs(contactVel), 0.1);
}
export function getPacejkaForce(slip: number, normal: number, mu: number): number {
  const D = mu * normal;
  return D * Math.sin(1.9 * Math.atan(10 * slip - 0.97 * (10 * slip - Math.atan(10 * slip))));
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

  // ── Read current state ─────────────────────────────────────────────────
  const linvel = body.linvel();
  const vel = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
  const speedMs = vel.length();

  const rot = body.rotation();
  const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);

  const forwardSpeed = vel.dot(forward);      // positive = forward
  const contactSpeed = Math.abs(forwardSpeed);

  // ── Ground check (any wheel near ground plane) ─────────────────────────
  // Road top ≈ y=0; allow margin for suspension jitter / small hops so we
  // don't drop drive torque when wheels briefly read slightly high.
  const groundProbeMaxY = 1.2;
  let anyGrounded = false;
  const bodyPos = body.translation();
  for (const lp of WHEEL_POSITIONS) {
    const worldY = bodyPos.y + new THREE.Vector3().copy(lp).applyQuaternion(quat).y;
    if (worldY < groundProbeMaxY) { anyGrounded = true; break; }
  }

  // ── Drive / Brake / Reverse Logic (Arcade Style) ───────────────────────
  const reverseSpeedMs = MAX_REVERSE_MPH * MPH_TO_MS;

  // Decide what pedals mean based on current velocity
  let isAccelerating = false;
  let isBraking = false;
  let isReversing = false;

  if (forwardSpeed > 0.3) {
    // Moving forward
    isAccelerating = throttleInput > 0;
    isBraking = brakeInput > 0;
  } else if (forwardSpeed < -0.3) {
    // Moving backward
    isBraking = throttleInput > 0;
    isReversing = brakeInput > 0;
  } else {
    // Stopped
    isAccelerating = throttleInput > 0;
    isReversing = brakeInput > 0 && throttleInput === 0;
  }

  // ── Engine state ───────────────────────────────────────────────────────
  if (isReversing) {
    engine.gear = -1;
    engine.rpm = Math.max(IDLE_RPM, Math.min(3000,
      (Math.abs(forwardSpeed) / reverseSpeedMs) * 3000));
    engine.throttle = brakeInput;
  } else {
    engine.throttle = throttleInput;
    engine.rpm = rpmFromSpeed(contactSpeed, engine.gear);
    if (engine.gear === -1) engine.gear = 1;
    engine.gear = autoShift(engine.rpm, engine.gear);
  }

  // ── Compute net forward acceleration ───────────────────────────────────
  let accel = 0;

  if (anyGrounded) {
    // Drive (forward)
    if (isAccelerating) {
      accel += getDriveAccel(throttleInput, engine.rpm, engine.gear);
    }

    // Braking (opposes velocity, cannot reverse sign)
    if (isBraking && contactSpeed > 0.1) {
      const activeBrakeInput = (forwardSpeed > 0) ? brakeInput : throttleInput;
      const brakeDecel = MAX_BRAKE_DECEL * activeBrakeInput;
      accel -= Math.sign(forwardSpeed) * brakeDecel;
    }

    // Reverse (accelerate backward)
    if (isReversing && forwardSpeed > -reverseSpeedMs) {
      accel -= REVERSE_ACCEL * brakeInput;
    }

    // Rolling resistance
    if (contactSpeed > 0.1) {
      accel -= Math.sign(forwardSpeed) * (ROLLING_RESISTANCE_N / VEHICLE_MASS);
    }
  }

  // Aerodynamic drag (always, signed to oppose motion)
  if (contactSpeed > 0.5) {
    accel -= (AERO_DRAG_COEFF * forwardSpeed * contactSpeed) / VEHICLE_MASS;
  }

  // ── Integrate and clamp ────────────────────────────────────────────────
  let newSpeed = forwardSpeed + accel * dt;

  // Brake clamp: braking can never flip the velocity sign
  if (isBraking) {
    if (forwardSpeed > 0 && newSpeed < 0) newSpeed = 0;
    if (forwardSpeed < 0 && newSpeed > 0) newSpeed = 0;
  }

  // Rolling-resistance / drag bringing car to a natural stop
  if (!isAccelerating && !isReversing && Math.abs(newSpeed) < 0.15) {
    newSpeed = 0;
  }

  // Reverse speed cap
  if (newSpeed < -reverseSpeedMs) newSpeed = -reverseSpeedMs;

  // ── Apply forward velocity change ──────────────────────────────────────
  const dv = newSpeed - forwardSpeed;
  const targetVel = vel.clone();
  if (Math.abs(dv) > 0.0001) {
    targetVel.add(forward.clone().multiplyScalar(dv));
  }

  // ── Lateral grip ───────────────────────────────────────────────────────
  if (anyGrounded) {
    const lateralSpeed = vel.dot(right);
    _lateralSlip = Math.abs(lateralSpeed) / Math.max(1, speedMs);
    _brakeSlip = brakeInput > 0.1 ? brakeInput * (contactSpeed > 2 ? 0.5 : 0) : 0;
    _isAnyWheelSlipping = _lateralSlip > 0.1 || _brakeSlip > 0.2;

    const correction = right.clone().multiplyScalar(-lateralSpeed * 0.9);
    targetVel.add(correction);
  }

  // Apply combined velocity changes, preserving Y (gravity/vertical movement)
  body.setLinvel({ x: targetVel.x, y: vel.y, z: targetVel.z }, true);

  // ── Steering ───────────────────────────────────────────────────────────
  const absSpd = Math.abs(forwardSpeed);
  if (absSpd > 0.5 && anyGrounded) {
    const maxSteer = THREE.MathUtils.lerp(0.52, 0.14, Math.min(absSpd / 15, 1));
    const steerAngle = steering * maxSteer;
    const angvel = body.angvel();
    const targetYaw = -(forwardSpeed * Math.tan(steerAngle)) / WHEELBASE;
    const newYaw = angvel.y + (targetYaw - angvel.y) * Math.min(8.0 * dt, 1);
    body.setAngvel({ x: angvel.x * 0.8, y: newYaw, z: angvel.z * 0.8 }, true);
  } else {
    const angvel = body.angvel();
    body.setAngvel({ x: angvel.x * 0.8, y: angvel.y * 0.9, z: angvel.z * 0.8 }, true);
  }

  // ── Safety: keep above ground ──────────────────────────────────────────
  {
    const p = body.translation();
    if (p.y < 0.3) {
      body.setTranslation({ x: p.x, y: 0.3, z: p.z }, true);
      const lv3 = body.linvel();
      if (lv3.y < 0) body.setLinvel({ x: lv3.x, y: 0, z: lv3.z }, true);
    }
  }

  // ── Sync to store ──────────────────────────────────────────────────────
  const pos = body.translation();
  store.setVehiclePosition([pos.x, pos.y, pos.z]);

  const heading = Math.atan2(-forward.x, -forward.z);
  store.setVehicleHeading(heading);

  const displayMph = Math.abs(newSpeed) / MPH_TO_MS;
  store.setVelocityMph(Math.round(displayMph));
  store.setEngineRPM(Math.round(engine.rpm));
  store.setEngineGear(engine.gear);
  store.setEngineSpeed(Math.round(displayMph));

  // ── ABS indicator (visual only — brakes don't actually pulse anymore) ──
  store.setABSActive(brakeInput > 0.5 && contactSpeed > 8);

  // ── Mileage ────────────────────────────────────────────────────────────
  if (forwardSpeed > 0.5) {
    mileageAccumulator += (forwardSpeed * dt) / METERS_PER_MILE;
    if (mileageAccumulator >= MILEAGE_BATCH) {
      store.addMileage(mileageAccumulator);
      store.consumeFuel(FUEL_PER_BATCH);
      mileageAccumulator = 0;
    }
  }
}

/** Reset module state */
export function resetVehicleController(): void {
  mileageAccumulator = 0;
  engine.rpm = IDLE_RPM;
  engine.gear = 1;
  engine.throttle = 0;
}
