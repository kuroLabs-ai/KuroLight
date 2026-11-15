import React, { useEffect, useState } from 'react';
import { Viewport } from '../components/Viewport';
import { RightPanel } from '../components/RightPanel';
import { bridge } from '../bridge';
import { DEFAULT_EDIT_STATE } from '@/constants/editState';
import type { DevelopPageProps } from '../interfaces/pages';

export type { DevelopPageProps };

export const DevelopPage: React.FC<DevelopPageProps> = ({
  imageUrl,
  beforeImageUrl,
  restorationPreviewUrl,
  restorationProgress,
  isRestorationRunning,
  hasRestorationPreview,
  activeAsset,
  editState: propEditState,
  selectedMaskId,
  onMaskSelect,
  selectedRetouchSpotId,
  onRetouchSpotSelect,
  onChange,
  onAutoTone,
  onPreviewAIRestoration,
  onCancelAIRestoration,
  onResetAll,
  isCropActive,
  cropRect,
  onCropChange,
  setIsCropActive,
  isFilmstripVisible,
  onToggleFilmstrip,
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onSnapshotChange,
  editUndoStack,
  editRedoStack,
  onJumpEditHistory,
  histogram,
  rightPanelWidth,
  isRightPanelCollapsed,
  onRightPanelResize,
  onResetRightPanelWidth,
  onToggleRightPanelCollapse,
  onRequestColorSample,
  onCancelColorSample,
}) => {
  const editState = propEditState || DEFAULT_EDIT_STATE;
  const geometry = editState.geometry || DEFAULT_EDIT_STATE.geometry;
  const masks = editState.masks ?? [];
  const retouchSpots = editState.retouch_spots ?? [];
  const lensCorrection = editState.lens_correction || DEFAULT_EDIT_STATE.lens_correction;
  const [warnDiscardCropEdits, setWarnDiscardCropEdits] = useState(true);

  useEffect(() => {
    let active = true;
    const handlePreferencesUpdated = (event: Event) => {
      const preferencesEvent = event as CustomEvent<{
        appearance?: { warn_discard_crop_edits?: boolean };
      }>;
      const value = preferencesEvent.detail?.appearance?.warn_discard_crop_edits;
      if (typeof value === 'boolean') setWarnDiscardCropEdits(value);
    };
    window.addEventListener('kurolight:preferences-updated', handlePreferencesUpdated);
    void bridge.getPreferences().then((prefs) => {
      if (active) setWarnDiscardCropEdits(prefs.appearance.warn_discard_crop_edits);
    }).catch((error: unknown) => {
      console.error('[KuroLight] Could not load crop warning preference:', error);
    });
    return () => {
      active = false;
      window.removeEventListener('kurolight:preferences-updated', handlePreferencesUpdated);
    };
  }, []);

  const confirmDiscardCrop = () => {
    if (!isCropActive || !warnDiscardCropEdits || !cropRect) return true;
    const changed = (
      cropRect.x !== geometry.crop_x
      || cropRect.y !== geometry.crop_y
      || cropRect.w !== geometry.crop_width
      || cropRect.h !== geometry.crop_height
    );
    return !changed || window.confirm('Discard the unfinished crop adjustment?');
  };

  const toggleCrop = () => {
    if (!isCropActive) {
      onCropChange({
        x: geometry.crop_x,
        y: geometry.crop_y,
        w: geometry.crop_width,
        h: geometry.crop_height,
      });
    } else if (!confirmDiscardCrop()) {
      return;
    }
    setIsCropActive((previous) => !previous);
  };

  return (
    <>
      {isRestorationRunning && (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-1/2 top-3 z-[60] w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-lg border border-obsidian-border bg-obsidian-panel p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium text-white">Local AI restoration</span>
            <span className="flex shrink-0 items-center gap-2 font-mono text-obsidian-textMut">
              {restorationProgress?.percent ?? 0}%
              {restorationProgress?.cancellable && (
                <button
                  type="button"
                  onClick={onCancelAIRestoration}
                  className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-obsidian-textSec hover:bg-obsidian-hover hover:text-white"
                >
                  Cancel
                </button>
              )}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Local AI restoration progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={restorationProgress?.percent ?? 0}
            className="h-1.5 w-full overflow-hidden rounded-full bg-obsidian-deep"
          >
            <div
              className="h-full bg-emerald-400 transition-[width] duration-150 ease-out"
              style={{ width: `${restorationProgress?.percent ?? 0}%` }}
            />
          </div>
        </div>
      )}
      <Viewport
        imageUrl={imageUrl}
        beforeImageUrl={beforeImageUrl}
        restorationPreviewUrl={restorationPreviewUrl}
        thumbnailPreviewUrl={activeAsset?.thumbnail_url}
        activeAssetId={activeAsset?.id}
        dimensions={
          activeAsset?.metadata
            ? { width: activeAsset.metadata.width || 0, height: activeAsset.metadata.height || 0 }
            : undefined
        }
        masks={masks}
        selectedMaskId={selectedMaskId}
        geometry={geometry}
        lensCorrection={lensCorrection}
        retouchSpots={retouchSpots}
        selectedRetouchSpotId={selectedRetouchSpotId}
        onRetouchSpotSelect={onRetouchSpotSelect}
        onRetouchSpotChange={(spotId, updates) =>
          onChange({
            ...editState,
            retouch_spots: retouchSpots.map((spot) =>
              spot.id === spotId ? { ...spot, ...updates } : spot
            ),
          })
        }
        onMaskSelect={onMaskSelect}
        onMaskGeometryChange={(maskId, geom) =>
          onChange({
            ...editState,
            masks: masks.map((mask) =>
              mask.id === maskId ? { ...mask, geometry: geom } : mask
            ),
          })
        }
        isCropActive={isCropActive}
        cropRect={cropRect}
        aspectRatio={geometry.aspect_ratio || 'Original'}
        onCropChange={onCropChange}
        onApplyCrop={(rect) => {
          onCropChange(rect);
          onChange({
            ...editState,
            geometry: {
              ...geometry,
              crop_x: rect.x,
              crop_y: rect.y,
              crop_width: rect.w,
              crop_height: rect.h,
            },
          });
          setIsCropActive(false);
        }}
        onCancelCrop={() => {
          if (!confirmDiscardCrop()) return;
          setIsCropActive(false);
        }}
        onResetCrop={() => {
          onCropChange({ x: 0, y: 0, w: 1, h: 1 });
          onChange({
            ...editState,
            geometry: {
              ...geometry,
              crop_x: 0,
              crop_y: 0,
              crop_width: 1,
              crop_height: 1,
            },
          });
        }}
        onToggleCrop={() => {
          toggleCrop();
        }}
        onSelectAspectRatio={(ratio) =>
          onChange({ ...editState, geometry: { ...geometry, aspect_ratio: ratio } })
        }
        isFilmstripVisible={isFilmstripVisible}
        onToggleFilmstrip={onToggleFilmstrip}
      />

      <RightPanel
        editState={editState}
        selectedMaskId={selectedMaskId}
        onMaskSelect={onMaskSelect}
        selectedRetouchSpotId={selectedRetouchSpotId}
        onRetouchSpotSelect={onRetouchSpotSelect}
        onChange={onChange}
        onAutoTone={onAutoTone}
        onResetAll={onResetAll}
        isCropActive={isCropActive}
        onToggleCrop={toggleCrop}
        onApplyPreset={onApplyPreset}
        onSavePreset={onSavePreset}
        onDeletePreset={onDeletePreset}
        onSelectAspectRatio={(ratio) => {
          setIsCropActive(true);
          onChange({ ...editState, geometry: { ...editState.geometry, aspect_ratio: ratio } });
        }}
        presets={presets}
        editUndoStack={editUndoStack}
        editRedoStack={editRedoStack}
        onJumpEditHistory={onJumpEditHistory}
        onSnapshotChange={onSnapshotChange}
        currentEditState={editState}
        snapshots={editState.snapshots ?? {}}
        histogram={histogram}
        activeAsset={activeAsset}
        width={rightPanelWidth}
        isCollapsed={isRightPanelCollapsed}
        onResize={onRightPanelResize}
        onResetWidth={onResetRightPanelWidth}
        onToggleCollapse={onToggleRightPanelCollapse}
        onRequestColorSample={onRequestColorSample}
        onCancelColorSample={onCancelColorSample}
        onPreviewAIRestoration={onPreviewAIRestoration}
        isRestorationRunning={isRestorationRunning}
        hasRestorationPreview={hasRestorationPreview}
      />
    </>
  );
};
