export interface ImageMetadata {
  width?: number;
  height?: number;
  camera_make?: string;
  camera_model?: string;
  lens_model?: string;
  iso?: number;
  shutter_speed?: string;
  shutter_speed_str?: string;
  aperture?: number;
  aperture_f_number?: number;
  focal_length?: number;
  focal_length_mm?: number;
  capture_date?: string;
  format?: string;
  exposure_compensation?: number;
  [key: string]: unknown;
}

export interface AssetMetadataOverrides {
  title: string;
  description: string;
  keywords: string[];
  copyright: string;
}

export interface ImageAsset {
  id: string;
  file_name: string;
  filename?: string;
  source_path: string;
  file_path?: string;
  file_size?: number;
  file_size_bytes?: number;
  width?: number;
  height?: number;
  rating: number; // 0 to 5
  flag: string; // 'flagged' (pick), 'unflagged', 'rejected'
  deleted_at?: string | null;
  thumbnail_url?: string;
  camera_model?: string;
  lens_model?: string;
  iso?: number;
  shutter_speed?: string;
  f_number?: number;
  focal_length?: number;
  date_taken?: string;
  format?: string;
  metadata?: ImageMetadata;
  metadata_overrides?: AssetMetadataOverrides;
}

export interface ColorScopeData {
  width: number;
  height: number;
  data: number[];
}

export interface ColorScopes {
  waveform: ColorScopeData;
  vectorscope: ColorScopeData;
}

export interface Collection {
  id: string;
  name: string;
  parent_id?: string | null;
  collection_type?: 'manual' | 'smart';
  rules?: SmartCollectionRules;
  asset_ids?: string[];
  asset_count?: number;
  created_at?: string;
}

export interface SmartCollectionRules {
  search: string;
  minimum_rating: number;
  flag: 'all' | 'flagged' | 'unflagged' | 'rejected';
  source_folder: string | null;
}

export interface ExposureSettings {
  exposure: number;
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
  saturation: number; // 0 - 100
  luminance: number; // -100 to 100
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

export type AdjustmentMaskType = 'linear' | 'radial' | 'brush' | 'luminance_range' | 'color_range';
export type MaskCombineMode = 'replace' | 'add' | 'subtract' | 'intersect';

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

export type RetouchMode = 'heal' | 'clone';

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

export interface Preset {
  id: string;
  name: string;
  category: string;
  parameters?: unknown;
}

export interface EditState {
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
  snapshots?: Record<string, unknown>;
  custom_metadata?: Record<string, unknown>;
}

export type WorkspaceId = 'library' | 'develop' | 'color_studio' | 'visual_flow' | 'deliver';

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
