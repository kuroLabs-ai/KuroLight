import React from 'react';
import { Pipette, Check } from 'lucide-react';
import { Preferences } from '@/interfaces/system';
import { ACCENT_SWATCHES } from '@/constants/theme';
import { SectionHeader } from '../SectionHeader';
import { inputClass, labelClass } from '../styles';

export interface AppearanceTabProps {
  prefs: Preferences;
  setPrefs: React.Dispatch<React.SetStateAction<Preferences | null>>;
  setPrefsDirty: (dirty: boolean) => void;
  onAccentColorChange: (color: string) => void;
}

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
  prefs,
  setPrefs,
  setPrefsDirty,
  onAccentColorChange,
}) => {
  return (
    <div className="space-y-5 animate-fadeIn">
      <div>
        <SectionHeader>Accent Color (Real-time Live Preview)</SectionHeader>
        <p className="text-[10.5px] text-obsidian-textMut mb-3">
          Choose a preset obsidian accent or select any custom color. Changes apply across the entire application immediately.
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENT_SWATCHES.map((swatch) => (
            <button
              key={swatch.value}
              type="button"
              onClick={() => onAccentColorChange(swatch.value)}
              className={`h-8 w-8 rounded-full ${swatch.bg} flex items-center justify-center transition-transform hover:scale-110 cursor-pointer shadow-sm ${
                prefs.appearance.accent_color.toLowerCase() === swatch.value.toLowerCase()
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-obsidian-panel scale-105'
                  : 'opacity-75 hover:opacity-100'
              }`}
              title={swatch.name}
            >
              {prefs.appearance.accent_color.toLowerCase() === swatch.value.toLowerCase() && (
                <Check size={14} className="text-white drop-shadow" />
              )}
            </button>
          ))}

          {/* Custom Color Input */}
          <label className="relative flex items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-deep px-2.5 py-1 text-xs cursor-pointer hover:border-obsidian-accent transition-colors ml-1">
            <Pipette size={13} className="text-obsidian-textMut" />
            <span className="text-[10px] text-obsidian-textMut">Custom:</span>
            <input
              type="color"
              value={prefs.appearance.accent_color}
              onChange={(e) => onAccentColorChange(e.target.value)}
              className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
              title="Pick custom accent color"
            />
            <span className="font-mono text-[11px] text-white font-semibold uppercase">
              {prefs.appearance.accent_color}
            </span>
          </label>
        </div>
      </div>

      <div>
        <SectionHeader>Startup</SectionHeader>
        <div className="max-w-xs">
          <span className={labelClass}>Startup Workspace</span>
          <select
            value={prefs.appearance.startup_workspace}
            onChange={(e) => {
              setPrefs({
                ...prefs,
                appearance: {
                  ...prefs.appearance,
                  startup_workspace: e.target.value as Preferences['appearance']['startup_workspace'],
                },
              });
              setPrefsDirty(true);
            }}
            className={inputClass}
          >
            <option value="remember">Remember Last Screen</option>
            <option value="library">Gallery</option>
            <option value="develop">Lightbox (Develop)</option>
            <option value="color_studio">Color Studio</option>
            <option value="deliver">Deliver (Batch Export)</option>
          </select>
        </div>
      </div>

      <div>
        <SectionHeader>Safety Prompts</SectionHeader>
        <div className="rounded-xl border border-obsidian-border bg-obsidian-deep p-3.5 space-y-3">
          <label className="flex items-center gap-2.5 text-xs text-obsidian-textSec cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.appearance.confirm_disk_deletion}
              onChange={(e) => {
                setPrefs({
                  ...prefs,
                  appearance: { ...prefs.appearance, confirm_disk_deletion: e.target.checked },
                });
                setPrefsDirty(true);
              }}
              className="accent-obsidian-accent"
            />
            <span>Confirm before permanently deleting photos from disk</span>
          </label>
          <label className="flex items-center gap-2.5 text-xs text-obsidian-textSec cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.appearance.warn_discard_crop_edits}
              onChange={(e) => {
                setPrefs({
                  ...prefs,
                  appearance: { ...prefs.appearance, warn_discard_crop_edits: e.target.checked },
                });
                setPrefsDirty(true);
              }}
              className="accent-obsidian-accent"
            />
            <span>Warn when discarding unapplied crop or mask edits</span>
          </label>
        </div>
      </div>
    </div>
  );
};
