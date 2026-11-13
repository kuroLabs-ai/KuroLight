/**
 * Viewport — The main photo canvas.
 *
 * Architecture:
 *  ┌─ TransformWrapper (react-zoom-pan-pinch) ─────────────────────────────┐
 *  │  ┌─ TransformComponent ──────────────────────────────────────────────┐│
 *  │  │  ┌─ Photo container (natural image px) ───────────────────────┐  ││
 *  │  │  │  [WebGL canvas — edited "after"]                           │  ││
 *  │  │  │  [<img>  — original "before"]  clipped by splitRatio       │  ││
 *  │  │  │  [Divider handle — draggable]                              │  ││
 *  │  │  └────────────────────────────────────────────────────────────┘  ││
 *  │  └───────────────────────────────────────────────────────────────────┘│
 *  └───────────────────────────────────────────────────────────────────────┘
 *
 * Key design decisions:
 *  • The Before/After split divider lives INSIDE TransformComponent so the user
 *    can zoom to 100-400% and drag the divider without losing pan/zoom ability.
 *    (Matching behaviour of Lightroom, Capture One, Photoshop Camera Raw.)
 *  • The photo container is sized to the NATURAL image dimensions in CSS pixels.
 *    TransformWrapper uses initialScale to fit it into the viewport on load.
 *  • The WebGL canvas renders all photo adjustments at 60 FPS on the GPU.
 *    CSS filters are NOT used for colour grading (they lack precision).
 *  • Dragging the split handle calls e.stopPropagation() so it never triggers
 *    the TransformWrapper's pan listener.
 */

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import { useEditStore } from '@/stores/useAppStore';
import { ViewportControls } from './viewport/ViewportControls';
import { CropHUD } from './viewport/CropHUD';
import { ZoomHUD } from './viewport/ZoomHUD';
import { useLiveFilterCanvas } from './viewport/useLiveFilterCanvas';
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

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────
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
  isCropActive?: boolean;
  cropRect?: { x: number; y: number; w: number; h: number };
  aspectRatio?: string;
  onCropChange?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onApplyCrop?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onCancelCrop?: () => void;
  onResetCrop?: () => void;
  onToggleCrop?: () => void;
  onSelectAspectRatio?: (ratio: string) => void;
  onViewportRectChange?: (rect: { x: number; y: number; w: number; h: number }) => void;
  isFilmstripVisible?: boolean;
  onToggleFilmstrip?: () => void;
}

// ─────────────────────────────────────────────
// Before/After split handle
// ─────────────────────────────────────────────
interface SplitHandleProps {
  splitRatio: number; // 0.0 … 1.0
  containerWidth: number;
  onDrag: (newRatio: number) => void;
}

