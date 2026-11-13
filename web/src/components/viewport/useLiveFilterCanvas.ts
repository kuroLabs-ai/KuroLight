/**
 * useLiveFilterCanvas — connects WebGL LiveFilterRenderer to a canvas ref.
 *
 * Key fix: do NOT set crossOrigin = 'anonymous' on images loaded from Python's
 * data: URLs or localhost. Edge WebView2 (pywebview) blocks cross-origin
 * requests when no CORS headers are sent, which silently prevents the image
 * from rendering into WebGL and causes an all-black canvas.
 */
import { useEffect, useRef } from 'react';
import type { EditState } from '@/interfaces/edit';
import { LiveFilterRenderer } from '@/utils/webgl/liveFilterRenderer';

interface UseLiveFilterCanvasOptions {
  imageSrc?: string;
  editState: EditState | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onDimensionsLoaded?: (dims: { width: number; height: number }) => void;
}

export function useLiveFilterCanvas({
  imageSrc,
  editState,
  canvasRef,
  onDimensionsLoaded,
}: UseLiveFilterCanvasOptions): void {
  const rendererRef  = useRef<LiveFilterRenderer | null>(null);
  const imageRef     = useRef<HTMLImageElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // ── Boot WebGL renderer on canvas mount ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new LiveFilterRenderer(canvas);
    rendererRef.current = renderer;

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [canvasRef]);

  // ── Load image whenever the src URL changes ──────────────────────────────
  useEffect(() => {
    if (!imageSrc) {
      imageRef.current = null;
      return;
    }

    const img = new Image();
    // ⚠️  Do NOT set crossOrigin here.
    // Python emits data: URLs which are same-origin by definition.
    // Setting crossOrigin = 'anonymous' triggers a CORS preflight that
    // Edge WebView2 fails because there are no Access-Control-Allow-Origin
    // headers, causing texImage2D to silently produce a black texture.

    img.onload = () => {
      imageRef.current = img;
      const renderer = rendererRef.current;
      if (renderer) {
        renderer.setImage(img);
        renderer.render(editState);
      }
      onDimensionsLoaded?.({
        width:  img.naturalWidth  || img.width,
        height: img.naturalHeight || img.height,
      });
    };

    img.onerror = (err) => {
      console.error('[KuroLight] Failed to load preview image:', err);
    };

    img.src = imageSrc;

    return () => {
      img.onload  = null;
      img.onerror = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  // ── Re-render on every editState change, throttled to one rAF ───────────
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !imageRef.current) return;

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }

    animFrameRef.current = requestAnimationFrame(() => {
      renderer.render(editState);
      animFrameRef.current = null;
    });

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [editState]);
}
