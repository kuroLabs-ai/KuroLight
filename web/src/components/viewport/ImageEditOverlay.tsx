import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import type {
  AdjustmentMask,
  GeometrySettings,
  MaskStroke,
  RetouchSpot,
} from '@/interfaces/edit';
import { imageUvToRotatedUv, rotatedUvToImageUv, getRotatedImageDimensions } from '@/utils/imageGeometry';

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CropOverlayProps {
  rect: CropRect;
  aspectRatio: string;
  imageWidth: number;
  imageHeight: number;
  onChange: (rect: CropRect) => void;
}

interface Drag {
  action: string;
  startPointer: { x: number; y: number };
  startRect: CropRect;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function getAspectRatio(value: string, width: number, height: number): number | null {
  const normalizedValue = value.toLowerCase();
  if (normalizedValue === 'free form') return null;
  if (normalizedValue === 'original' || !value) return width / height;
  const match = value.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) / Number(match[2]) : null;
}

function useOverlayPointer(
  ref: RefObject<SVGSVGElement | null>,
  onDown: (event: PointerEvent, position: { x: number; y: number }) => void,
  onMove: (event: PointerEvent, position: { x: number; y: number }) => void,
  onUp: (event: PointerEvent) => void
) {
  const handlers = useRef({ onDown, onMove, onUp });
  useLayoutEffect(() => {
    handlers.current = { onDown, onMove, onUp };
  }, [onDown, onMove, onUp]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const getPosition = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      return {
        x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
        y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
      };
    };
    const down = (event: PointerEvent) => {
      event.stopPropagation();
      event.preventDefault();
      handlers.current.onDown(event, getPosition(event));
    };
    const move = (event: PointerEvent) => {
      event.stopPropagation();
      handlers.current.onMove(event, getPosition(event));
    };
    const up = (event: PointerEvent) => {
      event.stopPropagation();
      handlers.current.onUp(event);
    };
    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
    };
  }, [ref]);
}

