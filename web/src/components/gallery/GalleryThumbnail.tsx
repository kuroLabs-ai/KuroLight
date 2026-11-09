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
const thumbnailCache = new Map<string, string>();

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
  const imageFitClass = objectFit === 'contain' ? 'object-contain' : 'object-cover';

  useEffect(() => {
    // 1. If already cached in memory, use it immediately
    const cached = thumbnailCache.get(assetId);
    if (cached) {
      setUrl(cached);
      return;
    }

    // 2. Clear old URL and mark not loaded for new assetId
    setUrl('');
    let cancelled = false;
    const image = imageRef.current;
    if (!image) return;

    const load = () => {
      bridge.getThumbnail(assetId)
        .then((thumbnailUrl: string) => {
          if (cancelled) return;
          if (thumbnailUrl) {
            thumbnailCache.set(assetId, thumbnailUrl);
            setUrl(thumbnailUrl);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            console.error(`Could not load thumbnail for ${assetId}`, error);
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
    <div ref={imageRef} className={className} style={style}>
      {url ? (
        <img
          key={assetId}
          src={url}
          alt={alt}
          className={`h-full w-full ${imageFitClass}`}
          loading="lazy"
        />
      ) : (
        fallback || <div className="h-full w-full bg-obsidian-deep/50 flex items-center justify-center text-obsidian-textMut text-[10px]" />
      )}
    </div>
  );
};
