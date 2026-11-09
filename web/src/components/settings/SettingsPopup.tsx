import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileDown,
  Globe,
  HardDrive,
  Info,
  KeyRound,
  Keyboard,
  Palette,
  Pipette,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Smartphone,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  bridge,
  type AppInfo,
  type LocalAIModelInfo,
  type Preferences,
  type StorageStats,
} from '../../bridge';
import kuroLightWordmark from '../../../../assets/icons/KuroLight-wordmark.svg';
import kuroLightLogo from '/logo.png';
import {
  DEFAULT_SHORTCUTS,
  getShortcutFromEvent,
  loadShortcuts,
  saveShortcuts,
  SHORTCUT_DEFINITIONS,
  type ShortcutId,
} from '../../settings';
import { applyAccentColor } from '../../utils/theme';

type SettingsTab =
  | 'performance'
  | 'storage'
  | 'import'
  | 'color'
  | 'local_ai'
  | 'appearance'
  | 'ai'
  | 'shortcuts'
  | 'about';

type AIProvider = 'gemini' | 'openai' | 'anthropic';

interface AISettings {
  provider: AIProvider;
  model: string;
  has_api_key: boolean;
  saved_keys: Record<AIProvider, boolean>;
  privacy_disclosure_accepted: boolean;
  privacy_disclosure_version: string;
  send_image_context: boolean;
}

interface SettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o',
  anthropic: 'claude-3-7-sonnet-latest',
};

