import React from 'react';
import { Viewport } from '../components/Viewport';
import { RightPanel } from '../components/RightPanel';
import { DEFAULT_EDIT_STATE } from '@/constants/editState';
import type { DevelopPageProps } from '../interfaces/pages';

export type { DevelopPageProps };

export const DevelopPage: React.FC<DevelopPageProps> = ({
  imageUrl,
  beforeImageUrl,
  activeAsset,
  editState: propEditState,
  selectedMaskId,
  onMaskSelect,
  selectedRetouchSpotId,
  onRetouchSpotSelect,
  onChange,
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
  const toggleCrop = () => {
    if (!isCropActive) {
      onCropChange({
        x: geometry.crop_x,
        y: geometry.crop_y,
        w: geometry.crop_width,
        h: geometry.crop_height,
      });
    }
    setIsCropActive((previous) => !previous);
  };

  return (
    <>
      <Viewport
        imageUrl={imageUrl}
        beforeImageUrl={beforeImageUrl}
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
        onAutoTone={() => undefined}
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
      />
    </>
  );
};
