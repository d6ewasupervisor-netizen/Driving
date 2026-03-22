/**
 * VehicleController — Arcade vehicle physics with engine simulation
 *
 * We track forward speed as a module-level number and move the rigid body
 * by directly updating its translation each frame.  Rapier is only used
 * for gravity (keeping the car on the road) and collision detection.
 * The car collider's friction MUST be 0 so the contact solver does not
 * fight our programmatic velocity.
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
const MAX_BRAKE_DECEL = 8.0;

// Drag
const AERO_DRAG_COEFF = 0.5;
const ROLLING_RESISTANCE_N = 200;

// Reverse
const MAX_REVERSE_MPH = 15;
const REVERSE_ACCEL = 1.2;

// Traction
const VEHICLE_MASS = 1400;
const MAX_DRIVE_ACCEL = (9.81 * 0.45 * 0.8);

// Game metrics
const MPH_TO_MS = 0.44704;
const MILEAGE_BATCH = 0.1;
const METERS_PER_MILE = 400;
const FUEL_PER_BATCH = 0.08;

// ─── Module-level state ──────────────────────────────────────────────────────
let mileageAccumulator = 0;
let currentSpeed = 0;   // m/s along forward axis; positive = forward

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

function getDriveAccel(throttle: number, rpm: number, gear: number): number {
  if (gear <= 0 || throttle <= 0) return 0;
  const torqueNm = PEAK_TORQUE_NM * getTorqueMultiplier(rpm) * throttle;
  const wheelTorqueNm = torqueNm * GEAR_RATIOS[gear] * FINAL_DRIVE;
  const driveForceN = wheelTorqueNm / WHEEL_RADIUS;
  const accel = driveForceN / VEHICLE_MASS;
  return Math.min(accel, MAX_DRIVE_ACCEL);
}

// Kept for backward compat
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

  // ── Orientation ────────────────────────────────────────────────────────
  const rot = body.rotation();
  const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  if (quat.lengthSq() < 1e-6) quat.set(0, 0, 0, 1);
  else quat.normalize();

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat).normalize();
  const right   = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).normalize();

  // ── Decide pedal roles based on current speed ──────────────────────────
  const reverseSpeedMs = MAX_REVERSE_MPH * MPH_TO_MS;
  let isAccelerating = false;
  let isBraking = false;
  let isReversing = false;

  if (currentSpeed > 0.3) {
    isAccelerating = throttleInput > 0;
    isBraking = brakeInput > 0;
  } else if (currentSpeed < -0.3) {
    isBraking = throttleInput > 0;
    isReversing = brakeInput > 0;
  } else {
    isAccelerating = throttleInput > 0;
    isReversing = brakeInput > 0 && throttleInput === 0;
  }

  // ── Engine state ───────────────────────────────────────────────────────
  if (isReversing) {
    engine.gear = -1;
    engine.rpm = Math.max(IDLE_RPM, Math.min(3000,
      (Math.abs(currentSpeed) / reverseSpeedMs) * 3000));
    engine.throttle = brakeInput;
  } else {
    engine.throttle = throttleInput;
    engine.rpm = rpmFromSpeed(Math.abs(currentSpeed), engine.gear);
    if (engine.gear === -1) engine.gear = 1;
    engine.gear = autoShift(engine.rpm, engine.gear);
  }

  // ── Compute net forward acceleration ───────────────────────────────────
  let accel = 0;

  if (isAccelerating) {
    accel += getDriveAccel(throttleInput, engine.rpm, engine.gear);
  }

  if (isBraking && Math.abs(currentSpeed) > 0.1) {
    const activeBrakeInput = (currentSpeed > 0) ? brakeInput : throttleInput;
    accel -= Math.sign(currentSpeed) * MAX_BRAKE_DECEL * activeBrakeInput;
  }

  if (isReversing && currentSpeed > -reverseSpeedMs) {
    accel -= REVERSE_ACCEL * brakeInput;
  }

  if (Math.abs(currentSpeed) > 0.1) {
    accel -= Math.sign(currentSpeed) * (ROLLING_RESISTANCE_N / VEHICLE_MASS);
  }

  if (Math.abs(currentSpeed) > 0.5) {
    accel -= (AERO_DRAG_COEFF * currentSpeed * Math.abs(currentSpeed)) / VEHICLE_MASS;
  }

  // ── Integrate speed ────────────────────────────────────────────────────
  currentSpeed += accel * dt;

  if (isBraking) {
    if (currentSpeed > 0 && currentSpeed - accel * dt < 0) currentSpeed = 0;
    if (currentSpeed < 0 && currentSpeed - accel * dt > 0) currentSpeed = 0;
  }

  if (!isAccelerating && !isReversing && Math.abs(currentSpeed) < 0.15) {
    currentSpeed = 0;
  }

  if (currentSpeed < -reverseSpeedMs) currentSpeed = -reverseSpeedMs;

  // ── Move the body directly ─────────────────────────────────────────────
  const pos = body.translation();
  const moveX = forward.x * currentSpeed * dt;
  const moveZ = forward.z * currentSpeed * dt;

  // Lateral drift removal: kill any sideways velocity Rapier might add
  const linvel = body.linvel();
  const lateralSpeed = linvel.x * right.x + linvel.z * right.z;
  _lateralSlip = Math.abs(lateralSpeed) / Math.max(1, Math.abs(currentSpeed));
  _brakeSlip = brakeInput > 0.1 ? brakeInput * (Math.abs(currentSpeed) > 2 ? 0.5 : 0) : 0;
  _isAnyWheelSlipping = _lateralSlip > 0.1 || _brakeSlip > 0.2;

  body.setTranslation(
    { x: pos.x + moveX, y: pos.y, z: pos.z + moveZ },
    true,
  );

  // Let Rapier handle only vertical velocity (gravity + ground contact).
  // Zero out horizontal linvel so the solver doesn't accumulate drift.
  body.setLinvel({ x: 0, y: linvel.y, z: 0 }, true);

  // ── Steering ───────────────────────────────────────────────────────────
  const absSpd = Math.abs(currentSpeed);
  if (absSpd > 0.5) {
    const maxSteer = THREE.MathUtils.lerp(0.52, 0.14, Math.min(absSpd / 15, 1));
    const steerAngle = steering * maxSteer;
    const targetYaw = -(currentSpeed * Math.tan(steerAngle)) / WHEELBASE;
    const angvel = body.angvel();
    const newYaw = angvel.y + (targetYaw - angvel.y) * Math.min(8.0 * dt, 1);
    body.setAngvel({ x: 0, y: newYaw, z: 0 }, true);
  } else {
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  // ── Safety: keep above ground ──────────────────────────────────────────
  {
    const p = body.translation();
    if (p.y < 0.3) {
      body.setTranslation({ x: p.x, y: 0.3, z: p.z }, true);
      const lv = body.linvel();
      if (lv.y < 0) body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  // ── Sync to store ──────────────────────────────────────────────────────
  const finalPos = body.translation();
  store.setVehiclePosition([finalPos.x, finalPos.y, finalPos.z]);

  const heading = Math.atan2(-forward.x, -forward.z);
  store.setVehicleHeading(heading);

  const displayMph = Math.abs(currentSpeed) / MPH_TO_MS;
  store.setVelocityMph(Math.round(displayMph));
  store.setEngineRPM(Math.round(engine.rpm));
  store.setEngineGear(engine.gear);
  store.setEngineSpeed(Math.round(displayMph));

  store.setABSActive(brakeInput > 0.5 && Math.abs(currentSpeed) > 8);

  // ── Mileage ────────────────────────────────────────────────────────────
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
  engine.rpm = IDLE_RPM;
  engine.gear = 1;
  engine.throttle = 0;
}
