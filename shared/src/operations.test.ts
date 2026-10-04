import { describe, expect, it } from 'vitest';
import {
  countAffectedPixels,
  isPixelIndex,
  isRgba,
  type ApplyPixelOperationRequest,
} from './operations';

describe('pixel operation contracts', () => {
  it('counts changes across chunks', () => {
    const operation: ApplyPixelOperationRequest = {
      operationId: '00000000-0000-4000-8000-000000000001',
      kind: 'draw',
      chunks: [
        {
          chunkX: 0,
          chunkY: 0,
          expectedVersion: 2,
          changes: [{ pixelIndex: 0, layer: 1, rgba: [0, 230, 184, 255] }],
        },
        {
          chunkX: 1,
          chunkY: 0,
          expectedVersion: 4,
          changes: [{ pixelIndex: 127, layer: 1, rgba: [0, 230, 184, 255] }],
        },
      ],
    };

    expect(countAffectedPixels(operation)).toBe(2);
  });

  it('validates chunk-local pixel indices', () => {
    expect(isPixelIndex(0)).toBe(true);
    expect(isPixelIndex(16_383)).toBe(true);
    expect(isPixelIndex(-1)).toBe(false);
    expect(isPixelIndex(16_384)).toBe(false);
  });

  it('validates RGBA tuples', () => {
    expect(isRgba([0, 128, 255, 255])).toBe(true);
    expect(isRgba([0, 0, 0])).toBe(false);
    expect(isRgba([0, 0, 0, 256])).toBe(false);
  });
});
