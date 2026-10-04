import type { EntityState } from '../engine/Entity';

export interface ChunkRecord {
  id: string;
  cx: number;
  cy: number;
  zone: string;
  layers: Uint8Array[];
  savedAt: number;
  /** Server revision. Local records may omit it. */
  version?: number;
}

export interface AssetRecord {
  id: string;
  blob: Blob | string;
  type: string;
  savedAt: number;
}

export type RepositoryMode = 'local' | 'remote';
export type RepositoryPhase = 'saved' | 'saving' | 'retry' | 'conflict' | 'rejected' | 'error';

export interface RepositoryStatus {
  mode: RepositoryMode;
  phase: RepositoryPhase;
  pendingWrites: number;
  message: string;
  updatedAt: number;
}

export type RepositoryStatusListener = (status: RepositoryStatus) => void;

export interface WorldRepository {
  readonly mode: RepositoryMode;
  setPublishingIdentity?(id: string | null): void;

  loadChunk(id: string): Promise<ChunkRecord | null>;
  loadInitialChunks(): Promise<ChunkRecord[]>;
  saveChunk(record: ChunkRecord): Promise<void>;
  deleteChunk(id: string, expectedVersion?: number): Promise<void>;

  saveAsset(id: string, blob: Blob | string, type: string): Promise<void>;
  loadAsset(id: string): Promise<AssetRecord | null>;
  loadAllAssets(): Promise<AssetRecord[]>;

  saveEntity(state: EntityState): Promise<void>;
  loadAllEntities(): Promise<EntityState[]>;
  deleteEntity(id: string): Promise<void>;

  exportWorld(options?: { skipPendingWrites?: boolean }): Promise<string>;
  importWorld(json: string): Promise<number>;
  flush(): Promise<void>;
  getStatus(): RepositoryStatus;
  subscribeStatus(listener: RepositoryStatusListener): () => void;
  retryPending(): Promise<void>;
  discardPending(): Promise<void>;
}
