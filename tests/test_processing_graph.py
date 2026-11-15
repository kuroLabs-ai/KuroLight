import base64

import cv2
import numpy as np
import pytest

from kurolight.app.command_dispatcher import (
    CommandDispatcher,
    EditStateSnapshotCommand,
)
from kurolight.domain.editing import EditState
from kurolight.domain.masking import AdjustmentMask, MaskCombineMode, MaskType
from kurolight.domain.retouch import RetouchMode, RetouchSpot
from kurolight.processing.buffer import ImageBuffer
from kurolight.processing.color.lut import LUT3DEngine
from kurolight.processing.graph import ProcessingGraph, ProcessingNode
from kurolight.processing.masking import MaskEngine
from kurolight.processing.pipeline import DefaultImageProcessor
from kurolight.processing.retouch.engine import RetouchEngine


def test_graph_reuses_unchanged_nodes_when_downstream_settings_change():
    graph = ProcessingGraph(max_cache_bytes=1024 * 1024)
    calls = {"upstream": 0, "left": 0, "right": 0}
    source = np.ones((4, 4, 3), dtype=np.float32)

    def add_one(inputs):
        calls["upstream"] += 1
        return inputs[0] + 1

    def make_left(multiplier):
        def process(inputs):
            calls["left"] += 1
            return inputs[0] * multiplier
        return process

    def right(inputs):
        calls["right"] += 1
        return inputs[0] + 5

    first_graph = [
        ProcessingNode("upstream", ("$source",), {}, add_one),
        ProcessingNode("left", ("upstream",), {"multiplier": 2}, make_left(2)),
        ProcessingNode("right", ("upstream",), {}, right),
    ]
    first = graph.run(source, first_graph)
    assert np.array_equal(graph.run(source, first_graph), first)
    assert calls == {"upstream": 1, "left": 1, "right": 1}

    changed_graph = [
        first_graph[0],
        ProcessingNode("left", ("upstream",), {"multiplier": 3}, make_left(3)),
        first_graph[2],
    ]
    graph.run(source, changed_graph)
    assert calls == {"upstream": 1, "left": 2, "right": 1}


def test_graph_cache_obeys_memory_limit():
    graph = ProcessingGraph(max_cache_bytes=32)
    source = np.ones((4, 4, 3), dtype=np.float32)
    nodes = [
        ProcessingNode("copy", ("$source",), {}, lambda inputs: inputs[0].copy())
    ]

    graph.run(source, nodes)

    assert graph.cache_info()["bytes"] == 0


def test_processing_version_invalidates_cached_implementation_results():
    graph = ProcessingGraph(max_cache_bytes=1024 * 1024)
    source = np.ones((4, 4, 3), dtype=np.float32)
    calls = {"count": 0}

    def process(inputs):
        calls["count"] += 1
        return inputs[0] * 2

    nodes = [ProcessingNode("tone", ("$source",), {"exposure": 1}, process)]

    first = graph.run(source, nodes, process_version=1)
    cached = graph.run(source, nodes, process_version=1)
    upgraded = graph.run(source, nodes, process_version=2)

    np.testing.assert_array_equal(first, cached)
    np.testing.assert_array_equal(first, upgraded)
    assert calls["count"] == 2


@pytest.mark.parametrize("version", [0, -1, 1.5, True])
def test_processing_version_must_be_positive(version):
    with pytest.raises(ValueError, match="positive integer"):
        ProcessingGraph().run(
            np.ones((1, 1, 3), dtype=np.float32),
            [],
            process_version=version,
        )


def test_pipeline_keeps_chroma_matte_as_a_separate_graph_branch():
    image = np.zeros((8, 8, 3), dtype=np.float32)
    image[:, :4, 1] = 1.0
    image[:, 4:, 0] = 1.0
    state = EditState(
        asset_id="green-screen",
        custom_metadata={
            "background_removal": {
                "enabled": True,
                "color": "#00ff00",
                "tolerance": 0.18,
                "feather": 0.08,
            }
        },
    )

    rendered = DefaultImageProcessor().process(ImageBuffer.from_numpy(image), state)

    assert rendered.data.shape == (8, 8, 4)
    np.testing.assert_array_equal(rendered.data[:, :4, 3], 0.0)
    np.testing.assert_array_equal(rendered.data[:, 4:, 3], 1.0)

    state.custom_metadata["flow_nodes"] = {"background_removal": False}
    disabled = DefaultImageProcessor().process(ImageBuffer.from_numpy(image), state)
    assert disabled.data.shape == (8, 8, 3)


def test_pipeline_applies_radial_local_adjustment_without_mutating_source():
    image = np.full((21, 21, 3), 0.25, dtype=np.float32)
    original = image.copy()
    state = EditState(
        asset_id="local-mask",
        masks=[
            AdjustmentMask(
                name="Center lift",
                mask_type=MaskType.RADIAL,
                feather=0.2,
                exposure=1.0,
                geometry={"cx": 0.5, "cy": 0.5, "rx": 0.3, "ry": 0.3},
            )
        ],
    )

    rendered = DefaultImageProcessor().process(ImageBuffer.from_numpy(image), state)

    assert np.array_equal(image, original)
    assert np.allclose(rendered.data[10, 10], 0.5, atol=1e-5)
    assert np.allclose(rendered.data[0, 0], 0.25, atol=1e-5)


