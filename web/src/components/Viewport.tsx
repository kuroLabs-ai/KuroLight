import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Columns, 
  Eye, 
  Maximize2, 
  ZoomIn, 
  ZoomOut, 
  Film, 
  Crop,
  Check, 
  X, 
  RotateCcw,
  Grid3x3,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import {
  drawCompositionGuide,
  getNextGuideType,
  getNextOrientation,
  GUIDE_OPTIONS,
  type GuideLineType,
} from '../utils/compositionGuides';
import type {
  AdjustmentMask,
  GeometrySettings,
  LensCorrectionSettings,
  MaskStroke,
  RetouchSpot,
} from '../types';
import { bridge } from '../bridge';
import { thumbnailCache } from './gallery/GalleryThumbnail';

export interface ViewportProps {
  imageUrl?: string;
  beforeImageUrl?: string;
  activeAssetId?: string;
  dimensions?: { width: number; height: number };
  masks?: AdjustmentMask[];
  selectedMaskId?: string | null;
  geometry?: GeometrySettings;
  lensCorrection?: LensCorrectionSettings;
  onMaskSelect?: (maskId: string) => void;
  onMaskGeometryChange?: (maskId: string, geometry: AdjustmentMask['geometry']) => void;
  retouchSpots?: RetouchSpot[];
  selectedRetouchSpotId?: string | null;
  onRetouchSpotSelect?: (spotId: string) => void;
  onRetouchSpotChange?: (spotId: string, updates: Partial<RetouchSpot>) => void;
  // Crop
  isCropActive?: boolean;
  cropRect?: { x: number; y: number; w: number; h: number };
  aspectRatio?: string;
  onCropChange?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onApplyCrop?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onCancelCrop?: () => void;
  onResetCrop?: () => void;
  onToggleCrop?: () => void;
  onSelectAspectRatio?: (ratio: string) => void;
  // Misc
  onViewportRectChange?: (rect: { x: number; y: number; w: number; h: number }) => void;
  isFilmstripVisible?: boolean;
  onToggleFilmstrip?: () => void;
}

type CropHandle = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'move' | null;
type MaskDragPart = 'move' | 'point1' | 'point2' | 'center' | 'radiusX' | 'radiusY' | 'brush';
type RetouchDragPart = 'target' | 'source';

