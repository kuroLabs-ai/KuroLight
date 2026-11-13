import React from 'react';
import { Trash2, RefreshCw, HardDrive } from 'lucide-react';
import { Preferences, StorageStats } from '@/interfaces/system';
import { formatBytes } from '@/utils/format';
import { SectionHeader } from '../SectionHeader';
import { inputClass, labelClass } from '../styles';

export interface StorageTabProps {
  prefs: Preferences | null;
  setPrefs: React.Dispatch<React.SetStateAction<Preferences | null>>;
  setPrefsDirty: (dirty: boolean) => void;
  storageStats: StorageStats | null;
  busy: boolean;
  onClearCache: () => Promise<void>;
  onOptimizeDb: () => Promise<void>;
  onBackupNow: () => Promise<void>;
}

export const StorageTab: React.FC<StorageTabProps> = ({
  prefs,
  setPrefs,
  setPrefsDirty,
  storageStats,
  busy,
  onClearCache,
  onOptimizeDb,
  onBackupNow,
}) => {
  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Stats row */}
      <div>
        <SectionHeader>Catalog Statistics</SectionHeader>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Photos', value: String(storageStats?.asset_count ?? 0) },
            { label: 'Database', value: formatBytes(storageStats?.db_size_bytes ?? 0) },
            { label: 'Cache Size', value: formatBytes(storageStats?.cache_size_bytes ?? 0) },
            { label: 'Cached Files', value: `${storageStats?.cache_file_count ?? 0}` },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-obsidian-border bg-obsidian-deep p-3 text-center"
            >
              <div className="text-[9px] uppercase font-bold text-obsidian-textMut">{stat.label}</div>
              <div className="text-base font-bold text-white mt-1">{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Maintenance actions */}
      <div>
        <SectionHeader>Maintenance</SectionHeader>
        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={onClearCache}
            disabled={busy}
            className="flex flex-col gap-1 p-3 rounded-xl border border-obsidian-border bg-obsidian-deep hover:bg-obsidian-card hover:border-red-400/50 transition-colors text-left cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-white group-hover:text-red-300">
              <Trash2 size={13} className="text-red-400" />
              <span>Clear Cache</span>
            </div>
            <span className="text-[10px] text-obsidian-textMut">
              Free {formatBytes(storageStats?.cache_size_bytes ?? 0)} of preview cache.
            </span>
          </button>

          <button
            type="button"
            onClick={onOptimizeDb}
            disabled={busy}
            className="flex flex-col gap-1 p-3 rounded-xl border border-obsidian-border bg-obsidian-deep hover:bg-obsidian-card hover:border-obsidian-accent/50 transition-colors text-left cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-white group-hover:text-obsidian-accent">
              <RefreshCw size={13} className="text-obsidian-accent" />
              <span>Optimize Database</span>
            </div>
            <span className="text-[10px] text-obsidian-textMut">
              VACUUM and rebuild catalog indexes.
            </span>
          </button>

          <button
            type="button"
            onClick={onBackupNow}
            disabled={busy}
            className="flex flex-col gap-1 p-3 rounded-xl border border-obsidian-border bg-obsidian-deep hover:bg-obsidian-card hover:border-emerald-400/50 transition-colors text-left cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center gap-1.5 font-bold text-xs text-white group-hover:text-emerald-300">
              <HardDrive size={13} className="text-emerald-400" />
              <span>Backup Catalog</span>
            </div>
            <span className="text-[10px] text-obsidian-textMut">
              Create a verified online backup of catalog.db.
            </span>
          </button>
        </div>
      </div>

      {/* Automated backup settings */}
      {prefs && (
        <div>
          <SectionHeader>Automated Backups</SectionHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={labelClass}>Backup Schedule</span>
              <select
                value={prefs.storage.backup_schedule}
                onChange={(e) => {
                  setPrefs({
                    ...prefs,
                    storage: {
                      ...prefs.storage,
                      backup_schedule: e.target.value as Preferences['storage']['backup_schedule'],
                    },
                  });
                  setPrefsDirty(true);
                }}
                className={inputClass}
              >
                <option value="on_exit">Every time KuroLight closes</option>
                <option value="daily">Once a day on first launch</option>
                <option value="weekly">Once a week</option>
                <option value="never">Never (manual only)</option>
              </select>
            </div>

            <div>
              <span className={labelClass}>Retention Limit</span>
              <select
                value={prefs.storage.backup_retention_count}
                onChange={(e) => {
                  setPrefs({
                    ...prefs,
                    storage: { ...prefs.storage, backup_retention_count: Number(e.target.value) },
                  });
                  setPrefsDirty(true);
                }}
                className={inputClass}
              >
                <option value={3}>Keep last 3 backups</option>
                <option value={5}>Keep last 5 backups (Recommended)</option>
                <option value={10}>Keep last 10 backups</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
