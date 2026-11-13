import React from 'react';
import { ShieldCheck, Check, Trash2, Download } from 'lucide-react';
import { Preferences, LocalAIModelInfo } from '@/interfaces/system';
import { SectionHeader } from '../SectionHeader';

export interface LocalAITabProps {
  prefs: Preferences;
  setPrefs: React.Dispatch<React.SetStateAction<Preferences | null>>;
  setPrefsDirty: (dirty: boolean) => void;
  localModels: LocalAIModelInfo[];
  busy: boolean;
  onDeleteModel: (id: string) => Promise<void>;
  onDownloadModel: () => Promise<void>;
}

export const LocalAITab: React.FC<LocalAITabProps> = ({
  prefs,
  setPrefs,
  setPrefsDirty,
  localModels,
  busy,
  onDeleteModel,
  onDownloadModel,
}) => {
  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Strict offline toggle */}
      <div className="rounded-xl border border-obsidian-border bg-obsidian-deep p-3.5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5 mb-1">
              <ShieldCheck size={13} className="text-emerald-400" />
              Strict Offline Privacy Mode
            </div>
            <p className="text-[10px] text-obsidian-textMut">
              Block all outbound network calls. Only local ONNX models are used.
            </p>
          </div>
          <input
            type="checkbox"
            checked={prefs.local_ai.strict_offline}
            onChange={(e) => {
              setPrefs({
                ...prefs,
                local_ai: { ...prefs.local_ai, strict_offline: e.target.checked },
              });
              setPrefsDirty(true);
            }}
            className="accent-obsidian-accent h-4 w-4 cursor-pointer shrink-0"
          />
        </div>
      </div>

      {/* Models list */}
      <div>
        <SectionHeader>Local AI Models</SectionHeader>
        <div className="space-y-2.5">
          {localModels.map((model) => (
            <div
              key={model.id}
              className="rounded-xl border border-obsidian-border bg-obsidian-deep p-3.5 flex items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white">{model.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-obsidian-card border border-obsidian-border text-obsidian-textMut">
                    {model.category} · {model.size_mb} MB
                  </span>
                  {model.is_installed && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold flex items-center gap-1">
                      <Check size={10} /> Installed
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-obsidian-textMut">{model.description}</p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {model.id === 'realesrgan_x4' ? (
                  model.is_installed ? (
                    <button
                      type="button"
                      onClick={() => onDeleteModel(model.id)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg border border-obsidian-border hover:border-red-400/60 hover:bg-red-500/10 text-obsidian-textMut hover:text-red-400 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                      <span>Delete</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={onDownloadModel}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg bg-obsidian-accent hover:bg-blue-600 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <Download size={12} />
                      <span>Download (67 MB)</span>
                    </button>
                  )
                ) : (
                  <span className="text-[10.5px] text-obsidian-textMut font-mono">Coming Soon</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
