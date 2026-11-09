import React, { useEffect, useRef } from 'react';
import { Collection } from '../../types';
import { 
  SlidersHorizontal, 
  Flag, 
  Trash2, 
  FolderPlus, 
  X
} from 'lucide-react';

interface GalleryContextMenuProps {
  x: number;
  y: number;
  selectedAssetIds: string[];
  collections: Collection[];
  onClose: () => void;
  onOpenInLightbox: (id: string) => void;
  onSetRating: (rating: number) => void;
  onSetFlag: (flag: string) => void;
  onAddToCollection: (collectionId: string) => void;
  isTrashView: boolean;
  onRestore: () => void;
  onDelete: () => void;
}

export const GalleryContextMenu: React.FC<GalleryContextMenuProps> = ({
  x,
  y,
  selectedAssetIds,
  collections,
  onClose,
  onOpenInLightbox,
  onSetRating,
  onSetFlag,
  onAddToCollection,
  isTrashView,
  onRestore,
  onDelete,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Adjust menu position so it stays on screen
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 340);

  const count = selectedAssetIds.length;

  return (
    <div
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-50 w-52 bg-obsidian-card border border-obsidian-border rounded-lg shadow-2xl py-1 text-xs text-obsidian-textPri"
    >
      {/* ── Open in Lightbox ── */}
      {!isTrashView && count === 1 && (
        <button
          onClick={() => {
            onOpenInLightbox(selectedAssetIds[0]);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-obsidian-hover hover:text-white text-left font-medium text-obsidian-accent"
        >
          <SlidersHorizontal size={14} />
          <span>Open in Lightbox</span>
          <span className="ml-auto text-[10px] text-obsidian-textMut">Enter</span>
        </button>
      )}

      {!isTrashView && count > 1 && (
        <button
          onClick={() => {
            onOpenInLightbox(selectedAssetIds[0]);
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-obsidian-hover hover:text-white text-left font-medium text-obsidian-accent"
        >
          <SlidersHorizontal size={14} />
          <span>Open First in Lightbox</span>
        </button>
      )}

      {!isTrashView && <div className="h-[1px] bg-obsidian-border my-1" />}

      {/* ── Rating Submenu ── */}
      {!isTrashView && (
        <>
      <div className="px-3 py-1 text-[10px] font-bold text-obsidian-textMut tracking-wider">
        SET RATING ({count})
      </div>
      <div className="flex px-2 py-1 gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => {
              onSetRating(star);
              onClose();
            }}
            title={`Rate ★${star}`}
            className="flex-1 py-1 rounded bg-obsidian-elevated hover:bg-obsidian-accent hover:text-white text-center font-bold text-[11px] border border-obsidian-border"
          >
            ★{star}
          </button>
        ))}
        <button
          onClick={() => {
            onSetRating(0);
            onClose();
          }}
          title="Clear Rating"
          className="px-1.5 py-1 rounded bg-obsidian-elevated hover:bg-obsidian-hover text-obsidian-textMut hover:text-white text-center text-[10px] border border-obsidian-border"
        >
          ✕
        </button>
      </div>

      <div className="h-[1px] bg-obsidian-border my-1" />

      {/* ── Flag Options ── */}
      <div className="px-3 py-1 text-[10px] font-bold text-obsidian-textMut tracking-wider">
        SET FLAG ({count})
      </div>
      <button
        onClick={() => {
          onSetFlag('flagged');
          onClose();
        }}
        className="w-full px-3 py-1 flex items-center gap-2 hover:bg-obsidian-hover hover:text-white text-left text-blue-400"
      >
        <Flag size={13} />
        <span>Pick (Flagged)</span>
        <span className="ml-auto text-[10px] text-obsidian-textMut">P</span>
      </button>
      <button
        onClick={() => {
          onSetFlag('unflagged');
          onClose();
        }}
        className="w-full px-3 py-1 flex items-center gap-2 hover:bg-obsidian-hover hover:text-white text-left text-obsidian-textSec"
      >
        <span>—</span>
        <span>Unflag</span>
        <span className="ml-auto text-[10px] text-obsidian-textMut">U</span>
      </button>
      <button
        onClick={() => {
          onSetFlag('rejected');
          onClose();
        }}
        className="w-full px-3 py-1 flex items-center gap-2 hover:bg-obsidian-hover hover:text-white text-left text-red-400"
      >
        <X size={13} />
        <span>Reject</span>
        <span className="ml-auto text-[10px] text-obsidian-textMut">X</span>
      </button>

      {/* ── Add to Collection ── */}
      {collections.some((collection) => collection.collection_type !== 'smart') && (
        <>
          <div className="h-[1px] bg-obsidian-border my-1" />
          <div className="px-3 py-1 text-[10px] font-bold text-obsidian-textMut tracking-wider">
            ADD TO COLLECTION
          </div>
          {collections
            .filter((collection) => collection.collection_type !== 'smart')
            .slice(0, 5)
            .map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onAddToCollection(c.id);
                onClose();
              }}
              className="w-full px-3 py-1 flex items-center gap-2 hover:bg-obsidian-hover hover:text-white text-left truncate text-obsidian-textSec"
            >
              <FolderPlus size={13} className="text-obsidian-textMut shrink-0" />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </>
      )}
        </>
      )}

      <div className="h-[1px] bg-obsidian-border my-1" />

      {isTrashView && (
        <button
          onClick={() => {
            onRestore();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-obsidian-hover hover:text-white text-left font-medium text-obsidian-accent"
        >
          <span>Restore ({count})</span>
        </button>
      )}

      {/* ── Delete ── */}
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-red-900/40 text-red-400 hover:text-red-300 text-left font-medium"
      >
        <Trash2 size={13} />
        <span>{isTrashView ? `Permanently Delete (${count})` : `Move to Recently Deleted (${count})`}</span>
        <span className="ml-auto text-[10px] text-red-400/70">Del</span>
      </button>
    </div>
  );
};
