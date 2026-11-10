import json
from pathlib import Path

import pytest
from PIL import Image
from pydantic import ValidationError

from kurolight.domain.editing import EditState
from kurolight.domain.export import ExportFormat, ExportJob, ExportSettings
from kurolight.infrastructure.metadata.extractor import MetadataExtractor
from kurolight.processing.pipeline import DefaultImageProcessor
from kurolight.services.export_service import ExportService
from kurolight.ui.web_bridge import PyBridge


@pytest.mark.parametrize(
    "export_format",
    [
        ExportFormat.JPEG,
        ExportFormat.PNG,
        ExportFormat.TIFF,
        ExportFormat.WEBP,
        ExportFormat.BMP,
        ExportFormat.GIF,
        ExportFormat.PPM,
    ],
)
def test_export_strips_metadata_and_does_not_modify_source(tmp_path, export_format):
    source_path = tmp_path / "source.jpg"
    exif = Image.Exif()
    exif[271] = "KuroLight test camera"
    exif[65000] = "third-party-value"
    Image.new("RGB", (8, 6), "blue").save(source_path, exif=exif)
    original_source = source_path.read_bytes()
    output_path = tmp_path / f"export.{export_format.value}"
    settings = ExportSettings(
        format=export_format,
        output_dir=tmp_path,
    )
    job = ExportJob(
        asset_id="metadata-test",
        asset_name=source_path.name,
        source_path=source_path,
        target_path=output_path,
        settings=settings,
        edit_state=EditState(asset_id="metadata-test"),
    )

    result = ExportService().export_job(job)

    assert result.success, result.error_message
    assert source_path.read_bytes() == original_source
    with Image.open(output_path) as exported:
        assert exported.size == (8, 6)
        exported_exif = exported.getexif()
        assert 271 not in exported_exif
        assert 65000 not in exported_exif
        assert "XML:com.adobe.xmp" not in exported.info


def test_export_rejects_metadata_preservation_instead_of_silently_stripping(tmp_path):
    source_path = tmp_path / "source.png"
    Image.new("RGB", (8, 6), "blue").save(source_path)
    output_path = tmp_path / "export.png"
    job = ExportJob(
        asset_id="metadata-test",
        asset_name=source_path.name,
        source_path=source_path,
        target_path=output_path,
        settings=ExportSettings(
            output_dir=tmp_path,
            strip_metadata=False,
        ),
        edit_state=EditState(asset_id="metadata-test"),
    )

    result = ExportService().export_job(job)

    assert not result.success
    assert "Preserving metadata" in (result.error_message or "")
    assert not output_path.exists()


def test_export_refuses_existing_target_without_changing_it_or_sidecar(tmp_path):
    source_path = tmp_path / "source.png"
    Image.new("RGB", (8, 6), "blue").save(source_path)
    sidecar_path = source_path.with_suffix(".xmp")
    sidecar_path.write_text("<xmp>keep</xmp>", encoding="utf-8")
    target_path = tmp_path / "existing.png"
    target_path.write_bytes(b"existing destination")
    original_source = source_path.read_bytes()
    original_sidecar = sidecar_path.read_bytes()
    job = ExportJob(
        asset_id="metadata-test",
        asset_name=source_path.name,
        source_path=source_path,
        target_path=target_path,
        settings=ExportSettings(output_dir=tmp_path),
        edit_state=EditState(asset_id="metadata-test"),
    )

    result = ExportService().export_job(job)

    assert not result.success
    assert "already exists" in (result.error_message or "")
    assert target_path.read_bytes() == b"existing destination"
    assert source_path.read_bytes() == original_source
    assert sidecar_path.read_bytes() == original_sidecar
    assert not list(tmp_path.glob(".existing.png.*.tmp"))


def test_export_refuses_target_equal_to_source(tmp_path):
    source_path = tmp_path / "photo.png"
    Image.new("RGB", (8, 6), "blue").save(source_path)
    original_source = source_path.read_bytes()
    job = ExportJob(
        asset_id="metadata-test",
        asset_name=source_path.name,
        source_path=source_path,
        target_path=source_path,
        settings=ExportSettings(output_dir=tmp_path),
        edit_state=EditState(asset_id="metadata-test"),
    )

    result = ExportService().export_job(job)

    assert not result.success
    assert "must not overwrite the source" in (result.error_message or "")
    assert source_path.read_bytes() == original_source


