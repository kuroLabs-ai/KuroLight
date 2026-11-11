import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { TopBar } from './components/TopBar';
import { RightPanel } from './components/RightPanel';
import { Viewport } from './components/Viewport';
import { Filmstrip } from './components/Filmstrip';
import { GalleryWorkspace } from './components/gallery/GalleryWorkspace';
import { ColorStudioWorkspace } from './components/color_studio/ColorStudioWorkspace';
import { DeliverWorkspace } from './components/deliver/DeliverWorkspace';
import { VisualFlowWorkspace } from './components/visual_flow/VisualFlowWorkspace';
import { SettingsPopup } from './components/settings/SettingsPopup';
import { KuroAIPopup } from './components/lightbox/KuroAIPopup';
import { usePanelResize } from './hooks/usePanelResize';
import { ColorScopes, EditState, ImageAsset, Collection, Preset, WorkspaceId } from './types';
import { bridge } from './bridge';
import { getShortcutFromEvent, loadShortcuts } from './settings';
import { applyAccentColor } from './utils/theme';

const DEFAULT_EDIT_STATE: EditState = {
  asset_id: 'default',
  exposure: { exposure: 0.0, contrast: 0.0, highlights: 0.0, shadows: 0.0, whites: 0.0, blacks: 0.0 },
  white_balance: { temperature: 0.0, tint: 0.0, saturation: 0.0, vibrance: 0.0 },
  detail: {
    sharpening: 0.0,
    noise_reduction: 0.0,
    clarity: 0.0,
    texture: 0.0,
    dehaze: 0.0,
    enhancement_resolution: 0,
  },
  geometry: {
    rotation: 0.0, straighten: 0.0, aspect_ratio: 'Original',
    horizontal_flip: false, vertical_flip: false,
    crop_x: 0.0, crop_y: 0.0, crop_width: 1.0, crop_height: 1.0,
  },
  lens_correction: { distortion: 0, chromatic_aberration: 0, vignette: 0 },
  color_grading: {
    lift: { hue: 0, saturation: 0, luminance: 0 },
    gamma: { hue: 0, saturation: 0, luminance: 0 },
    gain: { hue: 0, saturation: 0, luminance: 0 },
    offset: { hue: 0, saturation: 0, luminance: 0 },
    lut_name: null,
    lut_intensity: 1.0,
  },
  tone_curves: {
    rgb_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    red_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    green_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    blue_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  },
};

