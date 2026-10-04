import { useEffect, useRef, useState } from 'react';

const palettes = [
  ['#22d3ee', '#a78bfa', '#f472b6'],
  ['#fb7185', '#fbbf24', '#fff1f2'],
  ['#34d399', '#a3e635', '#065f46'],
  ['#60a5fa', '#c4b5fd', '#1e3a8a'],
  ['#d6b588', '#92400e', '#fde68a'],
];
const midnight = [
  '#100b24',
  '#231445',
  '#382064',
  '#50328b',
  '#7046ae',
  '#9a6bd4',
  '#c49cf2',
  '#efcbff',
  '#07384b',
  '#096079',
  '#128e9e',
  '#21bcc6',
  '#5ce5dd',
  '#e948aa',
  '#ff79bd',
];
export default function CreativeStudio({ owned }: { owned: string[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<[number, number] | null>(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#22d3ee');
  const [stamp, setStamp] = useState(0);
  const [palette, setPalette] = useState(0);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0b0b18';
      ctx.fillRect(0, 0, 256, 256);
    }
  }, []);
  const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) * 256) / r.width, ((e.clientY - r.top) * 256) / r.height];
  };
  const paint = (p: [number, number]) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle =
      tool === 'rainbow_brush' ? `hsl(${(performance.now() / 12) % 360} 90% 65%)` : color;
    if (tool === 'glow_pen') {
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
    }
    ctx.beginPath();
    ctx.moveTo(...(last.current || p));
    ctx.lineTo(p[0] + 0.1, p[1] + 0.1);
    ctx.stroke();
    ctx.restore();
    last.current = p;
  };
  return (
    <section className="fn-studio" aria-label="Creative Studio">
      <div>
        <h3>Your pocket studio</h3>
        <p>
          Create a 256 × 256 tile. Download it, then use Image / GIF or Upload on the world toolbar
          to place it.
        </p>
        <label>
          Tool{' '}
          <select value={tool} onChange={(e) => setTool(e.target.value)}>
            <option value="pen">Basic pen</option>
            {['rainbow_brush', 'glow_pen', 'pixel_stamps', 'gradient_fill']
              .filter((id) => owned.includes(id))
              .map((id) => (
                <option key={id} value={id}>
                  {id.replace(/_/g, ' ')}
                </option>
              ))}
          </select>
        </label>
        <label>
          Color <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        {owned.includes('custom_palettes') && (
          <label>
            Palette{' '}
            <select value={palette} onChange={(e) => setPalette(Number(e.target.value))}>
              {['Cyber', 'Sunset', 'Forest', 'Ocean', 'Fossil'].map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="fn-studio-colors">
          {(owned.includes('midnight_cyber')
            ? midnight
            : palettes[owned.includes('custom_palettes') ? palette : 0]
          ).map((c) => (
            <button
              key={c}
              style={{ background: c }}
              aria-label={'Use ' + c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        {tool === 'pixel_stamps' && (
          <label>
            Stamp{' '}
            <select value={stamp} onChange={(e) => setStamp(Number(e.target.value))}>
              {[
                'Diamond',
                'Cross',
                'Steps',
                'Heart',
                'Spark',
                'Frame',
                'Flag',
                'Tree',
                'Bolt',
                'Orbit',
              ].map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={() => {
            const ctx = canvas.current?.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#0b0b18';
              ctx.fillRect(0, 0, 256, 256);
            }
          }}
        >
          Clear Studio tile
        </button>
        <button
          onClick={() =>
            canvas.current?.toBlob((blob) => {
              if (!blob) return;
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'forgotten-studio.png';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setNotice('PNG downloaded. Place it using the world upload tool.');
            })
          }
        >
          Download PNG
        </button>
        <p role="status">{notice}</p>
      </div>
      <canvas
        ref={canvas}
        width={256}
        height={256}
        aria-label="Studio drawing pad; pointer drawing with keyboard-accessible tools and export"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = point(e);
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          if (tool === 'gradient_fill') {
            const gradient = ctx.createLinearGradient(0, 0, 256, 256);
            gradient.addColorStop(0, color);
            gradient.addColorStop(1, '#a78bfa');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 256, 256);
            return;
          }
          if (tool === 'pixel_stamps') {
            const patterns = [
              '00100/01110/11111/01110/00100',
              '00100/00100/11111/00100/00100',
              '10000/11000/01100/00110/00011',
              '01010/11111/11111/01110/00100',
              '10101/01110/11111/01110/10101',
              '11111/10001/10001/10001/11111',
              '11110/11100/11110/10000/10000',
              '00100/01110/11111/00100/00100',
              '00110/01100/11110/00100/01000',
              '01110/10001/10101/10001/01110',
            ];
            ctx.fillStyle = color;
            patterns[stamp].split('/').forEach((row, y) =>
              [...row].forEach((cell, x) => {
                if (cell === '1') ctx.fillRect(p[0] + (x - 2) * 5, p[1] + (y - 2) * 5, 5, 5);
              }),
            );
            return;
          }
          drawing.current = true;
          last.current = null;
          paint(p);
        }}
        onPointerMove={(e) => {
          if (drawing.current) paint(point(e));
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
    </section>
  );
}
