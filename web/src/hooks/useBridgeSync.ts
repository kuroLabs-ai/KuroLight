import { useEffect, useRef } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { bridge } from '../bridge';
import { ImageAsset, EditState, Collection, WorkspaceId } from '../types';
import { applyAccentColor, applyUiScale } from '../utils/theme';
import { BUILTIN_EDIT_PRESETS, loadEditingPresets } from '../utils/editingPresets';
import { cacheLocalEditState, getCachedLocalEditState } from '../utils/storage/imageIndexedDb';

export function useBridgeSync(): void {
  const activeAssetRef = useRef<ImageAsset | null>(null);
  const hydratedAssetIdRef = useRef<string | null>(null);
  const assetLoadTokenRef = useRef(0);
  const latestEditStateRef = useRef(useAppStore.getState().editState);
  const progressHideTimer = useRef<number | null>(null);
  const processingProgressRef = useRef<{ percent: number; message: string } | null>(null);

  const {
    setImageUrl,
    setBeforeImageUrl,
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
      bridge.on('history_updated', (hist: string[], idx: number) => {
        setHistoryList(hist);
        setActiveHistoryIndex(idx);
      }),
      bridge.on('asset_selected', (asset: ImageAsset | null, state: EditState | null) => {
        if (!asset || !state) {
          assetLoadTokenRef.current += 1;
          activeAssetRef.current = null;
          hydratedAssetIdRef.current = null;
          resetActiveAssetAndEdits();
          return;
        }
        if (asset.id === activeAssetRef.current?.id && hydratedAssetIdRef.current === asset.id) {
          setActiveAsset(asset);
          const nextState =
            state.asset_id === asset.id ? state : { ...state, asset_id: asset.id };
          const selectedMaskId = useAppStore.getState().selectedMaskId;
          const selectedRetouchSpotId = useAppStore.getState().selectedRetouchSpotId;
          setEditState(nextState);
          setSelectedMaskId(
            nextState.masks?.some((mask) => mask.id === selectedMaskId)
              ? selectedMaskId
              : nextState.masks?.[0]?.id ?? null
          );
          setSelectedRetouchSpotId(
            nextState.retouch_spots?.some((spot) => spot.id === selectedRetouchSpotId)
              ? selectedRetouchSpotId
              : nextState.retouch_spots?.[0]?.id ?? null
          );
          return;
        }
        if (asset.id !== activeAssetRef.current?.id) {
          setImageUrl('');
          setBeforeImageUrl('');
        }
        const loadToken = ++assetLoadTokenRef.current;
        activeAssetRef.current = asset;
        hydratedAssetIdRef.current = null;
        setActiveAsset(asset);
        const selectedState =
          state.asset_id === asset.id ? state : { ...state, asset_id: asset.id };
        setEditState(selectedState);
        setSelectedMaskId(selectedState.masks?.[0]?.id ?? null);
        setSelectedRetouchSpotId(selectedState.retouch_spots?.[0]?.id ?? null);
        const hydrationBaseline = useAppStore.getState().editState;
        void getCachedLocalEditState(asset.id)
          .then((localState) => {
            if (
              loadToken !== assetLoadTokenRef.current ||
              activeAssetRef.current?.id !== asset.id
            ) {
              return;
            }
            const currentState = useAppStore.getState().editState;
            if (currentState.asset_id === asset.id && currentState !== hydrationBaseline) {
              const currentMaskId = useAppStore.getState().selectedMaskId;
              const currentRetouchSpotId = useAppStore.getState().selectedRetouchSpotId;
              setSelectedMaskId(
                currentState.masks?.some((mask) => mask.id === currentMaskId)
                  ? currentMaskId
                  : currentState.masks?.[0]?.id ?? null
              );
              setSelectedRetouchSpotId(
                currentState.retouch_spots?.some(
                  (spot) => spot.id === currentRetouchSpotId
                )
                  ? currentRetouchSpotId
                  : currentState.retouch_spots?.[0]?.id ?? null
              );
              hydratedAssetIdRef.current = asset.id;
              return;
            }
            const nextState =
              localState?.asset_id === asset.id ? localState : selectedState;
            setEditState({
              ...nextState,
              exposure: {
                ...selectedState.exposure,
                ...nextState.exposure,
                brightness: nextState.exposure.brightness ?? 0,
              },
            });
            setSelectedMaskId(nextState.masks?.[0]?.id ?? null);
            setSelectedRetouchSpotId(nextState.retouch_spots?.[0]?.id ?? null);
            hydratedAssetIdRef.current = asset.id;
          })
          .catch((error: unknown) => {
            if (
              loadToken !== assetLoadTokenRef.current ||
              activeAssetRef.current?.id !== asset.id
            ) {
              return;
            }
            console.error('[KuroLight] Could not restore local photo edits:', error);
            setNotice({
              title: 'Local edits unavailable',
              message: 'Could not read this photo’s browser-saved edits. The catalog version was loaded.',
              level: 'error',
            });
          });
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
    setAssets,
    setAssetCount,
    setTrashCount,
    setLibraryLoading,
    setNotice,
    setProcessingProgress,
    setCollections,
    setActiveCollectionId,
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

  useEffect(() => {
    let cancelled = false;
    void loadEditingPresets()
      .then((loadedPresets) => {
        if (!cancelled) setPresets(loadedPresets);
      })
      .catch((error: unknown) => {
        console.error('[KuroLight] Could not load browser editing presets:', error);
        if (!cancelled) {
          setPresets(BUILTIN_EDIT_PRESETS);
          setNotice({
            title: 'User presets unavailable',
            message: 'Built-in presets are available, but saved user presets could not be loaded.',
            level: 'error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setNotice, setPresets]);

  const activeAsset = useAppStore((state) => state.activeAsset);
  const editState = useAppStore((state) => state.editState);
  useEffect(() => {
    latestEditStateRef.current = editState;
  }, [editState]);

  useEffect(() => {
    const assetId = activeAsset?.id;
    return () => {
      const stateToSave = latestEditStateRef.current;
      if (assetId && stateToSave.asset_id === assetId) {
        void cacheLocalEditState(assetId, stateToSave).catch((error: unknown) => {
          console.error('[KuroLight] Could not cache photo edits:', error);
        });
      }
    };
  }, [activeAsset?.id]);

  useEffect(() => {
    const assetId = activeAsset?.id;
    if (
      !assetId ||
      hydratedAssetIdRef.current !== assetId ||
      editState.asset_id !== assetId
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void cacheLocalEditState(assetId, editState).catch((error: unknown) => {
        console.error('[KuroLight] Could not cache photo edits:', error);
        setNotice({
          title: 'Local edits not cached',
          message: 'Browser storage failed. Save the edits to the Python catalog before exporting.',
          level: 'error',
        });
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [activeAsset?.id, editState, setNotice]);

  // Load preferences and apply accent color / startup workspace
  useEffect(() => {
    void bridge.getPreferences().then((prefs) => {
      if (prefs?.appearance?.accent_color) {
        applyAccentColor(prefs.appearance.accent_color);
      }
      if (typeof prefs?.appearance?.ui_scale === 'number') {
        applyUiScale(prefs.appearance.ui_scale);
      }
      const workspace = prefs?.appearance?.startup_workspace === 'remember'
        ? prefs.last_workspace ?? 'library'
        : prefs?.appearance?.startup_workspace;
      if (workspace) setWorkspace(workspace as WorkspaceId);
    }).catch((error: unknown) => {
      setNotice({
        title: 'Preferences unavailable',
        message: error instanceof Error ? error.message : String(error),
        level: 'error',
      });
    });
  }, [setNotice, setWorkspace]);

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
