"""Tests validating supported desktop platform behaviors before making platform claims."""

from pathlib import Path

from kurolight.platform.compatibility import PlatformCompatibility


def test_platform_info_detects_valid_desktop_environment():
    info = PlatformCompatibility.get_platform_info()
    assert info.os_name in {"windows", "macos", "linux"}
    assert info.is_64bit is True
    assert info.python_version.startswith("3.")
    assert info.recommended_webview_backend in {
        "edge_webview2",
        "webkit_wkwebview",
        "webkitgtk",
    }
    assert "CPU" in info.supported_accelerators


def test_path_normalization_handles_windows_and_posix_conventions():
    # Windows path normalization
    win_input = "c:/Users/Photographer/Pictures/sample.jpg"
    win_normalized = PlatformCompatibility.normalize_path(win_input, target_os="windows")
    assert win_normalized == r"C:\Users\Photographer\Pictures\sample.jpg"

    # POSIX path normalization
    posix_input = r"D:\Photos\2026\sample.png"
    posix_normalized = PlatformCompatibility.normalize_path(posix_input, target_os="linux")
    assert posix_normalized == "D:/Photos/2026/sample.png"

    # Preserves empty paths
    assert PlatformCompatibility.normalize_path("", target_os="windows") == ""


def test_path_safety_prevents_directory_traversal(tmp_path: Path):
    base_dir = tmp_path / "catalog_imports"
    base_dir.mkdir()
    safe_child = base_dir / "folder" / "photo.jpg"
    unsafe_parent = base_dir / ".." / "system_file.ini"

    assert PlatformCompatibility.is_path_safe(base_dir, safe_child) is True
    assert PlatformCompatibility.is_path_safe(base_dir, unsafe_parent) is False


def test_platform_data_directory_resolution():
    win_dir = PlatformCompatibility.get_data_directory_for_platform(target_os="windows")
    assert "KuroLight" in str(win_dir)

    mac_dir = PlatformCompatibility.get_data_directory_for_platform(target_os="macos")
    assert "Library/Application Support/KuroLight" in mac_dir.as_posix()

    linux_dir = PlatformCompatibility.get_data_directory_for_platform(target_os="linux")
    assert "kurolight" in linux_dir.as_posix().lower()


def test_keyring_backend_verification_returns_diagnostic():
    diag = PlatformCompatibility.verify_keyring_backend()
    assert "backend_class" in diag
    assert "is_usable" in diag
    assert "is_fallback" in diag
