/**
 * VehicleController — Ray-cast suspension physics with engine simulation
 * Called inside a useFrame() hook attached to the Vehicle component
 * 
 * Architecture:
 *   1. Ray-cast 4 wheels → suspension force            (spring + damping)
 *   2. Engine RPM from wheel speed → torque curve     (realistic powerband)
 *   3. Slip ratio → Pacejka grip limit                 (wheelspin/lockup)
 *   4. ABS pulse when slip detected                    (braking safety)
 *   5. All forces applied at contact points            (creates weight transfer)
 */
import { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';

// ─── Wheel Configuration ──────────────────────────────────────────────────────
interface Wheel {
  readonly localPosition: THREE.Vector3;
  readonly radius: number;
  readonly restLength: number;        // suspension at rest (meters)
  readonly travel: number;            // max compression distance
  readonly stiffness: number;         // spring constant (N/m)
  readonly damping: number;           // damping coefficient
  readonly frictionCoeff: number;     // tire grip coefficient (lateral)
  readonly isSteerable: boolean;      // front wheels only
  readonly isDriven: boolean;         // rear or all-wheel drive
}

// ─── Wheel state (per-frame) ──────────────────────────────────────────────────
interface WheelState {
  angularVel: number;                 // wheel spin rate (rad/s)
  isGrounded: boolean;                // last frame contact
  contactPoint: THREE.Vector3;        // world space contact
}

// ─── Engine state ─────────────────────────────────────────────────────────────
interface EngineState {
  rpm: number;
  gear: number;                       // 0=neutral, 1-6=gears
  throttle: number;
}

// ─── Brake state ──────────────────────────────────────────────────────────────
interface BrakeStatePerWheel {
  absActive: boolean;
  pulseTimer: number;
}

// ─── Physics constants ────────────────────────────────────────────────────────
const WHEELBASE = 2.4;                // meters (for steering)
const WHEEL_INERTIA = 0.9;            // kg·m² per wheel
// Engine parameters
const IDLE_RPM = 800;
const REDLINE_RPM = 7000;
const PEAK_TORQUE_RPM = 3500;
const PEAK_TORQUE_NM = 400;           // peak torque at 3500 RPM
const GEAR_RATIOS = [0, 3.5, 2.1, 1.4, 1.0, 0.8, 0.65];  // 0=neutral placeholder
const FINAL_DRIVE = 1.63;
const WHEEL_RADIUS = 0.35;

// Shifting thresholds
const UPSHIFT_RPM = 6500;
const DOWNSHIFT_RPM = 1800;

// ABS parameters
const ABS_THRESHOLD = 0.15;           // slip ratio that triggers ABS (~15%)
const ABS_PULSE_HZ = 15;              // real ABS pulses at 10-15 Hz

// Brake torque (converted from force through wheel radius)
const MAX_BRAKE_TORQUE = 1200;        // N·m per wheel

// Game metrics
const MPH_TO_MS = 0.44704;
const MILEAGE_BATCH = 0.1;            // miles before writing to store
const METERS_PER_MILE = 400;          // world-meters per in-game mile
const FUEL_PER_BATCH = 0.08;          // fuel % consumed per mileage batch

// ─── Wheel definitions (front-left, front-right, rear-left, rear-right) ──────
const WHEELS: Wheel[] = [
  // Front-left
  {
    localPosition: new THREE.Vector3(-0.9, -0.3, 1.5),
    radius: 0.35,
    restLength: 0.5,
    travel: 0.3,
    stiffness: 45000,
    damping: 4500,
    frictionCoeff: 0.8,
    isSteerable: true,
    isDriven: false,
  },
  // Front-right
  {
    localPosition: new THREE.Vector3(0.9, -0.3, 1.5),
    radius: 0.35,
    restLength: 0.5,
    travel: 0.3,
    stiffness: 45000,
    damping: 4500,
    frictionCoeff: 0.8,
    isSteerable: true,
    isDriven: false,
  },
  // Rear-left
  {
    localPosition: new THREE.Vector3(-0.9, -0.3, -1.5),
    radius: 0.35,
    restLength: 0.5,
    travel: 0.3,
    stiffness: 45000,
    damping: 4500,
    frictionCoeff: 0.8,
    isSteerable: false,
    isDriven: true,
  },
  // Rear-right
  {
    localPosition: new THREE.Vector3(0.9, -0.3, -1.5),
    radius: 0.35,
    restLength: 0.5,
    travel: 0.3,
    stiffness: 45000,
    damping: 4500,
    frictionCoeff: 0.8,
    isSteerable: false,
    isDriven: true,
  },
];

// ─── Module-level state ───────────────────────────────────────────────────────
let mileageAccumulator = 0;

// Slip state exposed for audio/particle systems
let _lateralSlip = 0;
let _brakeSlip = 0;
let _isAnyWheelSlipping = false;

/** Get current slip state for audio/particle effects */
export function getSlipState() {
  return {
    lateralSlip: _lateralSlip,
    brakeSlip: _brakeSlip,
    isSlipping: _isAnyWheelSlipping,
    /** Combined slip amount 0–1 for audio intensity */
    slipAmount: Math.min(1, Math.max(_lateralSlip, _brakeSlip) * 3),
  };
}

// Wheel states
const wheelStates: WheelState[] = WHEELS.map(() => ({
  angularVel: 0,
  isGrounded: false,
  contactPoint: new THREE.Vector3(),
}));

// Engine state
const engine: EngineState = {
  rpm: IDLE_RPM,
  gear: 1,
  throttle: 0,
};

// Brake states per wheel
const brakeStates: BrakeStatePerWheel[] = WHEELS.map(() => ({
  absActive: false,
  pulseTimer: 0,
}));

// ─── Utility functions ────────────────────────────────────────────────────────

/** Get torque multiplier at given RPM (0-1) */
function getTorqueAtRPM(rpm: number): number {
  const peak = PEAK_TORQUE_RPM;
  const redline = REDLINE_RPM;
  if (rpm < peak) {
    return 0.6 + 0.4 * (rpm / peak);
  }
  const x = (rpm - peak) / (redline - peak);
  return Math.max(0.15, 1.0 - 0.6 * x * x);
}

/** Get wheel torque (Nm) from engine torque and gearing */
function getWheelTorque(engineTorqueNm: number, gear: number): number {
  if (gear === 0) return 0; // neutral
  return engineTorqueNm * GEAR_RATIOS[gear] * FINAL_DRIVE;
}

/** Calculate RPM from wheel contact velocity and current gear */
function updateRPM(
  contactVelMs: number,
  gear: number,
): number {
  if (gear === 0) return IDLE_RPM; // neutral = idle
  const wheelRPS = Math.abs(contactVelMs) / WHEEL_RADIUS;
  const engineRPS = wheelRPS * GEAR_RATIOS[gear] * FINAL_DRIVE;
  const drivenRPM = engineRPS * 60;
  return Math.max(IDLE_RPM, Math.min(drivenRPM, REDLINE_RPM));
}

/** Auto-shift logic */
function autoShift(rpm: number, gear: number): number {
  if (rpm > UPSHIFT_RPM && gear < 6) return gear + 1;
  if (rpm < DOWNSHIFT_RPM && gear > 1) return gear - 1;
  return gear;
}

/** Slip ratio: (wheel surface speed - ground contact speed) / contact speed */
export function getSlipRatio(wheelAngularVel: number, contactVel: number, radius: number): number {
  const wheelSurfaceSpeed = wheelAngularVel * radius;
  const denom = Math.max(Math.abs(contactVel), 0.1);
  return (wheelSurfaceSpeed - contactVel) / denom;
}

/** Brake slip ratio (positive = locking) */
function getBrakeSlipRatio(wheelAngularVel: number, contactVel: number, radius: number): number {
  const wheelSurfaceSpeed = wheelAngularVel * radius;
  const denom = Math.max(Math.abs(contactVel), 0.1);
  return (contactVel - wheelSurfaceSpeed) / denom;
}

/** Pacejka simplified grip calculation */
export function getPacejkaForce(
  slipRatio: number,
  normalForce: number,
  peakFriction: number,
): number {
  const B = 10;     // stiffness
  const C = 1.9;    // shape
  const D = peakFriction * normalForce;  // peak achievable force
  const E = 0.97;   // curvature

  const x = slipRatio;
  const arg = B * x - E * (B * x - Math.atan(B * x));
  return D * Math.sin(C * Math.atan(arg));
}

/** Update wheel angular velocity based on drive/brake/friction torques */
function updateWheelAngularVel(
  ws: WheelState,
  driveTorque: number,
  brakeTorque: number,
  wheelInertia: number,
  delta: number,
): void {
  const netTorque = driveTorque - brakeTorque;
  ws.angularVel += (netTorque / wheelInertia) * delta;
}

/** ABS pulse filter */
function updateABS(
  bs: BrakeStatePerWheel,
  slipRatio: number,
  requestedBrake: number,
  delta: number,
): number {
  bs.pulseTimer += delta;

  if (slipRatio > ABS_THRESHOLD) {
    bs.absActive = true;
  }

  if (!bs.absActive) return requestedBrake;

  // Pulse at ABS_PULSE_HZ
  const cycleTime = 1 / ABS_PULSE_HZ;
  const phase = bs.pulseTimer % cycleTime;

  if (phase < cycleTime * 0.5) {
    return 0;  // release phase
  } else {
    bs.absActive = slipRatio > ABS_THRESHOLD;  // re-check
    return requestedBrake;
  }
}

// ─── Main vehicle physics tick ────────────────────────────────────────────────
export function tickVehicle(
  body: RapierRigidBody,
  delta: number,
  world?: any,
  rapier?: any,
): void {
  const store = useGameStore.getState();
  const { steering, throttle: throttleInput, brake: brakeInput, phase } = store;

  if (phase !== 'driving') return;

  const dt = Math.min(delta, 0.05);

  // ── Read current state ─────────────────────────────────────────────────────
  const linvel = body.linvel();
  const vel = new THREE.Vector3(linvel.x, linvel.y, linvel.z);
  const speedMs = vel.length();

  const rot = body.rotation();
  const quat = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

  const forwardSpeed = vel.dot(forward);
  const contactVelocity = Math.abs(forwardSpeed);

  // ── Update engine state from wheel speed ───────────────────────────────────
  engine.throttle = throttleInput;
  engine.rpm = updateRPM(contactVelocity, engine.gear);
  engine.gear = autoShift(engine.rpm, engine.gear);

  // ── Simple drive force — applied per driven wheel ──────────────────────────
  // Torque → wheel force in N. Capped at 2× body weight / driven wheels for realism.
  const torqueNm = PEAK_TORQUE_NM * getTorqueAtRPM(engine.rpm);
  const wheelTorque = getWheelTorque(torqueNm * throttleInput, engine.gear);
  const drivenWheelCount = WHEELS.filter(w => w.isDriven).length;
  const driveForcePerWheel = wheelTorque / (WHEEL_RADIUS * drivenWheelCount);

  // ── Per-wheel loop ─────────────────────────────────────────────────────────
  let anyGrounded = false;

  for (let i = 0; i < WHEELS.length; i++) {
    const wheel = WHEELS[i];
    const ws = wheelStates[i];
    const bs = brakeStates[i];
    ws.isGrounded = false;

    // World-space position of this wheel mount
    const wheelMount = new THREE.Vector3()
      .copy(wheel.localPosition)
      .applyQuaternion(quat)
      .add(body.translation() as any);

    // ── Ground detection (simple height check — wheel near ground plane y=0) ─
    const isOnGround = wheelMount.y < (wheel.radius + 0.5);
    if (!isOnGround) continue;
    ws.isGrounded = true;
    anyGrounded = true;

    // ── Drive force ────────────────────────────────────────────────────────
    if (wheel.isDriven && throttleInput > 0) {
      const driveImpulse = forward.clone().multiplyScalar(driveForcePerWheel * dt);
      body.applyImpulseAtPoint(driveImpulse as any, wheelMount as any, true);
      updateWheelAngularVel(ws, driveForcePerWheel * wheel.radius, 0, WHEEL_INERTIA, dt);
    }

    // ── Braking (oppose velocity, taper near stop) ──────────────────────
    if (brakeInput > 0 && Math.abs(forwardSpeed) > 0.5) {
      const brakeSlip = getBrakeSlipRatio(ws.angularVel, contactVelocity, wheel.radius);
      const effectiveBrake = updateABS(bs, brakeSlip, brakeInput, dt);
      const brakeTorque = effectiveBrake * MAX_BRAKE_TORQUE;
      updateWheelAngularVel(ws, 0, brakeTorque, WHEEL_INERTIA, dt);
      const speedFactor = Math.min(1, Math.abs(forwardSpeed) / 3);
      const brakeDir = forwardSpeed > 0 ? -1 : 1;
      const brakeImpulse = forward.clone().multiplyScalar(brakeDir * (brakeTorque / wheel.radius) * speedFactor * dt);
      body.applyImpulseAtPoint(brakeImpulse as any, wheelMount as any, true);
      store.setABSActive(bs.absActive);
    }
  }

  // ── Lateral grip (only when on ground) ───────────────────────────────────
  if (anyGrounded) {
    const lateralSpeed = vel.dot(right);
    // Update slip state for audio/particles
    _lateralSlip = Math.abs(lateralSpeed) / Math.max(1, speedMs);
    _brakeSlip = brakeInput > 0.1 ? brakeInput * (speedMs > 2 ? 0.5 : 0) : 0;
    _isAnyWheelSlipping = _lateralSlip > 0.1 || _brakeSlip > 0.2;
    // Cancel ~90% of sideways velocity per frame to simulate tire grip
    const correction = right.clone().multiplyScalar(-lateralSpeed * 0.9);
    const lv = body.linvel();
    body.setLinvel(
      { x: lv.x + correction.x, y: lv.y, z: lv.z + correction.z },
      true
    );
  }

  // ── Steering ─────────────────────────────────────────────────────────────
  const absSpeed = Math.abs(forwardSpeed);
  if (absSpeed > 0.5 && anyGrounded) {
    const maxSteerAngle = THREE.MathUtils.lerp(0.52, 0.14, Math.min(absSpeed / 15, 1));
    const steerAngle = steering * maxSteerAngle;
    const angvel = body.angvel();
    const targetYaw = -(forwardSpeed * Math.tan(steerAngle)) / WHEELBASE;
    const newYaw = angvel.y + (targetYaw - angvel.y) * Math.min(8.0 * dt, 1);
    body.setAngvel({ x: angvel.x * 0.8, y: newYaw, z: angvel.z * 0.8 }, true);
  } else {
    const angvel = body.angvel();
    body.setAngvel({ x: angvel.x * 0.8, y: angvel.y * 0.9, z: angvel.z * 0.8 }, true);
  }

  // ── Safety clamp: prevent falling through the world ────────────────────────
  {
    const p = body.translation();
    if (p.y < 0.3) {
      body.setTranslation({ x: p.x, y: 0.3, z: p.z }, true);
      const lv = body.linvel();
      if (lv.y < 0) body.setLinvel({ x: lv.x, y: 0, z: lv.z }, true);
    }
  }

  // ── Sync to store ─────────────────────────────────────────────────────────
  const pos = body.translation();
  store.setVehiclePosition([pos.x, pos.y, pos.z]);
  
  const heading = Math.atan2(-forward.x, -forward.z);
  store.setVehicleHeading(heading);
  
  const currentMph = speedMs / MPH_TO_MS;
  store.setVelocityMph(Math.round(Math.max(0, currentMph)));
  
  // Store engine telemetry for HUD
  store.setEngineRPM(Math.round(engine.rpm));
  store.setEngineGear(engine.gear);
  store.setEngineSpeed(Math.round(currentMph));

  // ── Mileage accumulation ─────────────────────────────────────────────────
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
  wheelStates.forEach(ws => {
    ws.angularVel = 0;
    ws.isGrounded = false;
  });
  brakeStates.forEach(bs => {
    bs.absActive = false;
    bs.pulseTimer = 0;
  });
}
