import { afterEach, expect, it, vi } from 'vitest';
import { GifDecoder } from './GifDecoder';
const state = vi.hoisted(() => ({ frames: [] as unknown[] }));
vi.mock('gifuct-js', () => ({
  parseGIF: () => ({ lsd: { width: 2, height: 1 }, frames: state.frames }),
  decompressFrame: (frame: unknown) => frame,
}));
class Canvas {
  width = 2;
  height = 1;
  pixels = [0, 0];
  getContext() {
    return {
      clearRect: (x: number, _y: number, w: number) => {
        for (let i = x; i < x + w; i++) this.pixels[i] = 0;
      },
      putImageData: (data: { data: Uint8ClampedArray }) => {
        this.pixels = Array.from({ length: this.width }, (_, i) =>
          data.data[i * 4 + 3] ? data.data[i * 4] : 0,
        );
      },
      drawImage: (source: Canvas, x = 0) => {
        source.pixels.slice(0, source.width).forEach((p, i) => {
          if (p) this.pixels[x + i] = p;
        });
      },
    };
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
});
it('composites transparent delta frames and disposes the previous frame in its own bounds', async () => {
  const frame = (values: number[], disposalType: number, left = 0) => ({
    image: {},
    disposalType,
    delay: 80,
    transparentIndex: 0,
    dims: { left, top: 0, width: values.length, height: 1 },
    patch: new Uint8ClampedArray(values.flatMap((v) => [v, 0, 0, v ? 255 : 0])),
  });
  state.frames = [frame([10, 10], 1), frame([0, 20], 3), frame([30], 2), frame([20], 1, 1)];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) })),
  );
  vi.stubGlobal('document', { createElement: () => new Canvas() });
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(public data: Uint8ClampedArray) {}
    },
  );
  const frames = await GifDecoder.decode('/animation.gif');
  expect(frames.map((f) => (f.canvas as unknown as Canvas).pixels)).toEqual([
    [10, 10],
    [10, 20],
    [30, 10],
    [0, 20],
  ]);
  expect(frames.every((f) => f.delay === 80 && f.canvas.width === 2)).toBe(true);
});
