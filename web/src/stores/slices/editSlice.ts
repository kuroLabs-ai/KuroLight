import { StateCreator } from 'zustand';
import { AppState, CropRect } from '@/interfaces/store';
import { ImageAsset, EditState, Preset, ColorScopes } from '@/types';
import type { HistogramData } from '@/interfaces/scopes';
import { DEFAULT_EDIT_STATE } from '@/constants/editState';

export interface EditSlice {
  activeAsset: ImageAsset | null;
  editState: EditState;
  presets: Preset[];
  historyList: string[];
  activeHistoryIndex: number;
  editUndoStack: EditState[];
  editRedoStack: EditState[];
  editHistoryByAsset: Record<string, { undo: EditState[]; redo: EditState[] }>;
  hasPendingEditHistory: boolean;
  imageUrl: string;
  beforeImageUrl: string;
  histogram: HistogramData;
  colorScopes: ColorScopes | null;
  selectedMaskId: string | null;
  selectedRetouchSpotId: string | null;
  isCropActive: boolean;
  cropRect: CropRect;

  setActiveAsset: (asset: ImageAsset | null) => void;
  setEditState: (editState: EditState) => void;
  setEditStateWithHistory: (editState: EditState) => void;
  undoEditState: () => void;
  redoEditState: () => void;
  jumpEditHistory: (index: number) => void;
  updateEditState: (partial: Partial<EditState>) => void;
  setPresets: (presets: Preset[]) => void;
  setHistoryList: (historyList: string[]) => void;
  setActiveHistoryIndex: (activeHistoryIndex: number) => void;
  setImageUrl: (imageUrl: string) => void;
  setBeforeImageUrl: (beforeImageUrl: string) => void;
  setHistogram: (histogram: HistogramData) => void;
  setColorScopes: (colorScopes: ColorScopes | null) => void;
  setSelectedMaskId: (selectedMaskId: string | null) => void;
  setSelectedRetouchSpotId: (selectedRetouchSpotId: string | null) => void;
  setIsCropActive: (val: boolean | ((prev: boolean) => boolean)) => void;
  setCropRect: (cropRect: CropRect) => void;
  resetActiveAssetAndEdits: () => void;
}

function normalizeEditState(incomingState: EditState): EditState {
  const state = incomingState || DEFAULT_EDIT_STATE;
  const defaults = DEFAULT_EDIT_STATE;
  const defaultHsl: NonNullable<EditState['hsl']> = {
    red: { hue: 0, saturation: 0, luminance: 0 },
    orange: { hue: 0, saturation: 0, luminance: 0 },
    yellow: { hue: 0, saturation: 0, luminance: 0 },
    green: { hue: 0, saturation: 0, luminance: 0 },
    aqua: { hue: 0, saturation: 0, luminance: 0 },
    blue: { hue: 0, saturation: 0, luminance: 0 },
    purple: { hue: 0, saturation: 0, luminance: 0 },
    magenta: { hue: 0, saturation: 0, luminance: 0 },
  };

  return {
    ...defaults,
    ...state,
    exposure: { ...defaults.exposure, ...(state.exposure || {}) },
    white_balance: { ...defaults.white_balance, ...(state.white_balance || {}) },
    detail: { ...defaults.detail, ...(state.detail || {}) },
    geometry: { ...defaults.geometry, ...(state.geometry || {}) },
    lens_correction: { ...defaults.lens_correction, ...(state.lens_correction || {}) },
    hsl: state.hsl
      ? Object.fromEntries(
          Object.entries({ ...defaultHsl, ...state.hsl }).map(([band, value]) => [
            band,
            { ...defaultHsl[band], ...value },
          ])
        ) as NonNullable<EditState['hsl']>
      : defaultHsl,
    color_grading: state.color_grading
      ? {
          ...defaults.color_grading,
          ...state.color_grading,
          lift: { ...defaults.color_grading.lift, ...state.color_grading.lift },
          gamma: { ...defaults.color_grading.gamma, ...state.color_grading.gamma },
          gain: { ...defaults.color_grading.gain, ...state.color_grading.gain },
          offset: { ...defaults.color_grading.offset, ...state.color_grading.offset },
        }
      : defaults.color_grading,
    tone_curves: state.tone_curves
      ? { ...defaults.tone_curves, ...state.tone_curves }
      : defaults.tone_curves,
    masks: state.masks ?? [],
    retouch_spots: state.retouch_spots ?? [],
    snapshots: state.snapshots ?? {},
  };
}

