import React, { useState, useRef, useCallback } from 'react';
import { ToneCurvesSettings, CurvePoint } from '../../types';
import { Sliders, RotateCcw } from 'lucide-react';

interface CurveEditorCardProps {
  curves?: ToneCurvesSettings;
  onChange: (newCurves: ToneCurvesSettings) => void;
}

const DEFAULT_CURVES: ToneCurvesSettings = {
  rgb_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  red_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  green_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  blue_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
};

type CurveChannel = 'rgb' | 'red' | 'green' | 'blue';

export const CurveEditorCard: React.FC<CurveEditorCardProps> = ({ curves, onChange }) => {
  const currentCurves = curves || DEFAULT_CURVES;
  const [channel, setChannel] = useState<CurveChannel>('rgb');
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const getPoints = useCallback((): CurvePoint[] => {
    if (channel === 'red') return currentCurves.red_points || [];
    if (channel === 'green') return currentCurves.green_points || [];
    if (channel === 'blue') return currentCurves.blue_points || [];
    return currentCurves.rgb_points || [];
  }, [channel, currentCurves]);

  const points = getPoints();

  const channelColors: Record<CurveChannel, string> = {
    rgb: '#0088FF',
    red: '#EF4444',
    green: '#22C55E',
    blue: '#3B82F6',
  };

  const updatePoints = (newPoints: CurvePoint[]) => {
    // Sort by x
    const sorted = [...newPoints].sort((a, b) => a.x - b.x);
    if (channel === 'red') onChange({ ...currentCurves, red_points: sorted });
    else if (channel === 'green') onChange({ ...currentCurves, green_points: sorted });
    else if (channel === 'blue') onChange({ ...currentCurves, blue_points: sorted });
    else onChange({ ...currentCurves, rgb_points: sorted });
  };

  const handleResetChannel = () => {
    const defaultPoints: CurvePoint[] = [{ x: 0.0, y: 0.0 }, { x: 1.0, y: 1.0 }];
    updatePoints(defaultPoints);
    setSelectedPointIdx(null);
  };

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

    // Check if clicked near an existing point
    const threshold = 0.08;
    const existingIdx = points.findIndex((p) => Math.hypot(p.x - nx, p.y - ny) <= threshold);

    if (existingIdx !== -1) {
      setSelectedPointIdx(existingIdx);
    } else {
      // Add new point
      const newPt: CurvePoint = { x: nx, y: ny };
      const updated = [...points, newPt].sort((a, b) => a.x - b.x);
      updatePoints(updated);
      setSelectedPointIdx(updated.findIndex((p) => p.x === nx && p.y === ny));
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (selectedPointIdx === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

    const updated = [...points];
    // Keep first point pinned at x=0, last pinned at x=1
    if (selectedPointIdx === 0) {
      updated[0] = { x: 0, y: ny };
    } else if (selectedPointIdx === points.length - 1) {
      updated[points.length - 1] = { x: 1, y: ny };
    } else {
      updated[selectedPointIdx] = { x: nx, y: ny };
    }
    updatePoints(updated);
  };

  const handleSvgMouseUp = () => {
    setSelectedPointIdx(null);
  };

  const handlePointDoubleClick = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    // Don't remove endpoints
    if (idx === 0 || idx === points.length - 1) return;
    const updated = points.filter((_, i) => i !== idx);
    updatePoints(updated);
    setSelectedPointIdx(null);
  };

  // Build SVG path
  const pathD = points.reduce((acc, p, idx) => {
    const px = p.x * 100;
    const py = (1 - p.y) * 100;
    return idx === 0 ? `M ${px} ${py}` : `${acc} L ${px} ${py}`;
  }, '');

  return (
    <div className="border border-obsidian-border rounded-lg bg-obsidian-card/40 p-2.5 space-y-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-[10px] text-obsidian-textSec uppercase tracking-wider">
          <Sliders size={13} className="text-obsidian-accent" />
          <span>Tone Curves</span>
        </div>

        {/* Channel Selector */}
        <div className="flex items-center gap-1">
          <div className="flex bg-obsidian-elevated p-0.5 rounded border border-obsidian-border text-[9px] font-bold">
            {(['rgb', 'red', 'green', 'blue'] as const).map((ch) => (
              <button
                key={ch}
                onClick={() => { setChannel(ch); setSelectedPointIdx(null); }}
                className={`px-1.5 py-0.5 rounded uppercase transition-colors ${
                  channel === ch
                    ? ch === 'red' ? 'bg-red-600 text-white' :
                      ch === 'green' ? 'bg-green-600 text-white' :
                      ch === 'blue' ? 'bg-blue-600 text-white' :
                      'bg-obsidian-accent text-white'
                    : 'text-obsidian-textMut hover:text-white'
                }`}
              >
                {ch === 'rgb' ? 'RGB' : ch[0].toUpperCase()}
              </button>
            ))}
          </div>

          <button
            onClick={handleResetChannel}
            title="Reset active curve channel"
            className="p-1 text-obsidian-textMut hover:text-white rounded hover:bg-obsidian-hover transition-colors"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      {/* SVG Curve Graph */}
      <div className="w-full h-36 bg-obsidian-deep rounded border border-obsidian-border/70 relative select-none cursor-crosshair overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          className="w-full h-full p-2"
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
        >
          {/* Grid lines */}
          {[25, 50, 75].map((val) => (
            <React.Fragment key={val}>
              <line x1={val} y1="0" x2={val} y2="100" stroke="#1d2127" strokeWidth="0.5" strokeDasharray="2,2" />
              <line x1="0" y1={val} x2="100" y2={val} stroke="#1d2127" strokeWidth="0.5" strokeDasharray="2,2" />
            </React.Fragment>
          ))}

          {/* Linear 45-degree diagonal reference */}
          <line x1="0" y1="100" x2="100" y2="0" stroke="#252a32" strokeWidth="0.8" strokeDasharray="3,3" />

          {/* Active Curve Spline */}
          <path
            d={pathD}
            fill="none"
            stroke={channelColors[channel]}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Control Points */}
          {points.map((p, idx) => {
            const px = p.x * 100;
            const py = (1 - p.y) * 100;
            const isSelected = selectedPointIdx === idx;

            return (
              <circle
                key={idx}
                cx={px}
                cy={py}
                r={isSelected ? 4 : 3}
                fill={isSelected ? '#ffffff' : channelColors[channel]}
                stroke="#0d0e11"
                strokeWidth="1.5"
                onDoubleClick={(e) => handlePointDoubleClick(idx, e)}
                className="cursor-pointer transition-transform hover:scale-125"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};
