import React, { useState, useEffect, useCallback, useRef } from 'react';

export interface ResizeHandleProps {
  direction: 'vertical' | 'horizontal'; // 'vertical' = left/right drag (changes width), 'horizontal' = up/down drag (changes height)
  side: 'left' | 'right' | 'top' | 'bottom';
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
  onDoubleClick?: () => void;
  className?: string;
  title?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction,
  side,
  onResize,
  onResizeEnd,
  onDoubleClick,
  className = '',
  title = 'Drag to resize • Double-click to reset',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef<number>(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(true);
      startPosRef.current = direction === 'vertical' ? e.clientX : e.clientY;

      const cursorStyle = direction === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.cursor = cursorStyle;
      document.body.style.userSelect = 'none';
      document.body.classList.add('resizing-active');

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPos = direction === 'vertical' ? moveEvent.clientX : moveEvent.clientY;
        const diff = currentPos - startPosRef.current;
        startPosRef.current = currentPos;

        // Calculate delta based on which side the panel is docked
        let delta = 0;
        if (side === 'left') {
          // Left sidebar: handle on right edge -> moving right (+diff) increases width
          delta = diff;
        } else if (side === 'right') {
          // Right panel: handle on left edge -> moving left (-diff) increases width
          delta = -diff;
        } else if (side === 'bottom') {
          // Bottom panel: handle on top edge -> moving up (-diff) increases height
          delta = -diff;
        } else if (side === 'top') {
          // Top panel: handle on bottom edge -> moving down (+diff) increases height
          delta = diff;
        }

        if (delta !== 0) {
          onResize(delta);
        }
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.classList.remove('resizing-active');

        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        if (onResizeEnd) {
          onResizeEnd();
        }
      };

      window.addEventListener('mousemove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp, { passive: false });
    },
    [direction, side, onResize, onResizeEnd]
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDoubleClick?.();
      }}
      title={title}
      className={`group relative z-30 select-none flex-shrink-0 transition-colors ${
        direction === 'vertical'
          ? 'w-2 -mx-1 cursor-col-resize h-full flex items-center justify-center'
          : 'h-2 -my-1 cursor-row-resize w-full flex items-center justify-center'
      } ${className}`}
    >
      {/* Visual Guide Line */}
      <div
        className={`transition-colors pointer-events-none ${
          direction === 'vertical'
            ? `w-[1.5px] h-full ${
                isDragging
                  ? 'bg-obsidian-accent shadow-[0_0_8px_rgba(0,136,255,0.7)]'
                  : 'bg-transparent group-hover:bg-obsidian-accent/60'
              }`
            : `h-[1.5px] w-full ${
                isDragging
                  ? 'bg-obsidian-accent shadow-[0_0_8px_rgba(0,136,255,0.7)]'
                  : 'bg-transparent group-hover:bg-obsidian-accent/60'
              }`
        }`}
      />

      {/* Center Grip Dots Indicator */}
      <div
        className={`absolute pointer-events-none rounded-full bg-obsidian-border group-hover:bg-obsidian-accent transition-all ${
          isDragging ? 'bg-obsidian-accent scale-125' : 'opacity-0 group-hover:opacity-100'
        } ${direction === 'vertical' ? 'w-1 h-6' : 'h-1 w-6'}`}
      />
    </div>
  );
};
