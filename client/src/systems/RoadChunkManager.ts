/**
 * RoadChunkManager — Object-pooled chunk system
 * Vehicle travels in -Z direction; chunks are recycled ahead of the player.
 */
import { Biome } from '@/stores/gameStore';

export const CHUNK_LENGTH = 200; // world meters per chunk
const POOL_SIZE = 7;             // current + 3 ahead + 3 behind

export interface ChunkData {
  id: number;
  gen: number;       // increments each recycle — used in React key to force remount
  zPosition: number; // world Z of chunk center
  biome: Biome;
  variation: number; // 0–4 for decoration variety
}

/** Initialize pool with chunks centered on player start (z=0) */
export function initChunks(): ChunkData[] {
  const chunks: ChunkData[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const offset = i - 3; // -3 to +3
    chunks.push({
      id: i,
      gen: 0,
      zPosition: offset * CHUNK_LENGTH,
      biome: 'city',
      variation: Math.floor(Math.random() * 5),
    });
  }
  return chunks;
}

/**
 * Recycle stale chunks to keep 3 ahead of the player.
 * Vehicle moves in -Z, so "ahead" means lower Z values.
 */
export function updateChunks(
  chunks: ChunkData[],
  playerZ: number,
  currentBiome: Biome
): ChunkData[] {
  // Find the chunk closest to the player (current chunk)
  const currentChunkZ = Math.round(playerZ / CHUNK_LENGTH) * CHUNK_LENGTH;

  let changed = false;
  const updated = chunks.map((c) => ({ ...c }));

  // Sort by zPosition to find the frontmost occupied slot
  const sortedZ = updated.map((c) => c.zPosition).sort((a, b) => a - b);
  let nextFrontZ = sortedZ[0] - CHUNK_LENGTH; // one slot ahead of current front

  // Recycle any chunk that is more than 3 chunks behind the player
  for (const chunk of updated) {
    if (chunk.zPosition > currentChunkZ + 3 * CHUNK_LENGTH) {
      chunk.zPosition = nextFrontZ;
      nextFrontZ -= CHUNK_LENGTH; // stack further ahead if multiple recycle
      chunk.biome = currentBiome;
      chunk.variation = Math.floor(Math.random() * 5);
      chunk.gen++;
      changed = true;
    }
  }

  return changed ? updated : chunks;
}
