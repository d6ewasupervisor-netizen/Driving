/**
 * QuietRoadsFrame — ticks the bridge from inside the Canvas. No rendering.
 */
import { useFrame } from '@react-three/fiber';
import { QuietRoads } from '@/systems/QuietRoadsBridge';

export function QuietRoadsFrame() {
  useFrame((_, delta) => { QuietRoads.tick(delta); });
  return null;
}
