import { afterEach, expect, it, vi } from 'vitest';
import { readDraftMode, saveDraftMode } from './draftPreference';
afterEach(() => {
  vi.unstubAllGlobals();
});
it('restores the preference across instances and isolates identities', () => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  expect(readDraftMode('alice')).toBe(true);
  saveDraftMode('alice', true);
  expect(readDraftMode('alice')).toBe(true);
  saveDraftMode('bob', false);
  expect(readDraftMode('bob')).toBe(false);
  expect(readDraftMode('alice')).toBe(true);
});
it('fails safely when storage is unavailable', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('denied');
    },
  });
  expect(readDraftMode('alice')).toBe(true);
  expect(readDraftMode()).toBe(true);
});
