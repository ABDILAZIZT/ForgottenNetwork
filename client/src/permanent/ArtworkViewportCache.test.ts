import { afterEach, expect, it, vi } from 'vitest';
import { ArtworkViewportCache } from './ArtworkViewportCache';
import type { Artwork } from './types';
const art = vi.hoisted(() => ({ draw: vi.fn(), revision: 0 }));
vi.mock('./art', () => ({ drawArt: art.draw, getArtRevision: () => art.revision }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  art.revision = 0;
});
function fixture(animated = false) {
  const target = { setTransform: vi.fn(), clearRect: vi.fn() };
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => target }),
  });
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const elements = new Map(
    Array.from({ length: 500 }, (_, i) => [
      String(i),
      {
        id: String(i),
        x: 0,
        y: 0,
        width: 8,
        height: 8,
        zIndex: i,
        content: { animated },
      } as Artwork,
    ]),
  );
  return {
    cache: new ArtworkViewportCache(),
    ctx,
    elements,
    view: { x: 0, y: 0, width: 100, height: 100, zoom: 1 },
  };
}
it('rasterizes 500 static artworks once across 120 frames and invalidates on asset, scene and camera changes', () => {
  const { cache, ctx, elements, view } = fixture();
  for (let frame = 0; frame < 120; frame++)
    cache.draw(ctx, elements, view, 100, 100, 1, frame / 60, 0);
  expect(art.draw).toHaveBeenCalledTimes(500);
  art.revision++;
  cache.draw(ctx, elements, view, 100, 100, 1, 2, 0);
  expect(art.draw).toHaveBeenCalledTimes(1000);
  elements.delete('0');
  cache.draw(ctx, elements, view, 100, 100, 1, 2, 1);
  expect(art.draw).toHaveBeenCalledTimes(1499);
  cache.draw(ctx, elements, { ...view, x: 1 }, 100, 100, 1, 2, 1);
  expect(art.draw).toHaveBeenCalledTimes(1998);
});
it('keeps animated artwork updating at 30fps and freezes it only when its supplied time is frozen', () => {
  const { cache, ctx, elements, view } = fixture(true);
  for (let frame = 0; frame < 60; frame++)
    cache.draw(ctx, elements, view, 100, 100, 1, frame / 60, 0);
  expect(art.draw).toHaveBeenCalledTimes(30 * 500);
  for (let frame = 0; frame < 60; frame++) cache.draw(ctx, elements, view, 100, 100, 1, 1, 0);
  expect(art.draw).toHaveBeenCalledTimes(31 * 500);
});
