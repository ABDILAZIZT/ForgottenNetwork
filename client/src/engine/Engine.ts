import { Camera } from './Camera';
import { Chunk, CHUNK_PX, NUM_LAYERS, ZoneType } from './Chunk';
import { Atmosphere } from './Atmosphere';
import { EntityManager } from './EntityManager';
import { Entity, EntityType } from './Entity';
import type { WorldRepository } from '../repositories';
import { readClaims, type LandClaim } from '../economy';
import { recordExploration } from '../exploration';

export type DrawTool = 'pan' | 'brush' | 'eraser' | 'fill' | 'pipette' | 'spawn' | 'delete_entity';

const SAVE_INTERVAL_FRAMES = 300; // ~5 sec @ 60fps

type LayerSnapshot = {
  chunk: Chunk;
  layer: number;
  data: Uint8ClampedArray;
};

type UndoStroke = {
  snapshots: Map<string, LayerSnapshot>;
  changed: boolean;
};

type GlowBurst = {
  wx: number;
  wy: number;
  radius: number;
  startedAt: number;
};

export class WorldEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: Camera;
  private atmosphere: Atmosphere;
  private entityManager: EntityManager;
  private chunks = new Map<string, Chunk>();
  private dirtyChunkIds = new Set<string>();
  private savingChunkIds = new Set<string>();
  private chunkEditRevisions = new Map<string, number>();
  private loadingChunkIds = new Set<string>();
  private running = false;
  private lastTime = 0;
  private frameCount = 0;
  private smoothedFrameMs = 16.67;

  // Tool state
  private tool: DrawTool = 'pan';
  private layer = 1;
  private brushSize = 1;
  private color = '#ffffff';
  private spawnType: EntityType = 'creature';
  private selectedPresetId: string | null = null;
  private spawnScale: number = 1.0;
  private isPanning = false;
  private isSpacePanning = false;
  private isDrawing = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private lastPaintWorldX = 0;
  private lastPaintWorldY = 0;
  private _cursorX = 0;
  private _cursorY = 0;
  private lastTouchX = 0;
  private lastTouchY = 0;
  private spawnPreviewEntity: Entity | null = null;
  private activeStroke: UndoStroke | null = null;
  private undoStack: LayerSnapshot[][] = [];
  private readonly MAX_UNDO = 40;
  private readonly eventController = new AbortController();
  private readonly repository: WorldRepository;
  private chunkRevision = 0;
  private readOnly = false;
  private reducedMotion = false;
  private glowBrush = false;
  private glowBursts: GlowBurst[] = [];
  private brushStyle: 'solid' | 'spray' = 'solid';
  private claims: LandClaim[] = [];
  private heatmap = false;
  private heatmapCache: { key: string; cells: number[] } | null = null;
  private lastProtectionToastAt = 0;

  // Callbacks
  onColorPick?: (color: string) => void;
  onToolChange?: (tool: DrawTool) => void;
  onSaveStatus?: (msg: string) => void;
  onSpawnScaleChange?: (scale: number) => void;

  constructor(canvas: HTMLCanvasElement, repository: WorldRepository) {
    this.canvas = canvas;
    this.repository = repository;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.camera = new Camera();
    this.atmosphere = new Atmosphere();
    this.entityManager = new EntityManager(repository, (cx, cy) => this.chunks.get(`${cx},${cy}`));
    this.resize();
    this.bindInputs();
    this.bindKeyboard();
    const { signal } = this.eventController;
    window.addEventListener('resize', () => this.resize(), { signal });
    window.addEventListener('beforeunload', () => this.saveAllChunks(), { signal });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  start() {
    this.running = true;
    this.lastTime = performance.now();
    this.loadAllChunks().then(() => requestAnimationFrame(this.loop));
  }

  stop() {
    this.running = false;
    this.eventController.abort();
    this.entityManager.dispose();
    if (!this.readOnly) {
      this.saveAllChunks();
      void this.repository.flush().catch((error) => {
        console.error('Failed to flush world repository:', error);
      });
    }
  }

  setTool(tool: DrawTool) {
    if (
      this.readOnly &&
      (tool === 'brush' ||
        tool === 'eraser' ||
        tool === 'fill' ||
        tool === 'spawn' ||
        tool === 'delete_entity')
    ) {
      this.tool = 'pan';
      this.onToolChange?.('pan');
      return;
    }
    this.tool = tool;
    if (tool !== 'spawn') this.spawnPreviewEntity = null;
  }
  setReadOnly(readOnly: boolean) {
    this.readOnly = readOnly;
    if (readOnly) this.setTool('pan');
  }
  setReducedMotion(value: boolean) {
    this.reducedMotion = value;
    this.camera.reducedMotion = value;
  }
  setGlowBrush(enabled: boolean) {
    this.glowBrush = enabled;
  }
  setBrushStyle(style: 'solid' | 'spray') {
    this.brushStyle = style;
  }
  setClaims(claims: LandClaim[]) {
    this.claims = claims;
  }
  setHeatmap(enabled: boolean) {
    this.heatmap = enabled;
  }
  setLayer(layer: number) {
    this.layer = Math.max(0, Math.min(NUM_LAYERS - 1, Math.round(layer)));
  }
  setBrushSize(size: number) {
    this.brushSize = Math.max(1, Math.min(32, Math.round(size)));
  }
  setColor(color: string) {
    if (/^#[0-9a-f]{6}$/i.test(color)) this.color = color;
  }
  setSpawnType(type: EntityType, presetId: string | null = null) {
    if (this.readOnly) return;
    this.spawnType = type;
    this.selectedPresetId = presetId;
    this.tool = 'spawn';
    this.spawnPreviewEntity = null; // Force recreation
    this.onSaveStatus?.('Place media (Scroll to scale)');
  }
  setSpawnScale(scale: number) {
    this.spawnScale = scale;
    if (this.spawnPreviewEntity) this.spawnPreviewEntity.scale = scale;
  }
  getCamera() {
    return this.camera;
  }
  getChunks() {
    return this.chunks;
  }
  getChunkRevision() {
    return this.chunkRevision;
  }
  getTool() {
    return this.tool;
  }

  teleportRandom() {
    const wx = (Math.random() - 0.5) * 4000;
    const wy = (Math.random() - 0.5) * 4000;
    this.camera.teleportTo(wx, wy);
    this.atmosphere.glitch(2);
  }

  spawnEntityAtCursor() {
    if (this.readOnly || !this.selectedPresetId) return; // Only spawn if media selected

    const W = this.canvas.width,
      H = this.canvas.height;
    const world = this.camera.screenToWorld(this._cursorX, this._cursorY, W, H);
    this.claims = readClaims();
    if (this.isProtectedChunk(Math.floor(world.x / CHUNK_PX), Math.floor(world.y / CHUNK_PX))) {
      this.reportProtectedChunk();
      return;
    }

    this.atmosphere.glitch(0.4);

    this.entityManager
      .spawnEntity(this.spawnType, world.x, world.y, '#ffffff', undefined, {
        spriteUrl: this.selectedPresetId,
        scale: this.spawnScale,
        anchor:
          this.spawnType === 'uploaded_custom' || this.spawnType === 'gif_entity'
            ? 'center'
            : 'feet',
        behavior: 'stationary',
      })
      .then(() => {
        this.onSaveStatus?.('Media manifested');
      })
      .catch((err) => {
        console.error('Spawn failed:', err);
      });
  }

  async removeEntityAtCursor() {
    if (this.readOnly) return;
    const W = this.canvas.width,
      H = this.canvas.height;
    const world = this.camera.screenToWorld(this._cursorX, this._cursorY, W, H);
    this.claims = readClaims();
    if (this.isProtectedChunk(Math.floor(world.x / CHUNK_PX), Math.floor(world.y / CHUNK_PX))) {
      this.reportProtectedChunk();
      return;
    }

    // Immediate feedback glitch
    this.atmosphere.glitch(0.2);

    try {
      if (await this.entityManager.removeEntityAt(world.x, world.y)) this.onSaveStatus?.('Removed');
    } catch {
      this.onSaveStatus?.('Could not remove media. Check sync status and try again.');
    }
  }

  undo() {
    if (this.readOnly) return;
    const frame = this.undoStack.pop();
    if (!frame) {
      this.onSaveStatus?.('Nothing to undo');
      return;
    }

    const touched = new Set<Chunk>();
    this.claims = readClaims();
    for (const snapshot of frame) {
      if (this.isProtectedChunk(snapshot.chunk.cx, snapshot.chunk.cy)) {
        this.reportProtectedChunk();
        continue;
      }
      snapshot.chunk.restoreLayer(snapshot.layer, snapshot.data);
      this.markChunkDirty(snapshot.chunk);
      touched.add(snapshot.chunk);
    }

    for (const chunk of touched) this.saveChunk(chunk);
    this.onSaveStatus?.('Undo complete');
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  private loop = (now: number) => {
    if (!this.running) return;
    const rawFrameMs = now - this.lastTime;
    const dt = Math.min(rawFrameMs / 1000, 0.05);
    this.lastTime = now;
    this.frameCount++;
    this.smoothedFrameMs = this.smoothedFrameMs * 0.95 + rawFrameMs * 0.05;

    this.camera.update();
    if (!this.reducedMotion) {
      this.atmosphere.update(dt);
      this.entityManager.update(dt, now / 1000);
    }
    this.ensureChunks();

    if (this.frameCount % SAVE_INTERVAL_FRAMES === 0) this.saveAllChunks();
    if (this.frameCount % 60 === 0) {
      this.canvas.dataset.fps = (1000 / this.smoothedFrameMs).toFixed(1);
      this.canvas.dataset.frameMs = this.smoothedFrameMs.toFixed(2);
      this.canvas.dataset.chunkCount = String(this.chunks.size);
      this.canvas.dataset.entityCount = String(this.entityManager.getEntities().length);
    }

    this.render(this.reducedMotion ? 0 : now / 1000);
    requestAnimationFrame(this.loop);
  };

  // ── Chunk management ──────────────────────────────────────────────────────

  private chunkId(cx: number, cy: number) {
    return `${cx},${cy}`;
  }

  private ensureChunks() {
    const { zoom } = this.camera;
    const W = this.canvas.width,
      H = this.canvas.height;

    // Clamp chunk calculations to prevent infinite loops when zoomed way out
    const chunkScreenSize = Math.max(1, CHUNK_PX * zoom);
    const padX = Math.min(6, Math.ceil(W / chunkScreenSize) + 1);
    const padY = Math.min(6, Math.ceil(H / chunkScreenSize) + 1);

    const camCX = Math.round(this.camera.x / CHUNK_PX);
    const camCY = Math.round(this.camera.y / CHUNK_PX);

    for (let dx = -padX; dx <= padX; dx++) {
      for (let dy = -padY; dy <= padY; dy++) {
        const cx = camCX + dx,
          cy = camCY + dy;
        const id = this.chunkId(cx, cy);
        if (!this.chunks.has(id)) this.createChunk(cx, cy);
      }
    }

    // Eviction is less frequent
    if (this.frameCount % 60 === 0) {
      const EVICT_DIST = padX + 5;
      for (const [id, chunk] of this.chunks) {
        if (Math.abs(chunk.cx - camCX) > EVICT_DIST || Math.abs(chunk.cy - camCY) > EVICT_DIST) {
          this.saveChunk(chunk);
          this.chunks.delete(id);
          this.chunkRevision += 1;
        }
      }
    }
  }

  private getZone(cx: number, cy: number): ZoneType {
    const v =
      Math.sin(cx * 0.07 + 1.3) * Math.cos(cy * 0.09 - 0.7) + Math.sin(cx * 0.13 - cy * 0.11) * 0.5;
    return v > 0.2 ? 'living' : 'static';
  }

  private createChunk(cx: number, cy: number) {
    const id = this.chunkId(cx, cy);
    const chunk = new Chunk(cx, cy, this.getZone(cx, cy));
    this.chunks.set(id, chunk);
    this.chunkRevision += 1;
    this.hydrateChunk(id);
    return chunk;
  }

  private hydrateChunk(id: string) {
    if (this.loadingChunkIds.has(id)) return;
    this.loadingChunkIds.add(id);

    this.repository
      .loadChunk(id)
      .then((record) => {
        const chunk = this.chunks.get(id);
        if (!record || !chunk || this.dirtyChunkIds.has(id)) return;
        chunk.zoneType = (record.zone as ZoneType) ?? chunk.zoneType;
        chunk.version = record.version ?? 0;
        chunk.restoreLayers(record.layers);
      })
      .catch((err) => console.warn('Failed to load chunk:', id, err))
      .finally(() => this.loadingChunkIds.delete(id));
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private render(t: number) {
    const { ctx } = this;
    const W = this.canvas.width,
      H = this.canvas.height;
    const zoom = this.camera.zoom;

    // Clear every frame independently of optional atmospheric animation.
    // Otherwise transparent chunks and screen-blended glow accumulate when motion is reduced.
    ctx.fillStyle = '#03060a';
    ctx.fillRect(0, 0, W, H);

    if (!this.reducedMotion) this.atmosphere.render(ctx, this.camera, W, H, t);

    ctx.imageSmoothingEnabled = false;
    for (const chunk of this.chunks.values()) {
      const sx = (chunk.cx * CHUNK_PX - this.camera.x) * zoom + W / 2;
      const sy = (chunk.cy * CHUNK_PX - this.camera.y) * zoom + H / 2;
      const ds = CHUNK_PX * zoom;
      if (sx + ds < 0 || sx > W || sy + ds < 0 || sy > H) continue;

      chunk.draw(ctx, sx, sy, ds);

      if (zoom > 0.4) {
        const isLiving = chunk.zoneType === 'living';
        const gridAlpha = Math.min(0.1, (zoom - 0.4) * 0.08);
        ctx.strokeStyle = isLiving
          ? `rgba(0,230,184,${gridAlpha})`
          : `rgba(100,130,160,${gridAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx + 0.5, sy + 0.5, ds - 1, ds - 1);
      }
    }

    this.entityManager.render(ctx, this.camera, W, H, t);

    if (this.tool === 'spawn') {
      this.renderSpawnPreview(t);
    } else if (this.tool === 'delete_entity') {
      this.renderDeleteCursor();
    } else if (this.isPaintTool(this.tool)) {
      this.renderBrushCursor();
    }

    this.renderChunkOverlays();
    if (!this.reducedMotion) this.renderGlowBursts();
    this.renderLivingGlow(t);
  }

  private renderDeleteCursor() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ff4466';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const r = 15;
    ctx.moveTo(this._cursorX - r, this._cursorY - r);
    ctx.lineTo(this._cursorX + r, this._cursorY + r);
    ctx.moveTo(this._cursorX + r, this._cursorY - r);
    ctx.lineTo(this._cursorX - r, this._cursorY + r);
    ctx.stroke();
    ctx.restore();
  }

  private renderLivingGlow(t: number) {
    const ctx = this.ctx;
    const W = this.canvas.width,
      H = this.canvas.height;
    const zoom = this.camera.zoom;
    const saved = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'screen';
    for (const chunk of this.chunks.values()) {
      if (chunk.zoneType !== 'living') continue;
      const sx = (chunk.cx * CHUNK_PX - this.camera.x) * zoom + W / 2;
      const sy = (chunk.cy * CHUNK_PX - this.camera.y) * zoom + H / 2;
      const ds = CHUNK_PX * zoom;
      if (sx + ds < 0 || sx > W || sy + ds < 0 || sy > H) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.4 + chunk.cx * 0.4 + chunk.cy * 0.6);
      ctx.fillStyle = `rgba(0,255,180,${(pulse * 0.055).toFixed(3)})`;
      ctx.fillRect(sx, sy, ds, ds);
    }
    ctx.globalCompositeOperation = saved;
  }

  private renderSpawnPreview(t: number) {
    const W = this.canvas.width,
      H = this.canvas.height;
    const world = this.camera.screenToWorld(this._cursorX, this._cursorY, W, H);

    // Lazy create or update preview entity
    if (!this.spawnPreviewEntity || this.spawnPreviewEntity.type !== this.spawnType) {
      this.spawnPreviewEntity = new Entity({
        id: 'preview',
        type: this.spawnType,
        wx: world.x,
        wy: world.y,
        color: '#00e6b8',
        scale: this.spawnScale,
        createdAt: Date.now(),
        spriteUrl: this.selectedPresetId || undefined,
        anchor:
          this.spawnType === 'uploaded_custom' || this.spawnType === 'gif_entity'
            ? 'center'
            : 'feet',
        behavior: 'stationary',
      });

      if (this.selectedPresetId?.startsWith('asset:')) {
        this.entityManager.resolveAssetUrl(this.selectedPresetId).then((url) => {
          if (this.spawnPreviewEntity) {
            this.spawnPreviewEntity.layers = [{ name: 'main', url }];
            this.spawnPreviewEntity.loadLayers();
          }
        });
      }
    }

    if (this.spawnPreviewEntity) {
      // FORCE POSITION TO FOLLOW MOUSE
      this.spawnPreviewEntity.wx = world.x;
      this.spawnPreviewEntity.wy = world.y;
      this.spawnPreviewEntity.scale = this.spawnScale;

      this.ctx.save();
      this.ctx.globalAlpha = 0.6;
      this.spawnPreviewEntity.draw(this.ctx, this.camera, W, H, t);
      this.ctx.restore();
    }
  }

  private renderBrushCursor() {
    const ctx = this.ctx;
    const size = Math.max(1, this.brushSize * this.camera.zoom);
    const radius = Math.max(3, size / 2);

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = this.tool === 'eraser' ? '#ff4466' : this.color;
    ctx.fillStyle =
      this.tool === 'eraser' ? 'rgba(255,68,102,0.08)' : this.hexToRgba(this.color, 0.12);

    if (this.tool === 'fill') {
      ctx.strokeStyle = '#ffee33';
      ctx.fillStyle = 'rgba(255,238,51,0.12)';
      ctx.beginPath();
      ctx.moveTo(this._cursorX - 8, this._cursorY - 4);
      ctx.lineTo(this._cursorX + 4, this._cursorY - 12);
      ctx.lineTo(this._cursorX + 10, this._cursorY + 8);
      ctx.lineTo(this._cursorX - 6, this._cursorY + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (this.tool === 'pipette') {
      ctx.strokeStyle = '#88ffee';
      ctx.beginPath();
      ctx.arc(this._cursorX, this._cursorY, 8, 0, Math.PI * 2);
      ctx.moveTo(this._cursorX + 6, this._cursorY + 6);
      ctx.lineTo(this._cursorX + 15, this._cursorY + 15);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(this._cursorX, this._cursorY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private isPaintTool(tool: DrawTool) {
    return tool === 'brush' || tool === 'eraser' || tool === 'fill' || tool === 'pipette';
  }

  private screenToWorldPoint(screenX = this._cursorX, screenY = this._cursorY) {
    return this.camera.screenToWorld(screenX, screenY, this.canvas.width, this.canvas.height);
  }

  private worldToChunkPixel(wx: number, wy: number) {
    const worldX = Math.floor(wx);
    const worldY = Math.floor(wy);
    const cx = Math.floor(worldX / CHUNK_PX);
    const cy = Math.floor(worldY / CHUNK_PX);
    return {
      cx,
      cy,
      px: worldX - cx * CHUNK_PX,
      py: worldY - cy * CHUNK_PX,
    };
  }

  private getOrCreateChunk(cx: number, cy: number) {
    const id = this.chunkId(cx, cy);
    let chunk = this.chunks.get(id);
    if (!chunk) chunk = this.createChunk(cx, cy);
    return chunk;
  }

  private markChunkDirty(chunk: Chunk) {
    this.dirtyChunkIds.add(chunk.id);
    this.chunkEditRevisions.set(chunk.id, (this.chunkEditRevisions.get(chunk.id) || 0) + 1);
  }

  private beginStroke() {
    this.claims = readClaims();
    this.activeStroke = { snapshots: new Map(), changed: false };
  }

  private snapshotForChange(chunk: Chunk) {
    if (!this.activeStroke) this.beginStroke();
    const key = `${chunk.id}:${this.layer}`;
    if (!this.activeStroke!.snapshots.has(key)) {
      this.activeStroke!.snapshots.set(key, {
        chunk,
        layer: this.layer,
        data: chunk.snapshotLayer(this.layer),
      });
    }
  }

  private commitStroke() {
    if (!this.activeStroke) return;
    if (this.activeStroke.changed) {
      const frame = Array.from(this.activeStroke.snapshots.values());
      let painted = 0;
      for (const snapshot of frame) {
        const after = snapshot.chunk.snapshotLayer(snapshot.layer);
        for (let i = 0; i < after.length; i += 4)
          if (
            after[i + 3] &&
            (after[i] !== snapshot.data[i] ||
              after[i + 1] !== snapshot.data[i + 1] ||
              after[i + 2] !== snapshot.data[i + 2] ||
              after[i + 3] !== snapshot.data[i + 3])
          )
            painted++;
      }
      if (painted)
        recordExploration(
          this.lastPaintWorldX,
          this.lastPaintWorldY,
          painted,
          `You painted ${painted} pixels`,
        );
      this.undoStack.push(frame);
      if (this.undoStack.length > this.MAX_UNDO) this.undoStack.shift();

      const touched = new Set(frame.map((snapshot) => snapshot.chunk));
      for (const chunk of touched) this.saveChunk(chunk);
      if (this.glowBrush && (this.tool === 'brush' || this.tool === 'eraser')) {
        this.glowBursts.push({
          wx: this.lastPaintWorldX,
          wy: this.lastPaintWorldY,
          radius: Math.max(8, this.brushSize * 5),
          startedAt: performance.now(),
        });
      }
    }
    this.activeStroke = null;
  }

  private paintAtWorld(wx: number, wy: number) {
    const [r, g, b] = this.hexToRgb(this.color);
    const radius = Math.max(0, (this.brushSize - 1) / 2);
    const startX = Math.floor(wx - radius);
    const startY = Math.floor(wy - radius);
    const cx = startX + radius;
    const cy = startY + radius;
    let changed = false;

    for (let y = startY; y < startY + this.brushSize; y++) {
      for (let x = startX; x < startX + this.brushSize; x++) {
        if (this.brushSize > 2 && Math.hypot(x - cx, y - cy) > radius + 0.35) continue;
        if (
          this.tool === 'brush' &&
          this.brushStyle === 'spray' &&
          this.brushSize > 1 &&
          Math.random() > 0.22
        )
          continue;

        const pos = this.worldToChunkPixel(x, y);
        if (this.isProtectedChunk(pos.cx, pos.cy)) {
          this.reportProtectedChunk();
          continue;
        }
        const chunk = this.getOrCreateChunk(pos.cx, pos.cy);
        const before = chunk.getPixel(pos.px, pos.py, this.layer);
        const next: [number, number, number, number] =
          this.tool === 'eraser' ? [0, 0, 0, 0] : [r, g, b, 255];

        if (
          before[0] === next[0] &&
          before[1] === next[1] &&
          before[2] === next[2] &&
          before[3] === next[3]
        ) {
          continue;
        }

        this.snapshotForChange(chunk);
        chunk.setPixel(pos.px, pos.py, this.layer, next[0], next[1], next[2], next[3]);
        this.markChunkDirty(chunk);
        changed = true;
      }
    }

    if (changed && this.activeStroke) this.activeStroke.changed = true;
  }

  private paintLine(fromX: number, fromY: number, toX: number, toY: number) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY))));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.paintAtWorld(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t);
    }
  }

  private fillAtCursor() {
    this.claims = readClaims();
    const world = this.screenToWorldPoint();
    this.lastPaintWorldX = world.x;
    this.lastPaintWorldY = world.y;
    const pos = this.worldToChunkPixel(world.x, world.y);
    if (this.isProtectedChunk(pos.cx, pos.cy)) {
      this.reportProtectedChunk();
      return;
    }
    const chunk = this.getOrCreateChunk(pos.cx, pos.cy);
    const target = chunk.getPixel(pos.px, pos.py, this.layer);
    const [r, g, b] = this.hexToRgb(this.color);
    const replacement: [number, number, number, number] = [r, g, b, 255];

    if (this.sameColor(target, replacement)) return;

    this.beginStroke();
    this.snapshotForChange(chunk);

    const queue: Array<[number, number]> = [[pos.px, pos.py]];
    const visited = new Uint8Array(CHUNK_PX * CHUNK_PX);
    let changed = false;

    while (queue.length > 0) {
      const [x, y] = queue.pop()!;
      if (x < 0 || x >= CHUNK_PX || y < 0 || y >= CHUNK_PX) continue;
      const index = y * CHUNK_PX + x;
      if (visited[index]) continue;
      visited[index] = 1;

      if (!this.sameColor(chunk.getPixel(x, y, this.layer), target)) continue;

      chunk.setPixel(
        x,
        y,
        this.layer,
        replacement[0],
        replacement[1],
        replacement[2],
        replacement[3],
      );
      this.markChunkDirty(chunk);
      changed = true;

      queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }

    if (this.activeStroke) this.activeStroke.changed = changed;
    this.commitStroke();
  }

  private pickColorAtCursor() {
    const world = this.screenToWorldPoint();
    const pos = this.worldToChunkPixel(world.x, world.y);
    const chunk = this.chunks.get(this.chunkId(pos.cx, pos.cy));
    if (!chunk) return;

    for (let layer = NUM_LAYERS - 1; layer >= 0; layer--) {
      const [r, g, b, a] = chunk.getPixel(pos.px, pos.py, layer);
      if (a === 0) continue;
      const picked = this.rgbToHex(r, g, b);
      this.color = picked;
      this.onColorPick?.(picked);
      this.onSaveStatus?.(`Picked ${picked}`);
      return;
    }
  }

  private hexToRgb(hex: string): [number, number, number] {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }

  private rgbToHex(r: number, g: number, b: number) {
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  private hexToRgba(hex: string, alpha: number) {
    const [r, g, b] = this.hexToRgb(hex);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private sameColor(a: ArrayLike<number>, b: ArrayLike<number>) {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  }

  private isProtectedChunk(cx: number, cy: number) {
    return (this.claims || []).some(
      (claim) =>
        claim.cx === cx && claim.cy === cy && claim.expiresAt > Date.now() && claim.owner !== 'me',
    );
  }

  private renderChunkOverlays() {
    const { ctx, camera, canvas } = this;
    for (const claim of this.claims || []) {
      if (claim.expiresAt <= Date.now()) continue;
      const screen = camera.worldToScreen(
        claim.cx * CHUNK_PX,
        claim.cy * CHUNK_PX,
        canvas.width,
        canvas.height,
      );
      ctx.save();
      ctx.strokeStyle = claim.owner === 'me' ? '#ffaa00' : '#ff4466';
      ctx.lineWidth = 2;
      ctx.strokeRect(screen.x, screen.y, CHUNK_PX * camera.zoom, CHUNK_PX * camera.zoom);
      ctx.restore();
    }
    if (!this.heatmap) return;
    const cx = Math.floor(camera.x / CHUNK_PX);
    const cy = Math.floor(camera.y / CHUNK_PX);
    const chunk = this.chunks.get(this.chunkId(cx, cy));
    if (!chunk) return;
    const screen = camera.worldToScreen(cx * CHUNK_PX, cy * CHUNK_PX, canvas.width, canvas.height);
    const cacheKey = `${chunk.id}:${chunk.version}:${this.chunkEditRevisions.get(chunk.id) || 0}`;
    if (this.heatmapCache?.key !== cacheKey) {
      const cells = new Array<number>(256).fill(0);
      const layers = chunk.getLayers();
      for (let py = 0; py < CHUNK_PX; py++) {
        for (let px = 0; px < CHUNK_PX; px++) {
          if (layers.some((layer) => layer[(py * CHUNK_PX + px) * 4 + 3] > 0)) {
            cells[Math.floor(py / 8) * 16 + Math.floor(px / 8)]++;
          }
        }
      }
      this.heatmapCache = { key: cacheKey, cells };
    }
    ctx.save();
    for (let y = 0; y < CHUNK_PX; y += 8) {
      for (let x = 0; x < CHUNK_PX; x += 8) {
        const count = this.heatmapCache.cells[(y / 8) * 16 + x / 8];
        if (!count) continue;
        ctx.fillStyle = `rgba(255,68,102,${0.15 + (count / 64) * 0.6})`;
        ctx.fillRect(
          screen.x + x * camera.zoom,
          screen.y + y * camera.zoom,
          8 * camera.zoom,
          8 * camera.zoom,
        );
      }
    }
    ctx.restore();
  }

  private reportProtectedChunk() {
    const now = performance.now();
    if (now - this.lastProtectionToastAt < 1200) return;
    this.lastProtectionToastAt = now;
    this.onSaveStatus?.('This area is protected by its owner');
  }

  private renderGlowBursts() {
    this.glowBursts ??= [];
    if (this.glowBursts.length === 0) return;
    const now = performance.now();
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.ctx;
    this.glowBursts = this.glowBursts.filter((burst) => now - burst.startedAt < 500);
    for (const burst of this.glowBursts) {
      const age = now - burst.startedAt;
      const alpha = Math.max(0, 1 - age / 500);
      const screen = this.camera.worldToScreen(burst.wx, burst.wy, W, H);
      ctx.save();
      ctx.globalAlpha = alpha * 0.55;
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'blur(2px) drop-shadow(0 0 4px #00e6b8)';
      ctx.strokeStyle = '#00e6b8';
      ctx.lineWidth = Math.max(2, this.camera.zoom * 2);
      ctx.beginPath();
      ctx.arc(
        screen.x,
        screen.y,
        burst.radius * this.camera.zoom * (1 + age / 700),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private bindInputs() {
    const c = this.canvas;
    const W = () => this.canvas.width,
      H = () => this.canvas.height;
    const { signal } = this.eventController;

    c.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });

    c.addEventListener(
      'mousedown',
      (e) => {
        e.preventDefault();
        this._cursorX = e.clientX;
        this._cursorY = e.clientY;
        this.lastDragX = e.clientX;
        this.lastDragY = e.clientY;
        if (this.tool === 'pan' || e.button === 1 || e.button === 2 || this.isSpacePanning) {
          this.isPanning = true;
          return;
        }
        if (e.button !== 0) return;

        if (this.tool === 'spawn') {
          this.spawnEntityAtCursor();
        } else if (this.tool === 'delete_entity') {
          this.removeEntityAtCursor();
        } else if (this.tool === 'brush' || this.tool === 'eraser') {
          const world = this.screenToWorldPoint();
          this.beginStroke();
          this.isDrawing = true;
          this.lastPaintWorldX = world.x;
          this.lastPaintWorldY = world.y;
          this.paintAtWorld(world.x, world.y);
        } else if (this.tool === 'fill') {
          this.fillAtCursor();
        } else if (this.tool === 'pipette') {
          this.pickColorAtCursor();
        }
      },
      { signal },
    );

    window.addEventListener(
      'mousemove',
      (e) => {
        this._cursorX = e.clientX;
        this._cursorY = e.clientY;
        if (this.isPanning) {
          this.camera.applyDrag(e.clientX - this.lastDragX, e.clientY - this.lastDragY);
          this.lastDragX = e.clientX;
          this.lastDragY = e.clientY;
        } else if (this.isDrawing && (this.tool === 'brush' || this.tool === 'eraser')) {
          const world = this.screenToWorldPoint();
          this.paintLine(this.lastPaintWorldX, this.lastPaintWorldY, world.x, world.y);
          this.lastPaintWorldX = world.x;
          this.lastPaintWorldY = world.y;
        }
      },
      { signal },
    );

    window.addEventListener(
      'wheel',
      (e) => {
        if (e.target !== this.canvas || document.querySelector('[aria-modal="true"]')) return;
        if (this.tool === 'spawn') {
          const delta = e.deltaY > 0 ? -0.1 : 0.1;
          this.setSpawnScale(Math.max(0.2, Math.min(10, this.spawnScale + delta)));
          this.onSpawnScaleChange?.(this.spawnScale);
          e.preventDefault();
          return;
        }

        // Smooth zoom towards cursor
        const zoomFactor = e.deltaY > 0 ? 0.85 : 1.15;
        this.camera.zoomAt(zoomFactor, e.clientX, e.clientY, W(), H());

        // Also trigger a glitch effect on heavy scroll for atmosphere
        if (Math.abs(e.deltaY) > 50) this.atmosphere.glitch(0.2);

        e.preventDefault();
      },
      { passive: false, signal },
    );

    window.addEventListener(
      'mouseup',
      () => {
        if (this.isDrawing) {
          this.isDrawing = false;
          this.commitStroke();
        }
        this.isPanning = false;
      },
      { signal },
    );

    c.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this._cursorX = t.clientX;
          this._cursorY = t.clientY;
          this.lastTouchX = t.clientX;
          this.lastTouchY = t.clientY;
          if (this.tool === 'pan') {
            this.isPanning = true;
          } else if (this.tool === 'brush' || this.tool === 'eraser') {
            const world = this.screenToWorldPoint(t.clientX, t.clientY);
            this.beginStroke();
            this.isDrawing = true;
            this.lastPaintWorldX = world.x;
            this.lastPaintWorldY = world.y;
            this.paintAtWorld(world.x, world.y);
          } else if (this.tool === 'fill') {
            this.fillAtCursor();
          } else if (this.tool === 'pipette') {
            this.pickColorAtCursor();
          } else if (this.tool === 'spawn') {
            this.spawnEntityAtCursor();
          } else if (this.tool === 'delete_entity') {
            this.removeEntityAtCursor();
          }
        }
      },
      { passive: false, signal },
    );

    c.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this._cursorX = t.clientX;
          this._cursorY = t.clientY;
          if (this.isPanning)
            this.camera.applyDrag(t.clientX - this.lastTouchX, t.clientY - this.lastTouchY);
          else if (this.isDrawing && (this.tool === 'brush' || this.tool === 'eraser')) {
            const world = this.screenToWorldPoint(t.clientX, t.clientY);
            this.paintLine(this.lastPaintWorldX, this.lastPaintWorldY, world.x, world.y);
            this.lastPaintWorldX = world.x;
            this.lastPaintWorldY = world.y;
          }
          this.lastTouchX = t.clientX;
          this.lastTouchY = t.clientY;
        }
      },
      { passive: false, signal },
    );

    c.addEventListener(
      'touchend',
      () => {
        if (this.isDrawing) {
          this.isDrawing = false;
          this.commitStroke();
        }
        this.isPanning = false;
      },
      { signal },
    );
  }

  private bindKeyboard() {
    const { signal } = this.eventController;
    window.addEventListener(
      'keydown',
      (e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('input, textarea, select, [contenteditable="true"]') ||
          document.querySelector('[aria-modal="true"], .fn-onboarding-welcome')
        )
          return;
        if (e.code === 'Space') {
          if (target.closest('button, a')) return;
          e.preventDefault();
          this.isSpacePanning = true;
          return;
        }
        if (e.ctrlKey || e.metaKey) {
          if (e.key === 'z') {
            e.preventDefault();
            this.undo();
          }
          if (e.key === 's') {
            e.preventDefault();
            this.saveAllChunks();
            this.onSaveStatus?.('Save requested — check sync status');
          }
          return;
        }
        const toolMap: Record<string, DrawTool> = {
          v: 'pan',
          b: 'brush',
          e: 'eraser',
          f: 'fill',
          i: 'pipette',
          o: 'spawn',
          x: 'delete_entity',
        };
        if (e.key === '+' || e.key === '=' || e.key === '-') {
          e.preventDefault();
          this.camera.zoomAt(
            e.key === '-' ? 1 / 1.3 : 1.3,
            this.canvas.width / 2,
            this.canvas.height / 2,
            this.canvas.width,
            this.canvas.height,
          );
        }
        if (toolMap[e.key.toLowerCase()]) {
          this.setTool(toolMap[e.key.toLowerCase()]);
          this.onToolChange?.(this.tool);
        }
      },
      { signal },
    );

    window.addEventListener(
      'keyup',
      (e) => {
        if (e.code === 'Space') this.isSpacePanning = false;
      },
      { signal },
    );
  }

  // ── Persistence (IndexedDB) ───────────────────────────────────────────────

  private saveChunk(chunk: Chunk) {
    if (this.readOnly) return;
    if (
      this.repository.mode === 'remote' &&
      !['saved', 'saving'].includes(this.repository.getStatus().phase)
    )
      return;
    if (!this.dirtyChunkIds.has(chunk.id) || this.savingChunkIds.has(chunk.id)) return;
    this.savingChunkIds.add(chunk.id);
    const editRevision = this.chunkEditRevisions.get(chunk.id) || 0;

    const record = {
      id: chunk.id,
      cx: chunk.cx,
      cy: chunk.cy,
      zone: chunk.zoneType,
      layers: chunk.getLayers().map((l) => new Uint8Array(l)),
      savedAt: Date.now(),
      version: chunk.version,
    };
    const save =
      chunk.isEmpty() && this.repository.mode === 'local'
        ? this.repository.deleteChunk(chunk.id, chunk.version)
        : this.repository.saveChunk(record);

    save
      .then(() => {
        chunk.version = record.version ?? chunk.version;
        if ((this.chunkEditRevisions.get(chunk.id) || 0) === editRevision) {
          this.dirtyChunkIds.delete(chunk.id);
        }
      })
      .catch((err) => console.error('Failed to save chunk:', chunk.id, err))
      .finally(() => {
        this.savingChunkIds.delete(chunk.id);
      });
  }

  private saveAllChunks() {
    if (this.readOnly) return;
    for (const id of Array.from(this.dirtyChunkIds)) {
      const chunk = this.chunks.get(id);
      if (chunk) this.saveChunk(chunk);
    }
  }

  private async loadAllChunks() {
    try {
      const records = await this.repository.loadInitialChunks();
      for (const rec of records) {
        const id = `${rec.cx},${rec.cy}`;
        if (this.chunks.has(id)) continue;
        const chunk = new Chunk(rec.cx, rec.cy, (rec.zone as ZoneType) ?? 'static');
        chunk.version = rec.version ?? 0;
        chunk.restoreLayers(rec.layers);
        this.chunks.set(id, chunk);
        this.chunkRevision += 1;
      }
    } catch (err) {
      console.warn('Failed to load chunks from IndexedDB:', err);
      this.onSaveStatus?.('Local storage unavailable — changes may not persist');
    }
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}
