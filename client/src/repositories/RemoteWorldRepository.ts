import type { StoredRemoteMutation } from '../engine/db';
import type { EntityState } from '../engine/Entity';
import { IndexedDbRemoteMutationQueue, MemoryRemoteMutationQueue } from './RemoteMutationQueue';
import type { RemoteMutationQueue } from './RemoteMutationQueue';
import { prepareRemoteImport } from './prepareRemoteImport';
import type {
  AssetRecord,
  ChunkRecord,
  RepositoryPhase,
  RepositoryStatus,
  RepositoryStatusListener,
  WorldRepository,
} from './types';

export interface RemoteWorldGateway {
  loadChunk(id: string): Promise<ChunkRecord | null>;
  loadInitialChunks(): Promise<ChunkRecord[]>;
  saveChunk(record: ChunkRecord, operationId: string, actorId?: string): Promise<void>;
  deleteChunk(
    id: string,
    expectedVersion: number | undefined,
    operationId: string,
    actorId?: string,
  ): Promise<void>;
  saveAsset(
    id: string,
    blob: Blob | string,
    type: string,
    operationId: string,
    actorId?: string,
  ): Promise<void>;
  loadAsset(id: string): Promise<AssetRecord | null>;
  loadAllAssets(): Promise<AssetRecord[]>;
  saveEntity(state: EntityState, operationId: string, actorId?: string): Promise<void>;
  loadAllEntities(): Promise<EntityState[]>;
  deleteEntity(id: string, operationId: string, actorId?: string): Promise<void>;
  exportWorld(): Promise<string>;
  importWorld(json: string, operationId: string): Promise<number>;
}

interface SaveAssetPayload {
  id: string;
  blob: Blob | string;
  type: string;
}

export class RemoteWorldRepository implements WorldRepository {
  readonly mode = 'remote' as const;

  private readonly gateway: RemoteWorldGateway;
  private readonly queue: RemoteMutationQueue;
  private listeners = new Set<RepositoryStatusListener>();
  private writeChain: Promise<unknown> = Promise.resolve();
  private lastError: Error | null = null;
  private publishingIdentity: string | null = null;
  private status: RepositoryStatus = {
    mode: 'remote',
    phase: 'saved',
    pendingWrites: 0,
    message: 'Synced',
    updatedAt: Date.now(),
  };

  constructor(gateway: RemoteWorldGateway, queue?: RemoteMutationQueue) {
    this.gateway = gateway;
    this.queue =
      queue ||
      (typeof indexedDB === 'undefined'
        ? new MemoryRemoteMutationQueue()
        : new IndexedDbRemoteMutationQueue());

    void this.refreshQueueStatus();
  }

  setPublishingIdentity(id: string | null) {
    this.publishingIdentity = id;
  }

  loadChunk(id: string) {
    return this.gateway.loadChunk(id);
  }

  loadInitialChunks() {
    return this.gateway.loadInitialChunks();
  }

  saveChunk(record: ChunkRecord) {
    return this.enqueueMutation('saveChunk', record).then((saved) => {
      if (saved) {
        const accepted = saved as ChunkRecord;
        record.version = accepted.version;
        record.savedAt = accepted.savedAt;
      }
    });
  }

  deleteChunk(id: string, expectedVersion?: number) {
    return this.enqueueMutation('deleteChunk', { id, expectedVersion }).then(() => undefined);
  }

  saveAsset(id: string, blob: Blob | string, type: string) {
    return this.enqueueMutation('saveAsset', { id, blob, type }).then(() => undefined);
  }

  loadAsset(id: string) {
    return this.gateway.loadAsset(id);
  }

  loadAllAssets() {
    return this.gateway.loadAllAssets();
  }

  saveEntity(state: EntityState) {
    return this.enqueueMutation('saveEntity', state).then(() => undefined);
  }

  loadAllEntities() {
    return this.gateway.loadAllEntities();
  }

  deleteEntity(id: string) {
    return this.enqueueMutation('deleteEntity', { id }).then(() => undefined);
  }

  async exportWorld(options?: { skipPendingWrites?: boolean }) {
    if (!options?.skipPendingWrites) await this.flush();
    return this.gateway.exportWorld();
  }

  importWorld(json: string) {
    const actorId = this.publishingIdentity;
    if (!actorId) return Promise.reject(new Error('Sign in before importing.'));
    const result = this.writeChain.then(async () => {
      if ((await this.queue.list()).length)
        throw new Error('Resolve pending changes before importing.');
      const plan = await prepareRemoteImport(json, actorId, (id) => this.gateway.loadChunk(id));
      if (this.publishingIdentity !== actorId)
        throw new Error('Account changed. Import cancelled before queuing.');
      await this.queue.putMany(plan.operations);
      await this.drainQueue();
      return plan.count;
    });
    this.writeChain = result.catch(() => undefined);
    return result;
  }

  async flush() {
    await this.scheduleDrain();
    if (this.lastError) throw this.lastError;
  }

  async retryPending() {
    this.lastError = null;
    await this.scheduleDrain();
  }

