import React, { useRef, useEffect, useCallback } from 'react';
import { ColorWheelValue } from '../../types';
import { RotateCcw } from 'lucide-react';

const INITIAL_WHEEL_SIZE = 130;

interface ColorWheelProps {
  title: string;
  accentColor: string;
  value: ColorWheelValue;
  onChange: (val: ColorWheelValue) => void;
}

/** Draws the color wheel onto a canvas imperatively — no React state involved. */
function drawWheel(
  canvas: HTMLCanvasElement,
  hue: number,
  normSat: number,
  isActive: boolean,
  accentColor: string
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) - 3;

  ctx.clearRect(0, 0, w, h);

  // Active glow ring
  if (isActive) {
    const glow = ctx.createRadialGradient(cx, cy, r - 1, cx, cy, r + 8);
    glow.addColorStop(0, `${accentColor}60`);
    glow.addColorStop(1, `${accentColor}00`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Clip to circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = '#0d0e11';
  ctx.fillRect(0, 0, w, h);

  // Hue conical
  const conical = ctx.createConicGradient(0, cx, cy);
  conical.addColorStop(0 / 6, '#ff0000');
  conical.addColorStop(1 / 6, '#ffff00');
  conical.addColorStop(2 / 6, '#00ff00');
  conical.addColorStop(3 / 6, '#00ffff');
  conical.addColorStop(4 / 6, '#0000ff');
  conical.addColorStop(5 / 6, '#ff00ff');
  conical.addColorStop(6 / 6, '#ff0000');
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = conical;
  ctx.fillRect(0, 0, w, h);

  // White-to-transparent radial
  const radial = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  radial.addColorStop(0, 'rgba(255,255,255,0.90)');
  radial.addColorStop(0.26, 'rgba(255,255,255,0.42)');
  radial.addColorStop(0.72, 'rgba(0,0,0,0.0)');
  radial.addColorStop(1, 'rgba(0,0,0,0.20)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;
  ctx.restore();

  // Border
  ctx.strokeStyle = isActive ? accentColor + '99' : '#2A2F3A';
  ctx.lineWidth = isActive ? 1.5 : 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshairs
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
  ctx.stroke();
  ctx.setLineDash([]);

  // Puck
  const rad = (hue * Math.PI) / 180;
  const px = cx + Math.cos(rad) * normSat * r;
  const py = cy + Math.sin(rad) * normSat * r;

  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 5;
  ctx.fillStyle = isActive ? accentColor : '#e2e8f0';
  ctx.strokeStyle = '#0d0e11';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px, py, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(px, py, 2, 0, Math.PI * 2);
  ctx.fill();
}

export const ColorWheel: React.FC<ColorWheelProps> = ({ title, accentColor, value, onChange }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  // Store current size in a ref — avoids triggering re-render via setState
  const sizeRef = useRef(INITIAL_WHEEL_SIZE);
  const rafRef = useRef<number>(0);

  // Derived values — computed synchronously, no state
  const normSat = value.saturation > 1.0 ? value.saturation / 100.0 : Math.max(0, Math.min(1.0, value.saturation));
  const normLum = Math.abs(value.luminance) > 1.0 ? value.luminance / 100.0 : Math.max(-1.0, Math.min(1.0, value.luminance));
  const hue = ((value.hue % 360) + 360) % 360;
  const isActive = normSat > 0.02 || Math.abs(normLum) > 0.01;
  const drawStateRef = useRef({ hue, normSat, isActive, accentColor });

  useEffect(() => {
    drawStateRef.current = { hue, normSat, isActive, accentColor };
  }, [hue, normSat, isActive, accentColor]);

  // ── Draw imperatively via RAF only when the visible wheel state changes ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      drawWheel(canvas, hue, normSat, isActive, accentColor);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [hue, normSat, isActive, accentColor]);

  // ── Resize observer — write to canvas.width/height directly ─────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const size = Math.floor(Math.min(e.contentRect.width, e.contentRect.height)) - 4;
        if (size > 60 && size !== sizeRef.current) {
          sizeRef.current = size;
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = size;
            canvas.height = size;
            canvas.style.width = `${size}px`;
            canvas.style.height = `${size}px`;
            const current = drawStateRef.current;
            drawWheel(canvas, current.hue, current.normSat, current.isActive, current.accentColor);
          }
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // only on mount — resize writes directly to DOM, no React state

  // ── Pointer tracking ──────────────────────────────────────────────────
  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const r = Math.min(cx, cy) - 3;
      const dx = clientX - rect.left - cx;
      const dy = clientY - rect.top - cy;
      let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (angleDeg < 0) angleDeg += 360;
      onChange({ ...value, hue: angleDeg, saturation: Math.min(1.0, Math.hypot(dx, dy) / r) });
    },
    [value, onChange]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    updateFromPointer(e.clientX, e.clientY);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current) updateFromPointer(e.clientX, e.clientY);
  };
  const handleMouseUp = () => { isDraggingRef.current = false; };
  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ ...value, hue: 0, saturation: 0, luminance: 0 });
  };

  return (
    <div
      className="flex flex-col h-full select-none overflow-hidden"
      style={{ borderTop: `2px solid ${accentColor}50` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-2 pb-0.5 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accentColor }} />
          <span className="text-[9.5px] font-bold tracking-widest text-obsidian-textSec uppercase whitespace-nowrap">
            {title}
          </span>
        </div>
        <button
          onClick={handleReset}
          className="p-0.5 text-obsidian-textMut hover:text-white rounded hover:bg-obsidian-hover transition-colors"
          title="Reset to neutral"
        >
          <RotateCcw size={10} />
        </button>
      </div>

      {/* Wheel canvas fills remaining height */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center cursor-crosshair px-2 min-h-0"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleReset}
        title="Drag puck · Hue & Saturation · Double-click to reset"
      >
        <canvas
          ref={canvasRef}
          width={INITIAL_WHEEL_SIZE}
          height={INITIAL_WHEEL_SIZE}
          className="rounded-full block"
          style={{ width: INITIAL_WHEEL_SIZE, height: INITIAL_WHEEL_SIZE }}
        />
      </div>

      {/* H / S / L readout */}
      <div className="flex items-center justify-center gap-2.5 px-2 py-1 flex-shrink-0">
        <span className="text-[9px] font-mono text-obsidian-textMut">
          H <strong className="text-obsidian-text">{Math.round(hue)}°</strong>
        </span>
        <span className="text-[9px] font-mono text-obsidian-textMut">
          S <strong className="text-obsidian-text">{Math.round(normSat * 100)}%</strong>
        </span>
        <span className="text-[9px] font-mono text-obsidian-textMut">
          L <strong className={Math.abs(normLum) > 0.005 ? 'text-white' : 'text-obsidian-textMut'}>
            {normLum >= 0 ? '+' : ''}{Math.round(normLum * 100)}
          </strong>
        </span>
      </div>

      {/* Level slider */}
      <div className="px-3 pb-2.5 flex-shrink-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-obsidian-textSec">Level</span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={Math.round(normLum * 100)}
          onChange={(e) => onChange({ ...value, luminance: parseFloat(e.target.value) / 100.0 })}
          className="w-full h-1.5 rounded appearance-none cursor-pointer"
          style={{ accentColor }}
        />
      </div>
    </div>
  );
};
