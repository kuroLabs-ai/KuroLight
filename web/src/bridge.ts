import {
  AssetMetadataOverrides,
  Collection,
  EditState,
  ExportPreset,
  ImageAsset,
  SmartCollectionRules,
  WorkspaceId,
} from './types';
import type { ExportRequest } from './interfaces/bridge';
import { cacheLocalEditState } from './utils/storage/imageIndexedDb';
import type {
  PythonApi,
  BridgeEvents,
  AssetPage,
  SourceFolder,
  SourceFolderPage,
  AssetPageFilters,
  Preferences,
  StorageStats,
  LocalAIModelInfo,
  AppInfo,
} from './interfaces';

export type {
  PythonApi,
  BridgeEvents,
  AssetPage,
  SourceFolder,
  SourceFolderPage,
  AssetPageFilters,
  Preferences,
  StorageStats,
  LocalAIModelInfo,
  AppInfo,
};

function isAssetMetadataOverrides(value: unknown): value is AssetMetadataOverrides {
  if (!value || typeof value !== 'object') return false;
  const overrides = value as Record<string, unknown>;
  return (
    typeof overrides.title === 'string' &&
    typeof overrides.description === 'string' &&
    Array.isArray(overrides.keywords) &&
    overrides.keywords.every((keyword) => typeof keyword === 'string') &&
    typeof overrides.copyright === 'string'
  );
}

class PythonBridge {
  private bridge: PythonApi | null = null;
  private thumbnailCache = new Map<string, string>();
  private thumbnailRequests = new Map<
    string,
    { resolve: (url: string) => void; reject: (error: Error) => void }
  >();
  private thumbnailPromises = new Map<string, Promise<string>>();
  private thumbnailTimer: number | null = null;
  private listeners: {
    [K in keyof BridgeEvents]: Set<(...args: BridgeEvents[K]) => void>;
  } = {
    image_updated: new Set(),
    before_image_updated: new Set(),
    assets_updated: new Set(),
    asset_count_updated: new Set(),
    trash_count_updated: new Set(),
    library_loading: new Set(),
    collections_updated: new Set(),
    history_updated: new Set(),
    asset_selected: new Set(),
    filmstrip_toggled: new Set(),
    workspace_changed: new Set(),
    notification: new Set(),
    processing_progress: new Set(),
    ready: new Set(),
  };
  public isReady: boolean = false;
  private retryCount = 0;

  public get hasNativeApi(): boolean {
    return this.bridge !== null;
  }

  constructor() {
    this.init();
  }

  private init() {
    if (window.pywebview?.api) {
      this.bridge = window.pywebview.api;
      this.isReady = true;
      this.bindNativeEvents();
      console.log('[Bridge] Connected to Python pywebview API.');
      this.emit('ready', true);
    } else if (this.retryCount < 20) {
      this.retryCount++;
      setTimeout(() => this.init(), 50);
    } else {
      console.log('[Bridge] Standalone web mode (Mock bridge active)');
      this.isReady = true;
    }
  }

  private bindNativeEvents() {
    const events = [
      'image_updated',
      'before_image_updated',
      'assets_updated',
      'asset_count_updated',
      'trash_count_updated',
      'library_loading',
      'collections_updated',
      'history_updated',
      'asset_selected',
      'filmstrip_toggled',
      'workspace_changed',
      'notification',
      'processing_progress',
    ];

    events.forEach((event) => {
      window.addEventListener(`kurolight:${event}`, ((nativeEvent: CustomEvent<unknown[]>) => {
        const args = nativeEvent.detail;
        try {
          switch (event) {
            case 'assets_updated':
              this.emit(event, JSON.parse(args[0] as string) as ImageAsset[]);
              break;
            case 'asset_count_updated':
            case 'trash_count_updated':
              if (!Number.isInteger(args[0]) || (args[0] as number) < 0) {
                throw new TypeError(`Invalid ${event} value from Python`);
              }
              this.emit(event, args[0] as number);
              break;
            case 'library_loading':
              this.emit(
                event,
                JSON.parse(args[0] as string) as BridgeEvents['library_loading'][0],
              );
              break;
            case 'collections_updated':
              this.emit(event, JSON.parse(args[0] as string) as Collection[]);
              break;
            case 'asset_selected':
              this.emit(
                event,
                JSON.parse(args[0] as string) as ImageAsset | null,
                JSON.parse(args[1] as string) as EditState | null,
              );
              break;
            case 'notification':
              this.emit(event, {
                title: args[0] as string,
                message: args[1] as string,
                level: args[2] as string,
              });
              break;
            case 'processing_progress':
              this.emit(
                event,
                typeof args[0] === 'number' ? args[0] : null,
                String(args[1] ?? ''),
                args[2] === true,
              );
              break;
            case 'history_updated':
              this.emit(event, args[0] as string[], args[1] as number);
              break;
            case 'image_updated':
            case 'before_image_updated':
              this.emit(event, args[0] as string);
              break;
            case 'filmstrip_toggled':
              this.emit(event, args[0] as boolean);
              break;
            case 'workspace_changed':
              this.emit(event, args[0] as WorkspaceId);
              break;
          }
        } catch (error) {
          console.error(`Invalid ${event} event from Python`, error);
        }
      }) as EventListener);
    });
  }

