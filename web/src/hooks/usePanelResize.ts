import { useState, useCallback } from 'react';
import type { UsePanelResizeOptions, UsePanelResizeResult } from '../interfaces/hooks';

export type { UsePanelResizeOptions, UsePanelResizeResult };

export function usePanelResize({
  initialSize,
  minSize = 120,
  maxSize = 800,
  storageKey,
}: UsePanelResizeOptions): UsePanelResizeResult {
  const [size, setSizeState] = useState<number>(() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const num = parseFloat(saved);
          if (!isNaN(num) && num >= minSize && num <= maxSize) {
            return num;
          }
        }
      } catch (err) {
        console.warn('Failed reading panel size from localStorage', err);
      }
    }
    return initialSize;
  });

  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleResize = useCallback(
    (delta: number) => {
      setSizeState((prev) => {
        const next = Math.max(minSize, Math.min(maxSize, prev + delta));
        if (storageKey && typeof window !== 'undefined') {
          try {
            localStorage.setItem(storageKey, String(next));
          } catch (err) {
            console.warn('Failed saving panel size to localStorage', err);
          }
        }
        return next;
      });
      setIsCollapsed(false);
    },
    [minSize, maxSize, storageKey]
  );

  const resetSize = useCallback(() => {
    setSizeState(initialSize);
    if (storageKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, String(initialSize));
      } catch (err) {
        console.warn('Failed resetting panel size in localStorage', err);
      }
    }
    setIsCollapsed(false);
  }, [initialSize, storageKey]);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  return {
    size: isCollapsed ? 0 : size,
    rawSize: size,
    isCollapsed,
    setSize: setSizeState,
    setIsCollapsed,
    handleResize,
    resetSize,
    toggleCollapse,
  };
}
