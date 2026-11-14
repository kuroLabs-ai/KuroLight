import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest

from kurolight.config.app_config import AppConfig
from kurolight.ui.web_bridge import PyBridge


@pytest.fixture
def bridge_instance(tmp_path: Path):
    mock_app_state = MagicMock()
    mock_lib = MagicMock()
    mock_lib.get_asset_count.return_value = 42
    mock_edit = MagicMock()
    mock_disp = MagicMock()
    bridge = PyBridge(
        app_state=mock_app_state,
        library_service=mock_lib,
        editing_service=mock_edit,
        command_dispatcher=mock_disp,
    )
    return bridge


def test_get_and_save_preferences(bridge_instance):
    """Test get_preferences and save_preferences roundtrip across all sections."""
    raw = bridge_instance.get_preferences()
    prefs = json.loads(raw)

    assert "performance" in prefs
    assert "storage" in prefs
    assert "import_settings" in prefs
    assert "color_management" in prefs
    assert "local_ai" in prefs
    assert "appearance" in prefs
    assert "external_editor" in prefs

    # Test update
    update = {
        "performance": {"enable_gpu": True, "preview_quality": "high_quality"},
        "color_management": {"working_space": "Display P3"},
        "appearance": {"accent_color": "#10B981"},
    }
    saved_raw = bridge_instance.save_preferences(json.dumps(update))
    saved = json.loads(saved_raw)

    assert saved["performance"]["preview_quality"] == "high_quality"
    assert saved["color_management"]["working_space"] == "Display P3"
    assert saved["appearance"]["accent_color"] == "#10B981"


def test_storage_stats(bridge_instance):
    """Test get_storage_stats returns correct structure."""
    raw = bridge_instance.get_storage_stats()
    stats = json.loads(raw)

    assert "asset_count" in stats
    assert "db_size_bytes" in stats
    assert "cache_size_bytes" in stats
    assert "cache_file_count" in stats
    assert "catalog_path" in stats
    assert "cache_path" in stats
    assert stats["asset_count"] == 42


def test_clear_cache(bridge_instance, tmp_path, monkeypatch):
    """Test clear_cache deletes files in cache dir."""
    cache_dir = tmp_path / "test_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    f1 = cache_dir / "preview1.jpg"
    f1.write_bytes(b"12345")
    f2 = cache_dir / "thumb1.jpg"
    f2.write_bytes(b"67890")

    monkeypatch.setattr(AppConfig, "get_cache_dir", classmethod(lambda cls: cache_dir))

    raw = bridge_instance.clear_cache()
    res = json.loads(raw)
    assert res["ok"] is True
    assert res["freed_bytes"] == 10
    assert not f1.exists()
    assert not f2.exists()


def test_local_ai_status(bridge_instance):
    """Test get_local_ai_status returns models list."""
    raw = bridge_instance.get_local_ai_status()
    data = json.loads(raw)
    assert "models" in data
    assert any(m["id"] == "realesrgan_x4" for m in data["models"])
