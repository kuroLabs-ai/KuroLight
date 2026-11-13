export interface Preset {
  id: string;
  name: string;
  category: string;
  parameters?: unknown;
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
