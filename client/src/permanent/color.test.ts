import { expect, it } from 'vitest';
import { hex, rgb, hsv, fromHsv } from './color';
it('round trips primary, neutral and custom colors without channel drift', () => {
  for (const value of [
    '#000000',
    '#ffffff',
    '#ff0000',
    '#00ff00',
    '#0000ff',
    '#a78bfa',
    '#12ab78',
  ]) {
    expect(hex(rgb(value))).toBe(value);
    const [h, s, v] = hsv(value);
    expect(fromHsv(h, s, v)).toBe(value);
  }
});
