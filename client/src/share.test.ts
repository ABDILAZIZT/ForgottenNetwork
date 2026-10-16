import { afterEach, expect, it, vi } from 'vitest';
import { shareLink } from './share';
afterEach(() => {
  vi.unstubAllGlobals();
});
function fallback(copied = false) {
  const field = {
    value: '',
    style: { cssText: '' },
    setAttribute: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
  };
  const focus = vi.fn();
  vi.stubGlobal('document', {
    activeElement: { focus },
    createElement: () => field,
    body: { append: vi.fn() },
    execCommand: vi.fn(() => copied),
  });
  return { field, focus };
}
it('copies via the clipboard when available', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  expect(await shareLink('https://example.test')).toBe('copied');
  expect(writeText).toHaveBeenCalledWith('https://example.test');
});
it('falls back to native sharing after clipboard rejection', async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockRejectedValue(Error()) },
    share,
  });
  expect(await shareLink('https://example.test')).toBe('shared');
});
it('copies in insecure contexts and restores focus', async () => {
  vi.stubGlobal('navigator', {});
  const { field, focus } = fallback(true);
  expect(await shareLink('https://example.test')).toBe('copied');
  expect(field.remove).toHaveBeenCalledOnce();
  expect(focus).toHaveBeenCalledOnce();
});
it('requests a selectable link when all automatic methods fail', async () => {
  vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(Error()) });
  const { field } = fallback();
  expect(await shareLink('https://example.test')).toBe('manual');
  expect(field.value).toBe('https://example.test');
  expect(field.remove).toHaveBeenCalledOnce();
});
it('treats a dismissed share sheet as cancellation', async () => {
  vi.stubGlobal('navigator', {
    share: vi.fn().mockRejectedValue(new DOMException('', 'AbortError')),
  });
  expect(await shareLink('https://example.test')).toBe('cancelled');
});
