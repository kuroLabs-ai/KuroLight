import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { bridge } from '../bridge';
import { ImageAsset, EditState, Collection, Preset, WorkspaceId } from '../types';
import { applyAccentColor } from '../utils/theme';

export function useBridgeSync(): void {
  const activeAssetRef = useRef<ImageAsset | null>(null);
  const progressHideTimer = useRef<number | null>(null);
  const processingProgressRef = useRef<{ percent: number; message: string } | null>(null);

  const {
    setImageUrl,
    setBeforeImageUrl,
    setHistogram,
    setColorScopes,
    setAssets,
    setAssetCount,
    setTrashCount,
    setLibraryLoading,
    setNotice,
    setProcessingProgress,
    setCollections,
    setActiveCollectionId,
    setPresets,
    setHistoryList,
    setActiveHistoryIndex,
    setActiveAsset,
    setEditState,
    setSelectedMaskId,
    setSelectedRetouchSpotId,
    setIsFilmstripVisible,
    setWorkspace,
    resetActiveAssetAndEdits,
    notice,
  } = useAppStore();

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
        setActiveCollectionId(
          useAppStore.getState().activeCollectionId &&
            newColls.some((c) => c.id === useAppStore.getState().activeCollectionId)
            ? useAppStore.getState().activeCollectionId
            : null
        );
      }),
      bridge.on('presets_updated', (newPresets: Preset[]) => setPresets(newPresets)),
      bridge.on('history_updated', (hist: string[], idx: number) => {
        setHistoryList(hist);
        setActiveHistoryIndex(idx);
      }),
      bridge.on('asset_selected', (asset: ImageAsset | null, state: EditState | null) => {
        if (!asset || !state) {
          activeAssetRef.current = null;
          resetActiveAssetAndEdits();
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
  }, [
    setImageUrl,
    setBeforeImageUrl,
    setHistogram,
    setColorScopes,
    setAssets,
    setAssetCount,
    setTrashCount,
    setLibraryLoading,
    setNotice,
    setProcessingProgress,
    setCollections,
    setActiveCollectionId,
    setPresets,
    setHistoryList,
    setActiveHistoryIndex,
    setActiveAsset,
    setEditState,
    setSelectedMaskId,
    setSelectedRetouchSpotId,
    setIsFilmstripVisible,
    setWorkspace,
    resetActiveAssetAndEdits,
  ]);

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
  }, [setWorkspace]);

  // Clear notice after timeout
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(
      () => setNotice(null),
      notice.message.includes('\n') ? 30000 : 8000
    );
    return () => window.clearTimeout(timeout);
  }, [notice, setNotice]);
}
