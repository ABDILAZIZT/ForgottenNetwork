import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canWatchRewardedAd,
  dailyCount,
  dailyReward,
  effectiveStreak,
  explorationGemReward,
  grantExplorationGems,
  ownedItems,
  readBeacons,
  readClaims,
  readNumber,
  readTier,
  randomAdReward,
  recordRewardedAd,
  rewardedAdLimit,
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
    localStorage.setItem('fn_owned_items', '["chunk_visitor_map", null, 3]');
    expect(ownedItems()).toEqual(['chunk_visitor_map']);
    localStorage.setItem('fn_user_gems', '-12');
    expect(readNumber('fn_user_gems', 150)).toBe(150);
  });

  it('resets counters on a new calendar day', () => {
    localStorage.setItem('fn_ads_today', '3');
    localStorage.setItem('fn_ads_last_date', new Date(2026, 8, 28).toDateString());
    expect(dailyCount('fn_ads_today', 'fn_ads_last_date', new Date(2026, 8, 28))).toBe(3);
    expect(dailyCount('fn_ads_today', 'fn_ads_last_date', new Date(2026, 8, 29))).toBe(0);
  });

  it('limits optional rewarded ads and records a local demo reward', () => {
    expect(rewardedAdLimit('free')).toBe(10);
    expect(rewardedAdLimit('artist')).toBe(15);
    expect(rewardedAdLimit('vip')).toBe(15);
    expect(randomAdReward(() => 0)).toBe(15);
    expect(randomAdReward(() => 0.999)).toBe(25);
    const now = new Date(2026, 9, 14, 12).getTime();
    expect(canWatchRewardedAd('free', now)).toBe(true);
    expect(recordRewardedAd(20, 'free', now)).toBe(1);
    expect(canWatchRewardedAd('free', now + 179999)).toBe(false);
    expect(canWatchRewardedAd('free', now + 180000)).toBe(true);
    expect(recordRewardedAd(20, 'free', now + 180000)).toBe(2);
    localStorage.setItem('fn_ads_today', '10');
    localStorage.setItem('fn_ads_last_date', new Date(now).toDateString());
    expect(canWatchRewardedAd('free', now + 360000)).toBe(false);
    expect(recordRewardedAd(20, 'free', now + 360000)).toBeNull();
    expect(recordRewardedAd(100, 'artist', now + 360000)).toBeNull();
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
      40, 45, 50, 45, 55, 60, 100,
    ]);
    expect(dailyReward('vip', 6)).toBe(200);
    expect(dailyReward('free', 7)).toBe(40);
    expect(dailyReward('vip', 13)).toBe(200);
  });

  it('adds 2–5 local demo gems for each first visit to a daily neighborhood', () => {
    expect([0, 0.25, 0.5, 0.999].map((value) => explorationGemReward(() => value))).toEqual([
      2, 3, 4, 5,
    ]);
    localStorage.setItem('fn_user_gems', '99999');
    expect(grantExplorationGems(5)).toBe(true);
    expect(readNumber('fn_user_gems')).toBe(100000);
    expect(grantExplorationGems(5)).toBe(false);
    expect(grantExplorationGems(1)).toBe(false);
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