export function CropOverlay({
  rect,
  aspectRatio,
  imageWidth,
  imageHeight,
  onChange,
}: CropOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const rectRef = useRef(rect);
  const changeRef = useRef(onChange);
  useLayoutEffect(() => {
    rectRef.current = rect;
    changeRef.current = onChange;
  }, [rect, onChange]);

  const applyResize = (position: { x: number; y: number }) => {
    const currentDrag = drag.current;
    if (!currentDrag) return;
    const { action, startPointer, startRect } = currentDrag;
    if (action === 'move') {
      changeRef.current({
        ...startRect,
        x: clamp(startRect.x + position.x - startPointer.x, 0, 1 - startRect.w),
        y: clamp(startRect.y + position.y - startPointer.y, 0, 1 - startRect.h),
      });
      return;
    }

    const handle = action === 'create'
      ? `${position.y < startPointer.y ? 'n' : 's'}${position.x < startPointer.x ? 'w' : 'e'}`
      : action.replace('resize-', '');
    const west = handle.includes('w');
    const north = handle.includes('n');
    const anchorX = action === 'create' ? startRect.x : west ? startRect.x + startRect.w : startRect.x;
    const anchorY = action === 'create' ? startRect.y : north ? startRect.y + startRect.h : startRect.y;
    let width = Math.abs(position.x - anchorX);
    let height = Math.abs(position.y - anchorY);
    const ratio = getAspectRatio(aspectRatio, imageWidth, imageHeight);
    const normalizedRatio = ratio === null ? null : ratio * imageHeight / imageWidth;

    if (normalizedRatio !== null && normalizedRatio > 0) {
      if (width > height * normalizedRatio) height = width / normalizedRatio;
      else width = height * normalizedRatio;
    }
    width = Math.max(0.01, width);
    height = Math.max(0.01, height);

    const maxWidth = west ? anchorX : 1 - anchorX;
    const maxHeight = north ? anchorY : 1 - anchorY;
    const scale = Math.min(1, maxWidth / width, maxHeight / height);
    width *= scale;
    height *= scale;
    const x = west ? anchorX - width : anchorX;
    const y = north ? anchorY - height : anchorY;
    changeRef.current({ x, y, w: width, h: height });
  };

  useOverlayPointer(
    svgRef,
    (event, position) => {
      const target = (event.target as Element).closest<SVGElement>('[data-crop-action]');
      const currentRect = rectRef.current;
      const isFullFrame =
        currentRect.x <= 0.001 &&
        currentRect.y <= 0.001 &&
        currentRect.w >= 0.999 &&
        currentRect.h >= 0.999;
      const targetAction = target?.dataset.cropAction ?? 'create';
      const action = targetAction === 'move' && isFullFrame ? 'create' : targetAction;
      drag.current = {
        action,
        startPointer: position,
        startRect: action === 'create'
          ? { x: position.x, y: position.y, w: 0.01, h: 0.01 }
          : rectRef.current,
      };
      svgRef.current?.setPointerCapture(event.pointerId);
      if (action === 'create') applyResize(position);
    },
    (_event, position) => applyResize(position),
    () => {
      drag.current = null;
    }
  );

  const handles = [
    { id: 'nw', x: rect.x, y: rect.y },
    { id: 'ne', x: rect.x + rect.w, y: rect.y },
    { id: 'sw', x: rect.x, y: rect.y + rect.h },
    { id: 'se', x: rect.x + rect.w, y: rect.y + rect.h },
  ];

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="absolute inset-0 z-30 h-full w-full"
      style={{ touchAction: 'none' }}
      aria-label="Crop selection"
    >
      <path
        d={`M0 0H1V1H0Z M${rect.x} ${rect.y}H${rect.x + rect.w}V${rect.y + rect.h}H${rect.x}Z`}
        fill="rgba(0,0,0,0.52)"
        fillRule="evenodd"
        pointerEvents="none"
      />
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        fill="transparent"
        stroke="white"
        strokeWidth="0.003"
        data-crop-action="move"
      />
      <rect
        x="0"
        y="0"
        width="1"
        height="1"
        fill="transparent"
        data-crop-action="create"
        pointerEvents="all"
      />
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        fill="transparent"
        stroke="white"
        strokeWidth="0.003"
        data-crop-action="move"
      />
      {handles.map((handle) => (
        <circle
          key={handle.id}
          cx={handle.x}
          cy={handle.y}
          r="0.009"
          fill="white"
          stroke="#2563eb"
          strokeWidth="0.003"
          data-crop-action={`resize-${handle.id}`}
        />
      ))}
    </svg>
  );
}

interface MaskRetouchOverlayProps {
  masks: AdjustmentMask[];
  selectedMaskId: string | null;
  onMaskSelect?: (id: string) => void;
  onMaskGeometryChange?: (id: string, geometry: AdjustmentMask['geometry']) => void;
  retouchSpots: RetouchSpot[];
  selectedRetouchSpotId: string | null;
  onRetouchSpotSelect?: (id: string) => void;
  onRetouchSpotChange?: (id: string, updates: Partial<RetouchSpot>) => void;
  cropRect: CropRect;
  imageWidth: number;
  imageHeight: number;
  geometry?: GeometrySettings;
}

type OverlayDrag =
  | { kind: 'mask'; id: string; action: string; pointer: { x: number; y: number }; geometry: AdjustmentMask['geometry']; stroke: MaskStroke[] }
  | { kind: 'retouch'; id: string; action: string; pointer: { x: number; y: number }; spot: RetouchSpot };

