import React, { useEffect, useRef, useState } from 'react';
import { 
  SlidersHorizontal, 
  Palette, 
  Wand2,
  Star, 
  History, 
  ChevronDown, 
  ChevronRight, 
  RotateCcw, 
  Sparkles, 
  Crop, 
  FlipHorizontal, 
  FlipVertical,
  KeyRound,
  Sun,
  Layers,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Eraser,
  Pipette,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AdjustmentMask,
  AdjustmentMaskType,
  EditSnapshot,
  EditState,
  Preset,
  ImageAsset,
  RetouchMode,
  RetouchSpot,
} from '../types';
import { ColorTab } from './lightbox/ColorTab';
import { PresetsTab } from './lightbox/PresetsTab';
import { HistoryTab } from './lightbox/HistoryTab';
import { HistogramCard } from './lightbox/HistogramCard';
import { ResizeHandle } from './common/ResizeHandle';
import { ColorPickerInput } from './common/ColorPickerInput';
import { colorToHsv } from '@/utils/color';
import { bridge } from '../bridge';
import type { HistogramData } from '../interfaces/scopes';

interface RightPanelProps {
  editState: EditState;
  selectedMaskId?: string | null;
  onMaskSelect?: (maskId: string | null) => void;
  selectedRetouchSpotId?: string | null;
  onRetouchSpotSelect?: (spotId: string | null) => void;
  onChange: (newState: EditState) => void;
  onAutoTone?: () => void;
  onPreviewAIRestoration?: () => void;
  isRestorationRunning?: boolean;
  hasRestorationPreview?: boolean;
  onResetAll?: () => void;
  isCropActive?: boolean;
  onToggleCrop?: () => void;
  onSelectAspectRatio?: (ratio: string) => void;
  presets?: Preset[];
  onApplyPreset: (presetId: string) => void;
  onSavePreset: (name: string, category: string) => void | Promise<void>;
  onDeletePreset: (presetId: string) => void | Promise<void>;
  editUndoStack?: EditState[];
  editRedoStack?: EditState[];
  currentEditState: EditState;
  onJumpEditHistory?: (index: number) => void;
  snapshots?: Record<string, EditSnapshot>;
  onSnapshotChange?: (editState: EditState) => void;
  histogram?: HistogramData;
  activeAsset?: ImageAsset | null;
  width?: number;
  onResize?: (delta: number) => void;
  onResetWidth?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onRequestColorSample?: (onSample: (color: string) => void) => void;
  onCancelColorSample?: () => void;
}

const PrecisionSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (val: number) => void;
}> = ({ label, value, min, max, step = 1, defaultValue = 0, unit = '', onChange }) => {
  const [draftState, setDraftState] = useState({ value, draft: String(value) });
  const draft = draftState.value === value ? draftState.draft : String(value);
  const progress = ((value - min) / (max - min)) * 100;
  const zeroPosition = min < 0 && max > 0 ? ((0 - min) / (max - min)) * 100 : 0;
  const fillStart = min < 0 && max > 0 ? Math.min(zeroPosition, progress) : 0;
  const fillEnd = min < 0 && max > 0 ? Math.max(zeroPosition, progress) : progress;
  const rangeTrack = `linear-gradient(to right, #292e37 0%, #292e37 ${fillStart}%, #27b7ff ${fillStart}%, #27b7ff ${fillEnd}%, #292e37 ${fillEnd}%, #292e37 100%)`;

  const commitDraft = () => {
    const parsed = Number(draft);
    if (!draft.trim() || !Number.isFinite(parsed)) {
      setDraftState({ value, draft: String(value) });
      return;
    }
    const precision = step < 1 ? String(step).split('.')[1]?.length ?? 0 : 0;
    const bounded = Math.min(max, Math.max(min, parsed));
    const stepped = min + Math.round((bounded - min) / step) * step;
    const normalized = Number(Math.min(max, Math.max(min, stepped)).toFixed(precision));
    setDraftState({ value: normalized, draft: String(normalized) });
    if (normalized !== value) onChange(normalized);
  };

  return (
    <div className="py-1.5">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10.5px]">
        <span
          onDoubleClick={() => onChange(defaultValue)}
          className="text-obsidian-textSec hover:text-white cursor-pointer font-medium select-none transition-colors"
          title={`Double-click to reset ${label}`}
        >
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {value !== defaultValue && (
            <button
              type="button"
              onClick={() => onChange(defaultValue)}
              aria-label={`Reset ${label}`}
              title={`Reset to ${defaultValue}${unit}`}
              className="rounded p-1 text-obsidian-textMut transition-colors hover:bg-obsidian-hover hover:text-obsidian-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-obsidian-accent"
            >
              <RotateCcw size={11} />
            </button>
          )}
          <div className="flex h-7 items-center overflow-hidden rounded-md border border-obsidian-border bg-obsidian-input transition-colors focus-within:border-obsidian-accent focus-within:ring-2 focus-within:ring-obsidian-accent/20">
            <input
              type="number"
              aria-label={`${label} value`}
              min={min}
              max={max}
              step={step}
              value={draft}
              onChange={(e) => setDraftState({ value, draft: e.target.value })}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitDraft();
                  e.currentTarget.blur();
                }
                if (e.key === 'Escape') {
                  setDraftState({ value, draft: String(value) });
                  e.currentTarget.blur();
                }
              }}
              className="h-full w-[68px] bg-transparent px-2 text-right font-mono text-[11px] font-semibold tabular-nums text-white outline-none"
            />
            {unit && <span className="pr-2 text-[9px] font-semibold text-obsidian-textMut">{unit.trim()}</span>}
          </div>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={`${label} slider`}
        aria-valuetext={`${value}${unit}`}
        style={{ '--range-track': rangeTrack } as React.CSSProperties}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-5 w-full cursor-ew-resize appearance-none rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian-accent"
      />
    </div>
  );
};

const CollapsibleCard: React.FC<{
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, icon: Icon, defaultOpen = true, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.025] shadow-lg shadow-black/10">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="app-control flex h-9 w-full items-center justify-between border-0 px-3 text-left"
      >
        <div className="flex items-center space-x-2">
          {isOpen ? (
            <ChevronDown className="w-3 h-3 text-obsidian-textMut" />
          ) : (
            <ChevronRight className="w-3 h-3 text-obsidian-textMut" />
          )}
          <Icon className="w-3.5 h-3.5 text-obsidian-textMut" />
          <span className="text-[10px] font-bold tracking-wider text-obsidian-textSec uppercase">
            {title}
          </span>
        </div>
      </button>
      {isOpen && <div className="space-y-1 bg-black/10 p-3">{children}</div>}
    </div>
  );
};

interface VignetteSettings {
  enabled: boolean;
  amount: number;
  midpoint: number;
  feather: number;
}

