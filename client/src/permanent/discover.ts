import type { View } from './types';
/** A destination beyond the current screen, preferring occupied regions. */
export function discoverLocation(
  view: View,
  density: Array<{ x: number; y: number; cells: number }>,
  random = Math.random,
  recent: Array<{ x: number; y: number }> = [],
) {
  const x = view.x + view.width / 2,
    y = view.y + view.height / 2;
  const distance = Math.min(200000, Math.max(1024, Math.hypot(view.width, view.height) * 1.5));
  const avoids = [{ x, y }, { x: 0, y: 0 }, ...recent];
  const fresh = (c: { x: number; y: number }) =>
    avoids.every((p) => Math.hypot(c.x - p.x, c.y - p.y) > distance);
  const candidates = density
    .filter((c) => c.cells > 0)
    .map((c) => ({ x: c.x * 512 + 256, y: c.y * 512 + 256 }))
    .filter((c) => Math.abs(c.x) <= 1000000 && Math.abs(c.y) <= 1000000 && fresh(c));
  if (candidates.length)
    return candidates[Math.floor(random() * candidates.length) % candidates.length];
  const angle = random() * Math.PI * 2;
  for (let attempt = 0; attempt < 128; attempt++) {
    const a = angle + attempt * 2.3999632297,
      radius = distance * (2 + Math.floor(attempt / 8));
    const target = {
      x: Math.round(Math.max(-1000000, Math.min(1000000, x + Math.cos(a) * radius))),
      y: Math.round(Math.max(-1000000, Math.min(1000000, y + Math.sin(a) * radius))),
    };
    if (fresh(target)) return target;
  }
  // Deterministic distant fallback if an unusually large recent list covers every sample.
  return { x: x > 0 ? -900000 : 900000, y: y > 0 ? -900000 : 900000 };
}
