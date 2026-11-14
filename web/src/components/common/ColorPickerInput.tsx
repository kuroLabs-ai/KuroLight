import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Pipette } from 'lucide-react';
import { colorToHsv, hsvToHex, normalizeHex } from '@/utils/color';

interface ColorPickerInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPickFromImage?: (onSample: (color: string) => void) => void;
  onCancelImagePick?: () => void;
}

export const ColorPickerInput: React.FC<ColorPickerInputProps> = ({
  label,
  value,
  onChange,
  onPickFromImage,
  onCancelImagePick,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  const [isPickingFromImage, setIsPickingFromImage] = useState(false);
  const isDragging = useRef(false);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const hsv = colorToHsv(value);

  useEffect(() => {
    const handleCancel = () => setIsPickingFromImage(false);
    window.addEventListener('kurolight:color-sample-cancelled', handleCancel);
    return () => window.removeEventListener('kurolight:color-sample-cancelled', handleCancel);
  }, []);

  const commitColor = (color: string) => {
    setHexDraft(color.toUpperCase());
    onChange(color);
  };

  const updateFromPlane = (clientX: number, clientY: number) => {
    const plane = planeRef.current;
    if (!plane) return;
    const bounds = plane.getBoundingClientRect();
    const saturation = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const brightness = 1 - Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height));
    commitColor(hsvToHex({ ...hsv, saturation, value: brightness }));
  };

  const updateHex = (draft: string) => {
    setHexDraft(draft);
    const normalized = normalizeHex(draft);
    if (normalized) commitColor(normalized);
  };

  const requestImageSample = () => {
    if (!onPickFromImage) return;
    if (isPickingFromImage) {
      setIsPickingFromImage(false);
      onCancelImagePick?.();
      return;
    }
    setIsPickingFromImage(true);
    onPickFromImage((color) => {
      commitColor(color);
      setIsPickingFromImage(false);
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-label={`${label}: ${value}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="app-control flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[10px] font-semibold text-obsidian-textSec transition-colors hover:text-white"
      >
        <span className="h-5 w-5 shrink-0 rounded-md border border-white/20 shadow-inner" style={{ backgroundColor: value }} />
        <span className="flex-1">{label}</span>
        <span className="font-mono text-[9px] uppercase tracking-wide text-obsidian-textMut">{value}</span>
        <ChevronDown size={12} className={`text-obsidian-textMut transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="space-y-2.5 rounded-xl border border-obsidian-border bg-obsidian-deep p-2.5 shadow-lg shadow-black/30">
          <div
            ref={planeRef}
            role="slider"
            aria-label={`${label} saturation and brightness`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.saturation * 100)}
            tabIndex={0}
            onPointerDown={(event) => {
              isDragging.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPlane(event.clientX, event.clientY);
            }}
            onPointerMove={(event) => {
              if (isDragging.current) updateFromPlane(event.clientX, event.clientY);
            }}
            onPointerUp={() => { isDragging.current = false; }}
            onPointerCancel={() => { isDragging.current = false; }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 0.1 : 0.02;
              if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              const saturation = Math.max(0, Math.min(1, hsv.saturation + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)));
              const brightness = Math.max(0, Math.min(1, hsv.value + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)));
              commitColor(hsvToHex({ ...hsv, saturation, value: brightness }));
            }}
            className="relative h-36 touch-none cursor-crosshair overflow-hidden rounded-lg border border-white/10 outline-none focus-visible:ring-2 focus-visible:ring-obsidian-accent"
            style={{ backgroundColor: `hsl(${hsv.hue} 100% 50%)` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
            <span
              className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_5px_rgba(0,0,0,0.8)]"
              style={{ left: `${hsv.saturation * 100}%`, top: `${(1 - hsv.value) * 100}%` }}
            />
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {onPickFromImage && (
              <button
                type="button"
                aria-label={`Pick ${label.toLowerCase()} from image`}
                aria-pressed={isPickingFromImage}
                title={isPickingFromImage ? 'Click a point on the image' : 'Pick a color from the current image'}
                onClick={requestImageSample}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
                  isPickingFromImage
                    ? 'border-obsidian-accent bg-obsidian-accent/20 text-obsidian-accent'
                    : 'border-transparent text-obsidian-textMut hover:border-obsidian-border hover:bg-obsidian-card hover:text-white'
                }`}
              >
                {isPickingFromImage ? <Check size={14} /> : <Pipette size={14} />}
              </button>
            )}
            <input
              aria-label={`${label} hex value`}
              type="text"
              value={hexDraft}
              onChange={(event) => updateHex(event.target.value)}
              onBlur={() => setHexDraft(value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              maxLength={7}
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-obsidian-border bg-obsidian-card px-2.5 py-1.5 font-mono text-[10px] uppercase text-white outline-none transition-colors focus:border-obsidian-accent focus:ring-2 focus:ring-obsidian-accent/20"
            />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-obsidian-textMut">Hex</span>
          </div>

          <input
            type="range"
            aria-label={`${label} hue`}
            min={0}
            max={359}
            value={Math.round(hsv.hue)}
            onChange={(event) => commitColor(hsvToHex({ ...hsv, hue: Number(event.target.value) }))}
            style={{
              '--range-track': 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            } as React.CSSProperties}
            className="w-full"
          />
          {isPickingFromImage && (
            <p role="status" className="text-[9px] text-obsidian-accent">
              Click the image to sample its color, or press Escape to cancel.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
