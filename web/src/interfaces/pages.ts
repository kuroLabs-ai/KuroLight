import React from 'react';
import { ImageAsset } from './asset';
import { Collection } from './collection';
import { EditState } from './edit';
import { Preset } from './preset';
import { ColorScopes, HistogramData } from './scopes';

export interface DevelopPageProps {
  imageUrl: string;
  beforeImageUrl: string;
  restorationPreviewUrl?: string;
  restorationProgress?: { percent: number; message: string; cancellable: boolean } | null;
  isRestorationRunning?: boolean;
  hasRestorationPreview?: boolean;
  activeAsset: ImageAsset | null;
  editState: EditState;
  selectedMaskId: string | null;
  onMaskSelect: (id: string | null) => void;
  selectedRetouchSpotId: string | null;
  onRetouchSpotSelect: (id: string | null) => void;
  onChange: (state: EditState) => void;
  onAutoTone: () => void;
  onPreviewAIRestoration?: () => void;
  onCancelAIRestoration?: () => void;
  onResetAll: () => void;
  isCropActive: boolean;
  cropRect: { x: number; y: number; w: number; h: number };
  onCropChange: (rect: { x: number; y: number; w: number; h: number }) => void;
  setIsCropActive: React.Dispatch<React.SetStateAction<boolean>>;
  isFilmstripVisible: boolean;
  onToggleFilmstrip: () => void;
  presets: Preset[];
  onApplyPreset: (presetId: string) => void;
  onSavePreset: (name: string, category: string) => void | Promise<void>;
  onDeletePreset: (presetId: string) => void | Promise<void>;
  onSnapshotChange: (editState: EditState) => void;
  editUndoStack: EditState[];
  editRedoStack: EditState[];
  onJumpEditHistory: (index: number) => void;
  histogram: HistogramData;
  rightPanelWidth: number;
  isRightPanelCollapsed: boolean;
  onRightPanelResize: (delta: number) => void;
  onResetRightPanelWidth: () => void;
  onToggleRightPanelCollapse: () => void;
  onRequestColorSample?: (onSample: (color: string) => void) => void;
  onCancelColorSample?: () => void;
}

export interface GalleryPageProps {
  assets: ImageAsset[];
  totalAssetCount: number;
  trashCount?: number;
  activeAsset: ImageAsset | null;
  libraryLoading?: { loading: boolean; message: string; cancellable?: boolean };
  onCancelImport?: () => void;
  collections?: Collection[];
  activeCollectionId?: string | null;
  onActiveCollectionChange?: (id: string | null) => void;
  onSelectedAssetChange?: (assetId: string | null) => void;
  onGallerySelectionChange?: (assetIds: string[], selectedAssets: ImageAsset[]) => void;
  onOpenInLightbox?: (assetId: string) => void;
  onOpenSelectedInLightbox?: (assetIds: string[], selectedAssets: ImageAsset[]) => void;
}

export interface ColorStudioPageProps {
  imageUrl: string;
  beforeImageUrl: string;
  activeAsset: ImageAsset | null;
  editState: EditState;
  onChange: (state: EditState) => void;
  histogram: HistogramData;
  colorScopes: ColorScopes | null;
  selectedRetouchSpotId?: string | null;
  onRetouchSpotSelect?: (spotId: string | null) => void;
  onRetouchSpotChange?: (spotId: string, updates: Partial<Record<string, unknown>>) => void;
}

export interface DeliverPageProps {
  assets: ImageAsset[];
  activeAsset: ImageAsset | null;
  collections: Collection[];
  activeCollectionId: string | null;
}

export interface VisualFlowPageProps {
  imageUrl: string;
  beforeImageUrl: string;
  activeAsset: ImageAsset | null;
  editState: EditState;
  onChange: (state: EditState) => void;
  editUndoStack: EditState[];
  editRedoStack: EditState[];
  hasPendingEditHistory: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onJumpEditHistory: (index: number) => void;
  presets: Preset[];
  onApplyPreset: (presetId: string) => void;
  onSavePreset: (name: string, category: string) => void | Promise<void>;
  histogram: HistogramData;
}
