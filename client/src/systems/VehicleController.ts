/**
 * VehicleController — Arcade vehicle physics with engine simulation
 *
 * Forward speed is tracked as a module-level number. Each frame we compute
 * the desired velocity and use setLinvel so Rapier's collision solver can
 * handle contacts with world geometry (buildings, barriers, curbs) naturally.
 * Rapier also handles gravity and ground contact.
 *
 * The car collider's friction MUST be 0 so road-surface contacts don't
 * fight our programmatic speed.
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
const WHEELBASE = 1.8;

const UPSHIFT_RPM = 6500;
const DOWNSHIFT_RPM = 1800;

const MAX_BRAKE_DECEL = 8.0;

const AERO_DRAG_COEFF = 0.5;
const ROLLING_RESISTANCE_N = 200;

const MAX_REVERSE_MPH = 15;
const REVERSE_ACCEL = 1.2;

const VEHICLE_MASS = 1400;
const MAX_DRIVE_ACCEL = 9.81 * 0.45 * 0.8;

// Smoothing — eliminates surging from abrupt throttle / gear changes
const THROTTLE_SMOOTH_UP = 3.5;
const THROTTLE_SMOOTH_DOWN = 5.0;
const ACCEL_SMOOTH_RATE = 10.0;

// ─── Quiet Roads (Kent) pedal profile ────────────────────────────────────────
// Pads and keys are binary, so the *ramp* is the pedal. A tap on the gas is a
// gentle 0.2–0.3; holding it for a second and a quarter is full throttle. Same
// idea for the brake: a tap is a squeeze, holding is a stop. The car is also a
// heavy old Beetle here: 0.2 g of drive instead of 0.36 g, and slower surge
// smoothing so shifts don't shove.
const KENT_THROTTLE_UP = 0.8;      // 1/s → full in 1.25 s
const KENT_THROTTLE_DOWN = 4.0;
const KENT_BRAKE_UP = 1.6;         // 1/s → full in 0.6 s (a panic stop is still available)
const KENT_BRAKE_DOWN = 6.0;
const KENT_MAX_DRIVE_ACCEL = 9.81 * 0.2;
const KENT_ACCEL_SMOOTH_RATE = 6.0;
const HIGHWAY_BRAKE_UP = 12.0;     // effectively instant, as before
const HIGHWAY_BRAKE_DOWN = 12.0;
const LATERAL_DAMP_RATE = 5.0;
const LATERAL_DAMP_STRAIGHT = 18.0;
const YAW_CENTER_RATE = 20.0;
const STEER_DEADZONE = 0.06;
const COLLISION_SPEED_DROP = 3.0; // m/s — only blend speed after real impacts
const COLLISION_SPEED_BLEND = 0.6;

const MPH_TO_MS = 0.44704;
const MILEAGE_BATCH = 0.1;
const METERS_PER_MILE = 400;
const FUEL_PER_BATCH = 0.08;

// ─── Module-level state ──────────────────────────────────────────────────────
let mileageAccumulator = 0;
let currentSpeed = 0;
let smoothedThrottle = 0;
let smoothedBrake = 0;
let smoothedAccel = 0;

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

/** Called by CollisionSystem to simulate impact with an NPC. */
export function applyCollisionImpact(factor: number): void {
  currentSpeed *= 1 - factor;
}

// ─── Quiet Roads hooks (read-only observation + teleport; never drives the car) ───
let _body: RapierRigidBody | null = null;

/** Vehicle.tsx registers its RigidBody so missions can place the car. */
export function registerVehicleBody(body: RapierRigidBody | null): void {
  _body = body;
}

/** Signed forward speed in m/s (negative = reversing). */
export function getCurrentSpeedMs(): number {
  return currentSpeed;
}

/** The pedals as the car actually feels them (after the ramp), 0..1 each. */
export function getSmoothedPedals(): { throttle: number; brake: number } {
  return { throttle: smoothedThrottle, brake: smoothedBrake };
}

