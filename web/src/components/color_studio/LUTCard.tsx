import React, { useRef } from 'react';
import { Layers, Upload } from 'lucide-react';
import { parseCubeText, registerCustomLUT } from '@/utils/webgl/lut';

interface LUTCardProps {
  lutName?: string | null;
  lutIntensity?: number;
  onChange: (name: string | null, intensity: number) => void;
}

const BUILTIN_LUTS = [
  { id: 'none', label: 'None (Pass-through)' },
  { id: 'Teal & Orange', label: 'Teal & Orange' },
  { id: 'Film Bleach Bypass', label: 'Film Bleach Bypass' },
  { id: 'Vintage Warmth', label: 'Vintage Warmth' },
];

export const LUTCard: React.FC<LUTCardProps> = ({
  lutName,
  lutIntensity = 1.0,
  onChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectLut = (selected: string) => {
    const name = selected === 'none' ? null : selected;
    onChange(name, lutIntensity);
  };

  const handleIntensityChange = (val: number) => {
    onChange(lutName ?? null, val);
  };

  const handleCustomCubeFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const stem = file.name.replace(/\.[^/.]+$/, '');
      const cube = parseCubeText(await file.text());
      registerCustomLUT(stem, cube);
      onChange(stem, lutIntensity);
    } catch (error) {
      console.error('[KuroLight] Failed to load .cube LUT:', error);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="border border-obsidian-border rounded-lg bg-obsidian-card/40 p-2.5 space-y-2 shadow-sm">
      <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
        <Layers size={13} className="text-obsidian-accent" />
        <span>3D Look-Up Table (LUT)</span>
      </div>

      {/* LUT Select Dropdown */}
      <select
        value={lutName || 'none'}
        onChange={(e) => handleSelectLut(e.target.value)}
        className="w-full bg-obsidian-input text-white border border-obsidian-border rounded px-2 py-1.5 text-xs font-semibold outline-none focus:border-obsidian-accent cursor-pointer"
      >
        {BUILTIN_LUTS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
        {lutName && !BUILTIN_LUTS.some((l) => l.id === lutName) && (
          <option value={lutName}>{lutName} (Custom)</option>
        )}
      </select>

      {/* Load Custom .cube File */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".cube"
        onChange={handleCustomCubeFile}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full py-1.5 px-2 bg-obsidian-elevated hover:bg-obsidian-hover hover:text-white border border-obsidian-border rounded font-semibold text-[10.5px] flex items-center justify-center gap-1.5 text-obsidian-textPri transition-colors"
      >
        <Upload size={12} className="text-obsidian-accent" />
        <span>Load Custom .cube…</span>
      </button>

      {/* Intensity Slider */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-obsidian-textSec">Intensity</span>
          <span className="font-mono text-white font-bold">{Math.round(lutIntensity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={lutIntensity}
          onChange={(e) => handleIntensityChange(parseFloat(e.target.value))}
          className="w-full h-1 bg-obsidian-deep rounded appearance-none cursor-pointer accent-obsidian-accent"
        />
      </div>
    </div>
  );
};
