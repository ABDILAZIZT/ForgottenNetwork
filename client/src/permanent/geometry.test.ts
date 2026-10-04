import { describe, expect, it } from 'vitest';
import { placementCells } from './geometry';
import type { Placement } from './types';

const shape: Placement = {
  id: 'test-mark',
  type: 'rectangle',
  x: 0,
  y: 0,
  width: 16,
  height: 16,
  content: { color: '#ffffff', size: 2, opacity: 1 },
};
describe('permanent canvas cell previews', () => {
  it('claims exactly the covered cells without an extra right or bottom row', () => {
    expect(placementCells(shape)).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
  });
  it('uses floor coordinates on the negative side of the world', () => {
    expect(placementCells({ ...shape, x: -8, y: -8, width: 8, height: 8 })).toEqual([[-1, -1]]);
  });
  it('marks only the drawn path, not its entire bounding rectangle', () => {
    const cells = placementCells({
      ...shape,
      type: 'brush',
      width: 40,
      height: 40,
      content: {
        ...shape.content,
        points: [
          [4, 4],
          [36, 36],
        ],
      },
    });
    expect(cells).toContainEqual([0, 0]);
    expect(cells).toContainEqual([4, 4]);
    expect(cells).not.toContainEqual([0, 4]);
    expect(new Set(cells.map((c) => c.join(','))).size).toBe(cells.length);
  });
  it('supports a single-pixel tap', () => {
    expect(
      placementCells({
        ...shape,
        type: 'pixel',
        content: { ...shape.content, size: 1, points: [[4, 4]] },
      }),
    ).toEqual([[0, 0]]);
  });
});
