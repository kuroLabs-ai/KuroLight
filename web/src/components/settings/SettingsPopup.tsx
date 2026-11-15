import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Cpu,
  FileDown,
  HardDrive,
  Info,
  Keyboard,
  Palette,
  Save,
  Sliders,
  X,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import {
  bridge,
  type AppInfo,
  type LocalAIModelInfo,
  type Preferences,
  type StorageStats,
} from '@/bridge';
import kuroLightWordmark from '@/assets/KuroLight-wordmark.svg';
import kuroLightLogo from '/logo.png';
import {
  getShortcutFromEvent,
  loadShortcuts,
  saveShortcuts,
  SHORTCUT_DEFINITIONS,
  type ShortcutId,
} from '@/settings';
import { applyAccentColor, applyUiScale } from '@/utils/theme';
import { SettingsTab, AISettings, SettingsPopupProps, PROVIDER_MODELS } from './types';
import {
  PerformanceTab,
  StorageTab,
  ImportTab,
  ColorManagementTab,
  AITab,
  LocalAITab,
  AppearanceTab,
  ShortcutsTab,
  AboutTab,
} from './tabs';

const DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-3-7-sonnet-latest',
};

// Sidebar navigation groups and entries
const NAV_GROUPS = [
  {
    label: 'Hardware',
    items: [
      { id: 'performance' as SettingsTab, title: 'Performance', icon: Zap },
      { id: 'storage' as SettingsTab, title: 'Storage & Catalog', icon: HardDrive },
    ],
  },
  {
    label: 'Photos',
    items: [
      { id: 'import' as SettingsTab, title: 'Import & Metadata', icon: FileDown },
      { id: 'color' as SettingsTab, title: 'Color Management', icon: Palette },
    ],
  },
  {
    label: 'AI',
    items: [
      { id: 'ai' as SettingsTab, title: 'Kuro AI', icon: Bot },
      { id: 'local_ai' as SettingsTab, title: 'Offline AI Models', icon: Cpu },
    ],
  },
  {
    label: 'App',
    items: [
      { id: 'appearance' as SettingsTab, title: 'Appearance', icon: Sliders },
      { id: 'shortcuts' as SettingsTab, title: 'Shortcuts', icon: Keyboard },
      { id: 'about' as SettingsTab, title: 'About', icon: Info },
    ],
  },
];

