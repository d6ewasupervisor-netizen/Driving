/**
 * Wheel rig — separates steering (hub) from roll spin (mesh) to avoid Euler coupling.
 */
import * as THREE from 'three';

export interface WheelRig {
  /** Hub node — steering rotation Y only */
  steerNode: THREE.Object3D;
  /** Mesh node — roll spin only */
  spinNode: THREE.Object3D;
  spinAngle: number;
  isFront: boolean;
  /** Hub orientation from GLB (mount angle) */
  baseSteerX: number;
  baseSteerY: number;
  baseSteerZ: number;
  /** Mesh orientation from GLB before spin */
  baseSpinQuat: THREE.Quaternion;
  /** Local axle axis for roll (shortest bbox axis on wheel mesh) */
  spinAxis: THREE.Vector3;
}

const _spinQuat = new THREE.Quaternion();
const _rollQuat = new THREE.Quaternion();

function findSpinMesh(hub: THREE.Object3D): THREE.Object3D {
  for (const child of hub.children) {
    if (child.name.includes('__')) return child;
  }
  if (hub instanceof THREE.Mesh) return hub;
  return hub.children[0] ?? hub;
}

function detectSpinAxis(mesh: THREE.Object3D): THREE.Vector3 {
  if (mesh instanceof THREE.Mesh && mesh.geometry) {
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox;
    if (bb) {
      const sx = bb.max.x - bb.min.x;
      const sy = bb.max.y - bb.min.y;
      const sz = bb.max.z - bb.min.z;
      if (sx <= sy && sx <= sz) return new THREE.Vector3(1, 0, 0);
      if (sy <= sx && sy <= sz) return new THREE.Vector3(0, 1, 0);
      return new THREE.Vector3(0, 0, 1);
    }
  }
  return new THREE.Vector3(1, 0, 0);
}

function isFrontWheelName(name: string): boolean {
  return (
    name.startsWith('wheelf') ||
    name.includes('front') ||
    name.includes('wheel_f') ||
    name.includes('wheel-f')
  );
}

/** Build rigs from wheel hub nodes (parent groups, not __ mesh children). */
export function buildWheelRigs(
  root: THREE.Object3D,
  hubFilter?: (name: string) => boolean
): WheelRig[] {
  const rigs: WheelRig[] = [];

  root.traverse((obj) => {
    const name = obj.name.toLowerCase();
    if (!name.includes('wheel') && !name.includes('tire')) return;
    if (name.includes('__')) return;
    if (hubFilter && !hubFilter(name)) return;

    const spinNode = findSpinMesh(obj);
    rigs.push({
      steerNode: obj,
      spinNode,
      spinAngle: 0,
      isFront: isFrontWheelName(name),
      baseSteerX: obj.rotation.x,
      baseSteerY: obj.rotation.y,
      baseSteerZ: obj.rotation.z,
      baseSpinQuat: spinNode.quaternion.clone(),
      spinAxis: detectSpinAxis(spinNode),
    });
  });

  return rigs;
}

/** Detach wheel hubs from the GLB scene graph into a stable anchor (keeps world transform). */
export function attachWheelHubsToAnchor(rigs: WheelRig[], anchor: THREE.Object3D) {
  for (const rig of rigs) {
    if (rig.steerNode.parent === anchor) continue;
    anchor.attach(rig.steerNode);
  }
}

/** Update steering + roll spin. Forward travel along -Z. */
const SPIN_SIGN = -1;

export function updateWheelRigs(
  rigs: WheelRig[],
  spinRate: number,
  delta: number,
  steerAngle = 0,
  steerLerp = 10
) {
  const dt = Math.min(delta, 0.05);
  const spinDelta = spinRate * SPIN_SIGN * dt;

  for (const rig of rigs) {
    rig.spinAngle += spinDelta;

    if (rig.isFront) {
      rig.steerNode.rotation.x = rig.baseSteerX;
      rig.steerNode.rotation.y = THREE.MathUtils.lerp(
        rig.steerNode.rotation.y,
        rig.baseSteerY + steerAngle,
        steerLerp * dt
      );
      rig.steerNode.rotation.z = rig.baseSteerZ;
    } else {
      rig.steerNode.rotation.x = rig.baseSteerX;
      rig.steerNode.rotation.y = rig.baseSteerY;
      rig.steerNode.rotation.z = rig.baseSteerZ;
    }

    _rollQuat.setFromAxisAngle(rig.spinAxis, rig.spinAngle);
    _spinQuat.copy(rig.baseSpinQuat).multiply(_rollQuat);
    rig.spinNode.quaternion.copy(_spinQuat);
  }
}
