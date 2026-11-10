import cv2
import numpy as np
import pytest

from kurolight.domain.editing import EditState
from kurolight.domain.masking import AdjustmentMask, MaskType
from kurolight.processing.buffer import ImageBuffer
from kurolight.processing.pipeline import DefaultImageProcessor


def _process(image: np.ndarray, **geometry_values) -> np.ndarray:
    state = EditState(
        asset_id="geometry",
        geometry=geometry_values,
    )
    return DefaultImageProcessor().process(ImageBuffer.from_numpy(image), state).data


def test_rotation_expands_canvas_and_rotates_rectangular_image_without_clipping():
    image = np.zeros((3, 5, 3), dtype=np.float32)
    image[0, 0] = (1, 0, 0)
    image[0, 4] = (0, 1, 0)
    image[2, 0] = (0, 0, 1)
    image[2, 4] = (1, 1, 0)

    rendered = _process(image, rotation=90)

    assert rendered.shape == (5, 3, 3)
    np.testing.assert_allclose(rendered, np.rot90(image), atol=1e-6)


def test_rotation_combines_with_straighten_and_keeps_alpha_border_transparent():
    image = np.ones((3, 5, 4), dtype=np.float32)
    image[..., 3] = 1.0

    right_angle = _process(image, rotation=45, straighten=45)
    arbitrary_angle = _process(image, rotation=30)

    assert right_angle.shape == (5, 3, 4)
    np.testing.assert_array_equal(right_angle[..., 3], 1.0)
    assert arbitrary_angle.shape[0] > image.shape[0]
    assert arbitrary_angle.shape[1] > image.shape[1]
    assert np.any(arbitrary_angle[..., 3] == 0.0)
    assert np.any(arbitrary_angle[..., 3] > 0.0)


@pytest.mark.parametrize(
    ("geometry", "expected"),
    [
        ({"horizontal_flip": True}, np.arange(15).reshape(3, 5)[:, ::-1]),
        ({"vertical_flip": True}, np.arange(15).reshape(3, 5)[::-1, :]),
        (
            {"horizontal_flip": True, "vertical_flip": True},
            np.arange(15).reshape(3, 5)[::-1, ::-1],
        ),
    ],
)
def test_flips_preserve_dimensions_and_pixel_positions(geometry, expected):
    image = np.repeat(
        (np.arange(15, dtype=np.float32).reshape(3, 5) / 15)[..., None],
        3,
        axis=2,
    )

    rendered = _process(image, **geometry)

    assert rendered.shape == image.shape
    np.testing.assert_allclose(rendered[..., 0], expected / 15)


def test_fractional_crop_dimensions_are_rounded_and_clamped_to_image_bounds():
    image = np.arange(7 * 11 * 3, dtype=np.float32).reshape(7, 11, 3) / 300

    rendered = _process(
        image,
        crop_x=0.2,
        crop_y=0.25,
        crop_width=0.5,
        crop_height=0.5,
    )
    edge_crop = _process(
        image,
        crop_x=0.8,
        crop_y=0.8,
        crop_width=0.8,
        crop_height=0.8,
    )

    assert rendered.shape == (3, 6, 3)
    np.testing.assert_array_equal(rendered, image[2:5, 2:8])
    assert edge_crop.shape == (1, 2, 3)
    np.testing.assert_array_equal(edge_crop, image[6:7, 9:11])


def test_zero_area_crop_retains_at_least_one_pixel_and_processing_does_not_mutate_source():
    image = np.arange(4 * 6 * 3, dtype=np.float32).reshape(4, 6, 3) / 100
    original = image.copy()

    rendered = _process(
        image,
        crop_x=1.0,
        crop_y=1.0,
        crop_width=0.0,
        crop_height=0.0,
    )

    assert rendered.shape == (1, 1, 3)
    np.testing.assert_array_equal(rendered[0, 0], image[-1, -1])
    np.testing.assert_array_equal(image, original)


@pytest.mark.parametrize(
    "geometry",
    [
        {},
        {"crop_x": 0.1, "crop_y": 0.15, "crop_width": 0.75, "crop_height": 0.7},
        {"rotation": 23},
        {"straighten": -13},
        {"rotation": -17, "horizontal_flip": True, "vertical_flip": True},
        {"rotation": 11, "crop_x": 0.08, "crop_y": 0.12, "crop_width": 0.82, "crop_height": 0.76},
    ],
)
def test_normalized_mask_coordinates_match_preview_and_export_after_geometry(geometry):
    height, width = 120, 180
    yy, xx = np.mgrid[0:height, 0:width]
    image = np.stack(
        (
            0.15 + 0.5 * xx / (width - 1),
            0.2 + 0.45 * yy / (height - 1),
            np.full((height, width), 0.25),
        ),
        axis=2,
    ).astype(np.float32)
    state = EditState(
        asset_id="mask-preview-export-alignment",
        geometry=geometry,
        lens_correction={"distortion": 25},
        masks=[
            AdjustmentMask(
                mask_type=MaskType.RADIAL,
                exposure=0.8,
                feather=0.4,
                geometry={"cx": 0.37, "cy": 0.62, "rx": 0.24, "ry": 0.2},
            ),
            AdjustmentMask(
                mask_type=MaskType.BRUSH,
                exposure=-0.3,
                geometry={
                    "brush_hardness": 0.6,
                    "brush_size": 0.08,
                    "strokes": [
                        {"x": 0.68, "y": 0.36, "r": 0.08},
                        {"x": 0.74, "y": 0.42, "r": 0.08},
                    ],
                },
            ),
        ],
    )
    processor = DefaultImageProcessor()
    full_render = processor.process(ImageBuffer.from_numpy(image), state)
    preview_source = processor.create_preview(ImageBuffer.from_numpy(image), max_edge=60)
    preview_render = processor.process(preview_source, state)
    full_scaled = cv2.resize(
        full_render.data,
        (preview_render.width, preview_render.height),
        interpolation=cv2.INTER_AREA,
    )

    assert preview_render.data.shape == full_scaled.shape
    assert float(np.mean(np.abs(preview_render.data - full_scaled))) < 0.025
