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
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import { useEditStore } from '@/stores/useAppStore';
import { bridge } from '@/bridge';
import { ViewportControls } from './viewport/ViewportControls';
import { CropHUD } from './viewport/CropHUD';
import { ZoomHUD } from './viewport/ZoomHUD';
import { CropOverlay, MaskRetouchOverlay, type CropRect } from './viewport/ImageEditOverlay';
import { useLiveFilterCanvas } from './viewport/useLiveFilterCanvas';
import { useZoomPan } from './viewport/useZoomPan';
import { getRotatedImageDimensions } from '@/utils/imageGeometry';
import { calculateRenderedScopes } from '@/utils/renderedScopes';
import {
  type GuideLineType,
  drawCompositionGuide,
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
  thumbnailPreviewUrl?: string;
  restorationPreviewUrl?: string;
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
//
// Key design: we use native addEventListener (not React synthetic events)
// because useZoomPan also uses native addEventListener on the stage.
// Native events fire in DOM order: child first → parent.
// stopPropagation() on a native child event DOES prevent the parent's
// native listener from firing — which is what we want.
//
// React synthetic events fire AFTER all native listeners (React 18 attaches
// to the root), so React's stopPropagation() cannot stop native listeners.
// ─────────────────────────────────────────────
interface SplitHandleProps {
  splitRatio: number;   // 0 … 1
  photoWidth: number;   // natural photo width in px
  currentScale: number; // current viewport zoom scale (to convert screen→photo px)
  onDrag: (r: number) => void;
}

const SplitHandle: React.FC<SplitHandleProps> = ({
  splitRatio,
  photoWidth,
  currentScale,
  onDrag,
}) => {
  const divRef       = useRef<HTMLDivElement>(null);
  const dragging     = useRef(false);
  const lastClientX  = useRef(0);
  const ratioRef     = useRef(splitRatio);

  // Keep ratioRef in sync so the native handler always has the latest value
  useEffect(() => { ratioRef.current = splitRatio; }, [splitRatio]);
  const scaleRef = useRef(currentScale);
  useEffect(() => { scaleRef.current = currentScale; }, [currentScale]);
  const widthRef = useRef(photoWidth);
  useEffect(() => { widthRef.current = photoWidth; }, [photoWidth]);
  const onDragRef = useRef(onDrag);
  useEffect(() => { onDragRef.current = onDrag; }, [onDrag]);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      // Block the event from reaching the stage's pan listener
      e.stopPropagation();
      e.preventDefault();
      dragging.current  = true;
      lastClientX.current = e.clientX;
      el.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.stopPropagation();

      // delta in screen pixels → convert to photo pixels by dividing by zoom scale
      const screenDx = e.clientX - lastClientX.current;
      lastClientX.current = e.clientX;

      const photoDx   = screenDx / scaleRef.current;
      const newRatio  = Math.max(0.02, Math.min(0.98,
        ratioRef.current + photoDx / widthRef.current,
      ));
      onDragRef.current(newRatio);
    };

    const onUp = (e: PointerEvent) => {
      e.stopPropagation();
      dragging.current = false;
    };

    el.addEventListener('pointerdown',   onDown);
    el.addEventListener('pointermove',   onMove);
    el.addEventListener('pointerup',     onUp);
    el.addEventListener('pointercancel', onUp);

    return () => {
      el.removeEventListener('pointerdown',   onDown);
      el.removeEventListener('pointermove',   onMove);
      el.removeEventListener('pointerup',     onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, []); // runs once — all values accessed via refs

  const xPx = splitRatio * photoWidth;

  return (
    <div
      ref={divRef}
      data-split-handle="1"
      style={{
        position: 'absolute',
        top: 0,
        left: `${xPx}px`,
        // Expand hit area well beyond the 2px line so it's easy to grab
        width: '44px',
        height: '100%',
        cursor: 'ew-resize',
        zIndex: 20,
        touchAction: 'none',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
      }}
    >
      {/* The visible 2 px line */}
      <div
        style={{
          width: '2px',
          height: '100%',
          background: 'rgba(255,255,255,0.92)',
          boxShadow: '0 0 10px rgba(0,0,0,0.7)',
          position: 'relative',
          pointerEvents: 'none',
        }}
      >
        {/* Circular drag knob — centred on the line */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 2px 12px rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
        >
          {/* ◄│► icon */}
          <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
            <path
              d="M7 6H13M7 6L4 3M7 6L4 9M13 6L16 3M13 6L16 9"
              stroke="#444"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1="10" y1="1" x2="10" y2="11" stroke="#444" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>
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
  thumbnailPreviewUrl,
  restorationPreviewUrl,
  activeAssetId,
  dimensions,
  masks = [],
  selectedMaskId = null,
  geometry,
  onMaskSelect,
  onMaskGeometryChange,
  retouchSpots = [],
  selectedRetouchSpotId = null,
  onRetouchSpotSelect,
  onRetouchSpotChange,
  isCropActive = false,
  cropRect,
  aspectRatio = 'Original',
  onCropChange,
  onApplyCrop,
  onCancelCrop,
  onResetCrop,
  onToggleCrop,
  onSelectAspectRatio,
  isFilmstripVisible = true,
  onToggleFilmstrip,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const guideCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const colorSampleCallbackRef = useRef<((color: string) => void) | null>(null);
  const [isSamplingColor, setIsSamplingColor] = useState(false);
  const scopesUpdateTimerRef = useRef<number | null>(null);
  const latestRenderedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScopesUpdateRef = useRef(0);
  const [loadedImageDims, setLoadedImageDims] = useState<
    { assetId: string | undefined; width: number; height: number } | null
  >(null);
  const [thumbnail, setThumbnail] = useState<{ assetId: string; url: string } | null>(null);
  const [guideType, setGuideType] = useState<GuideLineType>('none');
  const [guideOrientation, setGuideOrientation] = useState<number>(0);
  const imgDims =
    loadedImageDims !== null && loadedImageDims.assetId === activeAssetId
      ? { width: loadedImageDims.width, height: loadedImageDims.height }
      : dimensions;
  const rotation = (geometry?.rotation ?? 0) + (geometry?.straighten ?? 0);
  const rotatedDims = imgDims
    ? getRotatedImageDimensions(imgDims.width, imgDims.height, rotation)
    : undefined;
  const appliedCropRect: CropRect = useMemo(() => ({
    x: clampCrop(geometry?.crop_x ?? 0),
    y: clampCrop(geometry?.crop_y ?? 0),
    w: clampCropSize(geometry?.crop_width ?? 1, geometry?.crop_x ?? 0),
    h: clampCropSize(geometry?.crop_height ?? 1, geometry?.crop_y ?? 0),
  }), [
    geometry?.crop_x,
    geometry?.crop_y,
    geometry?.crop_width,
    geometry?.crop_height,
  ]);
  const activeCropRect = cropRect ?? appliedCropRect;

  useEffect(() => {
    const canvas = guideCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const draw = () => {
      const bounds = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(bounds.width * pixelRatio));
      const height = Math.max(1, Math.round(bounds.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);
      const guideRect = isCropActive ? activeCropRect : { x: 0, y: 0, w: 1, h: 1 };
      drawCompositionGuide(
        context,
        {
          x: guideRect.x * bounds.width,
          y: guideRect.y * bounds.height,
          w: guideRect.w * bounds.width,
          h: guideRect.h * bounds.height,
        },
        guideType,
        guideOrientation,
        { lineWidth: 1 }
      );
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [activeCropRect, guideOrientation, guideType, isCropActive]);

  useEffect(() => {
    if (!activeAssetId || thumbnailPreviewUrl) return;

    let cancelled = false;
    void bridge
      .getThumbnail(activeAssetId)
      .then((url) => {
        if (!cancelled) setThumbnail({ assetId: activeAssetId, url });
      })
      .catch((error: unknown) => {
        console.error(`[KuroLight] Failed to load preview thumbnail for ${activeAssetId}:`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [activeAssetId, thumbnailPreviewUrl]);

  const cachedThumbnailUrl =
    thumbnail !== null && thumbnail.assetId === activeAssetId ? thumbnail.url : '';
  const thumbnailUrl = thumbnailPreviewUrl || cachedThumbnailUrl;

  const handleDimensionsLoaded = useCallback(
    (loaded: { width: number; height: number }) =>
      setLoadedImageDims({ assetId: activeAssetId, ...loaded }),
    [activeAssetId]
  );

  // Live edit state from Zustand
  const editState = useEditStore((state) => state.editState);
  const setHistogram = useEditStore((state) => state.setHistogram);
  const setColorScopes = useEditStore((state) => state.setColorScopes);

  // Before/After compare
  const [isSplitView,  setIsSplitView]  = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [splitRatio,   setSplitRatio]   = useState(0.5);

  // ── WebGL live filter ──────────────────────────────────────────────────
  const previewSource = beforeImageUrl || thumbnailUrl || imageUrl;
  const handleRendered = useCallback((canvas: HTMLCanvasElement) => {
    latestRenderedCanvasRef.current = canvas;
    if (scopesUpdateTimerRef.current !== null) return;

    const delay = Math.max(0, 180 - (performance.now() - lastScopesUpdateRef.current));
    scopesUpdateTimerRef.current = window.setTimeout(() => {
      scopesUpdateTimerRef.current = null;
      const renderedCanvas = latestRenderedCanvasRef.current;
      if (!renderedCanvas) return;
      try {
        const scopes = calculateRenderedScopes(renderedCanvas);
        setHistogram(scopes.histogram);
        setColorScopes(scopes.colorScopes);
        lastScopesUpdateRef.current = performance.now();
      } catch (error) {
        console.error('[KuroLight] Failed to analyze the rendered preview:', error);
      }
    }, delay);
  }, [setColorScopes, setHistogram]);

  useEffect(() => {
    if (scopesUpdateTimerRef.current !== null) {
      window.clearTimeout(scopesUpdateTimerRef.current);
      scopesUpdateTimerRef.current = null;
    }
    latestRenderedCanvasRef.current = null;
    lastScopesUpdateRef.current = 0;
    setHistogram({ r: [], g: [], b: [], lum: [], sample_count: 0 });
    setColorScopes(null);
  }, [activeAssetId, previewSource, setColorScopes, setHistogram]);

  useEffect(() => () => {
    if (scopesUpdateTimerRef.current !== null) {
      window.clearTimeout(scopesUpdateTimerRef.current);
    }
  }, []);

  const isWebGLReady = useLiveFilterCanvas({
    imageSrc: previewSource,
    editState: isCropActive && editState
      ? {
          ...editState,
          geometry: { ...editState.geometry, crop_x: 0, crop_y: 0, crop_width: 1, crop_height: 1 },
        }
      : showOriginal ? null : editState,
    canvasRef,
    onDimensionsLoaded: handleDimensionsLoaded,
    onRendered: handleRendered,
  });

  const photoW = (rotatedDims?.width ?? 1200) * (isCropActive ? 1 : appliedCropRect.w);
  const photoH = (rotatedDims?.height ?? 800) * (isCropActive ? 1 : appliedCropRect.h);

  const cropSession = useRef({ active: false, assetId: activeAssetId });
  useEffect(() => {
    const newSession = isCropActive && (
      !cropSession.current.active || cropSession.current.assetId !== activeAssetId
    );
    if (newSession) onCropChange?.(appliedCropRect);
    cropSession.current = { active: isCropActive, assetId: activeAssetId };
  }, [activeAssetId, appliedCropRect, isCropActive, onCropChange]);

  // ── Custom Zoom + Pan ─────────────────────────────────────────────────
  const { stageRef, contentRef, state: zpState, fitToScreen, zoomTo100, zoomIn, zoomOut } =
    useZoomPan({ photoDims: { width: photoW, height: photoH } });

  useEffect(() => {
    const cancelSampling = () => {
      if (!colorSampleCallbackRef.current) return;
      colorSampleCallbackRef.current = null;
      setIsSamplingColor(false);
      window.dispatchEvent(new Event('kurolight:color-sample-cancelled'));
    };
    const requestSampling = (event: Event) => {
      const request = event as CustomEvent<{ onSample?: (color: string) => void }>;
      if (typeof request.detail?.onSample !== 'function') {
        console.error('[KuroLight] Image color-sample request did not provide a callback.');
        return;
      }
      if (colorSampleCallbackRef.current) cancelSampling();
      colorSampleCallbackRef.current = request.detail.onSample;
      setIsSamplingColor(true);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelSampling();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const onSample = colorSampleCallbackRef.current;
      if (!onSample || event.button !== 0) return;

      const target = event.target;
      if (target instanceof Element && target.closest('button, input, textarea, [role="button"]')) {
        return;
      }
      const canvas = canvasRef.current;
      const bounds = canvas?.getBoundingClientRect();
      if (!canvas || !bounds || bounds.width <= 0 || bounds.height <= 0 || canvas.width <= 0 || canvas.height <= 0) {
        console.error('[KuroLight] Cannot sample image color: the rendered image canvas is unavailable.');
        cancelSampling();
        return;
      }
      if (
        event.clientX < bounds.left ||
        event.clientX >= bounds.right ||
        event.clientY < bounds.top ||
        event.clientY >= bounds.bottom
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const gl = canvas.getContext('webgl');
      if (!gl || gl.isContextLost()) {
        console.error('[KuroLight] Cannot sample image color: the WebGL context is unavailable.');
        cancelSampling();
        return;
      }

      const x = Math.min(
        canvas.width - 1,
        Math.floor(((event.clientX - bounds.left) / bounds.width) * canvas.width),
      );
      const y = Math.max(
        0,
        canvas.height - 1 - Math.floor(((event.clientY - bounds.top) / bounds.height) * canvas.height),
      );
      const pixel = new Uint8Array(4);
      try {
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      } catch (error) {
        console.error('[KuroLight] Failed to read a pixel from the image canvas:', error);
        cancelSampling();
        return;
      }
      const readError = gl.getError();
      if (readError !== gl.NO_ERROR) {
        console.error(`[KuroLight] Failed to sample image color (WebGL error ${readError}).`);
        cancelSampling();
        return;
      }

      colorSampleCallbackRef.current = null;
      setIsSamplingColor(false);
      const hex = `#${Array.from(pixel.slice(0, 3), (channel) =>
        channel.toString(16).padStart(2, '0')
      ).join('')}`;
      onSample(hex);
    };

    const stage = stageRef.current;
    stage?.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('kurolight:request-color-sample', requestSampling);
    window.addEventListener('kurolight:cancel-color-sample', cancelSampling);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      stage?.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('kurolight:request-color-sample', requestSampling);
      window.removeEventListener('kurolight:cancel-color-sample', cancelSampling);
      window.removeEventListener('keydown', handleKeyDown);
      colorSampleCallbackRef.current = null;
    };
  }, [stageRef]);

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
        style={{ cursor: isSamplingColor ? 'crosshair' : 'grab' }}
      >
        {!previewSource ? null : (
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
                  backgroundColor: '#292929',
                  backgroundImage:
                    'repeating-conic-gradient(#404040 0% 25%, #292929 0% 50%)',
                  backgroundSize: '20px 20px',
                }}
              >
                <img
                  src={imageUrl || thumbnailUrl}
                  alt=""
                  draggable={false}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: isCropActive ? 0 : `${-appliedCropRect.x / appliedCropRect.w * 100}%`,
                    top: isCropActive ? 0 : `${-appliedCropRect.y / appliedCropRect.h * 100}%`,
                    width: isCropActive ? '100%' : `${100 / appliedCropRect.w}%`,
                    height: isCropActive ? '100%' : `${100 / appliedCropRect.h}%`,
                    objectFit: 'fill',
                    display:
                      restorationPreviewUrl ||
                      (isWebGLReady && loadedImageDims?.assetId === activeAssetId)
                        ? 'none'
                        : 'block',
                    pointerEvents: 'none',
                  }}
                />

                {/* ── WebGL canvas: edited "After" ── */}
                <canvas
                  ref={canvasRef}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    display: isWebGLReady && !restorationPreviewUrl ? 'block' : 'none',
                    imageRendering: 'auto',
                    pointerEvents: 'none',
                  }}
                />
                {restorationPreviewUrl && (
                  <img
                    src={restorationPreviewUrl}
                    alt="AI restoration preview"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      pointerEvents: 'none',
                    }}
                  />
                )}

                <canvas
                  ref={guideCanvasRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{ zIndex: 25 }}
                />

                {isCropActive && (
                  <CropOverlay
                    rect={activeCropRect}
                    aspectRatio={aspectRatio}
                    imageWidth={rotatedDims?.width ?? photoW}
                    imageHeight={rotatedDims?.height ?? photoH}
                    onChange={(rect) => onCropChange?.(rect)}
                  />
                )}

                {!isCropActive && (
                  <MaskRetouchOverlay
                    masks={masks}
                    selectedMaskId={selectedMaskId}
                    onMaskSelect={onMaskSelect}
                    onMaskGeometryChange={onMaskGeometryChange}
                    retouchSpots={retouchSpots}
                    selectedRetouchSpotId={selectedRetouchSpotId}
                    onRetouchSpotSelect={onRetouchSpotSelect}
                    onRetouchSpotChange={onRetouchSpotChange}
                    cropRect={appliedCropRect}
                    imageWidth={imgDims?.width ?? photoW}
                    imageHeight={imgDims?.height ?? photoH}
                    geometry={geometry}
                  />
                )}

                {/* ── "Before" image ──
                  * Shown when:
                  *   • showOriginal (Space held)   → full cover
                  *   • isSplitView                 → left half via clipPath
                  */}
                {(showOriginal || isSplitView) && (
                  <img
                    src={previewSource}
                    alt="Before"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: isCropActive ? 0 : `${-appliedCropRect.x / appliedCropRect.w * 100}%`,
                      top: isCropActive ? 0 : `${-appliedCropRect.y / appliedCropRect.h * 100}%`,
                      width: isCropActive ? '100%' : `${100 / appliedCropRect.w}%`,
                      height: isCropActive ? '100%' : `${100 / appliedCropRect.h}%`,
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
                    currentScale={zpState.scale}
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
          onApplyCrop={() => onApplyCrop?.(activeCropRect)}
        />
      )}
    </div>
  );
};

function clampCrop(value: number): number {
  return Math.max(0, Math.min(0.999, value));
}

function clampCropSize(value: number, origin: number): number {
  return Math.max(0.001, Math.min(1 - clampCrop(origin), value));
}
