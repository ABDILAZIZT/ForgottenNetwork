import { expect, it, vi } from 'vitest';
import { PermanentEngine } from './CanvasEngine';
import { drawArt } from './art';
it('pixel size reaches rendering and imported artwork remains a draft even in direct publish mode', () => {
  const commit = vi.fn(),
    drafts = vi.fn();
  const engine = Object.assign(Object.create(PermanentEngine.prototype), {
    settings: { tool: 'pixel', size: 16, color: '#ffffff', opacity: 1, draftMode: false },
    draftList: [],
    hooks: { commit, drafts },
  });
  const art = engine.make([
    [20, 20],
    [40, 20],
  ]);
  expect(art.content.size).toBe(16);
  const fillRect = vi.fn();
  drawArt(
    {
      save() {},
      restore() {},
      translate() {},
      fillRect,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D,
    art,
  );
  expect(fillRect.mock.calls.length).toBeGreaterThan(1);
  expect(fillRect.mock.calls.every((call) => call[2] === 16 && call[3] === 16)).toBe(true);
  engine.stage(art);
  expect(commit).not.toHaveBeenCalled();
  expect(drafts).toHaveBeenCalledWith(1);
  expect(engine.draftList).toEqual([art]);
});
it('shape fill and border settings affect newly created placements immediately', () => {
  const engine = Object.assign(Object.create(PermanentEngine.prototype), {
    settings: {
      tool: 'rectangle',
      size: 12,
      color: '#abcdef',
      strokeColor: '#112233',
      opacity: 0.5,
      fill: false,
    },
  });
  const outline = engine.make([
    [10, 10],
    [70, 60],
  ]);
  expect(outline.content).toMatchObject({
    fill: false,
    size: 12,
    strokeColor: '#112233',
    opacity: 0.5,
  });
  engine.settings.fill = true;
  engine.settings.size = 3;
  expect(
    engine.make([
      [10, 10],
      [70, 60],
    ]).content,
  ).toMatchObject({ fill: true, size: 3 });
});
