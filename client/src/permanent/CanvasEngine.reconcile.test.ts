import { expect, it } from 'vitest';
import { PermanentEngine } from './CanvasEngine';
import type { Artwork } from './types';
it('authoritative snapshots recover missed restores and reject older deletion state', () => {
  const occupied = new Map();
  const engine = Object.assign(Object.create(PermanentEngine.prototype), {
    elements: new Map(),
    occupied,
    removed: new Set(),
    mutationEpoch: 0,
    reconciledRevision: -1,
  }) as PermanentEngine;
  const art: Artwork = {
    id: 'art-12345',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 8,
    height: 8,
    content: { color: '#ffffff', opacity: 1, size: 4 },
    ownerId: 'artist',
    ownerName: 'Artist',
    ownerColor: '#ffffff',
    timestamp: '',
    zIndex: 1,
    cells: [[0, 0]],
  };
  const bounds = { x: -10, y: -10, width: 100, height: 100 };
  engine.add([art]);
  engine.remove([art.id]);
  expect(engine.elements.size).toBe(0);
  engine.reconcile([art], bounds, 1, 2);
  expect(engine.elements.has(art.id)).toBe(true);
  engine.reconcile([], bounds, 1, 1);
  expect(engine.elements.has(art.id)).toBe(true);
  engine.reconcile([], bounds, 1, 3);
  expect(engine.elements.size).toBe(0);
  expect(occupied.size).toBe(0);
});
