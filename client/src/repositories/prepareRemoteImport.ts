import type { EntityState } from '../engine/Entity';
import type { StoredRemoteMutation } from '../engine/db';
import type { ChunkRecord } from './types';

/** Additive import: new media/entity IDs; fixed expected chunk versions; durable per-item retries. */
export async function prepareRemoteImport(
  json: string,
  actorId: string,
  loadChunk: (id: string) => Promise<ChunkRecord | null>,
) {
  if (json.length > 32 * 1024 * 1024) throw new Error('Import is limited to 32 MB.');
  const data = JSON.parse(json) as {
    chunks?: Array<ChunkRecord & { layers: number[][] }>;
    assets?: Array<{ id: string; blob: string; type: string }>;
    entities?: EntityState[];
  };
  if (
    !data ||
    !Array.isArray(data.chunks) ||
    data.chunks.length > 100 ||
    (data.assets !== undefined && !Array.isArray(data.assets)) ||
    (data.entities !== undefined && !Array.isArray(data.entities)) ||
    (data.assets?.length || 0) > 30 ||
    (data.entities?.length || 0) > 100
  )
    throw new Error('Invalid or oversized import (100 chunks, 100 entities, 30 assets maximum).');
  const ids = new Map<string, string>();
  for (const asset of data.assets || []) {
    if (
      !asset ||
      typeof asset.id !== 'string' ||
      ids.has(asset.id) ||
      typeof asset.blob !== 'string' ||
      !asset.blob.startsWith('data:image/') ||
      typeof asset.type !== 'string'
    )
      throw new Error('Invalid or duplicate import asset.');
    ids.set(asset.id, `import_${crypto.randomUUID()}`);
  }
  const reference = (url: string | undefined) => {
    if (!url) return url;
    const mapped = url.startsWith('asset:') && ids.get(url.slice(6));
    if (!mapped) throw new Error('Every imported image must be included in the file.');
    return `asset:${mapped}`;
  };
  const entities = (data.entities || []).map((entity) => {
    if (
      !entity ||
      typeof entity.id !== 'string' ||
      !Number.isFinite(entity.wx) ||
      !Number.isFinite(entity.wy) ||
      typeof entity.type !== 'string'
    )
      throw new Error('Invalid imported entity.');
    return {
      ...entity,
      id: `import_${crypto.randomUUID()}`,
      creatorId: undefined,
      creatorName: undefined,
      spriteUrl: reference(entity.spriteUrl),
      frames: entity.frames?.map(reference),
      layers: entity.layers?.map((layer) => ({ ...layer, url: reference(layer.url) })),
    };
  });
  const seen = new Set<string>();
  for (const chunk of data.chunks) {
    if (
      !chunk ||
      !Number.isSafeInteger(chunk.cx) ||
      !Number.isSafeInteger(chunk.cy) ||
      chunk.id !== `${chunk.cx},${chunk.cy}` ||
      seen.has(chunk.id) ||
      !Array.isArray(chunk.layers) ||
      chunk.layers.length !== 3 ||
      chunk.layers.some(
        (layer) =>
          !Array.isArray(layer) ||
          layer.length !== 65536 ||
          layer.some((n) => !Number.isInteger(n) || n < 0 || n > 255),
      )
    )
      throw new Error('Invalid or duplicate imported chunk.');
    seen.add(chunk.id);
  }
  const operations: StoredRemoteMutation[] = [];
  const add = (kind: StoredRemoteMutation['kind'], payload: unknown) =>
    operations.push({
      id: crypto.randomUUID(),
      actorId,
      kind,
      payload,
      createdAt: Date.now() + operations.length,
      attempts: 0,
    });
  for (const asset of data.assets || []) add('saveAsset', { ...asset, id: ids.get(asset.id) });
  for (const state of entities) add('saveEntity', state);
  for (const chunk of data.chunks) {
    const current = await loadChunk(chunk.id);
    add('saveChunk', {
      ...chunk,
      layers: chunk.layers.map((layer) => new Uint8Array(layer)),
      version: current?.version || 0,
    });
  }
  return { operations, count: data.chunks.length };
}
