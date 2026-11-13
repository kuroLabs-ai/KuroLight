import { ShortcutBindings, ShortcutDefinition } from '../types/shortcuts';

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  { id: 'workspace_library', label: 'Open Gallery', defaultValue: 'Alt+1', group: 'Workspace' },
  { id: 'workspace_develop', label: 'Open Lightbox', defaultValue: 'Alt+2', group: 'Workspace' },
  { id: 'workspace_color_studio', label: 'Open Color Studio', defaultValue: 'Alt+3', group: 'Workspace' },
  { id: 'workspace_visual_flow', label: 'Open Visual Flow', defaultValue: 'Alt+4', group: 'Workspace' },
  { id: 'workspace_deliver', label: 'Open Deliver', defaultValue: 'Alt+5', group: 'Workspace' },
  { id: 'import_images', label: 'Import images', defaultValue: 'Ctrl+O', group: 'Application' },
  { id: 'save_edits', label: 'Save current edits', defaultValue: 'Ctrl+S', group: 'Application' },
  { id: 'open_settings', label: 'Open Settings', defaultValue: 'Ctrl+Comma', group: 'Application' },
  { id: 'toggle_kuro_ai', label: 'Toggle Kuro AI panel', defaultValue: 'Ctrl+K', group: 'Application' },
  { id: 'close_active_panel', label: 'Close active panel or dialog', defaultValue: 'Ctrl+Shift+Escape', group: 'Application' },
  { id: 'undo', label: 'Undo', defaultValue: 'Ctrl+Z', group: 'Editing' },
  { id: 'redo', label: 'Redo', defaultValue: 'Ctrl+Shift+Z', group: 'Editing' },
  { id: 'toggle_filmstrip', label: 'Toggle filmstrip', defaultValue: 'Ctrl+Shift+F', group: 'Editing' },
  { id: 'toggle_right_panel', label: 'Toggle right panel', defaultValue: 'Ctrl+Shift+P', group: 'Editing' },
  { id: 'toggle_crop', label: 'Toggle crop tool', defaultValue: 'Ctrl+Shift+C', group: 'Editing' },
  { id: 'gallery_rate_1', label: 'Rate selected image: 1 star', defaultValue: 'Ctrl+Alt+1', group: 'Gallery' },
  { id: 'gallery_rate_2', label: 'Rate selected image: 2 stars', defaultValue: 'Ctrl+Alt+2', group: 'Gallery' },
  { id: 'gallery_rate_3', label: 'Rate selected image: 3 stars', defaultValue: 'Ctrl+Alt+3', group: 'Gallery' },
  { id: 'gallery_rate_4', label: 'Rate selected image: 4 stars', defaultValue: 'Ctrl+Alt+4', group: 'Gallery' },
  { id: 'gallery_rate_5', label: 'Rate selected image: 5 stars', defaultValue: 'Ctrl+Alt+5', group: 'Gallery' },
  { id: 'gallery_flag_pick', label: 'Flag selected image as pick', defaultValue: 'Ctrl+Alt+P', group: 'Gallery' },
  { id: 'gallery_flag_unflag', label: 'Remove selected image flag', defaultValue: 'Ctrl+Alt+U', group: 'Gallery' },
  { id: 'gallery_flag_reject', label: 'Reject selected image', defaultValue: 'Ctrl+Alt+X', group: 'Gallery' },
  { id: 'gallery_open_develop', label: 'Open selected image in Lightbox', defaultValue: 'Ctrl+Enter', group: 'Gallery' },
  { id: 'gallery_select_all', label: 'Select all visible images', defaultValue: 'Ctrl+A', group: 'Gallery' },
  { id: 'gallery_delete', label: 'Delete selected images', defaultValue: 'Ctrl+Shift+Backspace', group: 'Gallery' },
] as const;

export const DEFAULT_SHORTCUTS: ShortcutBindings = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map(({ id, defaultValue }) => [id, defaultValue]),
) as ShortcutBindings;

export const SHORTCUTS_KEY = 'kurolight_shortcuts';

export const KEY_NAMES: Record<string, string> = {
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  ';': 'Semicolon',
  "'": 'Quote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  '-': 'Minus',
  '=': 'Equal',
  ' ': 'Space',
};
