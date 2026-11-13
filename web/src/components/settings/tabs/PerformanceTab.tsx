import React from 'react';
import { Zap } from 'lucide-react';
import { Preferences } from '@/interfaces/system';
import { SectionHeader } from '../SectionHeader';
import { inputClass, labelClass } from '../styles';

export interface PerformanceTabProps {
  prefs: Preferences;
  setPrefs: React.Dispatch<React.SetStateAction<Preferences | null>>;
  setPrefsDirty: (dirty: boolean) => void;
}

export const PerformanceTab: React.FC<PerformanceTabProps> = ({
  prefs,
  setPrefs,
  setPrefsDirty,
}) => {
  return (
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
  );
};
