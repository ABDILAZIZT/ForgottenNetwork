import { Camera } from './Camera';
import { GifFrame } from './GifDecoder';
import { CHUNK_PX } from './Chunk';

export type EntityType =
  | 'creature'
  | 'structure'
  | 'sign'
  | 'hologram'
  | 'ambient_prop'
  | 'floating_object'
  | 'environmental_decoration'
  | 'wandering_creature' // Legacy/System
  | 'static_spirit'
  | 'glitch_creature'
  | 'floating_machine'
  | 'animated_sign'
  | 'gif_entity'
  | 'uploaded_custom';

export type EntityBehavior =
  'wander' | 'stationary' | 'follow_light' | 'sleep' | 'group' | 'hide' | 'float' | 'sway';
export type EntityAnchor = 'feet' | 'center';

export interface EntityLayer {
  name: string;
  url?: string;
  color?: string;
  offsetY?: number;
  offsetX?: number;
  scale?: number;
  rotation?: number;
  bobbing?: boolean;
  breathing?: boolean;
  swaying?: boolean;
  blinking?: boolean;
  visible?: boolean;
}

export interface EntityState {
  name?: string;
  description?: string;
  creatorId?: string;
  creatorName?: string;
  id: string;
  type: EntityType;
  wx: number;
  wy: number;
  text?: string;
  color?: string;
  createdAt: number;
  layers?: EntityLayer[];
  behavior?: EntityBehavior;
  vfx?: {
    glow?: boolean;
    flicker?: boolean;
    scanlines?: boolean;
    pixelDissolve?: number;
    hologram?: boolean;
  };
  spriteUrl?: string;
  frames?: string[];
  scale?: number;
  opacity?: number;
  anchor?: EntityAnchor;
}

export class Entity {
  public id: string;
  public type: EntityType;
  public wx: number;
  public wy: number;
  public text?: string;
  public color: string;
  public createdAt: number;
  public behavior: EntityBehavior;
  public layers: EntityLayer[] = [];
  public scale: number = 1;
  public vfx: any = {};
  public width: number = 40;
  public height: number = 40;
  public spriteUrl?: string;
  public frames?: string[];
  public anchor: EntityAnchor;

  // Animation state
  private phase = Math.random() * Math.PI * 2;
  private currentFrame = 0;
  private frameTimer = 0;
  private gifFrames: GifFrame[] | null = null;

  // AI state
  private vx = 0;
  private vy = 0;
  private targetX = 0;
  private targetY = 0;
  private stateTimer = 0;
  private actionState: 'idle' | 'moving' | 'sleeping' = 'idle';
  private flipX = false;

  // Cache for loaded images
  private imageCache: Map<string, HTMLImageElement> = new Map();

  constructor(state: EntityState) {
    this.id = state.id;
    this.type = state.type;
    this.wx = state.wx;
    this.wy = state.wy;
    this.text = state.text;
    this.color = state.color || '#ffffff';
    this.createdAt = state.createdAt || Date.now();
    this.behavior =
      state.behavior || (this.type === 'wandering_creature' ? 'wander' : 'stationary');
    this.layers = state.layers || [];
    this.scale = state.scale || 1;
    this.vfx = state.vfx || {};
    this.spriteUrl = state.spriteUrl;
    this.anchor =
      state.anchor ||
      (this.type === 'uploaded_custom' || this.type === 'gif_entity' ? 'center' : 'feet');

    this.targetX = this.wx;
    this.targetY = this.wy;

    // Handle legacy spriteUrl or missing layers
    if (this.layers.length === 0 && !state.spriteUrl) {
      // Procedural fallback layer
      this.layers = [{ name: 'body', color: this.color }];
    } else if (state.spriteUrl && this.layers.length === 0) {
      this.layers = [{ name: 'main', url: state.spriteUrl }];
    } else if (!this.layers || this.layers.length === 0) {
      this.generateDefaultLayers();
    }

    this.loadLayers();
  }