/** Bring the car to a dead stop (cutscenes, quizzes). */
export function haltVehicle(): void {
  currentSpeed = 0;
  smoothedAccel = 0;
  smoothedThrottle = 0;
  smoothedBrake = 0;
  if (_body) {
    _body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    _body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}

/** Multiply forward speed (collision response from the Quiet / static geometry). */
export function scaleCurrentSpeed(factor: number): void {
  currentSpeed *= factor;
}

/**
 * Place the car at world (x, z) facing `headingCore` (radians, 0 = +X, measured toward +Z).
 * Converts to the game's forward = -Z convention.
 */
export function teleportVehicle(x: number, z: number, headingCore: number): void {
  if (!_body) return;
  resetVehicleController();
  // forward vector in XZ from core heading
  const fx = Math.cos(headingCore), fz = Math.sin(headingCore);
  // Rapier body forward is -Z rotated by yaw: (-sin yaw, -cos yaw) → yaw = atan2(-fx, -fz)
  const yaw = Math.atan2(-fx, -fz);
  _body.setTranslation({ x, y: 0.5, z }, true);
  _body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  _body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  _body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  useGameStore.getState().setVehiclePosition([x, 0.5, z]);
  useGameStore.getState().setVehicleHeading(yaw);
}

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

  // ── Read back actual velocity — captures collision responses from Rapier ──
  const linvel = body.linvel();
  const actualForwardSpeed = forward.x * linvel.x + forward.z * linvel.z;
  const lateralSpeed = right.x * linvel.x + right.z * linvel.z;

  if (actualForwardSpeed < currentSpeed - COLLISION_SPEED_DROP) {
    currentSpeed = THREE.MathUtils.lerp(
      currentSpeed,
      actualForwardSpeed,
      COLLISION_SPEED_BLEND,
    );
  }

  _lateralSlip = Math.abs(lateralSpeed) / Math.max(1, Math.abs(currentSpeed));
  _brakeSlip = smoothedBrake > 0.1 ? smoothedBrake * (Math.abs(currentSpeed) > 2 ? 0.5 : 0) : 0;
  _isAnyWheelSlipping = _lateralSlip > 0.1 || _brakeSlip > 0.2;

  // ── Smooth pedal inputs (profile by world) ────────────────────────────
  const kent = store.worldMode === 'kent';
  const thUp = kent ? KENT_THROTTLE_UP : THROTTLE_SMOOTH_UP;
  const thDown = kent ? KENT_THROTTLE_DOWN : THROTTLE_SMOOTH_DOWN;
  const brUp = kent ? KENT_BRAKE_UP : HIGHWAY_BRAKE_UP;
  const brDown = kent ? KENT_BRAKE_DOWN : HIGHWAY_BRAKE_DOWN;
  if (throttleInput > smoothedThrottle) {
    smoothedThrottle = Math.min(throttleInput, smoothedThrottle + thUp * dt);
  } else {
    smoothedThrottle = Math.max(throttleInput, smoothedThrottle - thDown * dt);
  }
  if (brakeInput > smoothedBrake) {
    smoothedBrake = Math.min(brakeInput, smoothedBrake + brUp * dt);
  } else {
    smoothedBrake = Math.max(brakeInput, smoothedBrake - brDown * dt);
  }
  const brakePedal = smoothedBrake;

  // ── Decide pedal roles based on current speed ──────────────────────────
  const reverseSpeedMs = MAX_REVERSE_MPH * MPH_TO_MS;
  let isAccelerating = false;
  let isBraking = false;
  let isReversing = false;

  if (currentSpeed > 0.3) {
    isAccelerating = smoothedThrottle > 0;
    isBraking = brakePedal > 0;
  } else if (currentSpeed < -0.3) {
    isBraking = smoothedThrottle > 0;
    isReversing = brakePedal > 0;
  } else {
    isAccelerating = smoothedThrottle > 0;
    isReversing = brakePedal > 0 && smoothedThrottle === 0;
  }

  // ── Engine state ───────────────────────────────────────────────────────
  if (isReversing) {
    engine.gear = -1;
    engine.rpm = Math.max(IDLE_RPM, Math.min(3000,
      (Math.abs(currentSpeed) / reverseSpeedMs) * 3000));
    engine.throttle = brakePedal;
  } else {
    engine.throttle = smoothedThrottle;
    engine.rpm = rpmFromSpeed(Math.abs(currentSpeed), engine.gear);
    if (engine.gear === -1) engine.gear = 1;
    engine.gear = autoShift(engine.rpm, engine.gear);
  }

  // ── Compute net forward acceleration ───────────────────────────────────
  let rawAccel = 0;

  if (isAccelerating) {
    const drive = getDriveAccel(smoothedThrottle, engine.rpm, engine.gear);
    rawAccel += kent ? Math.min(drive, KENT_MAX_DRIVE_ACCEL) : drive;
  }

  if (isBraking && Math.abs(currentSpeed) > 0.1) {
    const activeBrakeInput = currentSpeed > 0 ? brakePedal : smoothedThrottle;
    rawAccel -= Math.sign(currentSpeed) * MAX_BRAKE_DECEL * activeBrakeInput;
  }

  if (isReversing && currentSpeed > -reverseSpeedMs) {
    rawAccel -= REVERSE_ACCEL * brakePedal;
  }

  if (Math.abs(currentSpeed) > 0.1) {
    rawAccel -= Math.sign(currentSpeed) * (ROLLING_RESISTANCE_N / VEHICLE_MASS);
  }

  if (Math.abs(currentSpeed) > 0.5) {
    rawAccel -= (AERO_DRAG_COEFF * currentSpeed * Math.abs(currentSpeed)) / VEHICLE_MASS;
  }

  // Smooth acceleration to eliminate gear-shift surges
  const maxAccelDelta = (kent ? KENT_ACCEL_SMOOTH_RATE : ACCEL_SMOOTH_RATE) * dt;
  smoothedAccel += THREE.MathUtils.clamp(rawAccel - smoothedAccel, -maxAccelDelta, maxAccelDelta);

  // ── Integrate speed ────────────────────────────────────────────────────
  currentSpeed += smoothedAccel * dt;

  if (isBraking) {
    if (currentSpeed > 0 && currentSpeed - smoothedAccel * dt < 0) currentSpeed = 0;
    if (currentSpeed < 0 && currentSpeed - smoothedAccel * dt > 0) currentSpeed = 0;
  }

  if (!isAccelerating && !isReversing && Math.abs(currentSpeed) < 0.15) {
    currentSpeed = 0;
  }

  if (currentSpeed < -reverseSpeedMs) currentSpeed = -reverseSpeedMs;

  const steerInput = Math.abs(steering) < STEER_DEADZONE ? 0 : steering;
  const goingStraight = steerInput === 0;

  // ── Set velocity via Rapier so the collision solver works properly ─────
  const lateralRate = goingStraight ? LATERAL_DAMP_STRAIGHT : LATERAL_DAMP_RATE;
  const lateralDamp = Math.max(0, 1 - lateralRate * dt);
  const dampedLateralX = right.x * lateralSpeed * lateralDamp;
  const dampedLateralZ = right.z * lateralSpeed * lateralDamp;

  body.setLinvel(
    {
      x: forward.x * currentSpeed + dampedLateralX,
      y: linvel.y,
      z: forward.z * currentSpeed + dampedLateralZ,
    },
    true,
  );

  // ── Steering — auto-center yaw when input is neutral ───────────────────
  const absSpd = Math.abs(currentSpeed);
  const angvel = body.angvel();

  if (absSpd > 0.5 && steerInput !== 0) {
    const maxSteer = THREE.MathUtils.lerp(0.52, 0.14, Math.min(absSpd / 15, 1));
    const steerAngle = steerInput * maxSteer;
    const targetYaw = -(currentSpeed * Math.tan(steerAngle)) / WHEELBASE;
    const newYaw = angvel.y + (targetYaw - angvel.y) * Math.min(8.0 * dt, 1);
    body.setAngvel({ x: 0, y: newYaw, z: 0 }, true);
  } else if (absSpd > 0.3) {
    // Hold a straight line: kill yaw and snap velocity to heading
    const yawDamp = Math.max(0, 1 - YAW_CENTER_RATE * dt);
    body.setAngvel({ x: 0, y: angvel.y * yawDamp, z: 0 }, true);
  } else {
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  // ── Safety: keep above ground ──────────────────────────────────────────
  {
    const p = body.translation();
    if (p.y < 0.3) {
      body.setTranslation({ x: p.x, y: 0.3, z: p.z }, true);
      const lv = body.linvel();
      if (lv.y < 0) body.setLinvel({ x: lv.x, y: 0, z: lv.z }, true);
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

  // ── Mileage (highway mode only; Kent missions don't count miles) ────────
  if (store.worldMode === 'highway' && currentSpeed > 0.5) {
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
  smoothedAccel = 0;
  engine.rpm = IDLE_RPM;
  engine.gear = 1;
  engine.throttle = 0;
}
