import type { Content, Point } from './types';

// Resample by distance so the texture does not depend on pointer-event frequency.
export function strokeDabs(points: Point[], spacing: number): Point[] {
  if (!points.length) return [];
  const result: Point[] = [points[0]];
  let remaining = spacing;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let distance = remaining;
    while (distance <= length) {
      result.push([
        a[0] + ((b[0] - a[0]) * distance) / length,
        a[1] + ((b[1] - a[1]) * distance) / length,
      ]);
      distance += spacing;
    }
    remaining = distance - length;
  }
  return result;
}

export function drawBrush(ctx: CanvasRenderingContext2D, c: Content, x: number, y: number) {
  const points = c.points || [];
  const radius = c.size / 2;
  if (c.brush === 'airbrush') {
    // A bounded soft dab stays inside the same footprint used for ownership checks.
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, c.color);
    gradient.addColorStop(1, c.color + '00');
    ctx.fillStyle = gradient;
    ctx.globalAlpha *= 0.25;
    for (const p of strokeDabs(points, Math.max(1, radius / 2))) {
      ctx.save();
      ctx.translate(p[0] - x, p[1] - y);
      ctx.fillRect(-radius, -radius, c.size, c.size);
      ctx.restore();
    }
    return;
  }
  if (c.brush === 'pencil') {
    ctx.globalAlpha *= 0.75;
    for (const [i, p] of strokeDabs(points, Math.max(1, c.size / 5)).entries()) {
      for (let grain = 0; grain < 9; grain++) {
        const seed = (i * 73 + grain * 137) % 997;
        const angle = seed * 2.399963;
        const spread = Math.sqrt(((seed * 31) % 997) / 997) * radius * 0.75;
        ctx.fillRect(
          p[0] - x + Math.cos(angle) * spread,
          p[1] - y + Math.sin(angle) * spread,
          Math.max(0.5, c.size / 12),
          Math.max(0.5, c.size / 12),
        );
      }
    }
    return;
  }
  if (c.brush === 'marker') {
    ctx.globalAlpha *= 0.65;
    // A chisel tip has a visibly flatter footprint than the round ink brush.
    ctx.beginPath();
    for (const p of strokeDabs(points, Math.max(0.5, c.size / 8)))
      ctx.rect(p[0] - x - radius, p[1] - y - c.size / 5, c.size, c.size * 0.4);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  points.forEach(([px, py], i) => (i ? ctx.lineTo(px - x, py - y) : ctx.moveTo(px - x, py - y)));
  ctx.stroke();
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0] - x, points[0][1] - y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}
