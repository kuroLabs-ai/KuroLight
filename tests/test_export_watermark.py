import os

import numpy as np
import pytest

from kurolight.domain.export import ExportSettings
from kurolight.processing.buffer import ImageBuffer
from kurolight.services import export_service
from kurolight.services.export_service import ExportService

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtGui import QGuiApplication

_qt_app = QGuiApplication.instance() or QGuiApplication([])


def _buffer(channels=3):
    data = np.full((256, 256, channels), 0.25, dtype=np.float32)
    if channels == 4:
        data[..., 3] = 0.6
    return ImageBuffer.from_numpy(data)


def test_app_icon_watermark_composites_without_mutating_source(tmp_path):
    source = _buffer()
    original = source.data.copy()
    settings = ExportSettings(
        output_dir=tmp_path,
        watermark_enabled=True,
        watermark_type="app_icon",
        watermark_opacity=0.75,
        watermark_position="bottom_right",
    )

    result = ExportService().apply_watermark(source, settings)

    assert result.data.shape == source.data.shape
    assert not np.array_equal(result.data, original)
    np.testing.assert_array_equal(source.data, original)
    assert np.any(result.data[200:, 200:] != original[200:, 200:])


def test_app_icon_watermark_respects_zero_opacity_and_preserves_image_alpha(tmp_path):
    source = _buffer(channels=4)
    settings = ExportSettings(
        output_dir=tmp_path,
        watermark_type="app_icon",
        watermark_opacity=0,
    )

    result = ExportService().apply_watermark(source, settings)

    np.testing.assert_array_equal(result.data[..., 3], source.data[..., 3])
    np.testing.assert_array_equal(result.data[..., :3], source.data[..., :3])


def test_text_watermark_remains_available(tmp_path):
    source = _buffer()
    settings = ExportSettings(
        output_dir=tmp_path,
        watermark_type="text",
        watermark_text="KuroLight",
    )

    result = ExportService().apply_watermark(source, settings)

    assert not np.array_equal(result.data, source.data)


def test_wordmark_watermark_renders_svg_and_preserves_image_dimensions(tmp_path):
    source = _buffer()
    settings = ExportSettings(
        output_dir=tmp_path,
        watermark_type="wordmark",
        watermark_opacity=0.8,
        watermark_position="bottom_right",
    )

    result = ExportService().apply_watermark(source, settings)

    assert result.data.shape == source.data.shape
    assert np.any(result.data[200:, 175:] != source.data[200:, 175:])


def test_wordmark_watermark_uses_compact_size(tmp_path, monkeypatch):
    source = ImageBuffer.from_numpy(np.full((300, 300, 3), 0.25, dtype=np.float32))
    load_sizes = []
    load_watermark_image = export_service._load_watermark_image

    def track_load_size(watermark_type, width, height):
        load_sizes.append((width, height))
        return load_watermark_image(watermark_type, width, height)

    monkeypatch.setattr(export_service, "_load_watermark_image", track_load_size)
    settings = ExportSettings(
        output_dir=tmp_path,
        watermark_type="wordmark",
        watermark_opacity=0.8,
        watermark_position="bottom_right",
    )

    ExportService().apply_watermark(source, settings)

    assert len(load_sizes) == 1
    assert load_sizes[0][0] == 54
    assert load_sizes[0][1] in (14, 64)


@pytest.mark.parametrize("height,width", [(400, 1200), (1200, 400), (500, 500)])
@pytest.mark.parametrize(
    ("position", "quadrant"),
    [
        ("bottom_right", (True, True)),
        ("bottom_left", (False, True)),
        ("top_right", (True, False)),
        ("center", None),
    ],
)
@pytest.mark.parametrize("watermark_type", ["text", "app_icon", "wordmark"])
def test_watermarks_stay_within_varied_aspect_ratios_and_positions(
    tmp_path, height, width, position, quadrant, watermark_type
):
    source = ImageBuffer.from_numpy(
        np.full((height, width, 3), 0.25, dtype=np.float32)
    )
    settings = ExportSettings(
        output_dir=tmp_path,
        watermark_type=watermark_type,
        watermark_text="Kuro",
        watermark_opacity=0.8,
        watermark_position=position,
    )

    result = ExportService().apply_watermark(source, settings)
    changed = np.any(np.abs(result.data - source.data) > 1e-6, axis=2)
    ys, xs = np.where(changed)

    assert result.data.shape == source.data.shape
    assert len(xs) > 0
    assert xs.min() >= 0 and xs.max() < width
    assert ys.min() >= 0 and ys.max() < height
    center_x = (float(xs.min()) + float(xs.max())) / 2
    center_y = (float(ys.min()) + float(ys.max())) / 2
    if quadrant is None:
        assert abs(center_x - width / 2) < width * 0.1
        assert abs(center_y - height / 2) < height * 0.1
    else:
        right, bottom = quadrant
        assert (center_x >= width / 2) is right
        assert (center_y >= height / 2) is bottom


def test_long_text_watermark_fits_narrow_portrait_without_clipping(tmp_path):
    source = ImageBuffer.from_numpy(
        np.full((900, 100, 3), 0.25, dtype=np.float32)
    )
    settings = ExportSettings(
        output_dir=tmp_path,
        watermark_type="text",
        watermark_text="A long KuroLight watermark string",
        watermark_opacity=0.8,
        watermark_position="bottom_right",
    )

    result = ExportService().apply_watermark(source, settings)
    changed = np.any(np.abs(result.data - source.data) > 1e-6, axis=2)
    ys, xs = np.where(changed)

    assert len(xs) > 0
    assert xs.min() >= 0 and xs.max() < source.width
    assert ys.min() >= 0 and ys.max() < source.height
    assert xs.max() - xs.min() <= source.width - 10
    assert xs.max() >= source.width - 10


def test_text_watermark_zero_opacity_preserves_pixels_and_alpha(tmp_path):
    source = _buffer(channels=4)
    settings = ExportSettings(
        output_dir=tmp_path,
        watermark_type="text",
        watermark_text="KuroLight",
        watermark_opacity=0,
    )

    result = ExportService().apply_watermark(source, settings)

    np.testing.assert_array_equal(result.data, source.data)


def test_export_embeds_srgb_icc_profile(tmp_path):
    from PIL import Image
    from kurolight.domain.editing import EditState
    from kurolight.domain.export import ExportFormat, ExportJob, ExportSettings

    # Create dummy source image
    src_file = tmp_path / "input.jpg"
    img = Image.new("RGB", (64, 64), (120, 80, 40))
    img.save(src_file, "JPEG")

    job = ExportJob(
        asset_id="test_photo",
        asset_name="test_photo",
        source_path=src_file,
        edit_state=EditState(asset_id="test_photo"),
        settings=ExportSettings(
            output_dir=tmp_path / "out",
            format=ExportFormat.JPEG,
            strip_metadata=True,
        ),
    )

    svc = ExportService()
    res = svc.export_job(job)

    assert res.output_path.exists()
    with Image.open(res.output_path) as exported:
        assert "icc_profile" in exported.info
        assert len(exported.info["icc_profile"]) > 0
