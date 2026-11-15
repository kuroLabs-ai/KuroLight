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
  creator: string;
  copyright: string;
  usage_terms: string;
}
