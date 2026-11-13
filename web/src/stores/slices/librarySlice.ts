import { StateCreator } from 'zustand';
import { AppState } from '@/interfaces/store';
import { ImageAsset, Collection } from '@/types';
import { LibraryLoadingState } from '@/interfaces/store';

export interface LibrarySlice {
  assets: ImageAsset[];
  assetCount: number;
  trashCount: number;
  libraryLoading: LibraryLoadingState;
  collections: Collection[];
  activeCollectionId: string | null;
  gallerySelectedAssetId: string | null;

  setAssets: (assets: ImageAsset[]) => void;
  setAssetCount: (count: number) => void;
  setTrashCount: (count: number) => void;
  setLibraryLoading: (loading: LibraryLoadingState) => void;
  setCollections: (collections: Collection[]) => void;
  setActiveCollectionId: (id: string | null) => void;
  setGallerySelectedAssetId: (id: string | null) => void;
}

export const createLibrarySlice: StateCreator<AppState, [], [], LibrarySlice> = (set) => ({
  assets: [],
  assetCount: 0,
  trashCount: 0,
  libraryLoading: {
    loading: typeof window !== 'undefined' && Boolean(window.pywebview?.api),
    message: 'Loading photo library…',
    cancellable: false,
  },
  collections: [],
  activeCollectionId: null,
  gallerySelectedAssetId: null,

  setAssets: (assets) => set({ assets }),
  setAssetCount: (assetCount) => set({ assetCount }),
  setTrashCount: (trashCount) => set({ trashCount }),
  setLibraryLoading: (libraryLoading) => set({ libraryLoading }),
  setCollections: (collections) => set({ collections }),
  setActiveCollectionId: (activeCollectionId) => set({ activeCollectionId }),
  setGallerySelectedAssetId: (gallerySelectedAssetId) => set({ gallerySelectedAssetId }),
});
