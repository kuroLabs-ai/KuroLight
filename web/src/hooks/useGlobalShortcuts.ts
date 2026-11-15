import { useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { bridge } from '../bridge';
import { WorkspaceId } from '../types';
import { DEFAULT_SHORTCUTS, getShortcutFromEvent, loadShortcuts } from '../settings';

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
    isFilmstripVisible,
  } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const shortcut = getShortcutFromEvent(event);
      const bindings = loadShortcuts();
      let action = shortcut
        ? Object.entries(bindings).find(([, binding]) => binding === shortcut)?.[0]
        : undefined;
      if (!action) {
        const legacyKey =
          shortcut ??
          (event.key.length === 1 ? event.key.toUpperCase() : event.key);
        const legacyAction: Record<string, keyof typeof bindings> = {
          G: 'workspace_library',
          D: 'workspace_develop',
          C: 'workspace_color_studio',
          F: 'toggle_filmstrip',
          R: 'toggle_crop',
          Tab: 'toggle_right_panel',
          'Ctrl+I': 'import_images',
          'Ctrl+Y': 'redo',
        };
        const legacy = legacyAction[legacyKey];
        if (legacy && bindings[legacy] === DEFAULT_SHORTCUTS[legacy]) action = legacy;
      }
      if (!action && event.key === 'Escape') {
        if (isSettingsOpen) setIsSettingsOpen(false);
        else if (isAIPopupOpen) setIsAIPopupOpen(false);
        else if (isCropActive) setIsCropActive(false);
        return;
      }
      if (!action) return;

      const target = event.target as HTMLElement | null;
      const isEditingText =
        !!target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (isEditingText && action !== 'save_edits' && action !== 'close_active_panel') return;

      if (action.startsWith('gallery_') && workspace !== 'library') return;

      event.preventDefault();
      switch (action) {
        case 'workspace_library':
          onWorkspaceChange('library');
          break;
        case 'workspace_develop':
          onWorkspaceChange('develop');
          break;
        case 'workspace_color_studio':
          onWorkspaceChange('color_studio');
          break;
        case 'workspace_visual_flow':
          onWorkspaceChange('visual_flow');
          break;
        case 'workspace_deliver':
          onWorkspaceChange('deliver');
          break;
        case 'import_images':
          void bridge.importFiles();
          break;
        case 'save_edits':
          void onSaveEdits();
          break;
        case 'open_settings':
          setIsSettingsOpen(!isSettingsOpen);
          break;
        case 'toggle_kuro_ai':
          setIsAIPopupOpen(!isAIPopupOpen);
          break;
        case 'close_active_panel':
          if (isSettingsOpen) setIsSettingsOpen(false);
          else if (isAIPopupOpen) setIsAIPopupOpen(false);
          else if (isCropActive) setIsCropActive(false);
          break;
        case 'undo':
          undoEditState();
          break;
        case 'redo':
          redoEditState();
          break;
        case 'toggle_filmstrip':
          setIsFilmstripVisible(!isFilmstripVisible);
          bridge.toggleFilmstrip();
          break;
        case 'toggle_right_panel':
          toggleRightPanelCollapse();
          break;
        case 'toggle_crop':
          if (workspace === 'develop') setIsCropActive(!isCropActive);
          break;
        default:
          if (action.startsWith('gallery_')) {
            window.dispatchEvent(new CustomEvent('kurolight:shortcut', { detail: action }));
          }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isAIPopupOpen,
    isCropActive,
    isFilmstripVisible,
    isSettingsOpen,
    onSaveEdits,
    onWorkspaceChange,
    redoEditState,
    setIsAIPopupOpen,
    setIsFilmstripVisible,
    setIsSettingsOpen,
    setIsCropActive,
    toggleRightPanelCollapse,
    undoEditState,
    workspace,
  ]);
}
