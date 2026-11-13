import { ImageAsset } from './asset';
import { Collection } from './collection';
import { EditState } from './edit';
import { Preset } from './preset';
import { ColorScopes } from './scopes';
import { WorkspaceId } from '../types/workspace';

export interface LibraryLoadingState {
  loading: boolean;
  message: string;
  cancellable: boolean;
}

export interface NoticeState {
  title: string;
  message: string;
  level: string;
}

export interface ProcessingProgressState {
  percent: number;
  message: string;
  cancellable: boolean;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AppState {
  // Navigation & Workspace
  workspace: WorkspaceId;
  gallerySelectedAssetId: string | null;

  // Assets & Library
  assets: ImageAsset[];
  assetCount: number;
  trashCount: number;
  libraryLoading: LibraryLoadingState;
  notice: NoticeState | null;
  processingProgress: ProcessingProgressState | null;

  // Collections & Presets
  collections: Collection[];
  activeCollectionId: string | null;
  presets: Preset[];

  // Active Asset & Edit State
  activeAsset: ImageAsset | null;
  editState: EditState;
  historyList: string[];
  activeHistoryIndex: number;

  // Display & Scopes
  imageUrl: string;
  beforeImageUrl: string;
  histogram: { r: number[]; g: number[]; b: number[]; lum: number[] };
  colorScopes: ColorScopes | null;

  // Tools & Selection
  selectedMaskId: string | null;
  selectedRetouchSpotId: string | null;
  isFilmstripVisible: boolean;
  isCropActive: boolean;
  cropRect: CropRect;

  // Modals & Popups
  isAIPopupOpen: boolean;
  isSettingsOpen: boolean;

  // Actions
  setWorkspace: (ws: WorkspaceId) => void;
  setGallerySelectedAssetId: (id: string | null) => void;
  setAssets: (assets: ImageAsset[]) => void;
  setAssetCount: (count: number) => void;
  setTrashCount: (count: number) => void;
  setLibraryLoading: (loading: LibraryLoadingState) => void;
  setNotice: (notice: NoticeState | null) => void;
  setProcessingProgress: (progress: ProcessingProgressState | null) => void;
  setCollections: (collections: Collection[]) => void;
  setActiveCollectionId: (id: string | null) => void;
  setPresets: (presets: Preset[]) => void;
  setActiveAsset: (asset: ImageAsset | null) => void;
  setEditState: (editState: EditState) => void;
  updateEditState: (partial: Partial<EditState>) => void;
  setHistoryList: (history: string[]) => void;
  setActiveHistoryIndex: (index: number) => void;
  setImageUrl: (url: string) => void;
  setBeforeImageUrl: (url: string) => void;
  setHistogram: (histogram: { r: number[]; g: number[]; b: number[]; lum: number[] }) => void;
  setColorScopes: (scopes: ColorScopes | null) => void;
  setSelectedMaskId: (id: string | null) => void;
  setSelectedRetouchSpotId: (id: string | null) => void;
  setIsFilmstripVisible: (visible: boolean | ((prev: boolean) => boolean)) => void;
  setIsCropActive: (active: boolean | ((prev: boolean) => boolean)) => void;
  setCropRect: (rect: CropRect) => void;
  setIsAIPopupOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  resetActiveAssetAndEdits: () => void;
}
