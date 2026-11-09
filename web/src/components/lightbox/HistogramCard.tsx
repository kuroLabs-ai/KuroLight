import React, { useState, useEffect, useRef } from 'react';
import { BarChart2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { ImageAsset } from '../../types';

interface HistogramCardProps {
  histogram?: { r: number[]; g: number[]; b: number[]; lum: number[] };
  asset?: ImageAsset | null;
}

export const HistogramCard: React.FC<HistogramCardProps> = ({ histogram, asset }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [channel, setChannel] = useState<'rgb' | 'r' | 'g' | 'b' | 'lum'>('rgb');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Metadata summary
  const meta = asset?.metadata || {};
  const exposureParts: string[] = [];
  if (meta.iso || asset?.iso) exposureParts.push(`ISO ${meta.iso || asset?.iso}`);
  if (meta.focal_length_mm || asset?.focal_length) exposureParts.push(`${meta.focal_length_mm || asset?.focal_length}mm`);
  if (meta.aperture_f_number || asset?.f_number) exposureParts.push(`ƒ/${meta.aperture_f_number || asset?.f_number}`);
  if (meta.shutter_speed_str || asset?.shutter_speed) exposureParts.push(`${meta.shutter_speed_str || asset?.shutter_speed}`);
  const exposureSummary = exposureParts.join('  •  ');

  // Draw Histogram
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Auto-fit canvas to container width (only reallocate if dimensions changed)
    const cw = container.clientWidth || 260;
    const ch = 88;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    ctx.clearRect(0, 0, cw, ch);

    // Dark sleek background
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, cw, ch);

    // Subtle 4-zone exposure dividers (Blacks, Shadows, Midtones, Highlights, Whites)
    ctx.strokeStyle = '#1e2229';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    [0.2, 0.4, 0.6, 0.8].forEach((p) => {
      ctx.beginPath();
      ctx.moveTo(cw * p, 0);
      ctx.lineTo(cw * p, ch);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    if (!histogram || (!histogram.r?.length && !histogram.lum?.length)) {
      ctx.fillStyle = '#4c535e';
      ctx.font = '10px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting live histogram...', cw / 2, ch / 2 + 4);
      return;
    }

    const drawChannel = (data: number[], color: string, fillAlpha = 0.35) => {
      if (!data || !data.length) return;
      const maxVal = Math.max(...data) || 1;
      const step = cw / data.length;

      ctx.beginPath();
      ctx.moveTo(0, ch);
      for (let i = 0; i < data.length; i++) {
        const val = (data[i] / maxVal) * (ch - 6);
        ctx.lineTo(i * step, ch - val);
      }
      ctx.lineTo(cw, ch);
      ctx.closePath();

      // Soft gradient fill
      ctx.fillStyle = color;
      ctx.globalAlpha = fillAlpha;
      ctx.fill();

      // Crisp outline
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    };

    if (channel === 'rgb') {
      drawChannel(histogram.r, '#ef4444', 0.28);
      drawChannel(histogram.g, '#22c55e', 0.28);
      drawChannel(histogram.b, '#3b82f6', 0.28);
    } else if (channel === 'r') {
      drawChannel(histogram.r, '#ef4444', 0.55);
    } else if (channel === 'g') {
      drawChannel(histogram.g, '#22c55e', 0.55);
    } else if (channel === 'b') {
      drawChannel(histogram.b, '#3b82f6', 0.55);
    } else if (channel === 'lum') {
      drawChannel(histogram.lum, '#cbd5e1', 0.45);
    }
  }, [histogram, channel, isOpen]);

  return (
    <div className="border-b border-obsidian-border bg-obsidian-deep/40 select-none">
      {/* ── Header ── */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="h-8 px-2.5 flex items-center justify-between hover:bg-obsidian-hover/40 cursor-pointer transition-colors"
      >
        <div className="flex items-center space-x-2">
          {isOpen ? (
            <ChevronDown className="w-3 h-3 text-obsidian-textMut" />
          ) : (
            <ChevronRight className="w-3 h-3 text-obsidian-textMut" />
          )}
          <BarChart2 className="w-3.5 h-3.5 text-obsidian-accent" />
          <span className="text-[10px] font-bold tracking-wider text-obsidian-textSec uppercase">
            Histogram
          </span>
        </div>

        {/* Channel Switchers */}
        {isOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center bg-obsidian-elevated/70 border border-obsidian-border rounded p-0.5"
          >
            {(['rgb', 'r', 'g', 'b', 'lum'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setChannel(ch)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all ${
                  channel === ch
                    ? ch === 'r'
                      ? 'bg-red-500/20 text-red-400 font-extrabold'
                      : ch === 'g'
                      ? 'bg-green-500/20 text-green-400 font-extrabold'
                      : ch === 'b'
                      ? 'bg-blue-500/20 text-blue-400 font-extrabold'
                      : ch === 'lum'
                      ? 'bg-slate-400/20 text-slate-200 font-extrabold'
                      : 'bg-obsidian-active text-white font-extrabold shadow-sm'
                    : 'text-obsidian-textMut hover:text-white'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {isOpen && (
        <div className="p-2.5 pt-1 space-y-1.5">
          <div
            ref={containerRef}
            className="w-full h-[88px] rounded border border-obsidian-border/80 overflow-hidden relative shadow-inner bg-[#0f1115]"
          >
            <canvas ref={canvasRef} className="w-full h-full block" />
          </div>

          {/* Exposure Summary (ISO, Focal, Aperture, Shutter) */}
          {exposureSummary ? (
            <div className="text-[10px] font-mono text-obsidian-textMut text-center tracking-wide py-0.5 truncate bg-obsidian-card/40 rounded border border-obsidian-border/40">
              {exposureSummary}
            </div>
          ) : asset?.file_name ? (
            <div className="text-[10px] font-mono text-obsidian-textMut text-center truncate py-0.5">
              {asset.file_name}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
