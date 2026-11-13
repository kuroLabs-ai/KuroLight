import { StateCreator } from 'zustand';
import { AppState, CropRect } from '@/interfaces/store';
import { ImageAsset, EditState, Preset, ColorScopes } from '@/types';
import { DEFAULT_EDIT_STATE } from '@/constants/editState';

export interface EditSlice {
  activeAsset: ImageAsset | null;
  editState: EditState;
  presets: Preset[];
  historyList: string[];
  activeHistoryIndex: number;
  imageUrl: string;
  beforeImageUrl: string;
  histogram: { r: number[]; g: number[]; b: number[]; lum: number[] };
  colorScopes: ColorScopes | null;
  selectedMaskId: string | null;
  selectedRetouchSpotId: string | null;
  isCropActive: boolean;
  cropRect: CropRect;

  setActiveAsset: (asset: ImageAsset | null) => void;
  setEditState: (editState: EditState) => void;
  updateEditState: (partial: Partial<EditState>) => void;
  setPresets: (presets: Preset[]) => void;
  setHistoryList: (historyList: string[]) => void;
  setActiveHistoryIndex: (activeHistoryIndex: number) => void;
  setImageUrl: (imageUrl: string) => void;
  setBeforeImageUrl: (beforeImageUrl: string) => void;
  setHistogram: (histogram: { r: number[]; g: number[]; b: number[]; lum: number[] }) => void;
  setColorScopes: (colorScopes: ColorScopes | null) => void;
  setSelectedMaskId: (selectedMaskId: string | null) => void;
  setSelectedRetouchSpotId: (selectedRetouchSpotId: string | null) => void;
  setIsCropActive: (val: boolean | ((prev: boolean) => boolean)) => void;
  setCropRect: (cropRect: CropRect) => void;
  resetActiveAssetAndEdits: () => void;
}

export const createEditSlice: StateCreator<AppState, [], [], EditSlice> = (set) => ({
  activeAsset: null,
  editState: DEFAULT_EDIT_STATE,
  presets: [],
  historyList: [],
  activeHistoryIndex: -1,
  imageUrl: '',
  beforeImageUrl: '',
  histogram: { r: [], g: [], b: [], lum: [] },
  colorScopes: null,
  selectedMaskId: null,
  selectedRetouchSpotId: null,
  isCropActive: false,
  cropRect: { x: 0, y: 0, w: 1, h: 1 },

  setActiveAsset: (activeAsset) => set({ activeAsset }),
  setEditState: (incomingState) =>
    set(() => {
      const state = incomingState || DEFAULT_EDIT_STATE;
      return {
        editState: {
          ...DEFAULT_EDIT_STATE,
          ...state,
          exposure: { ...DEFAULT_EDIT_STATE.exposure, ...(state.exposure || {}) },
          white_balance: { ...DEFAULT_EDIT_STATE.white_balance, ...(state.white_balance || {}) },
          detail: { ...DEFAULT_EDIT_STATE.detail, ...(state.detail || {}) },
          geometry: { ...DEFAULT_EDIT_STATE.geometry, ...(state.geometry || {}) },
          lens_correction: { ...DEFAULT_EDIT_STATE.lens_correction, ...(state.lens_correction || {}) },
          color_grading: { ...DEFAULT_EDIT_STATE.color_grading, ...(state.color_grading || {}) },
          tone_curves: { ...DEFAULT_EDIT_STATE.tone_curves, ...(state.tone_curves || {}) },
          masks: state.masks ?? [],
          retouch_spots: state.retouch_spots ?? [],
        },
      };
    }),
  updateEditState: (partial) =>
    set((state) => ({ editState: { ...state.editState, ...partial } })),
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
  resetActiveAssetAndEdits: () =>
    set({
      activeAsset: null,
      editState: DEFAULT_EDIT_STATE,
      selectedMaskId: null,
      selectedRetouchSpotId: null,
      imageUrl: '',
      beforeImageUrl: '',
      histogram: { r: [], g: [], b: [], lum: [] },
      colorScopes: null,
      historyList: [],
      activeHistoryIndex: -1,
    }),
});
