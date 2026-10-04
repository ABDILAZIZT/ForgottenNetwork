import { describe, expect, it, vi } from 'vitest';
import { RemoteWorldRepository } from './RemoteWorldRepository';
import type { RemoteWorldGateway } from './RemoteWorldRepository';
import { MemoryRemoteMutationQueue } from './RemoteMutationQueue';
import type { ChunkRecord } from './types';

function createGateway(overrides: Partial<RemoteWorldGateway> = {}): RemoteWorldGateway {
  return {
    loadChunk: vi.fn(async () => null),
    loadInitialChunks: vi.fn(async () => []),
    saveChunk: vi.fn(async () => undefined),
    deleteChunk: vi.fn(async () => undefined),
    saveAsset: vi.fn(async () => undefined),
    loadAsset: vi.fn(async () => null),
    loadAllAssets: vi.fn(async () => []),
    saveEntity: vi.fn(async () => undefined),
    loadAllEntities: vi.fn(async () => []),
    deleteEntity: vi.fn(async () => undefined),
    exportWorld: vi.fn(async () => '{}'),
    importWorld: vi.fn(async () => 0),
    ...overrides,
  };
}

const chunk: ChunkRecord = {
  id: '1,2',
  cx: 1,
  cy: 2,
  zone: 'living',
  layers: [new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)],
  savedAt: 1,
};

describe('RemoteWorldRepository', () => {
  it('visitor export leaves pending edits untouched and sends no writes', async () => {
    const queue = new MemoryRemoteMutationQueue();
    await queue.put({
      id: 'pending',
      kind: 'saveChunk',
      payload: chunk,
      createdAt: 1,
      attempts: 0,
    });
    const gateway = createGateway();
    const repository = new RemoteWorldRepository(gateway, queue);
    await repository.exportWorld({ skipPendingWrites: true });
    expect(gateway.saveChunk).not.toHaveBeenCalled();
    expect(await queue.list()).toHaveLength(1);
    expect(gateway.exportWorld).toHaveBeenCalledOnce();
  });
  it('queues gateway mutations and reports sync completion', async () => {
    const calls: string[] = [];
    const gateway = createGateway({
      saveChunk: vi.fn(async () => {
        calls.push('save');
      }),
      deleteChunk: vi.fn(async () => {
        calls.push('delete');
      }),
    });
    const repository = new RemoteWorldRepository(gateway);
    repository.setPublishingIdentity('member');

    await Promise.all([repository.saveChunk(chunk), repository.deleteChunk(chunk.id)]);

    expect(calls).toEqual(['save', 'delete']);
    expect(repository.getStatus()).toMatchObject({
      mode: 'remote',
      phase: 'saved',
      pendingWrites: 0,
      message: 'Synced',
    });
  });

  it('keeps failed synchronization durable until retry succeeds', async () => {
    let offline = true;
    const queue = new MemoryRemoteMutationQueue();
    const repository = new RemoteWorldRepository(
      createGateway({
        saveChunk: vi.fn(async () => {
          if (offline) throw new Error('offline');
        }),
      }),
      queue,
    );

    repository.setPublishingIdentity('member');
    await expect(repository.saveChunk(chunk)).rejects.toThrow('offline');
    expect(repository.getStatus().phase).toBe('retry');
    expect(await queue.list()).toHaveLength(1);
    await expect(repository.flush()).rejects.toThrow('offline');

    offline = false;
    await expect(repository.retryPending()).resolves.toBeUndefined();
    expect(await queue.list()).toHaveLength(0);
    expect(repository.getStatus().phase).toBe('saved');
  });

  it('retains conflicts until the user chooses server state', async () => {
    const conflict = Object.assign(new Error('stale chunk'), { status: 409, code: 'CONFLICT' });
    const queue = new MemoryRemoteMutationQueue();
    const repository = new RemoteWorldRepository(
      createGateway({ saveChunk: vi.fn(async () => Promise.reject(conflict)) }),
      queue,
    );

    repository.setPublishingIdentity('member');
    await expect(repository.saveChunk(chunk)).rejects.toThrow('stale chunk');
    expect(repository.getStatus().phase).toBe('conflict');
    expect(await queue.list()).toHaveLength(1);

    await repository.discardPending();
    expect(await queue.list()).toHaveLength(0);
    expect(repository.getStatus().phase).toBe('saved');
  });
});

