import { ExportFormat } from '../types/export';

export const FORMAT_OPTIONS: readonly { id: ExportFormat; label: string; lossy: boolean }[] = [
  { id: 'JPEG', label: 'JPEG', lossy: true },
  { id: 'PNG', label: 'PNG', lossy: false },
  { id: 'TIFF', label: 'TIFF', lossy: false },
  { id: 'WEBP', label: 'WebP', lossy: true },
  { id: 'BMP', label: 'BMP', lossy: false },
  { id: 'GIF', label: 'GIF', lossy: false },
  { id: 'PPM', label: 'PPM', lossy: false },
] as const;

export const RECIPES_KEY = 'kurolight_export_recipes';