const PROVIDER_MODELS: Record<AIProvider, Array<{ id: string; name: string }>> = {
  gemini: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
  openai: [{ id: 'gpt-4o', name: 'GPT-4o' }],
  anthropic: [{ id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet' }],
};

const ACCENT_SWATCHES = [
  { name: 'Obsidian Blue', value: '#0088FF', bg: 'bg-[#0088FF]' },
  { name: 'Electric Cyan', value: '#00D2FF', bg: 'bg-[#00D2FF]' },
  { name: 'Emerald Green', value: '#10B981', bg: 'bg-[#10B981]' },
  { name: 'Warm Amber', value: '#F59E0B', bg: 'bg-[#F59E0B]' },
  { name: 'Royal Purple', value: '#8B5CF6', bg: 'bg-[#8B5CF6]' },
  { name: 'Crimson Rose', value: '#F43F5E', bg: 'bg-[#F43F5E]' },
];

const inputClass =
  'w-full rounded-lg border border-obsidian-border bg-obsidian-deep px-3 py-2 text-xs text-white outline-none focus:border-obsidian-accent';
const labelClass =
  'mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-obsidian-textMut';

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

export const SettingsPopup: React.FC<SettingsPopupProps> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<SettingsTab>('performance');
  const [shortcuts, setShortcuts] = useState(loadShortcuts);
  const [recordingShortcut, setRecordingShortcut] = useState<ShortcutId | null>(null);

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

    void bridge.getAppInfo().then(setAppInfo);
    void bridge.getPreferences().then((p) => {
      setPrefs(p);
      if (p?.appearance?.accent_color) {
        applyAccentColor(p.appearance.accent_color);
      }
    });
    void bridge.getStorageStats().then(setStorageStats);
    void bridge.getLocalAIStatus().then((res) => setLocalModels(res.models));

    void bridge
      .getAISettings()
      .then(async (settings) => {
        setAiSettings(settings);
        if (settings.has_api_key) {
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

  const recordShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!recordingShortcut) return;
    event.preventDefault();
    event.stopPropagation();
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
      if (tab === 'shortcuts') {
        saveShortcuts(shortcuts);
      }
      if (prefsDirty && prefs) {
        await bridge.savePreferences(prefs);
        setPrefsDirty(false);
      }
      if (tab === 'ai' || apiKey || removeKey || aiDirty) {
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
      setMessage('Changes saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // ─── Shared section header ───────────────────────────────────────────────
  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-[10px] font-bold uppercase tracking-wider text-obsidian-textMut mb-2">
      {children}
    </h3>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
      onKeyDown={recordShortcut}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
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
            onClick={onClose}
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

            {/* ── 1. PERFORMANCE ── */}
            {tab === 'performance' && prefs && (
              <div className="space-y-5 animate-fadeIn">
                <div className="rounded-lg border border-obsidian-accent/30 bg-obsidian-accent/5 p-3 text-[10.5px] text-obsidian-textMut leading-relaxed">
                  <div className="flex items-center gap-2 font-bold text-white mb-1">
                    <Zap size={13} className="text-amber-400" />
                    <span>GPU Acceleration & Rendering Pipeline</span>
                  </div>
                  Hardware-accelerated rendering uses DirectML and CUDA with automatic CPU fallback to guarantee output fidelity.
                </div>

                <div>
                  <SectionHeader>Acceleration</SectionHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-obsidian-border bg-obsidian-deep p-3 space-y-2">
                      <span className={labelClass}>GPU Acceleration Mode</span>
                      <label className="flex items-center gap-2.5 text-xs text-obsidian-textSec cursor-pointer">
                        <input
                          type="checkbox"
                          checked={prefs.performance.enable_gpu}
                          onChange={(e) => {
                            setPrefs({
                              ...prefs,
                              performance: { ...prefs.performance, enable_gpu: e.target.checked },
                            });
                            setPrefsDirty(true);
                          }}
                          className="accent-obsidian-accent"
                        />
                        <span>Enable GPU Acceleration</span>
                      </label>
                      <span className="text-[10px] text-obsidian-textMut block">
                        Accelerates histogram updates, slider processing, and export.
                      </span>
                    </div>

                    <div>
                      <span className={labelClass}>GPU Engine Backend</span>
                      <select
                        value={prefs.performance.gpu_engine}
                        onChange={(e) => {
                          setPrefs({
                            ...prefs,
                            performance: {
                              ...prefs.performance,
                              gpu_engine: e.target.value as Preferences['performance']['gpu_engine'],
                            },
                          });
                          setPrefsDirty(true);
                        }}
                        className={inputClass}
                      >
                        <option value="auto">Auto-detect (Recommended)</option>
                        <option value="directml">DirectML (DirectX 12 / ONNX)</option>
                        <option value="cuda">NVIDIA CUDA</option>
                        <option value="cpu">Force CPU Only</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <SectionHeader>Preview Quality</SectionHeader>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className={labelClass}>Live Slider Quality</span>
                      <select
                        value={prefs.performance.preview_quality}
                        onChange={(e) => {
                          setPrefs({
                            ...prefs,
                            performance: {
                              ...prefs.performance,
                              preview_quality: e.target.value as Preferences['performance']['preview_quality'],
                            },
                          });
                          setPrefsDirty(true);
                        }}
                        className={inputClass}
                      >
                        <option value="draft">Draft — Maximum Responsiveness</option>
                        <option value="balanced">Balanced — Fast with Float Precision</option>
                        <option value="high_quality">High Quality — Full Float32</option>
                      </select>
                    </div>

                    <div>
                      <span className={labelClass}>Viewport Preview Max Edge</span>
                      <select
                        value={prefs.performance.preview_max_edge}
                        onChange={(e) => {
                          setPrefs({
                            ...prefs,
                            performance: { ...prefs.performance, preview_max_edge: Number(e.target.value) },
                          });
                          setPrefsDirty(true);
                        }}
                        className={inputClass}
                      >
                        <option value={1920}>1080p — 1920 px (Fast)</option>
                        <option value={2048}>2K — 2048 px (Default)</option>
                        <option value={2560}>1440p — 2560 px (High DPI)</option>
                        <option value={3840}>4K — 3840 px (Master)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <SectionHeader>Cache</SectionHeader>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={labelClass + ' mb-0'}>Max RAM Cache Limit</span>
                    <span className="text-[10px] font-mono text-white">{prefs.performance.max_cache_mb} MB</span>
                  </div>
                  <input
                    type="range"
                    min={1024}
                    max={16384}
                    step={1024}
                    value={prefs.performance.max_cache_mb}
                    onChange={(e) => {
                      setPrefs({
                        ...prefs,
                        performance: { ...prefs.performance, max_cache_mb: Number(e.target.value) },
                      });
                      setPrefsDirty(true);
                    }}
                    className="w-full accent-obsidian-accent cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-obsidian-textMut mt-1">
                    <span>1 GB</span><span>8 GB</span><span>16 GB</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── 2. STORAGE & CATALOG ── */}
            {tab === 'storage' && (
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
                      <div key={stat.label} className="rounded-xl border border-obsidian-border bg-obsidian-deep p-3 text-center">
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
                      onClick={handleClearCache}
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
                      onClick={handleOptimizeDb}
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
                      onClick={handleBackupNow}
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
            )}

            {/* ── 3. IMPORT & METADATA ── */}
            {tab === 'import' && prefs && (
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

                    <div>
                      <span className={labelClass}>RAW Preview Priority</span>
                      <select
                        value={prefs.import_settings.raw_preview_priority}
                        onChange={(e) => {
                          setPrefs({
                            ...prefs,
                            import_settings: {
                              ...prefs.import_settings,
                              raw_preview_priority: e.target.value as Preferences['import_settings']['raw_preview_priority'],
                            },
                          });
                          setPrefsDirty(true);
                        }}
                        className={inputClass}
                      >
                        <option value="embedded_jpeg">Embedded Camera JPEG (Instant)</option>
                        <option value="full_raw">Full Sensor RAW Decode</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 4. COLOR MANAGEMENT (Cross-Device & Mobile Fidelity) ── */}
            {tab === 'color' && prefs && (
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
            )}

            {/* ── 5. KURO AI / CLOUD ── */}
            {tab === 'ai' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="rounded-lg border border-obsidian-accent/30 bg-obsidian-accent/5 p-3 text-[10.5px] text-obsidian-textMut space-y-2">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <ShieldCheck size={13} className="text-emerald-400" />
                    <span>Kuro AI Privacy & Credential Contract</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong className="text-obsidian-textSec">Keychain Isolation:</strong> API credentials are stored in your OS-native secure credential vault.</li>
                    <li><strong className="text-obsidian-textSec">Review Before Apply:</strong> Suggestions are previewed non-destructively and never applied without confirmation.</li>
                    <li><strong className="text-obsidian-textSec">Stale Edit Protection:</strong> Proposals are checked against your photo's edit-state fingerprint.</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-obsidian-border bg-obsidian-deep p-3 space-y-3">
                  <SectionHeader>Privacy & Consent</SectionHeader>
                  <label className="flex items-start gap-2.5 text-xs text-obsidian-textSec cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiSettings.privacy_disclosure_accepted}
                      onChange={(event) => {
                        setAiSettings((current) => ({
                          ...current,
                          privacy_disclosure_accepted: event.target.checked,
                        }));
                        setAiDirty(true);
                      }}
                      className="mt-0.5 accent-obsidian-accent"
                    />
                    <span className="leading-snug">
                      I accept the Kuro AI privacy disclosure (v{aiSettings.privacy_disclosure_version}) and consent to transmitting the active image preview and camera metadata to my configured provider.
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 text-xs text-obsidian-textSec cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aiSettings.send_image_context}
                      onChange={(event) => {
                        setAiSettings((current) => ({
                          ...current,
                          send_image_context: event.target.checked,
                        }));
                        setAiDirty(true);
                      }}
                      className="mt-0.5 accent-obsidian-accent"
                    />
                    <span className="leading-snug">
                      Send active photo preview with AI requests (enables scene-aware analysis).
                    </span>
                  </label>
                </div>

                <label className="block">
                  <span className={labelClass}>LLM Provider</span>
                  <select
                    value={aiSettings.provider}
                    onChange={(event) => {
                      const provider = event.target.value as AIProvider;
                      setAiSettings((current) => ({
                        ...current,
                        provider,
                        model: '',
                        has_api_key: current.saved_keys[provider],
                      }));
                      setModels(aiSettings.saved_keys[provider] ? [] : PROVIDER_MODELS[provider]);
                      setModelSearch('');
                      setApiKey('');
                      setRemoveKey(false);
                      setAiDirty(true);
                    }}
                    className={inputClass}
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic Claude</option>
                  </select>
                </label>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    type="search"
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    placeholder="Search available models"
                    aria-label="Search models"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => void refreshModels()}
                    disabled={refreshingModels}
                    className="rounded-lg border border-obsidian-border px-3 py-2 text-xs font-semibold text-white hover:bg-obsidian-hover disabled:opacity-50 cursor-pointer"
                  >
                    {refreshingModels ? 'Loading…' : 'Refresh'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void testConnection()}
                    disabled={refreshingModels}
                    className="rounded-lg border border-obsidian-accent/50 px-3 py-2 text-xs font-semibold text-obsidian-accent hover:bg-obsidian-accent/10 disabled:opacity-50 cursor-pointer"
                  >
                    Test connection
                  </button>
                </div>

                <label className="block">
                  <span className={labelClass}>Available Model</span>
                  <select
                    value={aiSettings.model}
                    onChange={(event) => {
                      setAiSettings((current) => ({ ...current, model: event.target.value }));
                      setAiDirty(true);
                    }}
                    className={inputClass}
                  >
                    <option value="">Select a model</option>
                    {models
                      .filter((model) =>
                        `${model.name} ${model.id}`.toLowerCase().includes(modelSearch.toLowerCase())
                      )
                      .map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} · {model.id}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="block">
                  <span className={labelClass}>
                    API Key{' '}
                    {aiSettings.has_api_key && (
                      <span className="inline-flex items-center gap-1 normal-case tracking-normal text-emerald-300 font-normal">
                        <KeyRound size={10} /> saved securely in OS Keychain
                      </span>
                    )}
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={apiKey}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setRemoveKey(false);
                    }}
                    placeholder={
                      aiSettings.has_api_key
                        ? 'Enter a new key to replace the saved key'
                        : 'Paste your provider API key'
                    }
                    className={inputClass}
                  />
                </label>

                {aiSettings.has_api_key && (
                  <label className="flex items-center gap-2 text-xs text-obsidian-textMut cursor-pointer">
                    <input
                      type="checkbox"
                      checked={removeKey}
                      onChange={(event) => {
                        setRemoveKey(event.target.checked);
                        setApiKey('');
                      }}
                      className="accent-obsidian-accent"
                    />
                    Remove the saved key for this provider from OS Keychain
                  </label>
                )}
              </div>
            )}

            {/* ── 6. OFFLINE AI MODELS ── */}
            {tab === 'local_ai' && prefs && (
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
                                onClick={() => handleDeleteModel(model.id)}
                                disabled={busy}
                                className="px-3 py-1.5 rounded-lg border border-obsidian-border hover:border-red-400/60 hover:bg-red-500/10 text-obsidian-textMut hover:text-red-400 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 size={12} />
                                <span>Delete</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={handleDownloadModel}
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
            )}

            {/* ── 7. APPEARANCE (Live Dynamic Accent Colors) ── */}
            {tab === 'appearance' && prefs && (
              <div className="space-y-5 animate-fadeIn">
                <div>
                  <SectionHeader>Accent Color (Real-time Live Preview)</SectionHeader>
                  <p className="text-[10.5px] text-obsidian-textMut mb-3">
                    Choose a preset obsidian accent or select any custom color. Changes apply across the entire application immediately.
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {ACCENT_SWATCHES.map((swatch) => (
                      <button
                        key={swatch.value}
                        type="button"
                        onClick={() => handleAccentColorChange(swatch.value)}
                        className={`h-8 w-8 rounded-full ${swatch.bg} flex items-center justify-center transition-transform hover:scale-110 cursor-pointer shadow-sm ${
                          prefs.appearance.accent_color.toLowerCase() === swatch.value.toLowerCase()
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-obsidian-panel scale-105'
                            : 'opacity-75 hover:opacity-100'
                        }`}
                        title={swatch.name}
                      >
                        {prefs.appearance.accent_color.toLowerCase() === swatch.value.toLowerCase() && (
                          <Check size={14} className="text-white drop-shadow" />
                        )}
                      </button>
                    ))}

                    {/* Custom Color Input */}
                    <label className="relative flex items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-deep px-2.5 py-1 text-xs cursor-pointer hover:border-obsidian-accent transition-colors ml-1">
                      <Pipette size={13} className="text-obsidian-textMut" />
                      <span className="text-[10px] text-obsidian-textMut">Custom:</span>
                      <input
                        type="color"
                        value={prefs.appearance.accent_color}
                        onChange={(e) => handleAccentColorChange(e.target.value)}
                        className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                        title="Pick custom accent color"
                      />
                      <span className="font-mono text-[11px] text-white font-semibold uppercase">
                        {prefs.appearance.accent_color}
                      </span>
                    </label>
                  </div>
                </div>

                <div>
                  <SectionHeader>Startup</SectionHeader>
                  <div className="max-w-xs">
                    <span className={labelClass}>Startup Workspace</span>
                    <select
                      value={prefs.appearance.startup_workspace}
                      onChange={(e) => {
                        setPrefs({
                          ...prefs,
                          appearance: {
                            ...prefs.appearance,
                            startup_workspace: e.target.value as Preferences['appearance']['startup_workspace'],
                          },
                        });
                        setPrefsDirty(true);
                      }}
                      className={inputClass}
                    >
                      <option value="remember">Remember Last Screen</option>
                      <option value="library">Gallery</option>
                      <option value="develop">Lightbox (Develop)</option>
                      <option value="color_studio">Color Studio</option>
                      <option value="deliver">Deliver (Batch Export)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <SectionHeader>Safety Prompts</SectionHeader>
                  <div className="rounded-xl border border-obsidian-border bg-obsidian-deep p-3.5 space-y-3">
                    <label className="flex items-center gap-2.5 text-xs text-obsidian-textSec cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prefs.appearance.confirm_disk_deletion}
                        onChange={(e) => {
                          setPrefs({
                            ...prefs,
                            appearance: { ...prefs.appearance, confirm_disk_deletion: e.target.checked },
                          });
                          setPrefsDirty(true);
                        }}
                        className="accent-obsidian-accent"
                      />
                      <span>Confirm before permanently deleting photos from disk</span>
                    </label>
                    <label className="flex items-center gap-2.5 text-xs text-obsidian-textSec cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prefs.appearance.warn_discard_crop_edits}
                        onChange={(e) => {
                          setPrefs({
                            ...prefs,
                            appearance: { ...prefs.appearance, warn_discard_crop_edits: e.target.checked },
                          });
                          setPrefsDirty(true);
                        }}
                        className="accent-obsidian-accent"
                      />
                      <span>Warn when discarding unapplied crop or mask edits</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ── 8. KEYBOARD SHORTCUTS ── */}
            {tab === 'shortcuts' && (
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
                      setRecordingShortcut(null);
                      setMessage('Default shortcuts restored. Save to apply.');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-obsidian-border px-3 py-2 text-xs font-semibold text-obsidian-textMut hover:text-white cursor-pointer"
                  >
                    <RotateCcw size={12} /> Restore defaults
                  </button>
                </div>
              </div>
            )}

            {/* ── 9. ABOUT ── */}
            {tab === 'about' && (
              <div className="space-y-5 animate-fadeIn">
                {/* App identity banner */}
                <div className="flex items-center justify-between gap-4 rounded-xl border border-obsidian-border bg-gradient-to-br from-obsidian-card via-obsidian-deep to-obsidian-panel p-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <img src={kuroLightLogo} alt="KuroLight" className="h-8 w-8 object-contain rounded-lg drop-shadow-sm" />
                      <img src={kuroLightWordmark} alt="KuroLight" className="h-7 object-contain" />
                      <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                        v{appInfo?.version ?? '1.0.0'}
                      </span>
                      <span className="rounded-full bg-obsidian-border px-2 py-0.5 text-[10px] font-semibold text-obsidian-textSec">
                        {appInfo?.release_channel ?? 'Production'}
                      </span>
                    </div>
                    <p className="text-xs text-obsidian-textSec">
                      {appInfo?.tagline ?? 'Intelligent Visual Creation & Photo Editing Engine'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-obsidian-textMut shrink-0">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Build {appInfo?.build ?? '2026.11'}</span>
                  </div>
                </div>

                {/* Community links */}
                <div>
                  <SectionHeader>Community & Resources</SectionHeader>
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        bridge.openExternalUrl(
                          appInfo?.github_url ?? 'https://github.com/KuroLabs/KuroLight'
                        )
                      }
                      className="flex flex-col text-left rounded-xl border border-obsidian-border bg-obsidian-deep p-3.5 hover:border-obsidian-accent/60 hover:bg-obsidian-card transition-all group cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-white mb-1.5">
                        <div className="flex items-center gap-2 font-bold text-xs">
                          <svg
                            className="w-4 h-4 fill-current text-obsidian-textSec group-hover:text-white transition-colors"
                            viewBox="0 0 24 24"
                          >
                            <path
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                            />
                          </svg>
                          <span>GitHub</span>
                        </div>
                        <ExternalLink
                          size={12}
                          className="text-obsidian-textMut group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                        />
                      </div>
                      <span className="text-[10px] text-obsidian-textMut">
                        Source repo, changelogs, and issues.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        bridge.openExternalUrl(appInfo?.discord_url ?? 'https://discord.gg/2pj9TuqWr')
                      }
                      className="flex flex-col text-left rounded-xl border border-obsidian-border bg-obsidian-deep p-3.5 hover:border-[#5865F2]/60 hover:bg-obsidian-card transition-all group cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-white mb-1.5">
                        <div className="flex items-center gap-2 font-bold text-xs">
                          <svg className="w-4 h-4 fill-current text-[#5865F2]" viewBox="0 0 24 24">
                            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.894.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                          </svg>
                          <span>Discord</span>
                        </div>
                        <ExternalLink
                          size={12}
                          className="text-obsidian-textMut group-hover:text-[#5865F2] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                        />
                      </div>
                      <span className="text-[10px] text-obsidian-textMut">
                        Community, preset sharing, and support.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        bridge.openExternalUrl(
                          appInfo?.docs_url ?? 'https://github.com/kuroLabs-ai/KuroLight#documentation'
                        )
                      }
                      className="flex flex-col text-left rounded-xl border border-obsidian-border bg-obsidian-deep p-3.5 hover:border-obsidian-accent/60 hover:bg-obsidian-card transition-all group cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-white mb-1.5">
                        <div className="flex items-center gap-2 font-bold text-xs">
                          <BookOpen size={14} className="text-obsidian-accent" />
                          <span>Documentation</span>
                        </div>
                        <ExternalLink
                          size={12}
                          className="text-obsidian-textMut group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                        />
                      </div>
                      <span className="text-[10px] text-obsidian-textMut">
                        User guides, shortcuts, and architecture docs.
                      </span>
                    </button>
                  </div>
                </div>

                {/* System runtime info */}
                <div>
                  <SectionHeader>System & Runtime</SectionHeader>
                  <div className="overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-deep divide-y divide-obsidian-border/50">
                    {[
                      {
                        icon: <Cpu size={12} />,
                        label: 'Host OS & Architecture',
                        value: `${appInfo?.platform ?? 'Windows'} (${appInfo?.architecture ?? 'x64'})`,
                      },
                      {
                        icon: <Terminal size={12} />,
                        label: 'Python Runtime',
                        value: `v${appInfo?.python_version ?? '3.13'} · PySide6 / Qt 6.12`,
                      },
                      {
                        icon: <HardDrive size={12} />,
                        label: 'Hardware Acceleration',
                        value: 'DirectML / CUDA (CPU Fallback)',
                        highlight: true,
                      },
                      {
                        icon: <Globe size={12} />,
                        label: 'Working Color Space',
                        value: `${appInfo?.working_color_space ?? 'sRGB'} (32-bit float)`,
                      },
                      {
                        icon: null,
                        label: 'Preview Edge Limit',
                        value: `${appInfo?.preview_max_edge ?? 2048} px`,
                      },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                        <span className="text-obsidian-textMut flex items-center gap-2">
                          {row.icon}
                          {row.label}
                        </span>
                        <span
                          className={`font-mono text-[11px] ${row.highlight ? 'text-emerald-400 font-semibold flex items-center gap-1.5' : 'text-white'}`}
                        >
                          {row.highlight && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* File paths */}
                <div>
                  <SectionHeader>Application Paths</SectionHeader>
                  <div className="space-y-2">
                    {[
                      { label: 'Config File', path: appInfo?.config_path ?? '', key: 'config' },
                      { label: 'User Data', path: appInfo?.data_dir ?? '', key: 'data' },
                      { label: 'Cache Directory', path: appInfo?.cache_dir ?? '', key: 'cache' },
                    ].map((item) => (
                      <div
                        key={item.key}
                        className="flex items-center justify-between gap-3 rounded-lg border border-obsidian-border bg-obsidian-deep px-3 py-2 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-semibold text-obsidian-textMut">{item.label}</div>
                          <div className="truncate font-mono text-[11px] text-white/90" title={item.path}>
                            {item.path || 'Loading…'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(item.path, item.key)}
                          title={`Copy ${item.label}`}
                          className="shrink-0 rounded p-1.5 text-obsidian-textMut hover:bg-obsidian-card hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedKey === item.key ? (
                            <Check size={13} className="text-emerald-400" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* License */}
                <p className="rounded-lg border border-obsidian-border/50 bg-obsidian-card/40 p-3 text-[10.5px] text-obsidian-textMut text-center leading-relaxed">
                  KuroLight is free and open-source software crafted with precision by KuroLabs.
                  <br />
                  Licensed under the Apache 2.0 / MIT Open Source License.
                </p>
              </div>
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
          <div className="flex shrink-0 gap-2">
            {tab === 'about' ? (
              <button
                type="button"
                onClick={() => {
                  if (!appInfo) return;
                  copyToClipboard(JSON.stringify(appInfo, null, 2), 'diagnostics');
                  setMessage('Diagnostics copied to clipboard.');
                }}
                className="flex items-center gap-1.5 rounded-lg border border-obsidian-border bg-obsidian-card px-3 py-2 text-xs font-semibold text-white hover:bg-obsidian-hover hover:border-obsidian-accent/50 cursor-pointer transition-colors"
              >
                {copiedKey === 'diagnostics' ? (
                  <Check size={13} className="text-emerald-400" />
                ) : (
                  <Copy size={13} />
                )}
                <span>{copiedKey === 'diagnostics' ? 'Copied!' : 'Copy Diagnostics'}</span>
              </button>
            ) : (
              <button
                onClick={() => void save()}
                disabled={busy}
                className="rounded-lg bg-obsidian-accent px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
              >
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
};
