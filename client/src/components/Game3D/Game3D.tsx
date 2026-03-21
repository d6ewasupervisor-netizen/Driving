/**
 * Game3D — Root component: Canvas + Physics + all systems
 * Replaces the 2D ZombieRoadWarrior game body.
 */
import { Suspense, useEffect, useRef, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';

import { useGameStore } from '@/stores/gameStore';
import { useGameProgress } from '@/hooks/useGameProgress';
import { useTouchControls } from '@/hooks/useTouchControls';
import { useQuizManager } from '@/systems/QuizManager';
import { AudioManager } from '@/systems/AudioManager';
import { getSlipState } from '@/systems/VehicleController';
import { getWeather } from './Skybox';
import { isLowEndDevice, recordDelta } from '@/utils/performance';

import { Lighting } from './Lighting';
import { Skybox } from './Skybox';
import { RoadChunks } from './RoadChunks';
import { Vehicle } from './Vehicle';
import { TrafficRenderer } from './TrafficRenderer';
import { GameCamera } from './GameCamera';
import { LoadingScreen } from './LoadingScreen';
import { GameHUD } from './GameHUD';
import { EngineHUD } from './EngineHUD';
import { QuizOverlay } from './QuizOverlay';
import { TouchOverlay } from './TouchOverlay';
import { PauseMenu, VictoryScreen, GameOverScreen } from './PauseMenu';
import { MainMenu } from './MainMenu';
import { LovesStopScreen, OutOfGasScreen } from './LovesStopScreen';
import { Collectibles } from './Collectibles';
import { CollisionSystem } from './CollisionSystem';
import { PostProcessing } from './PostProcessing';
import { NpcState } from '@/systems/TrafficManager';

// ─── Low-end detection (computed once) ───────────────────────────────────────
const LOW_END = isLowEndDevice();

// ─── Performance monitor (runs inside Canvas context) ────────────────────────
function PerformanceMonitor() {
  const { gl } = useThree();
  const throttledRef = useRef(false);

  useFrame((_, delta) => {
    const isThrottling = recordDelta(delta);
    if (isThrottling && !throttledRef.current) {
      throttledRef.current = true;
      gl.setPixelRatio(1);
    }
  });

  return null;
}

// ─── Audio bridge (runs inside Canvas for useFrame) ─────────────────────────
function AudioBridge() {
  useFrame(() => {
    const { engineRPM, velocityMph, phase, isMuted, mileage } = useGameStore.getState();
    const slip = getSlipState();
    const raining = getWeather(mileage) === 'rain';
    AudioManager.setMuted(isMuted);
    AudioManager.update(engineRPM, velocityMph, slip.slipAmount, phase === 'driving', raining);

    if (phase === 'paused' || phase === 'quiz' || phase === 'gasStation') {
      AudioManager.suspend();
    } else {
      AudioManager.resume();
    }
  });
  return null;
}

// ─── Inner scene (needs Canvas context) ──────────────────────────────────────
function Scene({ lowEnd }: { lowEnd: boolean }) {
  const npcsRef = useRef<NpcState[]>([]);
  const npcsRefWrapper = useRef(npcsRef.current);

  const handleNpcsRef = useCallback((ref: React.MutableRefObject<NpcState[]>) => {
    npcsRefWrapper.current = ref.current;
    npcsRef.current = ref.current;
  }, []);

  return (
    <Physics
      gravity={[0, -9.7119, 0]}
      timeStep="vary"
    >
      <Lighting />
      <Skybox />
      <RoadChunks lowEnd={lowEnd} />
      <Vehicle />
      <TrafficRenderer lowEnd={lowEnd} onNpcsRef={handleNpcsRef} />
      <Collectibles />
      <CollisionSystem npcsRef={npcsRef} />
      <GameCamera />
    </Physics>
  );
}

// ─── Hooks bridge (runs inside Canvas) ───────────────────────────────────────
// (useQuizManager is NOT a 3D hook — it's called outside Canvas below)

// ─── Main export ─────────────────────────────────────────────────────────────
interface Game3DProps {
  onExit?: () => void;
}

export function Game3D({ onExit }: Game3DProps) {
  const setPhase = useGameStore((s) => s.setPhase);
  const togglePause = useGameStore((s) => s.togglePause);
  const phase = useGameStore((s) => s.phase);
  const mileage = useGameStore((s) => s.mileage);
  const hp = useGameStore((s) => s.hp);
  const fuel = useGameStore((s) => s.fuel);
  const zCoins = useGameStore((s) => s.zCoins);
  const questionsAnswered = useGameStore((s) => s.questionsAnswered);
  const correctAnswers = useGameStore((s) => s.correctAnswers);

  const { saveProgress } = useGameProgress();

  // Register systems
  useTouchControls();
  useQuizManager();

  // ── Initialize audio on first user interaction ─────────────────────────────
  useEffect(() => {
    const initAudio = () => {
      if (!AudioManager.initialized) {
        AudioManager.init();
      }
    };
    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('keydown', initAudio, { once: true });
    window.addEventListener('touchstart', initAudio, { once: true });
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
      window.removeEventListener('touchstart', initAudio);
    };
  }, []);

  // ── Keyboard: Escape / P to toggle pause ─────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        togglePause();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [togglePause]);

  // ── Tab visibility: auto-save on hide ────────────────────────────────────
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        saveProgress({
          currentMile: mileage,
          hp,
          fuel,
          zCoins,
          questionsAnswered,
          correctAnswers,
          completedEncounters: [],
          lastSaveLocation: 'En Route',
        });
        if (phase === 'driving') setPhase('paused');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [phase, mileage, hp, fuel, zCoins, questionsAnswered, correctAnswers, saveProgress, setPhase]);

  // ── Load saved backend progress into store on first mount ────────────────
  const { savedProgress } = useGameProgress();
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current || !savedProgress) return;
    loadedRef.current = true;
    const store = useGameStore.getState();
    // Only load if local storage has no progress
    if (store.mileage === 0 && savedProgress.currentMile > 0) {
      useGameStore.setState({
        mileage: savedProgress.currentMile,
        hp: savedProgress.hp,
        zCoins: savedProgress.zCoins,
        questionsAnswered: savedProgress.questionsAnswered,
        correctAnswers: savedProgress.correctAnswers,
      });
    }
  }, [savedProgress]);

  return (
    <div
      id="game-touch-area"
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        touchAction: 'none',
        background: '#0a0a12',
      }}
    >
      {/* 3D Canvas */}
      <Canvas
        frameloop="always"
        dpr={LOW_END ? [1, 1] : [1, 1.5]}
        shadows={LOW_END ? false : 'soft'}
        camera={{ fov: 75, near: 0.1, far: 500 }}
        gl={{ antialias: !LOW_END, powerPreference: 'high-performance' }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Suspense fallback={null}>
          <Scene lowEnd={LOW_END} />
          <PostProcessing lowEnd={LOW_END} />
          <AudioBridge />
          <PerformanceMonitor />
        </Suspense>
      </Canvas>

      {/* HTML overlay layer (outside Canvas) */}
      <div className="ui-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <LoadingScreen />
        <GameHUD />
        <EngineHUD />
        <QuizOverlay />
        <TouchOverlay />
        <PauseMenu onExit={onExit} />
        <VictoryScreen onExit={onExit} />
        <GameOverScreen />
        <MainMenu onExit={onExit} />
        <LovesStopScreen />
        <OutOfGasScreen />
      </div>
    </div>
  );
}
