import React, { useState } from 'react';
import { EditState, HSLBand } from '../../types';
import { Palette } from 'lucide-react';
import { CurveEditorCard } from '../color_studio/CurveEditorCard';
import type { HistogramData } from '@/interfaces/scopes';

interface ColorTabProps {
  editState: EditState;
  histogram?: HistogramData;
  onChange: (newState: EditState) => void;
}

const COLOR_BANDS: {
  key: keyof NonNullable<EditState['hsl']>;
  label: string;
  color: string;
}[] = [
  { key: 'red', label: 'Red', color: '#EF4444' },
  { key: 'orange', label: 'Orange', color: '#F97316' },
  { key: 'yellow', label: 'Yellow', color: '#EAB308' },
  { key: 'green', label: 'Green', color: '#22C55E' },
  { key: 'aqua', label: 'Aqua', color: '#06B6D4' },
  { key: 'blue', label: 'Blue', color: '#3B82F6' },
  { key: 'purple', label: 'Purple', color: '#A855F7' },
  { key: 'magenta', label: 'Magenta', color: '#EC4899' },
];

const DEFAULT_HSL_BAND: HSLBand = { hue: 0, saturation: 0, luminance: 0 };

export const ColorTab: React.FC<ColorTabProps> = ({ editState, histogram, onChange }) => {
  const [hslMode, setHslMode] = useState<'all' | 'hue' | 'sat' | 'lum'>('all');

  const hsl = editState.hsl || {
    red: { ...DEFAULT_HSL_BAND },
    orange: { ...DEFAULT_HSL_BAND },
    yellow: { ...DEFAULT_HSL_BAND },
    green: { ...DEFAULT_HSL_BAND },
    aqua: { ...DEFAULT_HSL_BAND },
    blue: { ...DEFAULT_HSL_BAND },
    purple: { ...DEFAULT_HSL_BAND },
    magenta: { ...DEFAULT_HSL_BAND },
  };

  const updateHSLBand = (
    bandKey: keyof typeof hsl,
    param: keyof HSLBand,
    val: number
  ) => {
    const currentBand = hsl[bandKey] || { ...DEFAULT_HSL_BAND };
    const updatedHSL = {
      ...hsl,
      [bandKey]: {
        ...currentBand,
        [param]: val,
      },
    };
    onChange({
      ...editState,
      hsl: updatedHSL,
    });
  };

  return (
    <div className="space-y-3 text-xs select-none">
      {/* ── 1. HSL COLOR MIXER ── */}
      <div className="border border-obsidian-border rounded-lg bg-obsidian-card/40 p-2.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
            <Palette size={13} className="text-obsidian-accent" />
            <span>HSL / Color Mixer</span>
          </div>
          {/* Submode switcher: All, Hue, Sat, Lum */}
          <div className="flex bg-obsidian-elevated p-0.5 rounded border border-obsidian-border text-[9px] font-semibold">
            {(['all', 'hue', 'sat', 'lum'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setHslMode(m)}
                className={`px-1.5 py-0.5 rounded uppercase transition-colors ${
                  hslMode === m
                    ? 'bg-obsidian-accent text-white font-bold'
                    : 'text-obsidian-textMut hover:text-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Bands list */}
        <div className="space-y-2 pt-1">
          {COLOR_BANDS.map((band) => {
            const currentBand = hsl[band.key] || { ...DEFAULT_HSL_BAND };

            return (
              <div key={band.key} className="space-y-1 bg-obsidian-deep/40 p-1.5 rounded border border-obsidian-border/40">
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: band.color }} />
                    <span className="text-white font-semibold">{band.label}</span>
                  </div>
                  <button
                    onClick={() => {
                      updateHSLBand(band.key, 'hue', 0);
                      updateHSLBand(band.key, 'saturation', 0);
                      updateHSLBand(band.key, 'luminance', 0);
                    }}
                    className="text-[9px] text-obsidian-textMut hover:text-obsidian-accent"
                  >
                    Reset
                  </button>
                </div>

                {/* Hue slider */}
                {(hslMode === 'all' || hslMode === 'hue') && (
                  <div className="flex items-center gap-2 text-[9.5px]">
                    <span className="w-7 text-obsidian-textMut">Hue</span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={currentBand.hue}
                      onChange={(e) => updateHSLBand(band.key, 'hue', parseFloat(e.target.value))}
                      className="flex-1 h-1 bg-obsidian-card rounded appearance-none cursor-pointer"
                    />
                    <span className="w-8 text-right font-mono text-[9px] text-obsidian-textSec">
                      {currentBand.hue > 0 ? `+${currentBand.hue}` : currentBand.hue}
                    </span>
                  </div>
                )}

                {/* Saturation slider */}
                {(hslMode === 'all' || hslMode === 'sat') && (
                  <div className="flex items-center gap-2 text-[9.5px]">
                    <span className="w-7 text-obsidian-textMut">Sat</span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={currentBand.saturation}
                      onChange={(e) => updateHSLBand(band.key, 'saturation', parseFloat(e.target.value))}
                      className="flex-1 h-1 bg-obsidian-card rounded appearance-none cursor-pointer"
                    />
                    <span className="w-8 text-right font-mono text-[9px] text-obsidian-textSec">
                      {currentBand.saturation > 0 ? `+${currentBand.saturation}` : currentBand.saturation}
                    </span>
                  </div>
                )}

                {/* Luminance slider */}
                {(hslMode === 'all' || hslMode === 'lum') && (
                  <div className="flex items-center gap-2 text-[9.5px]">
                    <span className="w-7 text-obsidian-textMut">Lum</span>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={currentBand.luminance}
                      onChange={(e) => updateHSLBand(band.key, 'luminance', parseFloat(e.target.value))}
                      className="flex-1 h-1 bg-obsidian-card rounded appearance-none cursor-pointer"
                    />
                    <span className="w-8 text-right font-mono text-[9px] text-obsidian-textSec">
                      {currentBand.luminance > 0 ? `+${currentBand.luminance}` : currentBand.luminance}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <CurveEditorCard
        curves={editState.tone_curves}
        histogram={histogram}
        onChange={(tone_curves) => onChange({ ...editState, tone_curves })}
      />
    </div>
  );
};
