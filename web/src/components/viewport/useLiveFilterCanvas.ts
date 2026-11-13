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
  const rendererRef = useRef<LiveFilterRenderer | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize WebGL Renderer
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

  // Load Image when source changes
  useEffect(() => {
    if (!imageSrc) {
      imageRef.current = null;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      if (rendererRef.current) {
        rendererRef.current.setImage(img);
        rendererRef.current.render(editState);
      }
      onDimensionsLoaded?.({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    };
    img.src = imageSrc;

    return () => {
      img.onload = null;
    };
  }, [imageSrc]);

  // Render on editState changes with requestAnimationFrame throttling
  useEffect(() => {
    if (!rendererRef.current || !imageRef.current) return;

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }

    animFrameRef.current = requestAnimationFrame(() => {
      rendererRef.current?.render(editState);
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
