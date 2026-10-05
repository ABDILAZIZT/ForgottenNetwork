import { Camera } from '../engine/Camera';
import { drawArt, loadArt } from './art';
import { placementCells } from './geometry';
import type { Artwork, Blocked, Content, Peer, Placement, Point, Tool, View } from './types';

export interface Settings {
  tool: Tool;
  artistId?: string;
  color: string;
  size: number;
  opacity: number;
  font: string;
  text: string;
  sticker: string;
  animated: boolean;
  assetId?: string;
  mediaWidth: number;
  mediaRatio: number;
  draftMode: boolean;
  enabled: boolean;
  reducedMotion: boolean;
}
interface Hooks {
  commit: (element: Placement) => void;
  view: (view: View) => void;
  hover: (element: Artwork | null, x: number, y: number) => void;
  select: (element: Artwork) => void;
  cursor: (point: Point, drawing: boolean) => void;
  preview: (element: Placement | null) => void;
  drafts: (count: number) => void;
  export: (view: View) => void;
  signIn: () => void;
  eraseArtwork: (art: Artwork) => void;
}
export class PermanentEngine {
  camera = new Camera();
  elements = new Map<string, Artwork>();
  peers = new Map<string, Peer & { sx: number; sy: number; seen: number }>();
  draftList: Placement[] = [];
  pendingList: Placement[] = [];
  tour = false;
  remoteDrafts = new Map<string, { element: Placement; cells: Point[]; seen: number }>();
  private previewCellId = '';
  private previewCells: Point[] = [];
  private broadcastAt = 0;
  private broadcasting = false;
  settings: Settings = {
    tool: 'pan',
    color: '#a78bfa',
    size: 8,
    opacity: 1,
    font: 'Space Grotesk',
    text: 'Hello, forever.',
    sticker: 'star',
    animated: false,
    mediaWidth: 128,
    mediaRatio: 1,
    draftMode: false,
    enabled: false,
    reducedMotion: false,
  };
  challenge: View | null = null;
  highlightChallenge = false;
  private ctx: CanvasRenderingContext2D;
  private frame = 0;
  private observer: ResizeObserver;
  private events = new AbortController();
  private width = 1;
  private height = 1;
  private dpr = 1;
  private removed = new Set<string>();
  private occupied = new Map<string, Artwork>();
  private pointers = new Map<number, Point>();
  private drawing: Point[] = [];
  private start: Point | null = null;
  private preview: Placement | null = null;
  private cursor: Point = [0, 0];
  private lastPointer: Point = [0, 0];
  private panning = false;
  private space = false;
  private moved = false;
  private pinch = 0;
  private viewKey = '';
  private lastView = 0;
  private lastHover = 0;
  private flashes: Array<{ x: number; y: number; color: string; born: number }> = [];
  private blocked: Blocked[] = [];
  private blockedAt = 0;
  constructor(
    public canvas: HTMLCanvasElement,
    private hooks: Hooks,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.camera.setZoom(0.9);
    const resize = () => {
      this.width = canvas.clientWidth;
      this.height = canvas.clientHeight;
      this.dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = this.width * this.dpr;
      canvas.height = this.height * this.dpr;
      this.viewKey = '';
    };
    this.observer = new ResizeObserver(resize);
    this.observer.observe(canvas);
    resize();
    const signal = this.events.signal;
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    canvas.addEventListener('pointerdown', this.down, { signal });
    canvas.addEventListener('pointermove', this.move, { signal });
    canvas.addEventListener('pointerup', this.up, { signal });
    canvas.addEventListener('pointercancel', this.cancel, { signal });
    canvas.addEventListener('pointerleave', () => hooks.hover(null, 0, 0), { signal });
    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.camera.zoomAt(
          Math.exp(-event.deltaY * 0.0015),
          event.offsetX,
          event.offsetY,
          this.width,
          this.height,
        );
      },
      { signal, passive: false },
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if ((e.target as HTMLElement).closest('input,textarea,select,button,[role="dialog"]'))
          return;
        if (e.code === 'Space') {
          e.preventDefault();
          this.space = true;
        }
      },
      { signal },
    );
    window.addEventListener(
      'keyup',
      (e) => {
        if (e.code === 'Space') this.space = false;
      },
      { signal },
    );
    window.addEventListener(
      'blur',
      () => {
        this.space = false;
        this.pointers.clear();
        this.drawing = [];
        this.start = null;
        this.panning = false;
      },
      { signal },
    );
    this.frame = requestAnimationFrame(this.render);
  }
  destroy() {
    cancelAnimationFrame(this.frame);
    this.events.abort();
    this.observer.disconnect();
  }
  configure(settings: Settings) {
    this.settings = settings;
    this.camera.reducedMotion = settings.reducedMotion;
    if (!this.start) this.preview = null;
  }
  getView(): View {
    return {
      x: this.camera.x - this.width / 2 / this.camera.zoom,
      y: this.camera.y - this.height / 2 / this.camera.zoom,
      width: this.width / this.camera.zoom,
      height: this.height / this.camera.zoom,
      zoom: this.camera.zoom,
    };
  }
  fly(x: number, y: number, zoom?: number) {
    this.camera.teleportTo(x, y);
    if (zoom) this.camera.setZoom(zoom);
    this.viewKey = '';
  }
  zoom(factor: number) {
    this.camera.zoomAt(factor, this.width / 2, this.height / 2, this.width, this.height);
  }
  add(elements: Artwork[], animate = false) {
    for (const e of elements) {
      if (this.removed.has(e.id)) continue;
      const fresh = !this.elements.has(e.id);
      this.elements.set(e.id, e);
      e.cells.forEach(([x, y]) => this.occupied.set(x + ',' + y, e));
      if (fresh && animate)
        this.flashes.push({
          x: e.x + e.width / 2,
          y: e.y + e.height / 2,
          color: e.ownerColor,
          born: performance.now(),
        });
    }
    if (this.elements.size > 2200) {
      const v = this.getView();
      for (const [id, e] of this.elements)
        if (
          e.x + e.width < v.x - 512 ||
          e.x > v.x + v.width + 512 ||
          e.y + e.height < v.y - 512 ||
          e.y > v.y + v.height + 512
        ) {
          this.elements.delete(id);
          e.cells.forEach(([x, y]) => this.occupied.delete(x + ',' + y));
        }
    }
  }
  remove(ids: string[]) {
    ids.forEach((id) => {
      this.removed.add(id);
      this.elements.delete(id);
    });
    this.occupied.clear();
    for (const art of [...this.elements.values()].sort((a, b) => a.zIndex - b.zIndex))
      art.cells.forEach(([x, y]) => this.occupied.set(x + ',' + y, art));
  }
  restore(art: Artwork) {
    this.removed.delete(art.id);
    this.add([art]);
  }
  reconcile(elements: Artwork[], bounds: View, snapshot: number) {
    const ids = new Set(elements.map((e) => e.id));
    for (const [id, e] of this.elements) {
      if (
        !ids.has(id) &&
        e.zIndex <= snapshot &&
        e.x < bounds.x + bounds.width &&
        e.x + e.width > bounds.x &&
        e.y < bounds.y + bounds.height &&
        e.y + e.height > bounds.y
      )
        this.elements.delete(id);
    }
    this.occupied.clear();
    this.add([...this.elements.values(), ...elements]);
  }
  setPeers(peers: Peer[]) {
    const ids = new Set(peers.map((p) => p.connectionId));
    for (const id of this.peers.keys()) if (!ids.has(id)) this.peers.delete(id);
    peers.forEach((p) => this.peer(p));
  }
  peer(peer: Peer) {
    const prev = this.peers.get(peer.connectionId);
    this.peers.set(peer.connectionId, {
      ...peer,
      sx: prev?.sx ?? peer.x,
      sy: prev?.sy ?? peer.y,
      seen: performance.now(),
    });
  }
  flash(blocked: Blocked[]) {
    this.blocked = blocked;
    this.blockedAt = performance.now();
  }
  publishDrafts() {
    const drafts = [...this.draftList];
    this.draftList = [];
    drafts.forEach((e) => this.hooks.commit(e));
    this.hooks.drafts(this.draftList.length);
  }
  undoDraft() {
    this.draftList.pop();
    this.hooks.drafts(this.draftList.length);
  }
  private world(x: number, y: number): Point {
    const p = this.camera.screenToWorld(x, y, this.width, this.height);
    return [Math.round(p.x), Math.round(p.y)];
  }
  private make(points: Point[]): Placement | null {
    const s = this.settings,
      type = s.tool;
    if (['pan', 'eraser', 'export'].includes(type) || !points.length) return null;
    if (['rectangle', 'ellipse', 'line', 'arrow'].includes(type)) {
      const pad =
        type === 'arrow'
          ? Math.max(12, s.size * 3) + s.size / 2 + 2
          : ['line'].includes(type)
            ? s.size / 2 + 2
            : 0;
      const span = Math.max(1, 512 - Math.ceil(pad) * 2);
      const first = points[0],
        last = points[points.length - 1];
      points = [
        first,
        [
          first[0] + Math.max(-span, Math.min(span, last[0] - first[0])),
          first[1] + Math.max(-span, Math.min(span, last[1] - first[1])),
        ],
      ];
    }
    const first = points[0],
      last = points[points.length - 1],
      content: Content = {
        color: s.color,
        size: type === 'pixel' ? 1 : s.size,
        opacity: s.opacity,
      };
    let x = Math.min(...points.map((p) => p[0])),
      y = Math.min(...points.map((p) => p[1])),
      width = Math.max(...points.map((p) => p[0])) - x,
      height = Math.max(...points.map((p) => p[1])) - y;
    if (['brush', 'pixel', 'line', 'arrow'].includes(type)) {
      const pad = Math.ceil(
        type === 'arrow'
          ? Math.max(12, content.size * 3) + content.size / 2 + 2
          : content.size / 2 + 2,
      );
      x -= pad;
      y -= pad;
      width += pad * 2;
      height += pad * 2;
      content.points = ['line', 'arrow'].includes(type) ? [first, last] : points;
    } else if (['text', 'image', 'sticker', 'stamp'].includes(type)) {
      x = first[0];
      y = first[1];
      width = s.mediaWidth;
      height = s.mediaWidth * s.mediaRatio;
      if (type === 'text') {
        content.text = s.text;
        content.font = s.font;
        content.size = s.size;
        const lines = s.text.split('\n');
        this.ctx.font = '700 ' + s.size + 'px "' + s.font + '", sans-serif';
        width = Math.min(500, Math.max(20, ...lines.map((l) => this.ctx.measureText(l).width + 8)));
        height = Math.min(500, lines.length * s.size * 1.3 + 8);
      }
      if (type === 'sticker') {
        content.sticker = s.sticker;
        content.animated = s.animated;
        height = width;
      }
      if (type === 'image' || type === 'stamp') {
        if (!s.assetId) return null;
        content.assetId = s.assetId;
        content.animated = s.animated;
      }
    }
    return {
      id: crypto.randomUUID(),
      type: type as Placement['type'],
      x,
      y,
      width: Math.max(1, Math.min(512, width)),
      height: Math.max(1, Math.min(512, height)),
      content,
    };
  }
  private finish() {
    if (this.settings.tool === 'export' && this.start) {
      const p = this.world(...this.lastPointer);
      this.hooks.export({
        x: Math.min(this.start[0], p[0]),
        y: Math.min(this.start[1], p[1]),
        width: Math.max(8, Math.abs(this.start[0] - p[0])),
        height: Math.max(8, Math.abs(this.start[1] - p[1])),
      });
    } else if (this.preview) {
      if (this.settings.draftMode) {
        this.draftList.push(this.preview);
        this.hooks.drafts(this.draftList.length);
      } else this.hooks.commit(this.preview);
    }
    this.preview = null;
    this.drawing = [];
    this.start = null;
  }
  private down = (e: PointerEvent) => {
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
    this.lastPointer = [e.offsetX, e.offsetY];
    this.moved = false;
    if (this.pointers.size === 2) {
      this.preview = null;
      this.drawing = [];
      this.start = null;
      const p = [...this.pointers.values()];
      this.pinch = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      return;
    }
    this.panning = this.settings.tool === 'pan' || e.button === 1 || e.button === 2 || this.space;
    if (this.panning) return;
    if (!this.settings.enabled && this.settings.tool !== 'export') {
      this.hooks.signIn();
      return;
    }
    const point = this.world(e.offsetX, e.offsetY);
    if (this.settings.tool === 'eraser') {
      const draftCount = this.draftList.length;
      this.erase(point);
      if (draftCount === this.draftList.length) {
        const art = this.occupied.get(Math.floor(point[0] / 8) + ',' + Math.floor(point[1] / 8));
        if (art && art.ownerId === this.settings.artistId) this.hooks.eraseArtwork(art);
      }
      return;
    }
    this.start = point;
    this.drawing = [point];
    this.preview = this.make(this.drawing);
    this.hooks.cursor(point, true);
  };
  private erase(point: Point) {
    this.draftList = this.draftList.filter(
      (e) =>
        !(
          point[0] >= e.x &&
          point[0] <= e.x + e.width &&
          point[1] >= e.y &&
          point[1] <= e.y + e.height
        ),
    );
    this.hooks.drafts(this.draftList.length);
  }
  private move = (e: PointerEvent) => {
    const pos: Point = [e.offsetX, e.offsetY],
      point = this.world(...pos);
    this.cursor = pos;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, pos);
    if (this.pointers.size === 2) {
      const p = [...this.pointers.values()],
        distance = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]);
      if (this.pinch)
        this.camera.zoomAt(
          distance / this.pinch,
          (p[0][0] + p[1][0]) / 2,
          (p[0][1] + p[1][1]) / 2,
          this.width,
          this.height,
        );
      this.pinch = distance;
      return;
    }
    if (this.pointers.size && this.panning) {
      this.camera.applyDrag(pos[0] - this.lastPointer[0], pos[1] - this.lastPointer[1]);
      this.moved = true;
    } else if (this.pointers.size && this.settings.tool === 'eraser') this.erase(point);
    else if (this.start) {
      this.moved = true;
      if (['brush', 'pixel'].includes(this.settings.tool)) {
        const last = this.drawing[this.drawing.length - 1];
        if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= 1) {
          const xs = this.drawing.map((p) => p[0]),
            ys = this.drawing.map((p) => p[1]);
          const span = 508 - (this.settings.tool === 'pixel' ? 1 : this.settings.size);
          if (
            this.drawing.length >= 1200 ||
            Math.max(...xs, point[0]) - Math.min(...xs, point[0]) > span ||
            Math.max(...ys, point[1]) - Math.min(...ys, point[1]) > span
          ) {
            this.finish();
            this.start = point;
            this.drawing = [point];
          } else this.drawing.push(point);
        }
      } else this.drawing = [this.start, point];
      this.preview = this.make(this.drawing);
    } else if (
      ['text', 'image', 'sticker', 'stamp'].includes(this.settings.tool) &&
      this.settings.enabled
    )
      this.preview = this.make([point]);
    this.lastPointer = pos;
    if (performance.now() - this.lastHover > 50) {
      this.lastHover = performance.now();
      this.hooks.cursor(point, Boolean(this.start));
      const e = this.occupied.get(Math.floor(point[0] / 8) + ',' + Math.floor(point[1] / 8));
      this.hooks.hover(this.start ? null : e || null, pos[0], pos[1]);
    }
  };
  private up = (event: PointerEvent) => {
    const wasMulti = this.pointers.size > 1;
    this.pointers.delete(event.pointerId);
    this.pinch = 0;
    if (wasMulti) {
      this.start = null;
      this.panning = true;
      return;
    }
    if (this.start) this.finish();
    else if (this.panning && !this.moved) {
      const p = this.world(event.offsetX, event.offsetY),
        e = this.occupied.get(Math.floor(p[0] / 8) + ',' + Math.floor(p[1] / 8));
      if (e) this.hooks.select(e);
    }
    this.panning = false;
    this.hooks.cursor(this.world(event.offsetX, event.offsetY), false);
  };
  private cancel = (event: PointerEvent) => {
    this.pointers.delete(event.pointerId);
    this.start = null;
    this.preview = null;
    this.drawing = [];
    this.panning = false;
  };
  private render = (time: number) => {
    this.camera.update();
    const ctx = this.ctx,
      w = this.width,
      h = this.height,
      t = this.settings.reducedMotion ? 0 : time / 1000;
    if (this.tour && w > 720)
      this.camera.teleportTo(-180 + Math.sin(t * 0.05) * 35, Math.cos(t * 0.04) * 20);
    if (this.camera.zoom < Math.max(w, h) / 7168) this.camera.setZoom(Math.max(w, h) / 7168);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 95; i++) {
      const x = (((i * 173.71 - this.camera.x * 0.08) % w) + w) % w,
        y = (((i * i * 79.1 - this.camera.y * 0.08) % h) + h) % h;
      ctx.fillStyle = 'rgba(148,163,184,' + (0.15 + (Math.sin(t * 0.3 + i) + 1) * 0.1) + ')';
      ctx.fillRect(x, y, i % 6 === 0 ? 2 : 1, 1);
    }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    const v = this.getView();
    ctx.strokeStyle = '#ffffff07';
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.beginPath();
    for (let x = Math.floor(v.x / 64) * 64; x < v.x + v.width; x += 64) {
      ctx.moveTo(x, v.y);
      ctx.lineTo(x, v.y + v.height);
    }
    for (let y = Math.floor(v.y / 64) * 64; y < v.y + v.height; y += 64) {
      ctx.moveTo(v.x, y);
      ctx.lineTo(v.x + v.width, y);
    }
    ctx.stroke();
    if (this.highlightChallenge && this.challenge) {
      const c = this.challenge;
      ctx.fillStyle = '#10b98116';
      ctx.fillRect(c.x, c.y, c.width, c.height);
      ctx.strokeStyle = '#34d399';
      ctx.setLineDash([6, 8]);
      ctx.strokeRect(c.x, c.y, c.width, c.height);
      ctx.setLineDash([]);
    }
    const visible = [...this.elements.values()]
      .filter(
        (e) =>
          e.x + e.width >= v.x &&
          e.x <= v.x + v.width &&
          e.y + e.height >= v.y &&
          e.y <= v.y + v.height,
      )
      .sort((a, b) => a.zIndex - b.zIndex);
    for (const e of visible) drawArt(ctx, e, t);
    for (const [id, draft] of this.remoteDrafts) {
      if (time - draft.seen > 3000) {
        this.remoteDrafts.delete(id);
        continue;
      }
      ctx.save();
      ctx.beginPath();
      draft.cells.forEach(([x, y]) => {
        if (!this.occupied.has(x + ',' + y)) ctx.rect(x * 8, y * 8, 8, 8);
      });
      ctx.clip();
      ctx.globalAlpha = 0.45;
      drawArt(ctx, draft.element, t);
      ctx.restore();
    }
    for (const e of [...this.draftList, ...this.pendingList]) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      drawArt(ctx, e, t);
      ctx.strokeStyle = '#fbbf24';
      ctx.setLineDash([3, 5]);
      ctx.strokeRect(e.x, e.y, e.width, e.height);
      ctx.restore();
    }
    if (this.preview) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      drawArt(ctx, this.preview, t);
      ctx.restore();
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 1 / this.camera.zoom;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(this.preview.x, this.preview.y, this.preview.width, this.preview.height);
      ctx.setLineDash([]);
      if (this.previewCellId !== this.preview.id) {
        this.previewCellId = this.preview.id;
        this.previewCells = placementCells(this.preview);
      }
      for (const [x, y] of this.previewCells)
        if (
          this.occupied.has(x + ',' + y) &&
          this.occupied.get(x + ',' + y)?.ownerId !== this.settings.artistId
        ) {
          ctx.fillStyle = '#f43f5e80';
          ctx.fillRect(x * 8, y * 8, 8, 8);
        }
    }
    if (this.settings.tool === 'export' && this.start) {
      const p = this.world(...this.lastPointer);
      ctx.strokeStyle = '#22d3ee';
      ctx.strokeRect(this.start[0], this.start[1], p[0] - this.start[0], p[1] - this.start[1]);
    }
    if (time - this.blockedAt < 1100) {
      ctx.fillStyle = 'rgba(244,63,94,' + (0.2 + Math.abs(Math.sin(time / 130)) * 0.45) + ')';
      this.blocked.forEach((c) => ctx.fillRect(c.cx * 8, c.cy * 8, 8, 8));
    }
    for (const p of this.peers.values()) {
      p.sx += (p.x - p.sx) * 0.2;
      p.sy += (p.y - p.sy) * 0.2;
      ctx.save();
      ctx.translate(p.sx, p.sy);
      ctx.scale(1 / this.camera.zoom, 1 / this.camera.zoom);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(3, 16);
      ctx.lineTo(8, 10);
      ctx.lineTo(16, 8);
      ctx.closePath();
      ctx.fill();
      ctx.font = '11px Inter';
      const text = p.name + (p.drawing ? ' · drawing' : '');
      const width = ctx.measureText(text).width;
      ctx.fillRect(14, 15, width + 12, 22);
      ctx.fillStyle = '#0a0a0f';
      ctx.fillText(text, 20, 30);
      ctx.restore();
    }
    this.flashes = this.flashes.filter((f) => time - f.born < 900);
    if (!this.settings.reducedMotion)
      for (const f of this.flashes) {
        const age = (time - f.born) / 900;
        ctx.fillStyle = f.color;
        ctx.globalAlpha = 1 - age;
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          ctx.fillRect(f.x + Math.cos(a) * age * 70, f.y + Math.sin(a) * age * 70, 3, 3);
        }
        ctx.globalAlpha = 1;
      }
    ctx.restore();
    if (['brush', 'pixel', 'eraser'].includes(this.settings.tool)) {
      ctx.strokeStyle = this.settings.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(
        this.cursor[0],
        this.cursor[1],
        Math.max(3, (this.settings.size * this.camera.zoom) / 2),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    if (time - this.lastView > 180) {
      this.lastView = time;
      const key = [
        Math.round(v.x / 128),
        Math.round(v.y / 128),
        Math.round(v.width / 128),
        Math.round(v.height / 128),
      ].join(':');
      this.hooks.view(v);
      if (key !== this.viewKey) this.viewKey = key;
    }
    this.canvas.dataset.elements = String(visible.length);
    this.canvas.dataset.liveDrafts = String(this.remoteDrafts.size);
    if (
      this.start &&
      this.preview &&
      !this.settings.draftMode &&
      ['brush', 'pixel', 'line', 'arrow'].includes(this.preview.type)
    ) {
      if (time - this.broadcastAt > 110) {
        this.hooks.preview(this.preview);
        this.broadcastAt = time;
        this.broadcasting = true;
      }
    } else if (this.broadcasting) {
      this.hooks.preview(null);
      this.broadcasting = false;
    }
    this.frame = requestAnimationFrame(this.render);
  };
  async snapshot(view: View) {
    const scale = Math.min(1, 2048 / Math.max(view.width, view.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(view.width * scale));
    canvas.height = Math.max(1, Math.ceil(view.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.translate(-view.x, -view.y);
    const elements = [...this.elements.values()]
      .filter(
        (e) =>
          e.x + e.width >= view.x &&
          e.x <= view.x + view.width &&
          e.y + e.height >= view.y &&
          e.y <= view.y + view.height,
      )
      .sort((a, b) => a.zIndex - b.zIndex);
    await Promise.all(elements.map(loadArt));
    elements.forEach((e) => drawArt(ctx, e, 0));
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not export this area.'))),
        'image/png',
      ),
    );
  }
}
