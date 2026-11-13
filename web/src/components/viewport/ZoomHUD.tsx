import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

export interface ZoomHUDProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetFit: () => void;
  dimensions?: { width: number; height: number };
}

export const ZoomHUD: React.FC<ZoomHUDProps> = ({
  scale,
  onZoomIn,
  onZoomOut,
  onResetFit,
  dimensions,
}) => {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 rounded-full border border-obsidian-border bg-obsidian-panel/90 px-3 py-1.5 shadow-xl backdrop-blur-md select-none text-xs">
      <button
        type="button"
        onClick={onZoomOut}
        className="text-obsidian-textMut hover:text-white transition-colors cursor-pointer p-0.5"
        title="Zoom Out"
      >
        <ZoomOut size={13} />
      </button>

      <span
        onClick={onResetFit}
        title="Click to reset to Fit"
        className="text-[11px] font-mono font-bold text-obsidian-textPri cursor-pointer hover:text-obsidian-accent px-1.5 min-w-[42px] text-center"
      >
        {Math.round(scale * 100)}%
      </span>

      <button
        type="button"
        onClick={onZoomIn}
        className="text-obsidian-textMut hover:text-white transition-colors cursor-pointer p-0.5"
        title="Zoom In"
      >
        <ZoomIn size={13} />
      </button>

      {dimensions?.width && dimensions?.height && (
        <>
          <div className="w-px h-3 bg-obsidian-border mx-1" />
          <span className="text-[10px] text-obsidian-textMut font-mono">
            {dimensions.width} × {dimensions.height}
          </span>
        </>
      )}
    </div>
  );
};
