import React, { useCallback, Suspense, lazy } from 'react';
import { X } from 'lucide-react';
import { TopBar, Filmstrip } from '@/components';
import { GalleryPage, DevelopPage } from '@/pages';
import {
  usePanelResize,
  usePreventZoom,
  useFileDrop,
  useBridgeSync,
  useGlobalShortcuts,
} from '@/hooks';
import { useAppStore } from '@/stores';
import { DEFAULT_EDIT_STATE } from '@/constants';
import { bridge } from '@/bridge';
import type { WorkspaceId, EditState } from '@/types';

// Code-split secondary workspaces & heavy modals for instant startup
const ColorStudioPage = lazy(() =>
  import('@/pages/ColorStudioPage').then((m) => ({ default: m.ColorStudioPage }))
);
const DeliverPage = lazy(() =>
  import('@/pages/DeliverPage').then((m) => ({ default: m.DeliverPage }))
);
const VisualFlowPage = lazy(() =>
  import('@/pages/VisualFlowPage').then((m) => ({ default: m.VisualFlowPage }))
);
const SettingsPopup = lazy(() =>
  import('@/components/settings/SettingsPopup').then((m) => ({ default: m.SettingsPopup }))
);
const KuroAIPopup = lazy(() =>
  import('@/components/lightbox/KuroAIPopup').then((m) => ({ default: m.KuroAIPopup }))
);

const WorkspaceLoader: React.FC<{ label?: string }> = ({ label = 'Loading workspace…' }) => (
  <div className="flex flex-1 h-full w-full items-center justify-center bg-obsidian-deep text-obsidian-textMut">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-obsidian-border border-t-obsidian-accent" />
      <span className="text-xs font-medium text-obsidian-textSec">{label}</span>
    </div>
  </div>
);