it('copies queued snapshots and returns the server revision to the caller', async () => {
  const source = { ...chunk, version: 0, layers: chunk.layers.map((layer) => layer.slice()) };
  const repository = new RemoteWorldRepository(
    createGateway({
      saveChunk: vi.fn(async (record) => {
        expect(record).not.toBe(source);
        record.version = 1;
        record.savedAt = 123;
      }),
    }),
  );
  repository.setPublishingIdentity('member');
  await repository.saveChunk(source);
  expect(source.version).toBe(1);
  expect(source.savedAt).toBe(123);
});

it('never retries one account’s pending edits under another account', async () => {
  const queue = new MemoryRemoteMutationQueue();
  await queue.put({
    id: 'old',
    actorId: 'alice',
    kind: 'saveChunk',
    payload: chunk,
    createdAt: 1,
    attempts: 0,
  });
  const gateway = createGateway();
  const repository = new RemoteWorldRepository(gateway, queue);
  repository.setPublishingIdentity('bob');
  await expect(repository.retryPending()).rejects.toThrow('account');
  expect(gateway.saveChunk).not.toHaveBeenCalled();
  expect(await queue.list()).toHaveLength(1);
  repository.setPublishingIdentity('alice');
  await repository.retryPending();
  expect(gateway.saveChunk).toHaveBeenCalledOnce();
});

it.each([401, 429])('retains a write after HTTP %i for a deliberate retry', async (status) => {
  const queue = new MemoryRemoteMutationQueue();
  const repository = new RemoteWorldRepository(
    createGateway({
      saveChunk: async () => {
        throw Object.assign(new Error('wait'), { status });
      },
    }),
    queue,
  );
  repository.setPublishingIdentity('member');
  await expect(repository.saveChunk(chunk)).rejects.toThrow('wait');
  expect(await queue.list()).toHaveLength(1);
  expect(repository.getStatus().phase).toBe('retry');
});

it('resumes an interrupted import without duplicating uploaded media', async () => {
  let offline = true;
  const gateway = createGateway({
    saveEntity: vi.fn(async () => {
      if (offline) throw new Error('offline');
    }),
  });
  const queue = new MemoryRemoteMutationQueue();
  const repository = new RemoteWorldRepository(gateway, queue);
  repository.setPublishingIdentity('member');
  const data = JSON.stringify({
    chunks: [],
    assets: [{ id: 'picture', type: 'image/png', blob: 'data:image/png;base64,YQ==' }],
    entities: [
      {
        id: 'old',
        type: 'uploaded_custom',
        wx: 0,
        wy: 0,
        createdAt: 1,
        spriteUrl: 'asset:picture',
      },
    ],
  });
  await expect(repository.importWorld(data)).rejects.toThrow('offline');
  expect(gateway.saveAsset).toHaveBeenCalledOnce();
  expect(await queue.list()).toHaveLength(1);
  const [id] = vi.mocked(gateway.saveAsset).mock.calls[0];
  const state = vi.mocked(gateway.saveEntity).mock.calls[0][0];
  expect(state.id).not.toBe('old');
  expect(state.spriteUrl).toBe(`asset:${id}`);
  offline = false;
  await repository.retryPending();
  expect(gateway.saveAsset).toHaveBeenCalledOnce();
  expect(await queue.list()).toHaveLength(0);
  expect(vi.mocked(gateway.saveEntity).mock.calls[1][1]).toBe(
    vi.mocked(gateway.saveEntity).mock.calls[0][1],
  );
});

it('validates the import before saving assets or entities', async () => {
  const gateway = createGateway();
  const repository = new RemoteWorldRepository(gateway);
  repository.setPublishingIdentity('member');
  await expect(
    repository.importWorld(
      JSON.stringify({
        chunks: [],
        entities: [
          {
            id: 'old',
            type: 'uploaded_custom',
            wx: 0,
            wy: 0,
            spriteUrl: 'https://remote.example/image.png',
          },
        ],
      }),
    ),
  ).rejects.toThrow('included');
  expect(gateway.saveAsset).not.toHaveBeenCalled();
  expect(gateway.saveEntity).not.toHaveBeenCalled();
});
