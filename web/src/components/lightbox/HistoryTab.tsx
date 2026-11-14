import React, { useState } from 'react';
import { toast } from 'sonner';
import { History, Camera, Plus, RotateCcw, Trash2, Check, Clock } from 'lucide-react';
import type { EditSnapshot, EditState } from '../../types';

interface HistoryTabProps {
  editUndoStack: EditState[];
  editRedoStack: EditState[];
  currentEditState: EditState;
  onJumpEditHistory: (index: number) => void;
  onChange: (editState: EditState) => void;
  onSnapshotChange: (editState: EditState) => void;
  snapshots?: Record<string, EditSnapshot>;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  editUndoStack,
  editRedoStack,
  currentEditState,
  onJumpEditHistory,
  onChange,
  onSnapshotChange,
  snapshots = {},
}) => {
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');

  const snapshotEntries = Object.keys(snapshots);
  const timeline = [
    ...editUndoStack,
    currentEditState,
    ...editRedoStack.slice().reverse(),
  ];
  const activeHistoryIndex = editUndoStack.length;

  const handleCreateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    const name = snapshotName.trim();
    if (!name) return;
    const snapshot = structuredClone(currentEditState);
    delete snapshot.snapshots;
    onSnapshotChange({
      ...currentEditState,
      snapshots: { ...currentEditState.snapshots, [name]: snapshot },
    });
    setSnapshotName('');
    setIsCreatingSnapshot(false);
  };

  const restoreSnapshot = (name: string) => {
    const snapshot = snapshots[name];
    if (!snapshot) {
      toast.error('Snapshot is unavailable', { description: `Could not find "${name}".` });
      return;
    }
    onChange({
      ...currentEditState,
      ...structuredClone(snapshot),
      asset_id: currentEditState.asset_id,
      snapshots: currentEditState.snapshots,
    });
  };

  const deleteSnapshot = (name: string) => {
    const nextSnapshots = { ...currentEditState.snapshots };
    if (!(name in nextSnapshots)) return;
    delete nextSnapshots[name];
    onSnapshotChange({ ...currentEditState, snapshots: nextSnapshots });
  };

  return (
    <div className="space-y-3 text-xs select-none">
      {/* ── 1. HISTORY TIMELINE ── */}
      <div className="border border-obsidian-border rounded-lg bg-obsidian-card/40 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
            <History size={13} className="text-obsidian-accent" />
            <span>History Timeline ({timeline.length - 1})</span>
          </div>
        </div>

        {/* Timeline Items List */}
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          {timeline.map((_, idx) => {
            const isCurrent = idx === activeHistoryIndex;
            const isUndone = idx > activeHistoryIndex;

            return (
              <div
                key={idx}
                onClick={() => onJumpEditHistory(idx)}
                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-colors ${
                  isCurrent
                    ? 'bg-obsidian-active text-white font-semibold border border-obsidian-accent'
                    : isUndone
                    ? 'text-obsidian-textMut/40 hover:bg-obsidian-elevated hover:text-obsidian-textMut'
                    : 'text-obsidian-textSec hover:bg-obsidian-elevated hover:text-white'
                }`}
              >
                {idx === 0 ? (
                  <Clock
                    size={12}
                    className={isCurrent ? 'text-obsidian-accent' : 'opacity-40'}
                  />
                ) : (
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      isCurrent
                        ? 'bg-obsidian-accent'
                        : isUndone
                          ? 'bg-obsidian-border'
                          : 'bg-obsidian-textMut'
                    }`}
                  />
                )}
                <span className="truncate text-[11px]">
                  {idx === 0 ? 'Starting State' : `Edit ${idx}`}
                </span>
                {idx > 0 && (
                  <span className="ml-auto font-mono text-[9px] text-obsidian-textMut">#{idx}</span>
                )}
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
                    onClick={() => restoreSnapshot(name)}
                    className="p-1 text-obsidian-textSec hover:text-obsidian-accent rounded hover:bg-obsidian-elevated"
                    title="Restore Snapshot"
                  >
                    <RotateCcw size={12} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete snapshot "${name}"?`)) {
                        deleteSnapshot(name);
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
