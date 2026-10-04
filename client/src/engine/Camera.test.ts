import { describe, expect, it } from 'vitest';
import { Camera } from './Camera';

describe('Camera', () => {
  it('reduced motion applies movement without camera drift', () => {
    const camera = new Camera();
    camera.reducedMotion = true;
    camera.setZoom(2);
    camera.applyDrag(40, 20);
    camera.update();
    expect(camera.x).toBe(-20);
    expect(camera.y).toBe(-10);
    camera.update();
    expect(camera.x).toBe(-20);
    expect(camera.zoom).toBe(2);
  });
  it('round-trips world and screen coordinates', () => {
    const camera = new Camera();
    camera.teleportTo(120, -45);

    const screen = camera.worldToScreen(200, 35, 1280, 720);
    const world = camera.screenToWorld(screen.x, screen.y, 1280, 720);

    expect(world.x).toBeCloseTo(200);
    expect(world.y).toBeCloseTo(35);
  });

  it('teleports immediately without residual inertia', () => {
    const camera = new Camera();
    camera.applyDrag(80, 40);
    camera.teleportTo(500, -300);
    camera.update();

    expect(camera.x).toBe(500);
    expect(camera.y).toBe(-300);
  });

  it('keeps zoom inside its supported range', () => {
    const camera = new Camera();
    for (let index = 0; index < 100; index += 1) camera.zoomAt(10, 0, 0, 100, 100);
    for (let index = 0; index < 200; index += 1) camera.update();
    expect(camera.zoom).toBeLessThanOrEqual(6);

    for (let index = 0; index < 100; index += 1) camera.zoomAt(0.01, 0, 0, 100, 100);
    for (let index = 0; index < 200; index += 1) camera.update();
    expect(camera.zoom).toBeGreaterThanOrEqual(0.15);
  });
});
