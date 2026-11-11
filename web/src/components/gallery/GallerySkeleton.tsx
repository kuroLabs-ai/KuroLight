import React from 'react';

/**
 * Shimmering skeleton card grid for the main gallery view.
 */
export const GalleryGridSkeleton: React.FC<{ count?: number }> = ({ count = 12 }) => (
  <div
    className="grid flex-1 grid-cols-2 gap-3.5 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    role="status"
    aria-label="Loading photos"
  >
    {Array.from({ length: count }, (_, i) => (
      <div
        key={i}
        className="flex flex-col overflow-hidden rounded-lg border border-obsidian-border bg-obsidian-card"
      >
        {/* Shimmering photo aspect box */}
        <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-obsidian-deep">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-shimmer" />
          <svg
            className="h-8 w-8 text-obsidian-textMut/20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>

        {/* Card info placeholder */}
        <div className="flex flex-col gap-1.5 bg-obsidian-card/60 p-2.5">
          <div className="relative h-3 w-3/4 overflow-hidden rounded bg-obsidian-elevated/70">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-shimmer" />
          </div>
          <div className="relative h-2 w-1/2 overflow-hidden rounded bg-obsidian-elevated/40">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent animate-shimmer" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

/**
 * Shimmering skeleton rows for source folders in the gallery sidebar.
 */
export const GallerySidebarFolderSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="flex flex-col gap-1 px-1 py-1" role="status" aria-label="Loading folders">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5">
        <div className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded bg-obsidian-elevated/60">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent animate-shimmer" />
        </div>
        <div className="relative h-2.5 flex-1 overflow-hidden rounded bg-obsidian-elevated/50">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent animate-shimmer" />
        </div>
        <div className="h-2 w-4 rounded bg-obsidian-elevated/30" />
      </div>
    ))}
  </div>
);

/**
 * Shimmering skeleton rows for table list view.
 */
export const GalleryTableSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="flex flex-col divide-y divide-obsidian-border/50 p-2" role="status" aria-label="Loading table">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="flex items-center gap-4 px-3 py-2.5">
        <div className="relative h-8 w-11 shrink-0 overflow-hidden rounded bg-obsidian-elevated/70">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent animate-shimmer" />
        </div>
        <div className="relative h-3 w-40 overflow-hidden rounded bg-obsidian-elevated/60">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent animate-shimmer" />
        </div>
        <div className="relative h-2.5 w-24 overflow-hidden rounded bg-obsidian-elevated/40">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-shimmer" />
        </div>
        <div className="relative ml-auto h-2.5 w-16 overflow-hidden rounded bg-obsidian-elevated/30">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-shimmer" />
        </div>
      </div>
    ))}
  </div>
);
