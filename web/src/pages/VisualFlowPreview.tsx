import React, { useRef } from 'react';
import type { EditState } from '@/interfaces/edit';
import { useLiveFilterCanvas } from '@/components/viewport/useLiveFilterCanvas';

interface VisualFlowPreviewProps {
  imageSrc: string;
  editState: EditState;
}

export const VisualFlowPreview: React.FC<VisualFlowPreviewProps> = ({ imageSrc, editState }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isReady = useLiveFilterCanvas({
    imageSrc,
    editState,
    canvasRef,
  });

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-obsidian-deep">
      {imageSrc ? (
        <canvas
          ref={canvasRef}
          aria-label="Live WebGL output preview"
          className="block max-h-full max-w-full object-contain"
        />
      ) : (
        <div className="px-3 text-center text-[9px] text-obsidian-textMut">
          Select a photo to preview this workflow.
        </div>
      )}
      {imageSrc && !isReady && (
        <span className="absolute bottom-1 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[8px] text-amber-300">
          WebGL preview unavailable
        </span>
      )}
    </div>
  );
};
