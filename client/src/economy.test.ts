import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  brushLimit,
  dailyCount,
  dailyReward,
  effectiveStreak,
  ownedItems,
  readBeacons,
  readClaims,
  readNumber,
  readTier,
} from './economy';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persisted economy', () => {
  it('recovers from corrupt balances, tiers and item lists', () => {
    localStorage.setItem('fn_user_gems', 'NaN');
    localStorage.setItem('fn_subscription_tier', 'admin');
    localStorage.setItem('fn_owned_items', '{"x":1}');
    expect(readNumber('fn_user_gems', 150)).toBe(150);
    expect(readTier()).toBe('free');
    expect(ownedItems()).toEqual([]);
    localStorage.setItem('fn_owned_items', '["spray_brush", null, 3]');
    expect(ownedItems()).toEqual(['spray_brush']);
    localStorage.setItem('fn_user_gems', '-12');
    expect(readNumber('fn_user_gems', 150)).toBe(150);
  });

  it('resets counters on a new calendar day', () => {
    localStorage.setItem('fn_ads_today', '3');
    localStorage.setItem('fn_ads_last_date', new Date(2026, 8, 28).toDateString());
    expect(dailyCount('fn_ads_today', 'fn_ads_last_date', new Date(2026, 8, 28))).toBe(3);
    expect(dailyCount('fn_ads_today', 'fn_ads_last_date', new Date(2026, 8, 29))).toBe(0);
  });

  it('continues a streak only on the same or immediately following calendar day', () => {
    localStorage.setItem('fn_streak_count', '6');
    localStorage.setItem('fn_last_reward_date', new Date(2026, 2, 28).toDateString());
    expect(effectiveStreak(new Date(2026, 2, 29))).toBe(6);
    expect(effectiveStreak(new Date(2026, 2, 30))).toBe(0);
    expect(effectiveStreak(new Date(2026, 2, 27))).toBe(0);
    localStorage.setItem('fn_last_reward_date', 'invalid');
    expect(effectiveStreak()).toBe(0);
  });

  it('cycles weekly rewards and doubles them for VIP', () => {
    expect(Array.from({ length: 7 }, (_, day) => dailyReward('free', day))).toEqual([
      25, 30, 50, 30, 35, 40, 100,
    ]);
    expect(dailyReward('vip', 6)).toBe(200);
    expect(dailyReward('free', 7)).toBe(25);
    expect(dailyReward('vip', 13)).toBe(200);
  });

  it('expires brush boosts and preserves paid brush sizes', () => {
    localStorage.setItem('fn_brush_boost_until', '1000');
    expect(brushLimit('free', 999)).toBe(8);
    expect(brushLimit('free', 1000)).toBe(4);
    expect(brushLimit('artist', 2000)).toBe(24);
    expect(brushLimit('vip', 2000)).toBe(24);
  });

  it('rejects malformed and expired claims and bookmarks', () => {
    localStorage.setItem(
      'fn_claimed_chunks',
      JSON.stringify([
        null,
        { cx: 0, cy: 0, owner: 'me', expiresAt: 1 },
        { cx: 1, cy: -1, owner: 'me', expiresAt: Date.now() + 86400000 },
      ]),
    );
    expect(readClaims()).toHaveLength(1);
    localStorage.setItem('fn_beacons', '[null,{"id":"a","name":"Home","x":0,"y":0}]');
    expect(readBeacons()).toEqual([{ id: 'a', name: 'Home', x: 0, y: 0 }]);
  });
});
