import { useEffect, useState } from 'react';
import { rgb, hex, hsv, fromHsv } from './color';
export default function ColorControls({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const channels = rgb(value),
    spectrum = hsv(value);
  return (
    <details className="pw-color-controls">
      <summary>HEX · RGB · HSV</summary>
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