  private generateDefaultLayers() {
    switch (this.type) {
      case 'wandering_creature':
        this.layers = [
          { name: 'body', color: this.color, scale: 1.1, breathing: true },
          { name: 'head', color: this.color, offsetY: -10, bobbing: true },
          { name: 'eyes', color: '#000000', offsetY: -12, scale: 0.2 },
        ];
        break;
      case 'static_spirit':
        this.layers = [{ name: 'core', color: this.color, scale: 0.8, bobbing: true }];
        this.vfx.glow = true;
        break;
      case 'floating_machine':
        this.layers = [
          { name: 'hull', color: this.color, scale: 1, bobbing: true },
          { name: 'antenna', color: '#ffffff', offsetY: -15, scale: 0.2 },
        ];
        this.vfx.scanlines = true;
        break;
      case 'glitch_creature':
        this.layers = [{ name: 'fragment', color: this.color, scale: 0.9, bobbing: true }];
        this.vfx.flicker = true;
        break;
      case 'animated_sign':
        this.layers = [
          { name: 'panel', color: '#222222', scale: 2, offsetY: -20 },
          { name: 'glow', color: this.color, scale: 1.8, offsetY: -20 },
        ];
        this.vfx.glow = true;
        break;
    }
    // Update default sizes
    if (this.type === 'animated_sign') {
      this.width = 60;
      this.height = 40;
    } else {
      this.width = 30;
      this.height = 30;
    }
  }

  public loadLayers() {
    // Load frame images
    if (this.frames) {
      for (const url of this.frames) {
        if (!url || url.startsWith('asset:')) continue; // Skip unresolved
        if (!this.imageCache.has(url)) {
          const img = new Image();
          img.onload = () => this.imageCache.set(url, img);
          img.onerror = () => console.error('Failed to load frame:', url);
          img.src = url;
        }
      }
    }

    // Load layer images
    for (const layer of this.layers) {
      if (layer.url && !layer.url.startsWith('asset:') && !this.imageCache.has(layer.url)) {
        const img = new Image();
        img.onload = () => {
          this.imageCache.set(layer.url!, img);
          if (layer.name === 'main' || layer.name === 'body') {
            // Clamp dimensions to prevent massive images from lagging the canvas
            const MAX_DIM = 200;
            let w = img.width;
            let h = img.height;
            if (w > MAX_DIM || h > MAX_DIM) {
              const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
              w *= ratio;
              h *= ratio;
            }
            this.width = w || this.width;
            this.height = h || this.height;
          }
        };
        img.onerror = () => console.error('Failed to load layer image:', layer.url);
        img.src = layer.url;
      }
    }
  }

  setGifFrames(frames: GifFrame[]) {
    this.gifFrames = frames;
    if (frames.length > 0) {
      this.width = frames[0].canvas.width;
      this.height = frames[0].canvas.height;
    }
  }

  update(dt: number, _time: number, getChunk: (cx: number, cy: number) => any) {
    this.phase += dt;

    // Update animation frame
    if (this.gifFrames && this.gifFrames.length > 0) {
      this.frameTimer += dt * 1000;
      const currentDelay = this.gifFrames[this.currentFrame].delay || 100;
      if (this.frameTimer >= currentDelay) {
        this.currentFrame = (this.currentFrame + 1) % this.gifFrames.length;
        this.frameTimer = 0;
      }
    } else if (this.frames && this.frames.length > 0) {
      this.frameTimer += dt * 1000;
      if (this.frameTimer >= 100) {
        // Fixed 100ms for custom frames
        this.currentFrame = (this.currentFrame + 1) % this.frames.length;
        this.frameTimer = 0;
      }
    }

    // AI Logic
    this.updateAI(dt, getChunk);
  }

  private updateAI(dt: number, getChunk: (cx: number, cy: number) => any) {
    if (this.behavior === 'stationary' || this.behavior === 'sleep') return;

    this.stateTimer -= dt;
    if (this.stateTimer <= 0) {
      if (this.actionState === 'idle') {
        this.actionState = 'moving';
        this.stateTimer = 2 + Math.random() * 5;
        const angle = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * 150;
        this.targetX = this.wx + Math.cos(angle) * dist;
        this.targetY = this.wy + Math.sin(angle) * dist;
      } else {
        this.actionState = 'idle';
        this.stateTimer = 1 + Math.random() * 3;
      }
    }

    if (this.actionState === 'moving') {
      const dx = this.targetX - this.wx;
      const dy = this.targetY - this.wy;
      const dist = Math.hypot(dx, dy);

      if (dist > 2) {
        const speed = this.type === 'floating_machine' ? 30 : 20;
        this.vx = (dx / dist) * speed;
        this.vy = (dy / dist) * speed;

        // Collision avoidance
        const nextX = this.wx + this.vx * dt;
        const nextY = this.wy + this.vy * dt;

        const cx = Math.floor(nextX / CHUNK_PX);
        const cy = Math.floor(nextY / CHUNK_PX);
        const chunk = getChunk(cx, cy);

        const lx = Math.floor(nextX - cx * CHUNK_PX);
        const ly = Math.floor(nextY - cy * CHUNK_PX);

        if (chunk && chunk.isSolid(lx, ly)) {
          // Hit a wall, stop or bounce
          this.actionState = 'idle';
          this.stateTimer = 0.5;
        } else {
          this.wx = nextX;
          this.wy = nextY;
          this.flipX = this.vx < 0;
        }
      } else {
        this.actionState = 'idle';
      }
    }
  }

