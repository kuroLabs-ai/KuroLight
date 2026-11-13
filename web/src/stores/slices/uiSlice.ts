import { StateCreator } from 'zustand';
import { AppState, NoticeState, ProcessingProgressState } from '@/interfaces/store';
import { WorkspaceId } from '@/types';

export interface UISlice {
  workspace: WorkspaceId;
  isFilmstripVisible: boolean;
  isAIPopupOpen: boolean;
  isSettingsOpen: boolean;
  notice: NoticeState | null;
  processingProgress: ProcessingProgressState | null;

  setWorkspace: (ws: WorkspaceId) => void;
  setIsFilmstripVisible: (val: boolean | ((prev: boolean) => boolean)) => void;
  setIsAIPopupOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setNotice: (notice: NoticeState | null) => void;
  setProcessingProgress: (progress: ProcessingProgressState | null) => void;
}

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set) => ({
  workspace: 'library',
  isFilmstripVisible: true,
  isAIPopupOpen: false,
  isSettingsOpen: false,
  notice: null,
  processingProgress: null,

  setWorkspace: (workspace) => set({ workspace }),
  setIsFilmstripVisible: (val) =>
    set((state) => ({
      isFilmstripVisible: typeof val === 'function' ? val(state.isFilmstripVisible) : val,
    })),
  setIsAIPopupOpen: (isAIPopupOpen) => set({ isAIPopupOpen }),
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setNotice: (notice) => set({ notice }),
  setProcessingProgress: (processingProgress) => set({ processingProgress }),
});