def test_extractor_retains_unknown_exif_tags_as_strings(tmp_path):
    source_path = tmp_path / "unknown-tags.jpg"
    exif = Image.Exif()
    exif[271] = "Test Camera"
    exif[65000] = "vendor-specific-value"
    Image.new("RGB", (8, 6), "blue").save(source_path, exif=exif)

    metadata = MetadataExtractor.extract(source_path)

    assert metadata.camera_make == "Test Camera"
    assert metadata.raw_metadata["Make"] == "Test Camera"
    assert metadata.raw_metadata["65000"] == "vendor-specific-value"
    assert all(isinstance(value, str) for value in metadata.raw_metadata.values())


def test_metadata_preservation_default_is_explicitly_disabled():
    settings = ExportSettings(output_dir=Path("."))

    assert settings.strip_metadata


def test_export_filename_uses_metadata_sanitizes_and_matches_format(tmp_path):
    settings = ExportSettings(
        format=ExportFormat.JPEG,
        output_dir=tmp_path,
        filename_pattern="{name}_{date}_{camera}_{unknown}",
    )

    output = ExportService().compute_target_path(
        "portrait.CR3",
        settings,
        {
            "date_captured": "2024:02:03 10/11/12",
            "camera_model": "Camera: Model",
        },
    )

    assert output.name == "portrait_2024_02_03 10_11_12_Camera_ Model_.jpg"


def test_exif_orientation_is_applied_to_preview_export_and_metadata(tmp_path):
    source_path = tmp_path / "portrait.jpg"
    exif = Image.Exif()
    exif[274] = 6
    Image.new("RGB", (8, 4), "red").save(source_path, exif=exif)

    decoded = DefaultImageProcessor().decode(source_path)
    exported_source = ExportService().load_full_resolution_buffer(source_path)
    metadata = MetadataExtractor.extract(source_path)

    assert (decoded.width, decoded.height) == (4, 8)
    assert (exported_source.width, exported_source.height) == (4, 8)
    assert (metadata.width, metadata.height) == (4, 8)


def test_export_resize_modes_preserve_aspect_and_never_upscale(tmp_path):
    service = ExportService()
    source = Image.new("RGB", (80, 40), "blue")
    buffer = service.load_full_resolution_buffer(_save_image(tmp_path, source))

    fit_width = service.apply_resize(
        buffer,
        ExportSettings(
            output_dir=tmp_path,
            resize_mode="fit",
            max_width=40,
        ),
    )
    longest_edge = service.apply_resize(
        buffer,
        ExportSettings(
            output_dir=tmp_path,
            resize_mode="longest_edge",
            max_width=60,
            max_height=60,
        ),
    )
    oversized_target = service.apply_resize(
        buffer,
        ExportSettings(
            output_dir=tmp_path,
            resize_mode="fit",
            max_width=160,
            max_height=80,
        ),
    )

    assert (fit_width.width, fit_width.height) == (40, 20)
    assert (longest_edge.width, longest_edge.height) == (60, 30)
    assert (oversized_target.width, oversized_target.height) == (80, 40)


@pytest.mark.parametrize("dimension", ["max_width", "max_height"])
def test_export_settings_reject_nonpositive_dimensions(tmp_path, dimension):
    with pytest.raises(ValidationError):
        ExportSettings(output_dir=tmp_path, **{dimension: 0})


@pytest.mark.parametrize(
    ("field", "value", "expected_error"),
    [
        ("resize_mode", "invalid", "Unsupported resize mode"),
        ("resize_unit", "inches", "Unsupported resize unit"),
        ("resize_value", 0, "Resize value must be a positive integer"),
    ],
)
def test_export_bridge_rejects_invalid_resize_settings(field, value, expected_error):
    bridge = PyBridge.__new__(PyBridge)
    bridge.export_service = object()
    settings = {"asset_ids": ["photo"], field: value}
    if field == "resize_value":
        settings["resize_mode"] = "fit_width"

    result = json.loads(bridge.export_assets(json.dumps(settings)))

    assert not result["ok"]
    assert expected_error in result["error"]


def _save_image(directory, image):
    path = directory / "resize-source.png"
    image.save(path)
    return path
def _save_image(directory, image):
    path = directory / "resize-source.png"
    image.save(path)
    return path
