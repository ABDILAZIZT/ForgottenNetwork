import { Entity, EntityState, EntityType } from './Entity';
import { Camera } from './Camera';
import { GifDecoder, GifFrame } from './GifDecoder';
import type { WorldRepository } from '../repositories';

export class EntityManager {
  private entities = new Map<string, Entity>();
  private gifCache = new Map<string, GifFrame[]>();
  private gifPromiseCache = new Map<string, Promise<GifFrame[]>>();
  private assetUrlCache = new Map<string, string>();
  private assetPromiseCache = new Map<string, Promise<string>>();
  private getChunk: (cx: number, cy: number) => any;
  private repository: WorldRepository;
  private disposed = false;

  constructor(repository: WorldRepository, getChunk: (cx: number, cy: number) => any) {
    this.repository = repository;
    this.getChunk = getChunk;
    void this.init().catch((error) => {
      if (!this.disposed) console.error('Failed to initialize entities:', error);
    });
  }

  private async init() {
    await this.loadEntities();
    if (this.disposed) return;

    if (this.entities.size === 0 && this.repository.mode === 'local') {
      await this.spawnInitialEntities();
    }
  }

  private async spawnInitialEntities() {
    // Initial entities spawn here
    await this.spawnEntity('wandering_creature', 0, 0, '#00ffcc', undefined, {
      id: 'system_first_resident',
      layers: [
        { name: 'body', color: '#00ccaa', scale: 1.2, breathing: true },
        { name: 'head', color: '#00ffcc', offsetY: -12, bobbing: true },
        { name: 'eyes', color: '#000000', offsetY: -14, scale: 0.2 },
      ],
      vfx: { glow: true },
    });
  }

  public async resolveAssetUrl(url: string): Promise<string> {
    if (!url || !url.startsWith('asset:')) return url;

    if (this.assetUrlCache.has(url)) {
      return this.assetUrlCache.get(url)!;
    }

    if (this.assetPromiseCache.has(url)) {
      return this.assetPromiseCache.get(url)!;
    }

    const promise = (async () => {
      const assetId = url.replace('asset:', '');
      try {
        const asset = await this.repository.loadAsset(assetId);
        if (asset) {
          const resolved =
            typeof asset.blob === 'string' ? asset.blob : URL.createObjectURL(asset.blob);
          this.assetUrlCache.set(url, resolved);
          return resolved;
        }
      } catch (e) {
        console.error('Failed to resolve asset:', url, e);
      } finally {
        this.assetPromiseCache.delete(url);
      }
      return url;
    })();

    this.assetPromiseCache.set(url, promise);
    return promise;
  }

