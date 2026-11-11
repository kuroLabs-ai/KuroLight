import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ImageAsset, Collection } from '../../types';
import { AssetPageFilters, SourceFolder, bridge } from '../../bridge';
import { GallerySidebar } from './GallerySidebar';
import { GalleryGrid } from './GalleryGrid';
import { GalleryTable } from './GalleryTable';
import { GalleryInspector } from './GalleryInspector';
import { GalleryContextMenu } from './GalleryContextMenu';
import { GalleryGridSkeleton, GalleryTableSkeleton } from './GallerySkeleton';
import {
  matchesSmartCollectionRules,
  sourceFolderForPath,
} from '../../utils/smartCollections';
import { CompareWorkspace } from './CompareWorkspace';
import { ResizeHandle } from '../common/ResizeHandle';
import { usePanelResize } from '../../hooks/usePanelResize';
import { 
  Search, 
  LayoutGrid, 
  List, 
  Upload, 
  X,
  ArrowUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
  Columns,
  Eye,
  Trash2,
} from 'lucide-react';

const GALLERY_BATCH_SIZE = 200;
const SOURCE_FOLDER_BATCH_SIZE = 100;

function compareAsciiInsensitive(left: string, right: string): number {
  const foldAscii = (value: string) => value.replace(/[A-Z]/g, (character) =>
    character.toLowerCase()
  );
  const foldedLeft = foldAscii(left);
  const foldedRight = foldAscii(right);
  if (foldedLeft < foldedRight) return -1;
  if (foldedLeft > foldedRight) return 1;
  return 0;
}

interface GalleryWorkspaceProps {
  assets: ImageAsset[];
  totalAssetCount: number;
  trashCount: number;
  activeAsset?: ImageAsset | null;
  libraryLoading: { loading: boolean; message: string; cancellable: boolean };
  onCancelImport: () => void;
  collections: Collection[];
  activeCollectionId: string | null;
  onActiveCollectionChange: (id: string | null) => void;
  onOpenInLightbox: (id: string) => void;
  onSelectedAssetChange?: (id: string | null) => void;
}

