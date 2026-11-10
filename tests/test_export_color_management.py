"""Tests for export color management and sRGB ICC profile embedding."""

from pathlib import Path
from PIL import Image
from kurolight.domain.editing import EditState
from kurolight.domain.export import ExportFormat, ExportJob, ExportSettings
from kurolight.services.export_service import ExportService, get_srgb_profile_bytes


def test_get_srgb_profile_bytes():
    """Verify get_srgb_profile_bytes returns non-empty cached ICC profile data."""
    prof1 = get_srgb_profile_bytes()
    assert isinstance(prof1, bytes)
    assert len(prof1) > 200
    prof2 = get_srgb_profile_bytes()
    assert prof1 is prof2


def _create_test_source_image(path: Path) -> Path:
    img = Image.new("RGB", (100, 100), color=(180, 100, 50))
    img.save(path, format="JPEG")
    return path


def test_export_embeds_srgb_icc_profile_across_formats(tmp_path: Path):
    """Verify that JPEG, PNG, TIFF, and WebP all embed the canonical sRGB ICC profile."""
    src = _create_test_source_image(tmp_path / "source.jpg")
    service = ExportService()
    edit_state = EditState(asset_id="test_photo")

    formats = [
        ExportFormat.JPEG,
        ExportFormat.PNG,
        ExportFormat.TIFF,
        ExportFormat.WEBP,
    ]

    for fmt in formats:
        settings = ExportSettings(
            format=fmt,
            quality=90,
            output_dir=tmp_path,
        )
        job = ExportJob(
            asset_id=f"test_{fmt.value}",
            asset_name=f"test_{fmt.value}",
            source_path=src,
            settings=settings,
            edit_state=edit_state,
        )

        res = service.export_job(job)
        assert res.success is True
        assert res.output_path.exists()

        # Inspect exported file for embedded ICC profile
        with Image.open(res.output_path) as out_img:
            icc = out_img.info.get("icc_profile")
            assert icc is not None, f"Format {fmt.value} missing embedded ICC profile"
            assert len(icc) > 0, f"Format {fmt.value} has empty ICC profile"


def test_downscaled_export_retains_icc_profile(tmp_path: Path):
    """Verify that resizing/downscaling during export preserves embedded ICC profile."""
    src = _create_test_source_image(tmp_path / "source_large.jpg")
    service = ExportService()
    edit_state = EditState(asset_id="test_photo")

    from kurolight.domain.export import ResizeMode
    settings = ExportSettings(
        format=ExportFormat.JPEG,
        resize_mode=ResizeMode.FIT,
        max_width=50,
        max_height=50,
        output_dir=tmp_path,
    )
    job = ExportJob(
        asset_id="test_downscale",
        asset_name="test_downscale",
        source_path=src,
        settings=settings,
        edit_state=edit_state,
    )

    res = service.export_job(job)
    assert res.success is True
    with Image.open(res.output_path) as out_img:
        assert out_img.width <= 50
        assert out_img.height <= 50
        assert out_img.info.get("icc_profile") is not None
