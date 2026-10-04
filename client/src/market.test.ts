import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { purchaseMarketItem, readMarket, topUpMarketDemo } from './economy';
import { readExploration, recordExploration } from './exploration';
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it('deducts the catalog price once and rejects duplicate and unaffordable purchases', () => {
  expect(purchaseMarketItem('rainbow_brush')).toBe('Purchased');
  expect(readMarket()).toEqual({ coins: 0, owned: ['rainbow_brush'] });
  expect(purchaseMarketItem('rainbow_brush')).toBe('Already owned.');
  expect(purchaseMarketItem('glow_pen')).toBe('Not enough demo coins.');
  expect(readMarket().coins).toBe(0);
});
it('does not sell unimplemented server features or unknown products', () => {
  topUpMarketDemo();
  expect(purchaseMarketItem('expanded_canvas')).toBe('This feature is a preview.');
  expect(purchaseMarketItem('forged-product')).toBe('This feature is a preview.');
  expect(readMarket()).toEqual({ coins: 1650, owned: [] });
});
it('does not report success when persistence fails', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('Quota');
    },
  });
  expect(purchaseMarketItem('rainbow_brush')).toContain('No purchase was saved');
});
it('bounds activity and deduplicates replayed placements', () => {
  recordExploration(0, 0, 128, 'First drawing', 'placement-1');
  recordExploration(0, 0, 128, 'First drawing', 'placement-1');
  expect(readExploration().pixels).toBe(128);
  expect(readExploration().badges).toContain('100 Pixels');
  for (let i = 0; i < 25; i++) recordExploration(i * 512, 0, 0, 'New place', 'visit-' + i);
  expect(readExploration().activity).toHaveLength(20);
  expect(readExploration().badges).toContain('Cartographer');
});
