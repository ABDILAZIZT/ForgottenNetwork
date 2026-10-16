import css from './index.css?raw';
import { expect, it } from 'vitest';
const luminance = (hex: string) => {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
it.each([':root', ":root[data-theme='light']"])('provides AA text contrast in %s', (selector) => {
  const start = css.indexOf(selector + ' {');
  const block = css.slice(start, css.indexOf('}', start));
  const tokens = Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((m) => [m[1], m[2]]),
  );
  for (const background of ['surface', 'surface-hi', 'bg'])
    for (const ink of [
      'text',
      'text-muted',
      'accent',
      'accent-2',
      'warning',
      'danger',
      'success',
    ]) {
      expect(tokens, block).toHaveProperty(background);
      expect(tokens, block).toHaveProperty(ink);
      const a = luminance(tokens[background]),
        b = luminance(tokens[ink]);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        ink + ' on ' + background,
      ).toBeGreaterThanOrEqual(4.5);
    }
  const a = luminance(tokens['accent-fill']),
    b = luminance(tokens['on-accent']);
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