export const App: React.FC = () => {
  const [workspace, setWorkspace] = useState<WorkspaceId>('library');
  const [gallerySelectedAssetId, setGallerySelectedAssetId] = useState<string | null>(null);
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [assetCount, setAssetCount] = useState(0);
  const [trashCount, setTrashCount] = useState(0);
  const [libraryLoading, setLibraryLoading] = useState({
    loading: Boolean(window.pywebview?.api),
    message: 'Loading photo library…',
    cancellable: false,
  });
  const [notice, setNotice] = useState<{
    title: string;
    message: string;
    level: string;
  } | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [historyList, setHistoryList] = useState<string[]>([]);
  const [activeHistoryIndex, setActiveHistoryIndex] = useState<number>(-1);
  const [activeAsset, setActiveAsset] = useState<ImageAsset | null>(null);
  const activeAssetRef = useRef<ImageAsset | null>(null);
  const [editState, setEditState] = useState<EditState>(DEFAULT_EDIT_STATE);
  const [selectedMaskId, setSelectedMaskId] = useState<string | null>(null);
  const [selectedRetouchSpotId, setSelectedRetouchSpotId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [beforeImageUrl, setBeforeImageUrl] = useState<string>('');
  const [histogram, setHistogram] = useState<{ r: number[]; g: number[]; b: number[]; lum: number[] }>({
    r: [], g: [], b: [], lum: [],
  });
  const [colorScopes, setColorScopes] = useState<ColorScopes | null>(null);
  const [isFilmstripVisible, setIsFilmstripVisible] = useState(true);
  const [isCropActive, setIsCropActive] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0, y: 0, w: 1, h: 1 });
  const [isAIPopupOpen, setIsAIPopupOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [dropMessage, setDropMessage] = useState('');
  const [isImportingDrop, setIsImportingDrop] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<{
    percent: number;
    message: string;
    cancellable: boolean;
  } | null>(null);
  const processingProgressRef = useRef<{
    percent: number;
    message: string;
    cancellable: boolean;
  } | null>(null);
  const progressHideTimer = useRef<number | null>(null);

  // ── Resizable Panels ───────────────────────────────────────────────
  const {
    size: rightPanelWidth,
    isCollapsed: isRightPanelCollapsed,
    handleResize: handleRightPanelResize,
    resetSize: resetRightPanelWidth,
    toggleCollapse: toggleRightPanelCollapse,
  } = usePanelResize({ initialSize: 320, minSize: 260, maxSize: 640, storageKey: 'kurolight_right_panel_width' });

  const {
    size: filmstripHeight,
    handleResize: handleFilmstripResize,
    resetSize: resetFilmstripHeight,
  } = usePanelResize({ initialSize: 112, minSize: 64, maxSize: 240, storageKey: 'kurolight_filmstrip_height' });

  // ── Python Bridge Events ───────────────────────────────────────────
  useEffect(() => {
    const unbind = [
      bridge.on('image_updated', (url: string) => setImageUrl(url)),
      bridge.on('before_image_updated', (url: string) => setBeforeImageUrl(url)),
      bridge.on('histogram_updated', (hist) => setHistogram(hist)),
      bridge.on('color_scopes_updated', (scopes) => setColorScopes(scopes)),
      bridge.on('assets_updated', (newAssets: ImageAsset[]) => {
        setAssets(newAssets);
        if (newAssets.length > 0 && !activeAssetRef.current) {
          activeAssetRef.current = newAssets[0];
          bridge.selectAsset(newAssets[0].id);
        }
      }),
      bridge.on('asset_count_updated', (count) => setAssetCount(count)),
      bridge.on('trash_count_updated', (count) => setTrashCount(count)),
      bridge.on('library_loading', (state) => setLibraryLoading(state)),
      bridge.on('notification', (nextNotice) => setNotice(nextNotice)),
      bridge.on('processing_progress', (percent, message, cancellable) => {
        if (progressHideTimer.current !== null) {
          window.clearTimeout(progressHideTimer.current);
          progressHideTimer.current = null;
        }
        if (percent === null) {
          if (processingProgressRef.current?.percent === 100) {
            progressHideTimer.current = window.setTimeout(() => {
              processingProgressRef.current = null;
              setProcessingProgress(null);
              progressHideTimer.current = null;
            }, 600);
          } else {
            processingProgressRef.current = null;
            setProcessingProgress(null);
          }
          return;
        }
        const nextProgress = {
          percent: Math.min(100, Math.max(0, percent)),
          message,
          cancellable,
        };
        processingProgressRef.current = nextProgress;
        setProcessingProgress(nextProgress);
      }),
      bridge.on('collections_updated', (newColls: Collection[]) => {
        setCollections(newColls);
        setActiveCollectionId((currentId) =>
          currentId && newColls.some((collection) => collection.id === currentId)
            ? currentId
            : null
        );
      }),
      bridge.on('presets_updated', (newPresets: Preset[]) => setPresets(newPresets)),
      bridge.on('history_updated', (hist: string[], idx: number) => {
        setHistoryList(hist);
        setActiveHistoryIndex(idx);
      }),
      bridge.on('asset_selected', (
        asset: ImageAsset | null,
        state: EditState | null,
      ) => {
        if (!asset || !state) {
          activeAssetRef.current = null;
          setActiveAsset(null);
          setEditState(DEFAULT_EDIT_STATE);
          setSelectedMaskId(null);
          setSelectedRetouchSpotId(null);
          setImageUrl('');
          setBeforeImageUrl('');
          setHistogram({ r: [], g: [], b: [], lum: [] });
          setColorScopes(null);
          setHistoryList([]);
          setActiveHistoryIndex(-1);
          return;
        }
        if (asset.id !== activeAssetRef.current?.id) {
          setImageUrl('');
          setBeforeImageUrl('');
        }
        activeAssetRef.current = asset;
        setActiveAsset(asset);
        if (state) {
          setEditState(state);
          setSelectedMaskId(state.masks?.[0]?.id ?? null);
          setSelectedRetouchSpotId(state.retouch_spots?.[0]?.id ?? null);
        }
      }),
      bridge.on('filmstrip_toggled', (vis: boolean) => setIsFilmstripVisible(vis)),
      bridge.on('workspace_changed', (ws: WorkspaceId) => setWorkspace(ws)),
    ];
    return () => {
      unbind.forEach((fn) => fn());
      if (progressHideTimer.current !== null) window.clearTimeout(progressHideTimer.current);
    };
  }, []); // mount only — bridge events are stable

  // Load preferences and apply accent color / startup workspace
  useEffect(() => {
    void bridge.getPreferences().then((prefs) => {
      if (prefs?.appearance?.accent_color) {
        applyAccentColor(prefs.appearance.accent_color);
      }
      if (prefs?.appearance?.startup_workspace && prefs.appearance.startup_workspace !== 'remember') {
        setWorkspace(prefs.appearance.startup_workspace as WorkspaceId);
      }
    });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(
      () => setNotice(null),
      notice.message.includes('\n') ? 30000 : 8000,
    );
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsFileDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    setIsImportingDrop(true);
    let imported = 0;
    const errors: string[] = [];
    try {
      for (const file of files) {
        if (file.size > 200 * 1024 * 1024) {
          errors.push(`${file.name}: exceeds the 200 MB drag-and-drop limit`);
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error(`Could not read ${file.name}`));
          reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}`));
          reader.readAsDataURL(file);
        });
        const result = await bridge.importDroppedFile(file.name, dataUrl);
        if (result.ok) imported += 1;
        else errors.push(`${file.name}: ${result.error ?? 'Import failed'}`);
      }
      setDropMessage(
        `${imported} image${imported === 1 ? '' : 's'} imported${errors.length ? ` · ${errors.length} failed: ${errors[0]}` : ''}`
      );
    } catch (error) {
      setDropMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingDrop(false);
      window.setTimeout(() => setDropMessage(''), 5000);
    }
  };

  // ── Prevent Webview Page Zoom (Ctrl+Wheel, Ctrl++, Ctrl+-, Ctrl+0) ──
  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleGlobalWheel);
  }, []);

  const handleWorkspaceChange = useCallback((nextWs: WorkspaceId) => {
    setWorkspace(nextWs);
    bridge.switchWorkspace(nextWs);
    if (nextWs !== 'library' && gallerySelectedAssetId && gallerySelectedAssetId !== activeAsset?.id) {
      bridge.selectAsset(gallerySelectedAssetId);
    }
  }, [gallerySelectedAssetId, activeAsset?.id]);

  // ── Global Keyboard Shortcuts ──────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.ctrlKey && ['=', '+', '-', '0'].includes(e.key)) {
        e.preventDefault();
        return;
      }

      const shortcut = getShortcutFromEvent(e);
      if (!shortcut) return;
      const action = Object.entries(loadShortcuts()).find(([, value]) => value === shortcut)?.[0];
      if (!action) return;

      if (action.startsWith('workspace_')) {
        const nextWorkspace = action.replace('workspace_', '') as WorkspaceId;
        const workspaceIds: Record<string, WorkspaceId> = {
          library: 'library',
          develop: 'develop',
          color_studio: 'color_studio',
          visual_flow: 'visual_flow',
          deliver: 'deliver',
        };
        const next = workspaceIds[nextWorkspace];
        if (next) {
          e.preventDefault();
          handleWorkspaceChange(next);
        }
      } else if (action.startsWith('gallery_')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('kurolight:shortcut', { detail: action }));
      } else {
        e.preventDefault();
        switch (action) {
          case 'import_images':
            bridge.importFiles();
            break;
          case 'save_edits':
            bridge.saveEditState(editState);
            break;
          case 'open_settings':
            setIsSettingsOpen(true);
            break;
          case 'toggle_kuro_ai':
            setIsAIPopupOpen((previous) => !previous);
            break;
          case 'close_active_panel':
            if (isSettingsOpen) setIsSettingsOpen(false);
            else if (isAIPopupOpen) setIsAIPopupOpen(false);
            else if (isCropActive) {
              setIsCropActive(false);
              bridge.cancelCrop();
            }
            break;
          case 'undo':
            bridge.undo();
            break;
          case 'redo':
            bridge.redo();
            break;
          case 'toggle_filmstrip':
            setIsFilmstripVisible((previous) => !previous);
            bridge.toggleFilmstrip();
            break;
          case 'toggle_right_panel':
            toggleRightPanelCollapse();
            break;
          case 'toggle_crop':
            if (workspace === 'develop') {
              setIsCropActive((previous) => {
                const next = !previous;
                bridge.setCropMode(next);
                return next;
              });
            }
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    editState,
    isAIPopupOpen,
    isCropActive,
    isSettingsOpen,
    toggleRightPanelCollapse,
    workspace,
    handleWorkspaceChange,
  ]);

  // ── Handlers ───────────────────────────────────────────────────────
  const handleEditChange = useCallback((newState: EditState) => {
    setEditState(newState);
    setSelectedMaskId((currentId) =>
      newState.masks?.some((mask) => mask.id === currentId)
        ? currentId
        : newState.masks?.[0]?.id ?? null
    );
    setSelectedRetouchSpotId((currentId) =>
      newState.retouch_spots?.some((spot) => spot.id === currentId)
        ? currentId
        : newState.retouch_spots?.[0]?.id ?? null
    );
    bridge.updateEditState(newState);
  }, []);

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

  const activeCollection = collections.find(
    (collection) => collection.id === activeCollectionId
  );
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

  const showFilmstrip = isFilmstripVisible && !['library', 'color_studio', 'visual_flow'].includes(workspace);

  return (
    <div
      className="relative flex h-screen w-screen flex-col overflow-hidden bg-obsidian-deep font-sans select-none text-obsidian-textPri"
      onDragEnter={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) setIsFileDragOver(true);
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFileDragOver(false);
      }}
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
        onOpenAI={() => setIsAIPopupOpen((previous) => !previous)}
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
            <div className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums text-obsidian-textSec">{processingProgress.percent}%</span>
              {processingProgress.cancellable && (
                <button
                  type="button"
                  onClick={() => {
                    void bridge.cancelProcessing().catch((error: unknown) => {
                      console.error('Could not cancel processing:', error);
                      setNotice({
                        title: 'Cancel Failed',
                        message: 'Could not cancel the current operation.',
                        level: 'error',
                      });
                    });
                  }}
                  className="rounded border border-white/15 px-2 py-0.5 text-[10px] text-obsidian-textSec hover:border-red-400/60 hover:text-red-300"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          <div
            role="progressbar"
            aria-label={processingProgress.message}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={processingProgress.percent}
            className="h-1.5 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className="app-accent h-full rounded-full transition-[width] duration-150"
              style={{ width: `${processingProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Central workspace area */}
      <div className={`workspace-stage relative flex flex-1 overflow-hidden ${workspace === 'develop' ? 'lightbox-stage' : ''}`}>
        {isAIPopupOpen && (
          <KuroAIPopup
            isOpen
            onClose={() => setIsAIPopupOpen(false)}
            activeAssetId={activeAsset?.id}
            activeFileName={activeAsset?.file_name}
            onSelectAsset={(id) => bridge.selectAsset(id)}
            availableAssets={assets}
          />
        )}

        {/* Gallery / Library */}
        {workspace === 'library' && (
          <GalleryWorkspace
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

        {/* Lightbox / Develop */}
        {workspace === 'develop' && (
          <>
            <Viewport
              imageUrl={imageUrl}
              beforeImageUrl={beforeImageUrl}
              activeAssetId={activeAsset?.id}
              dimensions={
                activeAsset?.metadata
                  ? { width: activeAsset.metadata.width || 0, height: activeAsset.metadata.height || 0 }
                  : undefined
              }
              masks={editState.masks}
              selectedMaskId={selectedMaskId}
              geometry={editState.geometry}
              lensCorrection={editState.lens_correction}
              retouchSpots={editState.retouch_spots}
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
              onMaskSelect={setSelectedMaskId}
              onMaskGeometryChange={(maskId, geometry) =>
                handleEditChange({
                  ...editState,
                  masks: (editState.masks ?? []).map((mask) =>
                    mask.id === maskId ? { ...mask, geometry } : mask
                  ),
                })
              }
              isCropActive={isCropActive}
              cropRect={cropRect}
              aspectRatio={editState.geometry.aspect_ratio}
              onCropChange={setCropRect}
              onApplyCrop={(rect) => {
                setCropRect(rect);
                setIsCropActive(false);
                bridge.applyCrop(rect.x, rect.y, rect.w, rect.h);
              }}
              onCancelCrop={() => { setIsCropActive(false); bridge.cancelCrop(); }}
              onResetCrop={() => { setCropRect({ x: 0, y: 0, w: 1, h: 1 }); bridge.resetCrop(); }}
              onToggleCrop={() => setIsCropActive((prev) => { const next = !prev; bridge.setCropMode(next); return next; })}
              onSelectAspectRatio={(ratio) =>
                handleEditChange({ ...editState, geometry: { ...editState.geometry, aspect_ratio: ratio } })
              }
              isFilmstripVisible={isFilmstripVisible}
              onToggleFilmstrip={() => { setIsFilmstripVisible((p) => !p); bridge.toggleFilmstrip(); }}
            />

            <RightPanel
              editState={editState}
              selectedMaskId={selectedMaskId}
              onMaskSelect={setSelectedMaskId}
              selectedRetouchSpotId={selectedRetouchSpotId}
              onRetouchSpotSelect={setSelectedRetouchSpotId}
              onChange={handleEditChange}
              onAutoTone={() => bridge.autoTone()}
              onResetAll={handleResetAll}
              isCropActive={isCropActive}
              onToggleCrop={() => setIsCropActive((prev) => { const next = !prev; bridge.setCropMode(next); return next; })}
              onSelectAspectRatio={(ratio) => {
                setIsCropActive(true);
                bridge.setCropMode(true);
                handleEditChange({ ...editState, geometry: { ...editState.geometry, aspect_ratio: ratio } });
              }}
              presets={presets}
              historyList={historyList}
              activeHistoryIndex={activeHistoryIndex}
              snapshots={editState.snapshots ?? {}}
              histogram={histogram}
              activeAsset={activeAsset}
              width={rightPanelWidth}
              isCollapsed={isRightPanelCollapsed}
              onResize={handleRightPanelResize}
              onResetWidth={resetRightPanelWidth}
              onToggleCollapse={toggleRightPanelCollapse}
              onRequestColorSample={requestColorSample}
              onCancelColorSample={cancelColorSample}
            />
          </>
        )}

        {/* Color Studio */}
        {workspace === 'color_studio' && (
          <ColorStudioWorkspace
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
        )}

        {/* Deliver / Export */}
        {workspace === 'deliver' && (
          <DeliverWorkspace
            assets={assets}
            activeAsset={activeAsset}
            collections={collections}
            activeCollectionId={activeCollectionId}
          />
        )}

        {/* Visual Flow / Node Pipeline */}
        {workspace === 'visual_flow' && (
          <VisualFlowWorkspace
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
        <SettingsPopup
          isOpen
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {(isFileDragOver || isImportingDrop || dropMessage) && (
        <div className={`pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-xl border-2 border-dashed ${
          isFileDragOver ? 'border-obsidian-accent bg-obsidian-accent/10' : 'border-transparent'
        }`}>
          {(isFileDragOver || isImportingDrop) && (
            <div className="rounded-lg border border-obsidian-border bg-obsidian-panel/95 px-6 py-4 text-sm font-semibold text-white shadow-xl">
              {isImportingDrop ? 'Importing dropped images…' : 'Drop images to add them to KuroLight'}
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
