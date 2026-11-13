import { create } from 'zustand';
import { AppState } from '@/interfaces/store';
import { createLibrarySlice, LibrarySlice } from './slices/librarySlice';
import { createEditSlice, EditSlice } from './slices/editSlice';
import { createUISlice, UISlice } from './slices/uiSlice';

export const useAppStore = create<AppState>()((...a) => ({
  ...createLibrarySlice(...a),
  ...createEditSlice(...a),
  ...createUISlice(...a),
}));

// Domain-specific selector hooks
export const useLibraryStore = <T>(selector: (state: LibrarySlice) => T): T =>
  useAppStore(selector);

export const useEditStore = <T>(selector: (state: EditSlice) => T): T =>
  useAppStore(selector);

export const useUIStore = <T>(selector: (state: UISlice) => T): T =>
  useAppStore(selector);

export type { LibrarySlice, EditSlice, UISlice };
