"""Application configuration handling using Pydantic and platformdirs."""

from pathlib import Path
from typing import ClassVar, Literal, Optional

from platformdirs import user_cache_dir, user_config_dir, user_data_dir
from pydantic import BaseModel, ConfigDict, Field

from kurolight.config.defaults import (
    APP_NAME,
    AUTOSAVE_INTERVAL_SECONDS,
    DEFAULT_ACCENT_COLOR,
    DEFAULT_PREVIEW_MAX_EDGE,
    DEFAULT_THEME,
    DEFAULT_WORKING_COLOR_SPACE,
    ORGANIZATION_NAME,
)


class AppearanceSettings(BaseModel):
    """Visual appearance preferences."""
    model_config = ConfigDict(validate_assignment=True)

    theme: str = DEFAULT_THEME
    accent_color: str = DEFAULT_ACCENT_COLOR
    ui_scale: float = 1.0
    font_family: str = "Inter, Segoe UI, sans-serif"
    startup_workspace: Literal[
        "remember", "library", "develop", "color_studio", "visual_flow", "deliver"
    ] = "remember"
    confirm_disk_deletion: bool = True
    warn_discard_crop_edits: bool = True


class PerformanceSettings(BaseModel):
    """Processing and cache preferences."""
    model_config = ConfigDict(validate_assignment=True)

    enable_gpu: bool = True
    gpu_engine: Literal["auto", "directml", "cuda", "cpu"] = "auto"
    selected_gpu_device: str = "Auto-detect High Performance"
    preview_max_edge: int = Field(default=DEFAULT_PREVIEW_MAX_EDGE, ge=512, le=8192)
    preview_quality: Literal["draft", "balanced", "high_quality"] = "balanced"
    max_cache_mb: int = Field(default=4096, ge=128, le=65536)
    vram_cache_mb: int = 2048


class StorageSettings(BaseModel):
    """Disk storage, caching, and database maintenance settings."""
    model_config = ConfigDict(validate_assignment=True)

    custom_cache_dir: Optional[str] = None
    backup_schedule: Literal["never", "on_exit", "daily", "weekly"] = "on_exit"
    backup_retention_count: int = Field(default=5, ge=1, le=50)
    last_backup_at: Optional[str] = None


class ImportSettings(BaseModel):
    """Metadata defaults and photo ingestion rules."""
    model_config = ConfigDict(validate_assignment=True)

    default_creator: str = ""
    default_copyright: str = "© 2026 KuroLabs. All rights reserved."
    default_usage_terms: str = "All rights reserved"
    duplicate_detection: Literal["path", "hash"] = "path"
    auto_apply_preset: str = "None"
    raw_preview_priority: str = "embedded_jpeg"  # embedded_jpeg, full_raw


class ColorManagementSettings(BaseModel):
    """Color management and proofing settings."""
    working_space: Literal[
        "sRGB", "Display P3", "Adobe RGB (1998)", "ProPhoto RGB"
    ] = "sRGB"
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
    _cache_dir_override: ClassVar[Optional[Path]] = None

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
        path = cls._cache_dir_override or Path(
            user_cache_dir(appname=APP_NAME, appauthor=ORGANIZATION_NAME)
        )
        path.mkdir(parents=True, exist_ok=True)
        return path

    @classmethod
    def _activate_cache_dir(cls, config: "AppConfig") -> None:
        configured_path = config.storage.custom_cache_dir
        cls._cache_dir_override = (
            Path(configured_path).expanduser().resolve()
            if configured_path and configured_path.strip()
            else None
        )

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
                config = cls.model_validate_json(content)
            except Exception:
                config = cls()
        else:
            config = cls()
        cls._activate_cache_dir(config)
        return config

    def save(self) -> None:
        """Persist current configuration to disk."""
        config_file = self.get_config_file_path()
        config_file.parent.mkdir(parents=True, exist_ok=True)
        config_file.write_text(self.model_dump_json(indent=2), encoding="utf-8")
        self._activate_cache_dir(self)
