export interface Preferences {
  last_workspace?: string;
  performance: {
    enable_gpu: boolean;
    gpu_engine: 'auto' | 'directml' | 'cuda' | 'cpu';
    selected_gpu_device: string;
    preview_max_edge: number;
    preview_quality: 'draft' | 'balanced' | 'high_quality';
    max_cache_mb: number;
    vram_cache_mb: number;
  };
  storage: {
    custom_cache_dir: string;
    backup_schedule: 'never' | 'on_exit' | 'daily' | 'weekly';
    backup_retention_count: number;
    last_backup_at?: string | null;
  };
  import_settings: {
    default_creator: string;
    default_copyright: string;
    default_usage_terms: string;
    duplicate_detection: 'path' | 'hash';
    auto_apply_preset: string;
    raw_preview_priority: 'embedded_jpeg' | 'full_raw';
  };
  color_management: {
    working_space: 'sRGB' | 'Display P3' | 'Adobe RGB (1998)' | 'ProPhoto RGB';
    monitor_icc_profile: string;
    soft_proofing_enabled: boolean;
    gamut_warning_color: string;
  };
  local_ai: {
    strict_offline: boolean;
  };
  appearance: {
    theme: string;
    accent_color: string;
    ui_scale: number;
    startup_workspace: 'remember' | 'library' | 'develop' | 'color_studio' | 'visual_flow' | 'deliver';
    confirm_disk_deletion: boolean;
    warn_discard_crop_edits: boolean;
  };
  external_editor: {
    editor_path: string;
    editor_name: string;
    roundtrip_format: string;
  };
}

export interface StorageStats {
  asset_count: number;
  db_size_bytes: number;
  cache_size_bytes: number;
  cache_file_count: number;
  catalog_path: string;
  cache_path: string;
}

export interface LocalAIModelInfo {
  id: string;
  name: string;
  category: string;
  size_mb: number;
  is_installed: boolean;
  path?: string;
  description: string;
}

export interface AppInfo {
  name: string;
  tagline: string;
  version: string;
  build: string;
  release_channel: string;
  python_version: string;
  platform: string;
  architecture: string;
  config_path: string;
  data_dir: string;
  cache_dir: string;
  working_color_space: string;
  max_cache_mb: number;
  preview_max_edge: number;
  gpu_enabled: boolean;
  github_url: string;
  discord_url: string;
  docs_url: string;
}
