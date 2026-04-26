/**
 * VehicleParticles — tire smoke, road dust, and exhaust particles
 *
 * Uses Three.js InstancedMesh for GPU-efficient particle rendering.
 * Attached as a child of the Vehicle group so wheel positions are in local space.
 *
 * Effects:
 *   - Tire smoke: white/grey puffs when slipping (drift, hard braking)
 *   - Road dust: brown/tan kicked up at speed on any surface
 *   - Exhaust: dark grey puffs from rear, intensity scales with RPM
 */
import { useRef, useMemo, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/stores/gameStore';
import { getSlipState } from '@/systems/VehicleController';

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_PARTICLES = 200;
const TIRE_SMOKE_COLOR = new THREE.Color(0.85, 0.85, 0.85);
const DUST_COLOR = new THREE.Color(0.65, 0.55, 0.4);
const EXHAUST_COLOR = new THREE.Color(0.3, 0.3, 0.32);

// Wheel positions in vehicle local space (matching VehicleController).
// IMPORTANT: forward is -Z, so the REAR of the car is at +Z.
const REAR_LEFT = new THREE.Vector3(-0.9, -0.3, 1.5);
const REAR_RIGHT = new THREE.Vector3(0.9, -0.3, 1.5);
const EXHAUST_POS = new THREE.Vector3(-0.4, -0.1, 2.1); // behind rear bumper (+Z)

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;     // remaining life (seconds)
  maxLife: number;
  size: number;
  color: THREE.Color;
  active: boolean;
}

// Shared temp objects
const _matrix = new THREE.Matrix4();
const _color = new THREE.Color();
const _quat = new THREE.Quaternion();

// ─── Component ────────────────────────────────────────────────────────────────
export function VehicleParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Particle pool
  const particles = useMemo<Particle[]>(() => {
    const pool: Particle[] = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pool.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        size: 0.1,
        color: new THREE.Color(1, 1, 1),
        active: false,
      });
    }
    return pool;
  }, []);

  // Next available particle index (round-robin)
  const nextIdx = useRef(0);

  const emit = useCallback((
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    color: THREE.Color,
    size: number,
    life: number,
  ) => {
    const p = particles[nextIdx.current];
    p.position.copy(pos);
    p.velocity.copy(vel);
    p.color.copy(color);
    p.size = size;
    p.life = life;
    p.maxLife = life;
    p.active = true;
    nextIdx.current = (nextIdx.current + 1) % MAX_PARTICLES;
  }, [particles]);

  // Accumulator for emission timing
  const emitTimer = useRef(0);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const { velocityMph, engineRPM, phase } = useGameStore.getState();
    const slip = getSlipState();
    const isDriving = phase === 'driving';
    const dt = Math.min(delta, 0.05); // cap delta

    emitTimer.current += dt;

    // ── Emit new particles ────────────────────────────────────────────────
    if (isDriving && emitTimer.current > 0.02) {
      emitTimer.current = 0;

      // Tire smoke — when slipping
      if (slip.slipAmount > 0.15) {
        const intensity = Math.min(1, slip.slipAmount);
        // Emit from rear wheels
        for (const wheelPos of [REAR_LEFT, REAR_RIGHT]) {
          if (Math.random() < intensity) {
            emit(
              wheelPos.clone().add(new THREE.Vector3(
                (Math.random() - 0.5) * 0.3,
                Math.random() * 0.1,
                (Math.random() - 0.5) * 0.3,
              )),
              new THREE.Vector3(
                (Math.random() - 0.5) * 0.8,
                0.3 + Math.random() * 0.5,
                (Math.random() - 0.5) * 0.5,
              ),
              TIRE_SMOKE_COLOR,
              0.15 + Math.random() * 0.2,
              0.6 + Math.random() * 0.4,
            );
          }
        }
      }

      // Road dust — at medium+ speed
      if (velocityMph > 15) {
        const dustChance = Math.min(0.6, velocityMph / 80);
        if (Math.random() < dustChance) {
          const wheel = Math.random() < 0.5 ? REAR_LEFT : REAR_RIGHT;
          emit(
            wheel.clone().add(new THREE.Vector3(
              (Math.random() - 0.5) * 0.4,
              -0.05,
              0.3 + Math.random() * 0.3, // behind rear wheel (+Z)
            )),
            new THREE.Vector3(
              (Math.random() - 0.5) * 0.4,
              0.1 + Math.random() * 0.3,
              0.5 + Math.random() * 0.5, // trail behind (+Z)
            ),
            DUST_COLOR,
            0.1 + Math.random() * 0.15,
            0.4 + Math.random() * 0.3,
          );
        }
      }

      // Exhaust — always when engine running, intensity scales with RPM
      const exhaustChance = 0.1 + (engineRPM / 7000) * 0.4;
      if (Math.random() < exhaustChance) {
        emit(
          EXHAUST_POS.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.05,
            (Math.random() - 0.5) * 0.05,
            0,
          )),
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            0.1 + Math.random() * 0.15,
            0.2 + Math.random() * 0.3, // puff back behind car (+Z)
          ),
          EXHAUST_COLOR,
          0.04 + Math.random() * 0.06,
          0.3 + Math.random() * 0.2,
        );
      }
    }

    // ── Update all particles ──────────────────────────────────────────────
    let visibleCount = 0;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.active) {
        // Hide inactive
        _matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _matrix);
        continue;
      }

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _matrix);
        continue;
      }

      // Physics: rise + slow down
      p.velocity.y += 0.3 * dt; // buoyancy
      p.velocity.multiplyScalar(1 - 2.0 * dt); // drag
      p.position.addScaledVector(p.velocity, dt);

      // Scale: grow then fade
      const lifeRatio = p.life / p.maxLife; // 1 → 0
      const scale = p.size * (1.0 + (1 - lifeRatio) * 2.5); // grow over lifetime

      _matrix.compose(
        p.position,
        _quat.identity(),
        new THREE.Vector3(scale, scale, scale),
      );
      mesh.setMatrixAt(i, _matrix);

      // Color: fade alpha via opacity encoded in color brightness
      _color.copy(p.color).multiplyScalar(0.4 + lifeRatio * 0.6);
      mesh.setColorAt(i, _color);

      visibleCount++;
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.count = MAX_PARTICLES;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX_PARTICLES]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </instancedMesh>
  );
}