const SplitHandle: React.FC<SplitHandleProps> = ({ splitRatio, containerWidth, onDrag }) => {
  const handleRef = useRef<HTMLDivElement>(null);
  const dragging  = useRef(false);
  const startX    = useRef(0);
  const startRatio = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // Stop propagation so TransformWrapper doesn't interpret this as a pan
      e.stopPropagation();
      e.preventDefault();
      dragging.current   = true;
      startX.current     = e.clientX;
      startRatio.current = splitRatio;
      handleRef.current?.setPointerCapture(e.pointerId);
    },
    [splitRatio],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current || containerWidth <= 0) return;
      e.stopPropagation();
      const delta = e.clientX - startX.current;
      const newRatio = Math.max(0.01, Math.min(0.99, startRatio.current + delta / containerWidth));
      onDrag(newRatio);
    },
    [containerWidth, onDrag],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    dragging.current = false;
  }, []);

  const xPx = splitRatio * containerWidth;

  return (
    <div
      ref={handleRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        top: 0,
        left: `${xPx}px`,
        width: '2px',
        height: '100%',
        background: 'rgba(255,255,255,0.9)',
        boxShadow: '0 0 6px rgba(0,0,0,0.6)',
        cursor: 'ew-resize',
        zIndex: 20,
        touchAction: 'none',
        willChange: 'left',
      }}
    >
      {/* Circular drag knob */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {/* Left-right arrows */}
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
          <path d="M4 5H12M12 5L9 2M12 5L9 8M4 5L7 2M4 5L7 8" stroke="#444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main Viewport component
// ─────────────────────────────────────────────
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
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const stageRef     = useRef<HTMLDivElement | null>(null);

  // Live edit state from Zustand (60 FPS reactive)
  const editState = useEditStore((state) => state.editState);

  // Natural image dimensions (read from canvas after WebGL upload)
  const [imgDims, setImgDims] = useState<{ width: number; height: number } | undefined>(dimensions);

  // Zoom scale for HUD readout
  const [scale, setScale] = useState(1.0);

  // Before/After compare mode
  const [isSplitView,  setIsSplitView]  = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [splitRatio,   setSplitRatio]   = useState(0.5);

  // Composition guides
  const [guideType,        setGuideType]        = useState<GuideLineType>('none');
  const [guideOrientation, setGuideOrientation] = useState<number>(0);

  // ── WebGL live filter ──────────────────────────────────────────────────
  useLiveFilterCanvas({
    imageSrc: imageUrl,
    editState: showOriginal ? null : editState,   // null = neutral (all sliders 0)
    canvasRef,
    onDimensionsLoaded: setImgDims,
  });

  // ── Compute initial scale to fit image into the stage ─────────────────
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setStageSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const fitScale = useMemo(() => {
    if (!imgDims) return 1;
    const padding = 48; // px breathing room on each side
    const scaleW = (stageSize.w - padding * 2) / imgDims.width;
    const scaleH = (stageSize.h - padding * 2) / imgDims.height;
    return Math.min(scaleW, scaleH, 1); // never upscale beyond 1× on first load
  }, [imgDims, stageSize]);

  // Reset zoom whenever the image changes (new asset selected)
  useEffect(() => {
    if (imageUrl) {
      // Brief delay so dimensions are loaded first
      const id = setTimeout(() => transformRef.current?.resetTransform(0), 50);
      return () => clearTimeout(id);
    }
  }, [imageUrl]);

  // ── Fit / 1:1 helpers ─────────────────────────────────────────────────
  const handleFitToScreen = useCallback(() => {
    transformRef.current?.resetTransform(220);
  }, []);

  const handleZoom100 = useCallback(() => {
    if (!imgDims) return;
    const targetScale = 1 / fitScale; // 1× natural pixel
    transformRef.current?.setTransform(0, 0, targetScale, 220);
  }, [imgDims, fitScale]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;

      if (e.key === '\\') {
        e.preventDefault();
        setIsSplitView((p) => !p);
      } else if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        setShowOriginal(true);
      } else if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (e.shiftKey) setGuideOrientation((p) => getNextOrientation(p));
        else            setGuideType((p) => getNextGuideType(p));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setShowOriginal(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ── Photo container size ───────────────────────────────────────────────
  const photoW = imgDims?.width  ?? 1200;
  const photoH = imgDims?.height ?? 800;

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="relative flex flex-1 w-full h-full bg-obsidian-deep overflow-hidden select-none">
      {/* ── Top Floating Toolbar ── */}
      <ViewportControls
        isFilmstripVisible={isFilmstripVisible}
        onToggleFilmstrip={onToggleFilmstrip}
        isSplitView={isSplitView}
        onToggleSplitView={() => setIsSplitView((p) => !p)}
        showOriginal={showOriginal}
        onShowOriginalMouseDown={() => setShowOriginal(true)}
        onShowOriginalMouseUp={() => setShowOriginal(false)}
        isCropActive={isCropActive}
        onToggleCrop={onToggleCrop}
        guideType={guideType}
        onSelectGuideType={setGuideType}
        guideOrientation={guideOrientation}
        onCycleGuideOrientation={() => setGuideOrientation((p) => getNextOrientation(p))}
        onFitToScreen={handleFitToScreen}
        onZoom100={handleZoom100}
      />

      {/* ── Stage: zoom + pan container ── */}
      <div
        ref={stageRef}
        className="relative w-full h-full flex items-center justify-center overflow-hidden"
      >
        {!imageUrl ? (
          /* Loading placeholder */
          <div className="flex flex-col items-center justify-center text-obsidian-textMut gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-obsidian-border border-t-obsidian-accent" />
            <span className="text-xs font-medium text-obsidian-textSec">
              Loading photo preview…
            </span>
          </div>
        ) : (
          /* ── TransformWrapper: single instance for BOTH single & split view ── */
          <TransformWrapper
            ref={transformRef}
            initialScale={fitScale}
            minScale={0.02}
            maxScale={16}
            centerOnInit
            limitToBounds={false}
            wheel={{ step: 0.08 }}
            doubleClick={{ mode: 'toggle', step: 1.0 }}
            panning={{ excluded: ['split-handle'] }}
            onTransform={(_ref, state) => setScale(state.scale)}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <div className="relative w-full h-full overflow-hidden">
                <TransformComponent
                  wrapperStyle={{ width: '100%', height: '100%' }}
                  contentStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {/*
                   * ── Photo container ──
                   * Sized to natural image pixels.
                   * TransformWrapper scales this container as a unit,
                   * so zoom is always proportional to real image pixels.
                   */}
                  <div
                    style={{
                      position: 'relative',
                      width:  `${photoW}px`,
                      height: `${photoH}px`,
                      flexShrink: 0,
                      overflow: 'hidden',
                      boxShadow: '0 8px 48px rgba(0,0,0,0.6)',
                      borderRadius: '2px',
                    }}
                  >
                    {/*
                     * ── WebGL canvas: "After" (edited) ──
                     * Always covers the full photo container.
                     * useLiveFilterCanvas drives renders via requestAnimationFrame.
                     */}
                    <canvas
                      ref={canvasRef}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        imageRendering: 'auto',
                      }}
                    />

                    {/*
                     * ── "Before" image: shown full when showOriginal, or
                     *    left-half when isSplitView ──
                     */}
                    {(showOriginal || isSplitView) && (
                      <img
                        src={beforeImageUrl || imageUrl}
                        alt="Before"
                        draggable={false}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'fill',
                          display: 'block',
                          userSelect: 'none',
                          pointerEvents: 'none',
                          // In split view: clip to left of the divider
                          clipPath: isSplitView
                            ? `inset(0 ${((1 - splitRatio) * 100).toFixed(2)}% 0 0)`
                            : undefined,
                          zIndex: 10,
                        }}
                      />
                    )}

                    {/*
                     * ── Before/After label badges ──
                     */}
                    {isSplitView && (
                      <>
                        <span
                          style={{
                            position: 'absolute',
                            top: 8,
                            left: 8,
                            zIndex: 25,
                            background: 'rgba(0,0,0,0.55)',
                            color: 'white',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            pointerEvents: 'none',
                          }}
                        >
                          Before
                        </span>
                        <span
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            zIndex: 25,
                            background: 'rgba(0,0,0,0.55)',
                            color: 'white',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            pointerEvents: 'none',
                          }}
                        >
                          After
                        </span>
                      </>
                    )}

                    {/*
                     * ── Draggable split divider (inside TransformComponent) ──
                     * Lives in photo-pixel space so it zooms and pans
                     * in sync with the image — matching Lightroom's behaviour.
                     */}
                    {isSplitView && (
                      <SplitHandle
                        splitRatio={splitRatio}
                        containerWidth={photoW}
                        onDrag={setSplitRatio}
                      />
                    )}
                  </div>
                </TransformComponent>

                {/* ── Zoom HUD (floats over stage, outside TransformComponent) ── */}
                {!isCropActive && (
                  <ZoomHUD
                    scale={scale}
                    onZoomIn={() => zoomIn(0.25)}
                    onZoomOut={() => zoomOut(0.25)}
                    onResetFit={() => resetTransform(220)}
                    dimensions={imgDims}
                  />
                )}
              </div>
            )}
          </TransformWrapper>
        )}
      </div>

      {/* ── Crop HUD ── */}
      {isCropActive && (
        <CropHUD
          aspectRatio={aspectRatio}
          onSelectAspectRatio={onSelectAspectRatio}
          guideType={guideType}
          onSelectGuideType={setGuideType}
          guideOrientation={guideOrientation}
          onCycleGuideOrientation={() => setGuideOrientation((p) => getNextOrientation(p))}
          onResetCrop={() => onResetCrop?.()}
          onCancelCrop={() => onCancelCrop?.()}
          onApplyCrop={() => onApplyCrop?.({ x: 0, y: 0, w: 1, h: 1 })}
        />
      )}
    </div>
  );
};
