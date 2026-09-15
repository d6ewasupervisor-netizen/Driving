---
description: "Use when modifying game state, Zustand store slices, game phases, persisted state, or adding new state fields."
applyTo: "client/src/stores/**"
---

# Zustand Game Store

## Architecture
Single store in `gameStore.ts` using `create<GameState>()(persist(...))`. State is divided into logical slices but lives in one flat store.

### Slices
| Slice | Fields | Persisted? |
|-------|--------|-----------|
| Controls | steering, throttle, brake | No (runtime) |
| Vehicle | vehiclePosition, vehicleHeading, velocityMph, engineRPM, engineGear, engineSpeed, absActive | No (runtime) |
| Game | phase, mileage, lastQuizMile, lastFuelStopMile, visitedFuelStops, currentBiome, hp, fuel, timeOfDay | Yes |
| Quiz | quizActive, currentQuestion, answeredIds, questionsAnswered, correctAnswers | Yes |
| Economy | zCoins, streak, trafficHits | Yes |
| Settings | steeringSensitivity, cameraMode, isMuted, sfxVolume, musicVolume | Yes |

## Access Patterns
- **In React components**: `useGameStore(s => s.fieldName)` — selector for reactivity
- **In systems (useFrame)**: `useGameStore.getState()` — direct access, no hooks
- **In event handlers**: Either works, but `getState()` is preferred for one-shots

## Game Phases
`menu → driving → quiz → driving → ... → gasStation → driving → victory/gameover`

Phases: `menu`, `driving`, `quiz`, `paused`, `gasStation`, `outOfGas`, `victory`, `gameover`

## Key Actions
- `addMileage(delta)` — updates mileage, biome, timeOfDay together
- `triggerQuiz(question)` — sets phase to 'quiz', populates question
- `answerQuiz(answer)` — returns `{ correct, coinsEarned }`, updates streak/coins
- `resetProgress()` — resets to defaultGameState (keeps settings)

## Adding New State
1. Add field to the appropriate slice interface
2. Add default value in the initial state or `defaultGameState`
3. Add setter action if needed
4. If it should persist: it will automatically (the `partialize` excludes only runtime fields)
5. If runtime-only: add to the `partialize` exclusion list
