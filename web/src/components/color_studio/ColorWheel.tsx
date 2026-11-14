import React, { useEffect, useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import type { ColorWheelValue } from '@/types';

interface ColorWheelProps {
  title: string;
  accentColor: string;
  value: ColorWheelValue;
  onChange: (val: ColorWheelValue) => void;
}

const WHEEL_SIZE = 240;

function hsvToRgb(hue: number, saturation: number): [number, number, number] {
  const chroma = saturation;
  const sector = hue / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const [red, green, blue] =
    sector < 1 ? [chroma, secondary, 0] :
    sector < 2 ? [secondary, chroma, 0] :
    sector < 3 ? [0, chroma, secondary] :
    sector < 4 ? [0, secondary, chroma] :
    sector < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  const offset = 1 - chroma;
  return [
    Math.round((red + offset) * 255),
    Math.round((green + offset) * 255),
    Math.round((blue + offset) * 255),
  ];
}

function drawColorWheel(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d');
  if (!context) return;

  const image = context.createImageData(WHEEL_SIZE, WHEEL_SIZE);
  const center = (WHEEL_SIZE - 1) / 2;
  const radius = center - 3;
  for (let y = 0; y < WHEEL_SIZE; y++) {
    for (let x = 0; x < WHEEL_SIZE; x++) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;

      const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      const saturation = distance / radius;
      const [red, green, blue] = hsvToRgb(hue, saturation);
      const index = (y * WHEEL_SIZE + x) * 4;
      image.data[index] = red;
      image.data[index + 1] = green;
      image.data[index + 2] = blue;
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(255,255,255,0.65)';
  context.lineWidth = 2;
  context.stroke();
}

export const ColorWheel: React.FC<ColorWheelProps> = ({
  title,
  accentColor,
  value,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingPointer = useRef<number | null>(null);
  const hue = value?.hue ?? 0;
  const saturation = Math.max(0, Math.min(1, value?.saturation ?? 0));
  const luminance = value?.luminance ?? 0;
  const isModified = hue !== 0 || saturation !== 0 || Math.abs(luminance) > 0.005;

  useEffect(() => {
    if (canvasRef.current) drawColorWheel(canvasRef.current);
  }, []);

  const handleReset = () => onChange({ hue: 0, saturation: 0, luminance: 0 });

  const updateFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
    const distance = Math.min(radius, Math.hypot(dx, dy));
    const nextHue =
      distance < 1 ? hue : (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    onChange({
      hue: Math.round(nextHue),
      saturation: Math.min(1, distance / radius),
      luminance,
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const hueStep = event.shiftKey ? 10 : 1;
    const saturationStep = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      onChange({ ...value, hue: (hue + direction * hueStep + 360) % 360 });
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? 1 : -1;
      onChange({
        ...value,
        saturation: Math.max(0, Math.min(1, saturation + direction * saturationStep / 100)),
      });
    } else if (event.key === 'Home') {
      event.preventDefault();
      onChange({ ...value, saturation: 0 });
    }
  };

  const saturationPercent = saturation * 100;
  const markerX = 50 + Math.cos((hue * Math.PI) / 180) * (saturationPercent / 2);
  const markerY = 50 + Math.sin((hue * Math.PI) / 180) * (saturationPercent / 2);

  return (
    <div className="flex h-full flex-col select-none rounded-xl border border-obsidian-border bg-obsidian-card/60 p-2.5 shadow-lg">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white">{title}</span>
        <button
          type="button"
          onClick={handleReset}
          className={`cursor-pointer rounded p-1 transition-colors ${
            isModified
              ? 'text-amber-400 hover:bg-amber-400/10'
              : 'text-obsidian-textMut opacity-40 hover:opacity-100'
          }`}
          title="Reset wheel to neutral"
        >
          <RotateCcw size={11} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-1">
        <div className="relative aspect-square w-full max-w-[148px]">
          <canvas
            ref={canvasRef}
            width={WHEEL_SIZE}
            height={WHEEL_SIZE}
            role="slider"
            aria-label={`${title} color wheel. Hue ${Math.round(hue)} degrees, saturation ${Math.round(saturationPercent)} percent`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(saturationPercent)}
            tabIndex={0}
            onPointerDown={(event) => {
              draggingPointer.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (draggingPointer.current === event.pointerId) updateFromPointer(event);
            }}
            onPointerUp={(event) => {
              if (draggingPointer.current === event.pointerId) draggingPointer.current = null;
            }}
            onPointerCancel={() => {
              draggingPointer.current = null;
            }}
            onDoubleClick={() => onChange({ ...value, hue: 0, saturation: 0 })}
            onKeyDown={handleKeyDown}
            className="h-full w-full cursor-crosshair touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-3.5 w-3.5 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.8)]"
            style={{
              left: `${markerX}%`,
              top: `${markerY}%`,
              transform: 'translate(-50%, -50%)',
              backgroundColor: `hsl(${hue} ${saturation}% 50%)`,
            }}
          />
        </div>
      </div>

      <div className="mt-1 flex items-center justify-around border-t border-obsidian-border/40 py-1.5 font-mono text-[9px] text-obsidian-textMut">
        <span>H <strong className="text-white">{Math.round(hue)}°</strong></span>
        <span> S <strong className="text-white">{Math.round(saturationPercent)}%</strong></span>
        <span>
          L <strong className={Math.abs(luminance) > 0.005 ? 'text-obsidian-accent' : 'text-white'}>
            {luminance > 0 ? '+' : ''}{Math.round(luminance * 100)}
          </strong>
        </span>
      </div>

      <div className="px-1 pt-1">
        <div className="mb-1 flex justify-between text-[9px] font-medium text-obsidian-textSec">
          <span>Luminance</span>
          <span className="font-mono text-white">
            {luminance > 0 ? '+' : ''}{Math.round(luminance * 100)}
          </span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          aria-label={`${title} luminance`}
          value={Math.round(luminance * 100)}
          onChange={(event) =>
            onChange({ ...value, luminance: Number(event.target.value) / 100 })
          }
          onDoubleClick={() => onChange({ ...value, luminance: 0 })}
          className="h-1.5 w-full cursor-pointer appearance-none rounded bg-obsidian-deep"
          style={{ accentColor }}
        />
      </div>
    </div>
  );
};
