/**
 * useZoomPan — zero-dependency zoom + pan engine for KuroLight Viewport.
 *
 * Replaces react-zoom-pan-pinch entirely.
 *
 * How it works
 * ─────────────
 * We maintain (scale, tx, ty) and apply them as a CSS transform on a
 * "content" div that is a direct child of the "stage" container:
 *
 *   stage  → position:relative; overflow:hidden; w:100%; h:100%
 *   content → position:absolute; transform-origin:0 0;
 *             transform: translate(tx px, ty px) scale(scale)
 *             width: photoW px; height: photoH px
 *
 * Using transform-origin:0 0 makes all math straightforward:
 *   • A point P in photo-space sits at (tx + P.x*scale, ty + P.y*scale) in stage-space.
 *   • To zoom centred on cursor position (mx, my) in stage-space:
 *       newScale = clamp(scale * factor)
 *       newTx    = mx - (mx - tx) * (newScale / scale)
 *       newTy    = my - (my - ty) * (newScale / scale)
 *   • Pan: newTx = tx + dx, newTy = ty + dy
 *
 * Features
 * ─────────
 * • Mouse wheel zoom centred on cursor (smooth, no library needed)
 * • Trackpad pinch zoom (wheel + ctrlKey)
 * • Drag to pan (pointer events, works with touch too)
 * • Double-click: toggle between fit-to-screen and 1:1 pixel
 * • Programmatic: fitToScreen(), zoomTo100(), zoomIn(), zoomOut(), setZoom()
 * • ResizeObserver: auto-refit when stage resizes
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface ZoomPanState {
  scale: number;
  tx: number;
  ty: number;
}

export interface ZoomPanControls {
  /** Call this ref on the stage container (overflow:hidden wrapper). */
  stageRef: React.RefObject<HTMLDivElement | null>;
  /** Call this ref on the content div (the photo container). */
  contentRef: React.RefObject<HTMLDivElement | null>;
  /** Current transform state — use to show zoom % in HUD. */
  state: ZoomPanState;
  /** Programmatic controls */
  fitToScreen: (animated?: boolean) => void;
  zoomTo100: (animated?: boolean) => void;
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
  /** fitScale — the scale at which image fits the stage exactly. */
  fitScale: number;
}

