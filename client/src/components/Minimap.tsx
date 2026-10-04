import { useEffect, useRef } from 'react';
import { CHUNK_PX } from '../engine/Chunk';
import type { ZoneType } from '../engine/Chunk';

export interface MinimapChunk {
  cx: number;
  cy: number;
  zoneType: ZoneType;
}

export interface MinimapViewport {
  x: number;
  y: number;
  zoom: number;
}

interface Props {
  viewport: MinimapViewport;
  chunks: MinimapChunk[];
  onTeleport: (x: number, y: number) => void;
}

const MAP_SIZE = 150;

export default function Minimap({ viewport, chunks, onTeleport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const chunk of chunks) {
      minX = Math.min(minX, chunk.cx);
      minY = Math.min(minY, chunk.cy);
      maxX = Math.max(maxX, chunk.cx);
      maxY = Math.max(maxY, chunk.cy);
    }
    if (minX === Infinity) return;

    const rangeX = maxX - minX + 1;
    const rangeY = maxY - minY + 1;
    const scale = MAP_SIZE / Math.max(rangeX, rangeY);

    for (const chunk of chunks) {
      const x = (chunk.cx - minX) * scale;
      const y = (chunk.cy - minY) * scale;
      const size = Math.max(2, scale - 1);
      ctx.fillStyle = chunk.zoneType === 'living' ? 'rgba(0,230,184,0.6)' : 'rgba(120,140,180,0.4)';
      ctx.fillRect(x, y, size, size);
    }

    const camWorldSize = MAP_SIZE / viewport.zoom;
    const camX = (viewport.x / CHUNK_PX - minX) * scale;
    const camY = (viewport.y / CHUNK_PX - minY) * scale;
    ctx.strokeStyle = '#00e6b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(camX - camWorldSize / 2, camY - camWorldSize / 2, camWorldSize, camWorldSize);
  }, [viewport, chunks]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (chunks.length === 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const mx = ((event.clientX - rect.left) / rect.width) * MAP_SIZE;
    const my = ((event.clientY - rect.top) / rect.height) * MAP_SIZE;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const chunk of chunks) {
      minX = Math.min(minX, chunk.cx);
      minY = Math.min(minY, chunk.cy);
      maxX = Math.max(maxX, chunk.cx);
      maxY = Math.max(maxY, chunk.cy);
    }

    const rangeX = maxX - minX + 1;
    const rangeY = maxY - minY + 1;
    const scale = MAP_SIZE / Math.max(rangeX, rangeY);
    onTeleport((mx / scale + minX) * CHUNK_PX, (my / scale + minY) * CHUNK_PX);
  };

  return (
    <canvas
      ref={canvasRef}
      width={MAP_SIZE}
      height={MAP_SIZE}
      className="fn-minimap"
      onClick={handleClick}
      title="Click to jump to location"
    />
  );
}
