import { AdjustmentMaskType, MaskCombineMode } from '../types/mask';
import { RetouchMode } from '../types/retouch';

export interface ExposureSettings {
  exposure: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

export interface WhiteBalanceSettings {
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
}

export interface DetailSettings {
  sharpening: number;
  noise_reduction: number;
  clarity: number;
  texture: number;
  dehaze: number;
  enhancement_resolution: 0 | 720 | 1080 | 1440 | 2160;
}

export interface GeometrySettings {
  rotation: number;
  straighten: number;
  aspect_ratio: string;
  horizontal_flip: boolean;
  vertical_flip: boolean;
  crop_x: number;
  crop_y: number;
  crop_width: number;
  crop_height: number;
}

export interface LensCorrectionSettings {
  distortion: number;
  chromatic_aberration: number;
  vignette: number;
}

export interface HSLBand {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface HSLSettings {
  red: HSLBand;
  orange: HSLBand;
  yellow: HSLBand;
  green: HSLBand;
  aqua: HSLBand;
  blue: HSLBand;
  purple: HSLBand;
  magenta: HSLBand;
  [key: string]: HSLBand;
}

export interface ColorWheelValue {
  hue: number; // 0 - 360
  saturation: number; // 0 - 1
  luminance: number; // -1 to 1
}

export interface ColorGradingSettings {
  lift: ColorWheelValue; // Shadows
  gamma: ColorWheelValue; // Midtones
  gain: ColorWheelValue; // Highlights
  offset: ColorWheelValue; // Global
  lut_name?: string | null;
  lut_intensity: number;
}

export interface CurvePoint {
  x: number; // 0.0 to 1.0
  y: number; // 0.0 to 1.0
}

export interface ToneCurvesSettings {
  rgb_points: CurvePoint[];
  red_points: CurvePoint[];
  green_points: CurvePoint[];
  blue_points: CurvePoint[];
}

export interface MaskStroke {
  x: number;
  y: number;
  r?: number;
  o?: number;
}

export interface AdjustmentMask {
  id: string;
  name: string;
  mask_type: AdjustmentMaskType;
  enabled: boolean;
  inverted: boolean;
  combine_mode: MaskCombineMode;
  feather: number;
  opacity: number;
  exposure: number;
  contrast: number;
  temperature: number;
  saturation: number;
  clarity: number;
  geometry: Record<string, number | string | MaskStroke[]>;
}

export interface RetouchSpot {
  id: string;
  mode: RetouchMode;
  target_x: number;
  target_y: number;
  source_x: number;
  source_y: number;
  radius: number;
  feather: number;
  opacity: number;
  enabled: boolean;
}

export interface EditSnapshot {
  asset_id: string;
  exposure: ExposureSettings;
  white_balance: WhiteBalanceSettings;
  detail: DetailSettings;
  geometry: GeometrySettings;
  lens_correction: LensCorrectionSettings;
  hsl?: HSLSettings;
  color_grading?: ColorGradingSettings;
  tone_curves?: ToneCurvesSettings;
  masks?: AdjustmentMask[];
  retouch_spots?: RetouchSpot[];
  custom_metadata?: Record<string, unknown>;
}

export interface EditState extends EditSnapshot {
  schema_version?: number;
  snapshots?: Record<string, EditSnapshot>;
}
