import { expect, it } from 'vitest';
import { discoverLocation } from './discover';
const view = { x: -500, y: -300, width: 1000, height: 600, zoom: 1 };
it('prefers distant occupied regions and rejects empty/current ones', () => {
  expect(
    discoverLocation(
      view,
      [
        { x: 0, y: 0, cells: 10 },
        { x: 20, y: 0, cells: 0 },
        { x: 30, y: 5, cells: 50 },
      ],
      () => 0,
    ),
  ).toEqual({ x: 15616, y: 2816 });
});
it.each([0, 0.25, 0.5, 0.75, 0.99])(
  'always leaves the current viewport without density (%s)',
  (random) => {
    const next = discoverLocation(view, [], () => random);
    expect(Math.hypot(next.x, next.y)).toBeGreaterThan(Math.hypot(view.width, view.height));
  },
);
it('stays inside world bounds near the edges', () => {
  const next = discoverLocation({ ...view, x: 999500, y: 999700 }, [], () => 0.125);
  expect(Math.abs(next.x)).toBeLessThanOrEqual(1000000);
  expect(Math.abs(next.y)).toBeLessThanOrEqual(1000000);
});
