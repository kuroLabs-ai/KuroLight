import React, { useState } from 'react';
import { Check, Eye, Minus, Plus, Star, X } from 'lucide-react';
import { ImageAsset } from '../../types';
import { GalleryThumbnail } from './GalleryThumbnail';

interface CompareWorkspaceProps {
  assets: ImageAsset[];
  initialView: 'compare' | 'survey';
  onClose: () => void;
  onRemoveAsset: (assetId: string) => void;
  onSetRating: (assetId: string, rating: number) => void;
  onSetFlag: (assetId: string, flag: string) => void;
}

export const CompareWorkspace: React.FC<CompareWorkspaceProps> = ({
  assets,
  initialView,
  onClose,
  onRemoveAsset,
  onSetRating,
  onSetFlag,
}) => {
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<'compare' | 'survey'>(initialView);
  const zoomPercent = Math.round(zoom * 100);
  const visibleAssets = view === 'compare' ? assets.slice(0, 2) : assets;

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-obsidian-deep"
      aria-label={view === 'compare' ? 'Compare photos' : 'Survey photos'}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-obsidian-border px-4 py-2">
        <div>
          <h2 className="text-sm font-semibold text-white">{view === 'compare' ? 'Compare photos' : 'Survey photos'}</h2>
          <p className="text-[11px] text-obsidian-textMut">
            {view === 'compare' && assets.length > 2
              ? `Showing 2 of ${assets.length} selected`
              : `${visibleAssets.length} selected`} · zoom is synchronized
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="mr-2 flex rounded border border-obsidian-border p-0.5">
            <button
              type="button"
              aria-pressed={view === 'compare'}
              onClick={() => setView('compare')}
              className={`rounded px-2 py-1 text-[11px] ${view === 'compare' ? 'bg-obsidian-active text-white' : 'text-obsidian-textSec hover:text-white'}`}
            >
              Compare
            </button>
            <button
              type="button"
              aria-pressed={view === 'survey'}
              onClick={() => setView('survey')}
              className={`rounded px-2 py-1 text-[11px] ${view === 'survey' ? 'bg-obsidian-active text-white' : 'text-obsidian-textSec hover:text-white'}`}
            >
              Survey
            </button>
          </div>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((current) => Math.max(0.5, Math.round((current - 0.25) * 100) / 100))}
            className="rounded border border-obsidian-border p-1.5 text-obsidian-textSec hover:bg-obsidian-elevated disabled:opacity-40"
          >
            <Minus size={14} />
          </button>
          <input
            aria-label="Synchronized zoom"
            type="range"
            min={50}
            max={200}
            step={5}
            value={zoomPercent}
            onChange={(event) => setZoom(Number(event.target.value) / 100)}
            className="w-24 accent-sky-500"
          />
          <span className="w-10 text-right text-xs tabular-nums text-obsidian-textSec">
            {zoomPercent}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= 2}
            onClick={() => setZoom((current) => Math.min(2, Math.round((current + 0.25) * 100) / 100))}
            className="rounded border border-obsidian-border p-1.5 text-obsidian-textSec hover:bg-obsidian-elevated disabled:opacity-40"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 flex items-center gap-1 rounded border border-obsidian-border px-2 py-1.5 text-xs text-obsidian-textSec hover:bg-obsidian-elevated hover:text-white"
          >
            <X size={13} />
            Back to Gallery
          </button>
        </div>
      </header>

      <div className={`grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 sm:grid-cols-2 ${view === 'survey' && visibleAssets.length > 2 ? 'auto-rows-fr' : ''}`}>
        {visibleAssets.map((asset) => (
          <article
            key={asset.id}
            data-compare-asset-id={asset.id}
            className="flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-lg border border-obsidian-border bg-obsidian-card"
          >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-obsidian-border px-3 py-2">
              <span className="truncate text-xs font-medium text-white" title={asset.file_name}>
                {asset.file_name}
              </span>
              <button
                type="button"
                aria-label={`Remove ${asset.file_name} from comparison`}
                onClick={() => onRemoveAsset(asset.id)}
                className="shrink-0 rounded p-1 text-obsidian-textMut hover:bg-obsidian-hover hover:text-white"
              >
                <X size={13} />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/40">
              <div
                className="h-full w-full transition-transform duration-150"
                style={{ transform: `scale(${zoom})` }}
              >
                <GalleryThumbnail
                  assetId={asset.id}
                  alt={asset.file_name}
                  className="h-full w-full"
                  objectFit="contain"
                  fallback={(
                    <div className="flex h-full items-center justify-center px-4 text-center text-xs text-obsidian-textMut">
                      {asset.file_name}
                    </div>
                  )}
                />
              </div>
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-obsidian-border px-3 py-2">
              <div className="flex items-center gap-1" aria-label={`Rate ${asset.file_name}`}>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    type="button"
                    aria-label={`Rate ${asset.file_name} ${rating} stars`}
                    aria-pressed={asset.rating === rating}
                    onClick={() => onSetRating(asset.id, rating)}
                    className={`rounded p-1 ${asset.rating >= rating ? 'text-amber-400' : 'text-obsidian-textMut hover:text-amber-300'}`}
                  >
                    <Star size={13} fill={asset.rating >= rating ? 'currentColor' : 'none'} />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Pick ${asset.file_name}`}
                  aria-pressed={asset.flag === 'flagged'}
                  onClick={() => onSetFlag(asset.id, 'flagged')}
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${asset.flag === 'flagged' ? 'border-sky-500/60 bg-sky-500/15 text-sky-300' : 'border-obsidian-border text-obsidian-textSec hover:bg-obsidian-elevated'}`}
                >
                  <Check size={12} />
                  Pick
                </button>
                <button
                  type="button"
                  aria-label={`Clear flag for ${asset.file_name}`}
                  aria-pressed={!asset.flag || asset.flag === 'unflagged'}
                  onClick={() => onSetFlag(asset.id, 'unflagged')}
                  className={`rounded border px-2 py-1 text-[11px] ${!asset.flag || asset.flag === 'unflagged' ? 'border-obsidian-borderLt bg-obsidian-elevated text-white' : 'border-obsidian-border text-obsidian-textSec hover:bg-obsidian-elevated'}`}
                >
                  Clear
                </button>
                <button
                  type="button"
                  aria-label={`Reject ${asset.file_name}`}
                  aria-pressed={asset.flag === 'rejected'}
                  onClick={() => onSetFlag(asset.id, 'rejected')}
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] ${asset.flag === 'rejected' ? 'border-red-500/60 bg-red-500/15 text-red-300' : 'border-obsidian-border text-obsidian-textSec hover:bg-obsidian-elevated'}`}
                >
                  <Eye size={12} />
                  Reject
                </button>
              </div>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
};
