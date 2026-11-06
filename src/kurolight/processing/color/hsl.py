"""8-Band selective HSL (Hue, Saturation, Luminance) processing engine."""

from typing import Union
import cv2
import numpy as np

from kurolight.domain.editing import HSLSettings
from kurolight.processing.buffer import ImageBuffer


class HSLEngine:
    """Performs selective 8-band Hue, Saturation, and Luminance transformations."""

    # Center hues in degrees [0..360]
    BAND_CENTERS = {
        "red": 0.0,
        "orange": 30.0,
        "yellow": 60.0,
        "green": 120.0,
        "aqua": 180.0,
        "blue": 240.0,
        "purple": 280.0,
        "magenta": 325.0,
    }

    # Band half-width in degrees for smooth blending
    BAND_WIDTH = 30.0

    @classmethod
    def apply_hsl(cls, img_rgb: Union[np.ndarray, ImageBuffer], hsl: HSLSettings) -> Union[np.ndarray, ImageBuffer]:
        """Apply 8-band HSL adjustments to float32 [0.0, 1.0] RGB array or ImageBuffer."""
        is_buffer = isinstance(img_rgb, ImageBuffer)
        orig_buffer = img_rgb if is_buffer else None
        arr: np.ndarray = img_rgb.data.copy() if is_buffer else img_rgb.copy()

        bands = [
            ("red", hsl.red),
            ("orange", hsl.orange),
            ("yellow", hsl.yellow),
            ("green", hsl.green),
            ("aqua", hsl.aqua),
            ("blue", hsl.blue),
            ("purple", hsl.purple),
            ("magenta", hsl.magenta),
        ]

        # Check if any adjustments are non-zero
        has_changes = any(
            b.hue != 0.0 or b.saturation != 0.0 or b.luminance != 0.0
            for _, b in bands
        )
        if not has_changes:
            return img_rgb

        # Convert RGB -> HSV (OpenCV expects H in [0, 360], S in [0, 1], V in [0, 1])
        hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)
        h_channel = hsv[..., 0]  # [0, 360]
        s_channel = hsv[..., 1]  # [0, 1]
        v_channel = hsv[..., 2]  # [0, 1]

        delta_h = np.zeros_like(h_channel)
        scale_s = np.ones_like(s_channel)
        delta_v = np.zeros_like(v_channel)

        for name, band in bands:
            if band.hue == 0.0 and band.saturation == 0.0 and band.luminance == 0.0:
                continue

            center = cls.BAND_CENTERS[name]
            # Angular distance on [0..360] circle
            diff = np.abs(h_channel - center)
            diff = np.minimum(diff, 360.0 - diff)

            # Cosine-tapered weight [0..1]
            weight = np.clip(1.0 - (diff / cls.BAND_WIDTH), 0.0, 1.0)
            weight = 0.5 * (1.0 - np.cos(np.pi * weight))

            if band.hue != 0.0:
                # Max shift of +/- 30 degrees
                delta_h += weight * (band.hue / 100.0) * 30.0

            if band.saturation != 0.0:
                # Saturation scaling
                sat_factor = 1.0 + (band.saturation / 100.0)
                scale_s = np.maximum(0.0, scale_s + weight * (sat_factor - 1.0))

            if band.luminance != 0.0:
                # Luminance offset in V channel
                delta_v += weight * (band.luminance / 100.0) * 0.35

        # Apply adjustments
        h_channel = np.mod(h_channel + delta_h, 360.0)
        s_channel = np.clip(s_channel * scale_s, 0.0, 1.0)
        v_channel = np.clip(v_channel + delta_v, 0.0, 1.0)

        hsv[..., 0] = h_channel
        hsv[..., 1] = s_channel
        hsv[..., 2] = v_channel

        result_rgb = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)
        result_rgb = np.clip(result_rgb, 0.0, 1.0)

        if is_buffer and orig_buffer:
            return ImageBuffer(
                data=result_rgb,
                width=orig_buffer.width,
                height=orig_buffer.height,
                channels=orig_buffer.channels,
                dtype=orig_buffer.dtype,
                color_space=orig_buffer.color_space,
                has_alpha=orig_buffer.has_alpha,
            )

        return result_rgb
