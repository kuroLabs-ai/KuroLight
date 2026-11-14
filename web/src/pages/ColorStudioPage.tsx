import React from 'react';
import { Viewport } from '../components/Viewport';
import { ColorScopesCard } from '../components/color_studio/ColorScopesCard';
import { CurveEditorCard } from '../components/color_studio/CurveEditorCard';
import { LUTCard } from '../components/color_studio/LUTCard';
import { ColorWheelsPanel } from '../components/color_studio/ColorWheelsPanel';
import { ResizeHandle } from '../components/common/ResizeHandle';
import { useColorStudio } from './hooks/useColorStudio';
import type { ColorStudioPageProps } from '../interfaces/pages';

export type { ColorStudioPageProps };

export const ColorStudioPage: React.FC<ColorStudioPageProps> = ({
  imageUrl,
  beforeImageUrl,
  activeAsset,
  editState,
  onChange,
  histogram,
  colorScopes,
  selectedRetouchSpotId,
  onRetouchSpotSelect,
  onRetouchSpotChange,
}) => {
  const {
    sidePanelWidth,
    handleSidePanelResize,
    resetSidePanelWidth,
    handleColorGradingChange,
    handleCurvesChange,
    handleLUTChange,
  } = useColorStudio({ editState, onChange });

  return (
    <div className="flex-1 flex flex-col h-full bg-obsidian-deep overflow-hidden select-none">
      {/* ── Upper Section: Viewport + Scopes & Curves Sidebar ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Viewport Preview */}
        <div className="flex-1 h-full relative overflow-hidden">
          <Viewport
            imageUrl={imageUrl}
            beforeImageUrl={beforeImageUrl}
            activeAssetId={activeAsset?.id}
            dimensions={
              activeAsset?.metadata
                ? { width: activeAsset.metadata.width || 0, height: activeAsset.metadata.height || 0 }
                : undefined
            }
            geometry={editState.geometry}
            lensCorrection={editState.lens_correction}
            retouchSpots={editState.retouch_spots}
            selectedRetouchSpotId={selectedRetouchSpotId}
            onRetouchSpotSelect={onRetouchSpotSelect}
            onRetouchSpotChange={onRetouchSpotChange}
          />
        </div>

        {/* Resizer Handle */}
        <ResizeHandle
          direction="vertical"
          side="right"
          onResize={handleSidePanelResize}
          onDoubleClick={resetSidePanelWidth}
          title="Drag to resize Color Studio side panel"
        />

        {/* Right Tools: Scopes, Curves & LUT */}
        <aside
          style={{ width: `${sidePanelWidth}px` }}
          className="bg-obsidian-panel border-l border-obsidian-border flex flex-col h-full overflow-y-auto p-2.5 space-y-2.5 flex-shrink-0"
        >
          {/* Real-time Color Scopes */}
          <ColorScopesCard histogram={histogram} colorScopes={colorScopes} />

          {/* Interactive Multi-channel Curve Editor */}
          <CurveEditorCard
            curves={editState.tone_curves}
            histogram={histogram}
            onChange={handleCurvesChange}
          />

          {/* 3D LUT (Look-Up Table) */}
          <LUTCard
            lutName={editState.color_grading?.lut_name}
            lutIntensity={editState.color_grading?.lut_intensity ?? 1.0}
            onChange={handleLUTChange}
          />
        </aside>
      </div>

      {/* ── Bottom Section: 4-Way Color Wheels (Lift, Gamma, Gain, Offset) ── */}
      <div className="h-[275px] w-full flex-shrink-0">
        <ColorWheelsPanel
          colorGrading={editState.color_grading}
          onChange={handleColorGradingChange}
        />
      </div>
    </div>
  );
};