  public on<K extends keyof BridgeEvents>(
    event: K,
    callback: (...args: BridgeEvents[K]) => void,
  ) {
    this.listeners[event].add(callback);
    return () => this.off(event, callback);
  }

  public off<K extends keyof BridgeEvents>(
    event: K,
    callback: (...args: BridgeEvents[K]) => void,
  ) {
    this.listeners[event].delete(callback);
  }

  private emit<K extends keyof BridgeEvents>(event: K, ...args: BridgeEvents[K]) {
    this.listeners[event].forEach((callback) => callback(...args));
  }

  // ── Public Python Invocations ──────────────────────────────────────

  public selectAsset(assetId: string) {
    if (this.bridge?.select_asset) {
      this.bridge.select_asset(assetId);
    } else {
      console.log('[Bridge Mock] selectAsset:', assetId);
    }
  }

  public openInDevelop(assetId: string) {
    if (this.bridge?.open_in_develop) {
      this.bridge.open_in_develop(assetId);
    } else {
      this.selectAsset(assetId);
      this.switchWorkspace('develop');
    }
  }

  public async saveEditState(state: EditState): Promise<void> {
    if (!state.asset_id) throw new Error('Cannot save edits without an active photo');
    if (this.bridge) {
      const saveEditState = this.bridge.save_edit_state;
      if (typeof saveEditState !== 'function') {
        throw new Error('The Python edit-saving API is unavailable');
      }
      await saveEditState(JSON.stringify(state));
    }
    await cacheLocalEditState(state.asset_id, state);
  }

  public importFiles() {
    if (this.bridge?.import_files) {
      this.bridge.import_files();
    } else {
      console.log('[Bridge Mock] importFiles requested');
    }
  }

  public async importDroppedFile(fileName: string, dataUrl: string): Promise<{ ok: boolean; error?: string }> {
    if (this.bridge?.import_dropped_file) {
      const response = await this.bridge.import_dropped_file(fileName, dataUrl);
      if (typeof response !== 'string') throw new TypeError('Expected JSON from image import');
      return JSON.parse(response) as { ok: boolean; error?: string };
    }
    return { ok: false, error: 'Drag-and-drop import requires the desktop application.' };
  }

  public importFolder() {
    if (this.bridge?.import_folder) {
      this.bridge.import_folder();
    } else {
      console.log('[Bridge Mock] importFolder requested');
    }
  }

  public cancelImport() {
    if (this.bridge?.cancel_import) {
      this.bridge.cancel_import();
    }
  }

  public async getAssetPage(
    offset: number,
    limit = 100,
    filters: AssetPageFilters = {},
  ): Promise<AssetPage> {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError('Asset page offset must be a non-negative integer.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new RangeError('Asset page limit must be an integer between 1 and 200.');
    }
    if (!this.bridge?.get_asset_page) {
      throw new Error('Catalog pagination requires the KuroLight desktop app.');
    }

    const response = await this.bridge.get_asset_page(
      offset,
      limit,
      JSON.stringify(filters),
    );
    if (typeof response !== 'string') {
      throw new TypeError('Expected JSON from catalog page request.');
    }
    const page = JSON.parse(response) as AssetPage;
    if (
      !Array.isArray(page.assets) ||
      !Number.isInteger(page.total) ||
      !Number.isInteger(page.offset) ||
      !Number.isInteger(page.limit)
    ) {
      throw new TypeError('Invalid catalog page response.');
    }
    return page;
  }