interface ChromaKeySettings {
  enabled: boolean;
  color: string;
  tolerance: number;
  feather: number;
}

const readSettings = <T extends object>(value: unknown, defaults: T): T => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return defaults;
  return { ...defaults, ...(value as Partial<T>) };
};

export const RightPanel: React.FC<RightPanelProps> = ({
  editState,
  selectedMaskId,
  onMaskSelect,
  selectedRetouchSpotId,
  onRetouchSpotSelect,
  onChange,
  onAutoTone,
  onPreviewAIRestoration,
  isRestorationRunning = false,
  hasRestorationPreview = false,
  onResetAll,
  isCropActive,
  onToggleCrop,
  onSelectAspectRatio,
  presets = [],
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  editUndoStack = [],
  editRedoStack = [],
  currentEditState,
  onJumpEditHistory,
  snapshots = {},
  onSnapshotChange,
  histogram,
  activeAsset,
  width = 320,
  onResize,
  onResetWidth,
  isCollapsed = false,
  onToggleCollapse,
  onRequestColorSample,
  onCancelColorSample,
}) => {
  const [activeTab, setActiveTab] = useState<'develop' | 'color' | 'presets' | 'history'>('develop');
  const [pendingMaskSample, setPendingMaskSample] = useState<{
    maskId: string;
    kind: 'color' | 'luminance';
  } | null>(null);
  const [enhancementModelReady, setEnhancementModelReady] = useState(false);
  const [downloadingEnhancementModel, setDownloadingEnhancementModel] = useState(false);
  const [enhancementModelError, setEnhancementModelError] = useState<string | null>(null);
  const editStateRef = useRef(editState);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    editStateRef.current = editState;
    onChangeRef.current = onChange;
  }, [editState, onChange]);

  useEffect(() => {
    const handleSampleCancelled = () => setPendingMaskSample(null);
    window.addEventListener('kurolight:color-sample-cancelled', handleSampleCancelled);
    return () => window.removeEventListener('kurolight:color-sample-cancelled', handleSampleCancelled);
  }, []);

  useEffect(() => {
    let active = true;
    void bridge.hasLocalEnhancementModel()
      .then((ready) => {
        if (active) setEnhancementModelReady(ready);
      })
      .catch((error: unknown) => {
        console.error('Could not check the local AI enhancement model:', error);
        if (active) setEnhancementModelError('Could not check local AI model status.');
      });
    return () => {
      active = false;
    };
  }, []);

  const downloadEnhancementModel = async () => {
    setDownloadingEnhancementModel(true);
    setEnhancementModelError(null);
    try {
      const result = await bridge.downloadLocalEnhancementModel();
      if (result === 'cancelled') {
        setEnhancementModelError('Model download cancelled.');
        return;
      }
      setEnhancementModelReady(true);
    } catch (error) {
      console.error('Could not download the local AI enhancement model:', error);
      setEnhancementModelError(
        error instanceof Error ? error.message : 'Could not download the local AI model.'
      );
    } finally {
      setDownloadingEnhancementModel(false);
    }
  };

  const tabs: { id: typeof activeTab; label: string; icon: LucideIcon }[] = [
    { id: 'develop', label: 'Develop', icon: SlidersHorizontal },
    { id: 'color', label: 'Color', icon: Palette },
    { id: 'presets', label: 'Presets', icon: Star },
    { id: 'history', label: 'History', icon: History },
  ];

  const updateExposure = (key: keyof typeof editState.exposure, val: number) => {
    onChange({
      ...editState,
      exposure: { ...editState.exposure, [key]: val },
    });
  };

  const updateWhiteBalance = (key: keyof typeof editState.white_balance, val: number) => {
    onChange({
      ...editState,
      white_balance: { ...editState.white_balance, [key]: val },
    });
  };

  const updateDetail = (key: keyof typeof editState.detail, val: number) => {
    onChange({
      ...editState,
      detail: { ...editState.detail, [key]: val },
      custom_metadata: {
        ...(editState.custom_metadata ?? {}),
        flow_nodes: {
          ...readSettings<Record<string, boolean>>(editState.custom_metadata?.flow_nodes, {}),
          ...(key === 'dehaze' ? { dehaze: true } : { detail: true }),
        },
      },
    });
  };

  const vignette = readSettings<VignetteSettings>(editState.custom_metadata?.vignette, {
    enabled: false,
    amount: 0,
    midpoint: 0.5,
    feather: 0.5,
  });
  const chromaKey = readSettings<ChromaKeySettings>(
    editState.custom_metadata?.background_removal,
    { enabled: false, color: '#00ff00', tolerance: 0.18, feather: 0.08 }
  );
  const updateEffect = <T extends object>(
    key: 'vignette' | 'background_removal',
    settings: T,
    updates: Partial<T>,
    enabled: boolean
  ) => {
    const nodeId = key === 'vignette' ? 'vignette' : 'background_removal';
    onChange({
      ...editState,
      custom_metadata: {
        ...(editState.custom_metadata ?? {}),
        [key]: { ...settings, ...updates, enabled },
        flow_nodes: {
          ...readSettings<Record<string, boolean>>(editState.custom_metadata?.flow_nodes, {}),
          [nodeId]: enabled,
        },
      },
    });
  };

  const updateGeometry = <K extends keyof typeof editState.geometry>(
    key: K,
    val: (typeof editState.geometry)[K]
  ) => {
    onChange({
      ...editState,
      geometry: { ...editState.geometry, [key]: val },
    });
  };

  const updateLensCorrection = <K extends keyof typeof editState.lens_correction>(
    key: K,
    val: (typeof editState.lens_correction)[K]
  ) => {
    onChange({
      ...editState,
      lens_correction: { ...editState.lens_correction, [key]: val },
    });
  };

  const masks = editState.masks ?? [];
  const retouchSpots = editState.retouch_spots ?? [];
  const selectedMask = masks.find((mask) => mask.id === selectedMaskId) ?? masks[0] ?? null;
  const updateMasks = (nextMasks: AdjustmentMask[]) => onChange({ ...editState, masks: nextMasks });
  const updateMask = (id: string, updates: Partial<AdjustmentMask>) => {
    updateMasks(masks.map((mask) => mask.id === id ? { ...mask, ...updates } : mask));
  };
  const requestMaskSample = (
    maskId: string,
    kind: 'color' | 'luminance',
  ) => {
    if (!onRequestColorSample) return;
    if (pendingMaskSample?.maskId === maskId && pendingMaskSample.kind === kind) {
      onCancelColorSample?.();
      setPendingMaskSample(null);
      return;
    }

    setPendingMaskSample({ maskId, kind });
    onRequestColorSample((color) => {
      setPendingMaskSample(null);
      if (!/^#[\da-f]{6}$/i.test(color)) {
        console.error('[KuroLight] Image sampler returned an invalid color:', color);
        return;
      }

      const currentState = editStateRef.current;
      const targetMask = currentState.masks?.find((mask) => mask.id === maskId);
      if (!targetMask) {
        console.error(`[KuroLight] Could not update missing adjustment mask ${maskId}`);
        return;
      }

      const geometry = { ...targetMask.geometry };
      if (kind === 'color') {
        const sampledColor = colorToHsv(color);
        const saturationRadius = 0.15;
        geometry.hue_center = sampledColor.hue;
        geometry.saturation_min = Math.max(0, sampledColor.saturation - saturationRadius);
        geometry.saturation_max = Math.min(1, sampledColor.saturation + saturationRadius);
      } else {
        const red = parseInt(color.slice(1, 3), 16) / 255;
        const green = parseInt(color.slice(3, 5), 16) / 255;
        const blue = parseInt(color.slice(5, 7), 16) / 255;
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        const halfRange = Math.max(
          0.05,
          (typeof geometry.range_softness === 'number' ? geometry.range_softness : 0.05) * 2,
        );
        geometry.luminance_min = Math.max(0, luminance - halfRange);
        geometry.luminance_max = Math.min(1, luminance + halfRange);
      }

      const nextState = {
        ...currentState,
        masks: currentState.masks?.map((mask) =>
          mask.id === maskId ? { ...mask, geometry } : mask
        ) ?? [],
      };
      editStateRef.current = nextState;
      onChangeRef.current(nextState);
    });
  };
  const createMask = (maskType: AdjustmentMaskType) => {
    const mask: AdjustmentMask = {
      id: crypto.randomUUID(),
      name: `${
        maskType === 'radial' ? 'Radial'
          : maskType === 'brush' ? 'Brush'
            : maskType === 'luminance_range' ? 'Luminance'
              : maskType === 'color_range' ? 'Color Range' : 'Linear'
      } Mask ${masks.length + 1}`,
      mask_type: maskType,
      enabled: true,
      inverted: false,
      combine_mode: 'replace',
      feather: 0.5,
      opacity: 1,
      exposure: 0,
      contrast: 0,
      temperature: 0,
      saturation: 0,
      clarity: 0,
      geometry: maskType === 'radial'
        ? { cx: 0.5, cy: 0.5, rx: 0.3, ry: 0.3 }
        : maskType === 'brush'
          ? { strokes: [], brush_size: 0.04, brush_hardness: 0.7 }
          : maskType === 'luminance_range'
            ? { luminance_min: 0.25, luminance_max: 0.8, range_softness: 0.05 }
            : maskType === 'color_range'
              ? { hue_center: 210, hue_width: 45, saturation_min: 0.1, saturation_max: 1, range_softness: 0.05 }
              : { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
    };
    updateMasks([...masks, mask]);
    onMaskSelect?.(mask.id);
  };
  const updateRetouchSpot = (id: string, updates: Partial<RetouchSpot>) => {
    onChange({
      ...editState,
      retouch_spots: retouchSpots.map((spot) => spot.id === id ? { ...spot, ...updates } : spot),
    });
  };
  const createRetouchSpot = (mode: RetouchMode) => {
    const spot: RetouchSpot = {
      id: crypto.randomUUID(),
      mode,
      target_x: 0.5,
      target_y: 0.5,
      source_x: 0.6,
      source_y: 0.5,
      radius: 0.03,
      feather: 0.5,
      opacity: 1,
      enabled: true,
    };
    onChange({ ...editState, retouch_spots: [...retouchSpots, spot] });
    onRetouchSpotSelect?.(spot.id);
  };

  // If collapsed, show a slim toggle tab on the right edge
  if (isCollapsed) {
    return (
      <div className="relative z-20 flex items-center">
        <button
          onClick={onToggleCollapse}
          title="Expand Develop Panel"
          className="app-surface absolute right-0 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-l-xl border-r-0 p-2 text-obsidian-textSec transition-colors hover:text-white"
        >
          <PanelRightOpen size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full relative z-20 flex-shrink-0">
      {/* ── Left Draggable Resize Handle ── */}
      {onResize && (
        <ResizeHandle
          direction="vertical"
          side="right"
          onResize={onResize}
          onDoubleClick={onResetWidth}
          title="Drag to resize panel width • Double-click to reset"
        />
      )}

      <aside
        style={{ width: `${width}px` }}
        className="app-surface flex h-full flex-col overflow-hidden rounded-l-2xl border-y-0 border-r-0 select-none"
      >
        {/* ── Docked Collapsible Histogram Card ── */}
        <HistogramCard histogram={histogram} asset={activeAsset} />

        {/* ── Tool Category Tab Bar & Collapse Action ── */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.07] bg-black/15 px-2">
          <div className="flex items-center flex-1 h-full overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[42px] flex flex-col items-center justify-center h-full py-1 transition-all relative ${
                    isActive ? 'text-white' : 'text-obsidian-textMut hover:bg-white/[0.045] hover:text-obsidian-textPri'
                  }`}
                  title={tab.label}
                >
                  <Icon className={`w-3.5 h-3.5 mb-0.5 ${isActive ? 'text-obsidian-accent' : ''}`} />
                  <span className="text-[9px] font-bold">{tab.label}</span>
                  {isActive && (
                    <div className="app-accent absolute bottom-1 left-2 right-2 h-0.5 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Panel Collapse Toggle Button */}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Collapse Panel (Hide)"
              className="p-1 ml-1 text-obsidian-textMut hover:text-white rounded hover:bg-obsidian-hover transition-colors"
            >
              <PanelRightClose size={13} />
            </button>
          )}
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {activeTab === 'develop' && (
            <div>
              {/* 1. EXPOSURE & TONALITY */}
              <CollapsibleCard title="Exposure & Tonality" icon={SlidersHorizontal}>
                <button
                  onClick={onAutoTone}
                  className="w-full flex items-center justify-center space-x-1.5 py-1 mb-2 rounded bg-obsidian-card hover:bg-obsidian-hover border border-obsidian-border text-[10.5px] font-bold text-obsidian-textPri transition-all shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-obsidian-accent" />
                  <span>Auto Tone</span>
                </button>

                <PrecisionSlider
                  label="Exposure"
                  value={editState.exposure.exposure}
                  min={-5.0}
                  max={5.0}
                  step={0.05}
                  unit=" EV"
                  onChange={(v) => updateExposure('exposure', v)}
                />
                <PrecisionSlider
                  label="Brightness"
                  value={editState.exposure.brightness}
                  min={-100}
                  max={100}
                  onChange={(v) => updateExposure('brightness', v)}
                />
                <PrecisionSlider
                  label="Contrast"
                  value={editState.exposure.contrast}
                  min={-100}
                  max={100}
                  onChange={(v) => updateExposure('contrast', v)}
                />
                <PrecisionSlider
                  label="Highlights"
                  value={editState.exposure.highlights}
                  min={-100}
                  max={100}
                  onChange={(v) => updateExposure('highlights', v)}
                />
                <PrecisionSlider
                  label="Shadows"
                  value={editState.exposure.shadows}
                  min={-100}
                  max={100}
                  onChange={(v) => updateExposure('shadows', v)}
                />
                <PrecisionSlider
                  label="Whites"
                  value={editState.exposure.whites}
                  min={-100}
                  max={100}
                  onChange={(v) => updateExposure('whites', v)}
                />
                <PrecisionSlider
                  label="Blacks"
                  value={editState.exposure.blacks}
                  min={-100}
                  max={100}
                  onChange={(v) => updateExposure('blacks', v)}
                />
              </CollapsibleCard>

              {/* 2. WHITE BALANCE & COLOR */}
              <CollapsibleCard title="White Balance & Color" icon={Palette}>
                <PrecisionSlider
                  label="Temperature"
                  value={editState.white_balance.temperature}
                  min={-100}
                  max={100}
                  onChange={(v) => updateWhiteBalance('temperature', v)}
                />
                <PrecisionSlider
                  label="Tint"
                  value={editState.white_balance.tint}
                  min={-100}
                  max={100}
                  onChange={(v) => updateWhiteBalance('tint', v)}
                />
                <PrecisionSlider
                  label="Saturation"
                  value={editState.white_balance.saturation}
                  min={-100}
                  max={100}
                  onChange={(v) => updateWhiteBalance('saturation', v)}
                />
                <PrecisionSlider
                  label="Vibrance"
                  value={editState.white_balance.vibrance}
                  min={-100}
                  max={100}
                  onChange={(v) => updateWhiteBalance('vibrance', v)}
                />
              </CollapsibleCard>

              {/* 3. DETAIL & SHARPNESS */}
              <CollapsibleCard title="Detail & Sharpness" icon={Wand2}>
                <PrecisionSlider
                  label="Sharpening"
                  value={editState.detail.sharpening}
                  min={0}
                  max={100}
                  onChange={(v) => updateDetail('sharpening', v)}
                />
                <PrecisionSlider
                  label="Noise Reduction"
                  value={editState.detail.noise_reduction}
                  min={0}
                  max={100}
                  onChange={(v) => updateDetail('noise_reduction', v)}
                />
                <div className="flex items-center justify-between gap-2 py-1">
                  <label htmlFor="ai-enhancement-resolution" className="text-[10px] text-obsidian-textSec">
                    AI Restoration
                  </label>
                  <select
                    id="ai-enhancement-resolution"
                    value={editState.detail.enhancement_resolution ?? 0}
                    disabled={!enhancementModelReady}
                    onChange={(event) => updateDetail(
                      'enhancement_resolution',
                      Number(event.target.value)
                    )}
                    className="bg-obsidian-input text-white border border-obsidian-border rounded px-2 py-1 text-[10px]"
                  >
                    <option value={0}>Off</option>
                    <option value={720}>Restore to 720p</option>
                    <option value={1080}>Restore to 1080p</option>
                    <option value={1440}>Restore to 1440p</option>
                    <option value={2160}>Restore to 4K</option>
                  </select>
                </div>
                <p className="text-[9px] leading-relaxed text-obsidian-textMut">
                  Preview the current photo with local AI here; final export renders the saved
                  restoration target. Uses GPU acceleration when supported, with CPU fallback.
                </p>
                <button
                  type="button"
                  onClick={onPreviewAIRestoration}
                  disabled={
                    !enhancementModelReady ||
                    !onPreviewAIRestoration ||
                    isRestorationRunning ||
                    (editState.detail.enhancement_resolution ?? 0) === 0
                  }
                  className="flex w-full items-center justify-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5 text-[10px] font-semibold text-emerald-300 disabled:opacity-40"
                >
                  <Sparkles size={11} />
                  {isRestorationRunning
                    ? 'Restoring current photo…'
                    : hasRestorationPreview
                      ? 'Refresh restoration preview'
                      : 'Preview AI restoration'}
                </button>
                {hasRestorationPreview && !isRestorationRunning && (
                  <p role="status" className="text-[9px] text-emerald-300">
                    Restoration preview ready. The selected target will run during export.
                  </p>
                )}
                {!enhancementModelReady && (
                  <button
                    type="button"
                    onClick={() => void downloadEnhancementModel()}
                    disabled={downloadingEnhancementModel}
                    className="w-full rounded border border-obsidian-accent/40 bg-obsidian-accent/10 px-2 py-1.5 text-[10px] font-semibold text-obsidian-accent disabled:opacity-50"
                  >
                    {downloadingEnhancementModel
                      ? 'Downloading AI model (64 MB)…'
                      : 'Download local AI model (64 MB)'}
                  </button>
                )}
                {enhancementModelError && (
                  <p role="alert" className="text-[9px] text-red-400">
                    {enhancementModelError}
                  </p>
                )}
                <PrecisionSlider
                  label="Clarity"
                  value={editState.detail.clarity}
                  min={-100}
                  max={100}
                  onChange={(v) => updateDetail('clarity', v)}
                />
                <PrecisionSlider
                  label="Texture"
                  value={editState.detail.texture}
                  min={-100}
                  max={100}
                  onChange={(v) => updateDetail('texture', v)}
                />
                <PrecisionSlider
                  label="Dehaze"
                  value={editState.detail.dehaze}
                  min={-100}
                  max={100}
                  onChange={(v) => updateDetail('dehaze', v)}
                />
              </CollapsibleCard>

              <CollapsibleCard title="Local Masks" icon={Layers} defaultOpen={false}>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => createMask('linear')}
                    className="flex items-center justify-center gap-1 rounded-md border border-obsidian-border bg-obsidian-card py-1.5 text-[10px] font-semibold text-obsidian-textSec transition-colors hover:border-obsidian-accent/50 hover:text-white"
                  >
                    <Plus size={12} /> Linear
                  </button>
                  <button
                    type="button"
                    onClick={() => createMask('radial')}
                    className="flex items-center justify-center gap-1 rounded-md border border-obsidian-border bg-obsidian-card py-1.5 text-[10px] font-semibold text-obsidian-textSec transition-colors hover:border-obsidian-accent/50 hover:text-white"
                  >
                    <Plus size={12} /> Radial
                  </button>
                  <button
                    type="button"
                    onClick={() => createMask('brush')}
                    className="col-span-2 flex items-center justify-center gap-1 rounded-md border border-obsidian-border bg-obsidian-card py-1.5 text-[10px] font-semibold text-obsidian-textSec transition-colors hover:border-obsidian-accent/50 hover:text-white"
                  >
                    <Plus size={12} /> Brush
                  </button>
                  <button
                    type="button"
                    onClick={() => createMask('luminance_range')}
                    className="flex items-center justify-center gap-1 rounded-md border border-obsidian-border bg-obsidian-card py-1.5 text-[10px] font-semibold text-obsidian-textSec transition-colors hover:border-obsidian-accent/50 hover:text-white"
                  >
                    <Plus size={12} /> Luminance
                  </button>
                  <button
                    type="button"
                    onClick={() => createMask('color_range')}
                    className="flex items-center justify-center gap-1 rounded-md border border-obsidian-border bg-obsidian-card py-1.5 text-[10px] font-semibold text-obsidian-textSec transition-colors hover:border-obsidian-accent/50 hover:text-white"
                  >
                    <Plus size={12} /> Color Range
                  </button>
                </div>

                {masks.length === 0 ? (
                  <div className="mt-2 rounded-lg border border-dashed border-obsidian-border px-3 py-4 text-center">
                    <Layers size={18} className="mx-auto mb-1.5 text-obsidian-textMut" />
                    <p className="text-[10px] font-medium text-obsidian-textSec">Shape the light locally</p>
                    <p className="mt-1 text-[9px] leading-relaxed text-obsidian-textMut">
                      Add a gradient or paint a brush mask, then refine its local adjustments.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-1">
                    {masks.map((mask) => (
                      <div
                        key={mask.id}
                        className={`flex items-center gap-1 rounded-lg border p-1 ${
                          selectedMask?.id === mask.id
                            ? 'border-obsidian-accent/50 bg-obsidian-accent/10'
                            : 'border-obsidian-border/60 bg-obsidian-deep/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onMaskSelect?.(mask.id)}
                          className="min-w-0 flex-1 truncate px-1.5 py-1 text-left text-[10px] font-medium text-white"
                          aria-pressed={selectedMask?.id === mask.id}
                        >
                          <span className="mr-1.5 text-obsidian-accent">
                            {mask.mask_type === 'radial' ? '◉'
                              : mask.mask_type === 'brush' ? '✎'
                                : mask.mask_type === 'luminance_range' ? '◐'
                                  : mask.mask_type === 'color_range' ? '◌' : '◒'}
                          </span>
                          {mask.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateMask(mask.id, { enabled: !mask.enabled })}
                          aria-label={`${mask.enabled ? 'Disable' : 'Enable'} ${mask.name}`}
                          title={mask.enabled ? 'Disable mask' : 'Enable mask'}
                          className="rounded p-1.5 text-obsidian-textMut hover:bg-obsidian-hover hover:text-white"
                        >
                          {mask.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const remaining = masks.filter((item) => item.id !== mask.id);
                            updateMasks(remaining);
                            if (selectedMaskId === mask.id || selectedMask?.id === mask.id) {
                              onMaskSelect?.(remaining[0]?.id ?? null);
                            }
                          }}
                          aria-label={`Delete ${mask.name}`}
                          title="Delete mask"
                          className="rounded p-1.5 text-obsidian-textMut hover:bg-red-950/60 hover:text-red-300"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {selectedMask && (
                  <div className="mt-2 space-y-2 border-t border-obsidian-border/70 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        aria-label="Mask name"
                        value={selectedMask.name}
                        onChange={(event) => updateMask(selectedMask.id, { name: event.target.value })}
                        className="min-w-0 flex-1 rounded-md border border-obsidian-border bg-obsidian-input px-2 py-1 text-[10px] font-semibold text-white focus:border-obsidian-accent focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => updateMask(selectedMask.id, { inverted: !selectedMask.inverted })}
                        aria-pressed={selectedMask.inverted}
                        className={`rounded-md border px-2 py-1 text-[9px] font-semibold transition-colors ${
                          selectedMask.inverted
                            ? 'border-obsidian-accent bg-obsidian-accent/15 text-obsidian-accent'
                            : 'border-obsidian-border text-obsidian-textMut hover:text-white'
                        }`}
                      >
                        Invert
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="mask-combine-mode" className="text-[9px] text-obsidian-textSec">
                        Combine with prior selection
                      </label>
                      <select
                        id="mask-combine-mode"
                        value={selectedMask.combine_mode ?? 'replace'}
                        onChange={(event) => updateMask(selectedMask.id, {
                          combine_mode: event.target.value as AdjustmentMask['combine_mode'],
                        })}
                        className="bg-obsidian-input text-white border border-obsidian-border rounded px-2 py-0.5 text-[9px]"
                      >
                        <option value="replace">Replace</option>
                        <option value="add">Add</option>
                        <option value="subtract">Subtract</option>
                        <option value="intersect">Intersect</option>
                      </select>
                    </div>
                    <p className="text-[9px] leading-relaxed text-obsidian-textMut">
                      Masks combine in list order. Each mask's adjustment uses the resulting selection.
                    </p>
                    {(selectedMask.mask_type === 'radial'
                      ? [['Center X', 'cx'], ['Center Y', 'cy'], ['Width', 'rx'], ['Height', 'ry']]
                      : selectedMask.mask_type === 'linear'
                        ? [['Start X', 'x1'], ['Start Y', 'y1'], ['End X', 'x2'], ['End Y', 'y2']]
                        : []
                    ).map(([label, key]) => (
                      <PrecisionSlider
                        key={key}
                        label={label}
                        value={typeof selectedMask.geometry[key] === 'number' ? selectedMask.geometry[key] as number : 0.5}
                        min={0}
                        max={1}
                        step={0.01}
                        defaultValue={key === 'cx' || key === 'cy' ? 0.5 : key === 'rx' || key === 'ry' ? 0.3 : key === 'y2' ? 1 : 0}
                        onChange={(value) => updateMask(selectedMask.id, {
                          geometry: { ...selectedMask.geometry, [key]: value },
                        })}
                      />
                    ))}
                    {selectedMask.mask_type === 'luminance_range' && (
                      <>
                        {onRequestColorSample && (
                          <button
                            type="button"
                            onClick={() => requestMaskSample(selectedMask.id, 'luminance')}
                            aria-pressed={
                              pendingMaskSample?.maskId === selectedMask.id &&
                              pendingMaskSample.kind === 'luminance'
                            }
                            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-obsidian-border bg-obsidian-card py-1.5 text-[10px] font-semibold text-obsidian-textSec transition-colors hover:border-obsidian-accent/50 hover:text-white aria-pressed:border-obsidian-accent aria-pressed:bg-obsidian-accent/15 aria-pressed:text-obsidian-accent"
                          >
                            <Pipette size={12} />
                            {pendingMaskSample?.maskId === selectedMask.id &&
                            pendingMaskSample.kind === 'luminance'
                              ? 'Click image to sample luminance'
                              : 'Sample luminance from image'}
                          </button>
                        )}
                        <PrecisionSlider
                          label="Darkest"
                          value={typeof selectedMask.geometry.luminance_min === 'number' ? selectedMask.geometry.luminance_min : 0.25}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(luminance_min) => updateMask(selectedMask.id, {
                            geometry: { ...selectedMask.geometry, luminance_min },
                          })}
                        />
                        <PrecisionSlider
                          label="Brightest"
                          value={typeof selectedMask.geometry.luminance_max === 'number' ? selectedMask.geometry.luminance_max : 0.8}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(luminance_max) => updateMask(selectedMask.id, {
                            geometry: { ...selectedMask.geometry, luminance_max },
                          })}
                        />
                      </>
                    )}
                    {selectedMask.mask_type === 'color_range' && (
                      <>
                        {onRequestColorSample && (
                          <button
                            type="button"
                            onClick={() => requestMaskSample(selectedMask.id, 'color')}
                            aria-pressed={
                              pendingMaskSample?.maskId === selectedMask.id &&
                              pendingMaskSample.kind === 'color'
                            }
                            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-obsidian-border bg-obsidian-card py-1.5 text-[10px] font-semibold text-obsidian-textSec transition-colors hover:border-obsidian-accent/50 hover:text-white aria-pressed:border-obsidian-accent aria-pressed:bg-obsidian-accent/15 aria-pressed:text-obsidian-accent"
                          >
                            <Pipette size={12} />
                            {pendingMaskSample?.maskId === selectedMask.id &&
                            pendingMaskSample.kind === 'color'
                              ? 'Click image to sample color'
                              : 'Sample color from image'}
                          </button>
                        )}
                        <PrecisionSlider
                          label="Hue"
                          value={typeof selectedMask.geometry.hue_center === 'number' ? selectedMask.geometry.hue_center : 210}
                          min={0}
                          max={360}
                          step={1}
                          unit="°"
                          onChange={(hue_center) => updateMask(selectedMask.id, {
                            geometry: { ...selectedMask.geometry, hue_center },
                          })}
                        />
                        <PrecisionSlider
                          label="Hue Width"
                          value={typeof selectedMask.geometry.hue_width === 'number' ? selectedMask.geometry.hue_width : 45}
                          min={0}
                          max={180}
                          step={1}
                          unit="°"
                          onChange={(hue_width) => updateMask(selectedMask.id, {
                            geometry: { ...selectedMask.geometry, hue_width },
                          })}
                        />
                        <PrecisionSlider
                          label="Min Saturation"
                          value={typeof selectedMask.geometry.saturation_min === 'number' ? selectedMask.geometry.saturation_min : 0.1}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(saturation_min) => updateMask(selectedMask.id, {
                            geometry: { ...selectedMask.geometry, saturation_min },
                          })}
                        />
                        <PrecisionSlider
                          label="Max Saturation"
                          value={typeof selectedMask.geometry.saturation_max === 'number' ? selectedMask.geometry.saturation_max : 1}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(saturation_max) => updateMask(selectedMask.id, {
                            geometry: { ...selectedMask.geometry, saturation_max },
                          })}
                        />
                      </>
                    )}
                    {(selectedMask.mask_type === 'luminance_range' || selectedMask.mask_type === 'color_range') && (
                      <PrecisionSlider
                        label="Range Softness"
                        value={typeof selectedMask.geometry.range_softness === 'number' ? selectedMask.geometry.range_softness : 0.05}
                        min={0}
                        max={0.5}
                        step={0.01}
                        onChange={(range_softness) => updateMask(selectedMask.id, {
                          geometry: { ...selectedMask.geometry, range_softness },
                        })}
                      />
                    )}
                    {selectedMask.mask_type === 'brush' && (
                      <>
                        <p className="text-[9px] text-obsidian-textSec">
                          Paint directly on the image to add to this mask.
                        </p>
                        <button
                          type="button"
                          disabled={
                            !Array.isArray(selectedMask.geometry.strokes) ||
                            selectedMask.geometry.strokes.length === 0
                          }
                          onClick={() => updateMask(selectedMask.id, {
                            geometry: { ...selectedMask.geometry, strokes: [] },
                          })}
                          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-obsidian-border bg-obsidian-card py-1.5 text-[10px] font-semibold text-obsidian-textSec transition-colors hover:border-red-400/50 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Eraser size={12} /> Clear brush strokes
                        </button>
                        <PrecisionSlider
                          label="Brush Size"
                          value={typeof selectedMask.geometry.brush_size === 'number' ? selectedMask.geometry.brush_size : 0.04}
                          min={0.005}
                          max={0.2}
                          step={0.005}
                          onChange={(brush_size) => updateMask(selectedMask.id, {
                            geometry: { ...selectedMask.geometry, brush_size },
                          })}
                        />
                        <PrecisionSlider
                          label="Hardness"
                          value={typeof selectedMask.geometry.brush_hardness === 'number' ? selectedMask.geometry.brush_hardness : 0.7}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(brush_hardness) => updateMask(selectedMask.id, {
                            geometry: { ...selectedMask.geometry, brush_hardness },
                          })}
                        />
                      </>
                    )}
                    <PrecisionSlider
                      label="Feather"
                      value={selectedMask.feather}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(feather) => updateMask(selectedMask.id, { feather })}
                    />
                    <PrecisionSlider
                      label="Opacity"
                      value={selectedMask.opacity}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(opacity) => updateMask(selectedMask.id, { opacity })}
                    />
                    <div className="space-y-0.5 border-t border-obsidian-border/60 pt-1">
                      <p className="pb-1 text-[9px] font-bold uppercase tracking-wider text-obsidian-textMut">Local adjustments</p>
                      <PrecisionSlider
                        label="Exposure"
                        value={selectedMask.exposure}
                        min={-5}
                        max={5}
                        step={0.05}
                        unit=" EV"
                        onChange={(exposure) => updateMask(selectedMask.id, { exposure })}
                      />
                      <PrecisionSlider
                        label="Contrast"
                        value={selectedMask.contrast}
                        min={-100}
                        max={100}
                        onChange={(contrast) => updateMask(selectedMask.id, { contrast })}
                      />
                      <PrecisionSlider
                        label="Temperature"
                        value={selectedMask.temperature}
                        min={-100}
                        max={100}
                        onChange={(temperature) => updateMask(selectedMask.id, { temperature })}
                      />
                      <PrecisionSlider
                        label="Saturation"
                        value={selectedMask.saturation}
                        min={-100}
                        max={100}
                        onChange={(saturation) => updateMask(selectedMask.id, { saturation })}
                      />
                      <PrecisionSlider
                        label="Clarity"
                        value={selectedMask.clarity}
                        min={-100}
                        max={100}
                        onChange={(clarity) => updateMask(selectedMask.id, { clarity })}
                      />
                    </div>
                    <p className="text-[9px] leading-relaxed text-obsidian-textMut">
                      Masks update the live preview and are saved with this photo.
                    </p>
                  </div>
                )}
              </CollapsibleCard>

              <CollapsibleCard title="Spot Retouch" icon={Eraser} defaultOpen={false}>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['heal', 'clone'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => createRetouchSpot(mode)}
                      className="flex items-center justify-center gap-1 rounded-md border border-obsidian-border bg-obsidian-card py-1.5 text-[10px] font-semibold capitalize text-obsidian-textSec transition-colors hover:border-obsidian-accent/50 hover:text-white"
                    >
                      <Plus size={12} /> {mode} spot
                    </button>
                  ))}
                </div>
                {retouchSpots.length === 0 ? (
                  <div className="mt-2 rounded-lg border border-dashed border-obsidian-border px-3 py-4 text-center">
                    <Eraser size={18} className="mx-auto mb-1.5 text-obsidian-textMut" />
                    <p className="text-[10px] font-medium text-obsidian-textSec">Clean up small distractions</p>
                    <p className="mt-1 text-[9px] leading-relaxed text-obsidian-textMut">
                      Add a heal or clone spot and set its source and target positions.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {retouchSpots.map((spot, index) => (
                      <div
                        key={spot.id}
                        onClick={() => onRetouchSpotSelect?.(spot.id)}
                        className={`rounded-lg border p-2 ${
                          selectedRetouchSpotId === spot.id
                            ? 'border-obsidian-accent/70 bg-obsidian-active/40'
                            : 'border-obsidian-border/70 bg-obsidian-deep/40'
                        }`}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold text-white">Spot {index + 1}</span>
                          <div className="flex items-center gap-1">
                            <select
                              aria-label={`Spot ${index + 1} mode`}
                              value={spot.mode}
                              onChange={(event) => updateRetouchSpot(spot.id, { mode: event.target.value as RetouchMode })}
                              className="rounded border border-obsidian-border bg-obsidian-input px-1.5 py-1 text-[9px] capitalize text-white"
                            >
                              <option value="heal">Heal</option>
                              <option value="clone">Clone</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => updateRetouchSpot(spot.id, { enabled: !spot.enabled })}
                              aria-label={`${spot.enabled ? 'Disable' : 'Enable'} spot ${index + 1}`}
                              className="rounded p-1.5 text-obsidian-textMut hover:bg-obsidian-hover hover:text-white"
                            >
                              {spot.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
                            </button>
                            <button
                              type="button"
                              onClick={() => onChange({
                                ...editState,
                                retouch_spots: retouchSpots.filter((item) => item.id !== spot.id),
                              })}
                              aria-label={`Delete spot ${index + 1}`}
                              className="rounded p-1.5 text-obsidian-textMut hover:bg-red-950/60 hover:text-red-300"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <p className="mb-1 text-[9px] font-bold uppercase tracking-wider text-obsidian-textMut">Target position</p>
                        <PrecisionSlider
                          label="X"
                          value={spot.target_x}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(target_x) => updateRetouchSpot(spot.id, { target_x })}
                        />
                        <PrecisionSlider
                          label="Y"
                          value={spot.target_y}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(target_y) => updateRetouchSpot(spot.id, { target_y })}
                        />
                        <p className="mb-1 mt-1 border-t border-obsidian-border/50 pt-1 text-[9px] font-bold uppercase tracking-wider text-obsidian-textMut">Sample source</p>
                        <PrecisionSlider
                          label="X"
                          value={spot.source_x}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(source_x) => updateRetouchSpot(spot.id, { source_x })}
                        />
                        <PrecisionSlider
                          label="Y"
                          value={spot.source_y}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(source_y) => updateRetouchSpot(spot.id, { source_y })}
                        />
                        <PrecisionSlider
                          label="Radius"
                          value={spot.radius}
                          min={0.001}
                          max={0.5}
                          step={0.001}
                          onChange={(radius) => updateRetouchSpot(spot.id, { radius })}
                        />
                        <PrecisionSlider
                          label="Feather"
                          value={spot.feather}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(feather) => updateRetouchSpot(spot.id, { feather })}
                        />
                        <PrecisionSlider
                          label="Opacity"
                          value={spot.opacity}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(opacity) => updateRetouchSpot(spot.id, { opacity })}
                        />
                      </div>
                    ))}
                    <p className="text-[9px] leading-relaxed text-obsidian-textMut">
                      Drag the T pin to place a target and the S pin to choose its sample source. The dotted ring shows the retouch radius.
                    </p>
                  </div>
                )}
              </CollapsibleCard>

              <CollapsibleCard title="Vignette" icon={Sun} defaultOpen={false}>
                <label className="flex items-center gap-2 text-[10px] text-obsidian-textSec">
                  <input
                    type="checkbox"
                    checked={vignette.enabled}
                    onChange={(event) =>
                      updateEffect(
                        'vignette',
                        vignette,
                        { enabled: event.target.checked },
                        event.target.checked
                      )
                    }
                  />
                  Enable vignette
                </label>
                <PrecisionSlider
                  label="Amount"
                  value={vignette.amount}
                  min={-100}
                  max={100}
                  onChange={(amount) => updateEffect('vignette', vignette, { amount }, true)}
                />
                <PrecisionSlider
                  label="Midpoint"
                  value={vignette.midpoint}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(midpoint) => updateEffect('vignette', vignette, { midpoint }, true)}
                />
                <PrecisionSlider
                  label="Feather"
                  value={vignette.feather}
                  min={0.01}
                  max={1}
                  step={0.01}
                  onChange={(feather) => updateEffect('vignette', vignette, { feather }, true)}
                />
                <button
                  onClick={() =>
                    updateEffect(
                      'vignette',
                      vignette,
                      { enabled: false, amount: 0, midpoint: 0.5, feather: 0.5 },
                      false
                    )
                  }
                  className="w-full py-1 rounded border border-obsidian-border text-[9px] text-obsidian-textSec hover:text-white hover:bg-obsidian-hover"
                >
                  Reset Vignette
                </button>
              </CollapsibleCard>

              <CollapsibleCard title="Background Removal" icon={KeyRound} defaultOpen={false}>
                <label className="flex items-center gap-2 text-[10px] text-obsidian-textSec">
                  <input
                    type="checkbox"
                    checked={chromaKey.enabled}
                    onChange={(event) =>
                      updateEffect(
                        'background_removal',
                        chromaKey,
                        { enabled: event.target.checked },
                        event.target.checked
                      )
                    }
                  />
                  Enable Chroma Key
                </label>
                <ColorPickerInput
                  label="Key color"
                  value={chromaKey.color}
                  onPickFromImage={onRequestColorSample}
                  onCancelImagePick={onCancelColorSample}
                  onChange={(color) =>
                    updateEffect('background_removal', chromaKey, { color }, true)
                  }
                />
                <PrecisionSlider
                  label="Tolerance"
                  value={chromaKey.tolerance}
                  min={0}
                  max={1}
                  step={0.005}
                  onChange={(tolerance) =>
                    updateEffect('background_removal', chromaKey, { tolerance }, true)
                  }
                />
                <PrecisionSlider
                  label="Edge Feather"
                  value={chromaKey.feather}
                  min={0.001}
                  max={0.5}
                  step={0.001}
                  onChange={(feather) =>
                    updateEffect('background_removal', chromaKey, { feather }, true)
                  }
                />
                <p className="text-[9px] text-obsidian-textMut">
                  Use with an evenly lit, solid-color background for clean transparency.
                </p>
                <button
                  onClick={() =>
                    updateEffect(
                      'background_removal',
                      chromaKey,
                      { enabled: false, color: '#00ff00', tolerance: 0.18, feather: 0.08 },
                      false
                    )
                  }
                  className="w-full py-1 rounded border border-obsidian-border text-[9px] text-obsidian-textSec hover:text-white hover:bg-obsidian-hover"
                >
                  Reset Chroma Key
                </button>
              </CollapsibleCard>

              {/* 4. GEOMETRY & FRAMING */}
              <CollapsibleCard title="Geometry & Framing" icon={Crop}>
                <div className="flex items-center justify-between text-[10.5px] py-1">
                  <span className="text-obsidian-textSec font-medium">Aspect Ratio:</span>
                  <select
                    value={editState.geometry.aspect_ratio}
                    onChange={(e) => {
                      updateGeometry('aspect_ratio', e.target.value);
                      if (onSelectAspectRatio) onSelectAspectRatio(e.target.value);
                    }}
                    className="bg-obsidian-input text-white border border-obsidian-border rounded px-2 py-0.5 text-[10px] font-semibold"
                  >
                    <option value="Original">Original</option>
                    <option value="Free Form">Free Form</option>
                    <option value="1:1 Square">1:1 Square</option>
                    <option value="16:9 Landscape">16:9 Landscape</option>
                    <option value="4:3 Standard">4:3 Standard</option>
                    <option value="3:2 Photo">3:2 Photo</option>
                    <option value="9:16 Portrait">9:16 Portrait</option>
                  </select>
                </div>

                <PrecisionSlider
                  label="Rotation"
                  value={editState.geometry.rotation}
                  min={-45}
                  max={45}
                  step={0.5}
                  unit="°"
                  onChange={(v) => updateGeometry('rotation', v)}
                />

                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    onClick={() => updateGeometry('horizontal_flip', !editState.geometry.horizontal_flip)}
                    aria-pressed={editState.geometry.horizontal_flip}
                    className={`flex items-center justify-center space-x-1 py-1 px-2 rounded border text-[10px] font-semibold ${
                      editState.geometry.horizontal_flip
                        ? 'bg-obsidian-accent border-obsidian-accent text-white'
                        : 'bg-obsidian-card hover:bg-obsidian-hover border-obsidian-border text-obsidian-textPri'
                    }`}
                  >
                    <FlipHorizontal className="w-3 h-3" />
                    <span>Flip H</span>
                  </button>
                  <button
                    onClick={() => updateGeometry('vertical_flip', !editState.geometry.vertical_flip)}
                    aria-pressed={editState.geometry.vertical_flip}
                    className={`flex items-center justify-center space-x-1 py-1 px-2 rounded border text-[10px] font-semibold ${
                      editState.geometry.vertical_flip
                        ? 'bg-obsidian-accent border-obsidian-accent text-white'
                        : 'bg-obsidian-card hover:bg-obsidian-hover border-obsidian-border text-obsidian-textPri'
                    }`}
                  >
                    <FlipVertical className="w-3 h-3" />
                    <span>Flip V</span>
                  </button>
                  <button
                    onClick={onToggleCrop}
                    className={`flex items-center justify-center space-x-1 py-1 px-2 rounded text-[10px] font-bold transition-all ${
                      isCropActive
                        ? 'bg-obsidian-accent text-white shadow-sm'
                        : 'bg-obsidian-card hover:bg-obsidian-hover border border-obsidian-border text-obsidian-textPri'
                    }`}
                  >
                    <Crop className="w-3 h-3" />
                    <span>Crop</span>
                  </button>
                </div>
              </CollapsibleCard>

              <CollapsibleCard title="Lens Correction" icon={Sun}>
                <p className="text-[9px] text-obsidian-textSec">
                  Manual optical corrections; lens profiles are not available.
                </p>
                <PrecisionSlider
                  label="Distortion"
                  value={editState.lens_correction.distortion}
                  min={-100}
                  max={100}
                  step={1}
                  onChange={(v) => updateLensCorrection('distortion', v)}
                />
                <PrecisionSlider
                  label="Chromatic Aberration"
                  value={editState.lens_correction.chromatic_aberration}
                  min={-100}
                  max={100}
                  step={1}
                  onChange={(v) => updateLensCorrection('chromatic_aberration', v)}
                />
                <PrecisionSlider
                  label="Vignette"
                  value={editState.lens_correction.vignette}
                  min={0}
                  max={100}
                  step={1}
                  onChange={(v) => updateLensCorrection('vignette', v)}
                />
              </CollapsibleCard>

              {/* Reset All */}
              <button
                onClick={onResetAll}
                className="w-full flex items-center justify-center space-x-1.5 py-1.5 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-400 hover:text-red-300 text-[10.5px] font-bold transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Adjustments</span>
              </button>
            </div>
          )}

          {activeTab === 'color' && (
            <ColorTab editState={editState} histogram={histogram} onChange={onChange} />
          )}

          {activeTab === 'presets' && (
            <PresetsTab
              presets={presets}
              onApplyPreset={onApplyPreset}
              onSavePreset={onSavePreset}
              onDeletePreset={onDeletePreset}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTab
              editUndoStack={editUndoStack}
              editRedoStack={editRedoStack}
              currentEditState={currentEditState}
              onJumpEditHistory={onJumpEditHistory ?? (() => undefined)}
              snapshots={snapshots}
              onChange={onChange}
              onSnapshotChange={onSnapshotChange ?? onChange}
            />
          )}
        </div>
      </aside>
    </div>
  );
};
