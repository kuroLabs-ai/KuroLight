import numpy as np
import pytest

from kurolight.processing.analysis.auto_tone import AutoToneAnalyzer
from kurolight.processing.buffer import ImageBuffer


def _gray_scene(minimum: float, maximum: float, size: int = 32) -> np.ndarray:
    values = np.linspace(minimum, maximum, size * size, dtype=np.float32).reshape(
        size, size
    )
    return np.repeat(values[..., np.newaxis], 3, axis=2)


def _analyze(image: np.ndarray):
    exposure, white_balance = AutoToneAnalyzer.analyze(image)
    return exposure.model_dump(), white_balance.model_dump()


def test_auto_tone_leaves_uniform_neutral_midgray_unchanged():
    exposure, white_balance = _analyze(
        np.full((24, 32, 3), 0.42, dtype=np.float32)
    )

    assert exposure == {
        "exposure": 0.0,
        "contrast": 0.0,
        "highlights": 0.0,
        "shadows": 0.0,
        "whites": 0.0,
        "blacks": 0.0,
        "brightness": 0.0,
    }
    assert white_balance["temperature"] == 0
    assert white_balance["tint"] == 0


@pytest.mark.parametrize(
    ("minimum", "maximum", "direction"),
    [
        (0.02, 0.18, "brighten"),
        (0.72, 0.99, "darken"),
    ],
)
def test_auto_tone_moves_dark_and_bright_scene_medians_toward_target(
    minimum: float, maximum: float, direction: str
):
    scene = _gray_scene(minimum, maximum)
    exposure, _ = AutoToneAnalyzer.analyze(scene)
    original_median = float(np.median(scene[..., 0]))
    adjusted_median = original_median * (2**exposure.exposure)

    assert exposure.exposure > 0 if direction == "brighten" else exposure.exposure < 0
    assert abs(adjusted_median - 0.42) < abs(original_median - 0.42)


def test_auto_tone_reduces_extreme_contrast_and_recovers_clipped_regions():
    values = np.indices((32, 32))[1] % 2
    scene = np.where(values[..., None] == 0, 0.02, 0.98)
    scene = np.repeat(scene, 3, axis=2).astype(np.float32)

    exposure, _ = AutoToneAnalyzer.analyze(scene)

    assert exposure.contrast < 0
    assert exposure.highlights < 0
    assert exposure.shadows > 0


@pytest.mark.parametrize(
    ("color", "temperature_direction"),
    [
        ((0.6, 0.35, 0.2), "cool"),
        ((0.2, 0.35, 0.6), "warm"),
    ],
)
def test_auto_tone_white_balance_counteracts_simple_color_cast(
    color: tuple[float, float, float], temperature_direction: str
):
    scene = np.empty((20, 20, 3), dtype=np.float32)
    scene[:] = color

    _, white_balance = AutoToneAnalyzer.analyze(ImageBuffer.from_numpy(scene))

    assert white_balance.temperature < 0 if temperature_direction == "cool" else white_balance.temperature > 0
    assert abs(white_balance.temperature) <= 40
    assert abs(white_balance.tint) <= 30


def test_auto_tone_caps_extreme_adjustments_and_rejects_invalid_images():
    scene = np.full((8, 8, 3), 0.001, dtype=np.float32)
    exposure, white_balance = AutoToneAnalyzer.analyze(scene)

    assert exposure.exposure == 2.5
    assert abs(exposure.contrast) <= 45
    assert abs(exposure.highlights) <= 50
    assert abs(exposure.shadows) <= 50
    assert abs(exposure.whites) <= 30
    assert abs(exposure.blacks) <= 30
    assert abs(white_balance.temperature) <= 40
    assert abs(white_balance.tint) <= 30

    for invalid in (
        np.zeros((0, 8, 3), dtype=np.float32),
        np.zeros((8, 8), dtype=np.float32),
        np.zeros((8, 8, 2), dtype=np.float32),
        np.full((8, 8, 3), np.nan, dtype=np.float32),
        np.full((8, 8, 3), 1.1, dtype=np.float32),
    ):
        with pytest.raises(ValueError):
            AutoToneAnalyzer.analyze(invalid)
