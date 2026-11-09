import React, { useState } from 'react';
import { EditState, HSLBand, ColorWheelValue, CurvePoint } from '../../types';
import { Palette, ChevronDown, ChevronRight, Sliders, SunMedium } from 'lucide-react';

interface ColorTabProps {
  editState: EditState;
  onChange: (newState: EditState) => void;
}

const COLOR_BANDS = [
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

export const ColorTab: React.FC<ColorTabProps> = ({ editState, onChange }) => {
  const [hslMode, setHslMode] = useState<'all' | 'hue' | 'sat' | 'lum'>('all');
  const [activeCurveChannel, setActiveCurveChannel] = useState<'rgb' | 'red' | 'green' | 'blue'>('rgb');
  const [activeWheel, setActiveWheel] = useState<'lift' | 'gamma' | 'gain'>('gamma');

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

  const updateHSLBand = (bandKey: string, param: keyof HSLBand, val: number) => {
    const currentBand = (hsl as any)[bandKey] || { ...DEFAULT_HSL_BAND };
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

  const updateColorWheel = (wheelKey: 'lift' | 'gamma' | 'gain', param: keyof ColorWheelValue, val: number) => {
    const cg = editState.color_grading || {
      lift: { hue: 0, saturation: 0, luminance: 0 },
      gamma: { hue: 0, saturation: 0, luminance: 0 },
      gain: { hue: 0, saturation: 0, luminance: 0 },
      offset: { hue: 0, saturation: 0, luminance: 0 },
      lut_intensity: 1.0,
    };
    const currentWheel = (cg as any)[wheelKey] || { hue: 0, saturation: 0, luminance: 0 };
    onChange({
      ...editState,
      color_grading: {
        ...cg,
        [wheelKey]: {
          ...currentWheel,
          [param]: val,
        },
      },
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
            const currentBand = (hsl as any)[band.key] || { ...DEFAULT_HSL_BAND };

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

      {/* ── 2. 3-WAY COLOR GRADING WHEELS ── */}
      <div className="border border-obsidian-border rounded-lg bg-obsidian-card/40 p-2.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
            <SunMedium size={13} className="text-obsidian-accent" />
            <span>Color Grading (3-Way)</span>
          </div>
          {/* Wheel Selector */}
          <div className="flex bg-obsidian-elevated p-0.5 rounded border border-obsidian-border text-[9px] font-semibold">
            {(['lift', 'gamma', 'gain'] as const).map((w) => (
              <button
                key={w}
                onClick={() => setActiveWheel(w)}
                className={`px-2 py-0.5 rounded capitalize transition-colors ${
                  activeWheel === w
                    ? 'bg-obsidian-accent text-white font-bold'
                    : 'text-obsidian-textMut hover:text-white'
                }`}
              >
                {w === 'lift' ? 'Shadows' : w === 'gamma' ? 'Midtones' : 'Highlights'}
              </button>
            ))}
          </div>
        </div>

        {/* Active Wheel Controls */}
        {(() => {
          const cg = editState.color_grading || {
            lift: { hue: 0, saturation: 0, luminance: 0 },
            gamma: { hue: 0, saturation: 0, luminance: 0 },
            gain: { hue: 0, saturation: 0, luminance: 0 },
            offset: { hue: 0, saturation: 0, luminance: 0 },
            lut_intensity: 1.0,
          };
          const current = (cg as any)[activeWheel] || { hue: 0, saturation: 0, luminance: 0 };

          return (
            <div className="space-y-2 bg-obsidian-deep/50 p-2.5 rounded-lg border border-obsidian-border">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-white font-semibold capitalize">
                  {activeWheel === 'lift' ? 'Shadows' : activeWheel === 'gamma' ? 'Midtones' : 'Highlights'}
                </span>
                <span className="font-mono text-[9px] text-obsidian-textMut">
                  H: {Math.round(current.hue)}°  S: {Math.round(current.saturation)}%
                </span>
              </div>

              {/* Hue 0-360 Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-obsidian-textMut">
                  <span>Tint Hue</span>
                  <span className="font-mono">{Math.round(current.hue)}°</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={current.hue}
                  onChange={(e) => updateColorWheel(activeWheel, 'hue', parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded appearance-none cursor-pointer"
                  style={{
                    background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'
                  }}
                />
              </div>

              {/* Saturation 0-100 Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-obsidian-textMut">
                  <span>Tint Saturation</span>
                  <span className="font-mono">{Math.round(current.saturation)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={current.saturation}
                  onChange={(e) => updateColorWheel(activeWheel, 'saturation', parseFloat(e.target.value))}
                  className="w-full h-1 bg-obsidian-card rounded appearance-none cursor-pointer"
                />
              </div>

              {/* Master Luminance Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-obsidian-textMut">
                  <span>Luminance</span>
                  <span className="font-mono">{current.luminance > 0 ? `+${current.luminance}` : current.luminance}</span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={current.luminance}
                  onChange={(e) => updateColorWheel(activeWheel, 'luminance', parseFloat(e.target.value))}
                  className="w-full h-1 bg-obsidian-card rounded appearance-none cursor-pointer"
                />
              </div>

              <div className="pt-1 text-right">
                <button
                  onClick={() => {
                    updateColorWheel(activeWheel, 'hue', 0);
                    updateColorWheel(activeWheel, 'saturation', 0);
                    updateColorWheel(activeWheel, 'luminance', 0);
                  }}
                  className="text-[9.5px] text-obsidian-textMut hover:text-white"
                >
                  Reset Wheel
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── 3. TONE CURVES ── */}
      <div className="border border-obsidian-border rounded-lg bg-obsidian-card/40 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
            <Sliders size={13} className="text-obsidian-accent" />
            <span>Tone Curves</span>
          </div>
          {/* Channel selector */}
          <div className="flex bg-obsidian-elevated p-0.5 rounded border border-obsidian-border text-[9px] font-semibold">
            {(['rgb', 'red', 'green', 'blue'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => setActiveCurveChannel(ch)}
                className={`px-1.5 py-0.5 rounded uppercase font-bold transition-colors ${
                  activeCurveChannel === ch
                    ? ch === 'red' ? 'bg-red-600 text-white' :
                      ch === 'green' ? 'bg-green-600 text-white' :
                      ch === 'blue' ? 'bg-blue-600 text-white' :
                      'bg-obsidian-accent text-white'
                    : 'text-obsidian-textMut hover:text-white'
                }`}
              >
                {ch === 'rgb' ? 'RGB' : ch[0].toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* SVG Curve Graph */}
        <div className="w-full h-36 bg-obsidian-deep rounded border border-obsidian-border relative overflow-hidden flex items-center justify-center">
          <svg className="w-full h-full p-2" viewBox="0 0 100 100">
            {/* Grid lines */}
            <line x1="25" y1="0" x2="25" y2="100" stroke="#252A32" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="50" y1="0" x2="50" y2="100" stroke="#252A32" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="75" y1="0" x2="75" y2="100" stroke="#252A32" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="0" y1="25" x2="100" y2="25" stroke="#252A32" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#252A32" strokeWidth="0.5" strokeDasharray="2,2" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="#252A32" strokeWidth="0.5" strokeDasharray="2,2" />

            {/* Linear Reference Line */}
            <line x1="0" y1="100" x2="100" y2="0" stroke="#353B47" strokeWidth="1" strokeDasharray="3,3" />

            {/* Active Spline Path */}
            <path
              d="M 0 100 Q 50 50 100 0"
              fill="none"
              stroke={
                activeCurveChannel === 'red' ? '#EF4444' :
                activeCurveChannel === 'green' ? '#22C55E' :
                activeCurveChannel === 'blue' ? '#3B82F6' :
                '#0088FF'
              }
              strokeWidth="2"
            />

            {/* Control Points */}
            <circle cx="0" cy="100" r="3" fill="#FFFFFF" />
            <circle cx="50" cy="50" r="3" fill="#0088FF" stroke="#FFFFFF" strokeWidth="1" />
            <circle cx="100" cy="0" r="3" fill="#FFFFFF" />
          </svg>
        </div>
      </div>
    </div>
  );
};