  public async getAssetIds(filters: AssetPageFilters = {}): Promise<string[]> {
    if (!this.bridge?.get_asset_ids) {
      throw new Error('Catalog selection requires the KuroLight desktop app.');
    }
    const response = await this.bridge.get_asset_ids(JSON.stringify(filters));
    if (typeof response !== 'string') {
      throw new TypeError('Expected JSON from catalog ID request.');
    }
    const ids: unknown = JSON.parse(response);
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
      throw new TypeError('Invalid catalog ID response.');
    }
    return ids;
  }

  public async getSourceFolders(offset: number, limit = 100): Promise<SourceFolderPage> {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError('Folder page offset must be a non-negative integer.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new RangeError('Folder page limit must be an integer between 1 and 200.');
    }
    if (!this.bridge?.get_source_folders) {
      throw new Error('Source folder browsing requires the KuroLight desktop app.');
    }
    const response = await this.bridge.get_source_folders(offset, limit);
    if (typeof response !== 'string') {
      throw new TypeError('Expected JSON from source folder request.');
    }
    const page = JSON.parse(response) as SourceFolderPage;
    if (
      !Array.isArray(page.folders) ||
      !page.folders.every(
        (folder) =>
          typeof folder.source_folder === 'string' &&
          Number.isInteger(folder.asset_count) &&
          folder.asset_count >= 0,
      ) ||
      !Number.isInteger(page.total) ||
      !Number.isInteger(page.offset) ||
      !Number.isInteger(page.limit)
    ) {
      throw new TypeError('Invalid source folder response.');
    }
    return page;
  }

  public async isAssetInCollection(assetId: string, collectionId: string): Promise<boolean> {
    if (!this.bridge?.is_asset_in_collection) {
      throw new Error('Collection lookup requires the KuroLight desktop app.');
    }
    const result = await this.bridge.is_asset_in_collection(assetId, collectionId);
    if (typeof result !== 'boolean') {
      throw new TypeError('Invalid collection membership response.');
    }
    return result;
  }

  public getThumbnail(assetId: string): Promise<string> {
    const cached = this.thumbnailCache.get(assetId);
    if (cached !== undefined) {
      this.thumbnailCache.delete(assetId);
      this.thumbnailCache.set(assetId, cached);
      return Promise.resolve(cached);
    }

    const pending = this.thumbnailPromises.get(assetId);
    if (pending) return pending;

    const request = new Promise<string>((resolve, reject) => {
      this.thumbnailRequests.set(assetId, { resolve, reject });
    });
    this.thumbnailPromises.set(assetId, request);
    if (this.thumbnailTimer === null) {
      this.thumbnailTimer = window.setTimeout(() => {
        this.thumbnailTimer = null;
        void this.flushThumbnailRequests();
      }, 20);
    }
    return request;
  }

  private async flushThumbnailRequests(): Promise<void> {
    const ids = Array.from(this.thumbnailRequests.keys()).slice(0, 32);
    const requests = ids.map((id) => [id, this.thumbnailRequests.get(id)!] as const);
    ids.forEach((id) => this.thumbnailRequests.delete(id));

    try {
      if (!this.bridge?.get_thumbnails) {
        for (const [id, waiter] of requests) {
          this.thumbnailPromises.delete(id);
          waiter.resolve('');
        }
      } else {
        const response = await this.bridge.get_thumbnails(JSON.stringify(ids));
        if (typeof response !== 'string') {
          throw new Error('Thumbnail loading requires the KuroLight desktop app.');
        }
        const results = JSON.parse(response) as Record<string, string>;
        if (typeof results.error === 'string') throw new Error(results.error);

        for (const [id, waiter] of requests) {
          const url = results[id] ?? '';
          this.thumbnailCache.set(id, url);
          while (this.thumbnailCache.size > 128) {
            const oldest = this.thumbnailCache.keys().next().value;
            if (oldest === undefined) break;
            this.thumbnailCache.delete(oldest);
          }
          this.thumbnailPromises.delete(id);
          waiter.resolve(url);
        }
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      for (const [id, waiter] of requests) {
        this.thumbnailPromises.delete(id);
        waiter.reject(failure);
      }
    }

    if (this.thumbnailRequests.size > 0 && this.thumbnailTimer === null) {
      this.thumbnailTimer = window.setTimeout(() => {
        this.thumbnailTimer = null;
        void this.flushThumbnailRequests();
      }, 0);
    }
  }

  public undo() {
    if (this.bridge?.undo) {
      this.bridge.undo();
    }
  }

  public redo() {
    if (this.bridge?.redo) {
      this.bridge.redo();
    }
  }

  public toggleFilmstrip() {
    if (this.bridge?.toggle_filmstrip) {
      this.bridge.toggle_filmstrip();
    }
  }

  public setWorkspace(workspaceId: WorkspaceId) {
    if (this.bridge?.set_workspace) {
      this.bridge.set_workspace(workspaceId);
    }
  }

  public switchWorkspace(workspaceId: WorkspaceId) {
    this.setWorkspace(workspaceId);
    this.emit('workspace_changed', workspaceId);
  }

  public async getAISettings(): Promise<{
    provider: 'gemini' | 'openai' | 'anthropic';
    model: string;
    has_api_key: boolean;
    saved_keys: Record<'gemini' | 'openai' | 'anthropic', boolean>;
    privacy_disclosure_accepted: boolean;
    privacy_disclosure_version: string;
    send_image_context: boolean;
  }> {
    const response = await this.bridge?.get_ai_settings?.();
    if (typeof response !== 'string') {
      throw new Error('Kuro AI settings are available in the KuroLight desktop app.');
    }
    return JSON.parse(response) as {
      provider: 'gemini' | 'openai' | 'anthropic';
      model: string;
      has_api_key: boolean;
      saved_keys: Record<'gemini' | 'openai' | 'anthropic', boolean>;
      privacy_disclosure_accepted: boolean;
      privacy_disclosure_version: string;
      send_image_context: boolean;
    };
  }

  public async saveAISettings(settings: {
    provider: string;
    model: string;
    api_key?: string;
    remove_api_key?: boolean;
    privacy_disclosure_accepted?: boolean;
    privacy_disclosure_version?: string;
    send_image_context?: boolean;
  }): Promise<{
    provider: 'gemini' | 'openai' | 'anthropic';
    model: string;
    has_api_key: boolean;
    saved_keys: Record<'gemini' | 'openai' | 'anthropic', boolean>;
    privacy_disclosure_accepted: boolean;
    privacy_disclosure_version: string;
    send_image_context: boolean;
  }> {
    const response = await this.bridge?.save_ai_settings?.(JSON.stringify(settings));
    if (typeof response !== 'string') {
      throw new Error('Kuro AI settings are available in the KuroLight desktop app.');
    }
    return JSON.parse(response) as {
      provider: 'gemini' | 'openai' | 'anthropic';
      model: string;
      has_api_key: boolean;
      saved_keys: Record<'gemini' | 'openai' | 'anthropic', boolean>;
      privacy_disclosure_accepted: boolean;
      privacy_disclosure_version: string;
      send_image_context: boolean;
    };
  }

  public async getAIModels(provider: string, apiKey: string): Promise<Array<{ id: string; name: string }>> {
    const response = await this.bridge?.get_ai_models?.(provider, apiKey);
    if (typeof response !== 'string') {
      throw new Error('Model discovery is available in the KuroLight desktop app.');
    }
    return JSON.parse(response) as Array<{ id: string; name: string }>;
  }

  public async testAIConnection(
    provider: string,
    apiKey: string,
  ): Promise<{ ok: boolean; model_count: number; models: Array<{ id: string; name: string }> }> {
    const response = await this.bridge?.test_ai_connection?.(provider, apiKey);
    if (typeof response !== 'string') {
      throw new Error('Provider connection tests are available in the KuroLight desktop app.');
    }
    return JSON.parse(response) as {
      ok: boolean;
      model_count: number;
      models: Array<{ id: string; name: string }>;
    };
  }

  public async proposeAIEdits(
    prompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    assetId: string,
    editState: EditState,
    customLuts: Record<string, { size: number; data_base64: string }>,
  ): Promise<{
    message: string;
    edits: Record<string, unknown>;
    current_preview: string;
    proposed_preview: string;
    candidate_state: EditState | null;
    base_state_fingerprint: string;
  }> {
    const response = await this.bridge?.propose_ai_edits?.(
      prompt,
      JSON.stringify(history),
      assetId,
      JSON.stringify(editState),
      JSON.stringify(customLuts),
    );
    if (typeof response !== 'string') {
      throw new Error('Kuro AI image analysis is available in the KuroLight desktop app.');
    }
    return JSON.parse(response) as {
      message: string;
      edits: Record<string, unknown>;
      current_preview: string;
      proposed_preview: string;
      candidate_state: EditState | null;
      base_state_fingerprint: string;
    };
  }

  public async applyAIProposal(
    candidate: EditState,
    assetId: string,
    baseStateFingerprint: string,
    baseState: EditState,
  ): Promise<void> {
    if (!this.bridge?.apply_ai_proposal) {
      throw new Error('Applying Kuro AI proposals is available in the KuroLight desktop app.');
    }
    await this.bridge.apply_ai_proposal(
      JSON.stringify(candidate),
      assetId,
      baseStateFingerprint,
      JSON.stringify(baseState),
    );
  }

  public async prepareAIContext(
    assetId: string,
    editState: EditState,
    customLuts: Record<string, { size: number; data_base64: string }>,
  ): Promise<void> {
    const response = await this.bridge?.prepare_ai_context?.(
      assetId,
      JSON.stringify(editState),
      JSON.stringify(customLuts),
    );
    if (typeof response !== 'string') {
      throw new Error('Preparing Kuro AI image context is available in the KuroLight desktop app.');
    }
    const result = JSON.parse(response) as { ok: boolean; error?: string };
    if (!result.ok) {
      throw new Error(result.error ?? 'Could not prepare the current photo for Kuro AI.');
    }
  }

  public async analyzeAutoTone(assetId: string, editState: EditState): Promise<EditState> {
    const response = await this.bridge?.analyze_auto_tone?.(
      assetId,
      JSON.stringify(editState),
    );
    if (typeof response !== 'string') {
      throw new Error('Auto Tone is available in the KuroLight desktop app.');
    }
    return JSON.parse(response) as EditState;
  }

  public async previewAIRestoration(
    assetId: string,
    editState: EditState,
    customLuts: Record<string, { size: number; data_base64: string }>,
  ): Promise<{ previewUrl: string; cancelled: boolean }> {
    const response = await this.bridge?.preview_ai_restoration?.(
      assetId,
      JSON.stringify(editState),
      JSON.stringify(customLuts),
    );
    if (typeof response !== 'string') {
      throw new Error('AI restoration preview is available in the KuroLight desktop app.');
    }
    const result = JSON.parse(response) as {
      ok: boolean;
      cancelled?: boolean;
      preview_url?: string;
    };
    if (result.cancelled) return { previewUrl: '', cancelled: true };
    if (!result.ok || typeof result.preview_url !== 'string' || !result.preview_url.startsWith('data:image/')) {
      throw new Error('Python did not return a valid AI restoration preview.');
    }
    return { previewUrl: result.preview_url, cancelled: false };
  }

  public setRating(assetId: string, rating: number) {
    if (this.bridge?.set_rating) {
      this.bridge.set_rating(assetId, rating);
    }
  }

  public batchSetRating(assetIds: string[], rating: number) {
    if (this.bridge?.batch_set_rating) {
      this.bridge.batch_set_rating(JSON.stringify(assetIds), rating);
    }
  }

  public setFlag(assetId: string, flag: string) {
    if (this.bridge?.set_flag) {
      this.bridge.set_flag(assetId, flag);
    }
  }

  public async updateAssetMetadataOverrides(
    assetId: string,
    overrides: AssetMetadataOverrides,
  ): Promise<AssetMetadataOverrides> {
    if (!this.bridge?.update_asset_metadata_overrides) {
      throw new Error('Editing catalog metadata is available in the KuroLight desktop app.');
    }
    const response = await this.bridge.update_asset_metadata_overrides(
      assetId,
      JSON.stringify(overrides),
    );
    if (typeof response !== 'string') {
      throw new TypeError('Invalid metadata response from Python');
    }
    const parsed: unknown = JSON.parse(response);
    if (!isAssetMetadataOverrides(parsed)) {
      throw new TypeError('Invalid metadata overrides from Python');
    }
    return parsed;
  }

  public batchSetFlag(assetIds: string[], flag: string) {
    if (this.bridge?.batch_set_flag) {
      this.bridge.batch_set_flag(JSON.stringify(assetIds), flag);
    }
  }

  public deleteAssets(assetIds: string[]) {
    if (this.bridge?.delete_assets) {
      this.bridge.delete_assets(JSON.stringify(assetIds));
    }
  }

  public restoreAssets(assetIds: string[]) {
    if (this.bridge?.restore_assets) {
      this.bridge.restore_assets(JSON.stringify(assetIds));
    }
  }

  public permanentlyDeleteAssets(assetIds: string[]) {
    if (this.bridge?.permanently_delete_assets) {
      this.bridge.permanently_delete_assets(JSON.stringify(assetIds));
    }
  }

  public createCollection(
    name: string,
    parentId: string | null = null,
  ): Promise<unknown> | undefined {
    if (this.bridge?.create_collection) {
      return this.bridge.create_collection(name, parentId);
    }
    return undefined;
  }

  public createSmartCollection(
    name: string,
    rules: SmartCollectionRules,
    parentId: string | null = null,
  ): Promise<unknown> | undefined {
    if (this.bridge?.create_smart_collection) {
      return this.bridge.create_smart_collection(name, JSON.stringify(rules), parentId);
    }
    return undefined;
  }

  public updateSmartCollection(
    collectionId: string,
    name: string,
    rules: SmartCollectionRules,
  ): Promise<unknown> | undefined {
    if (this.bridge?.update_smart_collection) {
      return this.bridge.update_smart_collection(collectionId, name, JSON.stringify(rules));
    }
    return undefined;
  }

  public deleteCollection(collectionId: string) {
    if (this.bridge?.delete_collection) {
      this.bridge.delete_collection(collectionId);
    }
  }

  public renameCollection(collectionId: string, newName: string) {
    if (this.bridge?.rename_collection) {
      this.bridge.rename_collection(collectionId, newName);
    }
  }

  public addToCollection(collectionId: string, assetIds: string[]) {
    if (this.bridge?.add_to_collection) {
      this.bridge.add_to_collection(collectionId, JSON.stringify(assetIds));
    }
  }

  public removeFromCollection(collectionId: string, assetIds: string[]) {
    if (this.bridge?.remove_from_collection) {
      this.bridge.remove_from_collection(collectionId, JSON.stringify(assetIds));
    }
  }

  public jumpHistory(index: number) {
    if (this.bridge?.jump_history) {
      this.bridge.jump_history(index);
    }
  }

  // ── Deliver / Export ─────────────────────────────────────────────────
  public chooseExportFolder(): Promise<string> {
    if (this.bridge?.choose_export_folder) {
      return this.bridge.choose_export_folder().then((folder) =>
        typeof folder === 'string' ? folder : '',
      );
    }
    console.log('[Bridge Mock] chooseExportFolder');
    return Promise.resolve('');
  }

  public getExportPresets(): Promise<ExportPreset[]> {
    if (this.bridge?.get_export_presets) {
      return this.bridge.get_export_presets().then((presetsJson) => {
        try {
          if (typeof presetsJson !== 'string') {
            throw new TypeError('Expected JSON string for export presets');
          }
          return JSON.parse(presetsJson) as ExportPreset[];
        } catch (error) {
          console.error('Invalid export presets response from Python', error);
          return [];
        }
      });
    }
    // Fallback default presets
    return Promise.resolve([
          {
            id: 'web_srgb',
            name: 'Web / Social Media',
            format: 'JPEG',
            quality: 85,
            color_space: 'sRGB',
            resize_mode: 'fit_long',
            resize_value: 2048,
            resize_unit: 'px',
          },
          {
            id: 'fullres_jpeg',
            name: 'Full Res JPEG',
            format: 'JPEG',
            quality: 95,
            color_space: 'sRGB',
            resize_mode: 'original',
            resize_value: 0,
            resize_unit: 'px',
          },
          {
            id: 'print_tiff',
            name: 'Print (16-bit TIFF)',
            format: 'TIFF',
            quality: 100,
            color_space: 'Adobe RGB',
            resize_mode: 'original',
            resize_value: 0,
            resize_unit: 'px',
          },
          {
            id: 'instagram_square',
            name: 'Instagram (1080px)',
            format: 'JPEG',
            quality: 90,
            color_space: 'sRGB',
            resize_mode: 'fit_long',
            resize_value: 1080,
            resize_unit: 'px',
          },
          {
            id: 'lossless_png',
            name: 'Lossless PNG',
            format: 'PNG',
            quality: 100,
            color_space: 'sRGB',
            resize_mode: 'original',
            resize_value: 0,
            resize_unit: 'px',
          },
        ]);
  }

  public exportAssets(settings: ExportRequest): Promise<{
    ok: boolean;
    job_id?: string;
    status?: string;
    error?: string;
  }> {
    if (this.bridge?.export_assets) {
      return this.bridge.export_assets(JSON.stringify(settings)).then((resJson) => {
        try {
          if (typeof resJson !== 'string') {
            throw new TypeError('Expected JSON string from export operation');
          }
          return JSON.parse(resJson) as {
            ok: boolean; job_id?: string; status?: string; error?: string;
          };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      });
    }
    console.log('[Bridge Mock] exportAssets', settings);
    return Promise.resolve({ ok: false, error: 'Background export requires the desktop application.' });
  }

  public async getExportJob(jobId: string): Promise<{
    id: string; status: string; total: number; completed: number; succeeded: number;
    failed: number; progress: number; current_asset: string; errors: string[]; output_folder: string;
  }> {
    const response = await this.bridge?.get_export_job?.(jobId);
    if (typeof response !== 'string') throw new TypeError('Expected export job status JSON');
    return JSON.parse(response);
  }

  public async controlExportJob(jobId: string, action: 'pause' | 'resume' | 'cancel') {
    const response = await this.bridge?.control_export_job?.(jobId, action);
    if (typeof response !== 'string') throw new TypeError('Expected export job control JSON');
    return JSON.parse(response) as { status: string };
  }

  public async getProcessingCacheInfo(): Promise<Record<string, number>> {
    const response = await this.bridge?.get_processing_cache_info?.();
    if (typeof response !== 'string') return {};
    return JSON.parse(response) as Record<string, number>;
  }

  public async clearProcessingCache(): Promise<void> {
    await this.bridge?.clear_processing_cache?.();
  }

  public async hasLocalEnhancementModel(): Promise<boolean> {
    const installed = await this.bridge?.has_local_enhancement_model?.();
    return installed === true;
  }

  public async downloadLocalEnhancementModel(): Promise<'done' | 'cancelled'> {
    const response = await this.bridge?.download_local_enhancement_model?.();
    if (typeof response !== 'string') {
      throw new TypeError('Expected JSON from local AI model download');
    }
    const result = JSON.parse(response) as {
      ok: boolean;
      error?: string;
      cancelled?: boolean;
    };
    if (result.cancelled) return 'cancelled';
    if (!result.ok) {
      throw new Error(result.error ?? 'Could not download the local AI enhancement model');
    }
    return 'done';
  }

  public async cancelProcessing(): Promise<boolean> {
    const response = await this.bridge?.cancel_processing?.();
    return response === true;
  }

  public async getAppInfo(): Promise<AppInfo> {
    const fallback: AppInfo = {
      name: 'KuroLight',
      tagline: 'Intelligent Visual Creation & Photo Editing Engine',
      version: '1.1.1',
      build: '2026.11',
      release_channel: 'Desktop Production',
      python_version: '3.13',
      platform: navigator.platform || 'Windows (x64)',
      architecture: 'x64',
      config_path: '~/.config/KuroLight/config.json',
      data_dir: '~/.local/share/KuroLight',
      cache_dir: '~/.cache/KuroLight',
      working_color_space: 'sRGB (Linear float32)',
      max_cache_mb: 4096,
      preview_max_edge: 2048,
      gpu_enabled: true,
      github_url: 'https://github.com/kuroLabs-ai/KuroLight',
      discord_url: 'https://discord.gg/2pj9TuqWr',
      docs_url: 'https://github.com/kuroLabs-ai/KuroLight#documentation',
    };
    if (!this.bridge?.get_app_info) {
      return fallback;
    }
    try {
      const response = await this.bridge.get_app_info();
      if (typeof response === 'string') {
        return JSON.parse(response) as AppInfo;
      }
      return (response as AppInfo) || fallback;
    } catch (err) {
      console.warn('Failed to get app info from bridge:', err);
      return fallback;
    }
  }

  public openExternalUrl(url: string): void {
    if (this.bridge?.open_external_url) {
      try {
        void this.bridge.open_external_url(url);
        return;
      } catch (err) {
        console.warn('Bridge failed to open url:', err);
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  public async getPreferences(): Promise<Preferences> {
    const fallback: Preferences = {
      performance: {
        enable_gpu: true,
        gpu_engine: 'auto',
        selected_gpu_device: 'Auto-detect High Performance',
        preview_max_edge: 2048,
        preview_quality: 'balanced',
        max_cache_mb: 4096,
        vram_cache_mb: 2048,
      },
      storage: {
        custom_cache_dir: '',
        backup_schedule: 'on_exit',
        backup_retention_count: 5,
      },
      import_settings: {
        default_creator: '',
        default_copyright: '© 2026 KuroLabs. All rights reserved.',
        default_usage_terms: 'All rights reserved',
        duplicate_detection: 'path',
        auto_apply_preset: 'None',
        raw_preview_priority: 'embedded_jpeg',
      },
      color_management: {
        working_space: 'sRGB',
        monitor_icc_profile: 'System Default',
        soft_proofing_enabled: false,
        gamut_warning_color: '#FF00FF',
      },
      local_ai: {
        strict_offline: false,
      },
      appearance: {
        theme: 'dark',
        accent_color: '#0088FF',
        ui_scale: 1.0,
        startup_workspace: 'remember',
        confirm_disk_deletion: true,
        warn_discard_crop_edits: true,
      },
      external_editor: {
        editor_path: '',
        editor_name: 'Photoshop',
        roundtrip_format: 'TIFF (16-bit)',
      },
    };
    if (!this.bridge?.get_preferences) {
      return fallback;
    }
    try {
      const res = await this.bridge.get_preferences();
      return typeof res === 'string' ? (JSON.parse(res) as Preferences) : (res as Preferences) || fallback;
    } catch (err) {
      console.error('Could not load preferences from Python:', err);
      throw err;
    }
  }

  public async savePreferences(prefs: Partial<Preferences>): Promise<Preferences> {
    if (!this.bridge?.save_preferences) {
      throw new Error('Saving application preferences is available in the KuroLight desktop app.');
    }
    const res = await this.bridge.save_preferences(JSON.stringify(prefs));
    return typeof res === 'string' ? (JSON.parse(res) as Preferences) : (res as Preferences);
  }

  public async getStorageStats(): Promise<StorageStats> {
    const fallback: StorageStats = {
      asset_count: 0,
      db_size_bytes: 524288,
      cache_size_bytes: 104857600,
      cache_file_count: 142,
      catalog_path: '~/.local/share/KuroLight/catalog.db',
      cache_path: '~/.cache/KuroLight',
    };
    if (!this.bridge?.get_storage_stats) {
      return fallback;
    }
    try {
      const res = await this.bridge.get_storage_stats();
      return typeof res === 'string' ? (JSON.parse(res) as StorageStats) : (res as StorageStats) || fallback;
    } catch {
      return fallback;
    }
  }

  public async clearCache(): Promise<{ ok: boolean; freed_bytes: number }> {
    if (!this.bridge?.clear_cache) {
      return { ok: true, freed_bytes: 0 };
    }
    const res = await this.bridge.clear_cache();
    return typeof res === 'string'
      ? (JSON.parse(res) as { ok: boolean; freed_bytes: number })
      : (res as { ok: boolean; freed_bytes: number });
  }

  public async optimizeDatabase(): Promise<{ ok: boolean; message?: string }> {
    if (!this.bridge?.optimize_database) {
      return { ok: true, message: 'Database optimized.' };
    }
    const res = await this.bridge.optimize_database();
    return typeof res === 'string'
      ? (JSON.parse(res) as { ok: boolean; message?: string })
      : (res as { ok: boolean; message?: string });
  }

  public async backupCatalogNow(): Promise<{ ok: boolean; path?: string; error?: string }> {
    if (!this.bridge?.backup_catalog_now) {
      return { ok: true, path: 'catalog_backup.db' };
    }
    const res = await this.bridge.backup_catalog_now();
    return typeof res === 'string'
      ? (JSON.parse(res) as { ok: boolean; path?: string; error?: string })
      : (res as { ok: boolean; path?: string; error?: string });
  }

  public async getLocalAIStatus(): Promise<{ models: LocalAIModelInfo[] }> {
    const fallback: { models: LocalAIModelInfo[] } = {
      models: [
        {
          id: 'realesrgan_x4',
          name: 'Real-ESRGAN x4 Plus',
          category: 'Super-Resolution & Denoise',
          size_mb: 67,
          is_installed: await this.hasLocalEnhancementModel(),
          description: 'High-fidelity 4x image super-resolution with DirectML/CUDA GPU acceleration and CPU fallback.',
        },
        {
          id: 'fast_denoise_ai',
          name: 'Fast Denoise AI',
          category: 'Noise Reduction',
          size_mb: 34,
          is_installed: false,
          description: 'Deep learning color and luminance noise suppression for high ISO RAW files.',
        },
        {
          id: 'segment_anything',
          name: 'MobileSAM Subject Segmenter',
          category: 'Segmentation & Masks',
          size_mb: 40,
          is_installed: false,
          description: 'Real-time 1-click subject and foreground segmentation mask generator.',
        },
      ],
    };
    if (!this.bridge?.get_local_ai_status) {
      return fallback;
    }
    try {
      const res = await this.bridge.get_local_ai_status();
      return typeof res === 'string'
        ? (JSON.parse(res) as { models: LocalAIModelInfo[] })
        : (res as { models: LocalAIModelInfo[] }) || fallback;
    } catch {
      return fallback;
    }
  }

  public async deleteLocalAIModel(modelId: string): Promise<boolean> {
    if (!this.bridge?.delete_local_ai_model) {
      return true;
    }
    const res = await this.bridge.delete_local_ai_model(modelId);
    const parsed = typeof res === 'string' ? JSON.parse(res) : res;
    return (parsed as { ok?: boolean })?.ok === true;
  }
}

export const bridge = new PythonBridge();
