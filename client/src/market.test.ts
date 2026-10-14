import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  MARKET_ITEMS,
  purchaseMarketItem,
  readBeacons,
  readMarket,
  topUpMarketDemo,
} from './economy';
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
  expect(readMarket()).toMatchObject({
    coins: 0,
    owned: ['rainbow_brush'],
    nextGrantAt: 0,
    beacons: [],
  });
  expect(readMarket().transactions).toHaveLength(1);
  expect(purchaseMarketItem('rainbow_brush')).toBe('Already owned.');
  expect(purchaseMarketItem('glow_pen')).toBe('Not enough demo coins.');
  expect(readMarket().coins).toBe(0);
});
it('does not sell unimplemented server features or unknown products', () => {
  topUpMarketDemo();
  expect(purchaseMarketItem('expanded_canvas')).toBe('This feature is a preview.');
  expect(purchaseMarketItem('forged-product')).toBe('This feature is a preview.');
  expect(readMarket().coins).toBe(225);
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

it('limits repeated grants across reloads and purchases without reducing legacy balances', () => {
  topUpMarketDemo(1000);
  expect(readMarket().coins).toBe(225);
  expect(topUpMarketDemo(1001)).toContain('24 hours');
  purchaseMarketItem('rainbow_brush');
  expect(topUpMarketDemo(1002)).toContain('24 hours');
  topUpMarketDemo(86401000);
  expect(readMarket().coins).toBe(150);
  topUpMarketDemo(172801000);
  expect(readMarket().coins).toBe(225);
  localStorage.setItem('fn_market_v1', JSON.stringify({ coins: 1490, owned: [] }));
  expect(topUpMarketDemo(200000000)).toContain('Added 10');
  expect(topUpMarketDemo(300000000)).toContain('cap');
  localStorage.setItem('fn_market_v1', JSON.stringify({ coins: 100000, owned: [] }));
  expect(topUpMarketDemo()).toContain('cap');
  expect(readMarket().coins).toBe(100000);
});

it('offers the four requested item categories and keeps the catalog at 18 entries', () => {
  expect(MARKET_ITEMS).toHaveLength(18);
  expect(new Set(MARKET_ITEMS.map((item) => item.category))).toEqual(
    new Set(['Brushes', 'Land', 'Creatures', 'Cosmetics']),
  );
});

it('saves repeatable land markers in the same demo ledger as their coin purchase', () => {
  topUpMarketDemo();
  expect(purchaseMarketItem('waypoint_marker')).toContain('canvas location');
  expect(readMarket().coins).toBe(225);
  expect(purchaseMarketItem('waypoint_marker', { x: 12, y: -48 })).toBe('Purchased');
  expect(readMarket().coins).toBe(125);
  expect(readBeacons()).toEqual([
    expect.objectContaining({ name: 'Collection marker 1', x: 12, y: -48 }),
  ]);
  expect(purchaseMarketItem('waypoint_marker', { x: 400, y: 500 })).toBe('Purchased');
  expect(readMarket().coins).toBe(25);
  expect(readBeacons()).toHaveLength(2);
});
