import React, { useRef, useState } from 'react';
import { GalleryGrid } from './components/gallery/GalleryGrid';
import { ImageAsset } from './types';
import './index.css';

interface Measurement {
  assetCount: number;
  loadedAssetCount: number;
  pagesLoaded: number;
  mountedCardCount: number;
  domElementCount: number;
  renderSettleMs: number;
  viewport: string;
}

function createAssets(count: number): ImageAsset[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `benchmark-${index}`,
    file_name: `photo-${String(index).padStart(6, '0')}.jpg`,
    source_path: `C:/benchmark/photo-${index}.jpg`,
    file_size: 1024 * 1024 + index,
    rating: index % 6,
    flag: index % 7 === 0 ? 'flagged' : 'unflagged',
    width: 2048,
    height: 1536,
    date_taken: '2025-01-01',
  }));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

const queryAssetCount = Number(new URLSearchParams(window.location.search).get('assets'));
const initialAssetCount = Number.isInteger(queryAssetCount) && queryAssetCount > 0
  ? Math.min(queryAssetCount, 100_000)
  : 10_000;
const PAGE_SIZE = 200;

export const GalleryBenchmark: React.FC = () => {
  const rootRef = useRef<HTMLElement | null>(null);
  const allAssetsRef = useRef<ImageAsset[]>([]);
  const [assetCount, setAssetCount] = useState(initialAssetCount);
  const [pagingMode, setPagingMode] = useState(false);
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const measureGallery = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!Number.isInteger(assetCount) || assetCount < 1 || assetCount > 100_000) {
      setErrorMessage('Asset count must be between 1 and 100000.');
      return;
    }

    setIsMeasuring(true);
    setErrorMessage('');
    setMeasurement(null);
    setSelectedAssetIds(new Set());
    setIsLoadingMore(false);
    const syntheticAssets = createAssets(assetCount);
    allAssetsRef.current = syntheticAssets;
    const started = performance.now();
    setAssets(pagingMode ? syntheticAssets.slice(0, PAGE_SIZE) : syntheticAssets);
    await nextFrame();
    await nextFrame();
    await nextFrame();

    const root = rootRef.current;
    if (!root) {
      setIsMeasuring(false);
      throw new Error('Gallery benchmark root was not mounted.');
    }
    setMeasurement({
      assetCount,
      loadedAssetCount: pagingMode ? Math.min(assetCount, PAGE_SIZE) : assetCount,
      pagesLoaded: pagingMode ? Math.ceil(Math.min(assetCount, PAGE_SIZE) / PAGE_SIZE) : 0,
      mountedCardCount: root.querySelectorAll('[data-gallery-card]').length,
      domElementCount: root.querySelectorAll('*').length,
      renderSettleMs: Math.round((performance.now() - started) * 100) / 100,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    });
    setIsMeasuring(false);
  };

  const loadNextPage = () => {
    if (isLoadingMore || assets.length >= assetCount) return;
    setIsLoadingMore(true);
    window.setTimeout(() => {
      const nextAssets = allAssetsRef.current.slice(assets.length, assets.length + PAGE_SIZE);
      setAssets((current) => [...current, ...nextAssets]);
      setIsLoadingMore(false);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const root = rootRef.current;
          if (!root) return;
          setMeasurement((current) => current ? {
            ...current,
            loadedAssetCount: assets.length + nextAssets.length,
            pagesLoaded: current.pagesLoaded + 1,
            mountedCardCount: root.querySelectorAll('[data-gallery-card]').length,
            domElementCount: root.querySelectorAll('*').length,
          } : current);
        });
      });
    }, 16);
  };

  return (
    <main ref={rootRef} className="h-screen overflow-y-auto bg-obsidian-deep p-6 text-obsidian-textPri">
      <header className="mx-auto mb-4 flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Gallery DOM benchmark</h1>
          <p className="mt-1 text-sm text-obsidian-textSec">
            Development-only measurement of the production virtualized Gallery grid.
          </p>
        </div>
        <form onSubmit={(event) => void measureGallery(event)} className="flex items-center gap-2">
          <label htmlFor="benchmark-asset-count" className="text-sm text-obsidian-textSec">
            Synthetic assets
          </label>
          <input
            id="benchmark-asset-count"
            type="number"
            min={1}
            max={100_000}
            step={1}
            value={assetCount}
            onChange={(event) => setAssetCount(Number(event.target.value))}
            className="w-32"
          />
          <label className="flex items-center gap-1 text-sm text-obsidian-textSec">
            <input
              type="checkbox"
              checked={pagingMode}
              onChange={(event) => setPagingMode(event.target.checked)}
            />
            Page by 200
          </label>
          <button
            type="submit"
            disabled={isMeasuring}
            className="rounded border border-obsidian-border px-3 py-2 text-sm hover:bg-obsidian-elevated disabled:opacity-60"
          >
            {isMeasuring ? 'Measuring…' : 'Measure'}
          </button>
        </form>
      </header>

      {measurement && (
        <dl className="mx-auto mb-4 grid max-w-6xl grid-cols-2 gap-3 rounded border border-obsidian-border bg-obsidian-card p-3 text-sm md:grid-cols-7">
          <div><dt className="text-obsidian-textMut">Assets</dt><dd>{measurement.assetCount}</dd></div>
          <div><dt className="text-obsidian-textMut">Loaded assets</dt><dd>{measurement.loadedAssetCount}</dd></div>
          <div><dt className="text-obsidian-textMut">Pages loaded</dt><dd>{measurement.pagesLoaded}</dd></div>
          <div><dt className="text-obsidian-textMut">Mounted cards</dt><dd>{measurement.mountedCardCount}</dd></div>
          <div><dt className="text-obsidian-textMut">DOM elements in harness</dt><dd>{measurement.domElementCount}</dd></div>
          <div><dt className="text-obsidian-textMut">Render settle</dt><dd>{measurement.renderSettleMs} ms</dd></div>
          <div><dt className="text-obsidian-textMut">Viewport</dt><dd>{measurement.viewport}</dd></div>
        </dl>
      )}
      {errorMessage && <p role="alert" className="mx-auto mb-4 max-w-6xl text-sm text-red-300">{errorMessage}</p>}

      <section
        aria-label="Gallery benchmark grid"
        className="mx-auto flex h-[calc(100vh-180px)] min-h-[300px] max-w-6xl flex-col overflow-hidden rounded border border-obsidian-border"
      >
        <GalleryGrid
          assets={assets}
          selectedAssetIds={selectedAssetIds}
          onSelectAsset={() => undefined}
          onMultiSelect={setSelectedAssetIds}
          onClearSelection={() => setSelectedAssetIds(new Set())}
          onOpenInLightbox={() => undefined}
          onContextMenu={(event) => event.preventDefault()}
          remainingAssetCount={pagingMode ? Math.max(0, assetCount - assets.length) : 0}
          onLoadMore={loadNextPage}
          isLoadingMore={isLoadingMore}
        />
      </section>
    </main>
  );
};
