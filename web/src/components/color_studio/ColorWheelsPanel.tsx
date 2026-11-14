import React from 'react';
import { ColorGradingSettings, ColorWheelValue } from '../../types';
import { ColorWheel } from './ColorWheel';

interface ColorWheelsPanelProps {
  colorGrading?: ColorGradingSettings;
  onChange: (newCg: ColorGradingSettings) => void;
}

const DEFAULT_WHEEL_VAL: ColorWheelValue = { hue: 0, saturation: 0, luminance: 0 };
const DEFAULT_CG: ColorGradingSettings = {
  lift: DEFAULT_WHEEL_VAL,
  gamma: DEFAULT_WHEEL_VAL,
  gain: DEFAULT_WHEEL_VAL,
  offset: DEFAULT_WHEEL_VAL,
  lut_name: null,
  lut_intensity: 1.0,
};

// Accent colors: Lift=blue(shadows), Gamma=purple(midtones), Gain=amber(highlights), Offset=slate(global)
const WHEEL_CONFIG = [
  { key: 'lift',   title: 'Lift',   subtitle: 'Shadows',    accent: '#3B82F6' },
  { key: 'gamma',  title: 'Gamma',  subtitle: 'Midtones',   accent: '#A855F7' },
  { key: 'gain',   title: 'Gain',   subtitle: 'Highlights', accent: '#F59E0B' },
  { key: 'offset', title: 'Offset', subtitle: 'Global',     accent: '#94A3B8' },
] as const;

export const ColorWheelsPanel: React.FC<ColorWheelsPanelProps> = ({ colorGrading, onChange }) => {
  const currentCg = colorGrading || DEFAULT_CG;

  const updateWheel = (key: 'lift' | 'gamma' | 'gain' | 'offset', val: ColorWheelValue) => {
    onChange({ ...currentCg, [key]: val });
  };

  return (
    <div className="w-full h-full bg-obsidian-panel border-t border-obsidian-border flex flex-row select-none overflow-hidden relative">
      {WHEEL_CONFIG.map(({ key, title, subtitle, accent }, idx) => (
        <React.Fragment key={key}>
          {/* Divider between wheels */}
          {idx > 0 && <div className="w-px bg-obsidian-border flex-shrink-0" />}

          <div className="flex-1 flex flex-col min-w-0 h-full">
            {/* Sub-label row */}
            <div
              className="text-center pt-1.5 pb-0 text-[8.5px] font-bold tracking-widest uppercase flex-shrink-0"
              style={{ color: accent }}
            >
              {subtitle}
            </div>
            <ColorWheel
              title={title}
              accentColor={accent}
              value={currentCg[key] || DEFAULT_WHEEL_VAL}
              onChange={(val) => updateWheel(key, val)}
            />
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};
