import type { Placement, Point } from './types';

// Preview the same 8px ownership cells used by the authoritative server check.
export function placementCells(e: Placement): Point[] {
  const cells = new Map<string, Point>();
  const add = (x: number, y: number) => cells.set(x + ',' + y, [x, y]);
  if (e.type === 'brush' || e.type === 'pixel') {
    const points = e.content.points || [];
    points.forEach((point, i) => {
      const previous = points[Math.max(0, i - 1)],
        radius = e.content.size / 2;
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(point[0] - previous[0], point[1] - previous[1]) / 3),
      );
      for (let step = 0; step <= steps; step++) {
        const x = previous[0] + ((point[0] - previous[0]) * step) / steps,
          y = previous[1] + ((point[1] - previous[1]) * step) / steps;
        for (let cy = Math.floor((y - radius) / 8); cy <= Math.floor((y + radius) / 8); cy++)
          for (let cx = Math.floor((x - radius) / 8); cx <= Math.floor((x + radius) / 8); cx++)
            add(cx, cy);
      }
    });
  } else {
    for (let y = Math.floor(e.y / 8); y <= Math.floor((e.y + e.height - 0.001) / 8); y++)
      for (let x = Math.floor(e.x / 8); x <= Math.floor((e.x + e.width - 0.001) / 8); x++)
        add(x, y);
  }
  return [...cells.values()];
}
