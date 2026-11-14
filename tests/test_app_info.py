import json
from unittest.mock import MagicMock, patch
import pytest

from kurolight.ui.web_bridge import PyBridge


def test_get_app_info():
    """Test get_app_info returns expected metadata, version, and community links."""
    mock_app_state = MagicMock()
    mock_lib = MagicMock()
    mock_edit = MagicMock()
    mock_disp = MagicMock()
    bridge = PyBridge(
        app_state=mock_app_state,
        library_service=mock_lib,
        editing_service=mock_edit,
        command_dispatcher=mock_disp,
    )
    raw = bridge.get_app_info()
    data = json.loads(raw)

    assert data["name"] == "KuroLight"
    assert data["version"] == "1.0.0"
    assert "github.com" in data["github_url"]
    assert "discord.gg" in data["discord_url"]
    assert "config_path" in data
    assert "data_dir" in data
    assert "cache_dir" in data
    assert "platform" in data
    assert "python_version" in data


def test_open_external_url():
    """Test open_external_url validates http/https scheme and delegates to webbrowser."""
    mock_app_state = MagicMock()
    mock_lib = MagicMock()
    mock_edit = MagicMock()
    mock_disp = MagicMock()
    bridge = PyBridge(
        app_state=mock_app_state,
        library_service=mock_lib,
        editing_service=mock_edit,
        command_dispatcher=mock_disp,
    )

    # Disallow invalid or dangerous schemes
    assert bridge.open_external_url("file:///etc/passwd") is False
    assert bridge.open_external_url("javascript:alert(1)") is False

    with patch("webbrowser.open", return_value=True) as mock_open:
        res = bridge.open_external_url("https://github.com/KuroLabs/KuroLight")
        assert res is True
        mock_open.assert_called_once_with("https://github.com/KuroLabs/KuroLight")
