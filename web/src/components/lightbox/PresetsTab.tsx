import React, { useState, useMemo } from 'react';
import { Preset } from '../../types';
import { bridge } from '../../bridge';
import { Star, Plus, Trash2, Check, Sparkles, Search, X } from 'lucide-react';

interface PresetsTabProps {
  presets: Preset[];
}

export const PresetsTab: React.FC<PresetsTabProps> = ({ presets }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetCategory, setNewPresetCategory] = useState('User');
  const [lastAppliedPreset, setLastAppliedPreset] = useState<string | null>(null);

  // Extract categories and their counts
  const categoriesWithCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    presets.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    const uniqueCats = Array.from(new Set(presets.map((p) => p.category))).sort();
    return [
      { name: 'All', count: presets.length },
      ...uniqueCats.map((cat) => ({ name: cat, count: counts[cat] || 0 })),
    ];
  }, [presets]);

  // Filtered presets based on category and search query
  const filteredPresets = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return presets.filter((p) => {
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [presets, selectedCategory, searchQuery]);

  const handleApply = (name: string) => {
    bridge.applyPreset(name);
    setLastAppliedPreset(name);
    setTimeout(() => {
      setLastAppliedPreset((curr) => (curr === name ? null : curr));
    }, 2000);
  };

  const handleSavePreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPresetName.trim()) {
      bridge.savePreset(newPresetName.trim(), newPresetCategory.trim() || 'User');
      setNewPresetName('');
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3 text-xs select-none">
      {/* ── Header & Category Navigation ── */}
      <div className="border border-obsidian-border rounded-xl bg-obsidian-card/40 p-2.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
            <Star size={13} className="text-amber-400" />
            <span>Ready Presets & Recipes ({presets.length})</span>
          </div>
          <button
            onClick={() => setIsSaving(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-obsidian-card hover:bg-obsidian-hover hover:text-white border border-obsidian-border text-obsidian-textSec text-[10px] font-semibold cursor-pointer transition-colors"
            title="Save Current Settings as Preset"
          >
            <Plus size={11} />
            <span>New</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative flex items-center">
          <Search size={12} className="absolute left-2.5 text-obsidian-textMut pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${presets.length} presets...`}
            className="w-full rounded-lg border border-obsidian-border bg-obsidian-deep pl-7 pr-7 py-1.5 text-xs text-white placeholder-obsidian-textMut outline-none focus:border-obsidian-accent transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 text-obsidian-textMut hover:text-white cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex gap-1 overflow-x-auto pb-0.5 pt-0.5 no-scrollbar">
          {categoriesWithCounts.map(({ name, count }) => (
            <button
              key={name}
              onClick={() => setSelectedCategory(name)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] whitespace-nowrap transition-colors border cursor-pointer ${
                selectedCategory === name
                  ? 'app-accent text-white font-bold shadow-sm'
                  : 'bg-obsidian-deep text-obsidian-textMut border-obsidian-border hover:text-white hover:border-obsidian-borderLt'
              }`}
            >
              <span>{name}</span>
              <span
                className={`text-[9px] rounded-full px-1 py-0.2 ${
                  selectedCategory === name ? 'bg-white/20 text-white' : 'text-obsidian-textMut'
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Save Preset Modal / Form ── */}
      {isSaving && (
        <form onSubmit={handleSavePreset} className="p-3 rounded-xl border border-obsidian-accent/60 bg-obsidian-deep space-y-2.5 shadow-lg animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="font-bold text-white text-[11px] block">Save Recipe as Preset</span>
            <button
              type="button"
              onClick={() => setIsSaving(false)}
              className="text-obsidian-textMut hover:text-white cursor-pointer"
            >
              <X size={13} />
            </button>
          </div>
          <div className="space-y-1.5">
            <input
              type="text"
              autoFocus
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="Preset Name (e.g. Moody Autumn)..."
              className="w-full bg-obsidian-card text-white px-2.5 py-1.5 rounded-lg text-xs border border-obsidian-border outline-none focus:border-obsidian-accent"
            />
            <input
              type="text"
              value={newPresetCategory}
              onChange={(e) => setNewPresetCategory(e.target.value)}
              placeholder="Category (e.g. Portrait, Film, User)..."
              className="w-full bg-obsidian-card text-white px-2.5 py-1.5 rounded-lg text-xs border border-obsidian-border outline-none focus:border-obsidian-accent"
            />
          </div>
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setIsSaving(false)}
              className="px-2.5 py-1 rounded-lg bg-obsidian-card text-obsidian-textSec text-[11px] hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded-lg app-accent text-white font-bold text-[11px] hover:opacity-90 flex items-center gap-1 cursor-pointer"
            >
              <Check size={12} />
              <span>Save Preset</span>
            </button>
          </div>
        </form>
      )}

      {/* ── Presets Grid / List ── */}
      {filteredPresets.length === 0 ? (
        <div className="rounded-xl border border-obsidian-border/50 bg-obsidian-card/30 p-6 text-center space-y-2">
          <p className="text-[11px] text-obsidian-textMut">No presets found matching "{searchQuery}"</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
            }}
            className="text-[10px] text-obsidian-accent hover:underline cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredPresets.map((preset) => {
            const isApplied = lastAppliedPreset === preset.name;
            return (
              <div
                key={preset.id}
                onClick={() => handleApply(preset.name)}
                className={`group p-2.5 rounded-xl border transition-all flex items-center justify-between shadow-sm cursor-pointer ${
                  isApplied
                    ? 'border-emerald-500/60 bg-emerald-500/10'
                    : 'border-obsidian-border bg-obsidian-deep hover:border-obsidian-accent/60 hover:bg-obsidian-card'
                }`}
              >
                <div className="flex flex-col gap-0.5 truncate flex-1 mr-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-white font-semibold text-xs group-hover:text-obsidian-accent transition-colors truncate">
                      {preset.name}
                    </span>
                    {isApplied && (
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                        <Check size={9} /> Applied
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-obsidian-textMut truncate">
                    {preset.category}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApply(preset.name);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                      isApplied
                        ? 'bg-emerald-500 text-white'
                        : 'bg-obsidian-card text-obsidian-textSec group-hover:app-accent group-hover:text-white border border-obsidian-border'
                    }`}
                  >
                    {isApplied ? (
                      <>
                        <Check size={11} />
                        <span>Done</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={11} />
                        <span>Apply</span>
                      </>
                    )}
                  </button>

                  {preset.category === 'User' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete preset "${preset.name}"?`)) {
                          bridge.deletePreset(preset.id);
                        }
                      }}
                      title="Delete Preset"
                      className="p-1.5 text-obsidian-textMut hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded hover:bg-red-500/10"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
