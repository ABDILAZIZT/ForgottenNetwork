import type { Bounds, IsoDateString, RegionId, UserId, WorldId } from './common';

export const CHUNK_SIZE = 128 as const;
export const WORLD_COORDINATE_LIMIT = 1_000_000 as const;
export const DRAWING_LAYER_COUNT = 3 as const;

export type DrawingLayer = 0 | 1 | 2;
export type RegionType = 'commons' | 'gallery' | 'event';

export interface World {
  id: WorldId;
  slug: string;
  name: string;
  description: string;
  coordinateLimit: number;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface RegionPolicy {
  canDraw: boolean;
  canPlaceEntities: boolean;
  allowedLayers: DrawingLayer[];
  startsAt: IsoDateString | null;
  endsAt: IsoDateString | null;
}

export interface Region {
  id: RegionId;
  worldId: WorldId;
  name: string;
  type: RegionType;
  bounds: Bounds;
  policy: RegionPolicy;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export type ChunkLayerEncoding = 'deflate-base64-rgba';

export interface ChunkSnapshot {
  worldId: WorldId;
  chunkX: number;
  chunkY: number;
  version: number;
  encoding: ChunkLayerEncoding;
  layers: [string, string, string];
  updatedAt: IsoDateString;
  updatedBy: UserId | null;
}

export interface ViewportQuery {
  minChunkX: number;
  minChunkY: number;
  maxChunkX: number;
  maxChunkY: number;
}

export interface LocationLink {
  worldSlug: string;
  x: number;
  y: number;
  zoom: number;
}
