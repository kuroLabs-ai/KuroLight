import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pytest

from kurolight.config.app_config import AppConfig
from kurolight.processing.buffer import ImageBuffer
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
    cache_root = tmp_path / "test_cache"
    cache_dir = cache_root / "thumbnails"
    cache_dir.mkdir(parents=True, exist_ok=True)
    f1 = cache_dir / "preview1.jpg"
    f1.write_bytes(b"12345")
    f2 = cache_dir / "thumb1.jpg"
    f2.write_bytes(b"67890")

    monkeypatch.setattr(AppConfig, "get_cache_dir", classmethod(lambda cls: cache_root))

    raw = bridge_instance.clear_cache()
    res = json.loads(raw)
    assert res["ok"] is True
    assert res["freed_bytes"] == 10
    assert not f1.exists()
    assert not f2.exists()


def test_strict_offline_blocks_network_backed_ai_calls(bridge_instance):
    bridge_instance.config.local_ai.strict_offline = True

    with pytest.raises(RuntimeError, match="Strict Offline Privacy Mode"):
        bridge_instance.get_ai_models("gemini")
    with pytest.raises(RuntimeError, match="Strict Offline Privacy Mode"):
        bridge_instance.propose_ai_edits("Improve the photo")
    with pytest.raises(RuntimeError, match="Strict Offline Privacy Mode"):
        bridge_instance.download_local_enhancement_model()
    assert bridge_instance.open_external_url("https://example.com") is False


def test_custom_cache_directory_is_used_after_config_save(tmp_path, monkeypatch):
    config_path = tmp_path / "config.json"
    monkeypatch.setattr(
        AppConfig,
        "get_config_file_path",
        classmethod(lambda cls: config_path),
    )
    AppConfig._cache_dir_override = None

    config = AppConfig()
    custom_cache = tmp_path / "custom-cache"
    config.storage.custom_cache_dir = str(custom_cache)
    config.save()

    assert AppConfig.get_cache_dir() == custom_cache.resolve()
    assert custom_cache.is_dir()
    AppConfig._cache_dir_override = None


def test_daily_backup_runs_at_startup_and_applies_retention(
    bridge_instance, tmp_path, monkeypatch
):
    backups_dir = tmp_path / "backups"
    backups_dir.mkdir()
    for index in range(3):
        old_backup = backups_dir / f"catalog_backup_old_{index}.db"
        old_backup.write_bytes(b"old")
        old_backup_time = 1_700_000_000 + index
        os.utime(old_backup, (old_backup_time, old_backup_time))

    class ProjectService:
        def backup_catalog(self, destination):
            destination.write_bytes(b"verified")
            return destination

    monkeypatch.setattr(
        AppConfig, "get_data_dir", classmethod(lambda cls: tmp_path)
    )
    bridge_instance.project_service = ProjectService()
    bridge_instance.config.storage.backup_schedule = "daily"
    bridge_instance.config.storage.backup_retention_count = 2
    bridge_instance.config.storage.last_backup_at = None

    bridge_instance._run_scheduled_backup(on_exit=False)

    assert len(list(backups_dir.glob("catalog_backup_*.db"))) == 2
    assert bridge_instance.config.storage.last_backup_at


def test_preview_quality_and_edge_limit_downsample_browser_source(bridge_instance):
    source = ImageBuffer.from_numpy(
        np.ones((1024, 2048, 3), dtype=np.float32)
    )
    bridge_instance.config.performance.preview_max_edge = 512
    bridge_instance.config.performance.preview_quality = "balanced"

    balanced = bridge_instance._prepare_source_preview(source)
    bridge_instance.config.performance.preview_quality = "draft"
    draft = bridge_instance._prepare_source_preview(source)

    assert max(balanced.width, balanced.height) == 512
    assert max(draft.width, draft.height) == 332
    assert (source.width, source.height) == (2048, 1024)


def test_local_ai_status(bridge_instance):
    """Test get_local_ai_status returns models list."""
    raw = bridge_instance.get_local_ai_status()
    data = json.loads(raw)
    assert "models" in data
    assert any(m["id"] == "realesrgan_x4" for m in data["models"])
