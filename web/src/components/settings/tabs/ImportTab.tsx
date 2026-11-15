import React from 'react';
import { Preferences } from '@/interfaces/system';
import { SectionHeader } from '../SectionHeader';
import { inputClass, labelClass } from '../styles';

export interface ImportTabProps {
  prefs: Preferences;
  setPrefs: React.Dispatch<React.SetStateAction<Preferences | null>>;
  setPrefsDirty: (dirty: boolean) => void;
}

export const ImportTab: React.FC<ImportTabProps> = ({
  prefs,
  setPrefs,
  setPrefsDirty,
}) => {
  return (
    <div className="space-y-5 animate-fadeIn">
      <div>
        <SectionHeader>Default Creator Metadata</SectionHeader>
        <div className="space-y-3">
          <div>
            <span className={labelClass}>Creator / Photographer Name</span>
            <input
              type="text"
              value={prefs.import_settings.default_creator}
              onChange={(e) => {
                setPrefs({
                  ...prefs,
                  import_settings: { ...prefs.import_settings, default_creator: e.target.value },
                });
                setPrefsDirty(true);
              }}
              placeholder="e.g. Jane Doe"
              className={inputClass}
            />
          </div>

          <div>
            <span className={labelClass}>Copyright Notice</span>
            <input
              type="text"
              value={prefs.import_settings.default_copyright}
              onChange={(e) => {
                setPrefs({
                  ...prefs,
                  import_settings: { ...prefs.import_settings, default_copyright: e.target.value },
                });
                setPrefsDirty(true);
              }}
              placeholder="© 2026 Your Name. All rights reserved."
              className={inputClass}
            />
          </div>
          <div>
            <span className={labelClass}>Usage Terms</span>
            <input
              type="text"
              value={prefs.import_settings.default_usage_terms}
              onChange={(e) => {
                setPrefs({
                  ...prefs,
                  import_settings: { ...prefs.import_settings, default_usage_terms: e.target.value },
                });
                setPrefsDirty(true);
              }}
              placeholder="e.g. All rights reserved"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div>
        <SectionHeader>Ingestion Options</SectionHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={labelClass}>Duplicate Detection</span>
            <select
              value={prefs.import_settings.duplicate_detection}
              onChange={(e) => {
                setPrefs({
                  ...prefs,
                  import_settings: {
                    ...prefs.import_settings,
                    duplicate_detection: e.target.value as Preferences['import_settings']['duplicate_detection'],
                  },
                });
                setPrefsDirty(true);
              }}
              className={inputClass}
            >
              <option value="path">Skip by file path</option>
              <option value="hash">Skip by SHA-256 hash</option>
            </select>
          </div>

        </div>
        <p className="mt-2 text-[10px] text-obsidian-textMut">
          RAW previews currently use the available image decoder; embedded-versus-full RAW priority is not configurable yet.
        </p>
      </div>
    </div>
  );
};