export const GalleryWorkspace: React.FC<GalleryWorkspaceProps> = ({
  assets,
  totalAssetCount,
  trashCount,
  activeAsset,
  libraryLoading,
  onCancelImport,
  collections,
  activeCollectionId,
  onActiveCollectionChange,
  onOpenInLightbox,
  onSelectedAssetChange,
}) => {
  // ── Panel Resize States ──
  const {
    size: sidebarWidth,
    isCollapsed: isSidebarCollapsed,
    handleResize: handleSidebarResize,
    resetSize: resetSidebarWidth,
    toggleCollapse: toggleSidebarCollapse,
  } = usePanelResize({
    initialSize: 240,
    minSize: 180,
    maxSize: 460,
    storageKey: 'kurolight_gallery_sidebar_width',
  });

  const {
    size: inspectorWidth,
    isCollapsed: isInspectorCollapsed,
    handleResize: handleInspectorResize,
    resetSize: resetInspectorWidth,
    toggleCollapse: toggleInspectorCollapse,
  } = usePanelResize({
    initialSize: 288,
    minSize: 220,
    maxSize: 520,
    storageKey: 'kurolight_gallery_inspector_width',
  });

  // ── Filter & Search State ──
  const [ratingFilter, setRatingFilter] = useState<number>(0);
  const [flagFilter, setFlagFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSourceFolder, setActiveSourceFolder] = useState<string | null>(null);
  const [isTrashView, setIsTrashView] = useState(false);
  const [sortMode, setSortMode] = useState<'name' | 'date' | 'rating' | 'size'>('name');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [visibleAssetCount, setVisibleAssetCount] = useState(GALLERY_BATCH_SIZE);
  const [pagedAssets, setPagedAssets] = useState<ImageAsset[] | null>(null);
  const [pagedAssetTotal, setPagedAssetTotal] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const pageRequestId = useRef(0);
  const [pageRefreshKey, setPageRefreshKey] = useState(0);
  const [nativeFilteredAssetIds, setNativeFilteredAssetIds] = useState<string[]>([]);
  const [assetIdsError, setAssetIdsError] = useState<string | null>(null);
  const [nativeSourceFolders, setNativeSourceFolders] = useState<SourceFolder[]>([]);
  const [sourceFolderTotal, setSourceFolderTotal] = useState(0);
  const [sourceFoldersLoading, setSourceFoldersLoading] = useState(false);
  const [sourceFoldersError, setSourceFoldersError] = useState<string | null>(null);
  const sourceFolderRequestId = useRef(0);
  const resetVisibleAssets = () => setVisibleAssetCount(GALLERY_BATCH_SIZE);

  // ── Selection State ──
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [comparisonAssetIds, setComparisonAssetIds] = useState<string[]>([]);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [comparisonView, setComparisonView] = useState<'compare' | 'survey'>('compare');

  // ── Context Menu State ──
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
  } | null>(null);

  // ── Filtered & Sorted Assets ──
  const filteredAssets = useMemo(() => {
    let result = assets.filter((asset) => Boolean(asset.deleted_at) === isTrashView);

    // 1. Collection filter
    if (activeCollectionId) {
      const activeColl = collections.find((c) => c.id === activeCollectionId);
      if (activeColl?.collection_type === 'smart' && activeColl.rules) {
        result = result.filter((asset) =>
          matchesSmartCollectionRules(asset, activeColl.rules)
        );
      } else if (activeColl && activeColl.asset_ids) {
        const idSet = new Set(activeColl.asset_ids);
        result = result.filter((a) => idSet.has(a.id));
      }
    }

    if (activeSourceFolder) {
      result = result.filter(
        (asset) => sourceFolderForPath(asset.source_path) === activeSourceFolder,
      );
    }

    // 2. Rating filter (star rating >= filter)
    if (ratingFilter > 0) {
      result = result.filter((a) => a.rating >= ratingFilter);
    }

    // 3. Flag filter
    if (flagFilter === 'flagged') {
      result = result.filter((a) => a.flag === 'flagged');
    } else if (flagFilter === 'unflagged') {
      result = result.filter((a) => !a.flag || a.flag === 'unflagged');
    } else if (flagFilter === 'rejected') {
      result = result.filter((a) => a.flag === 'rejected');
    }

    // 4. Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((a) => {
        const name = (a.file_name || '').toLowerCase();
        const cam = (a.camera_model || '').toLowerCase();
        const lens = (a.lens_model || '').toLowerCase();
        const overrides = a.metadata_overrides;
        const searchableMetadata = [
          overrides?.title,
          overrides?.description,
          overrides?.copyright,
          ...(overrides?.keywords ?? []),
        ];
        return (
          name.includes(q) ||
          cam.includes(q) ||
          lens.includes(q) ||
          searchableMetadata.some((value) => value?.toLowerCase().includes(q))
        );
      });
    }

    // 5. Sorting
    result.sort((a, b) => {
      let comparison = 0;
      if (sortMode === 'name') {
        comparison = compareAsciiInsensitive(a.file_name || '', b.file_name || '');
      } else if (sortMode === 'date') {
        comparison = (b.date_taken || '').localeCompare(a.date_taken || '');
      } else if (sortMode === 'rating') {
        comparison = (b.rating || 0) - (a.rating || 0);
      } else if (sortMode === 'size') {
        comparison = (b.file_size || 0) - (a.file_size || 0);
      }
      if (comparison !== 0) return comparison;
      if (sortMode !== 'name') {
        comparison = compareAsciiInsensitive(a.file_name || '', b.file_name || '');
        if (comparison !== 0) return comparison;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return result;
  }, [
    assets,
    collections,
    activeCollectionId,
    activeSourceFolder,
    ratingFilter,
    flagFilter,
    searchQuery,
    sortMode,
    isTrashView,
  ]);
  const pageFilters = useMemo<AssetPageFilters>(() => ({
    collection_id: activeCollectionId,
    source_folder: activeSourceFolder,
    minimum_rating: ratingFilter,
    flag: flagFilter as AssetPageFilters['flag'],
    search: searchQuery,
    sort_by: sortMode === 'name'
      ? 'file_name'
      : sortMode === 'date'
        ? 'date_taken'
        : sortMode === 'rating'
          ? 'rating'
          : 'file_size',
    ascending: sortMode === 'name',
    trash_only: isTrashView,
  }), [activeCollectionId, activeSourceFolder, ratingFilter, flagFilter, searchQuery, sortMode, isTrashView]);
  const usesNativePages = bridge.hasNativeApi;
  const sourceFolders = useMemo(() => {
    if (usesNativePages) return nativeSourceFolders;
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const folder = sourceFolderForPath(asset.source_path);
      counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
    return Array.from(counts, ([source_folder, asset_count]) => ({
      source_folder,
      asset_count,
    })).sort((left, right) => left.source_folder.localeCompare(right.source_folder));
  }, [assets, nativeSourceFolders, usesNativePages]);
  const allFilteredAssetIds = usesNativePages
    ? nativeFilteredAssetIds
    : filteredAssets.map((asset) => asset.id);

  useEffect(() => {
    if (!usesNativePages) return;

    let cancelled = false;
    void bridge.getAssetIds(pageFilters)
      .then((ids) => {
        if (!cancelled) {
          setNativeFilteredAssetIds(ids);
          setAssetIdsError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAssetIdsError(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [usesNativePages, pageFilters]);

  useEffect(() => {
    if (!usesNativePages) return;
    let cancelled = false;
    const requestId = ++sourceFolderRequestId.current;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setSourceFoldersLoading(true);
      setSourceFoldersError(null);
      try {
        const page = await bridge.getSourceFolders(0, SOURCE_FOLDER_BATCH_SIZE);
        if (cancelled || sourceFolderRequestId.current !== requestId) return;
        setNativeSourceFolders(page.folders);
        setSourceFolderTotal(page.total);
      } catch (error) {
        if (!cancelled && sourceFolderRequestId.current === requestId) {
          setSourceFoldersError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled && sourceFolderRequestId.current === requestId) {
          setSourceFoldersLoading(false);
        }
      }
    });
    return () => {
      cancelled = true;
      if (sourceFolderRequestId.current === requestId) {
        sourceFolderRequestId.current += 1;
      }
    };
  }, [assets, usesNativePages]);

  const loadMoreSourceFolders = useCallback(async () => {
    if (
      !usesNativePages ||
      sourceFoldersLoading ||
      (!sourceFoldersError && nativeSourceFolders.length >= sourceFolderTotal)
    ) {
      return;
    }
    const requestId = sourceFolderRequestId.current;
    setSourceFoldersLoading(true);
    setSourceFoldersError(null);
    try {
      const page = await bridge.getSourceFolders(
        nativeSourceFolders.length,
        SOURCE_FOLDER_BATCH_SIZE,
      );
      if (sourceFolderRequestId.current !== requestId) return;
      setNativeSourceFolders((current) => [...current, ...page.folders]);
      setSourceFolderTotal(page.total);
      setSourceFoldersError(null);
    } catch (error) {
      if (sourceFolderRequestId.current === requestId) {
        setSourceFoldersError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (sourceFolderRequestId.current === requestId) setSourceFoldersLoading(false);
    }
  }, [
    nativeSourceFolders.length,
    sourceFolderTotal,
    sourceFoldersError,
    sourceFoldersLoading,
    usesNativePages,
  ]);

  useEffect(() => {
    if (!usesNativePages) return;

    const requestId = ++pageRequestId.current;
    let cancelled = false;
    const loadFirstPage = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setPagedAssets([]);
      setPagedAssetTotal(0);
      setPageError(null);
      setPageLoading(true);
      try {
        const page = await bridge.getAssetPage(0, GALLERY_BATCH_SIZE, pageFilters);
        if (cancelled || pageRequestId.current !== requestId) return;
        setPagedAssets(page.assets);
        setPagedAssetTotal(page.total);
      } catch (error) {
        if (cancelled || pageRequestId.current !== requestId) return;
        setPageError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled && pageRequestId.current === requestId) setPageLoading(false);
      }
    };
    void loadFirstPage();

    return () => {
      cancelled = true;
      pageRequestId.current += 1;
    };
  }, [assets, pageFilters, usesNativePages, pageRefreshKey]);

  const loadNextPage = useCallback(async () => {
    if (pagedAssets === null || pageLoading || pagedAssets.length >= pagedAssetTotal) return;
    const requestId = pageRequestId.current;
    setPageLoading(true);
    setPageError(null);
    try {
      const page = await bridge.getAssetPage(pagedAssets.length, GALLERY_BATCH_SIZE, pageFilters);
      if (pageRequestId.current !== requestId) return;
      setPagedAssets((current) => current ? [...current, ...page.assets] : page.assets);
      setPagedAssetTotal(page.total);
    } catch (error) {
      if (pageRequestId.current === requestId) {
        setPageError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (pageRequestId.current === requestId) setPageLoading(false);
    }
  }, [pagedAssets, pageLoading, pagedAssetTotal, pageFilters]);

  const galleryAssets = usesNativePages
    ? pagedAssets ?? []
    : filteredAssets.slice(0, visibleAssetCount);
  const galleryResultCount = usesNativePages ? pagedAssetTotal : filteredAssets.length;
  const remainingAssetCount = Math.max(0, galleryResultCount - galleryAssets.length);

  // Selected asset objects
  const selectedAssetsList = useMemo(() => {
    const availableAssets = new Map(
      [...assets, ...(usesNativePages ? pagedAssets ?? [] : [])]
        .map((asset) => [asset.id, asset] as const),
    );
    const selected = Array.from(selectedAssetIds)
      .map((assetId) => availableAssets.get(assetId))
      .filter((asset): asset is ImageAsset => asset !== undefined);
    if (
      selected.length === 1 &&
      activeAsset?.id === selected[0].id &&
      activeAsset.metadata
    ) {
      return [activeAsset];
    }
    return selected;
  }, [assets, pagedAssets, usesNativePages, selectedAssetIds, activeAsset]);
  const comparisonAssets = comparisonAssetIds
    .map((assetId) => selectedAssetsList.find((asset) => asset.id === assetId))
    .filter((asset): asset is ImageAsset => asset !== undefined);

  // ── Selection Handlers ──
  const handleSelectAsset = (asset: ImageAsset, isMulti: boolean, isRange: boolean) => {
    if (isRange && lastSelectedId) {
      const lastIndex = allFilteredAssetIds.indexOf(lastSelectedId);
      const currIndex = allFilteredAssetIds.indexOf(asset.id);
      if (lastIndex !== -1 && currIndex !== -1) {
        const start = Math.min(lastIndex, currIndex);
        const end = Math.max(lastIndex, currIndex);
        const rangeIds = new Set(selectedAssetIds);
        for (let i = start; i <= end; i++) {
          rangeIds.add(allFilteredAssetIds[i]);
        }
        setSelectedAssetIds(rangeIds);
        setLastSelectedId(asset.id);
        onSelectedAssetChange?.(asset.id);
        return;
      }
    }

    if (isMulti) {
      const next = new Set(selectedAssetIds);
      if (next.has(asset.id)) {
        next.delete(asset.id);
      } else {
        next.add(asset.id);
      }
      setSelectedAssetIds(next);
      setLastSelectedId(asset.id);
      onSelectedAssetChange?.(next.size > 0 ? asset.id : null);
    } else {
      setSelectedAssetIds(new Set([asset.id]));
      setLastSelectedId(asset.id);
      onSelectedAssetChange?.(asset.id);
    }
  };

  const handleSelectAll = useCallback(() => {
    if (assetIdsError) {
      setPageError(`Could not select all matching photos: ${assetIdsError}`);
      return;
    }
    const all = new Set(allFilteredAssetIds);
    setSelectedAssetIds(all);
    if (allFilteredAssetIds.length > 0) {
      onSelectedAssetChange?.(allFilteredAssetIds[0]);
    }
  }, [allFilteredAssetIds, assetIdsError, onSelectedAssetChange]);

  const handleClearSelection = useCallback(() => {
    setSelectedAssetIds(new Set());
    setLastSelectedId(null);
    onSelectedAssetChange?.(null);
  }, [onSelectedAssetChange]);

  const handleRemoveComparisonAsset = (assetId: string) => {
    const next = comparisonAssetIds.filter((id) => id !== assetId);
    setComparisonAssetIds(next);
    if (next.length < 2) setIsCompareMode(false);
  };

  // ── Batch Actions ──
  const handleSetRating = useCallback((rating: number) => {
    if (isTrashView) return;
    const ids = Array.from(selectedAssetIds);
    if (ids.length === 1) {
      bridge.setRating(ids[0], rating);
    } else if (ids.length > 1) {
      bridge.batchSetRating(ids, rating);
    }
  }, [isTrashView, selectedAssetIds]);

  const handleSetFlag = useCallback((flag: string) => {
    if (isTrashView) return;
    const ids = Array.from(selectedAssetIds);
    if (ids.length === 1) {
      bridge.setFlag(ids[0], flag);
    } else if (ids.length > 1) {
      bridge.batchSetFlag(ids, flag);
    }
  }, [isTrashView, selectedAssetIds]);

  const handleDeleteSelected = useCallback(() => {
    const ids = Array.from(selectedAssetIds);
    if (ids.length > 0) {
      const message = isTrashView
        ? `Permanently delete ${ids.length} photo(s) from the catalog? Their source files will not be changed.`
        : `Move ${ids.length} photo(s) to Recently Deleted?`;
      if (confirm(message)) {
        if (isTrashView) {
          bridge.permanentlyDeleteAssets(ids);
        } else {
          bridge.deleteAssets(ids);
        }
        handleClearSelection();
      }
    }
  }, [selectedAssetIds, handleClearSelection, isTrashView]);

  const handleRestoreSelected = useCallback(() => {
    const ids = Array.from(selectedAssetIds);
    if (ids.length > 0) {
      bridge.restoreAssets(ids);
      handleClearSelection();
    }
  }, [selectedAssetIds, handleClearSelection]);

  const handleSelectTrash = useCallback(() => {
    setIsTrashView(true);
    setActiveSourceFolder(null);
    onActiveCollectionChange(null);
    setIsCompareMode(false);
    setComparisonAssetIds([]);
    setContextMenu(null);
    handleClearSelection();
    setVisibleAssetCount(GALLERY_BATCH_SIZE);
  }, [handleClearSelection, onActiveCollectionChange]);

  const handleOpenInLightbox = useCallback((assetId: string) => {
    if (!isTrashView) onOpenInLightbox(assetId);
  }, [isTrashView, onOpenInLightbox]);

  const handleAddToCollection = (collectionId: string) => {
    const ids = Array.from(selectedAssetIds);
    if (ids.length > 0) {
      bridge.addToCollection(collectionId, ids);
    }
  };

  // ── Context Menu ──
  const handleContextMenu = (e: React.MouseEvent, asset: ImageAsset) => {
    e.preventDefault();
    if (!selectedAssetIds.has(asset.id)) {
      setSelectedAssetIds(new Set([asset.id]));
      setLastSelectedId(asset.id);
      onSelectedAssetChange?.(asset.id);
    }
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true,
    });
  };

  // ── Configurable modifier shortcuts ──
  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      const rating = /^gallery_rate_([1-5])$/.exec(action);
      if (rating) {
        handleSetRating(Number(rating[1]));
      } else if (action === 'gallery_flag_pick') {
        handleSetFlag('flagged');
      } else if (action === 'gallery_flag_unflag') {
        handleSetFlag('unflagged');
      } else if (action === 'gallery_flag_reject') {
        handleSetFlag('rejected');
      } else if (!isTrashView && action === 'gallery_open_develop' && selectedAssetsList.length > 0) {
        handleOpenInLightbox(selectedAssetsList[0].id);
      } else if (action === 'gallery_select_all') {
        handleSelectAll();
      } else if (action === 'gallery_delete') {
        handleDeleteSelected();
      }
    };

    window.addEventListener('kurolight:shortcut', handleShortcut);
    return () => window.removeEventListener('kurolight:shortcut', handleShortcut);
  }, [
    selectedAssetsList,
    handleSelectAll,
    handleClearSelection,
    handleSetRating,
    handleSetFlag,
    handleDeleteSelected,
    handleOpenInLightbox,
    isTrashView,
  ]);

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-obsidian-deep relative">
      {/* ── Left Sidebar (Collections & Filters) ── */}
      <GallerySidebar
        collections={collections}
        activeCollectionId={activeCollectionId}
        onSelectCollection={(collectionId) => {
          if (isTrashView) handleClearSelection();
          setIsTrashView(false);
          resetVisibleAssets();
          setActiveSourceFolder(null);
          onActiveCollectionChange(collectionId);
        }}
        trashCount={trashCount}
        isTrashView={isTrashView}
        onSelectTrash={handleSelectTrash}
        sourceFolders={sourceFolders}
        activeSourceFolder={activeSourceFolder}
        onSelectSourceFolder={(sourceFolder) => {
          if (isTrashView) handleClearSelection();
          setIsTrashView(false);
          resetVisibleAssets();
          onActiveCollectionChange(null);
          setActiveSourceFolder(sourceFolder);
        }}
        remainingSourceFolderCount={Math.max(0, sourceFolderTotal - sourceFolders.length)}
        sourceFoldersLoading={sourceFoldersLoading}
        sourceFoldersError={sourceFoldersError}
        onLoadMoreSourceFolders={() => void loadMoreSourceFolders()}
        ratingFilter={ratingFilter}
        onRatingFilterChange={(rating) => {
          resetVisibleAssets();
          setRatingFilter(rating);
        }}
        flagFilter={flagFilter}
        onFlagFilterChange={(flag) => {
          resetVisibleAssets();
          setFlagFilter(flag);
        }}
        totalAssetsCount={totalAssetCount}
        width={sidebarWidth}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />

      {/* ── Left Sidebar Resizer Handle ── */}
      {!isSidebarCollapsed && (
        <ResizeHandle
          direction="vertical"
          side="left"
          onResize={handleSidebarResize}
          onDoubleClick={resetSidebarWidth}
          title="Drag to resize collections sidebar • Double-click to reset"
        />
      )}

      {/* ── Central Main Asset Grid / Table View ── */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Top Control Bar */}
        <div className="h-12 border-b border-obsidian-border bg-obsidian-card px-4 flex items-center justify-between gap-3 text-xs select-none flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 max-w-lg">
            {/* Sidebar Toggle Button */}
            <button
              onClick={toggleSidebarCollapse}
              className={`p-1.5 rounded border transition-colors ${
                isSidebarCollapsed
                  ? 'bg-obsidian-elevated text-obsidian-accent border-obsidian-accent'
                  : 'bg-obsidian-card hover:bg-obsidian-elevated text-obsidian-textMut hover:text-white border-obsidian-border'
              }`}
              title={isSidebarCollapsed ? 'Show Collections Sidebar' : 'Hide Collections Sidebar'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </button>

            {/* Search Input */}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-obsidian-textMut" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  resetVisibleAssets();
                  setSearchQuery(e.target.value);
                }}
                placeholder="Search filename, camera, lens, title, description, keywords, or copyright…"
                className="w-full bg-obsidian-elevated text-white pl-8 pr-7 py-1.5 rounded-md border border-obsidian-border focus:border-obsidian-accent outline-none text-xs placeholder:text-obsidian-textMut"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-obsidian-textMut hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Right Controls: Sort, View Mode, Inspector Toggle, Selection Count */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Clear Selection Button */}
            {selectedAssetIds.size > 0 && (
              <button
                onClick={handleClearSelection}
                className="px-2 py-1 rounded bg-obsidian-elevated hover:bg-obsidian-hover text-obsidian-textSec hover:text-white border border-obsidian-border text-[11px] font-medium flex items-center gap-1"
                title="Clear Selection (Escape)"
              >
                <X size={11} />
                <span>Clear ({selectedAssetIds.size})</span>
              </button>
            )}
            {!isTrashView && selectedAssetIds.size === 2 &&
              selectedAssetsList.length === selectedAssetIds.size &&
              !isCompareMode && (
                <button
                  type="button"
                  onClick={() => {
                    setComparisonAssetIds(selectedAssetsList.map((asset) => asset.id));
                    setComparisonView('compare');
                    setIsCompareMode(true);
                  }}
                  className="flex items-center gap-1 rounded border border-obsidian-border bg-obsidian-elevated px-2 py-1 text-[11px] font-medium text-obsidian-textSec hover:bg-obsidian-hover hover:text-white"
                >
                  <Columns size={12} />
                  <span>Compare ({selectedAssetIds.size})</span>
                </button>
              )}
            {!isTrashView && selectedAssetIds.size >= 2 &&
              selectedAssetIds.size <= 4 &&
              selectedAssetsList.length === selectedAssetIds.size &&
              !isCompareMode && (
                <button
                  type="button"
                  onClick={() => {
                    setComparisonAssetIds(selectedAssetsList.map((asset) => asset.id));
                    setComparisonView('survey');
                    setIsCompareMode(true);
                  }}
                  className="flex items-center gap-1 rounded border border-obsidian-border bg-obsidian-elevated px-2 py-1 text-[11px] font-medium text-obsidian-textSec hover:bg-obsidian-hover hover:text-white"
                >
                  <Eye size={12} />
                  <span>Survey ({selectedAssetIds.size})</span>
                </button>
              )}

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1 bg-obsidian-elevated border border-obsidian-border rounded-md px-2 py-1">
              <ArrowUpDown size={12} className="text-obsidian-textMut" />
              <select
                value={sortMode}
                onChange={(e) => {
                  resetVisibleAssets();
                  setSortMode(e.target.value as 'name' | 'date' | 'rating' | 'size')
                }}
                className="bg-transparent text-obsidian-textSec text-xs outline-none cursor-pointer"
              >
                <option value="name" className="bg-obsidian-card text-white">Sort: Name</option>
                <option value="date" className="bg-obsidian-card text-white">Sort: Date</option>
                <option value="rating" className="bg-obsidian-card text-white">Sort: Rating</option>
                <option value="size" className="bg-obsidian-card text-white">Sort: Size</option>
              </select>
            </div>

            {/* View Mode Toggle: Grid vs Table */}
            <div className="flex bg-obsidian-elevated border border-obsidian-border rounded-md p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-obsidian-active text-obsidian-accent'
                    : 'text-obsidian-textMut hover:text-white'
                }`}
                title="Grid View"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1 rounded transition-colors ${
                  viewMode === 'table'
                    ? 'bg-obsidian-active text-obsidian-accent'
                    : 'text-obsidian-textMut hover:text-white'
                }`}
                title="Table View"
              >
                <List size={14} />
              </button>
            </div>

            {/* Inspector Toggle Button */}
            <button
              onClick={toggleInspectorCollapse}
              className={`p-1.5 rounded border transition-colors ${
                isInspectorCollapsed
                  ? 'bg-obsidian-elevated text-obsidian-accent border-obsidian-accent'
                  : 'bg-obsidian-card hover:bg-obsidian-elevated text-obsidian-textMut hover:text-white border-obsidian-border'
              }`}
              title={isInspectorCollapsed ? 'Show Metadata Inspector' : 'Hide Metadata Inspector'}
            >
              {isInspectorCollapsed ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
            </button>

            {/* Total Filtered Count */}
            <span className="text-[11px] text-obsidian-textMut pl-2 border-l border-obsidian-border hidden sm:inline">
              Showing {galleryAssets.length} of {galleryResultCount} {isTrashView ? 'Items' : 'Photos'}
            </span>
          </div>
        </div>

        {libraryLoading.loading && assets.length > 0 && (
          <div className="relative flex items-center justify-between gap-3 border-b border-obsidian-border bg-obsidian-panel/90 px-4 py-2 text-xs text-obsidian-textSec overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-obsidian-accent to-transparent animate-shimmer" />
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-obsidian-accent animate-pulse" />
              {libraryLoading.message}
            </span>
            {libraryLoading.cancellable && (
              <button
                type="button"
                onClick={onCancelImport}
                className="rounded border border-obsidian-border px-2 py-1 text-obsidian-textSec hover:bg-obsidian-hover hover:text-white"
              >
                Cancel import
              </button>
            )}
          </div>
        )}

        {/* Central Content Area */}
        {!isTrashView && isCompareMode && comparisonAssets.length >= 2 ? (
          <CompareWorkspace
            assets={comparisonAssets}
            initialView={comparisonView}
            onClose={() => setIsCompareMode(false)}
            onRemoveAsset={handleRemoveComparisonAsset}
            onSetRating={(assetId, rating) => bridge.setRating(assetId, rating)}
            onSetFlag={(assetId, flag) => bridge.setFlag(assetId, flag)}
          />
        ) : ((libraryLoading.loading && assets.length === 0) || (usesNativePages && pageLoading && galleryAssets.length === 0)) ? (
          viewMode === 'grid' ? (
            <GalleryGridSkeleton count={12} />
          ) : (
            <GalleryTableSkeleton count={10} />
          )
        ) : usesNativePages && pageError && galleryAssets.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-red-300">Could not load photos: {pageError}</p>
            <button
              type="button"
              onClick={() => {
                setPagedAssets(null);
                setPageError(null);
                setPageRefreshKey((key) => key + 1);
              }}
              className="rounded border border-obsidian-border px-3 py-1.5 text-xs text-obsidian-textSec hover:bg-obsidian-hover hover:text-white"
            >
              Retry
            </button>
          </div>
        ) : galleryAssets.length > 0 ? (
          viewMode === 'grid' ? (
            <GalleryGrid
              assets={galleryAssets}
              selectedAssetIds={selectedAssetIds}
              onSelectAsset={handleSelectAsset}
              onMultiSelect={setSelectedAssetIds}
              onClearSelection={handleClearSelection}
              onOpenInLightbox={handleOpenInLightbox}
              onContextMenu={handleContextMenu}
              remainingAssetCount={remainingAssetCount}
              onLoadMore={() => usesNativePages
                ? void loadNextPage()
                : setVisibleAssetCount((count) => count + GALLERY_BATCH_SIZE)}
              isLoadingMore={usesNativePages && pageLoading}
              loadMoreError={usesNativePages ? pageError : null}
            />
          ) : (
            <GalleryTable
              assets={galleryAssets}
              selectedAssetIds={selectedAssetIds}
              onSelectAsset={handleSelectAsset}
              onOpenInLightbox={handleOpenInLightbox}
              onContextMenu={handleContextMenu}
              remainingAssetCount={remainingAssetCount}
              onLoadMore={() => usesNativePages
                ? void loadNextPage()
                : setVisibleAssetCount((count) => count + GALLERY_BATCH_SIZE)}
              isLoadingMore={usesNativePages && pageLoading}
              loadMoreError={usesNativePages ? pageError : null}
            />
          )
        ) : (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-obsidian-textMut">
            <div className="w-16 h-16 rounded-full bg-obsidian-elevated border border-obsidian-border flex items-center justify-center mb-3">
              {isTrashView
                ? <Trash2 size={28} className="text-obsidian-accent opacity-80" />
                : <Upload size={28} className="text-obsidian-accent opacity-80" />}
            </div>
            <h3 className="text-white font-bold text-sm">
              {isTrashView ? 'Recently Deleted Is Empty' : 'No Photographs Found'}
            </h3>
            <p className="text-xs text-obsidian-textMut mt-1 max-w-sm">
              {isTrashView
                ? 'Photos moved to Recently Deleted will stay here until you restore or permanently delete them.'
                : assets.length === 0
                ? 'Your KuroLight vault is empty. Import photos or folders to start editing.'
                : 'No photos match your current search and filter criteria.'}
            </p>
            <div className="flex gap-2 mt-4">
              {isTrashView ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsTrashView(false);
                    setVisibleAssetCount(GALLERY_BATCH_SIZE);
                  }}
                  className="px-3 py-1.5 bg-obsidian-elevated hover:bg-obsidian-hover text-white rounded-md text-xs font-medium border border-obsidian-border"
                >
                  Back to All Photographs
                </button>
              ) : assets.length === 0 ? (
                <button
                  onClick={() => bridge.importFiles()}
                  className="px-4 py-2 bg-obsidian-accent hover:bg-blue-600 text-white rounded-lg text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5"
                >
                  <Upload size={13} />
                  <span>Import Photos Now</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    resetVisibleAssets();
                    setRatingFilter(0);
                    setFlagFilter('all');
                    setSearchQuery('');
                    setIsTrashView(false);
                    setActiveSourceFolder(null);
                    onActiveCollectionChange(null);
                  }}
                  className="px-3 py-1.5 bg-obsidian-elevated hover:bg-obsidian-hover text-white rounded-md text-xs font-medium border border-obsidian-border"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Right Inspector Resizer Handle ── */}
      {!isTrashView && !isInspectorCollapsed && (
        <ResizeHandle
          direction="vertical"
          side="right"
          onResize={handleInspectorResize}
          onDoubleClick={resetInspectorWidth}
          title="Drag to resize metadata inspector • Double-click to reset"
        />
      )}

      {/* ── Right Sidebar (Asset Inspector) ── */}
      {!isTrashView && <GalleryInspector
        selectedAssets={selectedAssetsList}
        onOpenInLightbox={handleOpenInLightbox}
        onSetRating={handleSetRating}
        onSetFlag={handleSetFlag}
        onSaveMetadataOverrides={(assetId, overrides) =>
          bridge.updateAssetMetadataOverrides(assetId, overrides)
        }
        width={inspectorWidth}
        isCollapsed={isInspectorCollapsed}
        onToggleCollapse={toggleInspectorCollapse}
      />}

      {/* ── Context Menu ── */}
      {contextMenu?.visible && (
        <GalleryContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedAssetIds={Array.from(selectedAssetIds)}
          collections={collections}
          onClose={() => setContextMenu(null)}
          onOpenInLightbox={handleOpenInLightbox}
          onSetRating={handleSetRating}
          onSetFlag={handleSetFlag}
          onAddToCollection={handleAddToCollection}
          isTrashView={isTrashView}
          onRestore={handleRestoreSelected}
          onDelete={handleDeleteSelected}
        />
      )}
    </div>
  );
};
