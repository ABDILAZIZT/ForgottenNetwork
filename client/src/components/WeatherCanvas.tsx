import { useEffect, useRef } from 'react';
import { useTheme } from './useTheme';

/** A bounded, DPR-1 effects surface instead of independently composited DOM particles. */
export default function WeatherCanvas({ weather }: { weather: string }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    theme = useTheme();
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext('2d')!;
    const style = getComputedStyle(document.documentElement);
    const color =
      style.getPropertyValue(weather === 'snow' ? '--text-muted' : '--accent-fill').trim() ||
      '#a78bfa';
    const glow = document.createElement('canvas');
    glow.width = glow.height = 30;
    const glowContext = glow.getContext('2d')!;
    const gradient = glowContext.createRadialGradient(15, 15, 0, 15, 15, 15);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.12, color);
    gradient.addColorStop(1, 'transparent');
    glowContext.fillStyle = gradient;
    glowContext.fillRect(0, 0, 30, 30);
    let frame = 0,
      last = -Infinity;
    const resize = () => {
      element.width = Math.max(1, Math.round(element.clientWidth));
      element.height = Math.max(1, Math.round(element.clientHeight));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const paint = (time: number) => {
      if (document.hidden) return;
      frame = requestAnimationFrame(paint);
      if (time - last < 1000 / 30 - 1) return;
      last = time;
      const w = element.width,
        h = element.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < 28; i++) {
        const duration = (weather === 'rain' ? 2 : 8) + (i % 4);
        const phase = ((time / 1000 + (i % 9)) / duration) % 1;
        const progress = weather === 'particles' ? 1 - phase : phase;
        const x = (((i * 37) % 100) / 100) * w + progress * 35,
          y = -36 + progress * (h + 72);
        if (weather === 'particles') ctx.drawImage(glow, x - 13, y - 13);
        else ctx.fillRect(x, y, weather === 'rain' ? 1 : 3, weather === 'rain' ? 30 : 3);
      }
    };
    frame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [weather, theme]);
  return <canvas ref={canvas} className="fn-weather-canvas" aria-hidden="true" />;
}
