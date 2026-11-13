import React, { useEffect, useRef, useState } from 'react';
import { ImageAsset } from '../../types';
import { Flag, Star, X, CheckSquare, Square } from 'lucide-react';
import { GalleryThumbnail } from './GalleryThumbnail';

interface GalleryTableProps {
  assets: ImageAsset[];
  selectedAssetIds: Set<string>;
  onSelectAsset: (asset: ImageAsset, isMulti: boolean, isRange: boolean) => void;
  onOpenInLightbox: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, asset: ImageAsset) => void;
  remainingAssetCount: number;
  onLoadMore: () => void;
  isLoadingMore?: boolean;
  loadMoreError?: string | null;
}

export const GalleryTable: React.FC<GalleryTableProps> = ({
  assets,
  selectedAssetIds,
  onSelectAsset,
  onOpenInLightbox,
  onContextMenu,
  remainingAssetCount,
  onLoadMore,
  isLoadingMore = false,
  loadMoreError = null,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0 });
  const rowHeight = 44;
  const overscanRows = 10;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setViewport((current) => ({ ...current, height: container.clientHeight }));
    };
    const updateScroll = () => {
      setViewport((current) => ({ ...current, scrollTop: container.scrollTop }));
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    container.addEventListener('scroll', updateScroll, { passive: true });
    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', updateScroll);
    };
  }, []);

  const firstRow = Math.max(
    0,
    Math.floor(viewport.scrollTop / rowHeight) - overscanRows,
  );
  const visibleRowCount = Math.ceil(viewport.height / rowHeight) + overscanRows * 2;
  const lastRow = Math.min(assets.length, firstRow + visibleRowCount);
  const visibleAssets = assets.slice(firstRow, lastRow);

  return (
    <div ref={containerRef} className="flex-1 overflow-auto p-4 select-none">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-obsidian-border text-obsidian-textMut text-[10px] font-bold tracking-wider uppercase bg-obsidian-card">
            <th className="py-2 px-3 w-10"></th>
            <th className="py-2 px-3 w-14">Preview</th>
            <th className="py-2 px-3">File Name</th>
            <th className="py-2 px-3">Dimensions</th>
            <th className="py-2 px-3">Size</th>
            <th className="py-2 px-3">Rating</th>
            <th className="py-2 px-3">Flag</th>
            <th className="py-2 px-3">Camera / Lens</th>
            <th className="py-2 px-3">Date</th>
          </tr>
        </thead>
        <tbody>
          {firstRow > 0 && (
            <tr aria-hidden="true">
              <td colSpan={9} style={{ height: firstRow * rowHeight }} />
            </tr>
          )}
          {visibleAssets.map((asset) => {
            const isSelected = selectedAssetIds.has(asset.id);
            const meta = asset.metadata || {};
            const dims = asset.width && asset.height ? `${asset.width} × ${asset.height}` : '—';
            const sizeMb = asset.file_size ? `${(asset.file_size / (1024 * 1024)).toFixed(2)} MB` : '—';
            const cam = meta.camera_model || asset.camera_model || '—';

            return (
              <tr
                key={asset.id}
                style={{ height: rowHeight }}
                onClick={(e) => {
                  const isMulti = e.ctrlKey || e.metaKey;
                  const isRange = e.shiftKey;
                  onSelectAsset(asset, isMulti, isRange);
                }}
                onDoubleClick={() => onOpenInLightbox(asset.id)}
                onContextMenu={(e) => onContextMenu(e, asset)}
                className={`border-b border-obsidian-border/50 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-obsidian-active text-white font-medium'
                    : 'text-obsidian-textSec hover:bg-obsidian-elevated hover:text-white'
                }`}
              >
                {/* Selection Checkbox */}
                <td className="py-2 px-3 text-center">
                  {isSelected ? (
                    <CheckSquare size={14} className="text-obsidian-accent inline" />
                  ) : (
                    <Square size={14} className="text-obsidian-textMut inline opacity-40 group-hover:opacity-100" />
                  )}
                </td>

                {/* Thumbnail */}
                <td className="py-1 px-3">
                  <GalleryThumbnail
                    assetId={asset.id}
                    alt=""
                    className="w-10 h-8 rounded bg-obsidian-deep overflow-hidden flex items-center justify-center border border-obsidian-border"
                    fallback={<span className="text-[8px] text-obsidian-textMut">IMG</span>}
                  />
                </td>

                {/* File Name */}
                <td className="py-2 px-3 font-medium text-white max-w-[200px] truncate" title={asset.file_name}>
                  {asset.file_name}
                </td>

                {/* Dimensions */}
                <td className="py-2 px-3 text-obsidian-textMut font-mono text-[11px]">{dims}</td>

                {/* File Size */}
                <td className="py-2 px-3 text-obsidian-textMut font-mono text-[11px]">{sizeMb}</td>

                {/* Rating */}
                <td className="py-2 px-3">
                  {asset.rating > 0 ? (
                    <div className="flex items-center gap-0.5 text-amber-400 font-bold">
                      <Star size={11} fill="currentColor" />
                      <span>{asset.rating}</span>
                    </div>
                  ) : (
                    <span className="text-obsidian-textMut/40">—</span>
                  )}
                </td>

                {/* Flag */}
                <td className="py-2 px-3">
                  {asset.flag === 'flagged' && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30">
                      <Flag size={10} fill="currentColor" /> Pick
                    </span>
                  )}
                  {asset.flag === 'rejected' && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30">
                      <X size={10} /> Reject
                    </span>
                  )}
                  {(!asset.flag || asset.flag === 'unflagged') && (
                    <span className="text-obsidian-textMut/40">—</span>
                  )}
                </td>

                {/* Camera / Lens */}
                <td className="py-2 px-3 text-obsidian-textMut max-w-[150px] truncate" title={cam}>
                  {cam}
                </td>

                {/* Date */}
                <td className="py-2 px-3 text-obsidian-textMut font-mono text-[10px]">
                  {asset.date_taken || '—'}
                </td>
              </tr>
            );
          })}
          {lastRow < assets.length && (
            <tr aria-hidden="true">
              <td colSpan={9} style={{ height: (assets.length - lastRow) * rowHeight }} />
            </tr>
          )}
        </tbody>
      </table>
      {remainingAssetCount > 0 && (
        <div className="flex justify-center py-6">
          <div className="flex flex-col items-center gap-2">
            {loadMoreError && <p role="alert" className="text-xs text-red-300">{loadMoreError}</p>}
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="flex items-center gap-2 rounded-md border border-obsidian-border bg-obsidian-card px-4 py-2 text-xs font-medium text-obsidian-textSec transition-colors hover:bg-obsidian-elevated hover:text-white disabled:cursor-wait disabled:opacity-60"
            >
              {isLoadingMore && <span className="h-2 w-2 rounded-full bg-obsidian-accent animate-pulse" />}
              {loadMoreError ? 'Retry loading photos' : isLoadingMore ? 'Loading photos…' : 'Load more photos'}
              <span className="text-obsidian-textMut">
                ({remainingAssetCount.toLocaleString()} remaining)
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
