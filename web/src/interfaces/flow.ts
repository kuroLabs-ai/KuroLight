import { FlowNodeCategory, FlowEffectCategory } from '../types/flow';

export interface FlowNode {
  id: string;
  title: string;
  category: FlowNodeCategory;
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
  accent: string;
}

export interface FlowNodeOption {
  category: FlowEffectCategory;
  title: string;
  accent: string;
}

export interface FlowLayout {
  id: string;
  name: string;
  nodes: Array<Pick<FlowNode, 'id' | 'x' | 'y'>>;
}

export interface VignetteSettings {
  enabled: boolean;
  amount: number;
  midpoint: number;
  feather: number;
}

export interface BackgroundRemovalSettings {
  enabled: boolean;
  color: string;
  tolerance: number;
  feather: number;
}
