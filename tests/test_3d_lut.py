"""Tests for 3D Look-Up Table (LUT) parser, generator, and trilinear interpolation."""

from pathlib import Path

import numpy as np
import pytest

from kurolight.processing.color.lut import LUT3DEngine


def test_builtin_luts_generation():
    """Verify that dynamic mathematical built-in LUTs generate valid float32 3D cubes."""
    luts = ["Teal & Orange", "Film Bleach Bypass", "Vintage Warmth"]

    for name in luts:
        cube = LUT3DEngine.create_builtin_lut(name, size=17)
        assert isinstance(cube, np.ndarray)
        assert cube.shape == (17, 17, 17, 3)
        assert cube.dtype == np.float32
        # Values must remain strictly bounded in [0.0, 1.0]
        assert np.all(cube >= 0.0)
        assert np.all(cube <= 1.0)


def test_lut_caching():
    """Verify that calling create_builtin_lut repeatedly returns cached array."""
    c1 = LUT3DEngine.create_builtin_lut("Teal & Orange", size=17)
    c2 = LUT3DEngine.create_builtin_lut("Teal & Orange", size=17)
    assert c1 is c2


def test_trilinear_interpolation_black_and_white():
    """Verify trilinear interpolation passes black and white points reasonably."""
    lut = LUT3DEngine.create_builtin_lut("Teal & Orange", size=17)

    # Black pixel (0, 0, 0)
    black = np.zeros((1, 1, 3), dtype=np.float32)
    graded_black = LUT3DEngine.apply_lut(black, lut, intensity=1.0)
    assert graded_black.shape == (1, 1, 3)
    assert np.all(graded_black >= 0.0)
    assert np.all(graded_black <= 1.0)

    # White pixel (1, 1, 1)
    white = np.ones((1, 1, 3), dtype=np.float32)
    graded_white = LUT3DEngine.apply_lut(white, lut, intensity=1.0)
    assert graded_white.shape == (1, 1, 3)
    assert np.all(graded_white >= 0.0)
    assert np.all(graded_white <= 1.0)


def test_lut_intensity_blending():
    """Verify intensity blending (0.0 = passthrough, 1.0 = fully graded)."""
    lut = LUT3DEngine.create_builtin_lut("Film Bleach Bypass", size=17)
    test_image = np.array([[[0.2, 0.5, 0.8]]], dtype=np.float32)

    # Intensity = 0.0 must return identical source image
    passthrough = LUT3DEngine.apply_lut(test_image, lut, intensity=0.0)
    np.testing.assert_allclose(passthrough, test_image, atol=1e-5)

    # Intensity = 1.0 modifies the image
    graded = LUT3DEngine.apply_lut(test_image, lut, intensity=1.0)
    assert not np.allclose(graded, test_image, atol=1e-3)

    # Intensity = 0.5 is an intermediate blend
    half = LUT3DEngine.apply_lut(test_image, lut, intensity=0.5)
    expected = 0.5 * test_image + 0.5 * graded
    np.testing.assert_allclose(half, expected, atol=1e-3)


def test_parse_cube_file(tmp_path: Path):
    """Verify parsing standard .cube ASCII file."""
    cube_file = tmp_path / "test.cube"
    content = """TITLE "Test LUT"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0

0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
"""
    cube_file.write_text(content, encoding="utf-8")

    cube, size = LUT3DEngine.parse_cube_file(cube_file)
    assert size == 2
    assert cube.shape == (2, 2, 2, 3)
    assert cube.dtype == np.float32
    for r in range(size):
        for g in range(size):
            for b in range(size):
                np.testing.assert_array_equal(cube[r, g, b], [r, g, b])


def test_parse_cube_file_rejects_custom_input_domain(tmp_path: Path):
    cube_file = tmp_path / "custom-domain.cube"
    cube_file.write_text(
        "LUT_3D_SIZE 2\nDOMAIN_MIN -1 0 0\nDOMAIN_MAX 1 1 1\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="input domains are not supported"):
        LUT3DEngine.parse_cube_file(cube_file)
