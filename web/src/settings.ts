export const SHORTCUT_DEFINITIONS = [
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

export type ShortcutId = (typeof SHORTCUT_DEFINITIONS)[number]['id'];
export type ShortcutBindings = Record<ShortcutId, string>;

export const DEFAULT_SHORTCUTS: ShortcutBindings = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map(({ id, defaultValue }) => [id, defaultValue]),
) as ShortcutBindings;

const SHORTCUTS_KEY = 'kurolight_shortcuts';

const KEY_NAMES: Record<string, string> = {
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

export function getShortcutFromEvent(event: KeyboardEvent): string | null {
  if (!event.ctrlKey && !event.shiftKey && !event.altKey) return null;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null;

  const key = KEY_NAMES[event.key] ?? (
    event.key.length === 1 ? event.key.toUpperCase() : event.key
  );
  const modifiers = [
    ...(event.ctrlKey ? ['Ctrl'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
    ...(event.altKey ? ['Alt'] : []),
  ];
  return [...modifiers, key].join('+');
}

export function loadShortcuts(): ShortcutBindings {
  try {
    const stored = localStorage.getItem(SHORTCUTS_KEY);
    if (!stored) return { ...DEFAULT_SHORTCUTS };
    const parsed = JSON.parse(stored) as Partial<ShortcutBindings>;
    const shortcuts = { ...DEFAULT_SHORTCUTS };
    for (const { id } of SHORTCUT_DEFINITIONS) {
      const value = parsed[id];
      if (typeof value === 'string' && /^(Ctrl|Shift|Alt)(\+(Ctrl|Shift|Alt))*\+.+$/.test(value)) {
        shortcuts[id] = value;
      }
    }
    return shortcuts;
  } catch (error) {
    console.error('Could not load KuroLight shortcuts', error);
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function saveShortcuts(shortcuts: ShortcutBindings): void {
  localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(shortcuts));
  window.dispatchEvent(new CustomEvent('kurolight:shortcuts-updated'));
}
