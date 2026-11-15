import React from 'react';
import { Info } from 'lucide-react';
import { Preferences } from '@/interfaces/system';
import { SectionHeader } from '../SectionHeader';

export interface ColorManagementTabProps {
  prefs: Preferences;
  setPrefs: React.Dispatch<React.SetStateAction<Preferences | null>>;
  setPrefsDirty: (dirty: boolean) => void;
}

export const ColorManagementTab: React.FC<ColorManagementTabProps> = ({ prefs }) => {
  return (
    <div className="space-y-5 animate-fadeIn">
      <div className="rounded-xl border border-obsidian-accent/30 bg-obsidian-accent/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-white">
          <Info size={14} className="text-obsidian-accent" />
          <span>Current Color Pipeline</span>
        </div>
        <p className="text-[11px] leading-relaxed text-obsidian-textMut">
          KuroLight currently processes and exports in sRGB. The saved working-space preference
          ({prefs.color_management.working_space}) does not change rendering or export output.
        </p>
      </div>

      <div>
        <SectionHeader>Color Management Features</SectionHeader>
        <div className="space-y-2 rounded-xl border border-obsidian-border bg-obsidian-deep p-3.5 text-[11px] text-obsidian-textMut">
          <p>Monitor ICC selection and soft proofing are not implemented in the current renderer.</p>
          <p>Gamut-warning colors are stored, but no clipping overlay is currently rendered.</p>
          <p>These controls are intentionally unavailable until they affect the preview and exported image.</p>
        </div>
      </div>
    </div>
  );
};
