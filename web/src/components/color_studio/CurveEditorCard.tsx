import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { HistogramData } from '@/interfaces/scopes';
import type { CurvePoint, ToneCurvesSettings } from '../../types';
import { RotateCcw, Sliders } from 'lucide-react';

interface CurveEditorCardProps {
  curves?: ToneCurvesSettings;
  histogram?: HistogramData;
  onChange: (newCurves: ToneCurvesSettings) => void;
}

const DEFAULT_CURVES: ToneCurvesSettings = {
  rgb_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  red_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  green_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  blue_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
};

const CHANNELS = ['rgb', 'red', 'green', 'blue'] as const;
type CurveChannel = (typeof CHANNELS)[number];

const CHANNEL_COLORS: Record<CurveChannel, string> = {
  rgb: '#55aaff',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
};

const CURVE_KEYS: Record<CurveChannel, keyof ToneCurvesSettings> = {
  rgb: 'rgb_points',
  red: 'red_points',
  green: 'green_points',
  blue: 'blue_points',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const CurveEditorCard: React.FC<CurveEditorCardProps> = ({ curves, histogram, onChange }) => {
  const currentCurves = curves || DEFAULT_CURVES;
  const [channel, setChannel] = useState<CurveChannel>('rgb');
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const points = useMemo(() => {
    const activePoints = currentCurves[CURVE_KEYS[channel]];
    const sorted = [...(activePoints.length > 0 ? activePoints : DEFAULT_CURVES[CURVE_KEYS[channel]])]
      .sort((a, b) => a.x - b.x);
    if (sorted[0]?.x > 0) sorted.unshift({ x: 0, y: 0 });
    if (sorted[sorted.length - 1]?.x < 1) sorted.push({ x: 1, y: 1 });
    return sorted;
  }, [channel, currentCurves]);

  const updatePoints = useCallback((newPoints: CurvePoint[]) => {
    onChange({ ...currentCurves, [CURVE_KEYS[channel]]: newPoints });
  }, [channel, currentCurves, onChange]);

  const curvePath = useMemo(
    () => points.map((point, index) =>
      `${index === 0 ? 'M' : 'L'} ${(point.x * 100).toFixed(2)} ${((1 - point.y) * 100).toFixed(2)}`
    ).join(' '),
    [points]
  );

  const histogramPath = useMemo(() => {
    const values = histogram?.lum ?? [];
    if (values.length === 0) return '';
    const maximum = Math.max(...values, 1);
    const line = values.map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - (value / maximum) * 88;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
    return `${line} L 100 100 L 0 100 Z`;
  }, [histogram]);

  const getPosition = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const position = getPosition(event);
    const rect = event.currentTarget.getBoundingClientRect();
    const existingIndex = points.findIndex((point) =>
      Math.hypot((point.x - position.x) * rect.width, (point.y - position.y) * rect.height) <= 12
    );

    if (existingIndex >= 0) {
      setSelectedPointIdx(existingIndex);
    } else {
      const x = clamp(position.x, 0.01, 0.99);
      const point: CurvePoint = { x, y: position.y };
      const updated = [...points, point].sort((a, b) => a.x - b.x);
      const index = updated.indexOf(point);
      updatePoints(updated);
      setSelectedPointIdx(index);
    }

    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current || selectedPointIdx === null) return;
    const position = getPosition(event);
    const updated = [...points];
    if (selectedPointIdx === 0) {
      updated[0] = { x: 0, y: position.y };
    } else if (selectedPointIdx === points.length - 1) {
      updated[selectedPointIdx] = { x: 1, y: position.y };
    } else {
      const minimumX = points[selectedPointIdx - 1].x + 0.005;
      const maximumX = points[selectedPointIdx + 1].x - 0.005;
      updated[selectedPointIdx] = {
        x: clamp(position.x, minimumX, maximumX),
        y: position.y,
      };
    }
    updatePoints(updated);
  };

  const removeSelectedPoint = () => {
    if (selectedPointIdx === null || selectedPointIdx === 0 || selectedPointIdx === points.length - 1) return;
    updatePoints(points.filter((_, index) => index !== selectedPointIdx));
    setSelectedPointIdx(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removeSelectedPoint();
      return;
    }
    if (selectedPointIdx === null || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.05 : 0.01;
    const updated = [...points];
    const point = updated[selectedPointIdx];
    const x = event.key === 'ArrowLeft' ? point.x - step : event.key === 'ArrowRight' ? point.x + step : point.x;
    const y = event.key === 'ArrowDown' ? point.y - step : event.key === 'ArrowUp' ? point.y + step : point.y;
    if (selectedPointIdx > 0 && selectedPointIdx < points.length - 1) {
      updated[selectedPointIdx] = {
        x: clamp(x, points[selectedPointIdx - 1].x + 0.005, points[selectedPointIdx + 1].x - 0.005),
        y: clamp(y, 0, 1),
      };
    } else {
      updated[selectedPointIdx] = { x: point.x, y: clamp(y, 0, 1) };
    }
    updatePoints(updated);
  };

  const setCoordinate = (axis: 'x' | 'y', value: number) => {
    if (selectedPointIdx === null) return;
    const updated = [...points];
    const point = updated[selectedPointIdx];
    if (axis === 'x' && selectedPointIdx > 0 && selectedPointIdx < points.length - 1) {
      updated[selectedPointIdx] = {
        ...point,
        x: clamp(value / 100, points[selectedPointIdx - 1].x + 0.005, points[selectedPointIdx + 1].x - 0.005),
      };
    } else if (axis === 'y') {
      updated[selectedPointIdx] = { ...point, y: clamp(value / 100, 0, 1) };
    }
    updatePoints(updated);
  };

  const resetChannel = () => {
    updatePoints([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    setSelectedPointIdx(null);
  };

  const selectedPoint = selectedPointIdx === null ? null : points[selectedPointIdx];

  return (
    <section className="space-y-2 rounded-lg border border-obsidian-border bg-obsidian-card/40 p-2.5 shadow-sm">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-obsidian-textSec">
          <Sliders size={13} className="text-obsidian-accent" />
          <span>Tone Curves</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded border border-obsidian-border bg-obsidian-elevated p-0.5">
            {CHANNELS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={channel === item}
                onClick={() => { setChannel(item); setSelectedPointIdx(null); }}
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase transition-colors ${
                  channel === item ? 'text-white' : 'text-obsidian-textMut hover:text-white'
                }`}
                style={channel === item ? { backgroundColor: CHANNEL_COLORS[item] } : undefined}
              >
                {item === 'rgb' ? 'RGB' : item[0].toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={resetChannel}
            title="Reset active curve channel"
            aria-label="Reset active curve channel"
            className="rounded p-1 text-obsidian-textMut transition-colors hover:bg-obsidian-hover hover:text-white"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </header>

      <div className="relative h-40 overflow-hidden rounded border border-obsidian-border/70 bg-obsidian-deep">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full touch-none"
          role="application"
          aria-label={`${channel.toUpperCase()} tone curve. Click to add a point, drag to move it, Delete to remove it.`}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => { draggingRef.current = false; }}
          onPointerCancel={() => { draggingRef.current = false; }}
          onKeyDown={handleKeyDown}
        >
          {[25, 50, 75].map((value) => (
            <React.Fragment key={value}>
              <line x1={value} y1="0" x2={value} y2="100" stroke="#252a32" strokeWidth="0.5" strokeDasharray="2,2" />
              <line x1="0" y1={value} x2="100" y2={value} stroke="#252a32" strokeWidth="0.5" strokeDasharray="2,2" />
            </React.Fragment>
          ))}
          <line x1="0" y1="100" x2="100" y2="0" stroke="#414854" strokeWidth="0.8" strokeDasharray="2,2" />
          {histogramPath && (
            <path d={histogramPath} fill="#b9c3d0" fillOpacity="0.12" stroke="#b9c3d0" strokeOpacity="0.24" strokeWidth="0.5" />
          )}
          <path d={curvePath} fill="none" stroke={CHANNEL_COLORS[channel]} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => (
            <circle
              key={`${point.x}-${index}`}
              cx={point.x * 100}
              cy={(1 - point.y) * 100}
              r={selectedPointIdx === index ? 4 : 3}
              fill={selectedPointIdx === index ? '#fff' : CHANNEL_COLORS[channel]}
              stroke="#090b0f"
              strokeWidth="1.3"
              pointerEvents="none"
            />
          ))}
        </svg>
      </div>

      <div className="flex min-h-5 items-center justify-between gap-2 text-[9px] text-obsidian-textMut">
        <span>Click to add · drag to shape · select a point and press Delete to remove</span>
        {selectedPoint && (
          <span className="shrink-0 font-mono text-obsidian-textSec">
            In {Math.round(selectedPoint.x * 100)}% · Out {Math.round(selectedPoint.y * 100)}%
          </span>
        )}
      </div>

      {selectedPoint && (
        <div className="grid grid-cols-2 gap-2">
          {(['x', 'y'] as const).map((axis) => (
            <label key={axis} className="flex items-center gap-2 text-[9px] text-obsidian-textMut">
              <span className="w-10">{axis === 'x' ? 'Input' : 'Output'}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(selectedPoint[axis] * 100)}
                onChange={(event) => setCoordinate(axis, Number(event.target.value))}
                aria-label={`${axis === 'x' ? 'Input' : 'Output'} value`}
                disabled={axis === 'x' && (selectedPointIdx === 0 || selectedPointIdx === points.length - 1)}
                className="min-w-0 flex-1 accent-obsidian-accent"
              />
              <span className="w-8 text-right font-mono">{Math.round(selectedPoint[axis] * 100)}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
};
