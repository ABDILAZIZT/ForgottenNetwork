import type { EntityState } from '../engine/Entity';
import type { RemoteWorldGateway } from './RemoteWorldRepository';
import type { AssetRecord, ChunkRecord } from './types';

const DEFAULT_WORLD_ID = '00000000-0000-4000-8000-000000000001';

interface GatewayOptions {
  baseUrl?: string;
  token?: string;
  worldId?: string;
}

interface ServerChunk {
  id: string;
  cx: number;
  cy: number;
  zone: string;
  layers: string[];
  version: number;
  savedAt: number;
}

interface ServerAsset {
  id: string;
  type: string;
  data: string;
  savedAt: number;
}

export class HttpGatewayError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpGatewayError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const batchSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += batchSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + batchSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) result[index] = binary.charCodeAt(index);
  return result;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function parseChunk(record: ServerChunk): ChunkRecord {
  return {
    id: record.id,
    cx: record.cx,
    cy: record.cy,
    zone: record.zone,
    layers: record.layers.map(base64ToBytes),
    savedAt: record.savedAt,
    version: record.version,
  };
}

export class HttpWorldGateway implements RemoteWorldGateway {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly worldId: string;

  constructor(options: GatewayOptions = {}) {
    this.baseUrl = (options.baseUrl || '/api/v1').replace(/\/$/, '');
    this.token = options.token || '';
    this.worldId = options.worldId || DEFAULT_WORLD_ID;
  }

  async loadChunk(id: string) {
    const [cx, cy] = id.split(',').map(Number);
    const response = await this.request<ServerChunk | undefined>(
      `/worlds/${this.worldId}/chunks/${cx}/${cy}`,
    );
    return response ? parseChunk(response) : null;
  }

  async loadInitialChunks() {
    const response = await this.request<{ chunks: ServerChunk[] }>(
      `/worlds/${this.worldId}/chunks?minChunkX=-6&minChunkY=-6&maxChunkX=6&maxChunkY=6`,
    );
    return response.chunks.map(parseChunk);
  }

  async saveChunk(record: ChunkRecord, operationId: string, actorId?: string) {
    const response = await this.request<{ chunk: ServerChunk }>(
      `/worlds/${this.worldId}/chunks/${record.cx}/${record.cy}`,
      {
        method: 'PUT',
        headers: actorId ? { 'X-Publishing-Actor': actorId } : {},
        body: JSON.stringify({
          operationId,
          expectedVersion: record.version ?? 0,
          zone: record.zone,
          layers: record.layers.map(bytesToBase64),
        }),
      },
    );
    record.version = response.chunk.version;
    record.savedAt = response.chunk.savedAt;
  }

  async deleteChunk(
    id: string,
    expectedVersion: number | undefined,
    operationId: string,
    actorId?: string,
  ) {
    const [cx, cy] = id.split(',').map(Number);
    await this.request(`/worlds/${this.worldId}/chunks/${cx}/${cy}`, {
      method: 'DELETE',
      headers: {
        ...(actorId ? { 'X-Publishing-Actor': actorId } : {}),
        'Idempotency-Key': operationId,
        'If-Match-Version': String(expectedVersion ?? 0),
      },
    });
  }

