import { afterEach, expect, it, vi } from 'vitest';
import { Atmosphere } from './Atmosphere';
import { Camera } from './Camera';
afterEach(() => {
  vi.unstubAllGlobals();
});
it('reuses background/vignette gradients, invalidates on theme/resize and does no hidden work', () => {
  const document = { hidden: false, documentElement: { dataset: { theme: 'dark' } } };
  vi.stubGlobal('document', document);
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#111111' }));
  const gradient = () => ({ addColorStop: vi.fn() });
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    createLinearGradient: vi.fn(gradient),
    createRadialGradient: vi.fn(gradient),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  };
  const atmosphere = new Atmosphere(),
    camera = new Camera();
  for (let frame = 0; frame < 120; frame++)
    atmosphere.render(ctx as unknown as CanvasRenderingContext2D, camera, 800, 600, frame / 60);
  expect(ctx.createLinearGradient).toHaveBeenCalledTimes(1);
  // The four animated nebula gradients remain; the vignette is built just once.
  expect(ctx.createRadialGradient.mock.calls.length).toBeLessThanOrEqual(481);
  document.documentElement.dataset.theme = 'light';
  atmosphere.render(ctx as unknown as CanvasRenderingContext2D, camera, 800, 600, 3);
  expect(ctx.createLinearGradient).toHaveBeenCalledTimes(2);
  atmosphere.render(ctx as unknown as CanvasRenderingContext2D, camera, 360, 600, 4);
  expect(ctx.createLinearGradient).toHaveBeenCalledTimes(3);
  const fills = ctx.fillRect.mock.calls.length;
  document.hidden = true;
  atmosphere.update(0.016);
  atmosphere.render(ctx as unknown as CanvasRenderingContext2D, camera, 360, 600, 5);
  expect(ctx.fillRect).toHaveBeenCalledTimes(fills);
});
