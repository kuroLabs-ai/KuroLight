import React, { useEffect, useRef, useState } from 'react';
import { Activity, BarChart2, Radio } from 'lucide-react';
import { ColorScopes } from '../../types';

interface ColorScopesCardProps {
  histogram?: { r: number[]; g: number[]; b: number[]; lum: number[] };
  colorScopes?: ColorScopes | null;
}

type ScopeMode = 'histogram' | 'waveform' | 'vectorscope';

const MODES: { id: ScopeMode; label: string; icon: typeof BarChart2 }[] = [
  { id: 'histogram', label: 'Histogram', icon: BarChart2 },
  { id: 'waveform', label: 'Waveform', icon: Activity },
  { id: 'vectorscope', label: 'Vectorscope', icon: Radio },
];

const hslToRgb = (hue: number, saturation: number, lightness: number): [number, number, number] => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1 ? [chroma, secondary, 0] :
    sector < 2 ? [secondary, chroma, 0] :
    sector < 3 ? [0, chroma, secondary] :
    sector < 4 ? [0, secondary, chroma] :
    sector < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  const offset = lightness - chroma / 2;
  return [
    Math.round((red + offset) * 255),
    Math.round((green + offset) * 255),
    Math.round((blue + offset) * 255),
  ];
};

export const ColorScopesCard: React.FC<ColorScopesCardProps> = ({ histogram, colorScopes }) => {
  const [mode, setMode] = useState<ScopeMode>('histogram');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (mode === 'histogram') {
      const width = 320;
      const height = 150;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#0a0b0e';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#242a33';
      ctx.lineWidth = 1;
      [0.25, 0.5, 0.75].forEach((position) => {
        ctx.beginPath();
        ctx.moveTo(position * width, 0);
        ctx.lineTo(position * width, height);
        ctx.moveTo(0, position * height);
        ctx.lineTo(width, position * height);
        ctx.stroke();
      });

      const channels = [
        { values: histogram?.r ?? [], color: '#f87171' },
        { values: histogram?.g ?? [], color: '#4ade80' },
        { values: histogram?.b ?? [], color: '#60a5fa' },
      ];
      channels.forEach(({ values, color }) => {
        if (!values.length) return;
        const maxValue = Math.max(...values, 1);
        const step = width / values.length;
        ctx.beginPath();
        ctx.moveTo(0, height);
        values.forEach((value, index) => {
          ctx.lineTo(index * step, height - (value / maxValue) * (height - 8));
        });
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.2;
        ctx.fill();
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
      if (!channels.some(({ values }) => values.length)) {
        ctx.fillStyle = '#8993a2';
        ctx.font = '12px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Select a photo to analyze its rendered preview', width / 2, height / 2);
      }
      return;
    }

    const scope = mode === 'waveform' ? colorScopes?.waveform : colorScopes?.vectorscope;
    const expectedSize = scope ? scope.width * scope.height : 0;
    if (!scope || scope.data.length !== expectedSize) {
      canvas.width = 320;
      canvas.height = 150;
      ctx.fillStyle = '#0a0b0e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#8993a2';
      ctx.font = '12px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for rendered image…', canvas.width / 2, canvas.height / 2);
      return;
    }

    canvas.width = scope.width;
    canvas.height = scope.height;
    const image = ctx.createImageData(scope.width, scope.height);
    for (let index = 0; index < scope.data.length; index += 1) {
      const density = Math.min(255, Math.max(0, scope.data[index] ?? 0));
      const pixel = index * 4;
      if (mode === 'waveform') {
        image.data[pixel] = 62;
        image.data[pixel + 1] = 224;
        image.data[pixel + 2] = 162;
        image.data[pixel + 3] = Math.round(density * 0.92);
      } else {
        const x = index % scope.width;
        const y = Math.floor(index / scope.width);
        const dx = (x - (scope.width - 1) / 2) / (scope.width / 2);
        const dy = ((scope.height - 1) / 2 - y) / (scope.height / 2);
        const radius = Math.min(1, Math.hypot(dx, dy));
        const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const [red, green, blue] = hslToRgb(hue, radius * 0.9, 0.52);
        image.data[pixel] = red;
        image.data[pixel + 1] = green;
        image.data[pixel + 2] = blue;
        image.data[pixel + 3] = Math.round(density * 0.95);
      }
    }
    ctx.putImageData(image, 0, 0);

    if (mode === 'waveform') {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      [0.25, 0.5, 0.75].forEach((position) => {
        const y = Math.round(position * scope.height) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(scope.width, y);
        ctx.stroke();
      });
    } else {
      const centerX = scope.width / 2;
      const centerY = scope.height / 2;
      const radius = Math.min(centerX, centerY) - 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.24)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.moveTo(centerX - radius, centerY);
      ctx.lineTo(centerX + radius, centerY);
      ctx.moveTo(centerX, centerY - radius);
      ctx.lineTo(centerX, centerY + radius);
      ctx.stroke();
    }
  }, [colorScopes, histogram, mode]);

  const hasScope = mode === 'histogram' ? Boolean(histogram?.r.length) : Boolean(colorScopes);

  return (
    <section className=" rounded-xl border border-obsidian-border bg-obsidian-card/70 shadow-lg">
      <header className="flex items-center justify-between border-b border-obsidian-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(74,222,128,0.65)]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-obsidian-textSec">
            Color scopes
          </span>
        </div>
        <span className={`text-[9px] font-medium ${hasScope ? 'text-emerald-400' : 'text-obsidian-textMut'}`}>
          {hasScope ? 'LIVE PREVIEW' : 'WAITING'}
        </span>
      </header>

      <div className="p-3">
        <nav className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-obsidian-deep p-1" aria-label="Color scope type">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-md px-1.5 py-1.5 text-[9px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent ${
                mode === id
                  ? 'bg-obsidian-active text-white shadow'
                  : 'text-obsidian-textMut hover:bg-obsidian-hover hover:text-white'
              }`}
            >
              <Icon size={12} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>

        <div className="relative overflow-hidden rounded-lg border border-obsidian-border bg-[#08090c]">
          <canvas
            ref={canvasRef}
            className="block w-full"
            role="img"
            aria-label={`${mode} calculated from the rendered preview`}
          />
          {!hasScope && mode !== 'histogram' && (
            <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-[#08090c]/80 to-transparent pb-2">
              <span className="text-[9px] text-obsidian-textMut">Select a photo to analyze its rendered preview</span>
            </div>
          )}
        </div>
        <footer className="mt-2 flex items-center justify-between text-[9px] text-obsidian-textMut">
          <span>{mode === 'waveform' ? 'Luminance by image position' : mode === 'vectorscope' ? 'Chroma density · Cb / Cr' : 'RGB distribution'}</span>
          <span>After edits</span>
        </footer>
      </div>
    </section>
  );
};
