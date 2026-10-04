import type { IsoDateString, OperationId, UserId, WorldId } from './common';
import type { DrawingLayer } from './world';

export const MAX_PIXELS_PER_STROKE = 10_000 as const;

export type PixelOperationKind = 'draw' | 'erase' | 'fill' | 'undo' | 'moderator_restore';
export type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

export interface PixelChange {
  /** Row-major offset in a 128×128 chunk, from 0 through 16383. */
  pixelIndex: number;
  layer: DrawingLayer;
  rgba: Rgba;
}

export interface ChunkMutation {
  chunkX: number;
  chunkY: number;
  expectedVersion: number;
  changes: PixelChange[];
}

export interface ApplyPixelOperationRequest {
  /** Client-generated UUID used as both the operation ID and idempotency key. */
  operationId: OperationId;
  kind: Exclude<PixelOperationKind, 'moderator_restore'>;
  chunks: ChunkMutation[];
  undoOfOperationId?: OperationId;
}

export interface AppliedChunkVersion {
  chunkX: number;
  chunkY: number;
  previousVersion: number;
  version: number;
}

export interface ApplyPixelOperationResponse {
  operationId: OperationId;
  worldId: WorldId;
  actorId: UserId;
  acceptedAt: IsoDateString;
  affectedPixelCount: number;
  chunks: AppliedChunkVersion[];
}

export interface ChunkVersionConflict {
  chunkX: number;
  chunkY: number;
  expectedVersion: number;
  currentVersion: number;
}

export interface PixelOperationConflict {
  error: {
    code: 'CONFLICT';
    message: string;
    requestId: string;
    operationId: OperationId;
    conflicts: ChunkVersionConflict[];
  };
}

export function countAffectedPixels(operation: ApplyPixelOperationRequest): number {
  return operation.chunks.reduce((total, chunk) => total + chunk.changes.length, 0);
}

export function isPixelIndex(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < 128 * 128;
}

export function isRgba(value: readonly number[]): value is Rgba {
  return (
    value.length === 4 &&
    value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)
  );
}
