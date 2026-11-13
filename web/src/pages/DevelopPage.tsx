import React from 'react';
import { Viewport } from '../components/Viewport';
import { RightPanel } from '../components/RightPanel';
import { bridge } from '../bridge';
import type { DevelopPageProps } from '../interfaces/pages';

export type { DevelopPageProps };

export const DevelopPage: React.FC<DevelopPageProps> = ({
  imageUrl,
  beforeImageUrl,
  activeAsset,
  editState,
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
        masks={editState.masks}
        selectedMaskId={selectedMaskId}
        geometry={editState.geometry}
        lensCorrection={editState.lens_correction}
        retouchSpots={editState.retouch_spots}
        selectedRetouchSpotId={selectedRetouchSpotId}
        onRetouchSpotSelect={onRetouchSpotSelect}
        onRetouchSpotChange={(spotId, updates) =>
          onChange({
            ...editState,
            retouch_spots: (editState.retouch_spots ?? []).map((spot) =>
              spot.id === spotId ? { ...spot, ...updates } : spot
            ),
          })
        }
        onMaskSelect={onMaskSelect}
        onMaskGeometryChange={(maskId, geometry) =>
          onChange({
            ...editState,
            masks: (editState.masks ?? []).map((mask) =>
              mask.id === maskId ? { ...mask, geometry } : mask
            ),
          })
        }
        isCropActive={isCropActive}
        cropRect={cropRect}
        aspectRatio={editState.geometry.aspect_ratio}
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
          onChange({ ...editState, geometry: { ...editState.geometry, aspect_ratio: ratio } })
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
