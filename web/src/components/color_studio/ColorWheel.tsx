import React, { useCallback } from 'react';
import { HsvColorPicker } from 'react-colorful';
import { RotateCcw } from 'lucide-react';
import type { ColorWheelValue } from '@/types';

interface ColorWheelProps {
  title: string;
  accentColor: string;
  value: ColorWheelValue;
  onChange: (val: ColorWheelValue) => void;
}

export const ColorWheel: React.FC<ColorWheelProps> = ({
  title,
  accentColor,
  value,
  onChange,
}) => {
  const hue = value?.hue ?? 0;
  const sat = value?.saturation ?? 0;
  const lum = value?.luminance ?? 0;

  const isModified = hue !== 0 || sat !== 0 || Math.abs(lum) > 0.005;

  const handleReset = useCallback(() => {
    onChange({ hue: 0, saturation: 0, luminance: 0 });
  }, [onChange]);

  const handleHsvChange = useCallback(
    (hsv: { h: number; s: number; v: number }) => {
      onChange({
        hue: Math.round(hsv.h),
        saturation: Math.round(hsv.s),
        luminance: lum,
      });
    },
    [onChange, lum]
  );

  return (
    <div className="flex flex-col h-full select-none rounded-xl border border-obsidian-border bg-obsidian-card/60 shadow-lg p-2.5">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-white">
          {title}
        </span>
        <button
          type="button"
          onClick={handleReset}
          className={`p-1 rounded transition-colors cursor-pointer ${
            isModified
              ? 'text-amber-400 hover:bg-amber-400/10'
              : 'text-obsidian-textMut opacity-40 hover:opacity-100'
          }`}
          title="Reset wheel to neutral"
        >
          <RotateCcw size={11} />
        </button>
      </div>

      {/* Visual Color Picker via react-colorful */}
      <div className="flex-1 flex items-center justify-center p-1 min-h-[130px]">
        <div className="react-colorful-kuro scale-90 origin-center">
          <HsvColorPicker
            color={{ h: hue, s: sat, v: 100 }}
            onChange={handleHsvChange}
          />
        </div>
      </div>

      {/* Readout */}
      <div className="flex items-center justify-around py-1.5 font-mono text-[10px] text-obsidian-textMut border-t border-obsidian-border/40 mt-1">
        <span>
          H <strong className="text-white">{Math.round(hue)}°</strong>
        </span>
        <span>
          S <strong className="text-white">{Math.round(sat)}%</strong>
        </span>
        <span>
          L <strong className={Math.abs(lum) > 0.005 ? 'text-obsidian-accent' : 'text-white'}>
            {lum > 0 ? '+' : ''}{Math.round(lum * 100)}
          </strong>
        </span>
      </div>

      {/* Luminance Slider */}
      <div className="px-1 pt-1.5">
        <div className="flex justify-between text-[9px] text-obsidian-textSec font-medium mb-1">
          <span>Luminance Level</span>
          <span className="font-mono text-white">
            {lum > 0 ? '+' : ''}{Math.round(lum * 100)}
          </span>
        </div>
        <input
          type="range"
          min={-100}
          max={100}
          step={1}
          value={Math.round(lum * 100)}
          onChange={(e) =>
            onChange({ ...value, luminance: parseFloat(e.target.value) / 100.0 })
          }
          className="w-full h-1.5 rounded appearance-none cursor-pointer bg-obsidian-deep"
          style={{ accentColor }}
        />
      </div>
    </div>
  );
};
