"""Default configuration constants for KuroLight."""

APP_NAME = "KuroLight"
ORGANIZATION_NAME = "KuroLabs"
DEFAULT_SCHEMA_VERSION = 1

# Obsidian Dark Theme & KuroLabs Design System
DEFAULT_THEME = "dark"

COLOR_BACKGROUND = "#101113"
COLOR_SURFACE = "#1A1C20"
COLOR_SURFACE_ELEVATED = "#22252A"
COLOR_SURFACE_HOVER = "#2B2F35"
COLOR_BORDER = "#353A41"
COLOR_BORDER_LIGHT = "#454B54"
COLOR_TEXT_PRIMARY = "#F5F5F5"
COLOR_TEXT_SECONDARY = "#C0C4CA"
COLOR_TEXT_MUTED = "#858B94"
COLOR_TEXT_DISABLED = "#5D626B"

# Single accent color reserved for Deliver
DELIVER_ACCENT_COLOR = "#0088FF"
DEFAULT_ACCENT_COLOR = "#C0C4CA"

# UI Layout Defaults
DEFAULT_WINDOW_WIDTH = 1440
DEFAULT_WINDOW_HEIGHT = 900
DEFAULT_MIN_WINDOW_WIDTH = 1024
DEFAULT_MIN_WINDOW_HEIGHT = 680

# Image Processing Defaults
DEFAULT_WORKING_COLOR_SPACE = "sRGB"
DEFAULT_PREVIEW_MAX_EDGE = 2048
DEFAULT_THUMBNAIL_SIZE = 256
MAX_RECENT_PROJECTS = 10
AUTOSAVE_INTERVAL_SECONDS = 60


from pathlib import Path
import sys


def _resolve_asset(candidates: list[str]) -> Path:
    """Resolve an asset file from frozen bundle, MEIPASS, or repository root."""
    paths: list[Path] = []
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            for name in candidates:
                paths.append(Path(meipass) / "assets" / "icons" / name)
        exe_dir = Path(sys.executable).resolve().parent
        for name in candidates:
            paths.append(exe_dir / "assets" / "icons" / name)
            paths.append(exe_dir / "_internal" / "assets" / "icons" / name)
    for p in Path(__file__).resolve().parents:
        for name in candidates:
            paths.append(p / "assets" / "icons" / name)
    for cand in paths:
        if cand.exists():
            return cand
    return Path(__file__).resolve().parents[2] / "assets" / "icons" / candidates[0]


def get_app_icon_path() -> Path:
    """Find and return absolute path to KuroLight in-app application icon (logo.png)."""
    return _resolve_asset(["logo.png", "logo-preview.png", "app.ico"])


def get_app_watermark_path() -> Path:
    """Find and return absolute path to KuroLight watermark logo (KuroLight-combined_vertical.png)."""
    return _resolve_asset(["KuroLight-combined_vertical.png", "KuroLight_combined_logo_horizontal.png", "logo.png"])


def get_app_wordmark_path() -> Path:
    """Find and return KuroLight watermark / wordmark logo path."""
    return _resolve_asset(["KuroLight-combined_vertical.png", "KuroLight-wordmark.svg", "KuroLight-wordmark.png"])


def get_exe_icon_path() -> Path:
    """Find and return the compiled multi-resolution Windows executable icon (app.ico)."""
    return _resolve_asset(["app.ico", "KuroLight-combined_vertical.png"])
