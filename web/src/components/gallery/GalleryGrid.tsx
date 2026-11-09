import React, { useEffect, useMemo, useState, useRef } from 'react';
import { ImageAsset } from '../../types';
import { Flag, Loader2, Star, X, CheckCircle2 } from 'lucide-react';
import { GalleryThumbnail } from './GalleryThumbnail';

interface GalleryGridProps {
  assets: ImageAsset[];
  selectedAssetIds: Set<string>;
  onSelectAsset: (asset: ImageAsset, isMulti: boolean, isRange: boolean) => void;
  onMultiSelect?: (ids: Set<string>) => void;
  onClearSelection?: () => void;
  onOpenInLightbox: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, asset: ImageAsset) => void;
  remainingAssetCount: number;
  onLoadMore: () => void;
  isLoadingMore?: boolean;
  loadMoreError?: string | null;
}

export const GalleryGrid: React.FC<GalleryGridProps> = ({
  assets,
  selectedAssetIds,
  onSelectAsset,
  onMultiSelect,
  onClearSelection,
  onOpenInLightbox,
  onContextMenu,
  remainingAssetCount,
  onLoadMore,
  isLoadingMore = false,
  loadMoreError = null,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ height: 0, scrollTop: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      setViewport((current) => ({
        ...current,
        height: container.clientHeight,
        width: container.clientWidth,
      }));
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

  const width = window.innerWidth;
  const columns = width >= 1536 ? 7
    : width >= 1280 ? 6
    : width >= 1024 ? 5
    : width >= 768 ? 4
    : width >= 640 ? 3
    : 2;
  const rowHeight = useMemo(() => {
    const availableWidth = Math.max(0, viewport.width - 32);
    const itemWidth = Math.max(0, (availableWidth - (columns - 1) * 16) / columns);
    return itemWidth * 0.75 + 62 + 16;
  }, [columns, viewport.width]);
  const rowCount = Math.ceil(assets.length / columns);
  const overscanRows = 3;
  const firstRow = Math.max(
    0,
    Math.floor(viewport.scrollTop / Math.max(1, rowHeight)) - overscanRows,
  );
  const visibleRowCount = Math.ceil(viewport.height / Math.max(1, rowHeight)) + overscanRows * 2;
  const lastRow = Math.min(rowCount, firstRow + visibleRowCount);
  const visibleAssets = assets.slice(firstRow * columns, lastRow * columns);
  const topSpacerHeight = firstRow > 0 ? firstRow * rowHeight - 16 : 0;
  const bottomSpacerHeight = lastRow < rowCount
    ? (rowCount - lastRow) * rowHeight - 16
    : 0;

  // ── Marquee Mouse Drag Selection State ──
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const isDraggingMarquee = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const pointerPosition = useRef({ x: 0, y: 0 });
  const initialSelection = useRef<Set<string>>(new Set());
  const marqueeSelection = useRef<Set<string>>(new Set());
  const assetsRef = useRef(assets);
  const animationFrame = useRef<number | null>(null);
  const loadMoreRequested = useRef(false);
  const dragCleanup = useRef<(() => void) | null>(null);
  const pagingState = useRef({
    remainingAssetCount,
    isLoadingMore,
    loadMoreError,
    onLoadMore,
  });

  useEffect(() => {
    pagingState.current = { remainingAssetCount, isLoadingMore, loadMoreError, onLoadMore };
  }, [remainingAssetCount, isLoadingMore, loadMoreError, onLoadMore]);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    if (!isLoadingMore) loadMoreRequested.current = false;
  }, [isLoadingMore]);

  useEffect(() => () => dragCleanup.current?.(), []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only primary left mouse button
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    const isCard = target.closest('[data-gallery-card]');

    // If clicked outside any card on empty grid area without Ctrl/Shift, deselect
    if (!isCard && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      onClearSelection?.();
    }

    startPos.current = { x: e.clientX, y: e.clientY };
    pointerPosition.current = startPos.current;
    initialSelection.current = (e.ctrlKey || e.metaKey || e.shiftKey)
      ? new Set(selectedAssetIds)
      : new Set();
    marqueeSelection.current = new Set();

    const updateSelection = (x: number, y: number) => {
      setMarquee({
        startX: startPos.current.x,
        startY: startPos.current.y,
        currentX: x,
        currentY: y,
      });

      const mLeft = Math.min(startPos.current.x, x);
      const mTop = Math.min(startPos.current.y, y);
      const mRight = Math.max(startPos.current.x, x);
      const mBottom = Math.max(startPos.current.y, y);
      const container = containerRef.current;
      if (container) {
        const bounds = container.getBoundingClientRect();
        const cardWidth = Math.max(
          0,
          (container.clientWidth - 32 - (columns - 1) * 16) / columns,
        );
        const cardHeight = Math.max(0, rowHeight - 16);
        const contentTop = bounds.top + 16 - container.scrollTop;
        const firstIntersectingRow = Math.max(
          0,
          Math.ceil((mTop - contentTop - cardHeight) / rowHeight),
        );
        const lastIntersectingRow = Math.min(
          Math.ceil(assetsRef.current.length / columns) - 1,
          Math.floor((mBottom - contentTop) / rowHeight),
        );
        const intersectingIds = new Set<string>();

        for (let row = firstIntersectingRow; row <= lastIntersectingRow; row++) {
          const cardTop = contentTop + row * rowHeight;
          if (cardTop > mBottom || cardTop + cardHeight < mTop) continue;

          for (let column = 0; column < columns; column++) {
            const asset = assetsRef.current[row * columns + column];
            if (!asset) break;
            const cardLeft = bounds.left + 16 + column * (cardWidth + 16);
            if (cardLeft <= mRight && cardLeft + cardWidth >= mLeft) {
              intersectingIds.add(asset.id);
            }
          }
        }
        marqueeSelection.current = intersectingIds;
      }

      const nextSelected = new Set([
        ...initialSelection.current,
        ...marqueeSelection.current,
      ]);
      onMultiSelect?.(nextSelected);
    };

    const autoScroll = () => {
      if (!isDraggingMarquee.current) return;
      const container = containerRef.current;
      let shouldContinue = false;
      if (container) {
        const bounds = container.getBoundingClientRect();
        const edgeSize = 48;
        const pointerY = pointerPosition.current.y;
        const maxScrollTop = container.scrollHeight - container.clientHeight;
        let scrollDelta = 0;

        if (pointerY < bounds.top + edgeSize && container.scrollTop > 0) {
          scrollDelta = -Math.ceil(((bounds.top + edgeSize - pointerY) / edgeSize) * 18);
          shouldContinue = true;
        } else if (
          pointerY > bounds.bottom - edgeSize &&
          container.scrollTop < maxScrollTop
        ) {
          scrollDelta = Math.ceil(((pointerY - (bounds.bottom - edgeSize)) / edgeSize) * 18);
          shouldContinue = true;
        }

        const previousScrollTop = container.scrollTop;
        if (scrollDelta !== 0) {
          container.scrollTop = Math.max(
            0,
            Math.min(maxScrollTop, container.scrollTop + scrollDelta),
          );
        }
        if (container.scrollTop !== previousScrollTop) {
          updateSelection(pointerPosition.current.x, pointerY);
        }

        const paging = pagingState.current;
        if (pointerY > bounds.bottom - edgeSize && container.scrollTop >= maxScrollTop - 1) {
          const canLoadMore = paging.remainingAssetCount > 0 && !paging.loadMoreError;
          if (canLoadMore) {
            shouldContinue = true;
            if (!paging.isLoadingMore && !loadMoreRequested.current) {
              loadMoreRequested.current = true;
              paging.onLoadMore();
            }
          }
        }
      }
      animationFrame.current = shouldContinue
        ? window.requestAnimationFrame(autoScroll)
        : null;
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      pointerPosition.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      const dx = moveEvent.clientX - startPos.current.x;
      const dy = moveEvent.clientY - startPos.current.y;
      const dist = Math.hypot(dx, dy);

      if (!isDraggingMarquee.current && dist > 5) {
        isDraggingMarquee.current = true;
      }

      if (isDraggingMarquee.current) {
        updateSelection(moveEvent.clientX, moveEvent.clientY);
        if (animationFrame.current === null) {
          animationFrame.current = window.requestAnimationFrame(autoScroll);
        }
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
      isDraggingMarquee.current = false;
      setMarquee(null);
      dragCleanup.current = null;
    };

    dragCleanup.current = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
      }
      isDraggingMarquee.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      className="flex-1 overflow-y-auto p-4 select-none relative"
    >
      {/* ── Marquee Drag Selection Box ── */}
      {marquee && (
        <div
          className="fixed pointer-events-none rounded border border-blue-400 bg-blue-500/20 z-50 shadow-sm"
          style={{
            left: Math.min(marquee.startX, marquee.currentX),
            top: Math.min(marquee.startY, marquee.currentY),
            width: Math.abs(marquee.currentX - marquee.startX),
            height: Math.abs(marquee.currentY - marquee.startY),
          }}
        />
      )}

      {/* ── Grid of Photos ── */}
      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {topSpacerHeight > 0 && (
          <div aria-hidden="true" style={{ height: topSpacerHeight, gridColumn: '1 / -1' }} />
        )}
        {visibleAssets.map((asset) => {
          const isSelected = selectedAssetIds.has(asset.id);
          const meta = asset.metadata || {};
          const dims = asset.width && asset.height ? `${asset.width}×${asset.height}` : '';
          const format = (meta.format || asset.format || 'IMG').toUpperCase();

          return (
            <div
              key={asset.id}
              data-gallery-card="true"
              data-asset-id={asset.id}
              onClick={(e) => {
                const isMulti = e.ctrlKey || e.metaKey;
                const isRange = e.shiftKey;
                onSelectAsset(asset, isMulti, isRange);
              }}
              onDoubleClick={() => onOpenInLightbox(asset.id)}
              onContextMenu={(e) => onContextMenu(e, asset)}
              className={`group relative flex flex-col rounded-lg overflow-hidden border transition-all duration-150 cursor-pointer ${
                isSelected
                  ? 'bg-obsidian-active border-obsidian-accent ring-2 ring-obsidian-accent/50 shadow-lg'
                  : 'bg-obsidian-card border-obsidian-border hover:border-obsidian-borderLt hover:bg-obsidian-elevated hover:shadow-md'
              }`}
            >
              {/* ── Thumbnail Container ── */}
              <div className="w-full aspect-[4/3] bg-obsidian-deep relative flex items-center justify-center overflow-hidden">
                <GalleryThumbnail
                  key={asset.id}
                  assetId={asset.id}
                  alt={asset.file_name}
                  className="h-full w-full"
                  fallback={(
                    <div className="text-obsidian-textMut text-[11px] p-2 text-center break-all font-mono">
                      {asset.file_name}
                    </div>
                  )}
                />

                {/* Multi-select checkmark button (always visible when selected, visible on hover) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAsset(asset, true, false);
                  }}
                  className={`absolute top-2 right-2 rounded-full p-0.5 transition-all z-10 ${
                    isSelected
                      ? 'bg-obsidian-accent text-white shadow-md opacity-100'
                      : 'bg-black/60 text-white/70 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-black/80'
                  }`}
                  title={isSelected ? 'Deselect photo' : 'Select photo'}
                >
                  <CheckCircle2 size={16} className={isSelected ? 'stroke-[2.5]' : 'stroke-[1.5]'} />
                </button>

                {/* Flag Badge (Top Left) */}
                {asset.flag === 'flagged' && (
                  <div
                    className="absolute top-2 left-2 bg-blue-600 text-white p-1 rounded shadow-md"
                    title="Pick (Flagged)"
                  >
                    <Flag size={12} fill="currentColor" />
                  </div>
                )}
                {asset.flag === 'rejected' && (
                  <div
                    className="absolute top-2 left-2 bg-red-600 text-white p-1 rounded shadow-md"
                    title="Rejected"
                  >
                    <X size={12} className="stroke-[3]" />
                  </div>
                )}

                {/* Format / Dim Tag (Bottom Right) */}
                <div className="absolute bottom-1.5 right-1.5 bg-black text-[9px] font-mono text-obsidian-textSec px-1.5 py-0.5 rounded">
                  {format}
                </div>
              </div>

              {/* ── Metadata Footer ── */}
              <div className="p-2 flex flex-col gap-1 text-[11px] bg-obsidian-card/90">
                <span className="truncate text-white font-medium text-xs" title={asset.file_name}>
                  {asset.file_name}
                </span>

                <div className="flex items-center justify-between text-obsidian-textMut text-[10px]">
                  <span>{dims || '—'}</span>

                  {/* Rating Stars */}
                  {asset.rating > 0 && (
                    <div className="flex items-center gap-0.5 text-amber-400 font-bold">
                      <Star size={10} fill="currentColor" />
                      <span>{asset.rating}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {bottomSpacerHeight > 0 && (
          <div aria-hidden="true" style={{ height: bottomSpacerHeight, gridColumn: '1 / -1' }} />
        )}
      </div>
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
              {isLoadingMore && <Loader2 size={13} className="animate-spin" />}
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
