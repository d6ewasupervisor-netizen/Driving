/**
 * QuietSwarm — every one of the Quiet as an instanced billboard cut from the
 * card game's cutout sheet (/quiet/quiet_atlas.png, 6 figures). One draw call.
 * Cylindrical billboarding (they turn to face the camera, feet stay planted).
 * Tint by awareness: dormant is washed out and dim, alert warms, swarm goes red.
 */
import { useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { QuietRoads } from '@/systems/QuietRoadsBridge';

const CELL_W = 160, CELL_H = 400, COUNT = 6;
const HEIGHT_M = 1.85;               // sprite height in world metres
const WIDTH_M = HEIGHT_M * (CELL_W / CELL_H);

const vert = /* glsl */`
  attribute float aSprite;
  attribute float aState;
  attribute float aSeed;
  uniform float uTime;
  uniform float uCount;
  varying vec2 vUv;
  varying float vState;
  void main() {
    // instance origin in world space
    vec4 origin = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    // camera right on the ground plane
    vec3 camRight = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
    vec3 up = vec3(0.0, 1.0, 0.0);
    float sway = sin(uTime * (1.2 + aState * 2.0) + aSeed * 6.28) * (0.015 + aState * 0.02);
    vec3 world = origin.xyz + camRight * (position.x * ${WIDTH_M.toFixed(3)} + sway * position.y)
                            + up * ((position.y + 0.5) * ${HEIGHT_M.toFixed(3)});
    vUv = vec2((uv.x + aSprite) / uCount, uv.y);
    vState = aState;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;
const frag = /* glsl */`
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying float vState;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    if (c.a < 0.35) discard;
    float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
    // dormant: grey, dim. curious: a little colour. alert: warm. swarm: red-shifted, bright.
    vec3 dormant = mix(vec3(lum), c.rgb, 0.25) * 0.55;
    vec3 curious = mix(vec3(lum), c.rgb, 0.6) * 0.75;
    vec3 alert   = c.rgb * vec3(1.05, 0.9, 0.75);
    vec3 swarm   = c.rgb * vec3(1.25, 0.55, 0.5);
    vec3 col = vState < 0.5 ? dormant : vState < 1.5 ? curious : vState < 2.5 ? alert : swarm;
    gl_FragColor = vec4(col, c.a);
  }
`;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();

export function QuietSwarm() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tex = useLoader(THREE.TextureLoader, '/quiet/quiet_atlas.png');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const list = QuietRoads.sim.quiet.list;
  const count = list.length;

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1);
    const sprite = new Float32Array(count), state = new Float32Array(count), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { sprite[i] = (i * 7 + 3) % COUNT; seed[i] = Math.random(); state[i] = 0; }
    g.setAttribute('aSprite', new THREE.InstancedBufferAttribute(sprite, 1));
    g.setAttribute('aState', new THREE.InstancedBufferAttribute(state, 1));
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
    return g;
  }, [count]);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uTime: { value: 0 }, uCount: { value: COUNT } },
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: true, side: THREE.DoubleSide,
  }), [tex]);

  useFrame((st) => {
    const m = meshRef.current; if (!m) return;
    mat.uniforms.uTime.value = st.clock.elapsedTime;
    const stateAttr = geom.getAttribute('aState') as THREE.InstancedBufferAttribute;
    let stateDirty = false;
    for (let i = 0; i < count; i++) {
      const z = list[i];
      _p.set(z.pos.x, 0, z.pos.y);
      _m.makeTranslation(_p.x, _p.y, _p.z);
      m.setMatrixAt(i, _m);
      if (stateAttr.getX(i) !== z.state) { stateAttr.setX(i, z.state); stateDirty = true; }
    }
    m.instanceMatrix.needsUpdate = true;
    if (stateDirty) stateAttr.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geom, mat, count]} frustumCulled={false} />;
}
