import {
  SHORTCUT_DEFINITIONS,
  DEFAULT_SHORTCUTS,
  SHORTCUTS_KEY,
  KEY_NAMES,
} from './constants/shortcuts';
import type { ShortcutId, ShortcutBindings, ShortcutDefinition } from './types/shortcuts';

export {
  SHORTCUT_DEFINITIONS,
  DEFAULT_SHORTCUTS,
  SHORTCUTS_KEY,
  KEY_NAMES,
};
export type { ShortcutId, ShortcutBindings, ShortcutDefinition };

export function getShortcutFromEvent(event: KeyboardEvent): string | null {
  if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) return null;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null;

  const key = KEY_NAMES[event.key] ?? (
    event.key.length === 1 ? event.key.toUpperCase() : event.key
  );
  const modifiers = [
    ...(event.ctrlKey || event.metaKey ? ['Ctrl'] : []),
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
