import { afterEach, expect, it, vi } from 'vitest';
import { download } from './download';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('attaches download to the document and keeps its object URL alive until the browser can consume it', () => {
  vi.useFakeTimers();
  const revoke = vi.fn(),
    append = vi.fn();
  const link = {
    href: '',
    download: '',
    hidden: false,
    click: vi.fn(),
    remove: vi.fn(),
  };
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: revoke });
  vi.stubGlobal('document', { createElement: () => link, body: { appendChild: append } });
  download(new Blob(['test']), 'canvas.png');
  expect(link.download).toBe('canvas.png');
  expect(link.click).toHaveBeenCalledOnce();
  expect(append).toHaveBeenCalledWith(link);
  expect(append.mock.invocationCallOrder[0]).toBeLessThan(link.click.mock.invocationCallOrder[0]);
  expect(link.remove).toHaveBeenCalledOnce();
  expect(revoke).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60000);
  expect(revoke).toHaveBeenCalledWith('blob:test');
});
