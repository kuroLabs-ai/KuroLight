import React from 'react';
import {
  ExternalLink,
  BookOpen,
  Cpu,
  Terminal,
  HardDrive,
  Globe,
  Copy,
  Check,
} from 'lucide-react';
import { AppInfo } from '@/interfaces/system';
import { bridge } from '@/bridge';
import { SectionHeader } from '../SectionHeader';
import kuroLightWordmark from '@/assets/KuroLight-wordmark.svg';
import kuroLightLogo from '/logo.png';

export interface AboutTabProps {
  appInfo: AppInfo | null;
  copiedKey: string | null;
  onCopyPath: (path: string, key: string) => void;
}

export const AboutTab: React.FC<AboutTabProps> = ({
  appInfo,
  copiedKey,
  onCopyPath,
}) => {
  return (
    <div className="space-y-5 animate-fadeIn">
      {/* App identity banner */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-obsidian-border bg-gradient-to-br from-obsidian-card via-obsidian-deep to-obsidian-panel p-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <img
              src={kuroLightLogo}
              alt="KuroLight"
              className="h-8 w-8 object-contain rounded-lg drop-shadow-sm"
            />
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
                className={`font-mono text-[11px] ${
                  row.highlight
                    ? 'text-emerald-400 font-semibold flex items-center gap-1.5'
                    : 'text-white'
                }`}
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
                <div
                  className="truncate font-mono text-[11px] text-white/90"
                  title={item.path}
                >
                  {item.path || 'Loading…'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onCopyPath(item.path, item.key)}
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
  );
};
