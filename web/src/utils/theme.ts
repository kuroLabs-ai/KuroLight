/**
 * Utility functions for interface theming and dynamic accent color management.
 */

export function applyAccentColor(hex: string): void {
  if (!hex || typeof hex !== 'string') return;
  const cleanHex = hex.trim();
  const root = document.documentElement;
  root.style.setProperty('--obsidian-accent', cleanHex);
  root.style.setProperty('--obsidian-accent-hover', cleanHex);
}
