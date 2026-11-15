import React, { useState, useEffect } from 'react';
import { ImageAsset, ExportPreset } from '../types';
import {
  Send,
  FolderOpen,
  Image,
  FileDown,
  ChevronDown,
  CheckSquare,
  Square,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Type,
  Sliders,
  Maximize2,
  Layers,
  UserRound,
  Pause,
  Play,
  X,
} from 'lucide-react';
import { bridge } from '../bridge';
import { useAppStore } from '../stores/useAppStore';
import kuroAppIcon from '../assets/logo-preview.png';
import kuroWordmark from '../assets/KuroLight-wordmark.svg';
import { GalleryThumbnail } from '../components/gallery/GalleryThumbnail';
import { matchesSmartCollectionRules } from '../utils/smartCollections';
import type { DeliverPageProps, ExportRecipe } from '../interfaces';
import type { ExportFormat, ColorSpace, ResizeMode, WatermarkPosition, WatermarkType } from '../types';
import { FORMAT_OPTIONS, RECIPES_KEY } from '../constants';
import { getCachedLocalEditState } from '../utils/storage/imageIndexedDb';
import { encodeLUTCube, isBuiltinLUT, loadLUT } from '../utils/webgl/lut';
import type { EditState } from '../interfaces/edit';

export type { DeliverPageProps, ExportRecipe };

function readRecipes(): ExportRecipe[] {
  try {
    const stored = localStorage.getItem(RECIPES_KEY);
    return stored ? (JSON.parse(stored) as ExportRecipe[]) : [];
  } catch (error) {
    console.error('Could not read saved export recipes', error);
    return [];
  }
}

