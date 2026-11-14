import { useHotkeys } from 'react-hotkeys-hook';
import { useAppStore } from '../stores/useAppStore';
import { bridge } from '../bridge';
import { WorkspaceId } from '../types';
import { getShortcutFromEvent, loadShortcuts } from '../settings';

export interface UseGlobalShortcutsOptions {
  toggleRightPanelCollapse: () => void;
  onWorkspaceChange: (ws: WorkspaceId) => void;
  onSaveEdits: () => void | Promise<void>;
}

export function useGlobalShortcuts({
  toggleRightPanelCollapse,
  onWorkspaceChange,
  onSaveEdits,
}: UseGlobalShortcutsOptions): void {
  const {
    workspace,
    undoEditState,
    redoEditState,
    isSettingsOpen,
    isAIPopupOpen,
    isCropActive,
    setIsSettingsOpen,
    setIsAIPopupOpen,
    setIsCropActive,
    setIsFilmstripVisible,
  } = useAppStore();

  // Declarative hotkeys using react-hotkeys-hook
  // 1. Undo & Redo
  useHotkeys('mod+z', (e) => {
    e.preventDefault();
    undoEditState();
  });
  useHotkeys(['mod+shift+z', 'mod+y'], (e) => {
    e.preventDefault();
    redoEditState();
  });

  // 2. Workspaces
  useHotkeys('g', (e) => {
    e.preventDefault();
    onWorkspaceChange('library');
  });
  useHotkeys('d', (e) => {
    e.preventDefault();
    onWorkspaceChange('develop');
  });
  useHotkeys('c', (e) => {
    e.preventDefault();
    onWorkspaceChange('color_studio');
  });

  // 3. Panels & Tools
  useHotkeys('tab', (e) => {
    e.preventDefault();
    toggleRightPanelCollapse();
  });
  useHotkeys('f', (e) => {
    e.preventDefault();
    setIsFilmstripVisible((prev) => !prev);
    bridge.toggleFilmstrip();
  });
  useHotkeys('r', (e) => {
    if (workspace === 'develop') {
      e.preventDefault();
      setIsCropActive(!isCropActive);
    }
  });

  // 4. Modals & Settings
  useHotkeys('mod+,', (e) => {
    e.preventDefault();
    setIsSettingsOpen(!isSettingsOpen);
  });
  useHotkeys('mod+s', (e) => {
    e.preventDefault();
    void onSaveEdits();
  });
  useHotkeys('mod+i', (e) => {
    e.preventDefault();
    bridge.importFiles();
  });
  useHotkeys('escape', () => {
    if (isSettingsOpen) setIsSettingsOpen(false);
    else if (isAIPopupOpen) setIsAIPopupOpen(false);
    else if (isCropActive) {
      setIsCropActive(false);
    }
  });

  // 5. Catch-all custom user-mapped shortcuts
  useHotkeys('*', (e) => {
    const target = e.target as HTMLElement;
    if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    const shortcut = getShortcutFromEvent(e);
    if (!shortcut) return;
    const action = Object.entries(loadShortcuts()).find(([, value]) => value === shortcut)?.[0];
    if (!action) return;

    if (action.startsWith('gallery_')) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('kurolight:shortcut', { detail: action }));
    }
  });
}