def test_pipeline_skips_disabled_masks():
    image = np.full((12, 12, 3), 0.25, dtype=np.float32)
    state = EditState(
        asset_id="disabled-mask",
        masks=[
            AdjustmentMask(
                enabled=False,
                exposure=2.0,
                mask_type=MaskType.RADIAL,
                geometry={"cx": 0.5, "cy": 0.5, "rx": 0.4, "ry": 0.4},
            )
        ],
    )

    rendered = DefaultImageProcessor().process(ImageBuffer.from_numpy(image), state)

    assert np.allclose(rendered.data, image)


def test_pipeline_applies_browser_custom_lut_and_rejects_missing_lut():
    image = np.full((2, 2, 3), 0.5, dtype=np.float32)
    state = EditState(
        asset_id="custom-lut",
        color_grading={"lut_name": "Imported Look", "lut_intensity": 1.0},
    )
    cube = np.full((2, 2, 2, 3), 0.25, dtype=np.float32)
    processor = DefaultImageProcessor()

    rendered = processor.process(
        ImageBuffer.from_numpy(image),
        state,
        custom_luts={"Imported Look": cube},
    )

    np.testing.assert_allclose(rendered.data, 0.25, atol=1e-6)
    with pytest.raises(ValueError, match="unavailable for Python rendering"):
        processor.process(ImageBuffer.from_numpy(image), state)


def test_custom_lut_base64_transfer_round_trips_as_float32():
    cube = np.arange(2**3 * 3, dtype="<f4").reshape((2, 2, 2, 3)) / 24
    encoded = base64.b64encode(cube.tobytes()).decode("ascii")

    decoded = LUT3DEngine.decode_custom_lut(2, encoded)

    np.testing.assert_array_equal(decoded, cube)
    with pytest.raises(ValueError, match="payload length"):
        LUT3DEngine.decode_custom_lut(2, encoded[:-4])


def test_pipeline_paints_brush_mask_with_continuous_stroke_and_preserves_source():
    image = np.full((31, 31, 3), 0.25, dtype=np.float32)
    original = image.copy()
    state = EditState(
        asset_id="brush-mask",
        masks=[
            AdjustmentMask(
                name="Painted lift",
                mask_type=MaskType.BRUSH,
                exposure=1.0,
                geometry={
                    "brush_size": 0.12,
                    "brush_hardness": 1.0,
                    "strokes": [
                        {"x": 0.25, "y": 0.5},
                        {"x": 0.5, "y": 0.5},
                        {"x": 0.75, "y": 0.5},
                    ],
                },
            )
        ],
    )

    rendered = DefaultImageProcessor().process(ImageBuffer.from_numpy(image), state)

    assert np.allclose(rendered.data[15, 15], 0.5, atol=1e-5)
    assert np.allclose(rendered.data[0, 0], 0.25, atol=1e-5)
    np.testing.assert_array_equal(image, original)


def test_luminance_range_mask_selects_configured_brightness_band():
    image = np.zeros((1, 5, 3), dtype=np.float32)
    image[0, :, :] = np.array([0.1, 0.3, 0.5, 0.7, 0.9])[:, None]
    mask = AdjustmentMask(
        mask_type=MaskType.LUMINANCE_RANGE,
        exposure=1.0,
        geometry={
            "luminance_min": 0.4,
            "luminance_max": 0.6,
            "range_softness": 0.0,
        },
    )

    rendered = MaskEngine.apply_masks(image, [mask])

    np.testing.assert_allclose(rendered[0, :, 0], [0.1, 0.3, 1.0, 0.7, 0.9], atol=1e-5)


def test_color_range_mask_selects_hue_across_zero_degree_boundary():
    hsv = np.zeros((1, 3, 3), dtype=np.float32)
    hsv[0, :, :] = [[359, 1, 0.8], [1, 1, 0.8], [180, 1, 0.8]]
    image = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
    mask = AdjustmentMask(
        mask_type=MaskType.COLOR_RANGE,
        exposure=1.0,
        geometry={
            "hue_center": 0,
            "hue_width": 10,
            "saturation_min": 0.5,
            "saturation_max": 1,
            "range_softness": 0,
        },
    )

    rendered = MaskEngine.apply_masks(image, [mask])

    np.testing.assert_allclose(rendered[0, :2], np.minimum(image[0, :2] * 2, 1), atol=1e-5)
    np.testing.assert_allclose(rendered[0, 2], image[0, 2], atol=1e-5)


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        (MaskCombineMode.REPLACE, [0, 0, 1, 1, 0]),
        (MaskCombineMode.ADD, [0, 1, 1, 1, 0]),
        (MaskCombineMode.SUBTRACT, [0, 1, 0, 0, 0]),
        (MaskCombineMode.INTERSECT, [0, 0, 1, 0, 0]),
    ],
)
def test_mask_combine_modes_have_explicit_weight_semantics(mode, expected):
    weights = np.array([[0, 1, 1, 0, 0]], dtype=np.float32)
    current = np.array([[0, 0, 1, 1, 0]], dtype=np.float32)
    combined = MaskEngine._combine_weights(weights, current, mode)

    np.testing.assert_array_equal(combined[0], expected)


