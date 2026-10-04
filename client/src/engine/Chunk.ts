/**
 * Chunk — a 128×128 pixel tile of the world.
 * 3 drawing layers composited bottom-to-top via Porter-Duff "over".
 * Off-screen canvas cache: rendering is always a single drawImage call.
 */

export const CHUNK_PX = 128;
export const NUM_LAYERS = 3; // 0=background  1=main  2=overlay

export type ZoneType = 'static' | 'living';

type Layer = Uint8ClampedArray; // RGBA, 4 bytes per pixel

export class Chunk {
  public readonly id: string;
  public readonly cx: number;
  public readonly cy: number;
  public zoneType: ZoneType;
  public version = 0;

  private layers: Layer[];
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private dirty = false;

  constructor(cx: number, cy: number, zoneType: ZoneType = 'static') {
    this.id = `${cx},${cy}`;
    this.cx = cx;
    this.cy = cy;
    this.zoneType = zoneType;

    this.layers = Array.from(
      { length: NUM_LAYERS },
      () => new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4),
    );
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = CHUNK_PX;
    this.offscreen.height = CHUNK_PX;
    const ctx = this.offscreen.getContext('2d');
    if (!ctx) throw new Error('offscreen canvas context failed');
    this.offCtx = ctx;
  }

  // ─── Pixel ops ───────────────────────────────────────────────────────────

  setPixel(px: number, py: number, layer: number, r: number, g: number, b: number, a = 255) {
    if (px < 0 || px >= CHUNK_PX || py < 0 || py >= CHUNK_PX) return;
    if (layer < 0 || layer >= NUM_LAYERS) return;
    const idx = (py * CHUNK_PX + px) * 4;
    this.layers[layer][idx] = r;
    this.layers[layer][idx + 1] = g;
    this.layers[layer][idx + 2] = b;
    this.layers[layer][idx + 3] = a;
    this.dirty = true;
  }

  getPixel(px: number, py: number, layer: number): [number, number, number, number] {
    if (px < 0 || px >= CHUNK_PX || py < 0 || py >= CHUNK_PX) return [0, 0, 0, 0];
    const idx = (py * CHUNK_PX + px) * 4;
    const l = this.layers[layer];
    return [l[idx], l[idx + 1], l[idx + 2], l[idx + 3]];
  }

  isSolid(px: number, py: number): boolean {
    if (px < 0 || px >= CHUNK_PX || py < 0 || py >= CHUNK_PX) return false;
    const idx = (py * CHUNK_PX + px) * 4;
    // Check main layer (1) alpha
    return this.layers[1][idx + 3] > 128;
  }

  isEmpty(): boolean {
    for (const layer of this.layers) {
      for (let i = 3; i < layer.length; i += 4) {
        if (layer[i] > 0) return false;
      }
    }
    return true;
  }

  // ─── Undo helpers ────────────────────────────────────────────────────────

  /** Returns a copy of the layer data (for undo snapshot). */
  snapshotLayer(layer: number): Uint8ClampedArray {
    return new Uint8ClampedArray(this.layers[layer]);
  }

  /** Restores a layer from a previous snapshot. */
  restoreLayer(layer: number, data: Uint8ClampedArray) {
    if (layer < 0 || layer >= NUM_LAYERS) return;
    this.layers[layer].set(data);
    this.dirty = true;
  }

  // ─── Persistence helpers ─────────────────────────────────────────────────

  /** Returns copies of all layers for serialisation. */
  getLayers(): Uint8ClampedArray[] {
    return this.layers.map((l) => new Uint8ClampedArray(l));
  }

  /** Restores all layers from IndexedDB records. */
  restoreLayers(data: Uint8Array[]) {
    for (let i = 0; i < Math.min(data.length, NUM_LAYERS); i++) {
      this.layers[i].set(data[i]);
    }
    this.dirty = true;
  }

  // ─── Rendering ───────────────────────────────────────────────────────────

  private rebuildCache() {
    const composite = new Uint8ClampedArray(CHUNK_PX * CHUNK_PX * 4);
    const len = CHUNK_PX * CHUNK_PX * 4;

    for (let i = 0; i < len; i += 4) {
      let dR = 0,
        dG = 0,
        dB = 0,
        dA = 0;

      for (let l = 0; l < NUM_LAYERS; l++) {
        const sA = this.layers[l][i + 3] / 255;
        if (sA === 0) continue;
        const sR = this.layers[l][i],
          sG = this.layers[l][i + 1],
          sB = this.layers[l][i + 2];
        const outA = sA + dA * (1 - sA);
        if (outA === 0) continue;
        dR = (sR * sA + dR * dA * (1 - sA)) / outA;
        dG = (sG * sA + dG * dA * (1 - sA)) / outA;
        dB = (sB * sA + dB * dA * (1 - sA)) / outA;
        dA = outA;
      }

      composite[i] = dR;
      composite[i + 1] = dG;
      composite[i + 2] = dB;
      composite[i + 3] = dA * 255;
    }

    this.offCtx.putImageData(new ImageData(composite, CHUNK_PX, CHUNK_PX), 0, 0);
    this.dirty = false;
  }

  draw(ctx: CanvasRenderingContext2D, sx: number, sy: number, drawSize: number) {
    if (this.dirty) this.rebuildCache();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.offscreen, sx, sy, drawSize, drawSize);
  }
}
