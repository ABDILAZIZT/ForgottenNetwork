import { expect, it } from 'vitest';
import { getArtRevision, resetArtMedia, setArtSession } from './art';
it('invalidates viewport pixels immediately on identity changes and moderation media resets', () => {
  const initial = getArtRevision();
  setArtSession('disposable-test-session');
  expect(getArtRevision()).toBe(initial + 1);
  setArtSession('disposable-test-session');
  expect(getArtRevision()).toBe(initial + 1);
  setArtSession(undefined);
  expect(getArtRevision()).toBe(initial + 2);
  resetArtMedia();
  expect(getArtRevision()).toBe(initial + 3);
});
