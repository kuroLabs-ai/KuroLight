import type { EditSnapshot } from './edit';

export type PresetParameters = Partial<
  Pick<
    EditSnapshot,
    | 'exposure'
    | 'white_balance'
    | 'detail'
    | 'geometry'
    | 'lens_correction'
    | 'hsl'
    | 'color_grading'
    | 'tone_curves'
    | 'custom_metadata'
  >
>;

export interface Preset {
  id: string;
  name: string;
  category: string;
  is_builtin?: boolean;
  parameters?: PresetParameters;
}

export interface ExportPreset {
  id: string;
  name: string;
  format: 'JPEG' | 'PNG' | 'TIFF' | 'WEBP' | 'BMP' | 'GIF' | 'PPM';
  quality: number;
  color_space: string;
  resize_mode: string;
  resize_value: number;
  resize_unit: 'px' | '%';
}
