import { FlowNodeCategory } from '../types/flow';
import { FlowNodeOption } from '../interfaces/flow';

export const FLOW_NODE_OPTIONS: readonly FlowNodeOption[] = [
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
] as const;

export const FLOW_PROCESS_ORDER: readonly FlowNodeCategory[] = [
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
] as const;
