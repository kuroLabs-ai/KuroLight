import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  TransformWrapper,
  TransformComponent,
  ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import {
  ReactCompareSlider,
  ReactCompareSliderImage,
} from 'react-compare-slider';
import { useEditStore } from '@/stores/useAppStore';
import { useLiveFilterCanvas } from './viewport/useLiveFilterCanvas';
import { ViewportControls } from './viewport/ViewportControls';
import { CropHUD } from './viewport/CropHUD';
import { ZoomHUD } from './viewport/ZoomHUD';
import {
  type GuideLineType,
  getNextOrientation,
  getNextGuideType,
} from '@/utils/compositionGuides';
import type {
  AdjustmentMask,
  GeometrySettings,
  LensCorrectionSettings,
  RetouchSpot,
} from '@/types';

export interface ViewportProps {
  imageUrl?: string;
  beforeImageUrl?: string;
  activeAssetId?: string;
  dimensions?: { width: number; height: number };
  masks?: AdjustmentMask[];
  selectedMaskId?: string | null;
  geometry?: GeometrySettings;
  lensCorrection?: LensCorrectionSettings;
  onMaskSelect?: (maskId: string) => void;
  onMaskGeometryChange?: (maskId: string, geometry: AdjustmentMask['geometry']) => void;
  retouchSpots?: RetouchSpot[];
  selectedRetouchSpotId?: string | null;
  onRetouchSpotSelect?: (spotId: string) => void;
  onRetouchSpotChange?: (spotId: string, updates: Partial<RetouchSpot>) => void;
  // Crop
  isCropActive?: boolean;
  cropRect?: { x: number; y: number; w: number; h: number };
  aspectRatio?: string;
  onCropChange?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onApplyCrop?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onCancelCrop?: () => void;
  onResetCrop?: () => void;
  onToggleCrop?: () => void;
  onSelectAspectRatio?: (ratio: string) => void;
  // Misc
  onViewportRectChange?: (rect: { x: number; y: number; w: number; h: number }) => void;
  isFilmstripVisible?: boolean;
  onToggleFilmstrip?: () => void;
}

