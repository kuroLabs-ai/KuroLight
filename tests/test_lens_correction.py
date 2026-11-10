import numpy as np
import pytest

from kurolight.domain.editing import EditState
from kurolight.processing.buffer import ImageBuffer
from kurolight.processing.lens_correction import LensCorrectionEngine
from kurolight.processing.pipeline import DefaultImageProcessor


def test_neutral_correction_is_exact_and_does_not_mutate_source():
    image = np.random.default_rng(42).random((17, 23, 3), dtype=np.float32)
    original = image.copy()

    corrected = LensCorrectionEngine.apply(image)

    np.testing.assert_array_equal(corrected, original)
    np.testing.assert_array_equal(image, original)


def test_distortion_correction_moves_radial_detail_towards_image_center():
    image = np.zeros((65, 65, 3), dtype=np.float32)
    image[32, 52] = 1.0
    original = image.copy()

    corrected = LensCorrectionEngine.apply(image, distortion=100)

    original_x = np.average(np.arange(65), weights=image[32, :, 0] + 1e-12)
    corrected_x = np.average(np.arange(65), weights=corrected[32, :, 0] + 1e-12)
    assert corrected_x < original_x
    assert corrected.shape == image.shape
    np.testing.assert_array_equal(image, original)


def test_chromatic_aberration_correction_keeps_channels_aligned():
    image = np.zeros((65, 65, 3), dtype=np.float32)
    image[32, 56] = 1.0

    corrected = LensCorrectionEngine.apply(image, chromatic_aberration=100)
    red_center = np.average(np.arange(65), weights=corrected[32, :, 0] + 1e-12)
    blue_center = np.average(np.arange(65), weights=corrected[32, :, 2] + 1e-12)

    assert red_center < blue_center


def test_chromatic_aberration_correction_supports_both_fringe_directions():
    image = np.zeros((65, 65, 3), dtype=np.float32)
    image[32, 56] = 1.0
    centers = []

    for strength in (-100, 100):
        corrected = LensCorrectionEngine.apply(image, chromatic_aberration=strength)
        red_center = np.average(np.arange(65), weights=corrected[32, :, 0] + 1e-12)
        blue_center = np.average(np.arange(65), weights=corrected[32, :, 2] + 1e-12)
        centers.append(red_center - blue_center)

    assert centers[0] * centers[1] < 0


def test_vignette_correction_brightens_corners_and_preserves_alpha():
    image = np.full((17, 17, 4), 0.2, dtype=np.float32)
    image[..., 3] = 0.6

    corrected = LensCorrectionEngine.apply(image, vignette=100)

    assert corrected[0, 0, 0] > corrected[8, 8, 0]
    np.testing.assert_array_equal(corrected[..., 3], image[..., 3])
    assert corrected.max() <= 1.0


@pytest.mark.parametrize(
    ("values", "message"),
    [
        ({"distortion": 101}, "Distortion"),
        ({"chromatic_aberration": -101}, "Chromatic"),
        ({"vignette": float("nan")}, "finite"),
    ],
)
def test_invalid_correction_values_raise(values, message):
    with pytest.raises(ValueError, match=message):
        LensCorrectionEngine.apply(np.zeros((5, 5, 3), dtype=np.float32), **values)


def test_pipeline_applies_persisted_lens_correction_settings():
    image = np.full((17, 17, 3), 0.2, dtype=np.float32)
    state = EditState(
        asset_id="lens-correction",
        lens_correction={"vignette": 100},
    )

    rendered = DefaultImageProcessor().process(ImageBuffer.from_numpy(image), state)

    assert rendered.data[0, 0, 0] > rendered.data[8, 8, 0]
    assert state.model_dump(mode="json")["lens_correction"]["vignette"] == 100
