import React, { useEffect, useRef, useState } from 'react';
import { bridge } from '../../bridge';

interface GalleryThumbnailProps {
  assetId: string;
  alt: string;
  className: string;
  objectFit?: 'cover' | 'contain';
  style?: React.CSSProperties;
  fallback?: React.ReactNode;
}

// Module-level cache to make re-selecting assets instant
export const thumbnailCache = new Map<string, string>();

/**
 * Modern Skeleton Shimmer Placeholder for gallery thumbnails
 */
export const ThumbnailSkeleton: React.FC<{ className?: string }> = ({
  className = 'h-full w-full',
}) => (
  <div className={`relative overflow-hidden bg-obsidian-surface/60 ${className}`}>
    {/* Animated Shimmer Wave */}
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-shimmer" />

    {/* Subtle placeholder icon silhouette */}
    <div className="absolute inset-0 flex flex-col items-center justify-center text-obsidian-textMut/25">
      <svg
        className="w-7 h-7"
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
  </div>
);

export const GalleryThumbnail: React.FC<GalleryThumbnailProps> = ({
  assetId,
  alt,
  className,
  objectFit = 'cover',
  style,
  fallback,
}) => {
  const imageRef = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string>(() => thumbnailCache.get(assetId) || '');
  const [isLoaded, setIsLoaded] = useState<boolean>(() => Boolean(thumbnailCache.get(assetId)));
  const [hasError, setHasError] = useState<boolean>(false);
  const imageFitClass = objectFit === 'contain' ? 'object-contain' : 'object-cover';

  useEffect(() => {
    setHasError(false);
    // 1. If already cached in memory, use it immediately
    const cached = thumbnailCache.get(assetId);
    if (cached) {
      setUrl(cached);
      setIsLoaded(true);
      return;
    }

    // 2. Clear old URL and mark not loaded for new assetId
    setUrl('');
    setIsLoaded(false);
    let cancelled = false;
    const image = imageRef.current;
    if (!image) return;

    const load = () => {
      bridge
        .getThumbnail(assetId)
        .then((thumbnailUrl: string) => {
          if (cancelled) return;
          if (thumbnailUrl) {
            thumbnailCache.set(assetId, thumbnailUrl);
            setUrl(thumbnailUrl);
          } else {
            setHasError(true);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            console.error(`Could not load thumbnail for ${assetId}`, error);
            setHasError(true);
          }
        });
    };

    if (typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        cancelled = true;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '240px' },
    );

    observer.observe(image);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [assetId]);

  return (
    <div ref={imageRef} className={`relative overflow-hidden ${className}`} style={style}>
      {url && !hasError && (
        <img
          key={assetId}
          src={url}
          alt={alt}
          className={`h-full w-full transition-opacity duration-200 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${imageFitClass}`}
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setHasError(true);
            setIsLoaded(false);
          }}
        />
      )}

      {!isLoaded && !hasError && (
        <div className="absolute inset-0 z-0">
          <ThumbnailSkeleton />
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 z-0 flex items-center justify-center">
          {fallback || (
            <div className="text-obsidian-textMut text-[11px] p-2 text-center break-all font-mono">
              {alt}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
