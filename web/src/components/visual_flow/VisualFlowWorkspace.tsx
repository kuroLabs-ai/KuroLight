import React, { useState, useRef, useEffect, useMemo } from 'react';
import { EditState, ImageAsset, Preset } from '../../types';
import {
  Share2,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Undo2,
  Redo2,
  Save,
  Power,
  Plus,
  Trash2,
  RotateCw,
  Star,
  KeyRound,
  Maximize2,
  CheckCircle2,
  Circle,
  Search,
} from 'lucide-react';
import { bridge } from '../../bridge';
import { ColorPickerInput } from '../common/ColorPickerInput';
import { GalleryThumbnail } from '../gallery/GalleryThumbnail';

interface VisualFlowWorkspaceProps {
  imageUrl?: string;
  beforeImageUrl?: string;
  activeAsset?: ImageAsset | null;
  editState: EditState;
  onChange: (newState: EditState) => void;
  historyList: string[];
  activeHistoryIndex: number;
  presets: Preset[];
  histogram?: { r: number[]; g: number[]; b: number[]; lum: number[] };
}

interface FlowNode {
  id: string;
  title: string;
  category: 'input' | 'tone' | 'color' | 'detail' | 'grading' | 'curves' | 'hsl' | 'geometry' | 'dehaze' | 'vignette' | 'background_removal' | 'crop' | 'output';
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
  accent: string;
}

type FlowEffectCategory = Extract<
  FlowNode['category'],
  'tone' | 'color' | 'detail' | 'grading' | 'curves' | 'hsl' | 'geometry' | 'dehaze' | 'vignette' | 'background_removal'
>;

const FLOW_NODE_OPTIONS: Array<{
  category: FlowEffectCategory;
  title: string;
  accent: string;
}> = [
  { category: 'tone', title: 'Exposure & Tone', accent: '#F59E0B' },
  { category: 'color', title: 'White Balance', accent: '#EC4899' },
  { category: 'hsl', title: 'HSL Mixer', accent: '#F97316' },
  { category: 'grading', title: 'Color Grading', accent: '#8B5CF6' },
  { category: 'curves', title: 'Tone Curves', accent: '#06B6D4' },
  { category: 'detail', title: 'Detail & Clarity', accent: '#10B981' },
  { category: 'geometry', title: 'Geometry', accent: '#6366F1' },
  { category: 'dehaze', title: 'Dehaze', accent: '#22C55E' },
  { category: 'vignette', title: 'Vignette', accent: '#A855F7' },
  { category: 'background_removal', title: 'Chroma Key', accent: '#F43F5E' },
];

const FLOW_PROCESS_ORDER: FlowNode['category'][] = [
  'input',
  'tone',
  'color',
  'hsl',
  'curves',
  'grading',
  'detail',
  'dehaze',
  'vignette',
  'geometry',
  'background_removal',
  'output',
];

interface FlowLayout {
  id: string;
  name: string;
  nodes: Array<Pick<FlowNode, 'id' | 'x' | 'y'>>;
}

interface VignetteSettings {
  enabled: boolean;
  amount: number;
  midpoint: number;
  feather: number;
}

interface BackgroundRemovalSettings {
  enabled: boolean;
  color: string;
  tolerance: number;
  feather: number;
}

const readSettings = <T extends object>(value: unknown, defaults: T): T => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return defaults;
  return { ...defaults, ...(value as Partial<T>) };
};

