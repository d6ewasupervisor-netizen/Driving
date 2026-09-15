---
description: "Use when creating or editing 3D scene components, React Three Fiber JSX, drei helpers, GLB model loading, lighting, camera, or Rapier physics components."
applyTo: "client/src/components/Game3D/**"
---

# React Three Fiber Components

## Component Architecture
All 3D scene components live in `components/Game3D/`. They are React components using R3F JSX (`<mesh>`, `<RigidBody>`, etc.). Pure logic goes in `systems/` instead.

### Scene hierarchy (in Game3D.tsx → Scene)
```
<Physics gravity={[0, -9.7119, 0]} timeStep="vary">
  <Lighting />
  <Skybox />
  <RoadChunks />
  <Vehicle />
  <TrafficRenderer />
  <Collectibles />
  <CollisionSystem />
  <SkidMarks />
  <GameCamera />
</Physics>
```

## GLB Model Patterns
- Load with `useGLTF('/models/category/name.glb')`
- Preload at module level: `useGLTF.preload('/models/...')`
- Models in `client/public/models/` (buildings, cars, nature, road, zombies)
- Clone scenes for instancing: `scene.clone(true)`
- Zombie model (`walking_zombie.glb`) is in centimeters — scale = 0.01

## Vehicle Component (Vehicle.tsx)
- `<RigidBody>` with CCD enabled, linearDamping=0.5, angularDamping=0.5
- Collider half-extents: X=0.78, Y=0.5, Z=2.05 (VW Beetle proportions)
- Calls `tickVehicle(body, delta, world, rapier)` in `useFrame`
- Plow is pure geometry (V-shape) attached at front bumper
- Front wheel visual steering via group rotation (not mesh children)

## Material Overrides
- Use `applyToMaterial(scene, matName, fn)` helper to target named materials
- Brake lights: filter by mesh position (Z > 1.5) to avoid coloring bumpers
- Body color: `#c47a6a` (rusty pink), windows: `#111111`

## Camera (GameCamera.tsx)
- Three modes: chase (follows heading), birdseye (follows heading), profile (world-aligned)
- Cycle with C key. Offset rotates with `vehicleHeading` for chase/birdseye.
- Screen shake via module-level `triggerShake()` function.

## Road Chunks (RoadChunks.tsx)
- Pooled chunks managed by `RoadChunkManager` system
- Each chunk = 200m. Road tile scaled X×8, Z×4 (8m wide, 4m per tile)
- Road collider: 1m thick cuboid, top at Y=0
- Biome changes decorations (city → highway → rural)

## Performance Considerations
- `isLowEndDevice()` check reduces pixel ratio and detail
- `PerformanceMonitor` inside Canvas tracks frame drops
- Use `lowEnd` prop to conditionally reduce geometry/effects