function mergeEditState(current: EditState, partial: Partial<EditState>): EditState {
  const merged: EditState = { ...current, ...partial };

  if (partial.exposure) merged.exposure = { ...current.exposure, ...partial.exposure };
  if (partial.white_balance) {
    merged.white_balance = { ...current.white_balance, ...partial.white_balance };
  }
  if (partial.detail) merged.detail = { ...current.detail, ...partial.detail };
  if (partial.geometry) merged.geometry = { ...current.geometry, ...partial.geometry };
  if (partial.lens_correction) {
    merged.lens_correction = { ...current.lens_correction, ...partial.lens_correction };
  }
  if (partial.tone_curves) merged.tone_curves = { ...current.tone_curves, ...partial.tone_curves };

  if (partial.hsl) {
    merged.hsl = Object.fromEntries(
      Object.entries({ ...current.hsl, ...partial.hsl }).map(([band, value]) => [
        band,
        { ...current.hsl?.[band], ...value },
      ])
    ) as NonNullable<EditState['hsl']>;
  }

  if (partial.color_grading) {
    const grading = partial.color_grading;
    merged.color_grading = {
      ...current.color_grading,
      ...grading,
      lift: { ...current.color_grading?.lift, ...grading.lift },
      gamma: { ...current.color_grading?.gamma, ...grading.gamma },
      gain: { ...current.color_grading?.gain, ...grading.gain },
      offset: { ...current.color_grading?.offset, ...grading.offset },
    };
  }

  return normalizeEditState(merged);
}

