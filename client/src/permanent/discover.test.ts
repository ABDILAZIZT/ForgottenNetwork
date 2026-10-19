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
it('does not alternate back to the origin or recent places, even with the same random value', () => {
  const recent: Array<{ x: number; y: number }> = [];
  let current = view;
  for (let i = 0; i < 20; i++) {
    const target = discoverLocation(
      current,
      [
        { x: 0, y: 0, cells: 100 },
        { x: 30, y: 5, cells: 50 },
      ],
      () => 0,
      recent,
    );
    expect(Math.hypot(target.x, target.y)).toBeGreaterThan(1024);
    expect(recent.some((p) => Math.hypot(target.x - p.x, target.y - p.y) <= 1024)).toBe(false);
    recent.push(target);
    current = { ...view, x: target.x - view.width / 2, y: target.y - view.height / 2 };
  }
});