export const SettingsPopup: React.FC<SettingsPopupProps> = ({
  isOpen,
  onClose,
  initialTab = 'performance',
}) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [shortcuts, setShortcuts] = useState(loadShortcuts);
  const [shortcutsDirty, setShortcutsDirty] = useState(false);
  const [recordingShortcut, setRecordingShortcut] = useState<ShortcutId | null>(null);
  const savedAccentColor = useRef<string | null>(null);
  const savedUiScale = useRef<number | null>(null);

  // Kuro AI state
  const [aiSettings, setAiSettings] = useState<AISettings>({
    provider: 'gemini',
    model: DEFAULT_MODELS.gemini,
    has_api_key: false,
    saved_keys: { gemini: false, openai: false, anthropic: false },
    privacy_disclosure_accepted: false,
    privacy_disclosure_version: '2026-11',
    send_image_context: true,
  });
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [removeKey, setRemoveKey] = useState(false);
  const [aiDirty, setAiDirty] = useState(false);

  // App & Preferences state
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [prefsDirty, setPrefsDirty] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [localModels, setLocalModels] = useState<LocalAIModelInfo[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Status & notifications
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  useEffect(() => {
    if (!isOpen) return;

    void bridge.getAppInfo().then(setAppInfo).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    const preferencesRequest = bridge.getPreferences();
    void preferencesRequest.then((p) => {
      setPrefs(p);
      if (p?.appearance?.accent_color) {
        savedAccentColor.current = p.appearance.accent_color;
        applyAccentColor(p.appearance.accent_color);
      }
      if (typeof p?.appearance?.ui_scale === 'number') {
        savedUiScale.current = p.appearance.ui_scale;
        applyUiScale(p.appearance.ui_scale);
      }
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    void bridge.getStorageStats().then(setStorageStats).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    void bridge.getLocalAIStatus().then((res) => setLocalModels(res.models)).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });

    void preferencesRequest.then(async (preferences) => {
      const settings = await bridge.getAISettings();
      setAiSettings(settings);
      if (settings.has_api_key && !preferences.local_ai.strict_offline) {
        try {
          setModels(await bridge.getAIModels(settings.provider, ''));
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setModels([]);
        }
      } else {
        setModels(PROVIDER_MODELS[settings.provider]);
      }
    })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    return () => {
      if (savedAccentColor.current) applyAccentColor(savedAccentColor.current);
      if (savedUiScale.current !== null) applyUiScale(savedUiScale.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const switchTab = (next: SettingsTab) => {
    setTab(next);
    setRecordingShortcut(null);
    setError('');
    setMessage('');
  };

  const handleAccentColorChange = (color: string) => {
    if (!prefs) return;
    setPrefs({
      ...prefs,
      appearance: { ...prefs.appearance, accent_color: color },
    });
    setPrefsDirty(true);
    applyAccentColor(color);
  };

  const cancelSettings = () => {
    if (savedAccentColor.current) {
      applyAccentColor(savedAccentColor.current);
    }
    if (savedUiScale.current !== null) applyUiScale(savedUiScale.current);
    onClose();
  };

  const recordShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!recordingShortcut) {
      if (event.key === 'Escape') cancelSettings();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      setRecordingShortcut(null);
      setError('');
      setMessage('Shortcut recording cancelled.');
      return;
    }
    const shortcut = getShortcutFromEvent(event.nativeEvent);
    if (!shortcut) {
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
        setError('Every shortcut must include Ctrl, Shift, or Alt.');
      }
      return;
    }
    const conflict = SHORTCUT_DEFINITIONS.find(
      ({ id }) => id !== recordingShortcut && shortcuts[id] === shortcut
    );
    if (conflict) {
      setError(`${shortcut} is already assigned to "${conflict.label}".`);
      return;
    }
    setShortcuts((current) => ({ ...current, [recordingShortcut]: shortcut }));
    setShortcutsDirty(true);
    setRecordingShortcut(null);
    setError('');
    setMessage('Shortcut captured — save to apply.');
  };

  const refreshModels = async () => {
    setRefreshingModels(true);
    setError('');
    setMessage('');
    try {
      const available = await bridge.getAIModels(aiSettings.provider, apiKey);
      setModels(available);
      if (!available.some((model) => model.id === aiSettings.model)) {
        setAiSettings((current) => ({ ...current, model: available[0]?.id ?? '' }));
        setAiDirty(true);
      }
      setMessage(`${available.length} models loaded.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshingModels(false);
    }
  };

  const testConnection = async () => {
    setRefreshingModels(true);
    setError('');
    setMessage('');
    try {
      const result = await bridge.testAIConnection(aiSettings.provider, apiKey);
      const available = result.models;
      setModels(available);
      setAiSettings((current) => ({
        ...current,
        model: available.some((item) => item.id === current.model)
          ? current.model
          : available[0]?.id ?? '',
      }));
      setMessage(`Connection successful · ${result.model_count} models available.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshingModels(false);
    }
  };

  const handleClearCache = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await bridge.clearCache();
      const mb = (res.freed_bytes / (1024 * 1024)).toFixed(1);
      setMessage(`Cache cleared. Freed ${mb} MB.`);
      setStorageStats(await bridge.getStorageStats());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleOptimizeDb = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await bridge.optimizeDatabase();
      setMessage(res.message || 'Catalog vacuumed and indexes rebuilt.');
      setStorageStats(await bridge.getStorageStats());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleBackupNow = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await bridge.backupCatalogNow();
      if (res.ok) {
        setMessage(`Backup saved to ${res.path}`);
      } else {
        setError(res.error || 'Backup could not be completed.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadModel = async () => {
    setBusy(true);
    setError('');
    setMessage('Downloading Real-ESRGAN x4 model weights (67 MB)…');
    try {
      const res = await bridge.downloadLocalEnhancementModel();
      if (res === 'done') {
        setMessage('Model downloaded and SHA-256 verified.');
        setLocalModels((await bridge.getLocalAIStatus()).models);
      } else {
        setMessage('Download was cancelled.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteModel = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await bridge.deleteLocalAIModel(id);
      setMessage('Local model deleted from disk.');
      setLocalModels((await bridge.getLocalAIStatus()).models);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (prefsDirty && prefs) {
        const savedPreferences = await bridge.savePreferences(prefs);
        setPrefs(savedPreferences);
        savedAccentColor.current = savedPreferences.appearance.accent_color;
        savedUiScale.current = savedPreferences.appearance.ui_scale;
        window.dispatchEvent(new CustomEvent('kurolight:preferences-updated', {
          detail: savedPreferences,
        }));
        setPrefsDirty(false);
      }
      if (apiKey || removeKey || aiDirty) {
        const saved = await bridge.saveAISettings({
          provider: aiSettings.provider,
          model: aiSettings.model,
          api_key: apiKey,
          remove_api_key: removeKey,
          privacy_disclosure_accepted: aiSettings.privacy_disclosure_accepted,
          privacy_disclosure_version: aiSettings.privacy_disclosure_version,
          send_image_context: aiSettings.send_image_context,
        });
        setAiSettings(saved);
        setApiKey('');
        setRemoveKey(false);
        setAiDirty(false);
      }
      if (shortcutsDirty) {
        saveShortcuts(shortcuts);
        setShortcutsDirty(false);
      }
      setMessage('Changes saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      onKeyDown={recordShortcut}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancelSettings();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="flex max-h-[min(840px,92vh)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-obsidian-border bg-obsidian-panel shadow-2xl"
      >
        {/* ── Header ── */}
        <header className="flex shrink-0 items-center justify-between border-b border-obsidian-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <img src={kuroLightLogo} alt="" className="h-7 w-7 object-contain rounded-md drop-shadow-sm" />
            <img src={kuroLightWordmark} alt="" className="h-6 object-contain" />
            <div className="ml-1 pl-2.5 border-l border-obsidian-border/70">
              <h2 id="settings-title" className="text-xs font-bold text-white leading-tight">
                Settings
              </h2>
              <p className="text-[10px] text-obsidian-textMut">Configure KuroLight preferences</p>
            </div>
          </div>
          <button
            onClick={cancelSettings}
            aria-label="Close settings"
            className="rounded p-1.5 text-obsidian-textMut hover:bg-obsidian-hover hover:text-white cursor-pointer"
          >
            <X size={16} />
          </button>
        </header>

        {/* ── Body: sidebar + content ── */}
        <div className="flex flex-1 min-h-0">
          {/* Sidebar nav */}
          <nav
            aria-label="Settings sections"
            className="flex w-44 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-obsidian-border bg-obsidian-deep px-2 py-3 select-none"
          >
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="mb-3">
                <span className="mb-1 block px-2 text-[9px] font-bold uppercase tracking-widest text-obsidian-textMut/60">
                  {group.label}
                </span>
                {group.items.map(({ id, title, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => switchTab(id)}
                    aria-current={tab === id ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[11px] font-medium text-left cursor-pointer transition-colors ${
                      tab === id
                        ? 'app-accent text-white'
                        : 'text-obsidian-textSec hover:bg-obsidian-hover hover:text-white'
                    }`}
                  >
                    <Icon size={13} className="shrink-0" />
                    <span>{title}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-5 min-w-0">
            {tab === 'performance' && prefs && (
              <PerformanceTab
                prefs={prefs}
                setPrefs={setPrefs}
                setPrefsDirty={setPrefsDirty}
              />
            )}

            {tab === 'storage' && (
              <StorageTab
                prefs={prefs}
                setPrefs={setPrefs}
                setPrefsDirty={setPrefsDirty}
                storageStats={storageStats}
                busy={busy}
                onClearCache={handleClearCache}
                onOptimizeDb={handleOptimizeDb}
                onBackupNow={handleBackupNow}
              />
            )}

            {tab === 'import' && prefs && (
              <ImportTab
                prefs={prefs}
                setPrefs={setPrefs}
                setPrefsDirty={setPrefsDirty}
              />
            )}

            {tab === 'color' && prefs && (
              <ColorManagementTab
                prefs={prefs}
                setPrefs={setPrefs}
                setPrefsDirty={setPrefsDirty}
              />
            )}

            {tab === 'ai' && (
              <AITab
                aiSettings={aiSettings}
                setAiSettings={setAiSettings}
                setAiDirty={setAiDirty}
                models={models}
                setModels={setModels}
                modelSearch={modelSearch}
                setModelSearch={setModelSearch}
                apiKey={apiKey}
                setApiKey={setApiKey}
                removeKey={removeKey}
                setRemoveKey={setRemoveKey}
                refreshingModels={refreshingModels}
                strictOffline={prefs?.local_ai.strict_offline ?? false}
                refreshModels={refreshModels}
                testConnection={testConnection}
              />
            )}

            {tab === 'local_ai' && prefs && (
              <LocalAITab
                prefs={prefs}
                setPrefs={setPrefs}
                setPrefsDirty={setPrefsDirty}
                localModels={localModels}
                busy={busy}
                onDeleteModel={handleDeleteModel}
                onDownloadModel={handleDownloadModel}
              />
            )}

            {tab === 'appearance' && prefs && (
              <AppearanceTab
                prefs={prefs}
                setPrefs={setPrefs}
                setPrefsDirty={setPrefsDirty}
                onAccentColorChange={handleAccentColorChange}
              />
            )}

            {tab === 'shortcuts' && (
              <ShortcutsTab
                shortcuts={shortcuts}
                setShortcuts={setShortcuts}
                setShortcutsDirty={setShortcutsDirty}
                recordingShortcut={recordingShortcut}
                setRecordingShortcut={setRecordingShortcut}
                setError={setError}
                setMessage={setMessage}
              />
            )}

            {tab === 'about' && (
              <AboutTab
                appInfo={appInfo}
                copiedKey={copiedKey}
                onCopyPath={copyToClipboard}
              />
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-obsidian-border px-5 py-3">
          <div aria-live="polite" className="min-w-0 text-[10px]">
            {error && <span className="text-red-300">{error}</span>}
            {!error && message && (
              <span className="text-emerald-300 flex items-center gap-1">
                <CheckCircle2 size={12} />
                {message}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {tab === 'about' ? (
              <button
                type="button"
                onClick={cancelSettings}
                className="rounded-lg bg-obsidian-hover px-4 py-2 text-xs font-semibold text-white hover:bg-obsidian-card cursor-pointer"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-obsidian-border px-4 py-2 text-xs font-semibold text-obsidian-textMut hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={
                    busy ||
                    (!prefsDirty && !shortcutsDirty && !aiDirty && !apiKey && !removeKey)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-obsidian-accent px-4 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  <Save size={13} />
                  <span>{busy ? 'Saving…' : 'Save Changes'}</span>
                </button>
              </>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
};
