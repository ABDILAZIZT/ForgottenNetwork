import { useEffect, useState } from 'react';
import { rgb, hex, hsv, fromHsv } from './color';
import { THEMES } from '../palettes';
export default function ColorControls({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [text, setText] = useState(value);
  const [palette, setPalette] = useState('palette_neon_noir');
  useEffect(() => setText(value), [value]);
  const channels = rgb(value),
    spectrum = hsv(value);
  return (
    <details className="pw-color-controls">
      <summary>HEX · RGB · HSV</summary>
      <label>
        Palette
        <select value={palette} onChange={(e) => setPalette(e.target.value)}>
          {Object.keys(THEMES).map((name) => (
            <option key={name} value={name}>
              {name.replace('palette_', '').replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </label>
      <div className="rs-tools">
        {THEMES[palette].map((color) => (
          <button
            key={color}
            title={color}
            aria-label={'Choose ' + color}
            style={{
              background: color,
              width: 24,
              height: 24,
              padding: 0,
              border: '1px solid #888',
            }}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
      <label>
        HEX
        <input
          aria-label="HEX color"
          value={text}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
          }}
          onBlur={() => setText(value)}
        />
      </label>
      <div className="pw-channel-row">
        {['R', 'G', 'B'].map((label, i) => (
          <label key={label}>
            {label}
            <input
              aria-label={'RGB ' + label}
              type="number"
              min={0}
              max={255}
              value={channels[i]}
              onChange={(e) => {
                const next = [...channels];
                next[i] = Number(e.target.value);
                onChange(hex(next));
              }}
            />
          </label>
        ))}
      </div>
      {['Hue', 'Saturation', 'Value'].map((label, i) => (
        <label key={label}>
          {label} {Math.round(spectrum[i])}
          <input
            aria-label={'HSV ' + label}
            type="range"
            min={0}
            max={i === 0 ? 359 : 100}
            value={spectrum[i]}
            onChange={(e) => {
              const next = [...spectrum];
              next[i] = Number(e.target.value);
              onChange(fromHsv(next[0], next[1], next[2]));
            }}
          />
        </label>
      ))}
    </details>
  );
}
