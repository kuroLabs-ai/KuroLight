import React from 'react';
import { RotateCcw } from 'lucide-react';
import { SHORTCUT_DEFINITIONS, DEFAULT_SHORTCUTS } from '@/constants/shortcuts';
import type { ShortcutId, ShortcutBindings } from '@/types/shortcuts';
import { SectionHeader } from '../SectionHeader';

export interface ShortcutsTabProps {
  shortcuts: ShortcutBindings;
  setShortcuts: React.Dispatch<React.SetStateAction<ShortcutBindings>>;
  setShortcutsDirty: (dirty: boolean) => void;
  recordingShortcut: ShortcutId | null;
  setRecordingShortcut: (id: ShortcutId | null) => void;
  setError: (err: string) => void;
  setMessage: (msg: string) => void;
}

export const ShortcutsTab: React.FC<ShortcutsTabProps> = ({
  shortcuts,
  setShortcuts,
  setShortcutsDirty,
  recordingShortcut,
  setRecordingShortcut,
  setError,
  setMessage,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="rounded-lg border border-obsidian-accent/30 bg-obsidian-accent/5 p-3 text-[10.5px] text-obsidian-textSec leading-relaxed">
        Every shortcut must include Ctrl, Shift, or Alt. Click Record then press the full combination. Duplicates are not allowed.
      </div>
      {Array.from(new Set(SHORTCUT_DEFINITIONS.map(({ group }) => group))).map((group) => (
        <section key={group} className="space-y-2">
          <SectionHeader>{group}</SectionHeader>
          <div className="overflow-hidden rounded-lg border border-obsidian-border">
            {SHORTCUT_DEFINITIONS.filter((definition) => definition.group === group).map(
              (definition) => (
                <div
                  key={definition.id}
                  className="flex items-center justify-between gap-3 border-b border-obsidian-border/70 bg-obsidian-deep px-3 py-2 last:border-b-0"
                >
                  <span className="text-[11px] text-obsidian-textSec">{definition.label}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Record shortcut for ${definition.label}`}
                      onClick={() => {
                        setRecordingShortcut(definition.id);
                        setError('');
                        setMessage('');
                      }}
                      className={`min-w-32 rounded-md border px-2.5 py-1.5 text-[10px] font-mono font-semibold cursor-pointer ${
                        recordingShortcut === definition.id
                          ? 'animate-pulse border-obsidian-accent bg-obsidian-accent/15 text-obsidian-accent'
                          : 'border-obsidian-border bg-obsidian-card text-white hover:border-obsidian-accent/50'
                      }`}
                    >
                      {recordingShortcut === definition.id
                        ? 'Press Ctrl / Shift / Alt + key…'
                        : shortcuts[definition.id]}
                    </button>
                    {shortcuts[definition.id] !== definition.defaultValue && (
                      <button
                        type="button"
                        aria-label={`Restore default shortcut for ${definition.label}`}
                        title={`Restore ${definition.defaultValue}`}
                        onClick={() => {
                          setShortcuts((current) => ({
                            ...current,
                            [definition.id]: definition.defaultValue,
                          }));
                          setShortcutsDirty(true);
                          setRecordingShortcut(null);
                          setError('');
                          setMessage(`Restored ${definition.label}. Save to apply.`);
                        }}
                        className="rounded p-1.5 text-obsidian-textMut hover:bg-obsidian-hover hover:text-white"
                      >
                        <RotateCcw size={11} />
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      ))}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setShortcuts({ ...DEFAULT_SHORTCUTS });
            setShortcutsDirty(true);
            setRecordingShortcut(null);
            setError('');
            setMessage('Default shortcuts restored. Save to apply.');
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-obsidian-border px-3 py-2 text-xs font-semibold text-obsidian-textMut hover:text-white cursor-pointer"
        >
          <RotateCcw size={12} /> Restore defaults
        </button>
      </div>
    </div>
  );
};