  async saveAsset(
    id: string,
    blob: Blob | string,
    type: string,
    operationId: string,
    actorId?: string,
  ) {
    const data = typeof blob === 'string' ? blob : await blobToDataUrl(blob);
    await this.request(`/worlds/${this.worldId}/assets/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: actorId ? { 'X-Publishing-Actor': actorId } : {},
      body: JSON.stringify({ operationId, type, data }),
    });
  }

  async loadAsset(id: string) {
    try {
      const asset = await this.request<ServerAsset>(
        `/worlds/${this.worldId}/assets/${encodeURIComponent(id)}`,
      );
      return { id: asset.id, blob: asset.data, type: asset.type, savedAt: asset.savedAt };
    } catch (error) {
      if (error instanceof HttpGatewayError && error.status === 404) return null;
      throw error;
    }
  }

  async loadAllAssets() {
    const response = await this.request<{ assets: ServerAsset[] }>(
      `/worlds/${this.worldId}/assets`,
    );
    return response.assets.map<AssetRecord>((asset) => ({
      id: asset.id,
      blob: asset.data,
      type: asset.type,
      savedAt: asset.savedAt,
    }));
  }

  async saveEntity(state: EntityState, operationId: string, actorId?: string) {
    await this.request(`/worlds/${this.worldId}/entities/${encodeURIComponent(state.id)}`, {
      method: 'PUT',
      headers: actorId ? { 'X-Publishing-Actor': actorId } : {},
      body: JSON.stringify({ operationId, state }),
    });
  }

  async loadAllEntities() {
    const response = await this.request<{ entities: EntityState[] }>(
      `/worlds/${this.worldId}/entities`,
    );
    return response.entities;
  }

  async deleteEntity(id: string, operationId: string, actorId?: string) {
    await this.request(`/worlds/${this.worldId}/entities/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'Idempotency-Key': operationId,
        ...(actorId ? { 'X-Publishing-Actor': actorId } : {}),
      },
    });
  }

  async exportWorld() {
    const [chunkResponse, entities] = await Promise.all([
      this.request<{ chunks: ServerChunk[] }>(`/worlds/${this.worldId}/chunks?all=true`),
      this.loadAllEntities(),
    ]);
    const assetIds = new Set<string>();
    for (const entity of entities) {
      const references = [
        entity.spriteUrl,
        ...(entity.frames || []),
        ...(entity.layers || []).map((layer) => layer.url),
      ];
      for (const reference of references) {
        if (reference?.startsWith('asset:')) assetIds.add(reference.slice(6));
      }
    }
    const assets = [];
    for (const id of assetIds) {
      const asset = await this.loadAsset(id);
      if (!asset) throw new Error(`World asset ${id} is unavailable`);
      assets.push(asset);
    }
    return JSON.stringify({
      version: 4,
      exportedAt: new Date().toISOString(),
      chunks: chunkResponse.chunks.map((record) => ({
        ...parseChunk(record),
        layers: record.layers.map((layer) => Array.from(base64ToBytes(layer))),
      })),
      entities,
      assets: assets.map((asset) => ({ ...asset, blob: asset.blob })),
    });
  }

  async importWorld(json: string, _operationId: string) {
    const parsed = JSON.parse(json) as {
      chunks?: Array<Omit<ChunkRecord, 'layers'> & { layers: number[][] }>;
      entities?: EntityState[];
      assets?: Array<AssetRecord & { blob: string }>;
    };
    if (!Array.isArray(parsed.chunks)) throw new Error('World file has no chunks');

    for (const asset of parsed.assets || []) {
      await this.saveAsset(asset.id, asset.blob, asset.type, crypto.randomUUID());
    }
    for (const entity of parsed.entities || []) {
      await this.saveEntity(entity, crypto.randomUUID());
    }
    for (const chunk of parsed.chunks) {
      const current = await this.loadChunk(chunk.id);
      await this.saveChunk(
        {
          ...chunk,
          layers: chunk.layers.map((layer) => new Uint8Array(layer)),
          version: current?.version ?? 0,
        },
        crypto.randomUUID(),
      );
    }
    return parsed.chunks.length;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: AbortSignal.timeout(30000),
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...options.headers,
        },
      });
    } catch (reason) {
      throw new HttpGatewayError(0, 'NETWORK_ERROR', 'The world server is unreachable.', reason);
    }

    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (!response.ok) {
      throw new HttpGatewayError(
        response.status,
        body.error?.code || 'HTTP_ERROR',
        body.error?.message || `Request failed with status ${response.status}`,
        body.error?.details,
      );
    }
    return body as T;
  }
}
