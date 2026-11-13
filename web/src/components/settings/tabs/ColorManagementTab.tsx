import React from 'react';
import { Smartphone, CheckCircle2 } from 'lucide-react';
import { Preferences } from '@/interfaces/system';
import { SectionHeader } from '../SectionHeader';
import { inputClass, labelClass } from '../styles';

export interface ColorManagementTabProps {
  prefs: Preferences;
  setPrefs: React.Dispatch<React.SetStateAction<Preferences | null>>;
  setPrefsDirty: (dirty: boolean) => void;
}

export const ColorManagementTab: React.FC<ColorManagementTabProps> = ({
  prefs,
  setPrefs,
  setPrefsDirty,
}) => {
  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Cross-Device / WhatsApp fidelity explanation */}
      <div className="rounded-xl border border-obsidian-accent/30 bg-obsidian-accent/5 p-3.5 space-y-2">
        <div className="flex items-center gap-2 font-bold text-white text-xs">
          <Smartphone size={14} className="text-emerald-400" />
          <span>Cross-Device Color Consistency (Mobile, WhatsApp & Desktop)</span>
        </div>
        <p className="text-[10.5px] text-obsidian-textMut leading-relaxed">
          Mobile screens (iPhones and AMOLED Android devices) use wide-gamut Display P3 displays. When an image lacks an embedded ICC color profile, WhatsApp and mobile photo viewers stretch untagged RGB values across the wide screen gamut, resulting in oversaturated reds and shifted skin tones.
        </p>
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
          <CheckCircle2 size={12} />
          <span>KuroLight embeds standard sRGB IEC 61966-2.1 ICC profiles in all exports for 100% identical appearance.</span>
        </div>
      </div>

      <div>
        <SectionHeader>Working & Export Color Space</SectionHeader>
        <select
          value={prefs.color_management.working_space}
          onChange={(e) => {
            setPrefs({
              ...prefs,
              color_management: {
                ...prefs.color_management,
                working_space: e.target.value as Preferences['color_management']['working_space'],
              },
            });
            setPrefsDirty(true);
          }}
          className={inputClass}
        >
          <option value="sRGB">sRGB (IEC 61966-2.1) — Recommended for WhatsApp, Web & Mobile</option>
          <option value="Display P3">Display P3 — Apple Wide Gamut</option>
          <option value="Adobe RGB (1998)">Adobe RGB (1998) — Photography & Print</option>
          <option value="ProPhoto RGB">ProPhoto RGB — Ultra-Wide Master Space</option>
        </select>
        <p className="mt-1.5 text-[10px] text-obsidian-textMut">
          Processing is executed in linear float32 space to protect highlights and gradients from banding.
        </p>
      </div>

      <div>
        <SectionHeader>Gamut Warning Alerts</SectionHeader>
        <div className="max-w-xs">
          <span className={labelClass}>Clipping Warning Overlay Color</span>
          <select
            value={prefs.color_management.gamut_warning_color}
            onChange={(e) => {
              setPrefs({
                ...prefs,
                color_management: {
                  ...prefs.color_management,
                  gamut_warning_color: e.target.value,
                },
              });
              setPrefsDirty(true);
            }}
            className={inputClass}
          >
            <option value="#FF00FF">Neon Magenta (#FF00FF)</option>
            <option value="#00FFFF">Electric Cyan (#00FFFF)</option>
            <option value="#FF0000">Warning Red (#FF0000)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
