export type FlowNodeCategory =
  | 'input'
  | 'tone'
  | 'color'
  | 'detail'
  | 'grading'
  | 'curves'
  | 'hsl'
  | 'geometry'
  | 'dehaze'
  | 'vignette'
  | 'background_removal'
  | 'crop'
  | 'output';

export type FlowEffectCategory = Extract<
  FlowNodeCategory,
  'tone' | 'color' | 'detail' | 'grading' | 'curves' | 'hsl' | 'geometry' | 'dehaze' | 'vignette' | 'background_removal'
>;