def test_combined_mask_coverage_drives_local_adjustments_in_list_order():
    image = np.full((1, 5, 3), 0.25, dtype=np.float32)
    state = EditState(
        asset_id="combined-masks",
        masks=[
            AdjustmentMask(
                mask_type=MaskType.BRUSH,
                exposure=1.0,
                geometry={
                    "brush_hardness": 1,
                    "brush_size": 0.24,
                    "strokes": [{"x": 0.25, "y": 0.5}],
                },
            ),
            AdjustmentMask(
                mask_type=MaskType.BRUSH,
                combine_mode=MaskCombineMode.ADD,
                exposure=1.0,
                geometry={
                    "brush_hardness": 1,
                    "brush_size": 0.24,
                    "strokes": [{"x": 0.5, "y": 0.5}],
                },
            ),
        ],
    )

    rendered = DefaultImageProcessor().process(ImageBuffer.from_numpy(image), state)

    np.testing.assert_allclose(rendered.data[0, :, 0], [0.25, 1.0, 0.5, 0.25, 0.25], atol=1e-5)


def test_pipeline_applies_clone_spot_and_preserves_original():
    image = np.full((21, 21, 3), 0.2, dtype=np.float32)
    image[10, 10] = 1.0
    original = image.copy()
    state = EditState(
        asset_id="retouch",
        retouch_spots=[
            RetouchSpot(
                mode=RetouchMode.CLONE,
                target_x=0.5,
                target_y=0.5,
                source_x=0.8,
                source_y=0.5,
                radius=0.2,
                feather=0,
            )
        ],
    )

    rendered = DefaultImageProcessor().process(ImageBuffer.from_numpy(image), state)

    assert np.array_equal(image, original)
    assert np.allclose(rendered.data[10, 10], 0.2, atol=1e-5)


def test_retouch_pin_placement_changes_target_and_is_undoable():
    image = np.full((31, 31, 3), 0.2, dtype=np.float32)
    image[8, 8] = 1.0
    image[23, 23] = 1.0
    original = image.copy()
    before = EditState(asset_id="retouch-move")
    placed = before.model_copy(deep=True)
    placed.retouch_spots = [
        RetouchSpot(
            id="spot",
            mode=RetouchMode.CLONE,
            target_x=8 / 30,
            target_y=8 / 30,
            source_x=0.5,
            source_y=0.5,
            radius=0.16,
            feather=0,
        )
    ]
    moved = placed.model_copy(deep=True)
    moved.retouch_spots[0].target_x = 23 / 30
    moved.retouch_spots[0].target_y = 23 / 30

    processor = DefaultImageProcessor()
    placed_render = processor.process(ImageBuffer.from_numpy(image), placed)
    dispatcher = CommandDispatcher()
    dispatcher.execute_command(
        EditStateSnapshotCommand(before, placed, "Place clone spot"), before
    )
    dispatcher.execute_command(
        EditStateSnapshotCommand(placed, moved, "Move clone spot"), placed
    )

    undone = dispatcher.undo(moved)
    undone_render = processor.process(ImageBuffer.from_numpy(image), undone)
    redone = dispatcher.redo(undone)
    redone_render = processor.process(ImageBuffer.from_numpy(image), redone)

    assert np.allclose(placed_render.data[8, 8], 0.2, atol=1e-5)
    assert np.allclose(undone_render.data, placed_render.data)
    assert np.allclose(redone_render.data[23, 23], 0.2, atol=1e-5)
    assert not np.array_equal(placed_render.data, redone_render.data)
    np.testing.assert_array_equal(image, original)


def test_heal_spot_matches_local_color_while_clone_copies_source():
    image = np.full((41, 41, 3), 0.2, dtype=np.float32)
    image[10, 10] = 1.0
    image[24:37, 24:37] = 0.4
    base = {
        "target_x": 0.25,
        "target_y": 0.25,
        "source_x": 0.75,
        "source_y": 0.75,
        "radius": 0.15,
        "feather": 0,
    }

    healed = RetouchEngine.apply_retouch(
        image, [RetouchSpot(mode=RetouchMode.HEAL, **base)]
    )
    cloned = RetouchEngine.apply_retouch(
        image, [RetouchSpot(mode=RetouchMode.CLONE, **base)]
    )

    assert np.allclose(healed.data[10, 10], 0.2, atol=1e-5)
    assert np.allclose(cloned.data[10, 10], 0.4, atol=1e-5)