  async discardPending() {
    await this.writeChain.catch(() => undefined);
    const pending = await this.queue.list();
    await Promise.all(pending.map((mutation) => this.queue.delete(mutation.id)));
    this.lastError = null;
    this.setStatus('saved', 'Synced', 0);
  }

  getStatus() {
    return this.status;
  }

  subscribeStatus(listener: RepositoryStatusListener) {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private enqueueMutation(kind: StoredRemoteMutation['kind'], payload: unknown) {
    if (!this.publishingIdentity) return Promise.reject(new Error('Sign in before publishing.'));
    const mutation: StoredRemoteMutation = {
      actorId: this.publishingIdentity,
      id: crypto.randomUUID(),
      kind,
      payload: structuredClone(payload),
      createdAt: Date.now(),
      attempts: 0,
    };
    const result = this.writeChain.then(async () => {
      await this.queue.put(mutation);
      await this.refreshQueueStatus('saving', 'Syncing…');
      return this.drainQueue(mutation.id);
    });
    this.writeChain = result.catch(() => undefined);
    return result;
  }

  private scheduleDrain(targetId?: string) {
    const result = this.writeChain.then(() => this.drainQueue(targetId));
    this.writeChain = result.catch(() => undefined);
    return result;
  }

  private async drainQueue(targetId?: string): Promise<unknown> {
    const pending = await this.queue.list();
    if (pending.length === 0) {
      this.lastError = null;
      await this.refreshQueueStatus('saved', 'Synced');
      return undefined;
    }

    this.setStatus('saving', 'Syncing…', pending.length);
    let targetResult: unknown;

    for (const mutation of pending) {
      try {
        if (!this.publishingIdentity || mutation.actorId !== this.publishingIdentity) {
          throw Object.assign(
            new Error(
              'Sign in with the account that created these edits, or choose server state to discard them.',
            ),
            { code: 'IDENTITY_REQUIRED' },
          );
        }
        mutation.attempts += 1;
        await this.queue.put(mutation);
        const result = await this.applyMutation(mutation);
        await this.queue.delete(mutation.id);
        if (mutation.id === targetId) targetResult = result;
      } catch (reason) {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        this.lastError = error;
        const phase = this.classifyError(reason);
        if (phase === 'rejected') await this.queue.delete(mutation.id);
        const remaining = (await this.queue.list()).length;
        this.setStatus(
          phase,
          (reason as { code?: string }).code === 'IDENTITY_REQUIRED'
            ? error.message
            : this.messageForPhase(phase),
          remaining,
        );
        throw error;
      }
    }

    this.lastError = null;
    this.setStatus('saved', 'Synced', 0);
    return targetResult;
  }

  private async applyMutation(mutation: StoredRemoteMutation): Promise<unknown> {
    switch (mutation.kind) {
      case 'saveChunk':
        await this.gateway.saveChunk(
          mutation.payload as ChunkRecord,
          mutation.id,
          mutation.actorId,
        );
        return mutation.payload;
      case 'deleteChunk':
        return this.gateway.deleteChunk(
          (mutation.payload as { id: string; expectedVersion?: number }).id,
          (mutation.payload as { id: string; expectedVersion?: number }).expectedVersion,
          mutation.id,
          mutation.actorId,
        );
      case 'saveAsset': {
        const payload = mutation.payload as SaveAssetPayload;
        return this.gateway.saveAsset(
          payload.id,
          payload.blob,
          payload.type,
          mutation.id,
          mutation.actorId,
        );
      }
      case 'saveEntity':
        return this.gateway.saveEntity(
          mutation.payload as EntityState,
          mutation.id,
          mutation.actorId,
        );
      case 'deleteEntity':
        return this.gateway.deleteEntity(
          (mutation.payload as { id: string }).id,
          mutation.id,
          mutation.actorId,
        );
      case 'importWorld':
        return this.gateway.importWorld((mutation.payload as { json: string }).json, mutation.id);
    }
  }

  private classifyError(reason: unknown): RepositoryPhase {
    const candidate = reason as { status?: number; code?: string };
    if (candidate.status === 409 || candidate.code === 'CONFLICT') return 'conflict';
    if (candidate.status === 401 || candidate.status === 429) return 'retry';
    if (candidate.status && candidate.status >= 400 && candidate.status < 500) return 'rejected';
    return 'retry';
  }

  private messageForPhase(phase: RepositoryPhase) {
    if (phase === 'conflict') return 'Conflict — reload required';
    if (phase === 'rejected') return 'Change rejected';
    return 'Not synced — retry pending';
  }

  private async refreshQueueStatus(phase?: RepositoryPhase, message?: string) {
    try {
      const count = (await this.queue.list()).length;
      if (phase && message) this.setStatus(phase, message, count);
      else if (count > 0) this.setStatus('retry', 'Retry pending', count);
    } catch (reason) {
      this.lastError = reason instanceof Error ? reason : new Error(String(reason));
      this.setStatus('error', 'Queue unavailable', 0);
    }
  }

  private setStatus(phase: RepositoryPhase, message: string, pendingWrites: number) {
    this.status = {
      mode: this.mode,
      phase,
      pendingWrites,
      message,
      updatedAt: Date.now(),
    };
    for (const listener of this.listeners) listener(this.status);
  }
}
