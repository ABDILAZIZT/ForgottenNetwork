import type { Artwork, Placement } from './types';
import { GifDecoder, type GifFrame } from '../engine/GifDecoder';

const images = new Map<string, HTMLImageElement>();
const frames = new Map<string, GifFrame[]>();
const loading = new Map<string, Promise<void>>();
const tiles = new Map<string, HTMLCanvasElement>();

export async function loadArt(e: Placement) {
  const id = e.content.assetId;
  if (!id) return;
  if (loading.has(id)) return loading.get(id);
  if (images.has(id)) return;
  const promise = new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      images.set(id, img);
      resolve();
    };
    img.onerror = () => reject(new Error('Image unavailable'));
    img.src = '/api/canvas/assets/' + id;
  }).then(async () => {
    if (e.content.animated) frames.set(id, await GifDecoder.decode('/api/canvas/assets/' + id));
  });
  loading.set(id, promise);
  try {
    await promise;
  } catch (error) {
    loading.delete(id);
    images.delete(id);
    throw error;
  }
}
const patterns: Record<string, string[]> = {
  heart: [
    '01100110',
    '11111111',
    '11111111',
    '11111111',
    '01111110',
    '00111100',
    '00011000',
    '00000000',
  ],
  star: [
    '00011000',
    '00011000',
    '11111111',
    '01111110',
    '00111100',
    '01111110',
    '01100110',
    '10000001',
  ],
  bolt: [
    '00011100',
    '00111000',
    '01110000',
    '11111110',
    '00011100',
    '00111000',
    '01110000',
    '01100000',
  ],
  spark: [
    '00010000',
    '00010000',
    '00111000',
    '11111110',
    '00111000',
    '00010000',
    '00010000',
    '00000000',
  ],
  peace: [
    '00011000',
    '01111110',
    '11011011',
    '10011001',
    '10111101',
    '11011011',
    '01111110',
    '00011000',
  ],
};
export function sticker(
  ctx: CanvasRenderingContext2D,
  name: string,
  w: number,
  h: number,
  color: string,
  t = 0,
) {
  const unit = Math.min(w, h) / 16;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  if (name === 'planet' || name === 'orbit') {
    ctx.rotate(-0.32);
    ctx.fillStyle = '#372063';
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.32, h * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let y = -5; y < 5; y++)
      for (let x = -5; x < 5; x++)
        if (x * x + y * y < 25) {
          ctx.fillStyle = ['#6d28d9', color, '#ddd6fe', '#8b5cf6'][Math.abs(x + 2 * y) % 4];
          ctx.fillRect(x * unit, y * unit, unit + 1, unit + 1);
        }
    ctx.strokeStyle = name === 'orbit' ? '#67e8f9' : '#e9d5ff';
    ctx.lineWidth = unit * 0.85;
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.48, h * 0.15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.cos(t) * w * 0.4, Math.sin(t) * h * 0.13, unit, unit);
  } else if (name === 'flower') {
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 4);
      ctx.fillStyle = i % 2 ? color : '#fce7f3';
      ctx.fillRect(-unit * 2, -unit * 6, unit * 4, unit * 5);
      ctx.restore();
    }
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(-unit * 2, -unit * 2, unit * 4, unit * 4);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-unit, -unit, unit, unit);
  } else {
    const grid = patterns[name] || patterns.star;
    const cell = Math.min(w, h) / 9;
    grid.forEach((row, y) =>
      [...row].forEach((v, x) => {
        if (v === '1') {
          ctx.fillStyle = y < 3 ? color : y < 5 ? color : '#ffffff';
          ctx.globalAlpha = y < 5 ? 1 : 0.8;
          ctx.fillRect((x - 4) * cell, (y - 4) * cell, cell + 0.5, cell + 0.5);
        }
      }),
    );
  }
  ctx.restore();
}
function raw(ctx: CanvasRenderingContext2D, e: Placement, t: number) {
  const c = e.content;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.globalAlpha *= c.opacity;
  ctx.fillStyle = c.color;
  ctx.strokeStyle = c.color;
  ctx.lineWidth = c.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (e.type === 'pixel') {
    const pts = c.points || [];
    pts.forEach((point, i) => {
      const previous = pts[Math.max(0, i - 1)];
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(point[0] - previous[0]), Math.abs(point[1] - previous[1]))),
      );
      for (let step = 0; step <= steps; step++)
        ctx.fillRect(
          Math.floor(previous[0] + ((point[0] - previous[0]) * step) / steps) - e.x,
          Math.floor(previous[1] + ((point[1] - previous[1]) * step) / steps) - e.y,
          1,
          1,
        );
    });
  } else if (['brush', 'line', 'arrow'].includes(e.type)) {
    const pts = c.points || [];
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x - e.x, y - e.y);
      else ctx.lineTo(x - e.x, y - e.y);
    });
    ctx.stroke();
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0][0] - e.x, pts[0][1] - e.y, c.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (e.type === 'arrow' && pts.length > 1) {
      const a = pts[0],
        b = pts[pts.length - 1],
        angle = Math.atan2(b[1] - a[1], b[0] - a[0]),
        length = Math.max(12, c.size * 3);
      ctx.beginPath();
      ctx.moveTo(b[0] - e.x, b[1] - e.y);
      ctx.lineTo(
        b[0] - e.x - Math.cos(angle - 0.6) * length,
        b[1] - e.y - Math.sin(angle - 0.6) * length,
      );
      ctx.moveTo(b[0] - e.x, b[1] - e.y);
      ctx.lineTo(
        b[0] - e.x - Math.cos(angle + 0.6) * length,
        b[1] - e.y - Math.sin(angle + 0.6) * length,
      );
      ctx.stroke();
    }
  } else if (e.type === 'rectangle') ctx.fillRect(0, 0, e.width, e.height);
  else if (e.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(e.width / 2, e.height / 2, e.width / 2, e.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.type === 'text') {
    const lines = (c.text || '').split('\n');
    ctx.textBaseline = 'top';
    ctx.font = '700 ' + c.size + 'px "' + (c.font || 'Space Grotesk') + '", sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, 2, i * c.size * 1.3, e.width - 4));
  } else if (e.type === 'sticker') {
    if (c.animated) {
      ctx.translate(e.width / 2, e.height / 2);
      const pulse = 0.92 + Math.sin(t * 2) * 0.04;
      ctx.rotate(Math.sin(t * 1.5) * 0.06);
      ctx.scale(pulse, pulse);
      ctx.translate(-e.width / 2, -e.height / 2);
    }
    sticker(ctx, c.sticker || 'star', e.width, e.height, c.color, c.animated ? t : 0);
  } else if (c.assetId) {
    const animation = frames.get(c.assetId),
      img = images.get(c.assetId);
    if (animation?.length) {
      const total = animation.reduce((sum, f) => sum + f.delay, 0);
      let time = (t * 1000) % total;
      let frame = animation[0];
      for (const f of animation) {
        frame = f;
        if (time < f.delay) break;
        time -= f.delay;
      }
      ctx.drawImage(frame.canvas, 0, 0, e.width, e.height);
    } else if (img) ctx.drawImage(img, 0, 0, e.width, e.height);
    else {
      ctx.fillStyle = '#243041';
      ctx.fillRect(0, 0, e.width, e.height);
      void loadArt(e).catch(() => undefined);
    }
  }
  ctx.restore();
}
export function drawArt(ctx: CanvasRenderingContext2D, e: Artwork | Placement, t = 0) {
  const accepted = 'cells' in e;
  const animated = e.content.animated;
  let cached = accepted && !animated ? tiles.get(e.id) : undefined;
  if (!cached && accepted && !animated && (!e.content.assetId || images.has(e.content.assetId))) {
    const tile = document.createElement('canvas');
    tile.width = Math.ceil(e.width) + 2;
    tile.height = Math.ceil(e.height) + 2;
    const tc = tile.getContext('2d')!;
    tc.translate(-e.x, -e.y);
    tc.beginPath();
    e.cells.forEach(([x, y]) => tc.rect(x * 8, y * 8, 8, 8));
    tc.clip();
    raw(tc, e, 0);
    if (tiles.size > 1600) tiles.delete(tiles.keys().next().value!);
    tiles.set(e.id, tile);
    cached = tile;
  }
  if (cached) {
    ctx.drawImage(cached, e.x, e.y);
    return;
  }
  ctx.save();
  if (accepted) {
    ctx.beginPath();
    e.cells.forEach(([x, y]) => ctx.rect(x * 8, y * 8, 8, 8));
    ctx.clip();
  }
  raw(ctx, e, t);
  ctx.restore();
}
export function clearArtCache() {
  tiles.clear();
}
