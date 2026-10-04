import { describe, expect, it, vi } from 'vitest';
import { WorldEngine } from './Engine';
import { Camera } from './Camera';

function createRenderer() {
  const calls: string[] = [];
  const ctx = {
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      if (ctx.fillStyle === '#03060a') {
        expect([x, y, width, height]).toEqual([0, 0, 800, 600]);
        calls.push('background');
      } else calls.push('glow');
    }),
    strokeRect: vi.fn(),
  };
  const camera = new Camera();
  const atmosphere = { render: vi.fn(() => calls.push('atmosphere')) };
  // Exercise the real frame renderer without starting DOM listeners, storage or animation timers.
  const engine = Object.assign(Object.create(WorldEngine.prototype), {
    canvas: { width: 800, height: 600 },
    ctx,
    camera,
    atmosphere,
    entityManager: { render: vi.fn(() => calls.push('entities')) },
    chunks: new Map([
      ['0,0', { cx: 0, cy: 0, zoneType: 'living', draw: () => calls.push('chunk') }],
    ]),
    tool: 'pan',
  }) as { render(t: number): void; setReducedMotion(value: boolean): void };
  return { engine, camera, calls, atmosphere };
}

describe('world frame clearing', () => {
  it.each([false, true])('repaints every frame with reduced motion %s', (reducedMotion) => {
    const { engine, camera, calls, atmosphere } = createRenderer();
    engine.setReducedMotion(reducedMotion);
    for (let frame = 0; frame < 3; frame++) {
      calls.length = 0;
      camera.teleportTo(frame * 10, frame * -5);
      camera.setZoom(1 + frame * 0.2);
      engine.render(reducedMotion ? 0 : frame);
      expect(calls[0]).toBe('background');
      expect(calls.filter((call) => call === 'background')).toHaveLength(1);
      expect(calls).toContain('chunk');
      expect(calls).toContain('entities');
      expect(calls[calls.length - 1]).toBe('glow');
    }
    expect(atmosphere.render).toHaveBeenCalledTimes(reducedMotion ? 0 : 3);
  });

  it('clears immediately when switching modes, including old accumulated glow', () => {
    const { engine, calls } = createRenderer();
    for (const reducedMotion of [false, true, false, true]) {
      calls.length = 0;
      engine.setReducedMotion(reducedMotion);
      engine.render(0);
      expect(calls[0]).toBe('background');
    }
  });
});
