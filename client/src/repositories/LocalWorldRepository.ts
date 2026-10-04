import {
  deleteChunkRecord,
  deleteEntityState,
  exportWorld,
  importWorld,
  loadAllAssetRecords,
  loadAllChunkRecords,
  loadAllEntities,
  loadAsset,
  loadChunkRecord,
  saveAsset,
  saveChunkRecord,
  saveEntityState,
} from '../engine/db';
import type { EntityState } from '../engine/Entity';
import type {
  AssetRecord,
  ChunkRecord,
  RepositoryStatus,
  RepositoryStatusListener,
  WorldRepository,
} from './types';

export interface LocalRepositoryDriver {
  loadChunkRecord(id: string): Promise<ChunkRecord | null>;
  loadAllChunkRecords(): Promise<ChunkRecord[]>;
  saveChunkRecord(record: ChunkRecord): Promise<void>;
  deleteChunkRecord(id: string): Promise<void>;
  saveAsset(id: string, blob: Blob | string, type: string): Promise<void>;
  loadAsset(id: string): Promise<AssetRecord | null>;
  loadAllAssetRecords(): Promise<AssetRecord[]>;
  saveEntityState(state: EntityState): Promise<void>;
  loadAllEntities(): Promise<EntityState[]>;
  deleteEntityState(id: string): Promise<void>;
  exportWorld(): Promise<string>;
  importWorld(json: string): Promise<number>;
}

const indexedDbDriver: LocalRepositoryDriver = {
  loadChunkRecord,
  loadAllChunkRecords,
  saveChunkRecord,
  deleteChunkRecord,
  saveAsset,
  loadAsset,
  loadAllAssetRecords,
  saveEntityState,
  loadAllEntities,
  deleteEntityState,
  exportWorld,
  importWorld,
};

export class LocalWorldRepository implements WorldRepository {
  readonly mode = 'local' as const;

  private listeners = new Set<RepositoryStatusListener>();
  private pendingWrites = 0;
  private writeChain: Promise<void> = Promise.resolve();
  private lastError: Error | null = null;
  private readonly driver: LocalRepositoryDriver;
  private status: RepositoryStatus = {
    mode: 'local',
    phase: 'saved',
    pendingWrites: 0,
    message: 'Saved locally',
    updatedAt: Date.now(),
  };

  constructor(driver: LocalRepositoryDriver = indexedDbDriver) {
    this.driver = driver;
  }

  loadChunk(id: string) {
    return this.driver.loadChunkRecord(id);
  }

  loadInitialChunks() {
    return this.driver.loadAllChunkRecords();
  }

  saveChunk(record: ChunkRecord) {
    return this.enqueueWrite(() => this.driver.saveChunkRecord(record));
  }

  deleteChunk(id: string, _expectedVersion?: number) {
    return this.enqueueWrite(() => this.driver.deleteChunkRecord(id));
  }

  saveAsset(id: string, blob: Blob | string, type: string) {
    return this.enqueueWrite(() => this.driver.saveAsset(id, blob, type));
  }

  loadAsset(id: string) {
    return this.driver.loadAsset(id);
  }

  loadAllAssets(): Promise<AssetRecord[]> {
    return this.driver.loadAllAssetRecords();
  }

  saveEntity(state: EntityState) {
    return this.enqueueWrite(() => this.driver.saveEntityState(state));
  }

  loadAllEntities() {
    return this.driver.loadAllEntities();
  }

  deleteEntity(id: string) {
    return this.enqueueWrite(() => this.driver.deleteEntityState(id));
  }

  async exportWorld() {
    await this.flush();
    return this.driver.exportWorld();
  }

  importWorld(json: string) {
    return this.enqueueWrite(() => this.driver.importWorld(json));
  }

  async flush() {
    await this.writeChain;
    if (this.lastError) throw this.lastError;
  }

  retryPending() {
    return this.flush();
  }

  async discardPending() {
    // Local writes are already applied or actively running and cannot be discarded.
  }

  getStatus() {
    return this.status;
  }

  subscribeStatus(listener: RepositoryStatusListener) {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    this.pendingWrites += 1;
    this.setStatus('saving', 'Saving locally…');

    const result = this.writeChain.then(operation);
    this.writeChain = result.then(
      () => undefined,
      () => undefined,
    );

    return result.then(
      (value) => {
        this.pendingWrites -= 1;
        this.lastError = null;
        this.setStatus(
          this.pendingWrites > 0 ? 'saving' : 'saved',
          this.pendingWrites > 0 ? 'Saving locally…' : 'Saved locally',
        );
        return value;
      },
      (reason: unknown) => {
        this.pendingWrites -= 1;
        this.lastError = reason instanceof Error ? reason : new Error(String(reason));
        this.setStatus('error', 'Local save failed');
        throw reason;
      },
    );
  }

  private setStatus(phase: RepositoryStatus['phase'], message: string) {
    this.status = {
      mode: this.mode,
      phase,
      pendingWrites: this.pendingWrites,
      message,
      updatedAt: Date.now(),
    };
    for (const listener of this.listeners) listener(this.status);
  }
}
