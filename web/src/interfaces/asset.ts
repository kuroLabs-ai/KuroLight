import { ImageMetadata, AssetMetadataOverrides } from './metadata';

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

export interface AssetPage {
  assets: ImageAsset[];
  total: number;
  offset: number;
  limit: number;
}

export interface SourceFolder {
  source_folder: string;
  asset_count: number;
}

export interface SourceFolderPage {
  folders: SourceFolder[];
  total: number;
  offset: number;
  limit: number;
}

export interface AssetPageFilters {
  collection_id?: string | null;
  source_folder?: string | null;
  minimum_rating?: number;
  flag?: 'all' | 'flagged' | 'unflagged' | 'rejected';
  search?: string;
  sort_by?: 'file_name' | 'date_taken' | 'rating' | 'file_size';
  ascending?: boolean;
  trash_only?: boolean;
}
