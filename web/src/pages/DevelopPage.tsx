import React from 'react';
import { Viewport } from '../components/Viewport';
import { RightPanel } from '../components/RightPanel';
import { bridge } from '../bridge';
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
  historyList,
  activeHistoryIndex,
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

  return (
    <>
      <Viewport
        imageUrl={imageUrl}
        beforeImageUrl={beforeImageUrl}
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
          setIsCropActive(false);
          bridge.applyCrop(rect.x, rect.y, rect.w, rect.h);
        }}
        onCancelCrop={() => {
          setIsCropActive(false);
          bridge.cancelCrop();
        }}
        onResetCrop={() => {
          onCropChange({ x: 0, y: 0, w: 1, h: 1 });
          bridge.resetCrop();
        }}
        onToggleCrop={() => {
          setIsCropActive((prev) => {
            const next = !prev;
            bridge.setCropMode(next);
            return next;
          });
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
        onAutoTone={() => bridge.autoTone()}
        onResetAll={onResetAll}
        isCropActive={isCropActive}
        onToggleCrop={() => {
          setIsCropActive((prev) => {
            const next = !prev;
            bridge.setCropMode(next);
            return next;
          });
        }}
        onSelectAspectRatio={(ratio) => {
          setIsCropActive(true);
          bridge.setCropMode(true);
          onChange({ ...editState, geometry: { ...editState.geometry, aspect_ratio: ratio } });
        }}
        presets={presets}
        historyList={historyList}
        activeHistoryIndex={activeHistoryIndex}
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
