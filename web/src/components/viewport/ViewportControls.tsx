import React from 'react';
import {
  Columns,
  Eye,
  Maximize2,
  Crop,
  Grid3x3,
  RefreshCw,
  Film,
} from 'lucide-react';
import {
  GUIDE_OPTIONS,
  type GuideLineType,
} from '@/utils/compositionGuides';

export interface ViewportControlsProps {
  isFilmstripVisible: boolean;
  onToggleFilmstrip?: () => void;
  isSplitView: boolean;
  onToggleSplitView: () => void;
  showOriginal: boolean;
  onShowOriginalMouseDown: () => void;
  onShowOriginalMouseUp: () => void;
  isCropActive: boolean;
  onToggleCrop?: () => void;
  guideType: GuideLineType;
  onSelectGuideType: (type: GuideLineType) => void;
  guideOrientation: number;
  onCycleGuideOrientation: () => void;
  onFitToScreen: () => void;
  onZoom100: () => void;
}

export const ViewportControls: React.FC<ViewportControlsProps> = ({
  isFilmstripVisible,
  onToggleFilmstrip,
  isSplitView,
  onToggleSplitView,
  showOriginal,
  onShowOriginalMouseDown,
  onShowOriginalMouseUp,
  isCropActive,
  onToggleCrop,
  guideType,
  onSelectGuideType,
  guideOrientation,
  onCycleGuideOrientation,
  onFitToScreen,
  onZoom100,
}) => {
  const [isGuideMenuOpen, setIsGuideMenuOpen] = React.useState(false);
  const currentGuide = GUIDE_OPTIONS.find((g) => g.id === guideType);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-obsidian-border bg-obsidian-panel/90 shadow-2xl backdrop-blur-md select-none text-xs">
      {/* Toggle Filmstrip */}
      {onToggleFilmstrip && (
        <button
          type="button"
          onClick={onToggleFilmstrip}
          className={`p-1.5 rounded-full transition-colors cursor-pointer ${
            isFilmstripVisible
              ? 'text-obsidian-accent bg-obsidian-accent/10 hover:bg-obsidian-accent/20'
              : 'text-obsidian-textMut hover:text-white hover:bg-obsidian-hover'
          }`}
          title="Toggle Bottom Filmstrip (F)"
        >
          <Film size={14} />
        </button>
      )}

      <div className="w-px h-4 bg-obsidian-border mx-0.5" />

      {/* Fit to Screen */}
      <button
        type="button"
        onClick={onFitToScreen}
        className="p-1.5 rounded-full text-obsidian-textMut hover:text-white hover:bg-obsidian-hover transition-colors cursor-pointer"
        title="Fit Image to Viewport"
      >
        <Maximize2 size={14} />
      </button>

      {/* 100% Zoom (1:1 Pixel Inspection) */}
      <button
        type="button"
        onClick={onZoom100}
        className="px-2 py-1 rounded-full text-[10px] font-mono font-bold text-obsidian-textMut hover:text-white hover:bg-obsidian-hover transition-colors cursor-pointer"
        title="Zoom to 100% (1:1 Actual Pixels)"
      >
        1:1
      </button>

      <div className="w-px h-4 bg-obsidian-border mx-0.5" />

      {/* Before / After Split Slider Toggle */}
      <button
        type="button"
        onClick={onToggleSplitView}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
          isSplitView
            ? 'bg-obsidian-accent text-white shadow-sm'
            : 'text-obsidian-textSec hover:text-white hover:bg-obsidian-hover'
        }`}
        title="Toggle Before/After Split Comparison (\)"
      >
        <Columns size={13} />
        <span>Compare</span>
      </button>

      {/* Hold for Original Preview */}
      <button
        type="button"
        onMouseDown={onShowOriginalMouseDown}
        onMouseUp={onShowOriginalMouseUp}
        onTouchStart={onShowOriginalMouseDown}
        onTouchEnd={onShowOriginalMouseUp}
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
          showOriginal
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            : 'text-obsidian-textSec hover:text-white hover:bg-obsidian-hover'
        }`}
        title="Hold to Preview Original Unedited Image"
      >
        <Eye size={13} />
        <span>{showOriginal ? 'Showing RAW' : 'Hold RAW'}</span>
      </button>

      <div className="w-px h-4 bg-obsidian-border mx-0.5" />

      {/* Crop Tool Toggle */}
      {onToggleCrop && (
        <button
          type="button"
          onClick={onToggleCrop}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
            isCropActive
              ? 'bg-obsidian-accent text-white shadow-sm'
              : 'text-obsidian-textSec hover:text-white hover:bg-obsidian-hover'
          }`}
          title="Toggle Interactive Crop Tool (C)"
        >
          <Crop size={13} />
          <span>Crop</span>
        </button>
      )}

      {/* Composition Guides Menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsGuideMenuOpen((prev) => !prev)}
          className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors cursor-pointer ${
            guideType !== 'none'
              ? 'text-emerald-400 bg-emerald-500/10'
              : 'text-obsidian-textSec hover:text-white hover:bg-obsidian-hover'
          }`}
          title="Composition Overlays & Framing Guides (O)"
        >
          <Grid3x3 size={13} />
          <span className="capitalize">{currentGuide ? currentGuide.label : 'Grid'}</span>
        </button>

        {isGuideMenuOpen && (
          <div className="absolute top-full mt-2 left-0 w-48 rounded-xl border border-obsidian-border bg-obsidian-panel/95 p-1.5 shadow-2xl backdrop-blur-lg z-50 animate-in fade-in zoom-in-95 duration-100">
            <div className="text-[10px] uppercase font-bold text-obsidian-textMut px-2 py-1 tracking-wider">
              Composition Overlays
            </div>
            {GUIDE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onSelectGuideType(opt.id);
                  setIsGuideMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                  guideType === opt.id
                    ? 'bg-obsidian-accent text-white font-medium'
                    : 'text-obsidian-textSec hover:bg-obsidian-hover hover:text-white'
                }`}
              >
                <span>{opt.label}</span>
                {guideType === opt.id && <span className="text-[10px]">✓</span>}
              </button>
            ))}

            {currentGuide?.hasOrientation && (
              <>
                <div className="my-1 border-t border-obsidian-border" />
                <button
                  type="button"
                  onClick={onCycleGuideOrientation}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-obsidian-textSec hover:bg-obsidian-hover hover:text-white transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <RefreshCw size={12} />
                    <span>Flip Direction</span>
                  </span>
                  <span className="text-[10px] font-mono text-obsidian-textMut">
                    #{guideOrientation + 1}/4
                  </span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
