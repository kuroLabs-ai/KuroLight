"""Tests for application branding assets, icon discovery, and default configuration."""

from PIL import Image
from kurolight.config.defaults import (
    APP_NAME,
    ORGANIZATION_NAME,
    DEFAULT_THEME,
    DEFAULT_WORKING_COLOR_SPACE,
    get_app_icon_path,
    get_app_watermark_path,
    get_app_wordmark_path,
    get_exe_icon_path,
)
from kurolight.config.app_config import AppConfig


def test_app_constants():
    """Verify application naming and color space constants."""
    assert APP_NAME == "KuroLight"
    assert ORGANIZATION_NAME == "KuroLabs"
    assert DEFAULT_THEME == "dark"
    assert DEFAULT_WORKING_COLOR_SPACE == "sRGB"


def test_app_icon_exists_and_is_logo_png():
    """Verify get_app_icon_path resolves to in-app logo.png."""
    icon_path = get_app_icon_path()
    assert icon_path.exists(), f"App icon not found at {icon_path}"
    assert icon_path.is_file()
    assert "logo.png" in icon_path.name.lower()

    with Image.open(icon_path) as img:
        assert img.format == "PNG"
        assert img.width >= 32
        assert img.height >= 32


def test_app_watermark_is_combined_vertical():
    """Verify get_app_watermark_path resolves to KuroLight-combined_vertical.png."""
    watermark_path = get_app_watermark_path()
    assert watermark_path.exists(), f"Watermark not found at {watermark_path}"
    assert watermark_path.is_file()
    assert "combined_vertical" in watermark_path.name.lower()

    with Image.open(watermark_path) as img:
        assert img.format == "PNG"
        assert img.width >= 100
        assert img.height >= 100


def test_exe_icon_exists():
    """Verify get_exe_icon_path resolves to app.ico."""
    exe_icon = get_exe_icon_path()
    assert exe_icon.exists(), f"Exe icon not found at {exe_icon}"
    assert exe_icon.is_file()


def test_app_wordmark_exists():
    """Verify get_app_wordmark_path resolves to an existing branding asset."""
    wordmark_path = get_app_wordmark_path()
    assert wordmark_path.exists(), f"Wordmark not found at {wordmark_path}"
    assert wordmark_path.is_file()


def test_app_config_directories():
    """Verify AppConfig resolves data, cache, and project directories."""
    data_dir = AppConfig.get_data_dir()
    cache_dir = AppConfig.get_cache_dir()
    assert data_dir is not None
    assert cache_dir is not None
    assert "kurolight" in str(data_dir).lower()
