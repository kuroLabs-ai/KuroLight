from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from kurolight.domain.assets import ImageAsset
from kurolight.processing.buffer import ImageBuffer
from kurolight.processing.color.scopes import HistogramData, ScopesCalculator
from kurolight.ui.web_bridge import PyBridge


def _buffer(data: np.ndarray) -> ImageBuffer:
    return ImageBuffer.from_numpy(data.astype(np.float32), color_space="sRGB")


def test_waveform_places_black_at_bottom_and_white_at_top() -> None:
    image = np.zeros((2, 4, 3), dtype=np.float32)
    image[0, :, :] = 1.0

    waveform = ScopesCalculator.compute_waveform(_buffer(image), width=4, height=8)

    assert waveform.shape == (8, 4)
    assert np.all(waveform[0] > 0)
    assert np.all(waveform[-1] > 0)
    assert np.count_nonzero(waveform[1:-1]) == 0


def test_vectorscope_places_neutral_gray_at_center() -> None:
    image = np.full((8, 8, 3), 0.5, dtype=np.float32)

    vectorscope = ScopesCalculator.compute_vectorscope(_buffer(image), size=101, sample_step=2)

    assert vectorscope.shape == (101, 101)
    assert vectorscope[50, 50] == 1.0
    assert np.count_nonzero(vectorscope) == 1


def test_bridge_emits_unedited_source_for_browser_preview(tmp_path: Path) -> None:
    source_path = tmp_path / "source.png"
    source_path.write_bytes(b"fixture")
    asset = ImageAsset.create(source_path)
    rendered = _buffer(
        np.array(
            [[[1, 0, 0], [0, 1, 0]], [[0, 0, 1], [0.5, 0.5, 0.5]]],
            dtype=np.float32,
        )
    )

    class Event:
        def __init__(self) -> None:
            self.calls = []

        def emit(self, *args) -> None:
            self.calls.append(args)

    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(active_asset=asset)
    bridge.editing_service = SimpleNamespace(
        get_or_load_source_buffer=lambda *_args: rendered
    )
    bridge._missing_source_notified = set()
    bridge.config = SimpleNamespace(
        performance=SimpleNamespace(preview_quality="balanced", preview_max_edge=2048)
    )
    bridge._buffer_to_data_url = lambda _buffer: "preview"
    bridge.image_updated = Event()
    bridge.before_image_updated = Event()
    bridge.notification = Event()

    bridge._do_render_preview()

    assert bridge.image_updated.calls == [("preview",)]
    assert bridge.before_image_updated.calls == [("preview",)]


def test_bridge_clears_stale_preview_when_source_is_missing(tmp_path: Path) -> None:
    asset = ImageAsset.create(tmp_path / "missing.png")

    class Event:
        def __init__(self) -> None:
            self.calls = []

        def emit(self, *args) -> None:
            self.calls.append(args)

    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(active_asset=asset)
    bridge._missing_source_notified = set()
    bridge.image_updated = Event()
    bridge.before_image_updated = Event()
    bridge.notification = Event()

    bridge._do_render_preview()

    assert bridge.image_updated.calls == [("",)]
    assert bridge.before_image_updated.calls == [("",)]
    assert len(bridge.notification.calls) == 1


def test_scope_calculators_reject_empty_image_buffers() -> None:
    empty = _buffer(np.zeros((0, 0, 3), dtype=np.float32))

    with pytest.raises(ValueError):
        HistogramData.compute(empty)
    with pytest.raises(ValueError):
        ScopesCalculator.compute_waveform(empty)
    with pytest.raises(ValueError):
        ScopesCalculator.compute_vectorscope(empty)


@pytest.mark.parametrize(
    ("method", "args"),
    [
        (ScopesCalculator.compute_waveform, {"width": 0, "height": 8}),
        (ScopesCalculator.compute_waveform, {"width": 8, "height": 0}),
        (ScopesCalculator.compute_vectorscope, {"size": 0}),
        (ScopesCalculator.compute_vectorscope, {"sample_step": 0}),
    ],
)
def test_scope_calculators_reject_non_positive_dimensions(method, args) -> None:
    image = _buffer(np.zeros((2, 2, 3), dtype=np.float32))

    with pytest.raises(ValueError, match="positive"):
        method(image, **args)