export const Viewport: React.FC<ViewportProps> = ({
  imageUrl,
  beforeImageUrl,
  activeAssetId: _activeAssetId,
  dimensions,
  isCropActive = false,
  cropRect: _cropRect = { x: 0, y: 0, w: 1, h: 1 },
  aspectRatio = 'Original',
  onCropChange: _onCropChange,
  onApplyCrop,
  onCancelCrop,
  onResetCrop,
  onToggleCrop,
  onSelectAspectRatio,
  isFilmstripVisible = true,
  onToggleFilmstrip,
}) => {
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);

  // Read editState in real-time from Zustand
  const editState = useEditStore((state) => state.editState);

  // Image Dimensions
  const [imgDims, setImgDims] = useState<{ width: number; height: number } | undefined>(dimensions);

  // Before / After Comparison
  const [isSplitView, setIsSplitView] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // Scale state for ZoomHUD
  const [scale, setScale] = useState(1.0);

  // Composition Guides
  const [guideType, setGuideType] = useState<GuideLineType>('none');
  const [guideOrientation, setGuideOrientation] = useState<number>(0);

  // Initialize and run high-performance WebGL Live Filter Pipeline
  useLiveFilterCanvas({
    imageSrc: imageUrl,
    editState,
    canvasRef: liveCanvasRef,
    onDimensionsLoaded: setImgDims,
  });

  // Fit to screen helper
  const handleFitToScreen = useCallback(() => {
    transformRef.current?.resetTransform(200);
  }, []);

  // 100% Zoom helper (1:1 actual pixels)
  const handleZoom100 = useCallback(() => {
    transformRef.current?.zoomToElement(liveCanvasRef.current as HTMLElement, 1.0, 200);
  }, []);

  // Keyboard shortcut listeners (Space for original, \ for split)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === '\\') {
        e.preventDefault();
        setIsSplitView((prev) => !prev);
      } else if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        setShowOriginal(true);
      } else if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (e.shiftKey) {
          setGuideOrientation((prev) => getNextOrientation(prev));
        } else {
          setGuideType((prev) => getNextGuideType(prev));
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setShowOriginal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return (
    <div className="relative flex flex-1 w-full h-full bg-obsidian-deep overflow-hidden select-none">
      {/* ── Top Floating Toolbar ── */}
      <ViewportControls
        isFilmstripVisible={isFilmstripVisible}
        onToggleFilmstrip={onToggleFilmstrip}
        isSplitView={isSplitView}
        onToggleSplitView={() => setIsSplitView((prev) => !prev)}
        showOriginal={showOriginal}
        onShowOriginalMouseDown={() => setShowOriginal(true)}
        onShowOriginalMouseUp={() => setShowOriginal(false)}
        isCropActive={isCropActive}
        onToggleCrop={onToggleCrop}
        guideType={guideType}
        onSelectGuideType={setGuideType}
        guideOrientation={guideOrientation}
        onCycleGuideOrientation={() => setGuideOrientation((prev) => getNextOrientation(prev))}
        onFitToScreen={handleFitToScreen}
        onZoom100={handleZoom100}
      />

      {/* ── Center Stage: Image Canvas with Zoom/Pan & Compare ── */}
      <div className="relative w-full h-full flex items-center justify-center">
        {!imageUrl ? (
          <div className="flex flex-col items-center justify-center text-obsidian-textMut gap-2">
            <span className="text-xs font-medium">No photo selected</span>
          </div>
        ) : isSplitView ? (
          /* Split-screen Before/After Slider using react-compare-slider */
          <div className="w-full h-full flex items-center justify-center p-4">
            <ReactCompareSlider
              itemOne={
                <ReactCompareSliderImage
                  src={beforeImageUrl || imageUrl}
                  alt="Original RAW"
                  className="w-full h-full object-contain"
                />
              }
              itemTwo={
                <div className="w-full h-full flex items-center justify-center">
                  <canvas
                    ref={liveCanvasRef}
                    className="max-w-full max-h-full object-contain shadow-2xl"
                  />
                </div>
              }
              className="w-full h-full rounded-lg overflow-hidden border border-obsidian-border"
            />
          </div>
        ) : (
          /* High-performance Pan & Zoom engine using react-zoom-pan-pinch */
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={0.05}
            maxScale={10}
            centerOnInit
            limitToBounds={false}
            wheel={{ step: 0.1 }}
            doubleClick={{ mode: 'toggle', step: 1.0 }}
            onTransform={(_ref, state) => setScale(state.scale)}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                <TransformComponent
                  wrapperClass="!w-full !h-full flex items-center justify-center"
                  contentClass="flex items-center justify-center"
                >
                  {showOriginal ? (
                    <img
                      src={beforeImageUrl || imageUrl}
                      alt="Original RAW"
                      className="max-w-full max-h-full object-contain select-none pointer-events-none"
                    />
                  ) : (
                    <canvas
                      ref={liveCanvasRef}
                      className="max-w-full max-h-full object-contain select-none shadow-2xl"
                    />
                  )}
                </TransformComponent>

                {/* Bottom Zoom HUD */}
                {!isCropActive && (
                  <ZoomHUD
                    scale={scale}
                    onZoomIn={() => zoomIn(0.25)}
                    onZoomOut={() => zoomOut(0.25)}
                    onResetFit={() => resetTransform(200)}
                    dimensions={imgDims}
                  />
                )}
              </div>
            )}
          </TransformWrapper>
        )}
      </div>

      {/* ── Bottom Crop HUD (Shown when Crop Tool is active) ── */}
      {isCropActive && (
        <CropHUD
          aspectRatio={aspectRatio}
          onSelectAspectRatio={onSelectAspectRatio}
          guideType={guideType}
          onSelectGuideType={setGuideType}
          guideOrientation={guideOrientation}
          onCycleGuideOrientation={() => setGuideOrientation((prev) => getNextOrientation(prev))}
          onResetCrop={() => onResetCrop?.()}
          onCancelCrop={() => onCancelCrop?.()}
          onApplyCrop={() => onApplyCrop?.({ x: 0, y: 0, w: 1, h: 1 })}
        />
      )}
    </div>
  );
};
