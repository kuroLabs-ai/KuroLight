import React, { useState } from 'react';
import { bridge } from '../../bridge';
import { History, Camera, Plus, RotateCcw, Trash2, Check, Clock } from 'lucide-react';

interface HistoryTabProps {
  historyList: string[];
  activeHistoryIndex: number;
  snapshots?: Record<string, unknown>;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  historyList,
  activeHistoryIndex,
  snapshots = {},
}) => {
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');

  const snapshotEntries = Object.keys(snapshots);

  const handleCreateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    if (snapshotName.trim()) {
      bridge.saveSnapshot(snapshotName.trim());
      setSnapshotName('');
      setIsCreatingSnapshot(false);
    }
  };

  return (
    <div className="space-y-3 text-xs select-none">
      {/* ── 1. HISTORY TIMELINE ── */}
      <div className="border border-obsidian-border rounded-lg bg-obsidian-card/40 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
            <History size={13} className="text-obsidian-accent" />
            <span>History Timeline ({historyList.length})</span>
          </div>
        </div>

        {/* Timeline Items List */}
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          {/* Base Import Step */}
          <div
            onClick={() => bridge.jumpHistory(-1)}
            className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
              activeHistoryIndex === -1
                ? 'bg-obsidian-active text-white font-semibold border border-obsidian-accent'
                : 'text-obsidian-textMut hover:bg-obsidian-elevated hover:text-white'
            }`}
          >
            <Clock size={12} className={activeHistoryIndex === -1 ? 'text-obsidian-accent' : 'opacity-40'} />
            <span className="truncate text-[11px]">Original (Import State)</span>
          </div>

          {/* Subsequent steps */}
          {historyList.map((step, idx) => {
            const isCurrent = idx === activeHistoryIndex;
            const isUndone = idx > activeHistoryIndex;

            return (
              <div
                key={idx}
                onClick={() => bridge.jumpHistory(idx)}
                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                  isCurrent
                    ? 'bg-obsidian-active text-white font-semibold border border-obsidian-accent'
                    : isUndone
                    ? 'text-obsidian-textMut/40 hover:bg-obsidian-elevated hover:text-obsidian-textMut'
                    : 'text-obsidian-textSec hover:bg-obsidian-elevated hover:text-white'
                }`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    isCurrent ? 'bg-obsidian-accent' : isUndone ? 'bg-obsidian-border' : 'bg-obsidian-textMut'
                  }`}
                />
                <span className="truncate text-[11px]">{step}</span>
                <span className="ml-auto font-mono text-[9px] text-obsidian-textMut">#{idx + 1}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2. PERSISTENT SNAPSHOTS ── */}
      <div className="border border-obsidian-border rounded-lg bg-obsidian-card/40 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
            <Camera size={13} className="text-obsidian-accent" />
            <span>Snapshots ({snapshotEntries.length})</span>
          </div>
          <button
            onClick={() => setIsCreatingSnapshot(true)}
            className="p-1 rounded bg-obsidian-elevated hover:bg-obsidian-hover hover:text-white border border-obsidian-border text-obsidian-textSec"
            title="Create Snapshot"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Create Snapshot Form */}
        {isCreatingSnapshot && (
          <form onSubmit={handleCreateSnapshot} className="p-2 border border-obsidian-accent bg-obsidian-deep rounded flex gap-1">
            <input
              type="text"
              autoFocus
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder="Snapshot Name..."
              className="flex-1 bg-obsidian-elevated text-white px-2 py-1 rounded text-xs border border-obsidian-border outline-none focus:border-obsidian-accent"
            />
            <button
              type="submit"
              className="px-2 py-1 bg-obsidian-accent text-white rounded text-xs font-semibold hover:bg-blue-600"
            >
              <Check size={12} />
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingSnapshot(false)}
              className="px-2 py-1 bg-obsidian-elevated text-obsidian-textSec rounded text-xs hover:text-white"
            >
              ✕
            </button>
          </form>
        )}

        {/* Snapshots List */}
        {snapshotEntries.length > 0 ? (
          <div className="space-y-1">
            {snapshotEntries.map((name) => (
              <div
                key={name}
                className="group flex items-center justify-between p-2 rounded bg-obsidian-card border border-obsidian-border hover:border-obsidian-borderLt"
              >
                <span className="text-white font-medium truncate text-xs flex-1 mr-2">{name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => bridge.restoreSnapshot(name)}
                    className="p-1 text-obsidian-textSec hover:text-obsidian-accent rounded hover:bg-obsidian-elevated"
                    title="Restore Snapshot"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete snapshot "${name}"?`)) {
                        bridge.deleteSnapshot(name);
                      }
                    }}
                    className="p-1 text-obsidian-textMut hover:text-red-400 rounded hover:bg-obsidian-elevated opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete Snapshot"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-obsidian-textMut text-center py-2">
            No snapshots yet. Click + to freeze current state.
          </p>
        )}
      </div>
    </div>
  );
};
