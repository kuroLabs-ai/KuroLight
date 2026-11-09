import React from 'react';
import { ColorScopes, EditState, ImageAsset, RetouchSpot } from '../../types';
import { Viewport } from '../Viewport';
import { ColorScopesCard } from './ColorScopesCard';
import { CurveEditorCard } from './CurveEditorCard';
import { LUTCard } from './LUTCard';
import { ColorWheelsPanel } from './ColorWheelsPanel';
import { ResizeHandle } from '../common/ResizeHandle';
import { usePanelResize } from '../../hooks/usePanelResize';

interface ColorStudioWorkspaceProps {
  imageUrl?: string;
  beforeImageUrl?: string;
  activeAsset?: ImageAsset | null;
  editState: EditState;
  onChange: (newState: EditState) => void;
  histogram?: { r: number[]; g: number[]; b: number[]; lum: number[] };
  colorScopes?: ColorScopes | null;
  selectedRetouchSpotId?: string | null;
  onRetouchSpotSelect?: (spotId: string) => void;
  onRetouchSpotChange?: (spotId: string, updates: Partial<RetouchSpot>) => void;
}

export const ColorStudioWorkspace: React.FC<ColorStudioWorkspaceProps> = ({
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
  // Resizable Right Scopes/Curves Side Panel
  const {
    size: sidePanelWidth,
    handleResize: handleSidePanelResize,
    resetSize: resetSidePanelWidth,
  } = usePanelResize({
    initialSize: 310,
    minSize: 260,
    maxSize: 520,
    storageKey: 'kurolight_color_studio_sidebar_width',
  });

  const handleColorGradingChange = (newCg: typeof editState.color_grading) => {
    onChange({
      ...editState,
      color_grading: newCg,
    });
  };

  const handleCurvesChange = (newCurves: typeof editState.tone_curves) => {
    onChange({
      ...editState,
      tone_curves: newCurves,
    });
  };

  const handleLUTChange = (lutName: string | null, lutIntensity: number) => {
    onChange({
      ...editState,
      color_grading: {
        ...editState.color_grading,
        lut_name: lutName,
        lut_intensity: lutIntensity,
      },
    });
  };

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

      {/* ── Bottom Section: 4-Way Color Wheels (Lift, Gamma, Gain, Offset) - Not resizable, full width ── */}
      <div className="h-[275px] w-full flex-shrink-0">
        <ColorWheelsPanel
          colorGrading={editState.color_grading}
          onChange={handleColorGradingChange}
        />
      </div>
    </div>
  );
};
