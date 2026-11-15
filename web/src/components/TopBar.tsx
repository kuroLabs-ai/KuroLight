import React, { useEffect, useRef, useState } from 'react';
import { WorkspaceId } from '../types';
import type { LucideIcon } from 'lucide-react';
import kuroLightWordmark from '../../../assets/icons/KuroLight-wordmark.svg';
import kuroLightLogo from '/logo.png';
import { 
  FolderDown, 
  Bot,
  Sparkles,
  Save, 
  Layers, 
  Sun, 
  SlidersHorizontal, 
  Share2, 
  Send,
  Undo2,
  Redo2,
  Settings,
  Keyboard,
} from 'lucide-react';
import { bridge } from '../bridge';
import { SHORTCUT_DEFINITIONS } from '../constants/shortcuts';
import { loadShortcuts } from '../settings';
import type { ShortcutBindings } from '../types/shortcuts';

interface TopBarProps {
  currentWorkspace: WorkspaceId;
  onWorkspaceChange: (ws: WorkspaceId) => void;
  projectName?: string;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onOpenAI?: () => void;
  isAIOpen?: boolean;
  onOpenSettings?: () => void;
  onOpenShortcuts?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentWorkspace,
  onWorkspaceChange,
  projectName = 'Kuro Vault',
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onSave,
  onOpenAI,
  isAIOpen = false,
  onOpenSettings,
  onOpenShortcuts,
}) => {
  const [isShortcutsMenuOpen, setIsShortcutsMenuOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<ShortcutBindings>(loadShortcuts);
  const shortcutsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refreshShortcuts = () => setShortcuts(loadShortcuts());
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!shortcutsMenuRef.current?.contains(event.target as Node)) {
        setIsShortcutsMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsShortcutsMenuOpen(false);
    };

    window.addEventListener('kurolight:shortcuts-updated', refreshShortcuts);
    document.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('kurolight:shortcuts-updated', refreshShortcuts);
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const workspaces: { id: WorkspaceId; label: string; icon: LucideIcon }[] = [
    { id: 'library', label: 'Gallery', icon: Layers },
    { id: 'develop', label: 'Lightbox', icon: Sun },
    { id: 'color_studio', label: 'Color Studio', icon: SlidersHorizontal },
    { id: 'visual_flow', label: 'Visual Flow', icon: Share2 },
    { id: 'deliver', label: 'Deliver', icon: Send },
  ];

  return (
    <header className="app-surface relative z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-x-0 border-t-0 px-2 select-none sm:px-3 xl:px-4">
      {/* Left: Brand & Import */}
      <div className="flex shrink-0 items-center space-x-2 xl:space-x-3">
        <div className="flex items-center space-x-2" title={projectName}>
          <img src={kuroLightLogo} alt="KuroLight" className="h-6 w-6 object-contain rounded-md drop-shadow-sm" />
          <img src={kuroLightWordmark} alt="KuroLight" className="h-7 w-auto object-contain" />
          <span className="hidden rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[9px] font-semibold tracking-wide text-obsidian-textMut xl:inline-flex">
            v1.0.0
          </span>
        </div>

        <button 
          onClick={() => bridge.importFiles()}
          className="app-control flex items-center space-x-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-obsidian-textPri"
        >
          <FolderDown className="w-3.5 h-3.5 text-obsidian-accent" />
          <span className="hidden lg:inline">Import</span>
        </button>
      </div>

      {/* Center: Navigation Capsule */}
      <nav aria-label="Workspace" className="app-control flex max-w-[44vw] shrink items-center overflow-x-auto rounded-full p-1 scrollbar-none">
        {workspaces.map((ws) => {
          const Icon = ws.icon;
          const isActive = currentWorkspace === ws.id;
          return (
            <button
              key={ws.id}
              onClick={() => {
                onWorkspaceChange(ws.id);
                bridge.switchWorkspace(ws.id);
              }}
              title={ws.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex shrink-0 items-center space-x-1.5 rounded-full px-2 py-1 text-xs font-semibold transition-all xl:px-3 ${
                isActive
                  ? 'app-accent text-white'
                  : 'text-obsidian-textMut hover:bg-white/[0.07] hover:text-obsidian-textPri'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{ws.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: Actions */}
      <div className="flex shrink-0 items-center space-x-1 xl:space-x-2">
        <div ref={shortcutsMenuRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setShortcuts(loadShortcuts());
              setIsShortcutsMenuOpen((open) => !open);
            }}
            title="Keyboard shortcuts"
            aria-label="Show keyboard shortcuts"
            aria-expanded={isShortcutsMenuOpen}
            aria-controls="keyboard-shortcuts-menu"
            className="app-control flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-obsidian-textPri"
          >
            <Keyboard className="h-3.5 w-3.5 text-obsidian-accent" />
            <span className="hidden xl:inline">Shortcuts</span>
          </button>
          {isShortcutsMenuOpen && (
            <div
              id="keyboard-shortcuts-menu"
              role="dialog"
              aria-label="Keyboard shortcuts"
              className="absolute right-0 top-full z-50 mt-2 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-panel shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-obsidian-border px-3.5 py-2.5">
                <div>
                  <h2 className="text-xs font-bold text-white">Keyboard Shortcuts</h2>
                  <p className="mt-0.5 text-[9px] text-obsidian-textMut">
                    Active shortcuts · changes apply after saving
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsShortcutsMenuOpen(false);
                    onOpenShortcuts?.();
                  }}
                  className="rounded-md bg-obsidian-accent/15 px-2.5 py-1.5 text-[10px] font-semibold text-obsidian-accent hover:bg-obsidian-accent/25"
                >
                  Customize
                </button>
              </div>
              <div className="max-h-[min(68vh,34rem)] overflow-y-auto p-2.5">
                {Array.from(new Set(SHORTCUT_DEFINITIONS.map(({ group }) => group))).map(
                  (group) => (
                    <section key={group} className="mb-3 last:mb-0">
                      <h3 className="mb-1 px-1.5 text-[9px] font-bold uppercase tracking-widest text-obsidian-textMut">
                        {group}
                      </h3>
                      <div className="space-y-0.5">
                        {SHORTCUT_DEFINITIONS.filter((item) => item.group === group).map(
                          (definition) => (
                            <div
                              key={definition.id}
                              className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1.5 hover:bg-obsidian-hover/60"
                            >
                              <span className="min-w-0 truncate text-[10px] text-obsidian-textSec">
                                {definition.label}
                              </span>
                              <kbd className="shrink-0 rounded border border-obsidian-border bg-obsidian-deep px-1.5 py-0.5 font-mono text-[9px] text-white">
                                {shortcuts[definition.id]}
                              </kbd>
                            </div>
                          )
                        )}
                      </div>
                    </section>
                  )
                )}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Open settings"
          className="app-control flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-obsidian-textPri"
        >
          <Settings className="h-3.5 w-3.5 text-obsidian-accent" />
          <span className="hidden xl:inline">Settings</span>
        </button>
        {/* Undo / Redo */}
        <div className="app-control flex items-center overflow-hidden rounded-lg">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo"
            className={`flex items-center px-2.5 py-1 text-xs transition-colors border-r border-obsidian-border ${
              canUndo
                ? 'text-obsidian-textPri hover:bg-obsidian-hover hover:text-white'
                : 'text-obsidian-textMut/40 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo"
            className={`flex items-center px-2.5 py-1 text-xs transition-colors ${
              canRedo
                ? 'text-obsidian-textPri hover:bg-obsidian-hover hover:text-white'
                : 'text-obsidian-textMut/40 cursor-not-allowed'
            }`}
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          onClick={onSave}
          className="app-control flex items-center space-x-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-obsidian-textPri xl:px-3"
        >
          <Save className="w-3.5 h-3.5 text-obsidian-textSec" />
          <span className="hidden xl:inline">Save</span>
        </button>

        <button
          onClick={onOpenAI}
          aria-pressed={isAIOpen}
          aria-label={isAIOpen ? 'Close Kuro AI panel' : 'Open Kuro AI panel'}
          title={isAIOpen ? 'Close Kuro AI panel' : 'Open Kuro AI panel'}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-colors ${
            isAIOpen
              ? 'border border-obsidian-borderLt bg-obsidian-hover'
              : 'border border-blue-400/50 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'
          }`}
        >
          <span className={`relative flex h-6 w-6 items-center justify-center rounded-md ${
            isAIOpen ? 'bg-white/10' : 'bg-white/15'
          }`}>
            <Bot className="h-4 w-4" />
            <Sparkles className="absolute -right-1 -top-1 h-2.5 w-2.5 text-amber-200" />
          </span>
          <span className="hidden lg:inline">{isAIOpen ? 'Close Kuro' : 'Open Kuro'}</span>
        </button>
      </div>
    </header>
  );
};
