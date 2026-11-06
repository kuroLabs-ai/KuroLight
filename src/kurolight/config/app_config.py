"""Application configuration handling using Pydantic and platformdirs."""

from pathlib import Path
from typing import Optional
from platformdirs import user_config_dir, user_data_dir, user_cache_dir
from pydantic import BaseModel, Field

from kurolight.config.defaults import (
    APP_NAME,
    ORGANIZATION_NAME,
    DEFAULT_THEME,
    DEFAULT_ACCENT_COLOR,
    DEFAULT_WORKING_COLOR_SPACE,
    DEFAULT_PREVIEW_MAX_EDGE,
    AUTOSAVE_INTERVAL_SECONDS,
)


class AppearanceSettings(BaseModel):
    """Visual appearance preferences."""
    theme: str = DEFAULT_THEME
    accent_color: str = DEFAULT_ACCENT_COLOR
    ui_scale: float = 1.0
    font_family: str = "Inter, Segoe UI, sans-serif"
    startup_workspace: str = "remember"  # remember, library, develop, color_studio, visual_flow, deliver
    confirm_disk_deletion: bool = True
    warn_discard_crop_edits: bool = True


class PerformanceSettings(BaseModel):
    """Processing and cache preferences."""
    enable_gpu: bool = True
    gpu_engine: str = "auto"  # auto, directml, cuda, cpu
    selected_gpu_device: str = "Auto-detect High Performance"
    preview_max_edge: int = DEFAULT_PREVIEW_MAX_EDGE
    preview_quality: str = "balanced"  # draft, balanced, high_quality
    max_cache_mb: int = 4096
    vram_cache_mb: int = 2048


class StorageSettings(BaseModel):
    """Disk storage, caching, and database maintenance settings."""
    custom_cache_dir: Optional[str] = None
    backup_schedule: str = "on_exit"  # never, on_exit, daily, weekly
    backup_retention_count: int = 5


class ImportSettings(BaseModel):
    """Metadata defaults and photo ingestion rules."""
    default_creator: str = ""
    default_copyright: str = "© 2026 KuroLabs. All rights reserved."
    default_usage_terms: str = "All rights reserved"
    duplicate_detection: str = "path"  # path, hash
    auto_apply_preset: str = "None"
    raw_preview_priority: str = "embedded_jpeg"  # embedded_jpeg, full_raw


class ColorManagementSettings(BaseModel):
    """Color management and proofing settings."""
    working_space: str = "sRGB"  # sRGB, Display P3, Adobe RGB (1998), ProPhoto RGB
    monitor_icc_profile: str = "System Default"
    soft_proofing_enabled: bool = False
    gamut_warning_color: str = "#FF00FF"  # Magenta


class LocalAISettings(BaseModel):
    """Offline AI models configuration."""
    strict_offline: bool = False


class ExternalEditorSettings(BaseModel):
    """Third-party desktop photo editor configuration."""
    editor_path: str = ""
    editor_name: str = "Photoshop"  # Photoshop, Affinity Photo, GIMP, Capture One, Custom
    roundtrip_format: str = "TIFF (16-bit)"  # TIFF (16-bit), PSD, PNG


class AISettings(BaseModel):
    """Kuro AI preferences and privacy controls."""
    provider: str = "gemini"  # gemini, openai, anthropic
    model: Optional[str] = "gemini-2.5-flash"
    shortcut: str = "Ctrl+K"
    auto_routing: bool = True
    send_image_context: bool = True
    privacy_disclosure_accepted: bool = False
    privacy_disclosure_version: str = "2026-11"
    allow_local_model_downloads: bool = False


class EditingSettings(BaseModel):
    """Photographic and color defaults."""
    default_color_space: str = DEFAULT_WORKING_COLOR_SPACE
    autosave_interval: int = AUTOSAVE_INTERVAL_SECONDS
    undo_limit: int = 100


class AppConfig(BaseModel):
    """Root configuration object for KuroLight."""
    schema_version: int = 1
    appearance: AppearanceSettings = Field(default_factory=AppearanceSettings)
    performance: PerformanceSettings = Field(default_factory=PerformanceSettings)
    storage: StorageSettings = Field(default_factory=StorageSettings)
    import_settings: ImportSettings = Field(default_factory=ImportSettings)
    color_management: ColorManagementSettings = Field(default_factory=ColorManagementSettings)
    local_ai: LocalAISettings = Field(default_factory=LocalAISettings)
    external_editor: ExternalEditorSettings = Field(default_factory=ExternalEditorSettings)
    ai: AISettings = Field(default_factory=AISettings)
    editing: EditingSettings = Field(default_factory=EditingSettings)
    last_workspace: str = "library"
    last_project_path: Optional[str] = None

    @classmethod
    def get_data_dir(cls) -> Path:
        """Return application user data directory."""
        path = Path(user_data_dir(appname=APP_NAME, appauthor=ORGANIZATION_NAME))
        path.mkdir(parents=True, exist_ok=True)
        return path

    @classmethod
    def get_config_dir(cls) -> Path:
        """Return application config directory."""
        path = Path(user_config_dir(appname=APP_NAME, appauthor=ORGANIZATION_NAME))
        path.mkdir(parents=True, exist_ok=True)
        return path

    @classmethod
    def get_cache_dir(cls) -> Path:
        """Return application cache directory."""
        path = Path(user_cache_dir(appname=APP_NAME, appauthor=ORGANIZATION_NAME))
        path.mkdir(parents=True, exist_ok=True)
        return path

    @classmethod
    def get_config_file_path(cls) -> Path:
        """Return path to config.json."""
        return cls.get_config_dir() / "config.json"

    @classmethod
    def load(cls) -> "AppConfig":
        """Load configuration from disk, or return default if not found."""
        config_file = cls.get_config_file_path()
        if config_file.exists():
            try:
                content = config_file.read_text(encoding="utf-8")
                return cls.model_validate_json(content)
            except Exception:
                return cls()
        return cls()

    def save(self) -> None:
        """Persist current configuration to disk."""
        config_file = self.get_config_file_path()
        config_file.parent.mkdir(parents=True, exist_ok=True)
        config_file.write_text(self.model_dump_json(indent=2), encoding="utf-8")