export const Viewport: React.FC<ViewportProps> = ({
  imageUrl,
  beforeImageUrl,
  activeAssetId,
  dimensions,
  masks = [],
  selectedMaskId,
  geometry,
  lensCorrection,
  onMaskSelect,
  onMaskGeometryChange,
  retouchSpots = [],
  selectedRetouchSpotId,
  onRetouchSpotSelect,
  onRetouchSpotChange,
  isCropActive = false,
  cropRect = { x: 0, y: 0, w: 1, h: 1 },
  aspectRatio = 'Original',
  onCropChange,
  onApplyCrop,
  onCancelCrop,
  onResetCrop,
  onToggleCrop,
  onSelectAspectRatio,
  onViewportRectChange,
  isFilmstripVisible = true,
  onToggleFilmstrip,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Pan & Zoom View State ──
  const [scale, setScale] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });

  // ── Before / After Comparison State ──
  const [isSplitView, setIsSplitView] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // ── Image References & Double Buffering ──
  const imgRef = useRef<HTMLImageElement | null>(null);
  const beforeImgRef = useRef<HTMLImageElement | null>(null);
  const bufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const checkerPatternRef = useRef<CanvasPattern | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // ── Interactive Crop State ──
  const [localCrop, setLocalCrop] = useState<{ x: number; y: number; w: number; h: number }>(cropRect);
  const [activeCropAspect, setActiveCropAspect] = useState<string>(aspectRatio);
  const [activeCropHandle, setActiveCropHandle] = useState<CropHandle>(null);
  const [hoverCropHandle, setHoverCropHandle] = useState<CropHandle>(null);
  const [hoverMaskHandle, setHoverMaskHandle] = useState<MaskDragPart | null>(null);
  const [activeMaskHandle, setActiveMaskHandle] = useState<MaskDragPart | null>(null);
  const [hoverRetouchHandle, setHoverRetouchHandle] = useState<RetouchDragPart | null>(null);
  const [activeRetouchHandle, setActiveRetouchHandle] = useState<RetouchDragPart | null>(null);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const colorSampleCallbackRef = useRef<((color: string) => void) | null>(null);

  // ── Photographic Composition Guides State ──
  const [guideType, setGuideType] = useState<GuideLineType>('none');
  const [guideOrientation, setGuideOrientation] = useState<number>(0);
  const [isGuideMenuOpen, setIsGuideMenuOpen] = useState(false);

  const activeCropGuide: GuideLineType = guideType === 'none' && isCropActive ? 'thirds' : guideType;
  const currentGuideOption = GUIDE_OPTIONS.find((g) => g.id === guideType);
  const activeCropOption = GUIDE_OPTIONS.find((g) => g.id === activeCropGuide);
  const maskDragRef = useRef<{
    maskId: string;
    part: MaskDragPart;
    geometry: AdjustmentMask['geometry'];
    startX: number;
    startY: number;
    lastPoint?: { x: number; y: number };
  } | null>(null);
  const retouchDragRef = useRef<{ spotId: string; part: RetouchDragPart } | null>(null);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    crop: { x: number; y: number; w: number; h: number };
  }>({ mouseX: 0, mouseY: 0, crop: { x: 0, y: 0, w: 1, h: 1 } });

  // Sync incoming cropRect when not actively dragging
  useEffect(() => {
    if (!activeCropHandle) {
      setLocalCrop(cropRect);
    }
  }, [cropRect, activeCropHandle]);

  useEffect(() => {
    setActiveCropAspect(aspectRatio);
  }, [aspectRatio]);

  useEffect(() => {
    const cancelColorSample = () => {
      colorSampleCallbackRef.current = null;
      setIsPickingColor(false);
      window.dispatchEvent(new Event('kurolight:color-sample-cancelled'));
    };
    const requestColorSample = (event: Event) => {
      const callback = (event as CustomEvent<{ onSample?: (color: string) => void }>).detail?.onSample;
      if (typeof callback !== 'function') return;
      colorSampleCallbackRef.current = callback;
      setIsPickingColor(true);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      if (event.key === 'Escape') {
        if (colorSampleCallbackRef.current) {
          cancelColorSample();
          return;
        }
        if (isGuideMenuOpen) {
          setIsGuideMenuOpen(false);
          return;
        }
        if (isCropActive) {
          onCancelCrop?.();
          return;
        }
      }
      if (event.key === 'Enter' && isCropActive) {
        event.preventDefault();
        onApplyCrop?.(localCrop);
        return;
      }
      if (event.key === 'o' || event.key === 'O') {
        if (!event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault();
          if (event.shiftKey) {
            setGuideOrientation((prev) => getNextOrientation(prev));
          } else {
            setGuideType((prev) => getNextGuideType(prev));
          }
        }
      }
    };
    window.addEventListener('kurolight:request-color-sample', requestColorSample);
    window.addEventListener('kurolight:cancel-color-sample', cancelColorSample);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('kurolight:request-color-sample', requestColorSample);
      window.removeEventListener('kurolight:cancel-color-sample', cancelColorSample);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCropActive, localCrop, onApplyCrop, onCancelCrop, isGuideMenuOpen]);

  // Observe container size dynamically for smooth real-time resizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const fitToView = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const iw = img.width;
    const ih = img.height;

    if (iw > 0 && ih > 0) {
      const s = Math.min((cw * 0.9) / iw, (ch * 0.9) / ih);
      setScale(s);
      setPan({ x: 0, y: 0 });
    }
  }, []);

  const hasFitRef = useRef(false);
  const lastAssetIdRef = useRef<string | undefined>(activeAssetId);
  const [imgTick, setImgTick] = useState(0);
  const [isImageLoading, setIsImageLoading] = useState<boolean>(!imageUrl && Boolean(activeAssetId));

  // When active photo changes, reset fit flag and IMMEDIATELY wipe old image so it never lingers
  useEffect(() => {
    if (activeAssetId && activeAssetId !== lastAssetIdRef.current) {
      lastAssetIdRef.current = activeAssetId;
      hasFitRef.current = false;
      setIsImageLoading(true);

      // 1. Wipe previous image immediately to prevent stale photo flash
      imgRef.current = null;
      beforeImgRef.current = null;
      setImgTick((t) => t + 1);

      // 2. Fast-path: Check thumbnail cache for instant zero-lag display
      const cachedThumb = thumbnailCache.get(activeAssetId);
      if (cachedThumb) {
        const thumbImg = new Image();
        thumbImg.onload = () => {
          if (lastAssetIdRef.current === activeAssetId && !imgRef.current) {
            imgRef.current = thumbImg;
            if (!hasFitRef.current) {
              hasFitRef.current = true;
              fitToView();
            }
            setImgTick((t) => t + 1);
          }
        };
        thumbImg.src = cachedThumb;
      } else {
        // Asynchronously fetch thumbnail as ultra-fast preview while high-res renders
        bridge
          .getThumbnail(activeAssetId)
          .then((thumbUrl) => {
            if (thumbUrl && lastAssetIdRef.current === activeAssetId && !imgRef.current) {
              const thumbImg = new Image();
              thumbImg.onload = () => {
                if (lastAssetIdRef.current === activeAssetId && !imgRef.current) {
                  imgRef.current = thumbImg;
                  if (!hasFitRef.current) {
                    hasFitRef.current = true;
                    fitToView();
                  }
                  setImgTick((t) => t + 1);
                }
              };
              thumbImg.src = thumbUrl;
            }
          })
          .catch(() => {});
      }
    }
  }, [activeAssetId, fitToView]);

  // Load preview image smoothly using img.decode() before swapping buffer
  useEffect(() => {
    if (!imageUrl) {
      return;
    }
    let cancelled = false;
    const img = new Image();

    const commitImage = () => {
      if (cancelled) return;
      imgRef.current = img;
      setIsImageLoading(false);
      if (!hasFitRef.current) {
        hasFitRef.current = true;
        fitToView();
      }
      setImgTick((t) => t + 1);
    };

    img.onload = () => {
      commitImage();
    };
    img.src = imageUrl;

    if (typeof img.decode === 'function') {
      img.decode().then(commitImage).catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [imageUrl, fitToView]);

  useEffect(() => {
    if (!beforeImageUrl) return;
    let cancelled = false;
    const img = new Image();

    const commitBefore = () => {
      if (cancelled) return;
      beforeImgRef.current = img;
      setImgTick((t) => t + 1);
    };

    img.onload = () => {
      commitBefore();
    };
    img.src = beforeImageUrl;

    if (typeof img.decode === 'function') {
      img.decode().then(commitBefore).catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [beforeImageUrl]);

  const actualPixels = () => {
    setScale(1.0);
    setPan({ x: 0, y: 0 });
  };

  // ── Helper: Normalized Aspect Ratio ──
  const getNormRatio = useCallback((aspectName: string) => {
    const img = imgRef.current;
    if (!img || img.width <= 0 || img.height <= 0) return null;
    let targetR: number | null = null;
    if (aspectName === 'Original') targetR = img.width / img.height;
    else if (aspectName === '1:1 Square') targetR = 1.0;
    else if (aspectName === '16:9 Landscape') targetR = 16.0 / 9.0;
    else if (aspectName === '4:3 Standard') targetR = 4.0 / 3.0;
    else if (aspectName === '3:2 Photo') targetR = 3.0 / 2.0;
    else if (aspectName === '9:16 Portrait') targetR = 9.0 / 16.0;
    else return null; // Free Form

    return targetR * (img.height / img.width);
  }, []);

  // ── Apply Aspect Ratio to Crop Rectangle ──
  const applyAspectToRect = useCallback((rect: { x: number; y: number; w: number; h: number }, aspectName: string) => {
    const normR = getNormRatio(aspectName);
    if (!normR) return rect;

    const centerX = rect.x + rect.w / 2;
    const centerY = rect.y + rect.h / 2;

    let newW = rect.w;
    let newH = rect.w / normR;

    if (newH > 1.0 || newH > rect.h) {
      newH = Math.min(1.0, rect.h);
      newW = newH * normR;
    }
    if (newW > 1.0) {
      newW = 1.0;
      newH = newW / normR;
    }

    const newX = Math.max(0, Math.min(1.0 - newW, centerX - newW / 2));
    const newY = Math.max(0, Math.min(1.0 - newH, centerY - newH / 2));

    return { x: newX, y: newY, w: newW, h: newH };
  }, [getNormRatio]);

  // ── Hit Testing for Crop Handles ──
  const getCropScreenBounds = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return null;
    const cw = canvas.width;
    const ch = canvas.height;
    const iw = img.width * scale;
    const ih = img.height * scale;
    const cx = (cw - iw) / 2 + pan.x;
    const cy = (ch - ih) / 2 + pan.y;

    const x = cx + localCrop.x * iw;
    const y = cy + localCrop.y * ih;
    const w = localCrop.w * iw;
    const h = localCrop.h * ih;

    return { x, y, w, h, cx, cy, iw, ih };
  }, [scale, pan, localCrop]);

  const getImageScreenBounds = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return null;
    const iw = img.width * scale;
    const ih = img.height * scale;
    return {
      x: (canvas.width - iw) / 2 + pan.x,
      y: (canvas.height - ih) / 2 + pan.y,
      w: iw,
      h: ih,
    };
  }, [scale, pan]);

  const mapLensPoint = useCallback((x: number, y: number, toCorrected: boolean) => {
    const width = Math.max(dimensions?.width ?? imgRef.current?.width ?? 1, 1);
    const height = Math.max(dimensions?.height ?? imgRef.current?.height ?? 1, 1);
    const imageScale = Math.max(width, height);
    const strength = (lensCorrection?.distortion ?? 0) / 100 * 0.5;
    const centerX = (width - 1) / 2;
    const centerY = (height - 1) / 2;
    let px = (x * Math.max(width - 1, 1) - centerX) / imageScale;
    let py = (y * Math.max(height - 1, 1) - centerY) / imageScale;

    if (toCorrected) {
      for (let iteration = 0; iteration < 8; iteration += 1) {
        const radiusSquared = px * px + py * py;
        const factor = 1 + strength * radiusSquared;
        if (Math.abs(factor) < 1e-6) break;
        const sourceX = (x * Math.max(width - 1, 1) - centerX) / imageScale;
        const sourceY = (y * Math.max(height - 1, 1) - centerY) / imageScale;
        px = sourceX / factor;
        py = sourceY / factor;
      }
    } else {
      const radiusSquared = px * px + py * py;
      const factor = 1 + strength * radiusSquared;
      px *= factor;
      py *= factor;
    }

    return {
      x: (px * imageScale + centerX) / Math.max(width - 1, 1),
      y: (py * imageScale + centerY) / Math.max(height - 1, 1),
    };
  }, [dimensions, lensCorrection?.distortion]);

  const mapPhotoPoint = useCallback((x: number, y: number) => {
    const lensMapped = mapLensPoint(x, y, true);
    const width = Math.max(dimensions?.width ?? imgRef.current?.naturalWidth ?? 1, 1);
    const height = Math.max(dimensions?.height ?? imgRef.current?.naturalHeight ?? 1, 1);
    let px = lensMapped.x * Math.max(width - 1, 1);
    let py = lensMapped.y * Math.max(height - 1, 1);
    if (geometry?.horizontal_flip) px = width - 1 - px;
    if (geometry?.vertical_flip) py = height - 1 - py;

    const angle = ((geometry?.rotation ?? 0) + (geometry?.straighten ?? 0)) * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rotatedWidth = Math.max(1, Math.ceil(height * Math.abs(sine) + width * Math.abs(cosine) - 1e-9));
    const rotatedHeight = Math.max(1, Math.ceil(height * Math.abs(cosine) + width * Math.abs(sine) - 1e-9));
    const dx = px - (width - 1) / 2;
    const dy = py - (height - 1) / 2;
    px = cosine * dx + sine * dy + (rotatedWidth - width) / 2;
    py = -sine * dx + cosine * dy + (rotatedHeight - height) / 2;

    const cropX = geometry?.crop_x ?? 0;
    const cropY = geometry?.crop_y ?? 0;
    const cropW = Math.max(geometry?.crop_width ?? 1, 1e-4);
    const cropH = Math.max(geometry?.crop_height ?? 1, 1e-4);
    const cropPixelX = Math.max(0, Math.min(Math.round(cropX * rotatedWidth), rotatedWidth - 1));
    const cropPixelY = Math.max(0, Math.min(Math.round(cropY * rotatedHeight), rotatedHeight - 1));
    const cropEndX = Math.max(cropPixelX + 1, Math.min(Math.round((cropX + cropW) * rotatedWidth), rotatedWidth));
    const cropEndY = Math.max(cropPixelY + 1, Math.min(Math.round((cropY + cropH) * rotatedHeight), rotatedHeight));
    return {
      x: (px - cropPixelX) / Math.max(cropEndX - cropPixelX, 1),
      y: (py - cropPixelY) / Math.max(cropEndY - cropPixelY, 1),
    };
  }, [dimensions, geometry, mapLensPoint]);

  const unmapPhotoPoint = useCallback((x: number, y: number) => {
    const width = Math.max(dimensions?.width ?? imgRef.current?.naturalWidth ?? 1, 1);
    const height = Math.max(dimensions?.height ?? imgRef.current?.naturalHeight ?? 1, 1);
    const angle = ((geometry?.rotation ?? 0) + (geometry?.straighten ?? 0)) * Math.PI / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rotatedWidth = Math.max(1, Math.ceil(height * Math.abs(sine) + width * Math.abs(cosine) - 1e-9));
    const rotatedHeight = Math.max(1, Math.ceil(height * Math.abs(cosine) + width * Math.abs(sine) - 1e-9));
    const cropX = geometry?.crop_x ?? 0;
    const cropY = geometry?.crop_y ?? 0;
    const cropW = Math.max(geometry?.crop_width ?? 1, 1e-4);
    const cropH = Math.max(geometry?.crop_height ?? 1, 1e-4);
    const cropPixelX = Math.max(0, Math.min(Math.round(cropX * rotatedWidth), rotatedWidth - 1));
    const cropPixelY = Math.max(0, Math.min(Math.round(cropY * rotatedHeight), rotatedHeight - 1));
    const cropEndX = Math.max(cropPixelX + 1, Math.min(Math.round((cropX + cropW) * rotatedWidth), rotatedWidth));
    const cropEndY = Math.max(cropPixelY + 1, Math.min(Math.round((cropY + cropH) * rotatedHeight), rotatedHeight));
    let px = x * (cropEndX - cropPixelX) + cropPixelX - (rotatedWidth - width) / 2;
    let py = y * (cropEndY - cropPixelY) + cropPixelY - (rotatedHeight - height) / 2;
    const dx = px - (width - 1) / 2;
    const dy = py - (height - 1) / 2;
    px = cosine * dx - sine * dy + (width - 1) / 2;
    py = sine * dx + cosine * dy + (height - 1) / 2;
    if (geometry?.horizontal_flip) px = width - 1 - px;
    if (geometry?.vertical_flip) py = height - 1 - py;
    const unflipped = {
      x: Math.max(0, Math.min(1, px / Math.max(width - 1, 1))),
      y: Math.max(0, Math.min(1, py / Math.max(height - 1, 1))),
    };
    return mapLensPoint(unflipped.x, unflipped.y, false);
  }, [dimensions, geometry, mapLensPoint]);

  const photoPointFromScreen = useCallback((x: number, y: number, clampToImage = false) => {
    const bounds = getImageScreenBounds();
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) return null;
    let displayed = {
      x: (x - bounds.x) / bounds.w,
      y: (y - bounds.y) / bounds.h,
    };
    if (clampToImage) {
      displayed = {
        x: Math.max(0, Math.min(1, displayed.x)),
        y: Math.max(0, Math.min(1, displayed.y)),
      };
    } else if (displayed.x < 0 || displayed.x > 1 || displayed.y < 0 || displayed.y > 1) {
      return null;
    }
    return unmapPhotoPoint(displayed.x, displayed.y);
  }, [getImageScreenBounds, unmapPhotoPoint]);

  const maskScreenPoint = useCallback((x: number, y: number) => {
    const bounds = getImageScreenBounds();
    if (!bounds) return null;
    const displayed = mapPhotoPoint(x, y);
    return {
      x: bounds.x + displayed.x * bounds.w,
      y: bounds.y + displayed.y * bounds.h,
    };
  }, [getImageScreenBounds, mapPhotoPoint]);

  const hitTestMask = useCallback((x: number, y: number): { mask: AdjustmentMask; part: MaskDragPart } | null => {
    const candidates = [...masks].sort((a, b) =>
      Number(b.id === selectedMaskId) - Number(a.id === selectedMaskId)
    );
    for (const mask of candidates) {
      if (!mask.enabled) continue;
      const value = (key: string, fallback: number) =>
        typeof mask.geometry[key] === 'number' ? mask.geometry[key] as number : fallback;
      if (mask.mask_type === 'radial') {
        const cx = value('cx', 0.5);
        const cy = value('cy', 0.5);
        const rx = value('rx', 0.3);
        const ry = value('ry', 0.3);
        const center = maskScreenPoint(cx, cy);
        const xHandle = maskScreenPoint(cx + rx, cy);
        const yHandle = maskScreenPoint(cx, cy + ry);
        if (center && Math.hypot(x - center.x, y - center.y) <= 12) return { mask, part: 'center' };
        if (xHandle && Math.hypot(x - xHandle.x, y - xHandle.y) <= 12) return { mask, part: 'radiusX' };
        if (yHandle && Math.hypot(x - yHandle.x, y - yHandle.y) <= 12) return { mask, part: 'radiusY' };
      } else if (mask.mask_type === 'linear') {
        const p1 = maskScreenPoint(value('x1', 0.5), value('y1', 0));
        const p2 = maskScreenPoint(value('x2', 0.5), value('y2', 1));
        if (!p1 || !p2) continue;
        if (Math.hypot(x - p1.x, y - p1.y) <= 12) return { mask, part: 'point1' };
        if (Math.hypot(x - p2.x, y - p2.y) <= 12) return { mask, part: 'point2' };
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lengthSq = dx * dx + dy * dy;
        const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lengthSq)) : 0;
        if (Math.hypot(x - (p1.x + t * dx), y - (p1.y + t * dy)) <= 8) return { mask, part: 'move' };
      }
    }
    return null;
  }, [masks, maskScreenPoint, selectedMaskId]);

  const hitTestRetouchSpot = useCallback((
    x: number,
    y: number
  ): { spot: RetouchSpot; part: RetouchDragPart } | null => {
    const candidates = [...retouchSpots].sort(
      (a, b) => Number(b.id === selectedRetouchSpotId) - Number(a.id === selectedRetouchSpotId)
    );
    for (const spot of candidates) {
      if (!spot.enabled) continue;
      const target = maskScreenPoint(spot.target_x, spot.target_y);
      const source = maskScreenPoint(spot.source_x, spot.source_y);
      if (target && Math.hypot(x - target.x, y - target.y) <= 11) {
        return { spot, part: 'target' };
      }
      if (source && Math.hypot(x - source.x, y - source.y) <= 11) {
        return { spot, part: 'source' };
      }
    }
    return null;
  }, [maskScreenPoint, retouchSpots, selectedRetouchSpotId]);

  const hitTestCrop = useCallback((mx: number, my: number): CropHandle => {
    const bounds = getCropScreenBounds();
    if (!bounds) return null;
    const { x, y, w, h } = bounds;

    const r = 14; // Handle hit radius px

    // Corners
    if (Math.hypot(mx - x, my - y) <= r) return 'tl';
    if (Math.hypot(mx - (x + w), my - y) <= r) return 'tr';
    if (Math.hypot(mx - x, my - (y + h)) <= r) return 'bl';
    if (Math.hypot(mx - (x + w), my - (y + h)) <= r) return 'br';

    // Edges
    if (Math.abs(my - y) <= 10 && mx >= x + r && mx <= x + w - r) return 't';
    if (Math.abs(my - (y + h)) <= 10 && mx >= x + r && mx <= x + w - r) return 'b';
    if (Math.abs(mx - x) <= 10 && my >= y + r && my <= y + h - r) return 'l';
    if (Math.abs(mx - (x + w)) <= 10 && my >= y + r && my <= y + h - r) return 'r';

    // Move Inside Body
    if (mx >= x && mx <= x + w && my >= y && my <= y + h) return 'move';

    return null;
  }, [getCropScreenBounds]);

  // ── Render Loop (Double-Buffered with Offscreen Canvas) ─────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const displayCtx = canvas.getContext('2d');
    if (!displayCtx) return;

    const targetW = Math.floor(container.clientWidth);
    const targetH = Math.floor(container.clientHeight);
    if (targetW <= 0 || targetH <= 0) return;

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    // Allocate / match offscreen buffer dimensions
    if (!bufferCanvasRef.current) {
      bufferCanvasRef.current = document.createElement('canvas');
    }
    const bufCanvas = bufferCanvasRef.current;
    if (bufCanvas.width !== targetW || bufCanvas.height !== targetH) {
      bufCanvas.width = targetW;
      bufCanvas.height = targetH;
    }
    const ctx = bufCanvas.getContext('2d');
    if (!ctx) return;

    const cw = bufCanvas.width;
    const ch = bufCanvas.height;
    ctx.clearRect(0, 0, cw, ch);

    // Deep Obsidian canvas background
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(0, 0, cw, ch);

    const activeImg = showOriginal && beforeImgRef.current ? beforeImgRef.current : imgRef.current;

    if (!activeImg) {
      ctx.fillStyle = '#4c535e';
      ctx.font = '12px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No image loaded', cw / 2, ch / 2);
      return;
    }

    const iw = activeImg.width * scale;
    const ih = activeImg.height * scale;
    const cx = (cw - iw) / 2 + pan.x;
    const cy = (ch - ih) / 2 + pan.y;

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, iw, ih);
    ctx.clip();
    if (!checkerPatternRef.current) {
      const tile = document.createElement('canvas');
      tile.width = 32;
      tile.height = 32;
      const tileContext = tile.getContext('2d');
      if (tileContext) {
        tileContext.fillStyle = '#30343b';
        tileContext.fillRect(0, 0, 16, 16);
        tileContext.fillRect(16, 16, 16, 16);
        tileContext.fillStyle = '#1c1f24';
        tileContext.fillRect(16, 0, 16, 16);
        tileContext.fillRect(0, 16, 16, 16);
        checkerPatternRef.current = ctx.createPattern(tile, 'repeat');
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, iw, ih);
    ctx.clip();
    ctx.fillStyle = checkerPatternRef.current ?? '#1c1f24';
    ctx.fillRect(cx, cy, iw, ih);
    ctx.restore();

    // Report visible viewport rectangle to navigator
    if (onViewportRectChange && iw > 0 && ih > 0) {
      const nx0 = Math.max(0, Math.min(1, -cx / iw));
      const ny0 = Math.max(0, Math.min(1, -cy / ih));
      const nx1 = Math.max(0, Math.min(1, (cw - cx) / iw));
      const ny1 = Math.max(0, Math.min(1, (ch - cy) / ih));
      onViewportRectChange({ x: nx0, y: ny0, w: Math.max(0.01, nx1 - nx0), h: Math.max(0.01, ny1 - ny0) });
    }

    // 1. Standard mode
    if (!isSplitView || !beforeImgRef.current) {
      ctx.drawImage(activeImg, cx, cy, iw, ih);
    } else {
      // 2. Before / After Split View
      const splitX = cw * splitRatio;

      // Left: Before
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, ch);
      ctx.clip();
      ctx.drawImage(beforeImgRef.current, cx, cy, iw, ih);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px font-bold sans-serif';
      ctx.fillText('BEFORE', 16, 28);
      ctx.restore();

      // Right: After
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, cw - splitX, ch);
      ctx.clip();
      ctx.drawImage(imgRef.current!, cx, cy, iw, ih);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px font-bold sans-serif';
      ctx.fillText('AFTER', splitX + 16, 28);
      ctx.restore();

      // Split line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(splitX, 0);
      ctx.lineTo(splitX, ch);
      ctx.stroke();
    }

    ctx.restore();

    // Composition Guide in normal preview mode (when not cropping)
    if (!isCropActive && guideType !== 'none') {
      drawCompositionGuide(
        ctx,
        { x: cx, y: cy, w: iw, h: ih },
        guideType,
        guideOrientation
      );
    }

    // 3. Interactive Crop Overlay
    if (isCropActive) {
      const cropX = cx + localCrop.x * iw;
      const cropY = cy + localCrop.y * ih;
      const cropW = localCrop.w * iw;
      const cropH = localCrop.h * ih;

      // Outer darkened mask
      ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
      ctx.fillRect(0, 0, cw, Math.max(0, cropY));
      ctx.fillRect(0, cropY + cropH, cw, Math.max(0, ch - (cropY + cropH)));
      ctx.fillRect(0, cropY, Math.max(0, cropX), cropH);
      ctx.fillRect(cropX + cropW, cropY, Math.max(0, cw - (cropX + cropW)), cropH);

      // Composition Guide lines inside crop rectangle
      drawCompositionGuide(
        ctx,
        { x: cropX, y: cropY, w: cropW, h: cropH },
        activeCropGuide,
        guideOrientation
      );

      // Outer crisp border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cropX, cropY, cropW, cropH);

      // 4 Corner L-Brackets (Lightroom / Photoshop styling)
      const bracketLen = Math.min(20, Math.min(cropW, cropH) / 3);
      const bracketThick = 3.5;
      ctx.fillStyle = '#ffffff';

      // Top-Left
      ctx.fillRect(cropX - 1, cropY - 1, bracketLen, bracketThick);
      ctx.fillRect(cropX - 1, cropY - 1, bracketThick, bracketLen);

      // Top-Right
      ctx.fillRect(cropX + cropW - bracketLen + 1, cropY - 1, bracketLen, bracketThick);
      ctx.fillRect(cropX + cropW - bracketThick + 1, cropY - 1, bracketThick, bracketLen);

      // Bottom-Left
      ctx.fillRect(cropX - 1, cropY + cropH - bracketThick + 1, bracketLen, bracketThick);
      ctx.fillRect(cropX - 1, cropY + cropH - bracketLen + 1, bracketThick, bracketLen);

      // Bottom-Right
      ctx.fillRect(cropX + cropW - bracketLen + 1, cropY + cropH - bracketThick + 1, bracketLen, bracketThick);
      ctx.fillRect(cropX + cropW - bracketThick + 1, cropY + cropH - bracketLen + 1, bracketThick, bracketLen);

      // 4 Edge Center Bars
      const barLen = Math.min(18, Math.min(cropW, cropH) / 4);
      // Top Edge
      ctx.fillRect(cropX + cropW / 2 - barLen / 2, cropY - 1, barLen, bracketThick);
      // Bottom Edge
      ctx.fillRect(cropX + cropW / 2 - barLen / 2, cropY + cropH - bracketThick + 1, barLen, bracketThick);
      // Left Edge
      ctx.fillRect(cropX - 1, cropY + cropH / 2 - barLen / 2, bracketThick, barLen);
      // Right Edge
      ctx.fillRect(cropX + cropW - bracketThick + 1, cropY + cropH / 2 - barLen / 2, bracketThick, barLen);

      // Live Pixel & Aspect Badge above Crop Box
      const origW = activeImg.naturalWidth || activeImg.width || 0;
      const origH = activeImg.naturalHeight || activeImg.height || 0;
      if (origW > 0 && origH > 0) {
        const pxW = Math.round(localCrop.w * origW);
        const pxH = Math.round(localCrop.h * origH);
        const badgeText = `${pxW} × ${pxH} px  •  ${activeCropAspect}`;

        ctx.font = 'bold 10px Segoe UI, sans-serif';
        const textWidth = ctx.measureText(badgeText).width;
        const badgeX = cropX + cropW / 2 - textWidth / 2 - 8;
        const badgeY = Math.max(16, cropY - 22);

        // Badge pill background
        ctx.fillStyle = 'rgba(15, 17, 21, 0.88)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, textWidth + 16, 18, 9);
        ctx.fill();
        ctx.stroke();

        // Badge text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(badgeText, cropX + cropW / 2, badgeY + 13);
      }
    }

    if (!isCropActive && !showOriginal && masks.length > 0) {
      const orderedMasks = [...masks].sort((a, b) =>
        Number(a.id === selectedMaskId) - Number(b.id === selectedMaskId)
      );
      orderedMasks.filter((mask) => mask.enabled).forEach((mask) => {
        const selected = mask.id === selectedMaskId;
        const value = (key: string, fallback: number) =>
          typeof mask.geometry[key] === 'number' ? mask.geometry[key] as number : fallback;
        ctx.save();
        ctx.strokeStyle = selected ? '#38bdf8' : 'rgba(255,255,255,0.68)';
        ctx.fillStyle = selected ? '#0ea5e9' : '#20252d';
        ctx.lineWidth = selected ? 2 : 1.25;
        ctx.shadowColor = selected ? 'rgba(14,165,233,0.85)' : 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = selected ? 9 : 4;

        const drawHandle = (point: { x: number; y: number }, label?: string) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (label) {
            ctx.shadowBlur = 0;
            ctx.font = 'bold 9px Segoe UI, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, point.x, point.y + 3);
          }
        };

        if (mask.mask_type === 'brush') {
          const strokes = Array.isArray(mask.geometry.strokes)
            ? mask.geometry.strokes as MaskStroke[]
            : [];
          const bounds = getImageScreenBounds();
          if (strokes.length > 0 && bounds) {
            const brushSize = typeof mask.geometry.brush_size === 'number'
              ? mask.geometry.brush_size
              : 0.04;
            ctx.beginPath();
            for (const stroke of strokes) {
              const point = maskScreenPoint(stroke.x, stroke.y);
              if (!point) continue;
              const radius = Math.max(1, (stroke.r ?? brushSize) * Math.min(bounds.w, bounds.h));
              ctx.moveTo(point.x + radius, point.y);
              ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
            }
            ctx.fillStyle = selected ? 'rgba(14,165,233,0.14)' : 'rgba(255,255,255,0.06)';
            ctx.fill();
            ctx.strokeStyle = selected ? 'rgba(56,189,248,0.72)' : 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 1;
            ctx.stroke();
            const first = maskScreenPoint(strokes[0].x, strokes[0].y);
            if (first) {
              ctx.shadowBlur = 0;
              ctx.font = '10px Segoe UI, sans-serif';
              ctx.textAlign = 'left';
              ctx.fillStyle = selected ? '#bae6fd' : '#ffffff';
              ctx.fillText(mask.name, first.x + 8, first.y - 8);
            }
          }
        } else if (mask.mask_type === 'radial') {
          const center = maskScreenPoint(value('cx', 0.5), value('cy', 0.5));
          const xEdge = maskScreenPoint(value('cx', 0.5) + value('rx', 0.3), value('cy', 0.5));
          const yEdge = maskScreenPoint(value('cx', 0.5), value('cy', 0.5) + value('ry', 0.3));
          if (center && xEdge && yEdge) {
            const axisX = { x: xEdge.x - center.x, y: xEdge.y - center.y };
            const axisY = { x: yEdge.x - center.x, y: yEdge.y - center.y };
            ctx.beginPath();
            ctx.ellipse(
              center.x,
              center.y,
              Math.max(2, Math.hypot(axisX.x, axisX.y)),
              Math.max(2, Math.hypot(axisY.x, axisY.y)),
              Math.atan2(axisX.y, axisX.x),
              0,
              Math.PI * 2
            );
            ctx.setLineDash(selected ? [] : [5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            drawHandle(center, 'M');
            drawHandle(xEdge, '↔');
            drawHandle(yEdge, '↕');
            ctx.shadowBlur = 0;
            ctx.font = '10px Segoe UI, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillStyle = selected ? '#bae6fd' : '#ffffff';
            ctx.fillText(mask.name, center.x + 10, center.y - 10);
          }
        } else if (mask.mask_type === 'linear') {
          const p1 = maskScreenPoint(value('x1', 0.5), value('y1', 0));
          const p2 = maskScreenPoint(value('x2', 0.5), value('y2', 1));
          if (p1 && p2) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.setLineDash(selected ? [6, 4] : [4, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
            drawHandle(p1, '1');
            drawHandle(p2, '2');
            ctx.shadowBlur = 0;
            ctx.font = '10px Segoe UI, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillStyle = selected ? '#bae6fd' : '#ffffff';
            ctx.fillText(mask.name, p1.x + 10, p1.y - 10);
          }
        }
        ctx.restore();
      });
    }

    if (!isCropActive && !showOriginal) {
      retouchSpots.filter((spot) => spot.enabled).forEach((spot) => {
        const selected = spot.id === selectedRetouchSpotId;
        const target = maskScreenPoint(spot.target_x, spot.target_y);
        const source = maskScreenPoint(spot.source_x, spot.source_y);
        if (!target || !source) return;

        ctx.save();
        ctx.strokeStyle = selected ? '#38bdf8' : 'rgba(255,255,255,0.78)';
        ctx.fillStyle = selected ? '#0ea5e9' : '#20252d';
        ctx.lineWidth = selected ? 2 : 1.25;
        ctx.shadowColor = selected ? 'rgba(14,165,233,0.85)' : 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = selected ? 8 : 4;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const drawPin = (point: { x: number; y: number }, label: string) => {
          ctx.fillStyle = selected ? '#0ea5e9' : '#20252d';
          ctx.beginPath();
          ctx.arc(point.x, point.y, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.font = 'bold 9px Segoe UI, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, point.x, point.y + 3);
        };
        drawPin(target, 'T');
        drawPin(source, 'S');

        const bounds = getImageScreenBounds();
        if (bounds) {
          const radius = Math.max(2, spot.radius * Math.min(bounds.w, bounds.h));
          ctx.beginPath();
          ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = selected ? 'rgba(56,189,248,0.7)' : 'rgba(255,255,255,0.42)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      });
    }

    // ── Atomic Blit from Offscreen Buffer to Display Canvas (Zero Flash / Tearing) ──
    displayCtx.drawImage(bufCanvas, 0, 0);
  }, [
    scale,
    pan,
    isSplitView,
    splitRatio,
    showOriginal,
    isCropActive,
    localCrop,
    activeCropAspect,
    containerSize,
    onViewportRectChange,
    imgTick,
    guideType,
    guideOrientation,
    activeCropGuide,
    masks,
    retouchSpots,
    selectedMaskId,
    selectedRetouchSpotId,
    maskScreenPoint,
    getImageScreenBounds,
  ]);

  // ── Native Non-Passive Wheel Listener for Smooth Zoom & No Webview Scaling ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onNativeWheel = (e: WheelEvent) => {
      // Always prevent browser/Chromium webview zoom
      e.preventDefault();

      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      setScale((prevScale) => {
        const nextScale = Math.max(0.02, Math.min(10.0, prevScale * factor));
        setPan((prevPan) => ({
          x: mx - (mx - prevPan.x) * (nextScale / prevScale),
          y: my - (my - prevPan.y) * (nextScale / prevScale),
        }));
        return nextScale;
      });
    };

    container.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', onNativeWheel);
    };
  }, []);

  const getPointerPosition = (e: React.PointerEvent) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    return bounds ? { x: e.clientX - bounds.left, y: e.clientY - bounds.top } : { x: 0, y: 0 };
  };

  const handleMouseDown = (e: React.PointerEvent) => {
    if (e.target !== canvasRef.current && e.target !== containerRef.current) return;
    const pointer = getPointerPosition(e);
    if (colorSampleCallbackRef.current) {
      const bounds = getImageScreenBounds();
      const canvas = canvasRef.current;
      if (!bounds || !canvas
        || pointer.x < bounds.x || pointer.x > bounds.x + bounds.w
        || pointer.y < bounds.y || pointer.y > bounds.y + bounds.h) return;

      const rect = canvas.getBoundingClientRect();
      const sampleX = Math.floor(pointer.x * canvas.width / rect.width);
      const sampleY = Math.floor(pointer.y * canvas.height / rect.height);
      const pixel = canvas.getContext('2d')?.getImageData(sampleX, sampleY, 1, 1).data;
      if (!pixel) return;

      const color = `#${[pixel[0], pixel[1], pixel[2]]
        .map((channel) => channel.toString(16).padStart(2, '0'))
        .join('')}`;
      const onSample = colorSampleCallbackRef.current;
      colorSampleCallbackRef.current = null;
      setIsPickingColor(false);
      onSample?.(color);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // 1. Split view divider drag
    if (isSplitView) {
      const cw = containerRef.current?.clientWidth || 1;
      const splitX = cw * splitRatio;
      if (Math.abs(pointer.x - splitX) < 12) {
        setIsDraggingSplit(true);
        return;
      }
    }

    // 2. Crop handle hit test
    if (isCropActive && e.button === 0) {
      const hit = hitTestCrop(pointer.x, pointer.y);
      if (hit) {
        setActiveCropHandle(hit);
        dragStartRef.current = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          crop: { ...localCrop },
        };
        return;
      }
    }

    if (!isCropActive && !showOriginal && e.button === 0) {
      const retouchHit = hitTestRetouchSpot(pointer.x, pointer.y);
      if (retouchHit) {
        onRetouchSpotSelect?.(retouchHit.spot.id);
        setActiveRetouchHandle(retouchHit.part);
        retouchDragRef.current = {
          spotId: retouchHit.spot.id,
          part: retouchHit.part,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      const hit = hitTestMask(pointer.x, pointer.y);
      if (hit) {
        const point = photoPointFromScreen(pointer.x, pointer.y);
        if (!point) return;
        onMaskSelect?.(hit.mask.id);
        setHoverMaskHandle(hit.part);
        setActiveMaskHandle(hit.part);
        maskDragRef.current = {
          maskId: hit.mask.id,
          part: hit.part,
          geometry: { ...hit.mask.geometry },
          startX: point.x,
          startY: point.y,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      const selectedBrush = masks.find(
        (mask) => mask.id === selectedMaskId && mask.mask_type === 'brush' && mask.enabled
      );
      if (selectedBrush && onMaskGeometryChange) {
        const point = photoPointFromScreen(pointer.x, pointer.y);
        if (point) {
          const geometry = { ...selectedBrush.geometry };
          const strokes = Array.isArray(geometry.strokes)
            ? [...geometry.strokes as MaskStroke[]]
            : [];
          const radius = typeof geometry.brush_size === 'number' ? geometry.brush_size : 0.04;
          strokes.push({ ...point, r: radius, o: 1 });
          geometry.strokes = strokes;
          onMaskSelect?.(selectedBrush.id);
          setActiveMaskHandle('brush');
          maskDragRef.current = {
            maskId: selectedBrush.id,
            part: 'brush',
            geometry,
            startX: point.x,
            startY: point.y,
            lastPoint: point,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          onMaskGeometryChange(selectedBrush.id, geometry);
          e.preventDefault();
          return;
        }
      }
    }

    // 3. Viewport panning
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.PointerEvent) => {
    const pointer = getPointerPosition(e);
    // 1. Drag split bar
    if (isDraggingSplit && containerRef.current) {
      const cw = containerRef.current.clientWidth;
      const r = Math.max(0.05, Math.min(0.95, pointer.x / cw));
      setSplitRatio(r);
      return;
    }

    const maskDrag = maskDragRef.current;
    if (maskDrag && onMaskGeometryChange) {
      const point = photoPointFromScreen(pointer.x, pointer.y, true);
      if (point) {
        const initial = maskDrag.geometry;
        if (maskDrag.part === 'brush') {
          const strokes = Array.isArray(initial.strokes)
            ? [...initial.strokes as MaskStroke[]]
            : [];
          const lastPoint = maskDrag.lastPoint ?? point;
          const width = Math.max(dimensions?.width ?? imgRef.current?.width ?? 1, 1);
          const height = Math.max(dimensions?.height ?? imgRef.current?.height ?? 1, 1);
          const minDimension = Math.min(width, height);
          const brushSize = typeof initial.brush_size === 'number' ? initial.brush_size : 0.04;
          const radius = Math.max(1, brushSize * minDimension);
          const distance = Math.hypot((point.x - lastPoint.x) * width, (point.y - lastPoint.y) * height);
          const steps = Math.max(1, Math.ceil(distance / Math.max(radius * 0.4, 1)));
          for (let step = 1; step <= steps; step += 1) {
            const t = step / steps;
            strokes.push({
              x: lastPoint.x + (point.x - lastPoint.x) * t,
              y: lastPoint.y + (point.y - lastPoint.y) * t,
              r: brushSize,
              o: 1,
            });
          }
          const next = { ...initial, strokes };
          maskDrag.geometry = next;
          maskDrag.lastPoint = point;
          onMaskGeometryChange(maskDrag.maskId, next);
          return;
        }
        const value = (key: string, fallback: number) =>
          typeof initial[key] === 'number' ? initial[key] as number : fallback;
        const bounded = (coordinate: number) => Math.max(0, Math.min(1, coordinate));
        const next = { ...initial };
        if (maskDrag.part === 'point1') {
          next.x1 = point.x;
          next.y1 = point.y;
        } else if (maskDrag.part === 'point2') {
          next.x2 = point.x;
          next.y2 = point.y;
        } else if (maskDrag.part === 'move') {
          const dx = point.x - maskDrag.startX;
          const dy = point.y - maskDrag.startY;
          next.x1 = bounded(value('x1', 0.5) + dx);
          next.y1 = bounded(value('y1', 0) + dy);
          next.x2 = bounded(value('x2', 0.5) + dx);
          next.y2 = bounded(value('y2', 1) + dy);
        } else if (maskDrag.part === 'center') {
          next.cx = point.x;
          next.cy = point.y;
        } else if (maskDrag.part === 'radiusX') {
          next.rx = Math.max(0.02, Math.min(1, Math.abs(point.x - value('cx', 0.5))));
        } else if (maskDrag.part === 'radiusY') {
          next.ry = Math.max(0.02, Math.min(1, Math.abs(point.y - value('cy', 0.5))));
        }
        onMaskGeometryChange(maskDrag.maskId, next);
      }
      return;
    }

    const retouchDrag = retouchDragRef.current;
    if (retouchDrag && onRetouchSpotChange) {
      const point = photoPointFromScreen(pointer.x, pointer.y, true);
      if (point) {
        onRetouchSpotChange(
          retouchDrag.spotId,
          retouchDrag.part === 'target'
            ? { target_x: point.x, target_y: point.y }
            : { source_x: point.x, source_y: point.y }
        );
      }
      return;
    }

    // 2. Drag active crop handle or move crop box
    if (isCropActive && activeCropHandle && imgRef.current) {
      const bounds = getCropScreenBounds();
      if (!bounds) return;
      const { cx, cy, iw, ih } = bounds;
      const startCrop = dragStartRef.current.crop;

      if (activeCropHandle === 'move') {
        const dx = (e.clientX - dragStartRef.current.mouseX) / iw;
        const dy = (e.clientY - dragStartRef.current.mouseY) / ih;
        const newX = Math.max(0, Math.min(1.0 - startCrop.w, startCrop.x + dx));
        const newY = Math.max(0, Math.min(1.0 - startCrop.h, startCrop.y + dy));
        const updated = { x: newX, y: newY, w: startCrop.w, h: startCrop.h };
        setLocalCrop(updated);
        onCropChange?.(updated);
        return;
      }

      // Handle corner and edge resizing
      const normX = Math.max(0, Math.min(1, (pointer.x - cx) / iw));
      const normY = Math.max(0, Math.min(1, (pointer.y - cy) / ih));

      let x0 = startCrop.x;
      let y0 = startCrop.y;
      let x1 = startCrop.x + startCrop.w;
      let y1 = startCrop.y + startCrop.h;

      const normR = getNormRatio(activeCropAspect);

      if (activeCropHandle === 'br') {
        let newW = Math.max(0.04, normX - x0);
        let newH = normR ? newW / normR : Math.max(0.04, normY - y0);
        if (x0 + newW > 1.0) {
          newW = 1.0 - x0;
          if (normR) newH = newW / normR;
        }
        if (y0 + newH > 1.0) {
          newH = 1.0 - y0;
          if (normR) newW = newH * normR;
        }
        x1 = x0 + newW;
        y1 = y0 + newH;
      } else if (activeCropHandle === 'tl') {
        let newW = Math.max(0.04, x1 - normX);
        let newH = normR ? newW / normR : Math.max(0.04, y1 - normY);
        if (x1 - newW < 0.0) {
          newW = x1;
          if (normR) newH = newW / normR;
        }
        if (y1 - newH < 0.0) {
          newH = y1;
          if (normR) newW = newH * normR;
        }
        x0 = x1 - newW;
        y0 = y1 - newH;
      } else if (activeCropHandle === 'tr') {
        let newW = Math.max(0.04, normX - x0);
        let newH = normR ? newW / normR : Math.max(0.04, y1 - normY);
        if (x0 + newW > 1.0) {
          newW = 1.0 - x0;
          if (normR) newH = newW / normR;
        }
        if (y1 - newH < 0.0) {
          newH = y1;
          if (normR) newW = newH * normR;
        }
        x1 = x0 + newW;
        y0 = y1 - newH;
      } else if (activeCropHandle === 'bl') {
        let newW = Math.max(0.04, x1 - normX);
        let newH = normR ? newW / normR : Math.max(0.04, normY - y0);
        if (x1 - newW < 0.0) {
          newW = x1;
          if (normR) newH = newW / normR;
        }
        if (y0 + newH > 1.0) {
          newH = 1.0 - y0;
          if (normR) newW = newH * normR;
        }
        x0 = x1 - newW;
        y1 = y0 + newH;
      } else if (activeCropHandle === 't') {
        y0 = Math.min(normY, y1 - 0.04);
        if (normR) {
          const newH = y1 - y0;
          const newW = Math.min(1.0, newH * normR);
          const midX = (x0 + x1) / 2;
          x0 = Math.max(0, midX - newW / 2);
          x1 = Math.min(1.0, x0 + newW);
        }
      } else if (activeCropHandle === 'b') {
        y1 = Math.max(normY, y0 + 0.04);
        if (normR) {
          const newH = y1 - y0;
          const newW = Math.min(1.0, newH * normR);
          const midX = (x0 + x1) / 2;
          x0 = Math.max(0, midX - newW / 2);
          x1 = Math.min(1.0, x0 + newW);
        }
      } else if (activeCropHandle === 'l') {
        x0 = Math.min(normX, x1 - 0.04);
        if (normR) {
          const newW = x1 - x0;
          const newH = Math.min(1.0, newW / normR);
          const midY = (y0 + y1) / 2;
          y0 = Math.max(0, midY - newH / 2);
          y1 = Math.min(1.0, y0 + newH);
        }
      } else if (activeCropHandle === 'r') {
        x1 = Math.max(normX, x0 + 0.04);
        if (normR) {
          const newW = x1 - x0;
          const newH = Math.min(1.0, newW / normR);
          const midY = (y0 + y1) / 2;
          y0 = Math.max(0, midY - newH / 2);
          y1 = Math.min(1.0, y0 + newH);
        }
      }

      const updated = { x: x0, y: y0, w: Math.max(0.04, x1 - x0), h: Math.max(0.04, y1 - y0) };
      setLocalCrop(updated);
      onCropChange?.(updated);
      return;
    }

    // 3. Hover state for cursor when in crop mode
    if (isCropActive && !isPanning) {
      const hit = hitTestCrop(pointer.x, pointer.y);
      setHoverCropHandle(hit);
    }

    if (!isCropActive && !showOriginal && !isPanning) {
      const retouchHit = hitTestRetouchSpot(pointer.x, pointer.y);
      setHoverRetouchHandle(retouchHit?.part ?? null);
      const brushSelected = masks.some(
        (mask) => mask.id === selectedMaskId && mask.mask_type === 'brush' && mask.enabled
      );
      setHoverMaskHandle(retouchHit ? null : brushSelected ? 'brush' : hitTestMask(pointer.x, pointer.y)?.part ?? null);
    }

    // 4. Viewport Panning
    if (isPanning) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setPan({ x: pan.x + dx, y: pan.y + dy });
      setLastMouse({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsDraggingSplit(false);
    setActiveCropHandle(null);
    setActiveMaskHandle(null);
    maskDragRef.current = null;
    setActiveRetouchHandle(null);
    retouchDragRef.current = null;
  };

  // ── Double-Click Inside Crop Box to Apply ──
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isCropActive) {
      const hit = hitTestCrop(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      if (hit === 'move' || hit === 'tl' || hit === 'br' || hit === 'tr' || hit === 'bl') {
        handleApplyCrop();
      }
    }
  };

  // ── Crop HUD Action Handlers ──
  const handleAspectChange = (newAspect: string) => {
    setActiveCropAspect(newAspect);
    if (onSelectAspectRatio) onSelectAspectRatio(newAspect);
    const updated = applyAspectToRect(localCrop, newAspect);
    setLocalCrop(updated);
    onCropChange?.(updated);
  };

  const handleResetCrop = () => {
    const full = { x: 0, y: 0, w: 1, h: 1 };
    setLocalCrop(full);
    onResetCrop?.();
  };

  const handleApplyCrop = () => {
    onApplyCrop?.(localCrop);
  };

  const handleCancelCrop = () => {
    onCancelCrop?.();
  };

  // ── Dynamic Canvas Cursor ──
  const getCanvasCursor = () => {
    if (isPickingColor) return 'cursor-crosshair';
    if (isPanning) return 'cursor-grabbing';
    if (activeRetouchHandle || hoverRetouchHandle) return 'cursor-move';
    if (activeMaskHandle === 'brush' || hoverMaskHandle === 'brush') return 'cursor-crosshair';
    if (activeMaskHandle || hoverMaskHandle) return 'cursor-move';
    if (!isCropActive) return 'cursor-grab';

    const h = activeCropHandle || hoverCropHandle;
    if (h === 'tl' || h === 'br') return 'cursor-nwse-resize';
    if (h === 'tr' || h === 'bl') return 'cursor-nesw-resize';
    if (h === 't' || h === 'b') return 'cursor-ns-resize';
    if (h === 'l' || h === 'r') return 'cursor-ew-resize';
    if (h === 'move') return 'cursor-move';
    return 'cursor-default';
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handleMouseDown}
      onPointerMove={handleMouseMove}
      onPointerUp={handleMouseUp}
      onPointerCancel={handleMouseUp}
      onLostPointerCapture={handleMouseUp}
      onPointerLeave={() => {
        if (!maskDragRef.current && !retouchDragRef.current) handleMouseUp();
      }}
      onDoubleClick={handleDoubleClick}
      className={`flex-1 h-full relative bg-obsidian-deep overflow-hidden select-none ${getCanvasCursor()}`}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* ── Viewport Skeleton Loading ── */}
      {isImageLoading && activeAssetId && !imgRef.current && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 pointer-events-none bg-obsidian-deep/80 backdrop-blur-[2px] transition-opacity duration-200">
          <div
            className="relative overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-card shadow-2xl flex flex-col items-center justify-center"
            style={{
              width: dimensions?.width && dimensions?.height
                ? `min(76vw, ${Math.max(340, Math.min(880, (dimensions.width / dimensions.height) * 520))}px)`
                : 'min(76vw, 700px)',
              aspectRatio: dimensions?.width && dimensions?.height
                ? `${dimensions.width} / ${dimensions.height}`
                : '16 / 10',
              maxHeight: '72vh',
            }}
          >
            {/* Shimmer sweep animation */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent animate-shimmer" />

            {/* Inner silhouette and text */}
            <div className="relative flex flex-col items-center gap-3.5 text-obsidian-textMut/40">
              <div className="p-4 rounded-2xl bg-obsidian-elevated/40 border border-white/[0.04]">
                <svg
                  className="w-10 h-10 stroke-current"
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth="1.2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="3" ry="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-obsidian-accent animate-pulse" />
                <span className="text-xs font-medium tracking-wide text-obsidian-textMut/70">
                  Rendering photo preview…
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mini indicator when displaying instant preview while high-res renders in background */}
      {isImageLoading && activeAssetId && Boolean(imgRef.current) && (
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-obsidian-panel/80 backdrop-blur border border-obsidian-border text-[11px] text-obsidian-textSec shadow-lg pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-obsidian-accent animate-pulse" />
          <span>Enhancing resolution…</span>
        </div>
      )}

      <div className="app-surface absolute right-4 top-4 z-20 flex items-center space-x-1 rounded-xl p-1.5">
        {/* Crop Tool Quick Toggle Button */}
        {onToggleCrop && (
          <button
            onClick={onToggleCrop}
            title={isCropActive ? 'Finish Crop Mode' : 'Open Crop Tool (C)'}
            className={`p-1.5 rounded transition-all flex items-center gap-1 ${
              isCropActive
                ? 'app-accent text-white'
                    : 'app-control border-transparent text-obsidian-textSec hover:text-white'
            }`}
          >
            <Crop className="w-3.5 h-3.5" />
            <span className="hidden text-[10px] font-bold pr-0.5 xl:inline">{isCropActive ? 'Done Crop' : 'Crop'}</span>
          </button>
        )}

        <div className="w-px h-4 bg-obsidian-border mx-0.5" />

        <button
          onClick={() => setIsSplitView(!isSplitView)}
          title="Split View (Before / After)"
          className={`app-control rounded-lg p-1.5 ${
            isSplitView ? 'app-accent text-white' : 'border-transparent text-obsidian-textSec hover:text-white'
          }`}
        >
          <Columns className="w-3.5 h-3.5" />
        </button>

        <button
          onMouseDown={() => setShowOriginal(true)}
          onMouseUp={() => setShowOriginal(false)}
          onMouseLeave={() => setShowOriginal(false)}
          title="Hold to View Original Unedited"
          className={`app-control rounded-lg p-1.5 ${
            showOriginal ? 'app-accent text-white' : 'border-transparent text-obsidian-textSec hover:text-white'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-obsidian-border mx-0.5" />

        <button
          onClick={fitToView}
          title="Fit Image to Window"
          className="app-control rounded-lg border-transparent p-1.5 text-obsidian-textSec hover:text-white"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={actualPixels}
          title="1:1 Actual Pixels (100%)"
          className="app-control rounded-lg border-transparent px-2 py-1 text-[10px] font-bold text-obsidian-textSec hover:text-white"
        >
          1:1
        </button>

        <div className="w-px h-4 bg-obsidian-border mx-0.5" />

        {/* Composition Guides Quick Cycle & Selector */}
        <div className="relative flex items-center">
          <button
            onClick={() => setGuideType((prev) => getNextGuideType(prev))}
            title={`Composition Guide: ${currentGuideOption?.label ?? 'None'} (Click to cycle [O])`}
            className={`app-control rounded-l-lg p-1.5 flex items-center gap-1 ${
              guideType !== 'none'
                ? 'app-accent text-white'
                : 'border-transparent text-obsidian-textSec hover:text-white'
            }`}
          >
            <Grid3x3 className="w-3.5 h-3.5" />
            {guideType !== 'none' && (
              <span className="hidden text-[10px] font-bold xl:inline pr-0.5">
                {currentGuideOption?.shortLabel}
              </span>
            )}
          </button>
          <button
            onClick={() => setIsGuideMenuOpen((prev) => !prev)}
            title="Choose Composition Guide Overlay"
            className={`app-control rounded-r-lg px-1 py-1.5 border-l border-obsidian-border/40 ${
              guideType !== 'none'
                ? 'app-accent text-white'
                : 'border-transparent text-obsidian-textSec hover:text-white'
            }`}
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* Orientation Flip Button for Golden Spiral & Triangles */}
        {guideType !== 'none' && currentGuideOption?.hasOrientation && (
          <button
            onClick={() => setGuideOrientation((prev) => getNextOrientation(prev))}
            title={`Flip / Rotate Guide Orientation (Shift + O, current: #${guideOrientation + 1})`}
            className="app-control rounded-lg p-1.5 border-transparent text-obsidian-textSec hover:text-white"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="w-px h-4 bg-obsidian-border mx-0.5" />

        <button
          onClick={onToggleFilmstrip}
          title="Toggle Bottom Filmstrip (\\)"
          className={`app-control rounded-lg p-1.5 ${
            isFilmstripVisible ? 'app-accent text-white' : 'border-transparent text-obsidian-textSec hover:text-white'
          }`}
        >
          <Film className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Composition Guides Dropdown Menu ── */}
      {isGuideMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsGuideMenuOpen(false)}
          />
          <div className="app-surface absolute right-4 top-16 z-40 w-64 rounded-xl p-2 shadow-2xl border border-obsidian-border text-xs animate-fadeIn">
            <div className="px-2 py-1 text-[11px] font-semibold text-obsidian-textMuted uppercase tracking-wider flex items-center justify-between">
              <span>Composition Guides</span>
              <span className="text-[10px] text-obsidian-textMuted font-mono">Key: O</span>
            </div>
            <div className="my-1 h-px bg-obsidian-border" />
            <div className="flex flex-col gap-0.5">
              {GUIDE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setGuideType(opt.id);
                    setIsGuideMenuOpen(false);
                  }}
                  className={`flex flex-col text-left px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    guideType === opt.id
                      ? 'bg-obsidian-accent text-white'
                      : 'text-obsidian-textSec hover:bg-obsidian-card hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between font-medium">
                    <span>{opt.label}</span>
                    {guideType === opt.id && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <span
                    className={`text-[10px] line-clamp-1 ${
                      guideType === opt.id ? 'text-white/80' : 'text-obsidian-textMuted'
                    }`}
                  >
                    {opt.description}
                  </span>
                </button>
              ))}
            </div>
            {currentGuideOption?.hasOrientation && (
              <>
                <div className="my-1.5 h-px bg-obsidian-border" />
                <button
                  onClick={() => setGuideOrientation((prev) => getNextOrientation(prev))}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-obsidian-textSec hover:bg-obsidian-card hover:text-white transition-colors text-left cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3" />
                    <span>Flip Orientation (Shift+O)</span>
                  </span>
                  <span className="text-[10px] text-obsidian-textMuted font-mono">
                    #{guideOrientation + 1}/4
                  </span>
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* ── Floating Crop HUD / Action Bar (Shown when Crop Tool is active) ── */}
      {isCropActive && (
        <div className="app-surface absolute bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 select-none animate-fadeIn">
          {/* Aspect Ratio Selector */}
          <div className="flex items-center gap-1.5 text-xs text-obsidian-textSec font-medium">
            <span>Aspect:</span>
            <select
              value={activeCropAspect}
              onChange={(e) => handleAspectChange(e.target.value)}
              className="bg-obsidian-card text-white border border-obsidian-border rounded px-2 py-1 text-xs outline-none cursor-pointer focus:border-obsidian-accent font-semibold"
            >
              <option value="Original">Original</option>
              <option value="Free Form">Free Form</option>
              <option value="1:1 Square">1:1 Square</option>
              <option value="16:9 Landscape">16:9 Landscape</option>
              <option value="4:3 Standard">4:3 Standard</option>
              <option value="3:2 Photo">3:2 Photo</option>
              <option value="9:16 Portrait">9:16 Portrait</option>
            </select>
          </div>

          <div className="w-px h-5 bg-obsidian-border" />

          {/* Composition Guide Selector */}
          <div className="flex items-center gap-1.5 text-xs text-obsidian-textSec font-medium">
            <span>Guide:</span>
            <select
              value={activeCropGuide}
              onChange={(e) => setGuideType(e.target.value as GuideLineType)}
              className="bg-obsidian-card text-white border border-obsidian-border rounded px-2 py-1 text-xs outline-none cursor-pointer focus:border-obsidian-accent font-semibold"
              title="Composition Overlay (press O to cycle)"
            >
              {GUIDE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            {activeCropOption?.hasOrientation && (
              <button
                onClick={() => setGuideOrientation((prev) => getNextOrientation(prev))}
                className="p-1 rounded bg-obsidian-card hover:bg-obsidian-hover text-obsidian-textSec hover:text-white border border-obsidian-border text-xs transition-colors cursor-pointer"
                title="Flip Guide Orientation (Shift + O)"
              >
                <RefreshCw size={12} />
              </button>
            )}
          </div>

          <div className="w-px h-5 bg-obsidian-border" />

          {/* Reset Crop to Full Frame */}
          <button
            onClick={handleResetCrop}
            className="px-2.5 py-1 rounded bg-obsidian-card hover:bg-obsidian-hover text-obsidian-textSec hover:text-white border border-obsidian-border text-xs flex items-center gap-1.5 transition-colors font-medium"
            title="Reset to 100% Full Photo"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>

          {/* Cancel Crop */}
          <button
            onClick={handleCancelCrop}
            className="px-2.5 py-1 rounded bg-obsidian-card hover:bg-obsidian-hover text-obsidian-textSec hover:text-red-400 border border-obsidian-border text-xs flex items-center gap-1.5 transition-colors font-medium"
            title="Cancel Crop and Discard Changes (Esc)"
          >
            <X size={13} />
            <span>Cancel</span>
          </button>

          {/* Apply / Done Crop */}
          <button
            onClick={handleApplyCrop}
            className="px-3.5 py-1 rounded-md bg-obsidian-accent hover:bg-blue-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
            title="Apply Crop and Finish (Enter or Double-Click)"
          >
            <Check size={14} />
            <span>Done</span>
          </button>
        </div>
      )}

      {/* ── Bottom Floating Zoom Bar ── */}
      {!isCropActive && (
        <div className="app-surface absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center space-x-2 rounded-full px-3 py-2">
          <button
            onClick={() => setScale(Math.max(0.05, scale * 0.8))}
            className="text-obsidian-textMut hover:text-white transition-colors"
          >
            <ZoomOut className="w-3 h-3" />
          </button>

          <input
            type="range"
            min={5}
            max={500}
            value={Math.round(scale * 100)}
            onChange={(e) => setScale(parseFloat(e.target.value) / 100)}
            className="h-1 w-16 rounded bg-obsidian-hover sm:w-24"
          />

          <button
            onClick={() => setScale(Math.min(10.0, scale * 1.25))}
            className="text-obsidian-textMut hover:text-white transition-colors"
          >
            <ZoomIn className="w-3 h-3" />
          </button>

          <span
            onClick={fitToView}
            title="Click to reset to Fit"
            className="text-[10px] font-mono font-bold text-obsidian-textPri cursor-pointer hover:text-obsidian-accent ml-1 min-w-[36px]"
          >
            {Math.round(scale * 100)}%
          </span>

          {dimensions?.width && dimensions?.height && (
            <>
              <div className="w-px h-3 bg-obsidian-border mx-1" />
              <span className="text-[10px] text-obsidian-textMut">
                {dimensions.width}×{dimensions.height}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
