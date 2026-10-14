import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimDailyChallenge,
  readDailyChallenges,
  recordDailyChallengeExplore,
  recordDailyChallengeProgress,
} from './challenges';

describe('daily challenges', () => {
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

  it('selects one deterministic drawing, exploration, and placement task for each local day', () => {
    const day = new Date(2026, 9, 14, 12);
    const first = readDailyChallenges(day);
    expect(readDailyChallenges(day)).toEqual(first);
    expect(first.challenges.map((challenge) => challenge.metric).sort()).toEqual([
      'draw',
      'explore',
      'place',
    ]);
    expect(
      first.challenges.every((challenge) => challenge.reward >= 30 && challenge.reward <= 50),
    ).toBe(true);
  });

  it('counts new neighborhoods once per day and resets progress on the next local day', () => {
    const day = new Date(2026, 9, 14, 12);
    expect(recordDailyChallengeExplore('0,0', day)).toBe(true);
    expect(recordDailyChallengeExplore('0,0', day)).toBe(false);
    expect(readDailyChallenges(day).progress.explore).toBe(1);
    expect(readDailyChallenges(new Date(2026, 9, 15, 12)).progress.explore).toBe(0);
  });

  it('only awards completed challenges once', () => {
    const day = new Date(2026, 9, 14, 12);
    const challenge = readDailyChallenges(day).challenges.find((item) => item.metric === 'draw')!;
    expect(claimDailyChallenge(challenge.id, day)).toBeNull();
    expect(recordDailyChallengeProgress('draw', challenge.target, day)).toBe(true);
    expect(claimDailyChallenge(challenge.id, day)).toBe(challenge.reward);
    expect(claimDailyChallenge(challenge.id, day)).toBeNull();
    expect(readDailyChallenges(day).claimed).toEqual([challenge.id]);
  });

  it('ignores invalid and non-positive progress', () => {
    expect(recordDailyChallengeProgress('place', 0)).toBe(false);
    expect(recordDailyChallengeProgress('place', 1.2)).toBe(false);
    expect(readDailyChallenges().progress.place).toBe(0);
  });
});