export const VisualFlowWorkspace: React.FC<VisualFlowWorkspaceProps> = ({
  imageUrl,
  beforeImageUrl,
  activeAsset,
  editState,
  onChange,
  historyList,
  activeHistoryIndex,
  presets,
}) => {
  // ── Canvas Navigation State ──
  const [pan, setPan] = useState({ x: 80, y: 100 });
  const [zoom, setZoom] = useState(0.95);
  const [isPanning, setIsPanning] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string>('tone');
  const [newNodeCategory, setNewNodeCategory] = useState<FlowEffectCategory | ''>('');
  const [selectedHslBand, setSelectedHslBand] = useState('red');
  const [selectedCurveChannel, setSelectedCurveChannel] = useState<
    'rgb_points' | 'red_points' | 'green_points' | 'blue_points'
  >('rgb_points');
  const [draggingCurvePoint, setDraggingCurvePoint] = useState<number | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [layouts, setLayouts] = useState<FlowLayout[]>(() => {
    try {
      const saved = window.localStorage.getItem('kurolight_flow_layouts');
      if (!saved) return [];
      const parsed: unknown = JSON.parse(saved);
      return Array.isArray(parsed) ? (parsed as FlowLayout[]) : [];
    } catch (error) {
      console.error('Could not load Visual Flow layouts', error);
      return [];
    }
  });
  const [selectedLayoutId, setSelectedLayoutId] = useState('');

  // Dragging individual node
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [nodeSearch, setNodeSearch] = useState('');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const flowNodeSettings = editState.custom_metadata?.flow_nodes;
  const vignette = readSettings<VignetteSettings>(
    editState.custom_metadata?.vignette,
    { enabled: false, amount: 0, midpoint: 0.5, feather: 0.5 }
  );
  const backgroundRemoval = readSettings<BackgroundRemovalSettings>(
    editState.custom_metadata?.background_removal,
    { enabled: false, color: '#00ff00', tolerance: 0.18, feather: 0.08 }
  );
  const flowNodeEnabled = useMemo(
    () => {
      if (typeof flowNodeSettings !== 'object' || flowNodeSettings === null) return {};
      return Object.entries(flowNodeSettings).reduce<Record<string, boolean>>(
        (enabled, [nodeId, value]) => {
          if (typeof value === 'boolean') enabled[nodeId] = value;
          return enabled;
        },
        {}
      );
    },
    [flowNodeSettings]
  );

  useEffect(() => {
    try {
      window.localStorage.setItem('kurolight_flow_layouts', JSON.stringify(layouts));
    } catch (error) {
      console.error('Could not save Visual Flow layouts', error);
    }
  }, [layouts]);

  // ── Initial Nodes Setup ──
  const [nodes, setNodes] = useState<FlowNode[]>(
    (
      [
    {
      id: 'input',
      title: 'Source Input',
      category: 'input',
      x: 40,
      y: 180,
      width: 230,
      height: 250,
      enabled: true,
      accent: '#3B82F6', // Blue
    },
    {
      id: 'tone',
      title: 'Exposure & Tone',
      category: 'tone',
      x: 640,
      y: 110,
      width: 250,
      height: 310,
      enabled: true,
      accent: '#F59E0B', // Amber
    },
    {
      id: 'color',
      title: 'White Balance',
      category: 'color',
      x: 950,
      y: 110,
      width: 250,
      height: 270,
      enabled: true,
      accent: '#EC4899', // Pink
    },
    {
      id: 'hsl',
      title: 'HSL Mixer',
      category: 'hsl',
      x: 1260,
      y: 145,
      width: 250,
      height: 280,
      enabled: true,
      accent: '#F97316',
    },
    {
      id: 'curves',
      title: 'Tone Curves',
      category: 'curves',
      x: 1570,
      y: 110,
      width: 250,
      height: 280,
      enabled: true,
      accent: '#06B6D4', // Cyan
    },
    {
      id: 'grading',
      title: '3-Way Color Wheels',
      category: 'grading',
      x: 1880,
      y: 80,
      width: 260,
      height: 330,
      enabled: true,
      accent: '#8B5CF6', // Purple
    },
    {
      id: 'detail',
      title: 'Detail & Clarity',
      category: 'detail',
      x: 2500,
      y: 120,
      width: 250,
      height: 280,
      enabled: true,
      accent: '#10B981', // Emerald
    },
    {
      id: 'geometry',
      title: 'Geometry',
      category: 'geometry',
      x: 2810,
      y: 155,
      width: 250,
      height: 280,
      enabled: true,
      accent: '#6366F1',
    },
    {
      id: 'dehaze',
      title: 'Dehaze',
      category: 'dehaze',
      x: 2500,
      y: 145,
      width: 250,
      height: 190,
      enabled: true,
      accent: '#22C55E',
    },
    {
      id: 'vignette',
      title: 'Vignette',
      category: 'vignette',
      x: 2810,
      y: 145,
      width: 250,
      height: 220,
      enabled: true,
      accent: '#A855F7',
    },
    {
      id: 'background_removal',
      title: 'Chroma Key',
      category: 'background_removal',
      x: 3120,
      y: 145,
      width: 250,
      height: 250,
      enabled: true,
      accent: '#F43F5E',
    },
    {
      id: 'output',
      title: 'Master Output',
      category: 'output',
      x: 3430,
      y: 160,
      width: 250,
      height: 280,
      enabled: true,
      accent: '#6366F1', // Indigo
    },
      ] satisfies FlowNode[]
    ).sort(
      (left, right) =>
        FLOW_PROCESS_ORDER.indexOf(left.category) - FLOW_PROCESS_ORDER.indexOf(right.category)
    ).map((node, index) => ({
      ...node,
      x: 40 + index * 310,
      y: 130 + (index % 2 === 0 ? 0 : 25),
    }))
  );

  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        enabled: flowNodeEnabled[node.id] ?? node.enabled,
      })),
    [nodes, flowNodeEnabled]
  );

  const saveNodeEnabled = (nodeId: string, enabled: boolean) => {
    onChange({
      ...editState,
      custom_metadata: {
        ...(editState.custom_metadata ?? {}),
        flow_nodes: { ...flowNodeEnabled, [nodeId]: enabled },
      },
    });
  };

  const addNode = () => {
    if (!newNodeCategory || nodes.some((node) => node.id === newNodeCategory)) return;
    const option = FLOW_NODE_OPTIONS.find((item) => item.category === newNodeCategory);
    if (!option) return;
    const newNode: FlowNode = {
      id: option.category,
      title: option.title,
      category: option.category,
      x: 40 + nodes.length * 310,
      y: 160,
      width: 250,
      height: 280,
      enabled: true,
      accent: option.accent,
    };
    setNodes((previous) =>
      [...previous, newNode].sort(
        (left, right) =>
          FLOW_PROCESS_ORDER.indexOf(left.category) - FLOW_PROCESS_ORDER.indexOf(right.category)
      )
    );
    saveNodeEnabled(option.category, true);
    setSelectedNodeId(option.category);
    setNewNodeCategory('');
  };

  const removeNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const remaining = nodes.filter((node) => node.id !== nodeId);
    setNodes(remaining);
    setSelectedNodeId(remaining[0]?.id ?? 'input');
    saveNodeEnabled(nodeId, false);
  };

  const resetNode = (node: FlowNode, e: React.MouseEvent) => {
    e.stopPropagation();
    switch (node.category) {
      case 'tone':
        onChange({
          ...editState,
          exposure: {
            exposure: 0,
            contrast: 0,
            highlights: 0,
            shadows: 0,
            whites: 0,
            blacks: 0,
          },
        });
        break;
      case 'color':
        onChange({
          ...editState,
          white_balance: { temperature: 0, tint: 0, saturation: 0, vibrance: 0 },
        });
        break;
      case 'detail':
        onChange({
          ...editState,
          detail: { ...editState.detail, sharpening: 0, noise_reduction: 0, clarity: 0, texture: 0 },
        });
        break;
      case 'dehaze':
        onChange({ ...editState, detail: { ...editState.detail, dehaze: 0 } });
        break;
      case 'hsl':
        if (editState.hsl) {
          onChange({
            ...editState,
            hsl: {
              red: { hue: 0, saturation: 0, luminance: 0 },
              orange: { hue: 0, saturation: 0, luminance: 0 },
              yellow: { hue: 0, saturation: 0, luminance: 0 },
              green: { hue: 0, saturation: 0, luminance: 0 },
              aqua: { hue: 0, saturation: 0, luminance: 0 },
              blue: { hue: 0, saturation: 0, luminance: 0 },
              purple: { hue: 0, saturation: 0, luminance: 0 },
              magenta: { hue: 0, saturation: 0, luminance: 0 },
            },
          });
        }
        break;
      case 'grading':
        if (editState.color_grading) {
          const neutral = { hue: 0, saturation: 0, luminance: 0 };
          onChange({
            ...editState,
            color_grading: {
              lift: neutral,
              gamma: neutral,
              gain: neutral,
              offset: neutral,
              lut_name: null,
              lut_intensity: 1,
            },
          });
        }
        break;
      case 'curves':
        if (editState.tone_curves) {
          const identity = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
          onChange({
            ...editState,
            tone_curves: {
              rgb_points: identity,
              red_points: identity,
              green_points: identity,
              blue_points: identity,
            },
          });
        }
        break;
      case 'geometry':
        onChange({
          ...editState,
          geometry: {
            ...editState.geometry,
            rotation: 0,
            aspect_ratio: 'Original',
            horizontal_flip: false,
            vertical_flip: false,
            crop_x: 0,
            crop_y: 0,
            crop_width: 1,
            crop_height: 1,
          },
        });
        break;
      case 'vignette':
        onChange({
          ...editState,
          custom_metadata: {
            ...(editState.custom_metadata ?? {}),
            vignette: { enabled: false, amount: 0, midpoint: 0.5, feather: 0.5 },
          },
        });
        break;
      case 'background_removal':
        onChange({
          ...editState,
          custom_metadata: {
            ...(editState.custom_metadata ?? {}),
            background_removal: { enabled: false, color: '#00ff00', tolerance: 0.18, feather: 0.08 },
          },
        });
        break;
    }
    saveNodeEnabled(node.id, true);
  };

  const updateVignette = (updates: Partial<VignetteSettings>) => {
    onChange({
      ...editState,
      custom_metadata: {
        ...(editState.custom_metadata ?? {}),
        vignette: { ...vignette, ...updates },
      },
    });
  };

  const updateBackgroundRemoval = (updates: Partial<BackgroundRemovalSettings>) => {
    onChange({
      ...editState,
      custom_metadata: {
        ...(editState.custom_metadata ?? {}),
        background_removal: { ...backgroundRemoval, ...updates },
      },
    });
  };

  const saveLayout = () => {
    const name = window.prompt('Name this Visual Flow layout:', 'My Layout');
    if (!name?.trim()) return;
    const layout: FlowLayout = {
      id: `${Date.now()}`,
      name: name.trim(),
      nodes: nodes.map(({ id, x, y }) => ({ id, x, y })),
    };
    setLayouts((previous) => [...previous.filter((item) => item.name !== layout.name), layout]);
    setSelectedLayoutId(layout.id);
  };

  const applyLayout = (layoutId: string) => {
    setSelectedLayoutId(layoutId);
    const layout = layouts.find((item) => item.id === layoutId);
    if (!layout) return;
    const positions = new Map(layout.nodes.map((node) => [node.id, node]));
    setNodes((previous) =>
      previous.map((node) => {
        const position = positions.get(node.id);
        return position ? { ...node, x: position.x, y: position.y } : node;
      })
    );
  };

  const saveCurrentPreset = () => {
    const name = window.prompt('Name this editing preset:');
    if (name?.trim()) bridge.savePreset(name.trim(), 'User');
  };

  // ── Auto-layout nodes in sequential stream ──
  const autoLayout = () => {
    const ordered = [...nodes].sort(
      (left, right) =>
        FLOW_PROCESS_ORDER.indexOf(left.category) - FLOW_PROCESS_ORDER.indexOf(right.category)
    );
    const width = Math.max(containerRef.current?.clientWidth ?? 1100, 360);
    const gap = 48;
    const startX = 36;
    setNodes(ordered.map((n, idx) => ({
        ...n,
        x: startX + idx * (n.width + gap),
        y: 112 + (idx % 2 === 0 ? 0 : 28),
      })));
    const totalWidth = ordered.reduce((total, node) => total + node.width, 0) + gap * (ordered.length - 1);
    setZoom(Math.max(0.3, Math.min(1, (width - 72) / Math.max(totalWidth, 1))));
    setPan({ x: 36, y: 90 });
    setSelectedNodeId('tone');
  };

  const focusNode = (node: FlowNode) => {
    setSelectedNodeId(node.id);
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setPan({
      x: bounds.width / 2 - (node.x + node.width / 2) * zoom,
      y: bounds.height / 2 - (node.y + 36) * zoom,
    });
  };

  const fitFlowToView = () => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds || displayedNodes.length === 0) return;
    const minX = Math.min(...displayedNodes.map((node) => node.x));
    const minY = Math.min(...displayedNodes.map((node) => node.y));
    const maxX = Math.max(...displayedNodes.map((node) => node.x + node.width));
    const maxY = Math.max(...displayedNodes.map((node) => node.y + node.height));
    const nextZoom = Math.max(
      0.3,
      Math.min(1, (bounds.width - 80) / Math.max(maxX - minX, 1), (bounds.height - 100) / Math.max(maxY - minY, 1))
    );
    setZoom(nextZoom);
    setPan({
      x: (bounds.width - (maxX - minX) * nextZoom) / 2 - minX * nextZoom,
      y: (bounds.height - (maxY - minY) * nextZoom) / 2 - minY * nextZoom,
    });
  };

  // ── Canvas Pan & Zoom with Wheel ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      setZoom((prevZoom) => {
        const nextZoom = Math.max(0.3, Math.min(2.0, prevZoom * factor));
        setPan((prevPan) => ({
          x: mx - (mx - prevPan.x) * (nextZoom / prevZoom),
          y: my - (my - prevPan.y) * (nextZoom / prevZoom),
        }));
        return nextZoom;
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    // If middle button or spacebar or clicked on background
    if (e.button === 1 || e.button === 0) {
      if ((e.target as HTMLElement).classList.contains('flow-canvas-bg')) {
        setIsPanning(true);
        setLastMouse({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastMouse({ x: e.clientX, y: e.clientY });
    } else if (draggingNodeId) {
      const dx = (e.clientX - dragOffset.x) / zoom;
      const dy = (e.clientY - dragOffset.y) / zoom;
      setNodes((prev) =>
        prev.map((n) =>
          n.id === draggingNodeId ? { ...n, x: n.x + dx, y: n.y + dy } : n
        )
      );
      setDragOffset({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNodeId(null);
  };

  const handleStartDragNode = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingNodeId(nodeId);
    setSelectedNodeId(nodeId);
    setDragOffset({ x: e.clientX, y: e.clientY });
  };

  const toggleNodeEnabled = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const node = displayedNodes.find((item) => item.id === nodeId);
    if (!node) return;
    saveNodeEnabled(nodeId, !node.enabled);
  };

  // ── Node Value Updates ──
  const updateExposure = (key: keyof typeof editState.exposure, val: number) => {
    onChange({
      ...editState,
      exposure: { ...editState.exposure, [key]: val },
    });
  };

  const updateWhiteBalance = (key: keyof typeof editState.white_balance, val: number) => {
    onChange({
      ...editState,
      white_balance: { ...editState.white_balance, [key]: val },
    });
  };

  const updateDetail = (key: keyof typeof editState.detail, val: number) => {
    onChange({
      ...editState,
      detail: { ...editState.detail, [key]: val },
    });
  };

  const updateHsl = (band: string, key: 'hue' | 'saturation' | 'luminance', value: number) => {
    const bandValues = editState.hsl?.[band] ?? { hue: 0, saturation: 0, luminance: 0 };
    onChange({
      ...editState,
      hsl: {
        ...editState.hsl,
        [band]: { ...bandValues, [key]: value },
      },
    });
  };

  const updateGrading = (
    channel: 'lift' | 'gamma' | 'gain',
    key: 'hue' | 'saturation' | 'luminance',
    value: number
  ) => {
    const defaults = { hue: 0, saturation: 0, luminance: 0 };
    const current = editState.color_grading ?? {
      lift: defaults,
      gamma: defaults,
      gain: defaults,
      offset: defaults,
      lut_intensity: 1,
    };
    onChange({
      ...editState,
      color_grading: {
        ...current,
        [channel]: { ...current[channel], [key]: value },
      },
    });
  };

  const updateCurve = (value: number) => {
    const identity = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const curves = editState.tone_curves ?? {
      rgb_points: identity,
      red_points: identity,
      green_points: identity,
      blue_points: identity,
    };
    const points = curves[selectedCurveChannel].filter((point) => point.x !== 0.5);
    points.push({ x: 0.5, y: value });
    points.sort((a, b) => a.x - b.x);
    onChange({
      ...editState,
      tone_curves: { ...curves, [selectedCurveChannel]: points },
    });
  };

  const curvePoints = editState.tone_curves?.[selectedCurveChannel] ?? [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ];
  const curveMidpoint = curvePoints.find((point) => point.x === 0.5)?.y ?? 0.5;

  const updateCurvePoint = (index: number, x: number, y: number) => {
    const identity = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    const curves = editState.tone_curves ?? {
      rgb_points: identity,
      red_points: identity,
      green_points: identity,
      blue_points: identity,
    };
    const points = [...curves[selectedCurveChannel]];
    const currentPoint = points[index];
    if (!currentPoint) return;
    const minX = index === 0 ? 0 : points[index - 1].x + 0.01;
    const maxX = index === points.length - 1 ? 1 : points[index + 1].x - 0.01;
    points[index] = {
      x: index === 0 ? 0 : index === points.length - 1 ? 1 : Math.max(minX, Math.min(maxX, x)),
      y: index === 0 ? 0 : index === points.length - 1 ? 1 : Math.max(0, Math.min(1, y)),
    };
    onChange({
      ...editState,
      tone_curves: { ...curves, [selectedCurveChannel]: points },
    });
  };

  const addCurvePoint = (event: React.MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0.01, Math.min(0.99, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0.01, Math.min(0.99, 1 - (event.clientY - bounds.top) / bounds.height));
    const points = [...curvePoints, { x, y }].sort((a, b) => a.x - b.x);
    const curves = editState.tone_curves ?? {
      rgb_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      red_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      green_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      blue_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    };
    onChange({
      ...editState,
      tone_curves: { ...curves, [selectedCurveChannel]: points },
    });
  };

  const moveCurvePoint = (event: React.PointerEvent<SVGSVGElement>) => {
    if (draggingCurvePoint === null) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = 1 - (event.clientY - bounds.top) / bounds.height;
    updateCurvePoint(draggingCurvePoint, x, y);
  };

  // ── SVG Connection Cables Generator ──
  const connections = useMemo(() => {
    const cables = [];
    for (let i = 0; i < displayedNodes.length - 1; i++) {
      const src = displayedNodes[i];
      const dst = displayedNodes[i + 1];

      // Output pin on right side of src
      const x1 = src.x + src.width;
      const y1 = src.y + 36; // Header center

      // Input pin on left side of dst
      const x2 = dst.x;
      const y2 = dst.y + 36;

      const dx = Math.max(50, Math.abs(x2 - x1) * 0.5);
      const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

      const isLive = src.enabled && dst.enabled;

      cables.push(
        <g key={`${src.id}->${dst.id}`}>
          {/* Outer glow line */}
          <path
            d={pathD}
            fill="none"
            stroke={isLive ? src.accent : '#2A2F3A'}
            strokeWidth={isLive ? 4 : 2}
            strokeOpacity={isLive ? 0.3 : 0.15}
            strokeLinecap="round"
          />
          {/* Main cable line */}
          <path
            d={pathD}
            fill="none"
            stroke={isLive ? src.accent : '#353A44'}
            strokeWidth={isLive ? 2 : 1.5}
            strokeLinecap="round"
          />
          {/* Flow pulse dots when active */}
          {isLive && (
            <circle r={3} fill="#ffffff">
              <animateMotion dur="2.5s" repeatCount="indefinite" path={pathD} />
            </circle>
          )}
        </g>
      );
    }
    return cables;
  }, [displayedNodes]);

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-obsidian-deep select-none">
      {/* ── Top Bar / HUD ────────────────────────────────────────────── */}
      <div className="app-surface relative z-20 flex min-h-12 flex-wrap items-center justify-between gap-2 border-x-0 border-t-0 px-3 py-1.5 xl:px-4">
        <div className="flex items-center gap-2">
          <Share2 size={14} className="text-obsidian-accent" />
          <span className="text-xs font-bold tracking-wider uppercase text-white">
            Visual Flow
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[9.5px] text-obsidian-textMut font-mono">
            Node-Graph Pipeline
          </span>
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => bridge.undo()}
              disabled={activeHistoryIndex < 0}
              className="p-1 rounded hover:bg-obsidian-hover text-obsidian-textSec disabled:opacity-30"
              title="Undo"
            >
              <Undo2 size={13} />
            </button>
            <button
              onClick={() => bridge.redo()}
              disabled={activeHistoryIndex >= historyList.length - 1}
              className="p-1 rounded hover:bg-obsidian-hover text-obsidian-textSec disabled:opacity-30"
              title="Redo"
            >
              <Redo2 size={13} />
            </button>
            <select
              aria-label="Visual Flow edit history"
              value={activeHistoryIndex}
              onChange={(event) => bridge.jumpHistory(Number(event.target.value))}
              className="max-w-40 bg-obsidian-card border border-obsidian-border rounded px-1.5 py-1 text-[9px] text-obsidian-textPri"
            >
              {historyList.length === 0 ? (
                <option value={-1}>No history</option>
              ) : (
                <>
                  <option value={-1}>Original (Import State)</option>
                  {historyList.map((entry, index) => (
                    <option key={`${index}-${entry}`} value={index}>
                      {index + 1}. {entry}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>

        {/* View Controls & Action Buttons */}
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto scrollbar-thin">
          <div className="flex items-center gap-1">
            <select
              aria-label="Saved Visual Flow layout"
              value={selectedLayoutId}
              onChange={(event) => applyLayout(event.target.value)}
              className="app-control h-8 max-w-28 rounded-lg px-1.5 text-[9px] text-obsidian-textPri sm:max-w-32"
            >
              <option value="">Layouts...</option>
              {layouts.map((layout) => (
                <option key={layout.id} value={layout.id}>{layout.name}</option>
              ))}
            </select>
            <button
              onClick={saveLayout}
              className="app-control flex h-8 w-8 items-center justify-center rounded-lg text-obsidian-textPri"
              title="Save current node layout"
            >
              <Save size={12} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <select
              aria-label="Editing preset"
              value={selectedPresetId}
              onChange={(event) => setSelectedPresetId(event.target.value)}
              className="app-control h-8 max-w-24 rounded-lg px-1.5 text-[9px] text-obsidian-textPri sm:max-w-32"
            >
              <option value="">Presets...</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </select>
            <button
              onClick={() => selectedPresetId && bridge.applyPreset(selectedPresetId)}
              disabled={!selectedPresetId}
              className="app-control flex h-8 w-8 items-center justify-center rounded-lg text-obsidian-textPri disabled:opacity-40"
              title="Apply selected preset"
            >
              <Star size={12} />
            </button>
            <button
              onClick={saveCurrentPreset}
              className="app-control flex h-8 w-8 items-center justify-center rounded-lg text-obsidian-textPri"
              title="Save current edits as a preset"
            >
              <Plus size={12} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <select
              aria-label="Add visual flow node"
              value={newNodeCategory}
              onChange={(e) => setNewNodeCategory(e.target.value as FlowEffectCategory | '')}
              className="app-control h-8 max-w-32 rounded-lg px-2 text-[10px] text-obsidian-textPri sm:max-w-36"
            >
              <option value="">Add effect node...</option>
              {FLOW_NODE_OPTIONS.filter(
                (option) => !nodes.some((node) => node.id === option.category)
              ).map((option) => (
                <option key={option.category} value={option.category}>
                  {option.title}
                </option>
              ))}
            </select>
            <button
              onClick={addNode}
              disabled={!newNodeCategory}
              className="app-control flex h-8 w-8 items-center justify-center rounded-lg text-obsidian-textPri disabled:opacity-40"
              title="Add selected effect node"
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="app-control flex items-center overflow-hidden rounded-lg text-xs">
            <button
              onClick={() => setZoom((z) => Math.min(2.0, z * 1.15))}
              className="px-2 py-1.5 text-obsidian-textPri transition-colors hover:bg-white/[0.07]"
              title="Zoom In"
            >
              <ZoomIn size={12} />
            </button>
            <span className="px-2 py-1 text-[9.5px] font-mono text-obsidian-textMut border-x border-obsidian-border">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.max(0.3, z / 1.15))}
              className="px-2 py-1.5 text-obsidian-textPri transition-colors hover:bg-white/[0.07]"
              title="Zoom Out"
            >
              <ZoomOut size={12} />
            </button>
          </div>

          <button onClick={fitFlowToView} className="app-control flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold text-obsidian-textPri" title="Fit all workflow stages in view">
            <Maximize2 size={12} /><span className="hidden sm:inline">Fit</span>
          </button>
          <button onClick={autoLayout} className="app-control flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold text-obsidian-textPri" title="Arrange stages in processing order">
            <RotateCcw size={11} className="text-obsidian-accent" /><span className="hidden sm:inline">Auto Layout</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/30 border border-emerald-600/40 text-[9.5px] font-bold text-emerald-400 font-mono">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>REALTIME PIPELINE</span>
          </div>
        </div>
      </div>

      {/* ── Flow Graph Canvas ────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
      <aside className="app-surface z-10 hidden w-56 shrink-0 flex-col border-y-0 border-l-0 px-3 py-3 lg:flex">
        <div className="mb-3">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-obsidian-textSec">Workflow stages</h2>
          <p className="mt-1 text-[9px] leading-4 text-obsidian-textMut">Select a stage to focus it on the canvas.</p>
        </div>
        <label className="app-control mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-obsidian-textMut">
          <Search size={12} />
          <input
            value={nodeSearch}
            onChange={(event) => setNodeSearch(event.target.value)}
            placeholder="Find a stage..."
            aria-label="Find a workflow stage"
            className="min-w-0 flex-1 bg-transparent text-[10px] text-white outline-none placeholder:text-obsidian-textMut"
          />
        </label>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {displayedNodes
            .filter((node) => node.title.toLowerCase().includes(nodeSearch.toLowerCase()))
            .map((node, index) => {
              const isSelected = selectedNodeId === node.id;
              return (
                <button
                  type="button"
                  key={node.id}
                  onClick={() => focusNode(node)}
                  aria-current={isSelected ? 'step' : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors ${
                    isSelected ? 'border-sky-300/25 bg-sky-400/[0.09] text-white' : 'border-transparent text-obsidian-textSec hover:bg-white/[0.045] hover:text-white'
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[9px] font-mono text-obsidian-textMut">{String(index + 1).padStart(2, '0')}</span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: node.accent }} />
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium">{node.title}</span>
                  {node.enabled ? <CheckCircle2 size={12} className="shrink-0 text-emerald-400" /> : <Circle size={12} className="shrink-0 text-obsidian-textMut" />}
                </button>
              );
            })}
        </div>
        <div className="mt-3 border-t border-white/[0.07] pt-3">
          <p className="text-[9px] uppercase tracking-wider text-obsidian-textMut">Active stages</p>
          <p className="mt-1 text-lg font-semibold text-white">{displayedNodes.filter((node) => node.enabled).length}<span className="ml-1 text-[10px] font-normal text-obsidian-textMut">/ {displayedNodes.length}</span></p>
        </div>
      </aside>
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="flow-canvas-bg relative h-full min-w-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* World Transform Container */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute inset-0 pointer-events-none"
        >
          {/* SVG Cables between nodes */}
          <svg
            className="overflow-visible absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{ width: '4000px', height: '4000px' }}
          >
            {connections}
          </svg>

          {/* Render Flow Nodes */}
          {displayedNodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isLive = node.enabled;

            return (
              <div
                key={node.id}
                style={{
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                  width: `${node.width}px`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeId(node.id);
                }}
                className={`app-surface pointer-events-auto absolute left-0 top-0 rounded-xl transition-shadow ${
                  isSelected
                    ? 'border-obsidian-accent shadow-blue-900/30 ring-1 ring-obsidian-accent'
                    : 'border-obsidian-border hover:border-obsidian-borderLt'
                } ${!isLive ? 'opacity-55' : ''}`}
              >
                {/* ── Node Sockets (Pins) ── */}
                {/* Input Pin (Left) */}
                {node.category !== 'input' && (
                  <div
                    className="absolute -left-2 top-[30px] w-4 h-4 rounded-full bg-obsidian-panel border-2 border-white/60 flex items-center justify-center shadow"
                    title="RGB In"
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: node.accent }} />
                  </div>
                )}

                {/* Output Pin (Right) */}
                {node.category !== 'output' && (
                  <div
                    className="absolute -right-2 top-[30px] w-4 h-4 rounded-full bg-obsidian-panel border-2 border-white/60 flex items-center justify-center shadow"
                    title="RGB Out"
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: node.accent }} />
                  </div>
                )}

                {/* ── Node Header ── */}
                <div
                  onMouseDown={(e) => handleStartDragNode(node.id, e)}
                  className="flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing border-b border-obsidian-border rounded-t-xl"
                  style={{
                    background: `linear-gradient(to right, ${node.accent}15, transparent)`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: node.accent }}
                    />
                    <span className="text-[11px] font-bold text-white tracking-wide">
                      {node.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {node.category !== 'input' && node.category !== 'output' && (
                      <>
                        <button
                          onClick={(e) => resetNode(node, e)}
                          className="p-1 rounded text-obsidian-textMut hover:text-white hover:bg-obsidian-hover"
                          title="Reset node settings"
                        >
                          <RotateCw size={11} />
                        </button>
                        <button
                          onClick={(e) => toggleNodeEnabled(node.id, e)}
                          className={`p-1 rounded transition-colors ${
                            node.enabled
                              ? 'text-emerald-400 hover:bg-emerald-950/40'
                              : 'text-obsidian-textMut hover:bg-obsidian-hover'
                          }`}
                          title={node.enabled ? 'Bypass this processing stage' : 'Enable this processing stage'}
                        >
                          <Power size={11} />
                        </button>
                        <button
                          onClick={(e) => removeNode(node.id, e)}
                          className="p-1 rounded text-obsidian-textMut hover:text-red-400 hover:bg-red-950/30"
                          title="Remove node from flow"
                        >
                          <Trash2 size={11} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* ── Node Body (Category specific contents) ── */}
                <div className="p-3 text-xs space-y-2.5">
                  {/* Category: Input Node */}
                  {node.category === 'input' && (
                    <div className="space-y-2">
                      <div className="w-full h-28 rounded bg-obsidian-deep overflow-hidden border border-obsidian-border/50 relative flex items-center justify-center">
                        {beforeImageUrl ? (
                          <img
                            src={beforeImageUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : activeAsset ? (
                          <GalleryThumbnail
                            assetId={activeAsset.id}
                            alt=""
                            className="h-full w-full"
                            fallback={<ImageIcon size={28} className="text-obsidian-textMut/30" />}
                          />
                        ) : (
                          <ImageIcon size={28} className="text-obsidian-textMut/30" />
                        )}
                        <span className="absolute bottom-1 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[8.5px] font-mono text-white">
                          RAW / SOURCE
                        </span>
                      </div>
                      <div className="text-[10px] text-obsidian-textMut font-mono truncate">
                        {activeAsset?.file_name || 'source_photo.dng'}
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-obsidian-textSec font-mono">
                        <span>ISO {activeAsset?.metadata?.iso || 100}</span>
                        <span>{activeAsset?.metadata?.shutter_speed_str || '1/250s'}</span>
                        <span>f/{activeAsset?.metadata?.aperture_f_number || '2.8'}</span>
                      </div>
                    </div>
                  )}

                  {/* Category: Exposure & Tone Node */}
                  {node.category === 'tone' && (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Exposure</span>
                          <span className="font-mono text-white font-bold">
                            {editState.exposure.exposure > 0 ? '+' : ''}
                            {editState.exposure.exposure.toFixed(2)} EV
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-5}
                          max={5}
                          step={0.05}
                          value={editState.exposure.exposure}
                          onChange={(e) => updateExposure('exposure', parseFloat(e.target.value))}
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-obsidian-accent bg-obsidian-deep"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Contrast</span>
                          <span className="font-mono text-white font-bold">
                            {editState.exposure.contrast > 0 ? '+' : ''}
                            {Math.round(editState.exposure.contrast)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={1}
                          value={editState.exposure.contrast}
                          onChange={(e) => updateExposure('contrast', parseFloat(e.target.value))}
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-obsidian-accent bg-obsidian-deep"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Highlights</span>
                          <span className="font-mono text-white font-bold">
                            {editState.exposure.highlights > 0 ? '+' : ''}
                            {Math.round(editState.exposure.highlights)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={1}
                          value={editState.exposure.highlights}
                          onChange={(e) => updateExposure('highlights', parseFloat(e.target.value))}
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-obsidian-accent bg-obsidian-deep"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Shadows</span>
                          <span className="font-mono text-white font-bold">
                            {editState.exposure.shadows > 0 ? '+' : ''}
                            {Math.round(editState.exposure.shadows)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={1}
                          value={editState.exposure.shadows}
                          onChange={(e) => updateExposure('shadows', parseFloat(e.target.value))}
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-obsidian-accent bg-obsidian-deep"
                        />
                      </div>

                      {(['whites', 'blacks'] as const).map((key) => (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-[9.5px]">
                            <span className="text-obsidian-textMut capitalize">{key}</span>
                            <span className="font-mono text-white font-bold">
                              {Math.round(editState.exposure[key])}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-100}
                            max={100}
                            step={1}
                            value={editState.exposure[key]}
                            onChange={(e) => updateExposure(key, parseFloat(e.target.value))}
                            className="w-full h-1 rounded appearance-none cursor-pointer accent-obsidian-accent bg-obsidian-deep"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Category: White Balance Node */}
                  {node.category === 'color' && (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Temperature</span>
                          <span className="font-mono text-white font-bold">
                            {editState.white_balance.temperature > 0 ? '+' : ''}
                            {Math.round(editState.white_balance.temperature)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={1}
                          value={editState.white_balance.temperature}
                          onChange={(e) =>
                            updateWhiteBalance('temperature', parseFloat(e.target.value))
                          }
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-amber-500 bg-obsidian-deep"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Tint</span>
                          <span className="font-mono text-white font-bold">
                            {editState.white_balance.tint > 0 ? '+' : ''}
                            {Math.round(editState.white_balance.tint)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={1}
                          value={editState.white_balance.tint}
                          onChange={(e) => updateWhiteBalance('tint', parseFloat(e.target.value))}
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-pink-500 bg-obsidian-deep"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Vibrance</span>
                          <span className="font-mono text-white font-bold">
                            {editState.white_balance.vibrance > 0 ? '+' : ''}
                            {Math.round(editState.white_balance.vibrance)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={1}
                          value={editState.white_balance.vibrance}
                          onChange={(e) =>
                            updateWhiteBalance('vibrance', parseFloat(e.target.value))
                          }
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-obsidian-accent bg-obsidian-deep"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Saturation</span>
                          <span className="font-mono text-white font-bold">
                            {editState.white_balance.saturation > 0 ? '+' : ''}
                            {Math.round(editState.white_balance.saturation)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={1}
                          value={editState.white_balance.saturation}
                          onChange={(e) =>
                            updateWhiteBalance('saturation', parseFloat(e.target.value))
                          }
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-obsidian-accent bg-obsidian-deep"
                        />
                      </div>
                    </div>
                  )}

                  {/* Category: 3-Way Color Wheels Node */}
                  {node.category === 'grading' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        {(['lift', 'gamma', 'gain'] as const).map((wKey) => {
                          const wVal = editState.color_grading?.[wKey] || {
                            hue: 0,
                            saturation: 0,
                            luminance: 0,
                          };
                          const label =
                            wKey === 'lift' ? 'Lift' : wKey === 'gamma' ? 'Gamma' : 'Gain';
                          return (
                            <div
                              key={wKey}
                              className="p-1.5 rounded bg-obsidian-deep border border-obsidian-border/50"
                            >
                              <div className="text-[9px] font-bold text-obsidian-textMut uppercase">
                                {label}
                              </div>
                              <div className="w-8 h-8 mx-auto my-1 rounded-full border border-obsidian-border relative flex items-center justify-center bg-gradient-to-tr from-blue-900/30 to-amber-900/30">
                                <div
                                  className="w-1.5 h-1.5 rounded-full bg-white shadow"
                                  style={{
                                    transform: `translate(${Math.cos((wVal.hue * Math.PI) / 180) * wVal.saturation * 10}px, ${Math.sin((wVal.hue * Math.PI) / 180) * wVal.saturation * 10}px)`,
                                  }}
                                />
                              </div>
                              <div className="text-[8px] font-mono text-obsidian-textSec">
                                {Math.round(wVal.hue)}°
                              </div>
                              {(['hue', 'saturation', 'luminance'] as const).map((field) => (
                                <input
                                  key={field}
                                  aria-label={`${label} ${field}`}
                                  type="range"
                                  min={field === 'hue' ? 0 : field === 'saturation' ? 0 : -1}
                                  max={field === 'hue' ? 360 : 1}
                                  step={field === 'hue' ? 1 : 0.01}
                                  value={wVal[field]}
                                  onChange={(e) =>
                                    updateGrading(wKey, field, parseFloat(e.target.value))
                                  }
                                  className="w-full h-1 mt-1 accent-violet-500"
                                />
                              ))}
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-[8px] text-obsidian-textMut text-center">
                        Adjust hue, saturation and luminance for each tonal range.
                      </div>
                      <div className="text-[9.5px] text-obsidian-textMut pt-1 flex items-center justify-between border-t border-obsidian-border/40">
                        <span>LUT:</span>
                        <span className="text-white font-semibold">
                          {editState.color_grading?.lut_name || 'None'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Category: Tone Curves Node */}
                  {node.category === 'curves' && (
                    <div className="space-y-2">
                      <select
                        aria-label="Tone curve channel"
                        value={selectedCurveChannel}
                        onChange={(event) =>
                          setSelectedCurveChannel(
                            event.target.value as typeof selectedCurveChannel
                          )
                        }
                        className="w-full bg-obsidian-deep border border-obsidian-border rounded px-2 py-1 text-[10px] text-white"
                      >
                        <option value="rgb_points">RGB</option>
                        <option value="red_points">Red</option>
                        <option value="green_points">Green</option>
                        <option value="blue_points">Blue</option>
                      </select>
                      <div className="w-full h-28 bg-obsidian-deep rounded border border-obsidian-border/50 p-2 flex items-center justify-center relative">
                        <svg
                          viewBox="0 0 100 100"
                          className="w-full h-full touch-none"
                          onDoubleClick={addCurvePoint}
                          onPointerMove={moveCurvePoint}
                          onPointerUp={() => setDraggingCurvePoint(null)}
                          onPointerLeave={() => setDraggingCurvePoint(null)}
                        >
                          <line
                            x1="0"
                            y1="100"
                            x2="100"
                            y2="0"
                            stroke="#252A32"
                            strokeWidth="1"
                            strokeDasharray="3,3"
                          />
                          <polyline
                            points={curvePoints
                              .map((point) => `${point.x * 100},${(1 - point.y) * 100}`)
                              .join(' ')}
                            fill="none"
                            stroke={
                              selectedCurveChannel === 'red_points'
                                ? '#ef4444'
                                : selectedCurveChannel === 'green_points'
                                  ? '#22c55e'
                                  : selectedCurveChannel === 'blue_points'
                                    ? '#3b82f6'
                                    : '#06B6D4'
                            }
                            strokeWidth="2"
                          />
                          <circle
                            cx="50"
                            cy={(1 - curveMidpoint) * 100}
                            r="3"
                            fill="white"
                            stroke="#06B6D4"
                            strokeWidth="1.5"
                          />
                          {curvePoints.map((point, index) => (
                            <circle
                              key={`${point.x}-${index}`}
                              cx={point.x * 100}
                              cy={(1 - point.y) * 100}
                              r="2.5"
                              fill="#111318"
                              stroke="white"
                              strokeWidth="1"
                              className="cursor-move"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                setDraggingCurvePoint(index);
                                event.currentTarget.setPointerCapture(event.pointerId);
                              }}
                            />
                          ))}
                        </svg>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-obsidian-textMut">
                          <span>{selectedCurveChannel.replace('_points', '')} midpoint</span>
                          <span className="font-mono text-white">
                            {Math.round(curveMidpoint * 100)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={curveMidpoint}
                          onChange={(e) => updateCurve(parseFloat(e.target.value))}
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-cyan-500 bg-obsidian-deep"
                        />
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          aria-label="Tone curve midpoint output"
                          value={curveMidpoint}
                          onChange={(e) => updateCurve(Number(e.target.value))}
                          className="w-full bg-obsidian-deep border border-obsidian-border rounded px-2 py-1 text-[9px] text-white"
                        />
                      </div>
                      <div className="text-[8px] text-obsidian-textMut">
                        Double-click to add a point; drag points to shape the curve.
                      </div>
                    </div>
                  )}

                  {/* Category: Detail Node */}
                  {node.category === 'detail' && (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Clarity</span>
                          <span className="font-mono text-white font-bold">
                            {Math.round(editState.detail.clarity)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-100}
                          max={100}
                          step={1}
                          value={editState.detail.clarity}
                          onChange={(e) => updateDetail('clarity', parseFloat(e.target.value))}
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-emerald-500 bg-obsidian-deep"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Sharpening</span>
                          <span className="font-mono text-white font-bold">
                            {Math.round(editState.detail.sharpening)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={editState.detail.sharpening}
                          onChange={(e) => updateDetail('sharpening', parseFloat(e.target.value))}
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-emerald-500 bg-obsidian-deep"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[9.5px]">
                          <span className="text-obsidian-textMut">Noise Reduction</span>
                          <span className="font-mono text-white font-bold">
                            {Math.round(editState.detail.noise_reduction)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={editState.detail.noise_reduction}
                          onChange={(e) =>
                            updateDetail('noise_reduction', parseFloat(e.target.value))
                          }
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-emerald-500 bg-obsidian-deep"
                        />
                      </div>

                      {(['texture'] as const).map((key) => (
                        <div key={key} className="space-y-1">
                          <div className="flex justify-between text-[9.5px]">
                            <span className="text-obsidian-textMut capitalize">{key}</span>
                            <span className="font-mono text-white font-bold">
                              {Math.round(editState.detail[key])}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-100}
                            max={100}
                            step={1}
                            value={editState.detail[key]}
                            onChange={(e) => updateDetail(key, parseFloat(e.target.value))}
                            className="w-full h-1 rounded appearance-none cursor-pointer accent-emerald-500 bg-obsidian-deep"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {node.category === 'dehaze' && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[9.5px]">
                        <span className="text-obsidian-textMut">Dehaze</span>
                        <span className="font-mono text-white font-bold">
                          {Math.round(editState.detail.dehaze)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-100}
                        max={100}
                        step={1}
                        value={editState.detail.dehaze}
                        onChange={(event) => updateDetail('dehaze', Number(event.target.value))}
                        className="w-full h-1 rounded appearance-none cursor-pointer accent-green-500 bg-obsidian-deep"
                      />
                      <input
                        type="number"
                        min={-100}
                        max={100}
                        step={1}
                        aria-label="Dehaze value"
                        value={editState.detail.dehaze}
                        onChange={(event) => updateDetail('dehaze', Number(event.target.value))}
                        className="w-full bg-obsidian-deep border border-obsidian-border rounded px-2 py-1 text-[10px] text-white"
                      />
                    </div>
                  )}

                  {node.category === 'vignette' && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] text-obsidian-textSec">
                        <input
                          type="checkbox"
                          checked={vignette.enabled}
                          onChange={(event) => updateVignette({ enabled: event.target.checked })}
                        />
                        Enable vignette
                      </label>
                      {([
                        ['amount', vignette.amount, -100, 100],
                        ['midpoint', vignette.midpoint, 0, 1],
                        ['feather', vignette.feather, 0.01, 1],
                      ] as const).map(([field, value, min, max]) => (
                        <div key={field} className="space-y-1">
                          <div className="flex justify-between text-[9px] text-obsidian-textMut">
                            <span className="capitalize">{field}</span>
                            <span className="font-mono text-white">{value.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            step={field === 'amount' ? 1 : 0.01}
                            value={value}
                            onChange={(event) =>
                              updateVignette({ [field]: Number(event.target.value) })
                            }
                            className="w-full h-1 rounded appearance-none cursor-pointer accent-purple-500 bg-obsidian-deep"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {node.category === 'background_removal' && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] text-obsidian-textSec">
                        <input
                          type="checkbox"
                          checked={backgroundRemoval.enabled}
                          onChange={(event) =>
                            updateBackgroundRemoval({ enabled: event.target.checked })
                          }
                        />
                        Enable chroma key
                      </label>
                      <ColorPickerInput
                        label="Key color"
                        value={backgroundRemoval.color}
                        onChange={(color) => updateBackgroundRemoval({ color })}
                      />
                      {([
                        ['tolerance', backgroundRemoval.tolerance, 0, 1],
                        ['feather', backgroundRemoval.feather, 0.001, 0.5],
                      ] as const).map(([field, value, min, max]) => (
                        <div key={field} className="space-y-1">
                          <div className="flex justify-between text-[9px] text-obsidian-textMut">
                            <span className="capitalize">{field}</span>
                            <span className="font-mono text-white">{value.toFixed(3)}</span>
                          </div>
                          <input
                            type="range"
                            min={min}
                            max={max}
                            step={0.001}
                            value={value}
                            onChange={(event) =>
                              updateBackgroundRemoval({ [field]: Number(event.target.value) })
                            }
                            className="w-full h-1 rounded appearance-none cursor-pointer accent-rose-500 bg-obsidian-deep"
                          />
                        </div>
                      ))}
                      <div className="flex items-center gap-1 text-[8px] text-obsidian-textMut">
                        <KeyRound size={10} />
                        Works best with a solid, evenly lit background.
                      </div>
                    </div>
                  )}

                  {node.category === 'hsl' && (
                    <div className="space-y-2">
                      <select
                        aria-label="HSL color band"
                        value={selectedHslBand}
                        onChange={(e) => setSelectedHslBand(e.target.value)}
                        className="w-full bg-obsidian-deep border border-obsidian-border rounded px-2 py-1 text-[10px] text-white"
                      >
                        {['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'].map(
                          (band) => (
                            <option key={band} value={band}>
                              {band[0].toUpperCase() + band.slice(1)}
                            </option>
                          )
                        )}
                      </select>
                      {(['hue', 'saturation', 'luminance'] as const).map((field) => {
                        const value = editState.hsl?.[selectedHslBand]?.[field] ?? 0;
                        return (
                          <div key={field} className="space-y-1">
                            <div className="flex justify-between text-[9px]">
                              <span className="text-obsidian-textMut capitalize">{field}</span>
                              <span className="font-mono text-white">                              {value.toFixed(1)}</span>
                            </div>
                            <input
                              type="range"
                              min={-100}
                              max={100}
                              step={0.1}
                              value={value}
                              onChange={(e) =>
                                updateHsl(selectedHslBand, field, parseFloat(e.target.value))
                              }
                              className="w-full h-1 rounded appearance-none cursor-pointer accent-orange-500 bg-obsidian-deep"
                            />
                            <input
                              type="number"
                              min={-100}
                              max={100}
                              step={0.1}
                              aria-label={`${selectedHslBand} ${field}`}
                              value={value}
                              onChange={(e) =>
                                updateHsl(selectedHslBand, field, Number(e.target.value))
                              }
                              className="w-full bg-obsidian-deep border border-obsidian-border rounded px-2 py-1 text-[9px] text-white"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {node.category === 'geometry' && (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px]">
                          <span className="text-obsidian-textMut">Rotation</span>
                          <span className="font-mono text-white">
                            {editState.geometry.rotation.toFixed(1)}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-45}
                          max={45}
                          step={0.5}
                          value={editState.geometry.rotation}
                          onChange={(e) =>
                            onChange({
                              ...editState,
                              geometry: {
                                ...editState.geometry,
                                rotation: parseFloat(e.target.value),
                              },
                            })
                          }
                          className="w-full h-1 rounded appearance-none cursor-pointer accent-indigo-500 bg-obsidian-deep"
                        />
                      </div>
                      <div className="flex gap-3 text-[9px] text-obsidian-textSec">
                        <button
                          onClick={() =>
                            onChange({
                              ...editState,
                              geometry: {
                                ...editState.geometry,
                                horizontal_flip: !editState.geometry.horizontal_flip,
                              },
                            })
                          }
                          className="rounded border border-obsidian-border px-1.5 py-1 hover:text-white"
                        >
                          {editState.geometry.horizontal_flip ? 'Flip H: On' : 'Flip H: Off'}
                        </button>
                        <button
                          onClick={() =>
                            onChange({
                              ...editState,
                              geometry: {
                                ...editState.geometry,
                                vertical_flip: !editState.geometry.vertical_flip,
                              },
                            })
                          }
                          className="rounded border border-obsidian-border px-1.5 py-1 hover:text-white"
                        >
                          {editState.geometry.vertical_flip ? 'Flip V: On' : 'Flip V: Off'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Category: Master Output Node */}
                  {node.category === 'output' && (
                    <div className="space-y-2">
                      <div className="w-full h-28 rounded bg-obsidian-deep overflow-hidden border border-obsidian-border/50 relative flex items-center justify-center">
                        {imageUrl ? (
                          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="relative w-full h-full flex items-center justify-center bg-obsidian-surface/60 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent animate-shimmer" />
                            <ImageIcon size={28} className="text-obsidian-textMut/30 relative z-10" />
                          </div>
                        )}
                        <span className="absolute bottom-1 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[8.5px] font-mono text-emerald-400 font-bold">
                          PROCESSED
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[9.5px] text-obsidian-textSec font-mono">
                        <span>Format: RGB 16-bit</span>
                        <span className="text-emerald-400 font-bold">Active</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
};
