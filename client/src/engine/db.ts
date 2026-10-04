/**
 * db.ts — IndexedDB helper for Forgotten Network
 *
 * Replaces localStorage with a proper async KV store.
 * Chunks are stored as raw Uint8Array blobs (fast, compact, no base64).
 *
 * Store layout:
 *   DB: "forgotten-network"  version: 2
 *   Object store: "chunks"   keyPath: "id"
 *     { id: "cx,cy", cx, cy, zone, layers: [Uint8Array x3], savedAt }
 */

import type { AssetRecord, ChunkRecord } from '../repositories/types';
import type { EntityState } from './Entity';

const DB_NAME = 'forgotten-network';
const DB_VERSION = 4;
const STORE_CHUNKS = 'chunks';
const STORE_ASSETS = 'assets';
const STORE_ENTITIES = 'entities';
const STORE_REMOTE_MUTATIONS = 'remote-mutations';

export interface StoredRemoteMutation {
  actorId?: string;
  id: string;
  kind: 'saveChunk' | 'deleteChunk' | 'saveAsset' | 'saveEntity' | 'deleteEntity' | 'importWorld';
  payload: unknown;
  createdAt: number;
  attempts: number;
}

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ENTITIES)) {
        db.createObjectStore(STORE_ENTITIES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_REMOTE_MUTATIONS)) {
        db.createObjectStore(STORE_REMOTE_MUTATIONS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putRemoteMutation(mutation: StoredRemoteMutation): Promise<void> {
  return putRemoteMutations([mutation]);
}

export async function putRemoteMutations(mutations: StoredRemoteMutation[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REMOTE_MUTATIONS, 'readwrite');
    for (const mutation of mutations) tx.objectStore(STORE_REMOTE_MUTATIONS).put(mutation);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadRemoteMutations(): Promise<StoredRemoteMutation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REMOTE_MUTATIONS, 'readonly');
    const request = tx.objectStore(STORE_REMOTE_MUTATIONS).getAll();
    request.onsuccess = () =>
      resolve((request.result as StoredRemoteMutation[]).sort((a, b) => a.createdAt - b.createdAt));
    request.onerror = () => reject(request.error);
  });
}

export async function deleteRemoteMutation(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_REMOTE_MUTATIONS, 'readwrite');
    tx.objectStore(STORE_REMOTE_MUTATIONS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Chunks
export async function saveChunkRecord(record: ChunkRecord): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readwrite');
    tx.objectStore(STORE_CHUNKS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadChunkRecord(id: string): Promise<ChunkRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readonly');
    const req = tx.objectStore(STORE_CHUNKS).get(id);
    req.onsuccess = () => resolve((req.result as ChunkRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAllChunkRecords(): Promise<ChunkRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readonly');
    const req = tx.objectStore(STORE_CHUNKS).getAll();
    req.onsuccess = () => resolve(req.result as ChunkRecord[]);
    req.onerror = () => reject(req.error);
  });
}

// Assets
export async function saveAsset(id: string, blob: Blob | string, type: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ASSETS, 'readwrite');
    tx.objectStore(STORE_ASSETS).put({ id, blob, type, savedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAsset(id: string): Promise<AssetRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ASSETS, 'readonly');
    const req = tx.objectStore(STORE_ASSETS).get(id);
    req.onsuccess = () => resolve((req.result as AssetRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAllAssetRecords(): Promise<AssetRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ASSETS, 'readonly');
    const req = tx.objectStore(STORE_ASSETS).getAll();
    req.onsuccess = () => resolve(req.result as AssetRecord[]);
    req.onerror = () => reject(req.error);
  });
}

// Entities
export async function saveEntityState(state: EntityState): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTITIES, 'readwrite');
    tx.objectStore(STORE_ENTITIES).put(state);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAllEntities(): Promise<EntityState[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTITIES, 'readonly');
    const req = tx.objectStore(STORE_ENTITIES).getAll();
    req.onsuccess = () => resolve((req.result as EntityState[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteEntityState(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTITIES, 'readwrite');
    tx.objectStore(STORE_ENTITIES).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Export the complete local world, including uploaded media, as JSON. */
export async function exportWorld(): Promise<string> {
  const records = await loadAllChunkRecords();
  const entities = await loadAllEntities();
  const assets = await loadAllAssetRecords();

  const serialisable = records.map((r) => ({
    ...r,
    layers: r.layers.map((l) => Array.from(l)),
  }));
  const serialisableAssets = await Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      blob: typeof asset.blob === 'string' ? asset.blob : await blobToDataUrl(asset.blob),
    })),
  );

  return JSON.stringify({
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    chunks: serialisable,
    entities,
    assets: serialisableAssets,
  });
}

export async function deleteChunkRecord(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readwrite');
    tx.objectStore(STORE_CHUNKS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllChunks(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readwrite');
    tx.objectStore(STORE_CHUNKS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearWorldStores(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CHUNKS, STORE_ENTITIES, STORE_ASSETS], 'readwrite');
    tx.objectStore(STORE_CHUNKS).clear();
    tx.objectStore(STORE_ENTITIES).clear();
    tx.objectStore(STORE_ASSETS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

interface ExportChunkRecord extends Omit<ChunkRecord, 'layers'> {
  layers: number[][];
}

interface ExportAssetRecord extends Omit<AssetRecord, 'blob'> {
  blob: string;
}

interface WorldExport {
  version: number;
  chunks: ExportChunkRecord[];
  entities?: EntityState[];
  assets?: ExportAssetRecord[];
}

function parseWorldExport(json: string): WorldExport {
  const data: unknown = JSON.parse(json);
  if (!data || typeof data !== 'object') throw new Error('World file must be an object');

  const candidate = data as Partial<WorldExport>;
  if (typeof candidate.version !== 'number' || !Array.isArray(candidate.chunks)) {
    throw new Error('World file is missing a version or chunk list');
  }
  if (candidate.entities !== undefined && !Array.isArray(candidate.entities)) {
    throw new Error('World entity list is invalid');
  }
  if (candidate.assets !== undefined && !Array.isArray(candidate.assets)) {
    throw new Error('World asset list is invalid');
  }

  for (const chunk of candidate.chunks) {
    if (
      !chunk ||
      typeof chunk.id !== 'string' ||
      !Number.isFinite(chunk.cx) ||
      !Number.isFinite(chunk.cy) ||
      !Array.isArray(chunk.layers) ||
      chunk.layers.some((layer) => !Array.isArray(layer))
    ) {
      throw new Error('World contains an invalid chunk');
    }
  }

  return candidate as WorldExport;
}

/** Import a world from a JSON string (replaces current world). */
export async function importWorld(json: string): Promise<number> {
  const data = parseWorldExport(json);
  await clearWorldStores();

  let count = 0;
  for (const c of data.chunks) {
    const record: ChunkRecord = {
      id: c.id,
      cx: c.cx,
      cy: c.cy,
      zone: c.zone,
      layers: (c.layers as number[][]).map((l) => new Uint8Array(l)),
      savedAt: c.savedAt ?? Date.now(),
    };
    await saveChunkRecord(record);
    count++;
  }

  if (data.entities) {
    for (const ent of data.entities) {
      await saveEntityState(ent);
    }
  }

  if (data.assets) {
    for (const asset of data.assets) {
      if (!asset || typeof asset.id !== 'string' || typeof asset.blob !== 'string') continue;
      await saveAsset(asset.id, asset.blob, asset.type || 'application/octet-stream');
    }
  }

  return count;
}
