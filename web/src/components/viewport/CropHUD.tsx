import React from 'react';
import { RotateCcw, X, Check, RefreshCw } from 'lucide-react';
import {
  GUIDE_OPTIONS,
  type GuideLineType,
  getNextOrientation,
} from '@/utils/compositionGuides';

export interface CropHUDProps {
  aspectRatio: string;
  onSelectAspectRatio?: (ratio: string) => void;
  guideType: GuideLineType;
  onSelectGuideType: (type: GuideLineType) => void;
  guideOrientation: number;
  onCycleGuideOrientation: () => void;
  onResetCrop: () => void;
  onCancelCrop: () => void;
  onApplyCrop: () => void;
}

export const CropHUD: React.FC<CropHUDProps> = ({
  aspectRatio,
  onSelectAspectRatio,
  guideType,
  onSelectGuideType,
  guideOrientation,
  onCycleGuideOrientation,
  onResetCrop,
  onCancelCrop,
  onApplyCrop,
}) => {
  const currentGuide = GUIDE_OPTIONS.find((g) => g.id === guideType);

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl border border-obsidian-border bg-obsidian-panel/95 px-4 py-2.5 shadow-2xl backdrop-blur-md select-none text-xs">
      {/* Aspect Ratio Selector */}
      <div className="flex items-center gap-1.5 font-medium text-obsidian-textSec">
        <span>Aspect:</span>
        <select
          value={aspectRatio}
          onChange={(e) => onSelectAspectRatio?.(e.target.value)}
          className="rounded border border-obsidian-border bg-obsidian-card px-2 py-1 text-xs font-semibold text-white outline-none cursor-pointer focus:border-obsidian-accent"
        >
          <option value="Original">Original</option>
          <option value="Free Form">Free Form</option>
          <option value="1:1 Square">1:1 Square</option>
          <option value="16:9 Landscape">16:9 Landscape</option>
          <option value="4:3 Standard">4:3 Standard</option>
          <option value="3:2 Photo">3:2 Photo</option>
          <option value="9:16 Portrait">9:16 Portrait</option>
        </select>
      </div>

      <div className="w-px h-5 bg-obsidian-border" />

      {/* Composition Guide Selector */}
      <div className="flex items-center gap-1.5 font-medium text-obsidian-textSec">
        <span>Guide:</span>
        <select
          value={guideType}
          onChange={(e) => onSelectGuideType(e.target.value as GuideLineType)}
          className="rounded border border-obsidian-border bg-obsidian-card px-2 py-1 text-xs font-semibold text-white outline-none cursor-pointer focus:border-obsidian-accent"
        >
          {GUIDE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        {currentGuide?.hasOrientation && (
          <button
            type="button"
            onClick={onCycleGuideOrientation}
            className="p-1 rounded bg-obsidian-card hover:bg-obsidian-hover text-obsidian-textSec hover:text-white border border-obsidian-border text-xs transition-colors cursor-pointer"
            title="Flip Orientation"
          >
            <RefreshCw size={12} />
          </button>
        )}
      </div>

      <div className="w-px h-5 bg-obsidian-border" />

      {/* Reset */}
      <button
        type="button"
        onClick={onResetCrop}
        className="flex items-center gap-1.5 rounded border border-obsidian-border bg-obsidian-card px-2.5 py-1 text-xs font-medium text-obsidian-textSec hover:bg-obsidian-hover hover:text-white transition-colors cursor-pointer"
        title="Reset to 100% Full Photo"
      >
        <RotateCcw size={12} />
        <span>Reset</span>
      </button>

      {/* Cancel */}
      <button
        type="button"
        onClick={onCancelCrop}
        className="flex items-center gap-1.5 rounded border border-obsidian-border bg-obsidian-card px-2.5 py-1 text-xs font-medium text-obsidian-textSec hover:bg-obsidian-hover hover:text-red-400 transition-colors cursor-pointer"
        title="Cancel Crop"
      >
        <X size={13} />
        <span>Cancel</span>
      </button>

      {/* Apply / Done */}
      <button
        type="button"
        onClick={onApplyCrop}
        className="flex items-center gap-1.5 rounded-md bg-obsidian-accent px-3.5 py-1 text-xs font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-600 transition-all active:scale-95 cursor-pointer"
        title="Apply Crop and Finish"
      >
        <Check size={14} />
        <span>Done</span>
      </button>
    </div>
  );
};