export function MaskRetouchOverlay({
  masks,
  selectedMaskId,
  onMaskSelect,
  onMaskGeometryChange,
  retouchSpots,
  selectedRetouchSpotId,
  onRetouchSpotSelect,
  onRetouchSpotChange,
  cropRect,
  imageWidth,
  imageHeight,
  geometry,
}: MaskRetouchOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<OverlayDrag | null>(null);
  const propsRef = useRef({
    masks, selectedMaskId, onMaskSelect, onMaskGeometryChange,
    retouchSpots, onRetouchSpotSelect, onRetouchSpotChange, cropRect,
  });
  useLayoutEffect(() => {
    propsRef.current = {
      masks, selectedMaskId, onMaskSelect, onMaskGeometryChange,
      retouchSpots, onRetouchSpotSelect, onRetouchSpotChange, cropRect,
    };
  }, [
    masks, selectedMaskId, onMaskSelect, onMaskGeometryChange,
    retouchSpots, onRetouchSpotSelect, onRetouchSpotChange, cropRect,
  ]);

  const rotation = (geometry?.rotation ?? 0) + (geometry?.straighten ?? 0);
  const horizontalFlip = geometry?.horizontal_flip ?? false;
  const verticalFlip = geometry?.vertical_flip ?? false;
  const rotatedDimensions = getRotatedImageDimensions(imageWidth, imageHeight, rotation);
  const toImage = (position: { x: number; y: number }) =>
    rotatedUvToImageUv(
      {
        x: cropRect.x + position.x * cropRect.w,
        y: cropRect.y + position.y * cropRect.h,
      },
      imageWidth,
      imageHeight,
      rotation,
      horizontalFlip,
      verticalFlip
    );
  const toDisplay = (x: number, y: number) => {
    const rotated = imageUvToRotatedUv(
      { x, y },
      imageWidth,
      imageHeight,
      rotation,
      horizontalFlip,
      verticalFlip
    );
    return {
      x: (rotated.x - cropRect.x) / cropRect.w,
      y: (rotated.y - cropRect.y) / cropRect.h,
    };
  };
  const geometryNumber = (geometry: AdjustmentMask['geometry'], key: string, fallback: number) =>
    typeof geometry[key] === 'number' ? geometry[key] as number : fallback;

  useOverlayPointer(
    svgRef,
    (event, position) => {
      const target = (event.target as Element).closest<SVGElement>('[data-overlay-action]');
      if (!target) return;
      const action = target.dataset.overlayAction ?? '';
      const maskId = target.dataset.maskId;
      const spotId = target.dataset.spotId;
      const imagePosition = toImage(position);
      if (maskId) {
        propsRef.current.onMaskSelect?.(maskId);
        const mask = propsRef.current.masks.find((item) => item.id === maskId);
        if (mask && action !== 'select-mask') {
          const strokes = Array.isArray(mask.geometry.strokes)
            ? mask.geometry.strokes as MaskStroke[]
            : [];
          const nextStrokes = action === 'brush'
            ? [
                ...strokes,
                {
                  x: imagePosition.x,
                  y: imagePosition.y,
                  r: geometryNumber(mask.geometry, 'brush_size', 0.04) / 2,
                  o: 1,
                },
              ]
            : strokes;
          drag.current = {
            kind: 'mask',
            id: maskId,
            action,
            pointer: imagePosition,
            geometry: mask.geometry,
            stroke: nextStrokes,
          };
          if (action === 'brush') {
            propsRef.current.onMaskGeometryChange?.(maskId, {
              ...mask.geometry,
              strokes: nextStrokes,
            });
          }
        } else {
          drag.current = null;
        }
      } else if (spotId) {
        propsRef.current.onRetouchSpotSelect?.(spotId);
        const spot = propsRef.current.retouchSpots.find((item) => item.id === spotId);
        if (spot) {
          drag.current = {
            kind: 'retouch',
            id: spotId,
            action,
            pointer: imagePosition,
            spot,
          };
        }
      } else {
        return;
      }
      svgRef.current?.setPointerCapture(event.pointerId);
    },
    (_event, position) => {
      const active = drag.current;
      if (!active) return;
      const current = toImage(position);
      const dx = current.x - active.pointer.x;
      const dy = current.y - active.pointer.y;
      if (active.kind === 'retouch') {
        propsRef.current.onRetouchSpotChange?.(
          active.id,
          active.action === 'retouch-source'
            ? { source_x: clamp(active.spot.source_x + dx, 0, 1), source_y: clamp(active.spot.source_y + dy, 0, 1) }
            : { target_x: clamp(active.spot.target_x + dx, 0, 1), target_y: clamp(active.spot.target_y + dy, 0, 1) }
        );
        return;
      }

      const geometry = { ...active.geometry };
      const number = (key: string, fallback: number) => geometryNumber(active.geometry, key, fallback);
      if (active.action === 'radial-move') {
        geometry.cx = clamp(number('cx', 0.5) + dx, 0, 1);
        geometry.cy = clamp(number('cy', 0.5) + dy, 0, 1);
      } else if (active.action === 'radial-rx') {
        geometry.rx = clamp(Math.abs(current.x - number('cx', 0.5)), 0.005, 1);
      } else if (active.action === 'radial-ry') {
        geometry.ry = clamp(Math.abs(current.y - number('cy', 0.5)), 0.005, 1);
      } else if (active.action === 'linear-move') {
        geometry.x1 = clamp(number('x1', 0.5) + dx, 0, 1);
        geometry.y1 = clamp(number('y1', 0) + dy, 0, 1);
        geometry.x2 = clamp(number('x2', 0.5) + dx, 0, 1);
        geometry.y2 = clamp(number('y2', 1) + dy, 0, 1);
      } else if (active.action === 'linear-start' || active.action === 'linear-end') {
        const start = active.action === 'linear-start';
        geometry[start ? 'x1' : 'x2'] = current.x;
        geometry[start ? 'y1' : 'y2'] = current.y;
      } else if (active.action === 'brush') {
        const size = geometryNumber(active.geometry, 'brush_size', 0.04);
        const points = [...active.stroke];
        const previous = points[points.length - 1] ?? { x: active.pointer.x, y: active.pointer.y };
        const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
        const steps = Math.max(1, Math.ceil(distance / Math.max(size * 0.2, 0.002)));
        for (let step = 1; step <= steps; step++) {
          const t = step / steps;
          points.push({
            x: previous.x + (current.x - previous.x) * t,
            y: previous.y + (current.y - previous.y) * t,
            r: size / 2,
            o: 1,
          });
        }
        active.stroke = points;
        geometry.strokes = points;
      }
      propsRef.current.onMaskGeometryChange?.(active.id, geometry);
    },
    () => {
      drag.current = null;
    }
  );

  const selectedMask = masks.find((mask) => mask.id === selectedMaskId);
  const selectedBrush = selectedMask?.mask_type === 'brush' ? selectedMask : null;
  const brushStrokes = (mask: AdjustmentMask) =>
    Array.isArray(mask.geometry.strokes) ? mask.geometry.strokes as MaskStroke[] : [];
  const brushPath = (mask: AdjustmentMask) => brushStrokes(mask).map((stroke, index) => {
    const point = toDisplay(stroke.x, stroke.y);
    return `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`;
  }).join(' ');
  const spotRadiusX = (spot: RetouchSpot) =>
    (spot.radius * Math.min(imageWidth, imageHeight)) / rotatedDimensions.width / cropRect.w;
  const spotRadiusY = (spot: RetouchSpot) =>
    (spot.radius * Math.min(imageWidth, imageHeight)) / rotatedDimensions.height / cropRect.h;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="absolute inset-0 z-20 h-full w-full"
      style={{ pointerEvents: 'none', touchAction: 'none' }}
      aria-label="Mask and retouch controls"
    >
      {masks.map((mask) => {
        const selected = mask.id === selectedMaskId;
        const geometry = mask.geometry;
        if (mask.mask_type === 'radial') {
          const center = toDisplay(geometryNumber(geometry, 'cx', 0.5), geometryNumber(geometry, 'cy', 0.5));
          const rx = geometryNumber(geometry, 'rx', 0.3) / cropRect.w;
          const ry = geometryNumber(geometry, 'ry', 0.3) / cropRect.h;
          return (
            <g key={mask.id} opacity={mask.enabled ? 1 : 0.4}>
              <ellipse
                cx={center.x} cy={center.y} rx={rx} ry={ry}
                fill="rgba(40,190,255,0.08)"
                stroke={selected ? '#38bdf8' : '#fbbf24'}
                strokeWidth="0.0025"
                data-mask-id={mask.id}
                data-overlay-action={selected ? 'radial-move' : 'select-mask'}
                style={{ pointerEvents: 'all', cursor: selected ? 'move' : 'pointer' }}
              />
              {selected && (
                <>
                  <circle cx={center.x + rx} cy={center.y} r="0.008" fill="white" data-mask-id={mask.id} data-overlay-action="radial-rx" style={{ pointerEvents: 'all', cursor: 'ew-resize' }} />
                  <circle cx={center.x} cy={center.y + ry} r="0.008" fill="white" data-mask-id={mask.id} data-overlay-action="radial-ry" style={{ pointerEvents: 'all', cursor: 'ns-resize' }} />
                </>
              )}
            </g>
          );
        }
        if (mask.mask_type === 'linear') {
          const start = toDisplay(geometryNumber(geometry, 'x1', 0.5), geometryNumber(geometry, 'y1', 0));
          const end = toDisplay(geometryNumber(geometry, 'x2', 0.5), geometryNumber(geometry, 'y2', 1));
          return (
            <g key={mask.id} opacity={mask.enabled ? 1 : 0.4}>
              <line
                x1={start.x} y1={start.y} x2={end.x} y2={end.y}
                stroke={selected ? '#38bdf8' : '#fbbf24'}
                strokeWidth="0.004"
                strokeDasharray="0.012 0.008"
                data-mask-id={mask.id}
                data-overlay-action={selected ? 'linear-move' : 'select-mask'}
                style={{ pointerEvents: 'stroke', cursor: selected ? 'move' : 'pointer' }}
              />
              {selected && (
                <>
                  <circle cx={start.x} cy={start.y} r="0.009" fill="white" data-mask-id={mask.id} data-overlay-action="linear-start" style={{ pointerEvents: 'all', cursor: 'move' }} />
                  <circle cx={end.x} cy={end.y} r="0.009" fill="white" data-mask-id={mask.id} data-overlay-action="linear-end" style={{ pointerEvents: 'all', cursor: 'move' }} />
                </>
              )}
            </g>
          );
        }
        if (mask.mask_type === 'brush') {
          const points = brushStrokes(mask);
          return (
            <path
              key={mask.id}
              d={brushPath(mask)}
              fill="none"
              stroke={selected ? '#38bdf8' : '#fbbf24'}
              strokeOpacity={mask.enabled ? 0.6 : 0.25}
              strokeWidth={Math.max(0.003, geometryNumber(geometry, 'brush_size', 0.04) / Math.min(cropRect.w, cropRect.h))}
              strokeLinecap="round"
              data-mask-id={mask.id}
              data-overlay-action={selected ? 'brush' : 'select-mask'}
              style={{ pointerEvents: points.length ? 'stroke' : 'none', cursor: 'crosshair' }}
            />
          );
        }
        return null;
      })}
      {selectedBrush && (
        <rect
          x="0" y="0" width="1" height="1"
          fill="transparent"
          data-mask-id={selectedBrush.id}
          data-overlay-action="brush"
          style={{ pointerEvents: 'all', cursor: 'crosshair' }}
        />
      )}
      {retouchSpots.filter((spot) => spot.enabled).map((spot) => {
        const selected = spot.id === selectedRetouchSpotId;
        const target = toDisplay(spot.target_x, spot.target_y);
        const source = toDisplay(spot.source_x, spot.source_y);
        return (
          <g key={spot.id}>
            <line
              x1={target.x} y1={target.y} x2={source.x} y2={source.y}
              stroke={selected ? '#f472b6' : '#fb923c'}
              strokeWidth="0.002"
              strokeDasharray="0.008 0.006"
              pointerEvents="none"
            />
            <ellipse
              cx={target.x} cy={target.y} rx={spotRadiusX(spot)} ry={spotRadiusY(spot)}
              fill="rgba(244,114,182,0.08)"
              stroke={selected ? '#f472b6' : '#fb923c'}
              strokeWidth="0.0025"
              data-spot-id={spot.id}
              data-overlay-action="retouch-target"
              style={{ pointerEvents: 'all', cursor: 'move' }}
            />
            <circle
              cx={source.x} cy={source.y} r="0.009"
              fill={selected ? '#f472b6' : '#fb923c'}
              stroke="white" strokeWidth="0.002"
              data-spot-id={spot.id}
              data-overlay-action="retouch-source"
              style={{ pointerEvents: 'all', cursor: 'move' }}
            />
          </g>
        );
      })}
    </svg>
  );
}
