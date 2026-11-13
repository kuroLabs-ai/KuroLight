import { ExportPreset } from './preset';
import { WatermarkPosition, WatermarkType } from '../types/export';

export interface ExportRecipe extends ExportPreset {
  filename_pattern: string;
  watermark_enabled: boolean;
  watermark_type?: WatermarkType | 'logo';
  watermark_text: string;
  watermark_opacity: number;
  watermark_position: WatermarkPosition;
}
