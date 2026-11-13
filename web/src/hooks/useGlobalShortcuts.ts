import { useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';
import { bridge } from '../bridge';
import { WorkspaceId } from '../types';
import { getShortcutFromEvent, loadShortcuts } from '../settings';

export interface UseGlobalShortcutsOptions {
  toggleRightPanelCollapse: () => void;
  onWorkspaceChange: (ws: WorkspaceId) => void;
}

export function useGlobalShortcuts({
  toggleRightPanelCollapse,
  onWorkspaceChange,
}: UseGlobalShortcutsOptions): void {
  const {
    workspace,
    editState,
    isSettingsOpen,
    isAIPopupOpen,
    isCropActive,
    setIsSettingsOpen,
    setIsAIPopupOpen,
    setIsCropActive,
    setIsFilmstripVisible,
  } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.ctrlKey && ['=', '+', '-', '0'].includes(e.key)) {
        e.preventDefault();
        return;
      }

      const shortcut = getShortcutFromEvent(e);
      if (!shortcut) return;
      const action = Object.entries(loadShortcuts()).find(([, value]) => value === shortcut)?.[0];
      if (!action) return;

      if (action.startsWith('workspace_')) {
        const nextWorkspace = action.replace('workspace_', '') as WorkspaceId;
        const workspaceIds: Record<string, WorkspaceId> = {
          library: 'library',
          develop: 'develop',
          color_studio: 'color_studio',
          visual_flow: 'visual_flow',
          deliver: 'deliver',
        };
        const next = workspaceIds[nextWorkspace];
        if (next) {
          e.preventDefault();
          onWorkspaceChange(next);
        }
      } else if (action.startsWith('gallery_')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('kurolight:shortcut', { detail: action }));
      } else {
        e.preventDefault();
        switch (action) {
          case 'import_images':
            bridge.importFiles();
            break;
          case 'save_edits':
            bridge.saveEditState(editState);
            break;
          case 'open_settings':
            setIsSettingsOpen(true);
            break;
          case 'toggle_kuro_ai':
            setIsAIPopupOpen(!isAIPopupOpen);
            break;
          case 'close_active_panel':
            if (isSettingsOpen) setIsSettingsOpen(false);
            else if (isAIPopupOpen) setIsAIPopupOpen(false);
            else if (isCropActive) {
              setIsCropActive(false);
              bridge.cancelCrop();
            }
            break;
          case 'undo':
            bridge.undo();
            break;
          case 'redo':
            bridge.redo();
            break;
          case 'toggle_filmstrip':
            setIsFilmstripVisible((prev) => !prev);
            bridge.toggleFilmstrip();
            break;
          case 'toggle_right_panel':
            toggleRightPanelCollapse();
            break;
          case 'toggle_crop':
            if (workspace === 'develop') {
              setIsCropActive((previous) => {
                const next = !previous;
                bridge.setCropMode(next);
                return next;
              });
            }
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    workspace,
    editState,
    isSettingsOpen,
    isAIPopupOpen,
    isCropActive,
    setIsSettingsOpen,
    setIsAIPopupOpen,
    setIsCropActive,
    setIsFilmstripVisible,
    toggleRightPanelCollapse,
    onWorkspaceChange,
  ]);
}
