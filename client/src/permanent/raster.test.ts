import { expect, it } from 'vitest';
import { floodFill, fitImage, transformPoint } from './raster';
it('fill stays in its connected region, respects tolerance and selection masks', () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
  expect(floodFill(pixels, 3, 1, 0, 0, [200, 0, 0, 255], 10)).toBe(1);
  expect(pixels[8]).toBe(0);
  const mask = new Uint8ClampedArray(12);
  mask[7] = 255;
  expect(floodFill(pixels, 3, 1, 1, 0, [100, 100, 100, 255], 255, mask)).toBe(1);
  expect(pixels[0]).toBe(200);
  expect(pixels[8]).toBe(0);
});
it('image fit preserves aspect ratio and centers instead of stretching', () => {
  expect(fitImage(800, 400, 512)).toEqual({ x: 0, y: 128, width: 512, height: 256 });
});
it('selection handles follow scale, rotation and translation around their center', () => {
  const point = transformPoint([20, 10], [10, 10], { x: 5, y: 3, sx: 2, sy: 1, angle: 90 });
  expect(point[0]).toBeCloseTo(15);
  expect(point[1]).toBeCloseTo(33);
});