export const App: React.FC = () => {
  // Sync bridge events to Zustand store & prevent zoom
  useBridgeSync();
  usePreventZoom();

  // Global State from Zustand
  const {
    workspace,
    setWorkspace,
    gallerySelectedAssetId,
    setGallerySelectedAssetId,
    assets,
    assetCount,
    trashCount,
    libraryLoading,
    notice,
    setNotice,
    processingProgress,
    collections,
    activeCollectionId,
    setActiveCollectionId,
    presets,
    historyList,
    activeHistoryIndex,
    activeAsset,
    editState,
    setEditState,
    setSelectedMaskId,
    selectedMaskId,
    setSelectedRetouchSpotId,
    selectedRetouchSpotId,
    imageUrl,
    beforeImageUrl,
    histogram,
    colorScopes,
    isFilmstripVisible,
    setIsFilmstripVisible,
    isCropActive,
    setIsCropActive,
    cropRect,
    setCropRect,
    isAIPopupOpen,
    setIsAIPopupOpen,
    isSettingsOpen,
    setIsSettingsOpen,
  } = useAppStore();

  // Resizable Panels
  const {
    size: rightPanelWidth,
    isCollapsed: isRightPanelCollapsed,
    handleResize: handleRightPanelResize,
    resetSize: resetRightPanelWidth,
    toggleCollapse: toggleRightPanelCollapse,
  } = usePanelResize({
    initialSize: 320,
    minSize: 260,
    maxSize: 640,
    storageKey: 'kurolight_right_panel_width',
  });

  const {
    size: filmstripHeight,
    handleResize: handleFilmstripResize,
    resetSize: resetFilmstripHeight,
  } = usePanelResize({
    initialSize: 112,
    minSize: 64,
    maxSize: 240,
    storageKey: 'kurolight_filmstrip_height',
  });

  // Drag and drop import hook
  const {
    isFileDragOver,
    setIsFileDragOver,
    dropMessage,
    isImportingDrop,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useFileDrop();

  const handleWorkspaceChange = useCallback(
    (nextWs: WorkspaceId) => {
      setWorkspace(nextWs);
      bridge.switchWorkspace(nextWs);
      if (nextWs !== 'library' && gallerySelectedAssetId && gallerySelectedAssetId !== activeAsset?.id) {
        bridge.selectAsset(gallerySelectedAssetId);
      }
    },
    [gallerySelectedAssetId, activeAsset?.id, setWorkspace]
  );

  // Global Keyboard Shortcuts Hook
  useGlobalShortcuts({
    toggleRightPanelCollapse,
    onWorkspaceChange: handleWorkspaceChange,
  });

  // Edit change handler
  const handleEditChange = useCallback(
    (newState: EditState) => {
      setEditState(newState);
      setSelectedMaskId(
        newState.masks?.some((mask) => mask.id === selectedMaskId)
          ? selectedMaskId
          : newState.masks?.[0]?.id ?? null
      );
      setSelectedRetouchSpotId(
        newState.retouch_spots?.some((spot) => spot.id === selectedRetouchSpotId)
          ? selectedRetouchSpotId
          : newState.retouch_spots?.[0]?.id ?? null
      );
      bridge.updateEditState(newState);
    },
    [selectedMaskId, selectedRetouchSpotId, setEditState, setSelectedMaskId, setSelectedRetouchSpotId]
  );

  const requestColorSample = useCallback((onSample: (color: string) => void) => {
    window.dispatchEvent(
      new CustomEvent('kurolight:request-color-sample', { detail: { onSample } })
    );
  }, []);

  const cancelColorSample = useCallback(() => {
    window.dispatchEvent(new Event('kurolight:cancel-color-sample'));
  }, []);

  const handleResetAll = () => {
    if (activeAsset) {
      const reset = { ...DEFAULT_EDIT_STATE, asset_id: activeAsset.id };
      setEditState(reset);
      bridge.saveEditState(reset);
    }
  };

  const activeCollection = collections.find((c) => c.id === activeCollectionId);
  const collectionAssetIds = new Set(activeCollection?.asset_ids ?? []);
  const activeAssetInCollection =
    !!activeCollection && !!activeAsset && collectionAssetIds.has(activeAsset.id);
  const filmstripAssets = activeAssetInCollection
    ? assets.filter((asset) => collectionAssetIds.has(asset.id))
    : activeAsset
      ? [activeAsset]
      : activeCollection
        ? assets.filter((asset) => collectionAssetIds.has(asset.id))
        : [];

  const showFilmstrip =
    isFilmstripVisible && !['library', 'color_studio', 'visual_flow'].includes(workspace);

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-obsidian-deep font-sans select-none text-obsidian-textPri"
      onDragEnter={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) setIsFileDragOver(true);
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(event) => void handleDrop(event)}
    >
      {/* Top Bar */}
      <TopBar
        currentWorkspace={workspace}
        onWorkspaceChange={handleWorkspaceChange}
        canUndo={activeHistoryIndex >= 0}
        canRedo={activeHistoryIndex < historyList.length - 1}
        onUndo={() => bridge.undo()}
        onRedo={() => bridge.redo()}
        onSave={() => bridge.saveEditState(editState)}
        onOpenAI={() => setIsAIPopupOpen(!isAIPopupOpen)}
        isAIOpen={isAIPopupOpen}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {notice && (
        <div
          role={notice.level === 'error' ? 'alert' : 'status'}
          className={`absolute right-4 top-16 z-[100] max-h-[45vh] w-[min(28rem,calc(100vw-2rem))] overflow-auto rounded-lg border bg-obsidian-panel p-4 shadow-xl ${
            notice.level === 'error'
              ? 'border-red-500/60'
              : notice.level === 'warning'
                ? 'border-amber-500/60'
                : 'border-obsidian-border'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{notice.title}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs text-obsidian-textSec">
                {notice.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded p-1 text-obsidian-textMut hover:bg-obsidian-hover hover:text-white"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {processingProgress && (
        <div
          role="status"
          aria-live="polite"
          className="absolute left-1/2 top-16 z-[110] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-obsidian-border bg-obsidian-panel p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium text-white">{processingProgress.message}</span>
            <div className="flex items-center gap-2 font-mono text-obsidian-textMut">
              <span>{Math.round(processingProgress.percent)}%</span>
              {processingProgress.cancellable && (
                <button
                  type="button"
                  onClick={() => bridge.cancelProcessing()}
                  className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-obsidian-textSec hover:bg-obsidian-hover hover:text-white"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-obsidian-deep">
            <div
              className="h-full bg-obsidian-accent transition-[width] duration-150 ease-out"
              style={{ width: `${processingProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Workspace Stage */}
      <div
        className={`workspace-stage relative flex flex-1 overflow-hidden ${
          workspace === 'develop' ? 'lightbox-stage' : ''
        }`}
      >
        {isAIPopupOpen && (
          <Suspense fallback={null}>
            <KuroAIPopup
              isOpen
              onClose={() => setIsAIPopupOpen(false)}
              activeAssetId={activeAsset?.id}
              activeFileName={activeAsset?.file_name}
              onSelectAsset={(id) => bridge.selectAsset(id)}
              availableAssets={assets}
            />
          </Suspense>
        )}

        {/* Gallery / Library (Direct mount for instant startup) */}
        {workspace === 'library' && (
          <GalleryPage
            assets={assets}
            totalAssetCount={assetCount || assets.length}
            trashCount={trashCount}
            activeAsset={activeAsset}
            libraryLoading={libraryLoading}
            onCancelImport={() => bridge.cancelImport()}
            collections={collections}
            activeCollectionId={activeCollectionId}
            onActiveCollectionChange={setActiveCollectionId}
            onSelectedAssetChange={setGallerySelectedAssetId}
            onOpenInLightbox={(assetId) => {
              setGallerySelectedAssetId(assetId);
              bridge.openInDevelop(assetId);
              setWorkspace('develop');
            }}
          />
        )}

        {/* Lightbox / Develop (Direct mount for instant startup) */}
        {workspace === 'develop' && (
          <DevelopPage
            imageUrl={imageUrl}
            beforeImageUrl={beforeImageUrl}
            activeAsset={activeAsset}
            editState={editState}
            selectedMaskId={selectedMaskId}
            onMaskSelect={setSelectedMaskId}
            selectedRetouchSpotId={selectedRetouchSpotId}
            onRetouchSpotSelect={setSelectedRetouchSpotId}
            onChange={handleEditChange}
            onResetAll={handleResetAll}
            isCropActive={isCropActive}
            cropRect={cropRect}
            onCropChange={setCropRect}
            setIsCropActive={setIsCropActive}
            isFilmstripVisible={isFilmstripVisible}
            onToggleFilmstrip={() => {
              setIsFilmstripVisible(!isFilmstripVisible);
              bridge.toggleFilmstrip();
            }}
            presets={presets}
            historyList={historyList}
            activeHistoryIndex={activeHistoryIndex}
            histogram={histogram}
            rightPanelWidth={rightPanelWidth}
            isRightPanelCollapsed={isRightPanelCollapsed}
            onRightPanelResize={handleRightPanelResize}
            onResetRightPanelWidth={resetRightPanelWidth}
            onToggleRightPanelCollapse={toggleRightPanelCollapse}
            onRequestColorSample={requestColorSample}
            onCancelColorSample={cancelColorSample}
          />
        )}

        {/* Color Studio (Lazy Loaded) */}
        {workspace === 'color_studio' && (
          <Suspense fallback={<WorkspaceLoader label="Loading Color Studio…" />}>
            <ColorStudioPage
              imageUrl={imageUrl}
              beforeImageUrl={beforeImageUrl}
              activeAsset={activeAsset}
              editState={editState}
              onChange={handleEditChange}
              histogram={histogram}
              colorScopes={colorScopes}
              selectedRetouchSpotId={selectedRetouchSpotId}
              onRetouchSpotSelect={setSelectedRetouchSpotId}
              onRetouchSpotChange={(spotId, updates) =>
                handleEditChange({
                  ...editState,
                  retouch_spots: (editState.retouch_spots ?? []).map((spot) =>
                    spot.id === spotId ? { ...spot, ...updates } : spot
                  ),
                })
              }
            />
          </Suspense>
        )}

        {/* Deliver / Export (Lazy Loaded) */}
        {workspace === 'deliver' && (
          <Suspense fallback={<WorkspaceLoader label="Loading Deliver…" />}>
            <DeliverPage
              assets={assets}
              activeAsset={activeAsset}
              collections={collections}
              activeCollectionId={activeCollectionId}
            />
          </Suspense>
        )}

        {/* Visual Flow / Node Pipeline (Lazy Loaded) */}
        {workspace === 'visual_flow' && (
          <Suspense fallback={<WorkspaceLoader label="Loading Visual Flow…" />}>
            <VisualFlowPage
              imageUrl={imageUrl}
              beforeImageUrl={beforeImageUrl}
              activeAsset={activeAsset}
              editState={editState}
              onChange={handleEditChange}
              historyList={historyList}
              activeHistoryIndex={activeHistoryIndex}
              presets={presets}
              histogram={histogram}
            />
          </Suspense>
        )}
      </div>

      {/* Bottom Filmstrip */}
      <Filmstrip
        assets={filmstripAssets}
        activeAsset={activeAsset}
        activeCollectionId={activeCollectionId}
        collectionAssetCount={activeCollection?.asset_count}
        activeAssetId={activeAsset?.id}
        onSelectAsset={(assetId) => bridge.selectAsset(assetId)}
        isVisible={showFilmstrip}
        height={filmstripHeight}
        onResize={handleFilmstripResize}
        onResetHeight={resetFilmstripHeight}
      />

      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsPopup isOpen onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}

      {(isFileDragOver || isImportingDrop || dropMessage) && (
        <div
          className={`pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-xl border-2 border-dashed ${
            isFileDragOver
              ? 'border-obsidian-accent bg-obsidian-accent/10'
              : 'border-transparent'
          }`}
        >
          {(isFileDragOver || isImportingDrop) && (
            <div className="rounded-lg border border-obsidian-border bg-obsidian-panel/95 px-6 py-4 text-sm font-semibold text-white shadow-xl">
              {isImportingDrop
                ? 'Importing dropped images…'
                : 'Drop images to add them to KuroLight'}
            </div>
          )}
          {dropMessage && !isFileDragOver && !isImportingDrop && (
            <div className="absolute bottom-4 rounded-lg border border-obsidian-border bg-obsidian-panel px-4 py-2 text-xs text-white shadow-xl">
              {dropMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
