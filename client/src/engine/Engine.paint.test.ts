import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldEngine } from './Engine';

function painter(size: number) {
  const pixels: Array<{ x: number; y: number; alpha: number }> = [];
  const chunk = {
    getPixel: () => [0, 0, 0, 0],
    setPixel: (
      x: number,
      y: number,
      _layer: number,
      _r: number,
      _g: number,
      _b: number,
      alpha: number,
    ) => pixels.push({ x, y, alpha }),
  };
  // Exercise paint geometry without a DOM renderer or persistence timers.
  const engine = Object.assign(Object.create(WorldEngine.prototype), {
    brushSize: size,
    color: '#00e6b8',
    tool: 'brush',
    layer: 1,
    claims: [],
    activeStroke: { changed: false },
    getOrCreateChunk: () => chunk,
    snapshotForChange: vi.fn(),
    markChunkDirty: vi.fn(),
  }) as WorldEngine & { paintAtWorld(x: number, y: number): void };
  return {
    engine: engine as unknown as {
      paintAtWorld(x: number, y: number): void;
      setClaims: WorldEngine['setClaims'];
      setBrushStyle: WorldEngine['setBrushStyle'];
    },
    pixels,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('brush geometry and protection', () => {
  it('paints one pixel for a 1px brush and four for a 2px brush', () => {
    const one = painter(1),
      two = painter(2);
    one.engine.paintAtWorld(20, 20);
    two.engine.paintAtWorld(20, 20);
    expect(one.pixels).toHaveLength(1);
    expect(two.pixels).toHaveLength(4);
    expect(new Set(two.pixels.map((pixel) => pixel.x)).size).toBe(2);
    expect(new Set(two.pixels.map((pixel) => pixel.y)).size).toBe(2);
  });
  it('rejects foreign claims while allowing expired claims and owned chunks', () => {
    const { engine, pixels } = painter(1);
    engine.setClaims([{ cx: 0, cy: 0, owner: 'other', expiresAt: Date.now() + 60000 }]);
    engine.paintAtWorld(20, 20);
    expect(pixels).toHaveLength(0);
    engine.setClaims([{ cx: 0, cy: 0, owner: 'other', expiresAt: 1 }]);
    engine.paintAtWorld(20, 20);
    expect(pixels).toHaveLength(1);
    engine.setClaims([{ cx: 0, cy: 0, owner: 'me', expiresAt: Date.now() + 60000 }]);
    engine.paintAtWorld(20, 20);
    expect(pixels).toHaveLength(2);
  });
  it('sprays sparse pixels without changing solid brush coverage', () => {
    let calls = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (++calls % 2 ? 0.1 : 0.9));
    const solid = painter(8),
      spray = painter(8);
    spray.engine.setBrushStyle('spray');
    solid.engine.paintAtWorld(20, 20);
    spray.engine.paintAtWorld(20, 20);
    expect(spray.pixels.length).toBeGreaterThan(0);
    expect(spray.pixels.length).toBeLessThan(solid.pixels.length);
  });
});
