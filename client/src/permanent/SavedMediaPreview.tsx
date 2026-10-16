import { useEffect, useRef, useState } from 'react';
import { Entity, type EntityState } from '../engine/Entity';
import { Camera } from '../engine/Camera';
import { GifDecoder } from '../engine/GifDecoder';
import { useWorldRepository } from '../repositories';
export default function SavedMediaPreview({ value }: { value: EntityState }) {
  const repository = useWorldRepository(),
    canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false,
      frame = 0;
    const urls: string[] = [];
    let resume: (() => void) | undefined;
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) resume?.();
    };
    document.addEventListener('visibilitychange', visibility);
    const resolve = async (url?: string) => {
      if (!url?.startsWith('asset:')) return url;
      const asset = await repository.loadAsset(url.slice(6));
      if (!asset)
        throw new Error('Saved media asset is unavailable. The original record remains preserved.');
      if (typeof asset.blob === 'string') return asset.blob;
      const local = URL.createObjectURL(asset.blob);
      urls.push(local);
      return local;
    };
    setError('');
    void (async () => {
      const spriteUrl = await resolve(value.spriteUrl);
      const layers = await Promise.all(
        (value.layers || []).map(async (l) => ({ ...l, url: await resolve(l.url) })),
      );
      const entity = new Entity({ ...value, spriteUrl, layers, wx: 0, wy: 0 });
      entity.frames = value.frames;
      if (value.type === 'gif_entity' && spriteUrl)
        entity.setGifFrames(await GifDecoder.decode(spriteUrl));
      if (cancelled) return;
      const camera = new Camera();
      camera.zoom = Math.min(
        3,
        160 / Math.max(1, entity.width * entity.scale, entity.height * entity.scale),
      );
      let previous = performance.now();
      const draw = (now: number) => {
        if (cancelled || document.hidden || !canvas.current) return;
        const ctx = canvas.current.getContext('2d')!;
        ctx.clearRect(0, 0, 200, 200);
        const reduced =
          document.documentElement.dataset.reducedMotion === 'true' ||
          matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduced)
          entity.update(Math.min(0.05, (now - previous) / 1000), now / 1000, () => null);
        previous = now;
        camera.x = entity.wx;
        camera.y = entity.wy - (entity.anchor === 'feet' ? (entity.height * entity.scale) / 2 : 0);
        entity.draw(ctx, camera, 200, 200, reduced ? 0 : now / 1000);
        frame = requestAnimationFrame(draw);
      };
      resume = () => {
        previous = performance.now();
        frame = requestAnimationFrame(draw);
      };
      if (!document.hidden) resume();
    })()
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (cancelled) urls.forEach((u) => URL.revokeObjectURL(u));
      });
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', visibility);
      cancelAnimationFrame(frame);
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [value, repository]);
  return (
    <>
      <canvas
        ref={canvas}
        width={200}
        height={200}
        aria-label={'Preview of ' + (value.name || value.type)}
        style={{ background: 'var(--surface-hi)', maxWidth: '100%', imageRendering: 'pixelated' }}
      />
      {error && <p role="status">{error}</p>}
    </>
  );
}
