import type { View } from './types';
/** A destination beyond the current screen, preferring occupied regions. */
export function discoverLocation(
  view: View,
  density: Array<{ x: number; y: number; cells: number }>,
  random = Math.random,
) {
  const x = view.x + view.width / 2,
    y = view.y + view.height / 2;
  const distance = Math.max(1024, Math.hypot(view.width, view.height) * 1.5);
  const candidates = density
    .filter((c) => c.cells > 0)
    .map((c) => ({ x: c.x * 512 + 256, y: c.y * 512 + 256 }))
    .filter(
      (c) =>
        Math.abs(c.x) <= 1000000 &&
        Math.abs(c.y) <= 1000000 &&
        Math.hypot(c.x - x, c.y - y) > distance,
    );
  if (candidates.length)
    return candidates[Math.floor(random() * candidates.length) % candidates.length];
  const angle = random() * Math.PI * 2;
  let dx = Math.cos(angle) * distance * 2,
    dy = Math.sin(angle) * distance * 2;
  if (Math.abs(x + dx) > 1000000) dx = -dx;
  if (Math.abs(y + dy) > 1000000) dy = -dy;
  return { x: Math.round(x + dx), y: Math.round(y + dy) };
}
