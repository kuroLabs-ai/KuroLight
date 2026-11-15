from pathlib import Path

from PIL import Image

from scripts.build_installer import (
    APP_VERSION,
    ensure_installer_artwork,
    verify_executable_bundles,
)


def test_installer_version_matches_project_metadata():
    assert APP_VERSION == "1.1.1"


def test_installer_artwork_uses_kuro_branding_and_inno_dimensions(tmp_path: Path):
    banner_path, small_path = ensure_installer_artwork(tmp_path)

    with Image.open(banner_path) as banner:
        assert banner.format == "BMP"
        assert banner.size == (164, 314)
        assert banner.mode == "RGB"
    with Image.open(small_path) as small:
        assert small.format == "BMP"
        assert small.size == (55, 55)
        assert small.mode == "RGB"


def test_installer_requires_both_normalized_build_targets(tmp_path: Path):
    onefile = tmp_path / "onefile" / "KuroLight.exe"
    onefolder = tmp_path / "onefolder" / "KuroLight.exe"
    onefile.parent.mkdir(parents=True)
    onefolder.parent.mkdir(parents=True)
    onefile.touch()

    try:
        verify_executable_bundles(tmp_path)
    except FileNotFoundError as error:
        assert str(onefolder) in str(error)
    else:
        raise AssertionError("Missing one-folder bundle should stop installer creation.")

    onefolder.touch()
    assert verify_executable_bundles(tmp_path) == (onefile, onefolder)
