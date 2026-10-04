/**
 * Camera — smooth cinematic world camera with inertia, zoom-towards-cursor, and touch support.
 */
export class Camera {
  public reducedMotion = false;
  public x = 0;
  public y = 0;
  public zoom = 1.5;

  // Smooth targets
  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1.5;

  // Inertia velocity
  private vx = 0;
  private vy = 0;

  // Tuning
  private readonly LERP = 0.1;
  private readonly ZOOM_LERP = 0.08;
  private readonly FRICTION = 0.88;
  private readonly MIN_ZOOM = 0.15;
  private readonly MAX_ZOOM = 6;

  public update() {
    if (this.reducedMotion) {
      this.vx = this.vy = 0;
      this.x = this.targetX;
      this.y = this.targetY;
      this.zoom = this.targetZoom;
      return;
    }
    // Apply inertia to target
    this.targetX += this.vx;
    this.targetY += this.vy;
    this.vx *= this.FRICTION;
    this.vy *= this.FRICTION;

    // Smooth lerp towards target
    this.x += (this.targetX - this.x) * this.LERP;
    this.y += (this.targetY - this.y) * this.LERP;
    this.zoom += (this.targetZoom - this.zoom) * this.ZOOM_LERP;
  }

  /** Called every frame of a drag. dx/dy are screen-space deltas. */
  public applyDrag(dx: number, dy: number) {
    const wx = dx / this.zoom;
    const wy = dy / this.zoom;
    this.targetX -= wx;
    this.targetY -= wy;
    // Store as inertia so it coasts after mouse-up
    this.vx = -wx * 0.3;
    this.vy = -wy * 0.3;
  }

  /** Zoom towards a screen-space point (e.g. mouse cursor). */
  public zoomAt(factor: number, screenX: number, screenY: number, width: number, height: number) {
    // Use target values for calculation to ensure smooth destination targeting
    const worldBefore = {
      x: (screenX - width / 2) / this.targetZoom + this.targetX,
      y: (screenY - height / 2) / this.targetZoom + this.targetY,
    };

    this.targetZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.targetZoom * factor));

    const worldAfter = {
      x: (screenX - width / 2) / this.targetZoom + this.targetX,
      y: (screenY - height / 2) / this.targetZoom + this.targetY,
    };

    this.targetX += worldBefore.x - worldAfter.x;
    this.targetY += worldBefore.y - worldAfter.y;
  }

  public worldToScreen(worldX: number, worldY: number, width: number, height: number) {
    return {
      x: (worldX - this.x) * this.zoom + width / 2,
      y: (worldY - this.y) * this.zoom + height / 2,
    };
  }

  public screenToWorld(screenX: number, screenY: number, width: number, height: number) {
    return {
      x: (screenX - width / 2) / this.zoom + this.x,
      y: (screenY - height / 2) / this.zoom + this.y,
    };
  }

  public teleportTo(wx: number, wy: number) {
    this.x = this.targetX = wx;
    this.y = this.targetY = wy;
    this.vx = this.vy = 0;
  }

  public setZoom(zoom: number) {
    this.zoom = this.targetZoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, zoom));
  }
}