export const DeliverPage: React.FC<DeliverPageProps> = ({
  assets,
  activeAsset,
  collections,
  activeCollectionId,
}) => {
  const currentCollection = collections.find(
    (collection) => collection.id === activeCollectionId
  );
  const currentCollectionId = currentCollection?.id;
  const currentCollectionAssetCount = currentCollection?.asset_count;
  const activeAssetId = activeAsset?.id;
  const initialScope = currentCollection ? 'collection' : 'photo';
  const assetsForScope = (scope: 'collection' | 'photo' | 'all') => {
    if (scope === 'all') return assets;
    if (scope === 'collection' && currentCollection) {
      if (currentCollection.collection_type === 'smart' && currentCollection.rules) {
        return assets.filter((asset) =>
          matchesSmartCollectionRules(asset, currentCollection.rules!)
        );
      }
      const ids = new Set(currentCollection.asset_ids ?? []);
      return assets.filter((asset) => ids.has(asset.id));
    }
    return activeAsset ? [activeAsset] : [];
  };

  // Presets from Python backend
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Export settings
  const [format, setFormat] = useState<ExportFormat>('JPEG');
  const [quality, setQuality] = useState(90);
  const colorSpace: ColorSpace = 'sRGB';
  const [resizeMode, setResizeMode] = useState<ResizeMode>('original');
  const [resizeValue, setResizeValue] = useState(2048);
  const [resizeUnit, setResizeUnit] = useState<'px' | '%'>('px');
  const [outputFolder, setOutputFolder] = useState('');
  const [filenamePattern, setFilenamePattern] = useState('{name}_export');
  const [recipeName, setRecipeName] = useState('');
  const [customRecipes, setCustomRecipes] = useState<ExportRecipe[]>(readRecipes);

  // Watermark settings
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkType, setWatermarkType] = useState<WatermarkType>('app_icon');
  const [watermarkText, setWatermarkText] = useState('© KuroLight Studio');
  const [watermarkOpacity, setWatermarkOpacity] = useState(75);
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>('bottom_right');

  // Asset selection
  const [exportScope, setExportScope] = useState<'collection' | 'photo' | 'all'>(initialScope);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(
    () => new Set(assetsForScope(initialScope).map((asset) => asset.id))
  );
  const [scopeAssets, setScopeAssets] = useState<ImageAsset[]>([]);
  const [scopeTotal, setScopeTotal] = useState(0);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [scopeRefreshKey, setScopeRefreshKey] = useState(0);

  // Execution state
  const [isExporting, setIsExporting] = useState(false);
  const [exportJob, setExportJob] = useState<{
    id: string; status: string; total: number; completed: number; succeeded: number;
    failed: number; progress: number; current_asset: string; errors: string[]; output_folder: string;
  } | null>(null);
  const [exportResult, setExportResult] = useState<{
    ok: boolean;
    count: number;
    failed: number;
    error?: string;
    errors?: string[];
    output_folder?: string;
  } | null>(null);

  const scopedAssets = bridge.hasNativeApi
    ? exportScope === 'photo'
      ? activeAsset ? [activeAsset] : []
      : scopeAssets
    : assetsForScope(exportScope);
  const scopeAssetCount = bridge.hasNativeApi ? scopeTotal : scopedAssets.length;

  useEffect(() => {
    if (!bridge.hasNativeApi) return;
    let cancelled = false;
    const loadScope = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setScopeLoading(true);
      setScopeError(null);
      setScopeAssets([]);
      setScopeTotal(0);
      setSelectedAssetIds(new Set());
      try {
        if (exportScope === 'photo') {
          setScopeTotal(activeAssetId ? 1 : 0);
          setSelectedAssetIds(new Set(activeAssetId ? [activeAssetId] : []));
          return;
        }
        if (exportScope === 'collection' && !currentCollectionId) {
          setScopeAssets([]);
          setScopeTotal(0);
          setSelectedAssetIds(new Set());
          return;
        }
        const filters = exportScope === 'collection' && currentCollectionId
          ? { collection_id: currentCollectionId }
          : {};
        const page = await bridge.getAssetPage(0, 100, filters);
        const ids = await bridge.getAssetIds(filters);
        if (cancelled) return;
        setScopeAssets(page.assets);
        setScopeTotal(page.total);
        setSelectedAssetIds(new Set(ids));
      } catch (error) {
        if (!cancelled) {
          setScopeError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setScopeLoading(false);
      }
    };
    void loadScope();
    return () => {
      cancelled = true;
    };
  }, [
    exportScope,
    currentCollectionId,
    currentCollectionAssetCount,
    activeAssetId,
    scopeRefreshKey,
  ]);

  // Fetch export presets from backend
  useEffect(() => {
    bridge.getExportPresets().then((list) => {
      if (list && list.length > 0) {
        setPresets(list);
      }
    });
  }, []);

  useEffect(() => {
    localStorage.setItem(RECIPES_KEY, JSON.stringify(customRecipes));
  }, [customRecipes]);

  const isLossy = FORMAT_OPTIONS.find((f) => f.id === format)?.lossy ?? true;
  const isAllSelected =
    scopeAssetCount > 0 &&
    selectedAssetIds.size === scopeAssetCount &&
    scopedAssets.every((asset) => selectedAssetIds.has(asset.id));
  const selectedCount = selectedAssetIds.size;

  const toggleSelectAll = () => {
    if (exportScope === 'collection' && !currentCollection) {
      setSelectedAssetIds(new Set());
      return;
    }
    if (isAllSelected) {
      setSelectedAssetIds(new Set());
    } else {
      const filters = exportScope === 'collection' && currentCollection
        ? { collection_id: currentCollection.id }
        : {};
      if (bridge.hasNativeApi && exportScope !== 'photo') {
        bridge.getAssetIds(filters)
          .then((ids) => setSelectedAssetIds(new Set(ids)))
          .catch((error: unknown) => {
            setScopeError(error instanceof Error ? error.message : String(error));
          });
      } else {
        setSelectedAssetIds(new Set(scopedAssets.map((asset) => asset.id)));
      }
    }
  };

  const toggleAssetSelection = (id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleScopeChange = (scope: 'collection' | 'photo' | 'all') => {
    setExportScope(scope);
    if (!bridge.hasNativeApi) {
      setSelectedAssetIds(new Set(assetsForScope(scope).map((asset) => asset.id)));
    }
    setExportResult(null);
  };

  const loadMoreScopeAssets = async () => {
    if (scopeLoading || scopeAssets.length >= scopeTotal) return;
    setScopeLoading(true);
    setScopeError(null);
    const filters = exportScope === 'collection' && currentCollection
      ? { collection_id: currentCollection.id }
      : {};
    try {
      const page = await bridge.getAssetPage(scopeAssets.length, 100, filters);
      setScopeAssets((current) => [...current, ...page.assets]);
      setScopeTotal(page.total);
    } catch (error) {
      setScopeError(error instanceof Error ? error.message : String(error));
    } finally {
      setScopeLoading(false);
    }
  };

  const applyPreset = (preset: ExportPreset) => {
    setActivePresetId(preset.id);
    setFormat(preset.format);
    setQuality(preset.quality);
    if (preset.resize_mode === 'fit_long') setResizeMode('fit_long');
    else if (preset.resize_mode === 'original') setResizeMode('original');
    else setResizeMode((preset.resize_mode as ResizeMode) || 'original');

    if (preset.resize_value > 0) setResizeValue(preset.resize_value);
    setResizeUnit(preset.resize_unit || 'px');
    const recipe = preset as Partial<ExportRecipe>;
    if (recipe.filename_pattern) setFilenamePattern(recipe.filename_pattern);
    if (recipe.watermark_enabled !== undefined) {
      setWatermarkEnabled(recipe.watermark_enabled);
      const savedWatermarkType = recipe.watermark_type ?? 'text';
      setWatermarkType(savedWatermarkType === 'logo' ? 'app_icon' : savedWatermarkType);
    }
    if (recipe.watermark_text) setWatermarkText(recipe.watermark_text);
    if (recipe.watermark_opacity !== undefined) setWatermarkOpacity(Math.round(recipe.watermark_opacity * 100));
    if (recipe.watermark_position) setWatermarkPosition(recipe.watermark_position);
  };

  const saveRecipe = () => {
    const name = recipeName.trim();
    if (!name) return;
    const recipe: ExportRecipe = {
      id: `custom_${Date.now()}`,
      name,
      format,
      quality,
      color_space: colorSpace,
      resize_mode: resizeMode,
      resize_value: resizeValue,
      resize_unit: resizeUnit,
      filename_pattern: filenamePattern,
      watermark_enabled: watermarkEnabled,
      watermark_type: watermarkType,
      watermark_text: watermarkText,
      watermark_opacity: watermarkOpacity / 100,
      watermark_position: watermarkPosition,
    };
    setCustomRecipes((current) => [...current.filter((item) => item.name !== name), recipe]);
    setRecipeName('');
  };

  const handleBrowseFolder = () => {
    bridge.chooseExportFolder().then((folder) => {
      if (folder) setOutputFolder(folder);
    });
  };

  const handleExport = async () => {
    if (selectedCount === 0) return;
    setIsExporting(true);
    setExportResult(null);

    try {
      const settings = {
        format,
        quality: isLossy ? quality : 100,
        color_space: colorSpace,
        resize_mode: resizeMode,
        resize_value: resizeValue,
        resize_unit: resizeUnit,
        output_folder: outputFolder || null,
        filename_pattern: filenamePattern || '{name}_export',
        asset_ids: Array.from(selectedAssetIds),
        watermark_enabled: watermarkEnabled,
        watermark_type: watermarkType,
        watermark_text: watermarkText,
        watermark_opacity: watermarkOpacity / 100.0,
        watermark_position: watermarkPosition,
      };

      const current = useAppStore.getState();
      const editStates: Record<string, EditState> = {};
      await Promise.all(
        settings.asset_ids.map(async (assetId) => {
          if (current.activeAsset?.id === assetId) {
            if (current.editState.asset_id !== assetId) {
              throw new Error(`The active edit state does not match photo "${assetId}".`);
            }
            editStates[assetId] = current.editState;
            return;
          }
          const cachedState = await getCachedLocalEditState(assetId);
          if (cachedState && cachedState.asset_id !== assetId) {
            throw new Error(`The browser edit cache does not match photo "${assetId}".`);
          }
          if (cachedState) editStates[assetId] = cachedState;
        })
      );

      const customLUTs: Record<string, { size: number; data_base64: string }> = {};
      const customLUTNames = new Set(
        Object.values(editStates)
          .filter((state) => (state.color_grading?.lut_intensity ?? 1) > 0)
          .map((state) => state.color_grading?.lut_name)
          .filter(
            (name): name is string =>
              typeof name === 'string' && name.length > 0 && !isBuiltinLUT(name)
          )
      );
      await Promise.all(
        Array.from(customLUTNames, async (name) => {
          const cube = await loadLUT(name);
          if (!cube) {
            throw new Error(`Custom LUT "${name}" is missing from this browser.`);
          }
          customLUTs[name] = { size: cube.size, data_base64: encodeLUTCube(cube) };
        })
      );

      const started = await bridge.exportAssets({
        ...settings,
        edit_states: editStates,
        custom_luts: customLUTs,
      });
      if (!started.ok || !started.job_id) {
        throw new Error(started.error ?? 'Could not start the export batch');
      }

      let job = await bridge.getExportJob(started.job_id);
      setExportJob(job);
      while (!['completed', 'failed', 'cancelled'].includes(job.status)) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await bridge.getExportJob(started.job_id);
        setExportJob(job);
      }
      setExportResult({
        ok: job.status === 'completed' && job.failed === 0,
        count: job.succeeded,
        failed: job.failed,
        errors: job.errors,
        output_folder: job.output_folder,
        error: job.status === 'cancelled' ? 'Export was cancelled.' : undefined,
      });
    } catch (err: unknown) {
      setExportResult({
        ok: false,
        count: 0,
        failed: selectedCount,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    } finally {
      setIsExporting(false);
    }
  };

  const controlExport = async (action: 'pause' | 'resume' | 'cancel') => {
    if (!exportJob) return;
    try {
      await bridge.controlExportJob(exportJob.id, action);
      setExportJob(await bridge.getExportJob(exportJob.id));
    } catch (error) {
      setExportResult({
        ok: false,
        count: exportJob.succeeded,
        failed: exportJob.failed,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-obsidian-deep select-none">
      {/* ── Left Sidebar: Queue / Asset Selection ─────────────────────── */}
      <aside className="w-72 flex-shrink-0 bg-obsidian-panel border-r border-obsidian-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-obsidian-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image size={13} className="text-obsidian-accent" />
            <span className="text-[10px] font-bold tracking-wider uppercase text-obsidian-textSec">
              Export Queue
            </span>
          </div>
          <span className="text-[9.5px] px-2 py-0.5 rounded-full bg-obsidian-card border border-obsidian-border text-obsidian-textMut font-mono">
            {selectedCount} / {scopeAssetCount}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 p-2 border-b border-obsidian-border">
          <button
            onClick={() => handleScopeChange('collection')}
            disabled={!currentCollection}
            className={`rounded px-1 py-1.5 text-[9px] font-semibold flex flex-col items-center gap-1 disabled:opacity-40 ${
              exportScope === 'collection'
                ? 'bg-obsidian-accent/20 text-white border border-obsidian-accent/60'
                : 'bg-obsidian-card text-obsidian-textMut border border-obsidian-border'
            }`}
            title={currentCollection?.name ?? 'Select a collection in Gallery first'}
          >
            <Layers size={12} />
            Collection
          </button>
          <button
            onClick={() => handleScopeChange('photo')}
            className={`rounded px-1 py-1.5 text-[9px] font-semibold flex flex-col items-center gap-1 ${
              exportScope === 'photo'
                ? 'bg-obsidian-accent/20 text-white border border-obsidian-accent/60'
                : 'bg-obsidian-card text-obsidian-textMut border border-obsidian-border'
            }`}
            title={activeAsset?.file_name ?? 'Current photo'}
          >
            <UserRound size={12} />
            Current Photo
          </button>
          <button
            onClick={() => handleScopeChange('all')}
            className={`rounded px-1 py-1.5 text-[9px] font-semibold flex flex-col items-center gap-1 ${
              exportScope === 'all'
                ? 'bg-obsidian-accent/20 text-white border border-obsidian-accent/60'
                : 'bg-obsidian-card text-obsidian-textMut border border-obsidian-border'
            }`}
          >
            <Image size={12} />
            All Photos
          </button>
        </div>
        <div className="px-3 py-2 border-b border-obsidian-border/70">
          <p className="truncate text-[10px] font-semibold text-white">
            {exportScope === 'collection'
              ? currentCollection?.name ?? 'No collection selected'
              : exportScope === 'photo'
                ? activeAsset?.file_name ?? 'No photo selected'
                : 'Entire photo library'}
          </p>
          <p className="text-[9px] text-obsidian-textMut">
            {scopeAssetCount} photo{scopeAssetCount === 1 ? '' : 's'} available
          </p>
        </div>

        {/* Toggle Select All */}
        <button
          onClick={toggleSelectAll}
          disabled={exportScope === 'collection' && !currentCollection}
          className="flex items-center justify-between px-3 py-2 hover:bg-obsidian-hover border-b border-obsidian-border text-[10.5px] font-semibold text-obsidian-textPri transition-colors"
        >
          <div className="flex items-center gap-2">
            {isAllSelected ? (
              <CheckSquare size={13} className="text-obsidian-accent" />
            ) : (
              <Square size={13} className="text-obsidian-textMut" />
            )}
            <span>Select All Photos</span>
          </div>
          <span className="text-[9px] text-obsidian-textMut uppercase">
            {isAllSelected ? 'Deselect' : 'All'}
          </span>
        </button>

        {/* Queue Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-obsidian-border/30">
          {scopedAssets.map((a) => {
            const isChecked = selectedAssetIds.has(a.id);
            return (
              <div
                key={a.id}
                onClick={() => toggleAssetSelection(a.id)}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                  isChecked ? 'bg-obsidian-accent/10 hover:bg-obsidian-accent/15' : 'hover:bg-obsidian-hover'
                }`}
              >
                {isChecked ? (
                  <CheckSquare size={13} className="text-obsidian-accent flex-shrink-0" />
                ) : (
                  <Square size={13} className="text-obsidian-textMut flex-shrink-0" />
                )}

                {/* Thumbnail */}
                <GalleryThumbnail
                  assetId={a.id}
                  alt=""
                  className="w-9 h-9 rounded bg-obsidian-deep overflow-hidden flex-shrink-0 border border-obsidian-border/50 flex items-center justify-center"
                  fallback={<Image size={14} className="text-obsidian-textMut/40" />}
                />

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10.5px] font-medium text-obsidian-textPri truncate">
                    {a.file_name || a.id}
                  </div>
                  <div className="text-[9px] text-obsidian-textMut flex items-center gap-1.5 font-mono">
                    <span>{a.format || 'IMG'}</span>
                    {a.width && a.height ? (
                      <>
                        <span>•</span>
                        <span>{a.width}×{a.height}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}

          {scopedAssets.length === 0 && (
            <div className="px-3 py-12 text-center text-[10.5px] text-obsidian-textMut space-y-1">
              <Image size={24} className="mx-auto text-obsidian-textMut/40 mb-2" />
              <p>No photos in this scope</p>
              <p className="text-[9px]">Choose another scope or import photos</p>
            </div>
          )}
          {scopeError && (
            <div className="p-3 text-center text-[10px] text-red-300" role="alert">
              Could not load export queue: {scopeError}
              <button
                type="button"
                onClick={() => setScopeRefreshKey((key) => key + 1)}
                className="ml-2 underline"
              >
                Retry
              </button>
            </div>
          )}
          {bridge.hasNativeApi && scopeAssets.length < scopeTotal && (
            <button
              type="button"
              onClick={() => void loadMoreScopeAssets()}
              disabled={scopeLoading}
              className="w-full px-3 py-3 text-xs text-obsidian-textSec hover:bg-obsidian-hover disabled:opacity-60"
            >
              {scopeLoading ? 'Loading photos…' : `Load more (${scopeTotal - scopeAssets.length} remaining)`}
            </button>
          )}
        </div>
      </aside>

      {/* ── Main Panel: Export Configuration ─────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-y-auto items-center py-5 px-5 lg:px-8 gap-5">
        <div className="w-full max-w-4xl space-y-5">
          {/* Top Title & Presets */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between pb-1 border-b border-obsidian-border">
              <div className="flex items-center gap-2">
                <FileDown size={17} className="text-obsidian-accent" />
                <h1 className="text-sm font-bold text-white tracking-wide uppercase">
                  Deliver & Export Settings
                </h1>
              </div>
              <span className="text-[10px] text-obsidian-textMut font-mono">
                  {selectedCount} selected · {scopeAssetCount} in scope
              </span>
            </div>

            {/* Quick Presets Carousel */}
            {(presets.length > 0 || customRecipes.length > 0) && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[9.5px] font-bold text-obsidian-textSec uppercase tracking-wider">
                  <Sparkles size={11} className="text-yellow-400" />
                  <span>Quick Presets</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((p) => {
                    const isSelected = activePresetId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => applyPreset(p)}
                        className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition-all ${
                          isSelected
                            ? 'bg-obsidian-accent border-obsidian-accent text-white shadow-sm'
                            : 'bg-obsidian-card border-obsidian-border text-obsidian-textPri hover:bg-obsidian-hover hover:border-obsidian-textMut'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                  {customRecipes.map((recipe) => (
                    <div key={recipe.id} className="flex items-center rounded border border-obsidian-border bg-obsidian-card">
                      <button
                        onClick={() => applyPreset(recipe)}
                        className="px-2.5 py-1 text-[10px] font-semibold text-obsidian-textPri hover:bg-obsidian-hover"
                      >
                        {recipe.name}
                      </button>
                      <button
                        onClick={() => setCustomRecipes((current) => current.filter((item) => item.id !== recipe.id))}
                        title={`Delete ${recipe.name}`}
                        className="border-l border-obsidian-border px-1.5 py-1 text-obsidian-textMut hover:text-red-300"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={recipeName}
                onChange={(event) => setRecipeName(event.target.value)}
                placeholder="Name this export recipe"
                className="min-w-0 flex-1 rounded border border-obsidian-border bg-obsidian-input px-2.5 py-1.5 text-xs text-white outline-none focus:border-obsidian-accent"
              />
              <button
                onClick={saveRecipe}
                disabled={!recipeName.trim()}
                className="rounded border border-obsidian-border bg-obsidian-card px-3 py-1.5 text-xs font-semibold text-white hover:bg-obsidian-hover disabled:opacity-40"
              >
                Save Recipe
              </button>
            </div>
          </div>

          {/* 2-Column Settings Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Column 1: Format & Quality */}
            <div className="space-y-4 bg-obsidian-panel/50 border border-obsidian-border p-3.5 rounded-lg shadow-sm">
              <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
                <Sliders size={12} className="text-obsidian-accent" />
                <span>Format & Compression</span>
              </div>

              {/* Format selection */}
              <div className="space-y-1.5">
                <label className="text-[9.5px] font-semibold uppercase tracking-wider text-obsidian-textMut">
                  Container Format
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {FORMAT_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        setFormat(f.id);
                        setActivePresetId(null);
                      }}
                      className={`py-1.5 rounded text-[10.5px] font-bold border transition-colors ${
                        format === f.id
                          ? 'bg-obsidian-accent border-obsidian-accent text-white'
                          : 'bg-obsidian-elevated border-obsidian-border text-obsidian-textPri hover:bg-obsidian-hover'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality slider */}
              {isLossy ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold uppercase tracking-wider text-obsidian-textMut">
                      JPEG / WebP Quality
                    </span>
                    <span className="font-mono font-bold text-white">{quality}%</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={quality}
                    onChange={(e) => {
                      setQuality(Number(e.target.value));
                      setActivePresetId(null);
                    }}
                    className="w-full h-1.5 rounded appearance-none cursor-pointer accent-obsidian-accent bg-obsidian-deep"
                  />
                  <div className="flex justify-between text-[8.5px] text-obsidian-textMut font-mono">
                    <span>Compressed</span>
                    <span>Standard (85)</span>
                    <span>Max Quality (100)</span>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-obsidian-textMut bg-obsidian-deep/50 p-2 rounded border border-obsidian-border/50">
                  <span className="text-white font-semibold">{format}</span> uses its format-specific encoder; the quality slider applies to JPEG and WebP.
                </div>
              )}

              {/* Color Space */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[9.5px] font-semibold uppercase tracking-wider text-obsidian-textMut">
                  Color Profile
                </label>
                <div className="rounded border border-obsidian-border bg-obsidian-input px-3 py-2 text-[10px] text-obsidian-textSec">
                  sRGB is currently supported. Wide-gamut conversion and ICC profile embedding are not available yet.
                </div>
              </div>
            </div>

            {/* Column 2: Dimensions & Resizing */}
            <div className="space-y-4 bg-obsidian-panel/50 border border-obsidian-border p-3.5 rounded-lg shadow-sm">
              <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
                <Maximize2 size={12} className="text-emerald-400" />
                <span>Dimensions & Scaling</span>
              </div>

              {/* Resize mode */}
              <div className="space-y-1.5">
                <label className="text-[9.5px] font-semibold uppercase tracking-wider text-obsidian-textMut">
                  Resize Strategy
                </label>
                <div className="relative">
                  <select
                    value={resizeMode}
                    onChange={(e) => {
                      setResizeMode(e.target.value as ResizeMode);
                      setActivePresetId(null);
                    }}
                    className="w-full bg-obsidian-input border border-obsidian-border rounded px-3 py-1.5 text-xs font-semibold text-white outline-none focus:border-obsidian-accent appearance-none cursor-pointer pr-8"
                  >
                    <option value="original">Original Dimensions (No Resizing)</option>
                    <option value="fit_long">Fit Longest Edge</option>
                    <option value="fit_width">Fit Width</option>
                    <option value="fit_height">Fit Height</option>
                    <option value="fit_short">Fit Shortest Edge</option>
                    <option value="custom">Custom Longest Edge</option>
                  </select>
                  <ChevronDown
                    size={13}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-obsidian-textMut pointer-events-none"
                  />
                </div>
              </div>

              {/* Value & Units */}
              {resizeMode !== 'original' ? (
                <div className="space-y-1.5">
                  <label className="text-[9.5px] font-semibold uppercase tracking-wider text-obsidian-textMut">
                    {resizeMode === 'fit_width'
                      ? 'Target Width'
                      : resizeMode === 'fit_height'
                        ? 'Target Height'
                        : resizeMode === 'fit_short'
                          ? 'Target Shortest Edge'
                          : 'Target Longest Edge'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={resizeValue}
                      onChange={(e) => {
                        setResizeValue(Number(e.target.value));
                        setActivePresetId(null);
                      }}
                      className="flex-1 bg-obsidian-input border border-obsidian-border rounded px-3 py-1.5 text-xs font-mono font-bold text-white outline-none focus:border-obsidian-accent"
                    />
                    <div className="flex border border-obsidian-border rounded overflow-hidden text-[10px] font-bold">
                      {(['px', '%'] as const).map((u) => (
                        <button
                          key={u}
                          onClick={() => {
                            setResizeUnit(u);
                            setActivePresetId(null);
                          }}
                          className={`px-3 py-1 ${
                            resizeUnit === u
                              ? 'bg-obsidian-accent text-white'
                              : 'bg-obsidian-elevated text-obsidian-textPri hover:bg-obsidian-hover'
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-obsidian-textMut bg-obsidian-deep/50 p-2 rounded border border-obsidian-border/50">
                  Full original sensor resolution will be preserved without resampling.
                </div>
              )}

              {/* Metadata filename template */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[9.5px] font-semibold uppercase tracking-wider text-obsidian-textMut">
                  Filename Template
                </label>
                <input
                  type="text"
                  value={filenamePattern}
                  onChange={(e) => setFilenamePattern(e.target.value)}
                  placeholder="{name}_{date}_{camera}"
                  className="w-full bg-obsidian-input border border-obsidian-border rounded px-3 py-1.5 text-xs text-white placeholder:text-obsidian-textMut outline-none focus:border-obsidian-accent font-mono"
                />
                <p className="text-[9px] text-obsidian-textMut">
                  Tokens: {'{name}'} {'{date}'} {'{camera}'} {'{iso}'} {'{focal_length}'}
                </p>
              </div>
            </div>
          </div>

          {/* Watermark Section */}
          <div className="bg-obsidian-panel/50 border border-obsidian-border p-3.5 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type size={13} className="text-purple-400" />
                <span className="text-[10.5px] font-bold tracking-wider uppercase text-white">
                  Studio Watermark
                </span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-[10px] text-obsidian-textPri">
                <input
                  type="checkbox"
                  checked={watermarkEnabled}
                  onChange={(e) => setWatermarkEnabled(e.target.checked)}
                  className="accent-obsidian-accent cursor-pointer"
                />
                <span>Enable Watermark</span>
              </label>
            </div>

            {watermarkEnabled && (
              <div className="space-y-3 pt-3 border-t border-obsidian-border/50">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[9px] font-semibold uppercase tracking-wider text-obsidian-textMut">Style</span>
                  {(['app_icon', 'wordmark', 'text'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setWatermarkType(type)}
                      aria-pressed={watermarkType === type}
                      className={`flex h-8 items-center gap-2 rounded-lg border px-3 text-[10px] font-semibold transition-colors ${
                        watermarkType === type
                          ? 'border-obsidian-accent/60 bg-obsidian-accent/15 text-white'
                          : 'border-obsidian-border bg-obsidian-card text-obsidian-textMut hover:text-white'
                      }`}
                    >
                      {type === 'app_icon' ? (
                        <>
                          <img src={kuroAppIcon} alt="" className="h-5 w-5 object-contain" />
                          App icon
                        </>
                      ) : type === 'wordmark' ? (
                        <>
                          <img src={kuroWordmark} alt="" className="h-4 w-16 object-contain" />
                          Wordmark
                        </>
                      ) : (
                        <>
                          <Type size={12} />
                          Text
                        </>
                      )}
                    </button>
                  ))}
                  {watermarkType !== 'text' && (
                    <span className="text-[9px] text-obsidian-textMut">
                      KuroLight {watermarkType === 'wordmark' ? 'wordmark' : 'app icon'} watermark
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                {watermarkType === 'text' && <div className="space-y-1">
                  <label className="text-[9px] font-semibold uppercase tracking-wider text-obsidian-textMut">
                    Text
                  </label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    className="w-full bg-obsidian-input border border-obsidian-border rounded px-2.5 py-1 text-xs text-white outline-none focus:border-obsidian-accent font-mono"
                  />
                </div>}

                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-semibold uppercase tracking-wider text-obsidian-textMut">
                    <span>Opacity</span>
                    <span className="text-white font-mono">{watermarkOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={watermarkOpacity}
                    onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                    className="w-full h-1.5 rounded appearance-none cursor-pointer accent-obsidian-accent bg-obsidian-deep"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-semibold uppercase tracking-wider text-obsidian-textMut">
                    Position
                  </label>
                  <select
                    value={watermarkPosition}
                    onChange={(e) => setWatermarkPosition(e.target.value as WatermarkPosition)}
                    className="w-full bg-obsidian-input border border-obsidian-border rounded px-2.5 py-1 text-xs font-semibold text-white outline-none focus:border-obsidian-accent"
                  >
                    <option value="bottom_right">Bottom Right</option>
                    <option value="bottom_left">Bottom Left</option>
                    <option value="top_right">Top Right</option>
                    <option value="center">Center</option>
                  </select>
                </div>
                </div>
              </div>
            )}
          </div>

          {/* Destination Folder */}
          <div className="bg-obsidian-panel/50 border border-obsidian-border p-3.5 rounded-lg space-y-2">
            <label className="text-[9.5px] font-semibold uppercase tracking-wider text-obsidian-textMut flex items-center justify-between">
              <span>Output Destination</span>
              <span className="text-[8.5px] text-obsidian-textMut">
                {outputFolder ? 'Custom Folder' : 'Default (Source directory)'}
              </span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={outputFolder}
                onChange={(e) => setOutputFolder(e.target.value)}
                placeholder="Same folder as source photo (Default)"
                className="flex-1 bg-obsidian-input border border-obsidian-border rounded px-3 py-1.5 text-xs text-white placeholder:text-obsidian-textMut outline-none focus:border-obsidian-accent font-mono"
              />
              <button
                onClick={handleBrowseFolder}
                className="px-3 py-1.5 bg-obsidian-elevated hover:bg-obsidian-hover border border-obsidian-border hover:border-obsidian-textMut rounded text-obsidian-textPri text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Browse folder on computer"
              >
                <FolderOpen size={13} className="text-obsidian-accent" />
                <span>Browse…</span>
              </button>
            </div>
          </div>

          {/* Export Action Card */}
          <div className="space-y-3 pt-2">
            {/* Progress / Status banner */}
            {isExporting && (
              <div className="bg-obsidian-panel border border-obsidian-accent/50 p-3 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-obsidian-accent">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    <span>
                      {exportJob?.status === 'paused'
                        ? 'Export paused'
                        : `Exporting ${exportJob?.current_asset || 'images'}…`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px]">
                      {exportJob?.completed ?? 0}/{exportJob?.total ?? selectedCount} · {Math.round((exportJob?.progress ?? 0) * 100)}%
                    </span>
                    {exportJob?.status === 'paused' || exportJob?.status === 'pausing' ? (
                      <button onClick={() => void controlExport('resume')} title="Resume export" className="rounded p-1 hover:bg-obsidian-hover">
                        <Play size={13} />
                      </button>
                    ) : (
                      <button onClick={() => void controlExport('pause')} title="Pause after current image" className="rounded p-1 hover:bg-obsidian-hover">
                        <Pause size={13} />
                      </button>
                    )}
                    <button onClick={() => void controlExport('cancel')} title="Cancel export batch" className="rounded p-1 text-red-300 hover:bg-obsidian-hover">
                      <X size={13} />
                    </button>
                  </div>
                </div>
                <div className="w-full bg-obsidian-deep h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-obsidian-accent h-full rounded-full transition-all"
                    style={{ width: `${Math.round((exportJob?.progress ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Result Report */}
            {exportResult && (
              <div
                className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                  exportResult.ok
                    ? 'bg-emerald-950/20 border-emerald-600/40 text-emerald-200'
                    : 'bg-red-950/20 border-red-600/40 text-red-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {exportResult.ok ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : (
                    <AlertTriangle size={16} className="text-red-400" />
                  )}
                  <span>
                    {exportResult.ok
                      ? `Successfully exported ${exportResult.count} photo(s)`
                      : `Export failed`}
                  </span>
                </div>

                {exportResult.output_folder && (
                  <p className="text-[10px] text-obsidian-textMut font-mono truncate">
                    Destination: {exportResult.output_folder}
                  </p>
                )}

                {exportResult.errors && exportResult.errors.length > 0 && (
                  <ul className="text-[10px] text-red-300 list-disc list-inside">
                    {exportResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
                {exportResult.error && (
                  <p className="text-[10px] text-red-300">{exportResult.error}</p>
                )}
              </div>
            )}

            {/* Execute Button */}
            <button
              onClick={handleExport}
              disabled={isExporting || selectedCount === 0}
              className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md ${
                isExporting || selectedCount === 0
                  ? 'bg-obsidian-elevated text-obsidian-textMut border border-obsidian-border cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/30 hover:shadow-blue-700/40'
              }`}
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Exporting…</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>
                    Export {selectedCount} Photo{selectedCount !== 1 ? 's' : ''} as {format}
                  </span>
                </>
              )}
            </button>

            <p className="text-center text-[10px] text-obsidian-textMut">
              {selectedCount === 0
                ? 'Select one or more photos from the left queue to begin export'
                : `Ready to render ${selectedCount} photo${selectedCount !== 1 ? 's' : ''} through non-destructive editing pipeline`}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};


