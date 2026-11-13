import React from 'react';

export interface UsePanelResizeOptions {
  initialSize: number;
  minSize?: number;
  maxSize?: number;
  storageKey?: string;
}

export interface UsePanelResizeResult {
  size: number;
  rawSize: number;
  isCollapsed: boolean;
  setSize: React.Dispatch<React.SetStateAction<number>>;
  setIsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  handleResize: (delta: number) => void;
  resetSize: () => void;
  toggleCollapse: () => void;
}

export interface UseFileDropResult {
  isFileDragOver: boolean;
  setIsFileDragOver: (over: boolean) => void;
  dropMessage: string;
  setDropMessage: (msg: string) => void;
  isImportingDrop: boolean;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => Promise<void>;
}
