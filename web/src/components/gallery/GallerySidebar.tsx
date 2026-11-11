import React, { useState } from 'react';
import { Collection, SmartCollectionRules } from '../../types';
import { bridge } from '../../bridge';
import { GallerySidebarFolderSkeleton } from './GallerySkeleton';
import { 
  Images, 
  Folder, 
  FolderOpen,
  FolderPlus,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2, 
  Flag, 
  Upload, 
  Plus, 
  Check,
  PanelLeftClose
} from 'lucide-react';

interface GallerySidebarProps {
  collections: Collection[];
  activeCollectionId: string | null;
  onSelectCollection: (id: string | null) => void;
  ratingFilter: number;
  onRatingFilterChange: (rating: number) => void;
  flagFilter: string;
  onFlagFilterChange: (flag: string) => void;
  totalAssetsCount: number;
  trashCount: number;
  isTrashView: boolean;
  onSelectTrash: () => void;
  sourceFolders: Array<{ source_folder: string; asset_count: number }>;
  activeSourceFolder: string | null;
  onSelectSourceFolder: (sourceFolder: string | null) => void;
  remainingSourceFolderCount: number;
  sourceFoldersLoading: boolean;
  sourceFoldersError: string | null;
  onLoadMoreSourceFolders: () => void;
  width?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const GallerySidebar: React.FC<GallerySidebarProps> = ({
  collections,
  activeCollectionId,
  onSelectCollection,
  ratingFilter,
  onRatingFilterChange,
  flagFilter,
  onFlagFilterChange,
  totalAssetsCount,
  trashCount,
  isTrashView,
  onSelectTrash,
  sourceFolders,
  activeSourceFolder,
  onSelectSourceFolder,
  remainingSourceFolderCount,
  sourceFoldersLoading,
  sourceFoldersError,
  onLoadMoreSourceFolders,
  width = 240,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionType, setNewCollectionType] = useState<'manual' | 'smart'>('manual');
  const [newCollectionParentId, setNewCollectionParentId] = useState<string | null>(null);
  const [smartSearch, setSmartSearch] = useState('');
  const [smartMinimumRating, setSmartMinimumRating] = useState(0);
  const [smartFlag, setSmartFlag] = useState<SmartCollectionRules['flag']>('all');
  const [smartSourceFolder, setSmartSourceFolder] = useState('');
  const [expandedCollectionIds, setExpandedCollectionIds] = useState<Set<string>>(
    () => new Set(),
  );

  const beginCreateCollection = (parentId: string | null) => {
    setCollectionError(null);
    setEditingCollectionId(null);
    setNewCollectionName('');
    setNewCollectionType('manual');
    setNewCollectionParentId(parentId);
    setSmartSearch('');
    setSmartMinimumRating(0);
    setSmartFlag('all');
    setSmartSourceFolder('');
    setIsCreatingCollection(true);
    if (parentId) {
      setExpandedCollectionIds((current) => new Set(current).add(parentId));
    }
  };

  const beginEditSmartCollection = (collection: Collection) => {
    const rules = collection.rules;
    if (collection.collection_type !== 'smart' || !rules) return;
    setCollectionError(null);
    setEditingCollectionId(collection.id);
    setNewCollectionName(collection.name);
    setNewCollectionType('smart');
    setNewCollectionParentId(collection.parent_id ?? null);
    setSmartSearch(rules.search);
    setSmartMinimumRating(rules.minimum_rating);
    setSmartFlag(rules.flag);
    setSmartSourceFolder(rules.source_folder ?? '');
    setIsCreatingCollection(true);
  };

  const handleCreateCollection = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newCollectionName.trim();
    if (!name) {
      setCollectionError('Enter a collection name.');
      return;
    }
    try {
      if (newCollectionType === 'smart') {
        const rules: SmartCollectionRules = {
          search: smartSearch.trim(),
          minimum_rating: smartMinimumRating,
          flag: smartFlag,
          source_folder: smartSourceFolder.trim() || null,
        };
        if (editingCollectionId) {
          await bridge.updateSmartCollection(editingCollectionId, name, rules);
        } else {
          await bridge.createSmartCollection(name, rules, newCollectionParentId);
        }
      } else {
        await bridge.createCollection(name, newCollectionParentId);
      }
      setNewCollectionName('');
      setEditingCollectionId(null);
      setCollectionError(null);
      setIsCreatingCollection(false);
    } catch (error) {
      setCollectionError(
        error instanceof Error ? error.message : 'Could not save this collection.',
      );
    }
  };

