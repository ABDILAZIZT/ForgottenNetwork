import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canRequestDisplayAds, readAdConsent, saveAdConsent } from './ads';

describe('optional advertising consent gates', () => {
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

  it('starts unset and stores an explicit accept or reject choice', () => {
    expect(readAdConsent()).toBe('unset');
    expect(saveAdConsent('accepted')).toBe(true);
    expect(readAdConsent()).toBe('accepted');
    expect(saveAdConsent('rejected')).toBe(true);
    expect(readAdConsent()).toBe('rejected');
  });

  it('does not request ads without an enabled production build and consent platform', async () => {
    expect(await canRequestDisplayAds()).toBe(false);
    saveAdConsent('accepted');
    expect(await canRequestDisplayAds()).toBe(false);
  });
});
