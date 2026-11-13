import React, { useState } from 'react';
import { bridge } from '../bridge';
import type { UseFileDropResult } from '../interfaces/hooks';

export type { UseFileDropResult };

export function useFileDrop(): UseFileDropResult {
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [dropMessage, setDropMessage] = useState('');
  const [isImportingDrop, setIsImportingDrop] = useState(false);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isFileDragOver) setIsFileDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsFileDragOver(false);
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsFileDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    setIsImportingDrop(true);
    let imported = 0;
    const errors: string[] = [];
    try {
      for (const file of files) {
        if (file.size > 200 * 1024 * 1024) {
          errors.push(`${file.name}: exceeds the 200 MB drag-and-drop limit`);
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === 'string'
              ? resolve(reader.result)
              : reject(new Error(`Could not read ${file.name}`));
          reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
          reader.readAsDataURL(file);
        });
        const result = await bridge.importDroppedFile(file.name, dataUrl);
        if (result.ok) imported += 1;
        else errors.push(`${file.name}: ${result.error ?? 'Import failed'}`);
      }
      setDropMessage(
        `${imported} image${imported === 1 ? '' : 's'} imported${
          errors.length ? ` · ${errors.length} failed: ${errors[0]}` : ''
        }`
      );
    } catch (error) {
      setDropMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingDrop(false);
      window.setTimeout(() => setDropMessage(''), 5000);
    }
  };

  return {
    isFileDragOver,
    setIsFileDragOver,
    dropMessage,
    setDropMessage,
    isImportingDrop,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}
