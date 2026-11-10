import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image

from kurolight.processing.raw.decoder import DefaultRawDecoder, RAW_EXTENSIONS


def _write_tiff_with_raw_extension(path: Path) -> None:
    Image.new("RGB", (8, 4), (64, 128, 192)).save(path, format="TIFF")


def test_raw_decoder_extension_allowlist_is_explicit():
    decoder = DefaultRawDecoder()

    for extension in RAW_EXTENSIONS:
        assert decoder.can_decode(Path(f"camera{extension.upper()}"))
    assert not decoder.can_decode(Path("camera.x3f"))
    assert not decoder.can_decode(Path("photo.jpg"))


def test_rawpy_uses_camera_white_balance_srgb_and_16bit_output(tmp_path, monkeypatch):
    source_path = tmp_path / "camera.cr2"
    source_path.write_bytes(b"test raw")
    calls = {}

    class FakeRaw:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def postprocess(self, **kwargs):
            calls["postprocess"] = kwargs
            return np.full((4, 8, 3), 32768, dtype=np.uint16)

    def imread(path):
        calls["path"] = path
        return FakeRaw()

    fake_rawpy = SimpleNamespace(
        imread=imread,
        ColorSpace=SimpleNamespace(sRGB="sRGB"),
    )
    monkeypatch.setitem(sys.modules, "rawpy", fake_rawpy)
    decoder = DefaultRawDecoder()
    decoder._rawpy_available = True

    result = decoder.decode_raw(source_path, half_size=True)

    assert calls["path"] == str(source_path.resolve())
    assert calls["postprocess"] == {
        "half_size": True,
        "use_camera_wb": True,
        "output_color": "sRGB",
        "output_bps": 16,
    }
    assert result.data.dtype == np.float32
    assert result.data.shape == (4, 8, 3)
    assert result.data[0, 0, 0] == pytest.approx(32768 / 65535)


def test_pillow_fallback_decodes_readable_raster_data_with_raw_extension(tmp_path):
    source_path = tmp_path / "camera.dng"
    _write_tiff_with_raw_extension(source_path)
    decoder = DefaultRawDecoder()
    decoder._rawpy_available = False

    result = decoder.decode_raw(source_path)

    assert result.data.shape == (4, 8, 3)
    np.testing.assert_allclose(result.data[0, 0], np.array([64, 128, 192]) / 255)


def test_rawpy_failure_uses_pillow_fallback(tmp_path, monkeypatch):
    source_path = tmp_path / "camera.nef"
    _write_tiff_with_raw_extension(source_path)
    fake_rawpy = SimpleNamespace(
        imread=lambda _path: (_ for _ in ()).throw(RuntimeError("unsupported raw")),
        ColorSpace=SimpleNamespace(sRGB="sRGB"),
    )
    monkeypatch.setitem(sys.modules, "rawpy", fake_rawpy)
    decoder = DefaultRawDecoder()
    decoder._rawpy_available = True

    result = decoder.decode_raw(source_path)

    assert result.data.shape == (4, 8, 3)
    np.testing.assert_allclose(result.data[0, 0], np.array([64, 128, 192]) / 255)


def test_unreadable_raw_file_fails_with_path_context(tmp_path):
    source_path = tmp_path / "broken.arw"
    source_path.write_bytes(b"not an image")
    decoder = DefaultRawDecoder()
    decoder._rawpy_available = False

    with pytest.raises(RuntimeError, match="Unable to decode RAW file"):
        decoder.decode_raw(source_path)
