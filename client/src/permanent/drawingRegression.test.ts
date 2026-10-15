import { describe, expect, it, vi } from 'vitest';
import { availablePlacementCells } from './geometry';
import { drawBrush, strokeDabs } from './brushes';
import type { Artwork, Placement } from './types';

const mark: Placement = {
  id: 'brush-test',
  type: 'brush',
  x: 0,
  y: 0,
  width: 24,
  height: 8,
  content: {
    color: '#ff0000',
    opacity: 1,
    size: 2,
    points: [
      [4, 4],
      [20, 4],
    ],
  },
};
const owner = { ...mark, ownerId: 'alice', cells: [[1, 0]] } as Artwork;
const occupied = new Map([['1,0', owner]]);
describe('ownership while drawing, pending, and in draft mode', () => {
  it('keeps another artist visible while allowing free space and owner overlays', () => {
    expect(availablePlacementCells(mark, occupied, 'bob')).toEqual([
      [0, 0],
      [2, 0],
    ]);
    expect(availablePlacementCells(mark, occupied, 'alice')).toContainEqual([1, 0]);
    expect(availablePlacementCells(mark, occupied)).not.toContainEqual([1, 0]);
  });
  it('does not preview partial shapes that the server will reject', () => {
    expect(availablePlacementCells({ ...mark, type: 'rectangle' }, occupied, 'bob')).toEqual([]);
  });
});
it('brush textures differ in footprint and do not leak through blur filters', () => {
  const outputs = ['ink', 'pencil', 'marker', 'airbrush'].map((brush) => {
    const ctx = {
      globalAlpha: 1,
      filter: 'none',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    };
    drawBrush(
      ctx as unknown as CanvasRenderingContext2D,
      { ...mark.content, size: 16, brush: brush as 'ink' },
      0,
      0,
    );
    expect(ctx.filter).toBe('none');
    return ctx;
  });
  expect(outputs[0].stroke).toHaveBeenCalledOnce();
  expect(outputs[1].fillRect.mock.calls.length).toBeGreaterThan(9);
  expect(outputs[2].rect.mock.calls.every((c) => c[2] === 16 && c[3] === 6.4)).toBe(true);
  expect(outputs[2].fill).toHaveBeenCalledOnce();
  expect(outputs[3].createRadialGradient).toHaveBeenCalledOnce();
  expect(outputs[3].stroke).not.toHaveBeenCalled();
});
it('resamples the same path consistently across different pointer-event frequencies', () => {
  expect(
    strokeDabs(
      [
        [0, 0],
        [5, 0],
        [10, 0],
      ],
      3,
    ),
  ).toEqual(
    strokeDabs(
      [
        [0, 0],
        [10, 0],
      ],
      3,
    ),
  );
});
