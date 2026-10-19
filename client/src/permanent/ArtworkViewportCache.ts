import { drawArt, getArtRevision } from './art';
import type { Artwork, View } from './types';

/** One viewport bitmap: static artwork is rasterized only when its inputs change. */
export class ArtworkViewportCache {
  private canvas?: HTMLCanvasElement;
  private key = '';
  private visible: Artwork[] = [];
  draw(
    ctx: CanvasRenderingContext2D,
    elements: Map<string, Artwork>,
    view: View,
    width: number,
    height: number,
    dpr: number,
    time: number,
    revision: number,
  ) {
    const cameraKey = [
      view.x.toFixed(3),
      view.y.toFixed(3),
      view.zoom,
      width,
      height,
      dpr,
      revision,
    ].join(':');
    if (!this.key.startsWith(cameraKey + '|')) {
      this.visible = [...elements.values()]
        .filter(
          (e) =>
            e.x + e.width >= view.x &&
            e.x <= view.x + view.width &&
            e.y + e.height >= view.y &&
            e.y <= view.y + view.height,
        )
        .sort((a, b) => a.zIndex - b.zIndex);
    }
    const animated = this.visible.some((e) => e.content.animated);
    const key =
      cameraKey +
      '|' +
      getArtRevision() +
      ':' +
      (animated ? Math.floor(time * 30) : Math.floor(time / 5));
    if (!this.canvas) this.canvas = document.createElement('canvas');
    if (key !== this.key) {
      const w = Math.max(1, Math.round(width * dpr)),
        h = Math.max(1, Math.round(height * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      const target = this.canvas.getContext('2d')!;
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.clearRect(0, 0, w, h);
      target.setTransform(
        dpr * (view.zoom || 1),
        0,
        0,
        dpr * (view.zoom || 1),
        -view.x * dpr * (view.zoom || 1),
        -view.y * dpr * (view.zoom || 1),
      );
      this.visible.forEach((e) => drawArt(target, e, time));
      this.key = key;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
    return this.visible;
  }
}
