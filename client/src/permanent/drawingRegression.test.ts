import { PermanentEngine } from './CanvasEngine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { availablePlacementCells } from './geometry';
import { drawBrush, strokeDabs } from './brushes';
import type { Artwork, Placement } from './types';

const mark: Placement = {
  id: 'brush-test',
  type: 'brush',
  x: 0,
  y: 0,
  width: 24,
  height: 8,
  content: {
    color: '#ff0000',
    opacity: 1,
    size: 2,
    points: [
      [4, 4],
      [20, 4],
    ],
  },
};
const owner = { ...mark, ownerId: 'alice', cells: [[1, 0]] } as Artwork;
const occupied = new Map([['1,0', owner]]);
describe('ownership while drawing, pending, and in draft mode', () => {
  it('keeps another artist visible while allowing free space and owner overlays', () => {
    expect(availablePlacementCells(mark, occupied, 'bob')).toEqual([
      [0, 0],
      [2, 0],
    ]);
    expect(availablePlacementCells(mark, occupied, 'alice')).toContainEqual([1, 0]);
    expect(availablePlacementCells(mark, occupied)).not.toContainEqual([1, 0]);
  });
  it('does not preview partial shapes that the server will reject', () => {
    expect(availablePlacementCells({ ...mark, type: 'rectangle' }, occupied, 'bob')).toEqual([]);
  });
});
it('brush textures differ in footprint and do not leak through blur filters', () => {
  const outputs = ['ink', 'pencil', 'marker', 'airbrush'].map((brush) => {
    const ctx = {
      globalAlpha: 1,
      filter: 'none',
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      rect: vi.fn(),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    };
    drawBrush(
      ctx as unknown as CanvasRenderingContext2D,
      { ...mark.content, size: 16, brush: brush as 'ink' },
      0,
      0,
    );
    expect(ctx.filter).toBe('none');
    return ctx;
  });
  expect(outputs[0].stroke).toHaveBeenCalledOnce();
  expect(outputs[1].fillRect.mock.calls.length).toBeGreaterThan(9);
  expect(outputs[2].rect.mock.calls.every((c) => c[2] === 16 && c[3] === 6.4)).toBe(true);
  expect(outputs[2].fill).toHaveBeenCalledOnce();
  expect(outputs[3].createRadialGradient).toHaveBeenCalledOnce();
  expect(outputs[3].stroke).not.toHaveBeenCalled();
});
it('resamples the same path consistently across different pointer-event frequencies', () => {
  expect(
    strokeDabs(
      [
        [0, 0],
        [5, 0],
        [10, 0],
      ],
      3,
    ),
  ).toEqual(
    strokeDabs(
      [
        [0, 0],
        [10, 0],
      ],
      3,
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});
function drawingEngine(tool: 'brush' | 'pixel' = 'brush') {
  const events = new Map<string, (event: PointerEvent) => void>();
  const captures = new Set<number>();
  const canvas = {
    clientWidth: 1000,
    clientHeight: 600,
    width: 1000,
    height: 600,
    dataset: {},
    getContext: () => ({}),
    getBoundingClientRect: () => ({ left: 20, top: 30 }),
    addEventListener: (name: string, handler: (event: PointerEvent) => void) =>
      events.set(name, handler),
    setPointerCapture: (id: number) => captures.add(id),
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: (id: number) => captures.delete(id),
  };
  vi.stubGlobal('window', { addEventListener: vi.fn() });
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn() });
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const committed: Placement[] = [];
  const engine = new PermanentEngine(canvas as unknown as HTMLCanvasElement, {
    commit: (e) => committed.push(e),
    view: vi.fn(),
    hover: vi.fn(),
    select: vi.fn(),
    cursor: vi.fn(),
    preview: vi.fn(),
    drafts: vi.fn(),
    export: vi.fn(),
    signIn: vi.fn(),
    eraseArtwork: vi.fn(),
  });
  engine.camera.setZoom(1);
  engine.configure({ ...engine.settings, tool, enabled: true, size: 9, smoothing: 1 });
  const event = (x: number, y = 0, samples?: PointerEvent[]): PointerEvent =>
    ({
      clientX: x + 520,
      clientY: y + 330,
      offsetX: -999,
      offsetY: -999,
      pointerId: 1,
      button: 0,
      preventDefault: vi.fn(),
      getCoalescedEvents: () => samples || [],
    }) as unknown as PointerEvent;
  return {
    engine,
    committed,
    captures,
    event,
    send: (name: string, e: PointerEvent) => events.get(name)!(e),
  };
}
it.each(['brush', 'pixel'] as const)(
  'joins long fast %s strokes across the size limit and retains the final point',
  (tool) => {
    const { engine, committed, captures, event, send } = drawingEngine(tool);
    send('pointerdown', event(0));
    send('pointermove', event(1400, 100, [event(500, 25), event(900, 75)]));
    send('pointerleave', event(1400, 100));
    expect(captures.has(1)).toBe(true);
    send('pointerup', event(1500, 120));
    expect(committed.length).toBeGreaterThan(2);
    for (let i = 0; i < committed.length; i++) {
      const segment = committed[i],
        points = segment.content.points!;
      expect(segment.width).toBeLessThanOrEqual(512);
      expect(segment.height).toBeLessThanOrEqual(512);
      if (i) expect(points[0]).toEqual(committed[i - 1].content.points!.slice(-1)[0]);
      for (let j = 1; j < points.length; j++)
        expect(
          Math.hypot(points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1]),
        ).toBeLessThanOrEqual(2.000001);
    }
    expect(committed[0].content.points![0]).toEqual([0, 0]);
    expect(committed.slice(-1)[0].content.points!.slice(-1)[0]).toEqual([1500, 120]);
    expect(captures.size).toBe(0);
    engine.destroy();
  },
);
it('also joins segments at the 1200 point limit', () => {
  const { engine, committed, event, send } = drawingEngine('pixel');
  send('pointerdown', event(0));
  for (let i = 1; i < 1300; i++) send('pointermove', event(i % 2));
  send('pointerup', event(0));
  expect(committed.length).toBe(2);
  expect(committed[1].content.points![0]).toEqual(committed[0].content.points!.slice(-1)[0]);
  engine.destroy();
});
it('cancellation cannot publish the abandoned stroke on a later pointerup', () => {
  const { engine, committed, event, send } = drawingEngine();
  send('pointerdown', event(0));
  send('pointermove', event(10));
  send('pointercancel', event(10));
  send('pointerup', event(20));
  expect(committed).toEqual([]);
  engine.destroy();
});
