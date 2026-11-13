/**
 * Viewport — The main KuroLight photo canvas.
 *
 * Zero external library dependency for zoom/pan/compare.
 * Everything is built on raw pointer events, wheel events, and CSS transforms.
 *
 * Layout:
 *   stage (overflow:hidden)
 *     └─ content div  ← CSS transform: translate(tx,ty) scale(s)  origin:0 0
 *         └─ photo container (natural image pixels)
 *             ├─ <canvas>  — WebGL "after" (edited)
 *             ├─ <img>     — "before" (original), clipped by splitRatio
 *             └─ split handle (draggable, stops propagation to stage)
 *
 * Zoom math:
 *   Zoom centred on cursor: newTx = mx - (mx - tx) * (newScale / scale)
 *   This keeps the pixel under the cursor fixed while everything else moves.
 *
 * Split compare:
 *   The handle is in photo-pixel space. clipPath on the "before" img handles reveal.
 *   Dragging the handle → stopPropagation → stage never sees the event → pan still works.
 */

import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { useEditStore } from '@/stores/useAppStore';
import { ViewportControls } from './viewport/ViewportControls';
import { CropHUD } from './viewport/CropHUD';
import { ZoomHUD } from './viewport/ZoomHUD';
import { useLiveFilterCanvas } from './viewport/useLiveFilterCanvas';
import { useZoomPan } from './viewport/useZoomPan';
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
// Lives in photo-pixel space (inside the photo container).
// Dragging it adjusts splitRatio WITHOUT triggering stage pan.
// ─────────────────────────────────────────────
interface SplitHandleProps {
  splitRatio: number;      // 0 … 1
  photoWidth: number;      // natural photo width in px
  onDrag: (r: number) => void;
}