export const createEditSlice: StateCreator<AppState, [], [], EditSlice> = (set, get) => {
  let pendingHistory: { assetId: string; baseline: EditState } | null = null;
  let historyCommitTimer: ReturnType<typeof setTimeout> | null = null;

  const flushPendingHistory = () => {
    if (historyCommitTimer !== null) {
      clearTimeout(historyCommitTimer);
      historyCommitTimer = null;
    }

    const pending = pendingHistory;
    pendingHistory = null;
    if (!pending) return;

    set((state) => {
      if (state.editState.asset_id !== pending.assetId) {
        return { hasPendingEditHistory: false };
      }
      if (JSON.stringify(pending.baseline) === JSON.stringify(state.editState)) {
        return { hasPendingEditHistory: false };
      }

      const undo = [...state.editUndoStack, pending.baseline].slice(-100);
      const history = {
        ...state.editHistoryByAsset,
        [pending.assetId]: { undo, redo: [] },
      };
      return {
        editUndoStack: undo,
        editRedoStack: [],
        editHistoryByAsset: history,
        hasPendingEditHistory: false,
      };
    });
  };

  const setEditStateWithHistory = (incomingState: EditState) => {
    const nextState = normalizeEditState(incomingState);
    const current = get().editState;
    if (current.asset_id !== nextState.asset_id) {
      flushPendingHistory();
      const history = get().editHistoryByAsset[nextState.asset_id];
      set({
        editState: nextState,
        editUndoStack: history?.undo ?? [],
        editRedoStack: history?.redo ?? [],
        hasPendingEditHistory: false,
      });
      return;
    }
    if (JSON.stringify(current) === JSON.stringify(nextState)) return;

    if (!pendingHistory) {
      pendingHistory = {
        assetId: current.asset_id,
        baseline: JSON.parse(JSON.stringify(current)) as EditState,
      };
    }

    const historyByAsset = {
      ...get().editHistoryByAsset,
      [current.asset_id]: {
        undo: get().editUndoStack,
        redo: [],
      },
    };
    set({
      editState: nextState,
      editRedoStack: [],
      editHistoryByAsset: historyByAsset,
      hasPendingEditHistory: true,
    });

    if (historyCommitTimer !== null) clearTimeout(historyCommitTimer);
    historyCommitTimer = setTimeout(flushPendingHistory, 180);
  };

  return ({
  activeAsset: null,
  editState: normalizeEditState(DEFAULT_EDIT_STATE),
  presets: [],
  historyList: [],
  activeHistoryIndex: -1,
  editUndoStack: [],
  editRedoStack: [],
  editHistoryByAsset: {},
  hasPendingEditHistory: false,
  imageUrl: '',
  beforeImageUrl: '',
  histogram: { r: [], g: [], b: [], lum: [], sample_count: 0 },
  colorScopes: null,
  selectedMaskId: null,
  selectedRetouchSpotId: null,
  isCropActive: false,
  cropRect: { x: 0, y: 0, w: 1, h: 1 },

  setActiveAsset: (activeAsset) => set({ activeAsset }),
  setEditState: (incomingState) => {
    flushPendingHistory();
    const nextState = normalizeEditState(incomingState);
    const history = get().editHistoryByAsset[nextState.asset_id];
    set({
      editState: nextState,
      editUndoStack: history?.undo ?? [],
      editRedoStack: history?.redo ?? [],
      hasPendingEditHistory: false,
    });
  },
  setEditStateWithHistory,
  undoEditState: () => {
    flushPendingHistory();
    set((state) => {
      const previousState = state.editUndoStack[state.editUndoStack.length - 1];
      if (!previousState) return state;
      const undo = state.editUndoStack.slice(0, -1);
      const redo = [...state.editRedoStack, state.editState].slice(-100);
      return {
        editState: previousState,
        editUndoStack: undo,
        editRedoStack: redo,
        editHistoryByAsset: {
          ...state.editHistoryByAsset,
          [previousState.asset_id]: { undo, redo },
        },
        selectedMaskId: previousState.masks?.some((mask) => mask.id === state.selectedMaskId)
          ? state.selectedMaskId
          : previousState.masks?.[0]?.id ?? null,
        selectedRetouchSpotId: previousState.retouch_spots?.some(
          (spot) => spot.id === state.selectedRetouchSpotId
        )
          ? state.selectedRetouchSpotId
          : previousState.retouch_spots?.[0]?.id ?? null,
      };
    });
  },
  redoEditState: () => {
    flushPendingHistory();
    set((state) => {
      const nextState = state.editRedoStack[state.editRedoStack.length - 1];
      if (!nextState) return state;
      const undo = [...state.editUndoStack, state.editState].slice(-100);
      const redo = state.editRedoStack.slice(0, -1);
      return {
        editState: nextState,
        editUndoStack: undo,
        editRedoStack: redo,
        editHistoryByAsset: {
          ...state.editHistoryByAsset,
          [nextState.asset_id]: { undo, redo },
        },
        selectedMaskId: nextState.masks?.some((mask) => mask.id === state.selectedMaskId)
          ? state.selectedMaskId
          : nextState.masks?.[0]?.id ?? null,
        selectedRetouchSpotId: nextState.retouch_spots?.some(
          (spot) => spot.id === state.selectedRetouchSpotId
        )
          ? state.selectedRetouchSpotId
          : nextState.retouch_spots?.[0]?.id ?? null,
      };
    });
  },
  jumpEditHistory: (index) => {
    flushPendingHistory();
    set((state) => {
      const timeline = [
        ...state.editUndoStack,
        state.editState,
        ...state.editRedoStack.slice().reverse(),
      ];
      if (!Number.isInteger(index) || index < 0 || index >= timeline.length) return state;

      const editState = timeline[index];
      const undo = timeline.slice(0, index);
      const redo = timeline.slice(index + 1).reverse();
      return {
        editState,
        editUndoStack: undo,
        editRedoStack: redo,
        editHistoryByAsset: {
          ...state.editHistoryByAsset,
          [editState.asset_id]: { undo, redo },
        },
        selectedMaskId: editState.masks?.some((mask) => mask.id === state.selectedMaskId)
          ? state.selectedMaskId
          : editState.masks?.[0]?.id ?? null,
        selectedRetouchSpotId: editState.retouch_spots?.some(
          (spot) => spot.id === state.selectedRetouchSpotId
        )
          ? state.selectedRetouchSpotId
          : editState.retouch_spots?.[0]?.id ?? null,
      };
    });
  },
  updateEditState: (partial) =>
    setEditStateWithHistory(mergeEditState(get().editState, partial)),
  setPresets: (presets) => set({ presets }),
  setHistoryList: (historyList) => set({ historyList }),
  setActiveHistoryIndex: (activeHistoryIndex) => set({ activeHistoryIndex }),
  setImageUrl: (imageUrl) => set({ imageUrl }),
  setBeforeImageUrl: (beforeImageUrl) => set({ beforeImageUrl }),
  setHistogram: (histogram) => set({ histogram }),
  setColorScopes: (colorScopes) => set({ colorScopes }),
  setSelectedMaskId: (selectedMaskId) => set({ selectedMaskId }),
  setSelectedRetouchSpotId: (selectedRetouchSpotId) => set({ selectedRetouchSpotId }),
  setIsCropActive: (val) =>
    set((state) => ({
      isCropActive: typeof val === 'function' ? val(state.isCropActive) : val,
    })),
  setCropRect: (cropRect) => set({ cropRect }),
  resetActiveAssetAndEdits: () => {
    flushPendingHistory();
    set({
      activeAsset: null,
      editState: normalizeEditState(DEFAULT_EDIT_STATE),
      selectedMaskId: null,
      selectedRetouchSpotId: null,
      imageUrl: '',
      beforeImageUrl: '',
      histogram: { r: [], g: [], b: [], lum: [], sample_count: 0 },
      colorScopes: null,
      historyList: [],
      activeHistoryIndex: -1,
      editUndoStack: [],
      editRedoStack: [],
      hasPendingEditHistory: false,
    });
  },
  });
};