  const childrenByParent = new Map<string | null, Collection[]>();
  for (const collection of collections) {
    const parentId = collection.parent_id ?? null;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(collection);
    childrenByParent.set(parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name));
  }

  const collectionPath = (collection: Collection) => {
    const names = [collection.name];
    const visited = new Set([collection.id]);
    let parentId = collection.parent_id;
    while (parentId) {
      if (visited.has(parentId)) break;
      visited.add(parentId);
      const parent = collections.find((candidate) => candidate.id === parentId);
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parent_id;
    }
    return names.join(' / ');
  };

  const toggleCollectionExpanded = (collectionId: string) => {
    setExpandedCollectionIds((current) => {
      const next = new Set(current);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  };

  const renderCollectionRows = (
    parentId: string | null,
    depth = 0,
  ): React.ReactNode[] => (childrenByParent.get(parentId) ?? []).flatMap((collection) => {
    const isSelected = activeCollectionId === collection.id;
    const children = childrenByParent.get(collection.id) ?? [];
    const isExpanded = expandedCollectionIds.has(collection.id);
    const count = collection.asset_count ?? collection.asset_ids?.length ?? 0;
    const row = (
      <div
        key={collection.id}
        className={`group flex items-center justify-between gap-1 py-1.5 pr-1 rounded-md transition-colors ${
          isSelected
            ? 'bg-obsidian-active text-obsidian-accent font-semibold'
            : 'text-obsidian-textSec hover:bg-obsidian-elevated hover:text-white'
        }`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggleCollectionExpanded(collection.id)}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${collection.name}`}
              className="shrink-0 p-0.5 text-obsidian-textMut hover:text-white"
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="w-[16px] shrink-0" />
          )}
          <button
            type="button"
            onClick={() => onSelectCollection(collection.id)}
            title={collectionPath(collection)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {collection.collection_type === 'smart' ? (
              <Sparkles
                size={14}
                className={isSelected ? 'text-obsidian-accent' : 'text-obsidian-textMut'}
              />
            ) : (
              <Folder
                size={14}
                className={isSelected ? 'text-obsidian-accent' : 'text-obsidian-textMut'}
              />
            )}
            <span className="truncate">{collection.name}</span>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-[10px] bg-obsidian-elevated px-1.5 py-0.5 rounded text-obsidian-textMut">
            {count}
          </span>
          <button
            type="button"
            onClick={() => beginEditSmartCollection(collection)}
            title="Edit Smart Collection"
            aria-label={`Edit ${collection.name}`}
            className={`hover:text-obsidian-accent p-0.5 transition-opacity ${
              collection.collection_type === 'smart'
                ? 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                : 'hidden'
            }`}
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={() => beginCreateCollection(collection.id)}
            title={`Create a child collection in ${collection.name}`}
            aria-label={`Create a child collection in ${collection.name}`}
            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-obsidian-accent p-0.5 transition-opacity"
          >
            <FolderPlus size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              const childCount = children.length;
              const detail = childCount
                ? ` Its ${childCount} direct child collection(s) will be moved to the root.`
                : '';
              if (confirm(`Delete collection "${collection.name}"?${detail}`)) {
                bridge.deleteCollection(collection.id);
                if (isSelected) onSelectCollection(null);
              }
            }}
            title="Delete Collection"
            className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 transition-opacity"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    );
    return [
      row,
      ...(isExpanded ? renderCollectionRows(collection.id, depth + 1) : []),
    ];
  });

  if (isCollapsed) return null;

  return (
    <div
      style={{ width: `${width}px` }}
      className="bg-obsidian-card border-r border-obsidian-border flex flex-col h-full select-none text-xs flex-shrink-0 transition-[width] duration-75 overflow-hidden"
    >
      {/* ── Collections Header ── */}
      <div className="p-3 border-b border-obsidian-border flex items-center justify-between">
        <span className="font-bold text-[11px] tracking-wider text-obsidian-textMut">COLLECTIONS</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => beginCreateCollection(null)}
            title="Create New Collection"
            aria-label="Create New Collection"
            className="p-1 rounded bg-obsidian-elevated hover:bg-obsidian-hover hover:text-white text-obsidian-textSec border border-obsidian-border transition-colors"
          >
            <Plus size={13} />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Collapse Collections Sidebar"
              className="p-1 rounded hover:bg-obsidian-hover hover:text-white text-obsidian-textMut transition-colors"
            >
              <PanelLeftClose size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Create Collection Input Form ── */}
      {isCreatingCollection && (
        <form
          onSubmit={handleCreateCollection}
          className="p-2 border-b border-obsidian-border bg-obsidian-deep space-y-2"
        >
          <input
            type="text"
            autoFocus
            required
            maxLength={128}
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="Collection name..."
            className="w-full bg-obsidian-elevated text-white px-2 py-1 rounded text-xs border border-obsidian-accent outline-none"
          />
          {editingCollectionId ? (
            <p className="text-[10px] text-obsidian-textMut">
              Editing smart collection rules
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              <select
                aria-label="Collection type"
                value={newCollectionType}
                onChange={(event) => setNewCollectionType(event.target.value as 'manual' | 'smart')}
                className="min-w-0 bg-obsidian-elevated text-obsidian-textSec px-2 py-1 rounded border border-obsidian-border"
              >
                <option value="manual">Manual</option>
                <option value="smart">Smart</option>
              </select>
              <select
                aria-label="Parent collection"
                value={newCollectionParentId ?? ''}
                onChange={(event) => setNewCollectionParentId(event.target.value || null)}
                className="min-w-0 bg-obsidian-elevated text-obsidian-textSec px-2 py-1 rounded border border-obsidian-border"
              >
                <option value="">Root</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collectionPath(collection)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {newCollectionType === 'smart' && (
            <div className="space-y-1.5 border-t border-obsidian-border pt-2">
              <input
                type="search"
                maxLength={256}
                value={smartSearch}
                onChange={(event) => setSmartSearch(event.target.value)}
                placeholder="Text contains..."
                aria-label="Smart collection text search"
                className="w-full bg-obsidian-elevated text-white px-2 py-1 rounded border border-obsidian-border"
              />
              <div className="grid grid-cols-2 gap-1">
                <select
                  aria-label="Minimum rating"
                  value={smartMinimumRating}
                  onChange={(event) => setSmartMinimumRating(Number(event.target.value))}
                  className="min-w-0 bg-obsidian-elevated text-obsidian-textSec px-2 py-1 rounded border border-obsidian-border"
                >
                  {[0, 1, 2, 3, 4, 5].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating === 0 ? 'Any rating' : `${rating}+ stars`}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Flag filter"
                  value={smartFlag}
                  onChange={(event) =>
                    setSmartFlag(event.target.value as SmartCollectionRules['flag'])
                  }
                  className="min-w-0 bg-obsidian-elevated text-obsidian-textSec px-2 py-1 rounded border border-obsidian-border"
                >
                  <option value="all">Any flag</option>
                  <option value="flagged">Picked</option>
                  <option value="unflagged">Unflagged</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <input
                type="text"
                maxLength={4096}
                value={smartSourceFolder}
                onChange={(event) => setSmartSourceFolder(event.target.value)}
                placeholder="Exact source folder (optional)"
                aria-label="Exact source folder"
                className="w-full bg-obsidian-elevated text-white px-2 py-1 rounded border border-obsidian-border"
              />
              <p className="text-[10px] leading-4 text-obsidian-textMut">
                All selected rules must match. Membership updates from catalog data.
              </p>
            </div>
          )}
          {collectionError && (
            <p role="alert" className="text-[10px] text-red-300">
              {collectionError}
            </p>
          )}
          <div className="flex justify-end gap-1">
            <button
              type="submit"
              className="px-2 py-1 bg-obsidian-accent text-white rounded text-xs font-semibold hover:bg-blue-600"
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingCollection(false);
                setEditingCollectionId(null);
              }}
              className="px-2 py-1 bg-obsidian-elevated text-obsidian-textSec rounded text-xs hover:text-white"
            >
              ✕
            </button>
          </div>
        </form>
      )}

      {/* ── Collections List ── */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* All Photographs */}
        <button
          onClick={() => onSelectCollection(null)}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left ${
            !isTrashView && activeCollectionId === null && activeSourceFolder === null
              ? 'bg-obsidian-active text-obsidian-accent font-semibold'
              : 'text-obsidian-textSec hover:bg-obsidian-elevated hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <Images
              size={14}
              className={
                !isTrashView && activeCollectionId === null && activeSourceFolder === null
                  ? 'text-obsidian-accent'
                  : 'text-obsidian-textMut'
              }
            />
            <span className="truncate">All Photographs</span>
          </div>
          <span className="text-[10px] bg-obsidian-elevated px-1.5 py-0.5 rounded text-obsidian-textMut">
            {totalAssetsCount}
          </span>
        </button>

        <button
          type="button"
          onClick={onSelectTrash}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left ${
            isTrashView
              ? 'bg-obsidian-active text-obsidian-accent font-semibold'
              : 'text-obsidian-textSec hover:bg-obsidian-elevated hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <Trash2 size={14} className={isTrashView ? 'text-obsidian-accent' : 'text-obsidian-textMut'} />
            <span className="truncate">Recently Deleted</span>
          </div>
          <span className="text-[10px] bg-obsidian-elevated px-1.5 py-0.5 rounded text-obsidian-textMut">
            {trashCount}
          </span>
        </button>

        {/* User Collections */}
        {renderCollectionRows(null)}

        <div className="pt-3 mt-2 border-t border-obsidian-border/70">
          <div className="px-2.5 pb-1 text-[10px] font-bold tracking-wider text-obsidian-textMut">
            SOURCE FOLDERS
          </div>
          {sourceFolders.map((folder) => {
            const isSelected = activeSourceFolder === folder.source_folder;
            return (
              <button
                type="button"
                key={folder.source_folder}
                onClick={() => onSelectSourceFolder(folder.source_folder)}
                title={folder.source_folder}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left ${
                  isSelected
                    ? 'bg-obsidian-active text-obsidian-accent font-semibold'
                    : 'text-obsidian-textSec hover:bg-obsidian-elevated hover:text-white'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FolderOpen
                    size={14}
                    className={isSelected ? 'text-obsidian-accent' : 'text-obsidian-textMut'}
                  />
                  <span className="truncate">{folder.source_folder}</span>
                </span>
                <span className="shrink-0 text-[10px] bg-obsidian-elevated px-1.5 py-0.5 rounded text-obsidian-textMut">
                  {folder.asset_count}
                </span>
              </button>
            );
          })}
          {sourceFoldersError && (
            <p role="alert" className="px-2.5 py-1 text-[10px] text-red-300">
              Could not load folders: {sourceFoldersError}
            </p>
          )}
          {(remainingSourceFolderCount > 0 || sourceFoldersError) && (
            <button
              type="button"
              onClick={onLoadMoreSourceFolders}
              disabled={sourceFoldersLoading}
              className="w-full px-2.5 py-1.5 text-left text-[10px] text-obsidian-accent hover:underline disabled:opacity-60"
            >
              {sourceFoldersLoading
                ? 'Loading folders…'
                : sourceFoldersError && sourceFolders.length === 0
                  ? 'Retry loading folders'
                  : `Load ${Math.min(100, remainingSourceFolderCount)} more folders`}
            </button>
          )}
          {sourceFoldersLoading && sourceFolders.length === 0 && (
            <GallerySidebarFolderSkeleton count={3} />
          )}
          {!sourceFoldersLoading && sourceFolders.length === 0 && !sourceFoldersError && (
            <p className="px-2.5 py-1 text-[10px] text-obsidian-textMut">
              No source folders in this catalog.
            </p>
          )}
        </div>
      </div>

      {/* ── Filter Sections ── */}
      <div className="p-3 border-t border-obsidian-border space-y-3 bg-obsidian-deep/40">
        {/* Rating Filter */}
        <div>
          <div className="flex items-center justify-between mb-1 text-[10px] font-bold text-obsidian-textMut tracking-wider">
            <span>RATING FILTER</span>
            {ratingFilter > 0 && (
              <button
                onClick={() => onRatingFilterChange(0)}
                className="text-[9px] text-obsidian-accent hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5].map((stars) => (
              <button
                key={stars}
                onClick={() => onRatingFilterChange(stars === ratingFilter ? 0 : stars)}
                className={`flex-1 py-1 rounded text-[11px] font-medium transition-colors border ${
                  ratingFilter === stars
                    ? 'bg-obsidian-accent text-white border-obsidian-accent'
                    : 'bg-obsidian-elevated text-obsidian-textSec border-obsidian-border hover:bg-obsidian-hover hover:text-white'
                }`}
              >
                {stars === 0 ? 'All' : `★${stars}`}
              </button>
            ))}
          </div>
        </div>

        {/* Flag Filter */}
        <div>
          <div className="flex items-center justify-between mb-1 text-[10px] font-bold text-obsidian-textMut tracking-wider">
            <span>FLAG FILTER</span>
            {flagFilter !== 'all' && (
              <button
                onClick={() => onFlagFilterChange('all')}
                className="text-[9px] text-obsidian-accent hover:underline"
              >
                Reset
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <button
              onClick={() => onFlagFilterChange('all')}
              className={`py-1 px-1.5 rounded border text-left truncate transition-colors ${
                flagFilter === 'all'
                  ? 'bg-obsidian-accent text-white border-obsidian-accent'
                  : 'bg-obsidian-elevated text-obsidian-textSec border-obsidian-border hover:bg-obsidian-hover'
              }`}
            >
              All Flags
            </button>
            <button
              onClick={() => onFlagFilterChange('flagged')}
              className={`py-1 px-1.5 rounded border text-left truncate transition-colors flex items-center gap-1.5 ${
                flagFilter === 'flagged'
                  ? 'bg-blue-600 text-white border-blue-500'
                  : 'bg-obsidian-elevated text-obsidian-textSec border-obsidian-border hover:bg-obsidian-hover'
              }`}
            >
              <Flag size={11} className="text-blue-400" />
              <span>Picks Only</span>
            </button>
            <button
              onClick={() => onFlagFilterChange('unflagged')}
              className={`py-1 px-1.5 rounded border text-left truncate transition-colors ${
                flagFilter === 'unflagged'
                  ? 'bg-obsidian-accent text-white border-obsidian-accent'
                  : 'bg-obsidian-elevated text-obsidian-textSec border-obsidian-border hover:bg-obsidian-hover'
              }`}
            >
              Unflagged
            </button>
            <button
              onClick={() => onFlagFilterChange('rejected')}
              className={`py-1 px-1.5 rounded border text-left truncate transition-colors flex items-center gap-1.5 ${
                flagFilter === 'rejected'
                  ? 'bg-red-700 text-white border-red-600'
                  : 'bg-obsidian-elevated text-obsidian-textSec border-obsidian-border hover:bg-obsidian-hover'
              }`}
            >
              <span className="text-red-400 font-bold">✕</span>
              <span>Rejected</span>
            </button>
          </div>
        </div>

        {/* ── Import Actions ── */}
        <div className="pt-2 border-t border-obsidian-border space-y-1.5">
          <button
            onClick={() => bridge.importFiles()}
            className="w-full py-1.5 px-3 bg-obsidian-accent hover:bg-blue-600 text-white rounded font-medium flex items-center justify-center gap-2 shadow-sm transition-colors text-xs"
          >
            <Upload size={13} />
            <span>Import Photos…</span>
          </button>
          <button
            onClick={() => bridge.importFolder()}
            className="w-full py-1.5 px-3 bg-obsidian-elevated hover:bg-obsidian-hover text-obsidian-textSec hover:text-white rounded font-medium flex items-center justify-center gap-2 border border-obsidian-border transition-colors text-xs"
          >
            <FolderPlus size={13} />
            <span>Import Folder…</span>
          </button>
        </div>
      </div>
    </div>
  );
};