const SplitHandle: React.FC<SplitHandleProps> = ({ splitRatio, photoWidth, onDrag }) => {
  const handleRef  = useRef<HTMLDivElement>(null);
  const dragging   = useRef(false);
  const startX     = useRef(0);
  const startRatio = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation(); // stop stage from starting a pan
      e.preventDefault();
      dragging.current   = true;
      startX.current     = e.clientX;
      startRatio.current = splitRatio;
      handleRef.current?.setPointerCapture(e.pointerId);
    },
    [splitRatio],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || photoWidth <= 0) return;
      e.stopPropagation();
      // e.movementX doesn't work reliably on all browsers when captured,
      // so we compute delta from the original down position.
      const dx = e.clientX - startX.current;
      // Convert screen-space dx → photo-space dx by dividing by current CSS scale.
      // The handle is already in photo-pixel space, so delta in photo pixels =
      // screen delta / scale.  We read scale from the content el's transform.
      const content = handleRef.current?.closest<HTMLElement>('.kl-content');
      let screenScale = 1;
      if (content) {
        const m = new DOMMatrixReadOnly(getComputedStyle(content).transform);
        screenScale = m.a; // scaleX
      }
      const photoDelta = dx / screenScale;
      const newRatio = Math.max(0.02, Math.min(0.98, startRatio.current + photoDelta / photoWidth));
      onDrag(newRatio);
    },
    [photoWidth, onDrag],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    dragging.current = false;
  }, []);

  const xPx = splitRatio * photoWidth;

  return (
    <div
      ref={handleRef}
      data-split-handle="1"
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
        background: 'rgba(255,255,255,0.90)',
        boxShadow: '0 0 8px rgba(0,0,0,0.65)',
        cursor: 'ew-resize',
        zIndex: 20,
        touchAction: 'none',
        willChange: 'left',
        transform: 'translateX(-50%)',
      }}
    >
      {/* Circular knob */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {/* ◄ ► arrows */}
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
          <path d="M5 6H13M13 6L10 3M13 6L10 9M5 6L8 3M5 6L8 9"
            stroke="#555" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Main Viewport
// ─────────────────────────────────────────────
export const Viewport: React.FC<ViewportProps> = ({
  imageUrl,
  beforeImageUrl,
  activeAssetId: _activeAssetId,
  dimensions,
  isCropActive = false,
  aspectRatio = 'Original',
  onApplyCrop,
  onCancelCrop,
  onResetCrop,
  onToggleCrop,
  onSelectAspectRatio,
  isFilmstripVisible = true,
  onToggleFilmstrip,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live edit state from Zustand
  const editState = useEditStore((state) => state.editState);

  // Natural image dimensions (resolved by WebGL after image loads)
  const [imgDims, setImgDims] = useState<{ width: number; height: number } | undefined>(dimensions);

  // Before/After compare
  const [isSplitView,  setIsSplitView]  = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [splitRatio,   setSplitRatio]   = useState(0.5);

  // Composition guides
  const [guideType,        setGuideType]        = useState<GuideLineType>('none');
  const [guideOrientation, setGuideOrientation] = useState<number>(0);

  // ── WebGL live filter ──────────────────────────────────────────────────
  useLiveFilterCanvas({
    imageSrc:  imageUrl,
    editState: showOriginal ? null : editState,
    canvasRef,
    onDimensionsLoaded: setImgDims,
  });

  // ── Custom Zoom + Pan ─────────────────────────────────────────────────
  const { stageRef, contentRef, state: zpState, fitToScreen, zoomTo100, zoomIn, zoomOut } =
    useZoomPan({ photoDims: imgDims ?? null });

  // ── Reset zoom whenever a new image is loaded ─────────────────────────
  const prevImageUrl = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (imageUrl && imageUrl !== prevImageUrl.current) {
      prevImageUrl.current = imageUrl;
      // fitToScreen will be triggered automatically by useZoomPan when imgDims change
    }
  }, [imageUrl]);

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
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        fitToScreen();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setShowOriginal(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup',   up);
    };
  }, [zoomIn, zoomOut, fitToScreen]);

  // ── Photo container size ───────────────────────────────────────────────
  const photoW = imgDims?.width  ?? 1200;
  const photoH = imgDims?.height ?? 800;

  // Label position for Before/After badges
  const beforeBadgeRight = useMemo(
    () => `${((1 - splitRatio) * 100).toFixed(1)}%`,
    [splitRatio],
  );
  const afterBadgeLeft = useMemo(
    () => `${(splitRatio * 100).toFixed(1)}%`,
    [splitRatio],
  );

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="relative flex flex-1 w-full h-full bg-obsidian-deep overflow-hidden select-none">

      {/* ── Top Controls ── */}
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
        onFitToScreen={() => fitToScreen()}
        onZoom100={() => zoomTo100()}
      />

      {/* ── Stage: the visible clip area ── */}
      <div
        ref={stageRef}
        className="relative w-full h-full overflow-hidden"
        style={{ cursor: 'grab' }}
      >
        {!imageUrl ? (
          /* Loading state */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-obsidian-border border-t-obsidian-accent" />
            <span className="text-xs font-medium text-obsidian-textSec">
              Loading photo preview…
            </span>
          </div>
        ) : (
          <>
            {/*
             * ── Content: transformed div ──
             * transform-origin: 0 0  → all zoom math uses top-left anchor.
             * kl-content class is read by SplitHandle to extract current scale.
             */}
            <div
              ref={contentRef}
              className="kl-content"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transformOrigin: '0 0',
                willChange: 'transform',
                width: `${photoW}px`,
                height: `${photoH}px`,
              }}
            >
              {/*
               * ── Photo container ──
               * Natural image dimensions in CSS pixels.
               * Shadow and slight border to visually separate from bg.
               */}
              <div
                style={{
                  position: 'relative',
                  width: `${photoW}px`,
                  height: `${photoH}px`,
                  boxShadow: '0 8px 48px rgba(0,0,0,0.65)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {/* ── WebGL canvas: edited "After" ── */}
                <canvas
                  ref={canvasRef}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    imageRendering: 'auto',
                    pointerEvents: 'none',
                  }}
                />

                {/* ── "Before" image ──
                  * Shown when:
                  *   • showOriginal (Space held)   → full cover
                  *   • isSplitView                 → left half via clipPath
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
                      clipPath: isSplitView
                        ? `inset(0 ${((1 - splitRatio) * 100).toFixed(3)}% 0 0)`
                        : 'none',
                      zIndex: 10,
                    }}
                  />
                )}

                {/* ── Before / After labels ── */}
                {isSplitView && (
                  <>
                    <span
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        maxWidth: `calc(${(splitRatio * 100).toFixed(0)}% - 20px)`,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        zIndex: 25,
                        background: 'rgba(0,0,0,0.55)',
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                        pointerEvents: 'none',
                        backdropFilter: 'blur(4px)',
                        right: beforeBadgeRight,
                      }}
                    >
                      Before
                    </span>
                    <span
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        left: afterBadgeLeft,
                        maxWidth: `calc(${((1 - splitRatio) * 100).toFixed(0)}% - 20px)`,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        textAlign: 'right',
                        zIndex: 25,
                        background: 'rgba(0,0,0,0.55)',
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                        pointerEvents: 'none',
                        backdropFilter: 'blur(4px)',
                      }}
                    >
                      After
                    </span>
                  </>
                )}

                {/* ── Draggable split handle ──
                  * Lives in photo-pixel space → zooms and pans with the image.
                  * Uses stopPropagation so stage never sees its pointer events.
                  */}
                {isSplitView && (
                  <SplitHandle
                    splitRatio={splitRatio}
                    photoWidth={photoW}
                    onDrag={setSplitRatio}
                  />
                )}
              </div>
            </div>

            {/* ── Zoom HUD ── */}
            {!isCropActive && (
              <ZoomHUD
                scale={zpState.scale}
                onZoomIn={() => zoomIn()}
                onZoomOut={() => zoomOut()}
                onResetFit={() => fitToScreen()}
                dimensions={imgDims}
              />
            )}
          </>
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
