import React, { useEffect, useRef, useState } from 'react';
import { ImageAsset } from '../types';
import { Star } from 'lucide-react';
import { ResizeHandle } from './common/ResizeHandle';
import { GalleryThumbnail } from './gallery/GalleryThumbnail';
import { bridge } from '../bridge';

interface FilmstripProps {
  assets: ImageAsset[];
  activeAsset?: ImageAsset | null;
  activeCollectionId?: string | null;
  collectionAssetCount?: number;
  selectedAssets?: ImageAsset[] | null;
  activeAssetId?: string;
  onSelectAsset: (id: string) => void;
  isVisible: boolean;
  height?: number;
  onResize?: (delta: number) => void;
  onResetHeight?: () => void;
}

export const Filmstrip: React.FC<FilmstripProps> = ({
  assets = [],
  activeAsset,
  activeCollectionId,
  collectionAssetCount,
  selectedAssets,
  activeAssetId,
  onSelectAsset,
  isVisible,
  height = 112,
  onResize,
  onResetHeight,
}) => {
  const [filmstripAssets, setFilmstripAssets] = useState(assets);
  const [total, setTotal] = useState(assets.length);
  const [isCollectionScope, setIsCollectionScope] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const footerRef = useRef<HTMLElement>(null);
  const nextOffsetRef = useRef(0);
  const visibleAssets = selectedAssets ?? (bridge.hasNativeApi ? filmstripAssets : assets);

  useEffect(() => {
    if (!bridge.hasNativeApi) return;

    let cancelled = false;
    const loadInitialPage = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadError(null);
      setIsCollectionScope(false);
      nextOffsetRef.current = 0;
      try {
        const collectionId = activeCollectionId;
        let showCollection = Boolean(collectionId);
        if (collectionId && activeAsset?.id) {
          showCollection = await bridge.isAssetInCollection(activeAsset.id, collectionId);
        }
        if (cancelled) return;
        if (!showCollection) {
          const singleAsset = activeAsset ? [activeAsset] : [];
          setFilmstripAssets(singleAsset);
          setTotal(singleAsset.length);
          return;
        }

        const page = await bridge.getAssetPage(0, 100, {
          collection_id: collectionId,
        });
        if (cancelled) return;
        setIsCollectionScope(true);
        setFilmstripAssets(page.assets);
        setTotal(page.total);
        nextOffsetRef.current = page.assets.length;
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    };
    void loadInitialPage();
    return () => {
      cancelled = true;
    };
  }, [
    assets,
    activeAsset,
    activeCollectionId,
    collectionAssetCount,
    retryKey,
  ]);

  const loadMore = async () => {
    if (
      !bridge.hasNativeApi ||
      !activeCollectionId ||
      !isCollectionScope ||
      loadingMore ||
      nextOffsetRef.current >= total
    ) {
      return;
    }
    setLoadingMore(true);
    setLoadError(null);
    try {
      const page = await bridge.getAssetPage(nextOffsetRef.current, 100, {
        collection_id: activeCollectionId,
      });
      setFilmstripAssets((current) => [...current, ...page.assets]);
      nextOffsetRef.current += page.assets.length;
      setTotal(page.total);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleScroll = () => {
    const footer = footerRef.current;
    if (
      footer &&
      isCollectionScope &&
      footer.scrollWidth - footer.scrollLeft - footer.clientWidth < 240 &&
      nextOffsetRef.current < total
    ) {
      void loadMore();
    }
  };

  if (!isVisible) return null;

  // Dynamically compute dimensions based on custom resizable height
  const cardHeight = Math.max(54, height - 22);
  const cardWidth = Math.round(cardHeight * 1.08);
  const thumbHeight = Math.max(28, cardHeight - 34);

  return (
    <div className="relative flex flex-col z-20 flex-shrink-0">
      {/* ── Top Draggable Resize Handle ── */}
      {onResize && (
        <ResizeHandle
          direction="horizontal"
          side="bottom"
          onResize={onResize}
          onDoubleClick={onResetHeight}
          title="Drag to resize filmstrip height • Double-click to reset"
        />
      )}

      <footer
        ref={footerRef}
        onScroll={handleScroll}
        style={{ height: `${height}px` }}
        className="app-surface flex items-center space-x-3 overflow-x-auto border-x-0 border-b-0 px-4 select-none transition-[height] duration-75 scrollbar-thin"
      >
        {visibleAssets.length === 0 ? (
          <div className="flex-1 text-center text-xs text-obsidian-textMut italic">
            {loadError ? (
              <>
                Could not load filmstrip: {loadError}{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setRetryKey((key) => key + 1)}
                >
                  Retry
                </button>
              </>
            ) : 'No images in library. Click "Import" above to load photos.'}
          </div>
        ) : (
          visibleAssets.map((asset) => {
            const isSelected = asset.id === activeAssetId;
            return (
              <button
                type="button"
                key={asset.id}
                onClick={() => onSelectAsset(asset.id)}
                aria-pressed={isSelected}
                aria-label={`Open ${asset.file_name || asset.filename}`}
                style={{ height: `${cardHeight}px`, width: `${cardWidth}px` }}
                className={`flex flex-shrink-0 cursor-pointer flex-col items-center justify-between rounded-xl border p-1.5 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${
                  isSelected
                    ? 'border-sky-300/60 bg-sky-400/[0.12] shadow-lg shadow-sky-950/20 ring-1 ring-sky-300/20'
                    : 'border-white/[0.07] bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.075]'
                }`}
              >
                {/* Thumbnail */}
                <GalleryThumbnail
                  key={asset.id}
                  assetId={asset.id}
                  alt={asset.filename || asset.file_name}
                  className="flex w-full flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30 ring-1 ring-white/[0.06]"
                  fallback={<span className="text-[9px] text-obsidian-textMut font-mono">RAW</span>}
                  style={{ height: `${thumbHeight}px` }}
                />

                {/* Title & Metadata */}
                <div className="w-full text-center mt-1">
                  <p className="text-[9.5px] font-medium text-obsidian-textPri truncate w-full leading-tight">
                    {asset.file_name || asset.filename}
                  </p>
                  <div className="flex items-center justify-center space-x-1 text-[8px] text-obsidian-textMut mt-0.5">
                    {asset.rating > 0 && (
                      <span className="flex items-center text-yellow-400 font-bold">
                        <Star className="w-2.5 h-2.5 fill-current mr-0.5" />
                        {asset.rating}
                      </span>
                    )}
                    {asset.flag === 'flagged' && (
                      <span className="text-obsidian-accent font-bold">PICK</span>
                    )}
                    {asset.flag === 'rejected' && (
                      <span className="text-red-400 font-bold">REJ</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
        {loadingMore && (
          <div className="flex-shrink-0 px-3 text-[10px] text-obsidian-textMut" role="status">
            Loading…
          </div>
        )}
        {loadError && visibleAssets.length > 0 && (
          <div className="flex flex-shrink-0 items-center gap-2 px-2 text-[10px] text-red-300" role="alert">
            Could not load more photos.
            <button
              type="button"
              className="underline"
              onClick={() => setRetryKey((key) => key + 1)}
            >
              Retry
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};