  public getBounds(padding = 0) {
    const w = this.width * this.scale;
    const h = this.height * this.scale;
    const left = this.wx - w / 2 - padding;
    const right = this.wx + w / 2 + padding;
    const top = this.anchor === 'center' ? this.wy - h / 2 - padding : this.wy - h - padding;
    const bottom = this.anchor === 'center' ? this.wy + h / 2 + padding : this.wy + padding;

    return { left, right, top, bottom };
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, W: number, H: number, _time: number) {
    const bounds = this.getBounds(24);
    const screenTopLeft = camera.worldToScreen(bounds.left, bounds.top, W, H);
    const screenBottomRight = camera.worldToScreen(bounds.right, bounds.bottom, W, H);

    if (
      screenBottomRight.x < 0 ||
      screenTopLeft.x > W ||
      screenBottomRight.y < 0 ||
      screenTopLeft.y > H
    ) {
      return;
    }

    const s = camera.worldToScreen(this.wx, this.wy, W, H);
    const z = camera.zoom;
    const finalScale = this.scale * z;

    ctx.save();
    ctx.translate(s.x, s.y);

    // Draw Frame Animation (GIF or User-Drawn)
    let drawn = false;
    if (this.gifFrames && this.gifFrames.length > 0) {
      const frame = this.gifFrames[this.currentFrame];
      const dw = frame.canvas.width * finalScale;
      const dh = frame.canvas.height * finalScale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(frame.canvas, -dw / 2, this.anchorY(dh), dw, dh);
      drawn = true;
    } else if (this.frames && this.frames.length > 0) {
      const frameUrl = this.frames[this.currentFrame];
      if (this.imageCache.has(frameUrl)) {
        const img = this.imageCache.get(frameUrl)!;
        const dw = this.width * finalScale;
        const dh = this.height * finalScale;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, -dw / 2, this.anchorY(dh), dw, dh);
        drawn = true;
      }
    }

    if (!drawn) {
      // Draw layers
      for (const layer of this.layers) {
        if (layer.visible === false) continue;

        ctx.save();

        // Procedural animation
        let bob = 0;
        if (layer.bobbing || this.type === 'floating_object') {
          bob = Math.sin(this.phase * 2) * 4 * z;
        }

        if (this.flipX) ctx.scale(-1, 1);

        const lx = (layer.offsetX || 0) * z;
        const ly = (layer.offsetY || 0) * z - bob;
        const ls = (layer.scale || 1) * finalScale;

        if (layer.url && this.imageCache.has(layer.url)) {
          const img = this.imageCache.get(layer.url)!;
          // Use pre-clamped dimensions
          const dw = this.width * ls;
          const dh = this.height * ls;
          ctx.drawImage(img, lx - dw / 2, ly + this.anchorY(dh), dw, dh);
        } else if (!layer.url) {
          // No URL at all - procedural fallback
          ctx.fillStyle = layer.color || this.color;
          const size = 10 * ls;
          ctx.fillRect(lx - size / 2, ly + this.anchorY(size), size, size);
        }

        ctx.restore();
      }
    }

    if (this.anchor === 'feet') {
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.beginPath();
      ctx.ellipse(0, 2 * z, 10 * z, 4 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private anchorY(height: number) {
    return this.anchor === 'center' ? -height / 2 : -height;
  }

  serialize(): EntityState {
    return {
      id: this.id,
      type: this.type,
      wx: this.wx,
      wy: this.wy,
      text: this.text,
      color: this.color,
      createdAt: this.createdAt,
      layers: this.layers,
      behavior: this.behavior,
      vfx: this.vfx,
      scale: this.scale,
      spriteUrl: this.spriteUrl,
      anchor: this.anchor,
    };
  }
}
