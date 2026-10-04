import { describe, expect, it, vi } from 'vitest';
import { LocalRepositoryDriver, LocalWorldRepository } from './LocalWorldRepository';
import type { ChunkRecord } from './types';

function createDriver(overrides: Partial<LocalRepositoryDriver> = {}): LocalRepositoryDriver {
  return {
    loadChunkRecord: vi.fn(async () => null),
    loadAllChunkRecords: vi.fn(async () => []),
    saveChunkRecord: vi.fn(async () => undefined),
    deleteChunkRecord: vi.fn(async () => undefined),
    saveAsset: vi.fn(async () => undefined),
    loadAsset: vi.fn(async () => null),
    loadAllAssetRecords: vi.fn(async () => []),
    saveEntityState: vi.fn(async () => undefined),
    loadAllEntities: vi.fn(async () => []),
    deleteEntityState: vi.fn(async () => undefined),
    exportWorld: vi.fn(async () => '{}'),
    importWorld: vi.fn(async () => 0),
    ...overrides,
  };
}

const chunk: ChunkRecord = {
  id: '0,0',
  cx: 0,
  cy: 0,
  zone: 'static',
  layers: [new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)],
  savedAt: 1,
};

describe('LocalWorldRepository', () => {
  it('serializes writes and publishes status changes', async () => {
    const order: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const driver = createDriver({
      saveChunkRecord: vi.fn(async () => {
        order.push('chunk-start');
        await firstWrite;
        order.push('chunk-end');
      }),
      deleteChunkRecord: vi.fn(async () => {
        order.push('delete');
      }),
    });
    const repository = new LocalWorldRepository(driver);
    const phases: string[] = [];
    repository.subscribeStatus((status) => phases.push(status.phase));

    const save = repository.saveChunk(chunk);
    const remove = repository.deleteChunk(chunk.id);
    await Promise.resolve();
    expect(order).toEqual(['chunk-start']);

    releaseFirst?.();
    await Promise.all([save, remove]);

    expect(order).toEqual(['chunk-start', 'chunk-end', 'delete']);
    expect(repository.getStatus().phase).toBe('saved');
    expect(phases).toContain('saving');
  });

  it('waits for queued writes before exporting', async () => {
    const calls: string[] = [];
    const driver = createDriver({
      saveChunkRecord: vi.fn(async () => {
        calls.push('save');
      }),
      exportWorld: vi.fn(async () => {
        calls.push('export');
        return '{"ok":true}';
      }),
    });
    const repository = new LocalWorldRepository(driver);

    void repository.saveChunk(chunk);
    await expect(repository.exportWorld()).resolves.toBe('{"ok":true}');
    expect(calls).toEqual(['save', 'export']);
  });

  it('reports failed writes and recovers after a successful retry', async () => {
    const failure = new Error('quota exceeded');
    let attempts = 0;
    const driver = createDriver({
      saveChunkRecord: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw failure;
      }),
    });
    const repository = new LocalWorldRepository(driver);

    await expect(repository.saveChunk(chunk)).rejects.toThrow('quota exceeded');
    expect(repository.getStatus().phase).toBe('error');
    await expect(repository.flush()).rejects.toThrow('quota exceeded');

    await expect(repository.saveChunk(chunk)).resolves.toBeUndefined();
    expect(repository.getStatus().phase).toBe('saved');
    await expect(repository.flush()).resolves.toBeUndefined();
  });
});