export interface UseZoomPanOptions {
  /** Natural pixel dimensions of the photo being displayed. */
  photoDims: { width: number; height: number } | null;
  minScale?: number;
  maxScale?: number;
  /** Padding (px) around image when fitting to screen. */
  padding?: number;
  /** Zoom step multiplier for zoomIn / zoomOut buttons. Default 1.25 */
  zoomStep?: number;
  /** Wheel zoom speed (higher = faster). Default 0.001 */
  wheelSpeed?: number;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function applyTransform(
  el: HTMLDivElement | null,
  tx: number,
  ty: number,
  scale: number,
  animated: boolean,
) {
  if (!el) return;
  el.style.transition = animated
    ? 'transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    : 'none';
  el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────
export function useZoomPan({
  photoDims,
  minScale = 0.02,
  maxScale = 16,
  padding = 48,
  zoomStep = 1.25,
  wheelSpeed = 0.001,
}: UseZoomPanOptions): ZoomPanControls {
  const stageRef   = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Live transform — stored in a ref for zero-lag DOM writes
  const xfRef  = useRef<ZoomPanState>({ scale: 1, tx: 0, ty: 0 });
  // React state only for HUD readout (doesn't drive DOM directly)
  const [state, setState] = useState<ZoomPanState>({ scale: 1, tx: 0, ty: 0 });
  const [fitScale, setFitScale] = useState(1);

  // Pointer tracking
  const dragging   = useRef(false);
  const lastPt     = useRef({ x: 0, y: 0 });
  const lastTap    = useRef(0);
  // Touch pinch
  const touches    = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDist0 = useRef(0);
  const pinchScale0 = useRef(1);
  const pinchMid   = useRef({ x: 0, y: 0 });

  // ── Compute fit scale ────────────────────────────────────────────────
  const computeFitScale = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !photoDims) return 1;
    const sw = stage.clientWidth  - padding * 2;
    const sh = stage.clientHeight - padding * 2;
    return Math.min(sw / photoDims.width, sh / photoDims.height, 1);
  }, [photoDims, padding]);

  // ── Write transform to DOM immediately (no React re-render) ──────────
  const writeTransform = useCallback(
    (tx: number, ty: number, scale: number, animated = false) => {
      xfRef.current = { scale, tx, ty };
      applyTransform(contentRef.current, tx, ty, scale, animated);
      // Throttle React state update — only needed for HUD readout
      setState({ scale, tx, ty });
    },
    [],
  );

  // ── Centre content in stage at given scale ───────────────────────────
  const centreAt = useCallback(
    (scale: number, animated = false) => {
      const stage = stageRef.current;
      if (!stage || !photoDims) return;
      const tx = (stage.clientWidth  - photoDims.width  * scale) / 2;
      const ty = (stage.clientHeight - photoDims.height * scale) / 2;
      writeTransform(tx, ty, scale, animated);
    },
    [photoDims, writeTransform],
  );

  // ── Public: fit to screen ────────────────────────────────────────────
  const fitToScreen = useCallback(
    (animated = true) => {
      const fs = computeFitScale();
      setFitScale(fs);
      centreAt(fs, animated);
    },
    [computeFitScale, centreAt],
  );

  // ── Public: zoom to 1:1 natural pixels ──────────────────────────────
  const zoomTo100 = useCallback(
    (animated = true) => {
      const stage = stageRef.current;
      if (!stage || !photoDims) return;
      // Centre the middle of the photo at 1:1
      const tx = (stage.clientWidth  - photoDims.width)  / 2;
      const ty = (stage.clientHeight - photoDims.height) / 2;
      writeTransform(tx, ty, 1, animated);
    },
    [photoDims, writeTransform],
  );

  // ── Public: zoom in / out buttons ───────────────────────────────────
  const zoomIn = useCallback(
    (step = zoomStep) => {
      const stage = stageRef.current;
      if (!stage) return;
      const { scale, tx, ty } = xfRef.current;
      const newScale = clamp(scale * step, minScale, maxScale);
      const mx = stage.clientWidth  / 2;
      const my = stage.clientHeight / 2;
      const newTx = mx - (mx - tx) * (newScale / scale);
      const newTy = my - (my - ty) * (newScale / scale);
      writeTransform(newTx, newTy, newScale, true);
    },
    [zoomStep, minScale, maxScale, writeTransform],
  );

  const zoomOut = useCallback(
    (step = zoomStep) => zoomIn(1 / step),
    [zoomIn, zoomStep],
  );

  // ── Zoom centred on a point in stage-space ───────────────────────────
  const zoomAround = useCallback(
    (mx: number, my: number, factor: number) => {
      const { scale, tx, ty } = xfRef.current;
      const newScale = clamp(scale * factor, minScale, maxScale);
      if (newScale === scale) return;
      const ratio = newScale / scale;
      writeTransform(mx - (mx - tx) * ratio, my - (my - ty) * ratio, newScale);
    },
    [minScale, maxScale, writeTransform],
  );

  // ── Wheel handler ────────────────────────────────────────────────────
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let factor: number;
      if (e.ctrlKey) {
        // Trackpad pinch: ctrlKey + small deltaY
        factor = 1 - e.deltaY * wheelSpeed * 3;
      } else if (e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
        factor = 1 - e.deltaY * wheelSpeed;
      } else {
        // DOM_DELTA_LINE / DOM_DELTA_PAGE
        factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      }
      factor = clamp(factor, 0.85, 1.20); // cap per-event jump
      zoomAround(mx, my, factor);
    };

    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomAround, wheelSpeed]);

  // ── Pointer (mouse + touch) pan ──────────────────────────────────────
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onPointerDown = (e: PointerEvent) => {
      // Ignore right-click and any element inside the split handle
      if (e.button === 2) return;
      if ((e.target as HTMLElement)?.closest('[data-split-handle]')) return;

      dragging.current = true;
      lastPt.current = { x: e.clientX, y: e.clientY };
      stage.setPointerCapture(e.pointerId);

      // Double-click detection (pointer-based, works on touch too)
      const now = Date.now();
      if (now - lastTap.current < 280) {
        // Double tap → toggle fit ↔ 1:1
        const fs = computeFitScale();
        const isNear1to1 = Math.abs(xfRef.current.scale - 1) < 0.05;
        if (isNear1to1) {
          centreAt(fs, true);
        } else {
          zoomTo100(true);
        }
      }
      lastTap.current = now;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastPt.current.x;
      const dy = e.clientY - lastPt.current.y;
      lastPt.current = { x: e.clientX, y: e.clientY };
      const { scale, tx, ty } = xfRef.current;
      writeTransform(tx + dx, ty + dy, scale);
    };

    const onPointerUp = (_e: PointerEvent) => {
      dragging.current = false;
    };

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup',   onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);

    return () => {
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup',   onPointerUp);
      stage.removeEventListener('pointercancel', onPointerUp);
    };
  }, [computeFitScale, centreAt, zoomTo100, writeTransform]);

  // ── Auto-fit on photoDims change (new image selected) ────────────────
  const prevDimsKey = useRef('');
  useEffect(() => {
    if (!photoDims) return;
    const key = `${photoDims.width}x${photoDims.height}`;
    if (key === prevDimsKey.current) return;
    prevDimsKey.current = key;
    // Slight delay so stage has painted with correct size
    const id = setTimeout(() => fitToScreen(false), 30);
    return () => clearTimeout(id);
  }, [photoDims, fitToScreen]);

  // ── Auto-fit on stage resize ─────────────────────────────────────────
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const obs = new ResizeObserver(() => {
      const fs = computeFitScale();
      setFitScale(fs);
      // Don't re-centre if user has panned away — just update fitScale ref
    });
    obs.observe(stage);
    return () => obs.disconnect();
  }, [computeFitScale]);

  return { stageRef, contentRef, state, fitToScreen, zoomTo100, zoomIn, zoomOut, fitScale };
}
