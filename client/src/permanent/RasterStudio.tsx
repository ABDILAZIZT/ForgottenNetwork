import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useModal } from '../components/useModal';
import { download } from '../download';
import { floodFill, fitImage, transformPoint } from './raster';
import { rgb, hex } from './color';
import ColorControls from './ColorControls';
type Point = [number, number];
type Layer = {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  visible: boolean;
  locked: boolean;
  opacity: number;
};
const SIZE = 512;
const surface = () => {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
};
const polygon = (ctx: CanvasRenderingContext2D, points: Point[]) => {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
};
export default function RasterStudio({
  source,
  onClose,
  onSave,
  label = 'Save as draft',
  avatar = false,
  placement,
}: {
  source?: string;
  onClose: () => void;
  onSave: (
    blob: Blob,
    position?: { x: number; y: number; width: number; height: number },
  ) => Promise<void>;
  label?: string;
  avatar?: boolean;
  placement?: { x: number; y: number; width: number; height: number };
}) {
  const [position, setPosition] = useState(placement);
  const frame = placement
    ? fitImage(placement.width, placement.height, SIZE)
    : { x: 0, y: 0, width: SIZE, height: SIZE };
  const [layers, setLayers] = useState<Layer[]>([]),
    [active, setActive] = useState('');
  const [tool, setTool] = useState(source ? 'transform' : 'brush'),
    [color, setColor] = useState('#a78bfa'),
    [size, setSize] = useState(12),
    [opacity, setOpacity] = useState(1),
    [tolerance, setTolerance] = useState(24);
  const [selection, setSelection] = useState<Point[]>([]),
    [transform, setTransform] = useState({ x: 0, y: 0, sx: 1, sy: 1, angle: 0 }),
    [lockedRatio, setLockedRatio] = useState(true);
  const [filter, setFilter] = useState({ hue: 0, saturation: 100, brightness: 100, contrast: 100 });
  const [revision, setRevision] = useState(0),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [grid, setGrid] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    history = useRef<{ id: string; data: ImageData }[]>([]);
  const gesture = useRef<{
    start: Point;
    last: Point;
    points: Point[];
    mode: string;
    initial: typeof transform;
  } | null>(null);
  const modal = useModal(true, () => {
    if (!busy && confirm('Close the studio? Save a draft or download first to keep your edits.'))
      onClose();
  });
  const current = layers.find((l) => l.id === active);
  const bounds = selection.length
    ? {
        x: Math.min(...selection.map((p) => p[0])),
        y: Math.min(...selection.map((p) => p[1])),
        width: Math.max(
          1,
          Math.max(...selection.map((p) => p[0])) - Math.min(...selection.map((p) => p[0])),
        ),
        height: Math.max(
          1,
          Math.max(...selection.map((p) => p[1])) - Math.min(...selection.map((p) => p[1])),
        ),
      }
    : { x: 0, y: 0, width: SIZE, height: SIZE };
  const transformed =
    transform.x !== 0 ||
    transform.y !== 0 ||
    transform.sx !== 1 ||
    transform.sy !== 1 ||
    transform.angle !== 0;
  const projected = (p: Point) =>
    transformPoint(p, [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2], transform);
  useEffect(() => {
    let cancelled = false;
    const c = surface(),
      id = crypto.randomUUID();
    const finish = () => {
      if (!cancelled) {
        setLayers([{ id, name: 'Artwork', canvas: c, visible: true, locked: false, opacity: 1 }]);
        setActive(id);
      }
    };
    if (source) {
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        const fit = fitImage(image.width, image.height, SIZE);
        c.getContext('2d')!.drawImage(image, fit.x, fit.y, fit.width, fit.height);
        setSelection([
          [fit.x, fit.y],
          [fit.x + fit.width, fit.y],
          [fit.x + fit.width, fit.y + fit.height],
          [fit.x, fit.y + fit.height],
        ]);
        finish();
      };
      image.onerror = () => {
        setNotice('Could not open this image.');
        finish();
      };
      image.src = source;
    } else finish();
    return () => {
      cancelled = true;
    };
  }, [source]);
  const saveUndo = () => {
    if (current) {
      history.current.push({
        id: current.id,
        data: current.canvas.getContext('2d')!.getImageData(0, 0, SIZE, SIZE),
      });
      if (history.current.length > 12) history.current.shift();
    }
  };
  const resetTransform = () => setTransform({ x: 0, y: 0, sx: 1, sy: 1, angle: 0 });
  const renderLayer = (layer: Layer) => {
    if (layer.id !== active || !transformed || layer.locked) return layer.canvas;
    const result = surface(),
      part = surface(),
      ctx = result.getContext('2d')!,
      pc = part.getContext('2d')!;
    pc.drawImage(layer.canvas, 0, 0);
    if (selection.length) {
      pc.globalCompositeOperation = 'destination-in';
      polygon(pc, selection);
      pc.fill();
    }
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(part, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(
      bounds.x + bounds.width / 2 + transform.x,
      bounds.y + bounds.height / 2 + transform.y,
    );
    ctx.rotate((transform.angle * Math.PI) / 180);
    ctx.scale(transform.sx, transform.sy);
    ctx.translate(-bounds.x - bounds.width / 2, -bounds.y - bounds.height / 2);
    ctx.drawImage(part, 0, 0);
    return result;
  };
  const composite = () => {
    const c = surface(),
      ctx = c.getContext('2d')!;
    layers.forEach((layer) => {
      if (layer.visible) {
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(renderLayer(layer), 0, 0);
      }
    });
    return c;
  };
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(composite(), 0, 0);
    if (frame.width !== SIZE || frame.height !== SIZE) {
      ctx.fillStyle = '#11111199';
      ctx.fillRect(0, 0, SIZE, frame.y);
      ctx.fillRect(0, frame.y + frame.height, SIZE, SIZE);
      ctx.fillRect(0, frame.y, frame.x, frame.height);
      ctx.fillRect(frame.x + frame.width, frame.y, SIZE, frame.height);
    }
    if (grid) {
      ctx.strokeStyle = '#88888850';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let n = 0; n <= SIZE; n += 16) {
        ctx.moveTo(n, 0);
        ctx.lineTo(n, SIZE);
        ctx.moveTo(0, n);
        ctx.lineTo(SIZE, n);
      }
      ctx.stroke();
    }
    if (selection.length && ['marquee', 'lasso', 'transform'].includes(tool)) {
      ctx.strokeStyle = '#22aadd';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      polygon(ctx, tool === 'transform' ? selection.map(projected) : selection);
      ctx.stroke();
      ctx.setLineDash([]);
      if (tool === 'transform') {
        ctx.fillStyle = '#22aadd';
        for (const [x, y] of (
          [
            [bounds.x, bounds.y],
            [bounds.x + bounds.width, bounds.y + bounds.height],
            [bounds.x + bounds.width / 2, bounds.y - 20],
          ] as Point[]
        ).map(projected))
          ctx.fillRect(x - 5, y - 5, 10, 10);
      }
    }
  });
  const point = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(SIZE - 1, ((e.clientX - r.left) * SIZE) / r.width)),
      Math.max(0, Math.min(SIZE - 1, ((e.clientY - r.top) * SIZE) / r.height)),
    ];
  };
  const paint = (from: Point, to: Point) => {
    if (!current || current.locked) return;
    const ctx = current.canvas.getContext('2d')!;
    ctx.save();
    if (selection.length) {
      polygon(ctx, selection);
      ctx.clip();
    }
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.globalAlpha = opacity;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...from);
    ctx.lineTo(to[0] + 0.01, to[1]);
    ctx.stroke();
    ctx.restore();
    setRevision((n) => n + 1);
  };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === 'eyedropper') {
      const c = composite()
        .getContext('2d')!
        .getImageData(Math.floor(p[0]), Math.floor(p[1]), 1, 1).data;
      setColor(hex(Array.from(c.slice(0, 3))));
      setNotice('Sampled ' + hex(Array.from(c.slice(0, 3))));
      return;
    }
    if (!current || current.locked) {
      setNotice('Unlock the active layer first.');
      return;
    }
    if (transformed && tool !== 'transform') {
      setNotice('Apply or reset the transform before editing.');
      return;
    }
    let mode = tool;
    if (tool === 'transform') {
      const corner = projected([bounds.x + bounds.width, bounds.y + bounds.height]);
      const rotation = projected([bounds.x + bounds.width / 2, bounds.y - 20]);
      if (Math.hypot(p[0] - corner[0], p[1] - corner[1]) < 18) mode = 'scale';
      else if (Math.hypot(p[0] - rotation[0], p[1] - rotation[1]) < 18) mode = 'rotate';
      else mode = 'move';
    }
    gesture.current = { start: p, last: p, points: [p], mode, initial: transform };
    if (['brush', 'eraser', 'bucket'].includes(tool)) saveUndo();
    if (tool === 'brush' || tool === 'eraser') paint(p, p);
    if (tool === 'bucket') {
      const ctx = current.canvas.getContext('2d')!,
        data = ctx.getImageData(0, 0, SIZE, SIZE);
      let mask: Uint8ClampedArray | undefined;
      if (selection.length) {
        const m = surface().getContext('2d')!;
        polygon(m, selection);
        m.fill();
        mask = m.getImageData(0, 0, SIZE, SIZE).data;
      }
      floodFill(
        data.data,
        SIZE,
        SIZE,
        p[0],
        p[1],
        [...rgb(color), Math.round(opacity * 255)],
        tolerance,
        mask,
      );
      ctx.putImageData(data, 0, 0);
      setRevision((n) => n + 1);
    }
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    if (g.mode === 'brush' || g.mode === 'eraser') paint(g.last, p);
    else if (g.mode === 'marquee')
      setSelection([g.start, [p[0], g.start[1]], p, [g.start[0], p[1]]]);
    else if (g.mode === 'lasso') {
      g.points.push(p);
      setSelection([...g.points]);
    } else if (g.mode === 'move')
      setTransform({
        ...g.initial,
        x: g.initial.x + p[0] - g.start[0],
        y: g.initial.y + p[1] - g.start[1],
      });
    else if (g.mode === 'scale') {
      const angle = (g.initial.angle * Math.PI) / 180;
      const dx = p[0] - g.start[0],
        dy = p[1] - g.start[1];
      const sx = Math.max(
        0.05,
        Math.min(
          4,
          g.initial.sx + (2 * (dx * Math.cos(angle) + dy * Math.sin(angle))) / bounds.width,
        ),
      );
      setTransform({
        ...g.initial,
        sx,
        sy: lockedRatio
          ? sx
          : Math.max(
              0.05,
              Math.min(
                4,
                g.initial.sy + (2 * (-dx * Math.sin(angle) + dy * Math.cos(angle))) / bounds.height,
              ),
            ),
      });
    } else if (g.mode === 'rotate') {
      const cx = bounds.x + bounds.width / 2 + g.initial.x,
        cy = bounds.y + bounds.height / 2 + g.initial.y;
      setTransform({
        ...g.initial,
        angle:
          g.initial.angle +
          ((Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(g.start[1] - cy, g.start[0] - cx)) *
            180) /
            Math.PI,
      });
    }
    g.last = p;
  };
  const apply = () => {
    if (!current || current.locked) return;
    saveUndo();
    const rendered = renderLayer(current),
      ctx = current.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.drawImage(rendered, 0, 0);
    resetTransform();
    setSelection([]);
    setRevision((n) => n + 1);
  };
  const applyFilter = () => {
    if (!current || current.locked) return;
    saveUndo();
    const c = surface(),
      ctx = c.getContext('2d')!;
    ctx.filter = `hue-rotate(${filter.hue}deg) saturate(${filter.saturation}%) brightness(${filter.brightness}%) contrast(${filter.contrast}%)`;
    ctx.drawImage(current.canvas, 0, 0);
    const dest = current.canvas.getContext('2d')!;
    dest.save();
    if (selection.length) {
      polygon(dest, selection);
      dest.clip();
    }
    dest.clearRect(0, 0, SIZE, SIZE);
    dest.drawImage(c, 0, 0);
    dest.restore();
    setRevision((n) => n + 1);
  };
  const output = async (downloadOnly = false) => {
    setBusy(true);
    try {
      let c = composite();
      if (avatar || placement) {
        const resized = document.createElement('canvas');
        resized.width = avatar ? 256 : Math.max(1, Math.round(frame.width));
        resized.height = avatar ? 256 : Math.max(1, Math.round(frame.height));
        resized
          .getContext('2d')!
          .drawImage(
            c,
            frame.x,
            frame.y,
            frame.width,
            frame.height,
            0,
            0,
            resized.width,
            resized.height,
          );
        c = resized;
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        c.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Could not encode image.'))),
          'image/png',
        ),
      );
      if (downloadOnly) download(blob, 'studio-artwork.png');
      else await onSave(blob, position);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rs-backdrop">
      <section
        className="rs-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={avatar ? 'Avatar crop and frame' : 'Artwork studio'}
        ref={modal}
        tabIndex={-1}
      >
        <header>
          <h2>{avatar ? 'Frame your avatar' : 'Artwork studio'}</h2>
          <button
            disabled={busy}
            onClick={() => {
              if (confirm('Close the studio? Save a draft or download first to keep your edits.'))
                onClose();
            }}
          >
            Close
          </button>
        </header>
        <p>
          {avatar
            ? 'Drag to frame your image; use scale and rotation to crop within the square.'
            : 'Edits stay here until saved. Select a region to limit fills, filters and transformations.'}
        </p>
        <div className="rs-layout">
          <div>
            <div className="rs-tools">
              {['brush', 'eraser', 'eyedropper', 'bucket', 'marquee', 'lasso', 'transform'].map(
                (t) => (
                  <button key={t} aria-pressed={tool === t} onClick={() => setTool(t)}>
                    {t}
                  </button>
                ),
              )}
            </div>
            <canvas
              aria-label="512 pixel artwork editor. Use transform inputs for keyboard adjustments."
              ref={canvas}
              width={SIZE}
              height={SIZE}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={() => {
                gesture.current = null;
              }}
              onPointerCancel={() => {
                gesture.current = null;
              }}
            />
            <p role="status">{notice}</p>
            <button
              onClick={() => {
                const h = history.current.pop(),
                  layer = h && layers.find((l) => l.id === h.id);
                if (h && layer) {
                  layer.canvas.getContext('2d')!.putImageData(h.data, 0, 0);
                  setRevision((n) => n + 1);
                }
              }}
            >
              Undo stroke / adjustment
            </button>
            <button
              onClick={() => {
                setSelection([]);
                resetTransform();
              }}
            >
              Clear selection / reset preview
            </button>
            <button onClick={() => setGrid((v) => !v)}>Toggle grid</button>
          </div>
          <aside>
            <label>
              Color
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </label>
            <ColorControls value={color} onChange={setColor} />
            <label>
              Size {size}
              <input
                type="range"
                min={1}
                max={128}
                value={size}
                onChange={(e) => setSize(+e.target.value)}
              />
            </label>
            <label>
              Opacity
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(+e.target.value)}
              />
            </label>
            <label>
              Fill tolerance {tolerance}
              <input
                type="range"
                min={0}
                max={255}
                value={tolerance}
                onChange={(e) => setTolerance(+e.target.value)}
              />
            </label>
            {position && (
              <>
                <h3>World placement</h3>
                <p>
                  The visible frame keeps the artwork aspect ratio. Dark margins are cropped. Saving
                  a published revision replaces only your selected artwork.
                </p>
                {(['x', 'y'] as const).map((key) => (
                  <label key={key}>
                    World {key.toUpperCase()}
                    <input
                      type="number"
                      value={position[key]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v))
                          setPosition({
                            ...position,
                            [key]: Math.max(-1000000, Math.min(1000000, v)),
                          });
                      }}
                    />
                  </label>
                ))}
                <label>
                  World width
                  <input
                    type="number"
                    min={1}
                    max={Math.min(512, (512 * placement!.width) / placement!.height)}
                    value={position.width}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) {
                        const w = Math.max(
                          Math.max(1, placement!.width / placement!.height),
                          Math.min(512, (512 * placement!.width) / placement!.height, v),
                        );
                        setPosition({
                          ...position,
                          width: w,
                          height: (w * placement!.height) / placement!.width,
                        });
                      }
                    }}
                  />
                </label>
              </>
            )}
            <h3>Transform</h3>
            <p>
              Drag inside selection to move, bottom-right handle to scale, top handle to rotate.
            </p>
            <label>
              <input
                type="checkbox"
                checked={lockedRatio}
                onChange={(e) => setLockedRatio(e.target.checked)}
              />
              Lock aspect ratio
            </label>
            {(['x', 'y', 'sx', 'sy', 'angle'] as const).map((key) => (
              <label key={key}>
                {{ x: 'Move X', y: 'Move Y', sx: 'Scale X', sy: 'Scale Y', angle: 'Rotation' }[key]}
                <input
                  type="number"
                  min={key === 'sx' || key === 'sy' ? 0.05 : -512}
                  max={key === 'sx' || key === 'sy' ? 4 : 512}
                  step={key === 'sx' || key === 'sy' ? 0.05 : 1}
                  value={transform[key]}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw)) return;
                    const v =
                      key === 'sx' || key === 'sy'
                        ? Math.max(0.05, Math.min(4, raw))
                        : Math.max(-512, Math.min(512, raw));
                    setTransform((t) => ({
                      ...t,
                      [key]: v,
                      ...(lockedRatio && (key === 'sx' || key === 'sy') ? { sx: v, sy: v } : {}),
                    }));
                  }}
                />
              </label>
            ))}
            <button disabled={!transformed || current?.locked} onClick={apply}>
              Apply transform
            </button>
            <h3>Color adjustments</h3>
            {(['hue', 'saturation', 'brightness', 'contrast'] as const).map((key) => (
              <label key={key}>
                {key}
                <input
                  type="range"
                  min={key === 'hue' ? -180 : 0}
                  max={key === 'hue' ? 180 : 200}
                  value={filter[key]}
                  onChange={(e) => setFilter((f) => ({ ...f, [key]: +e.target.value }))}
                />
              </label>
            ))}
            <button disabled={current?.locked || transformed} onClick={applyFilter}>
              Apply adjustments
            </button>
            <h3>Layers</h3>
            {layers.map((l, i) => (
              <div className="rs-layer" key={l.id}>
                <button
                  aria-pressed={active === l.id}
                  onClick={() => {
                    if (transformed) {
                      setNotice('Apply or reset transform first.');
                      return;
                    }
                    setActive(l.id);
                  }}
                >
                  {l.name}
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={l.visible}
                    onChange={(e) =>
                      setLayers((ls) =>
                        ls.map((a) => (a.id === l.id ? { ...a, visible: e.target.checked } : a)),
                      )
                    }
                  />
                  Visible
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={l.locked}
                    onChange={(e) =>
                      setLayers((ls) =>
                        ls.map((a) => (a.id === l.id ? { ...a, locked: e.target.checked } : a)),
                      )
                    }
                  />
                  Lock
                </label>
                <input
                  aria-label={l.name + ' opacity'}
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={l.opacity}
                  onChange={(e) =>
                    setLayers((ls) =>
                      ls.map((a) => (a.id === l.id ? { ...a, opacity: +e.target.value } : a)),
                    )
                  }
                />
                <button
                  disabled={i === layers.length - 1}
                  onClick={() =>
                    setLayers((ls) => {
                      const next = [...ls];
                      [next[i], next[i + 1]] = [next[i + 1], next[i]];
                      return next;
                    })
                  }
                >
                  Raise
                </button>
              </div>
            ))}
            <button
              disabled={layers.length >= 8 || transformed}
              onClick={() => {
                const layer = {
                  id: crypto.randomUUID(),
                  name: 'Layer ' + (layers.length + 1),
                  canvas: surface(),
                  visible: true,
                  locked: false,
                  opacity: 1,
                };
                setLayers((ls) => [...ls, layer]);
                setActive(layer.id);
              }}
            >
              Add layer
            </button>
          </aside>
        </div>
        <footer>
          <span>{revision ? 'Unsaved edits' : 'Local preview'} · layers flatten when saved</span>
          <button disabled={busy} onClick={() => void output(true)}>
            Download PNG
          </button>
          <button disabled={busy || !layers.length} onClick={() => void output()}>
            {busy ? 'Saving…' : label}
          </button>
        </footer>
      </section>
    </div>
  );
}
