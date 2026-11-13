import { useEffect } from 'react';

/**
 * Prevents accidental page zoom in webview environments via Ctrl+Wheel.
 */
export function usePreventZoom(): void {
  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleGlobalWheel);
  }, []);
}