  async spawnEntity(
    type: EntityType,
    wx: number,
    wy: number,
    color: string,
    text?: string,
    data?: Partial<EntityState>,
  ) {
    const id = data?.id || `ent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const state: EntityState = {
      id,
      type,
      wx,
      wy,
      color,
      text,
      createdAt: Date.now(),
      ...data,
    };

    // Create a copy for persistence with original asset URLs
    const persistentState = { ...state };

    // 1. Create and add entity IMMEDIATELY for visual feedback
    const entity = new Entity(state);
    this.entities.set(id, entity);

    // 2. Save to DB before reporting success, so refreshes keep placed media.
    try {
      await this.repository.saveEntity(persistentState);
    } catch (err) {
      this.entities.delete(id);
      throw err;
    }

    // 3. Trigger background loading/resolution
    (async () => {
      try {
        // Resolve layers if they exist
        if (state.layers && state.layers.length > 0) {
          const resolvedLayers = await Promise.all(
            state.layers.map(async (l) => ({
              ...l,
              url: l.url ? await this.resolveAssetUrl(l.url) : undefined,
            })),
          );
          entity.layers = resolvedLayers;
        }
        // Or resolve spriteUrl and update the default 'main' layer
        else if (state.spriteUrl) {
          const resolvedUrl = await this.resolveAssetUrl(state.spriteUrl);
          entity.spriteUrl = resolvedUrl;
          if (
            entity.layers.length > 0 &&
            (entity.layers[0].name === 'main' || entity.layers[0].name === 'body')
          ) {
            entity.layers[0].url = resolvedUrl;
          }
        }

        // Trigger loading/decoding
        if (type === 'gif_entity' || state.type === 'gif_entity' || type === 'animated_sign') {
          if (entity.spriteUrl) {
            await this.loadGifForEntity(entity, entity.spriteUrl);
          }
        } else {
          entity.loadLayers();
        }
      } catch (err) {
        console.error('Background asset resolution failed', err);
      }
    })();

    return entity;
  }

  private async loadGifForEntity(entity: Entity, url: string) {
    const actualUrl = await this.resolveAssetUrl(url);
    await this._decodeAndCacheGif(actualUrl, entity);
  }

  private async _decodeAndCacheGif(url: string, entity: Entity) {
    if (this.gifCache.has(url)) {
      entity.setGifFrames(this.gifCache.get(url)!);
      return;
    }

    if (this.gifPromiseCache.has(url)) {
      const frames = await this.gifPromiseCache.get(url)!;
      entity.setGifFrames(frames);
      return;
    }

    const promise = (async () => {
      try {
        // Double check it's not a generic asset string
        if (url.startsWith('asset:')) {
          const resolved = await this.resolveAssetUrl(url);
          if (resolved === url) return []; // Failed to resolve
          url = resolved;
        }

        const frames = await GifDecoder.decode(url);
        if (frames && frames.length > 0) {
          this.gifCache.set(url, frames);
          return frames;
        }
      } catch (e) {
        console.error('Failed to load GIF', e);
      } finally {
        this.gifPromiseCache.delete(url);
      }
      return [];
    })();

    this.gifPromiseCache.set(url, promise);
    const frames = await promise;
    entity.setGifFrames(frames);
  }

  async removeEntity(id: string) {
    this.entities.delete(id);
    await this.repository.deleteEntity(id);
  }

  async removeEntityAt(wx: number, wy: number) {
    let targetId: string | null = null;
    const entitiesArray = Array.from(this.entities.entries()).reverse();

    for (const [id, entity] of entitiesArray) {
      const { left, right, top, bottom } = entity.getBounds(8);

      if (wx >= left && wx <= right && wy >= top && wy <= bottom) {
        targetId = id;
        break;
      }
    }

    if (targetId) {
      await this.removeEntity(targetId);
      return true;
    }
    return false;
  }

  getEntities() {
    return Array.from(this.entities.values());
  }

  dispose() {
    this.disposed = true;
    for (const url of this.assetUrlCache.values()) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
    this.assetUrlCache.clear();
    this.assetPromiseCache.clear();
  }

  update(dt: number, time: number) {
    for (const entity of this.entities.values()) {
      entity.update(dt, time, this.getChunk);
    }
  }

  render(ctx: CanvasRenderingContext2D, camera: Camera, W: number, H: number, time: number) {
    const sorted = Array.from(this.entities.values()).sort((a, b) => a.wy - b.wy);
    for (const entity of sorted) {
      entity.draw(ctx, camera, W, H, time);
    }
  }

  private async loadEntities() {
    const states = await this.repository.loadAllEntities();
    for (const state of states) {
      if (this.disposed) return;
      const entity = new Entity(state);
      this.entities.set(state.id, entity);

      // Resolve assets in background
      void (async () => {
        if (state.layers) {
          for (const layer of state.layers) {
            if (layer.url?.startsWith('asset:')) {
              layer.url = await this.resolveAssetUrl(layer.url);
            }
          }
          if (this.disposed) return;
          entity.layers = state.layers;
          entity.loadLayers();
        }

        if (state.spriteUrl) {
          const resolvedUrl = await this.resolveAssetUrl(state.spriteUrl);
          if (this.disposed) return;
          entity.spriteUrl = resolvedUrl;
          if (
            entity.layers.length > 0 &&
            (entity.layers[0].name === 'main' || entity.layers[0].name === 'body')
          ) {
            entity.layers[0].url = resolvedUrl;
          }

          if (state.type === 'gif_entity' || state.type === 'animated_sign') {
            await this.loadGifForEntity(entity, resolvedUrl);
          } else {
            entity.loadLayers();
          }
        }
      })().catch((error) => {
        if (!this.disposed) console.warn('Failed to resolve entity assets', error);
      });
    }
  }
}
