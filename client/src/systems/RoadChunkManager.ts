/**
 * RoadChunkManager — Object-pooled chunk system
 * Vehicle travels in -Z direction; chunks are recycled ahead of the player.
 */
import { Biome } from '@/stores/gameStore';

export const CHUNK_LENGTH = 200; // world meters per chunk
// Pool layout: current + AHEAD + BEHIND chunks. At 75 mph (~33 m/s) the
// player crosses one chunk per ~6s; we want at least 5 chunks (~1km) of
// look-ahead so a brief frame hitch can never let the leading edge pop in.
const AHEAD_CHUNKS = 5;
const BEHIND_CHUNKS = 2;
const POOL_SIZE = 1 + AHEAD_CHUNKS + BEHIND_CHUNKS; // 8

export interface ChunkData {
  id: number;
  gen: number;       // increments each recycle — used in React key to force remount
  zPosition: number; // world Z of chunk center
  biome: Biome;
  variation: number; // 0–4 for decoration variety
}

/** Initialize pool with chunks centered on player start (z=0).
 *  Player travels in -Z, so "ahead" is more negative Z. */
export function initChunks(): ChunkData[] {
  const chunks: ChunkData[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    // Slot offsets run from -AHEAD_CHUNKS (most ahead, most negative Z)
    // through 0 (current) to +BEHIND_CHUNKS (most behind).
    const offset = i - AHEAD_CHUNKS;
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

  // Recycle any chunk that is more than BEHIND_CHUNKS chunks behind the
  // player (positive Z = behind, since the player travels in -Z).
  for (const chunk of updated) {
    if (chunk.zPosition > currentChunkZ + BEHIND_CHUNKS * CHUNK_LENGTH) {
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
