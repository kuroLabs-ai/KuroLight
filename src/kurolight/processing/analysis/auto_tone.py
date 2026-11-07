"""Heuristic Auto-Tone and Auto-Balance analysis engine."""

from typing import Tuple, Union

import numpy as np

from kurolight.domain.editing import ExposureSettings, WhiteBalanceSettings
from kurolight.processing.buffer import ImageBuffer


class AutoToneAnalyzer:
    """Estimate global tone and gray-world white-balance corrections."""

    @staticmethod
    def analyze(
        image: Union[np.ndarray, ImageBuffer],
    ) -> Tuple[ExposureSettings, WhiteBalanceSettings]:
        """
        Estimate global corrections from sampled normalized RGB pixels.

        Parameters
        ----------
        image
            Input float32 [0..1] array or ImageBuffer.

        Returns
        -------
        Tuple[ExposureSettings, WhiteBalanceSettings]
            Optimized photographic exposure and white balance parameters.
        """
        if isinstance(image, ImageBuffer):
            arr = image.data
        else:
            arr = np.asarray(image)

        if arr.ndim != 3 or arr.shape[0] < 1 or arr.shape[1] < 1 or arr.shape[2] < 3:
            raise ValueError("Auto Tone requires a non-empty image with at least three channels.")
        h, w = arr.shape[:2]
        max_edge = max(h, w)
        step = max(1, max_edge // 512)
        sample = arr[::step, ::step, :3]
        if not np.isfinite(sample).all():
            raise ValueError("Auto Tone input must contain only finite pixel values.")
        if np.any((sample < 0.0) | (sample > 1.0)):
            raise ValueError("Auto Tone input pixels must be normalized to the [0, 1] range.")

        r = sample[:, :, 0]
        g = sample[:, :, 1]
        b = sample[:, :, 2]

        # Perceptual luminance (Rec. 709)
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

        p1, p5, p50, p95, p99 = np.percentile(lum, [1.0, 5.0, 50.0, 95.0, 99.0])
        std_lum = float(np.std(lum))

        # 1. Exposure (EV Stops)
        target_mid = 0.42
        cur_mid = max(float(p50), 0.04)
        ev_diff = float(np.log2(target_mid / cur_mid))
        auto_exposure = float(np.clip(round(ev_diff, 2), -2.5, 2.5))

        if p95 - p5 < 0.04:
            # A nearly uniform image has no useful tonal range to expand or compress.
            auto_contrast = 0.0
            auto_highlights = 0.0
            auto_shadows = 0.0
            auto_whites = 0.0
            auto_blacks = 0.0
        else:
            # 2. Contrast
            if std_lum < 0.16:
                auto_contrast = float(np.clip((0.20 - std_lum) * 200.0, 0.0, 45.0))
            elif std_lum > 0.28:
                auto_contrast = float(np.clip((0.22 - std_lum) * 150.0, -35.0, 0.0))
            else:
                auto_contrast = 0.0

            # 3. Highlights & Shadows
            if p99 > 0.94:
                auto_highlights = float(np.clip(-(p99 - 0.85) * 200.0, -50.0, 0.0))
            elif p95 < 0.70:
                auto_highlights = float(np.clip((0.80 - p95) * 80.0, 0.0, 30.0))
            else:
                auto_highlights = 0.0

            if p5 < 0.08:
                auto_shadows = float(np.clip((0.15 - p5) * 250.0, 0.0, 50.0))
            elif p5 > 0.22:
                auto_shadows = float(np.clip((0.15 - p5) * 150.0, -30.0, 0.0))
            else:
                auto_shadows = 0.0

            # 4. Whites & Blacks
            auto_whites = float(np.clip((0.96 - p99) * 80.0, -30.0, 30.0))
            auto_blacks = float(np.clip((0.04 - p1) * 150.0, -30.0, 30.0))

        # 5. White Balance (Gray World chromaticity)
        r_mean = float(np.mean(r))
        g_mean = float(np.mean(g))
        b_mean = float(np.mean(b))
        avg = (r_mean + g_mean + b_mean) / 3.0

        if avg > 0.01:
            temp_shift = (b_mean - r_mean) / avg * 50.0
            tint_shift = (g_mean - (r_mean + b_mean) * 0.5) / avg * 50.0
            auto_temp = float(np.clip(round(temp_shift, 1), -40.0, 40.0))
            auto_tint = float(np.clip(round(tint_shift, 1), -30.0, 30.0))
        else:
            auto_temp = 0.0
            auto_tint = 0.0

        exp_settings = ExposureSettings(
            exposure=auto_exposure,
            contrast=round(auto_contrast, 1),
            highlights=round(auto_highlights, 1),
            shadows=round(auto_shadows, 1),
            whites=round(auto_whites, 1),
            blacks=round(auto_blacks, 1),
        )

        wb_settings = WhiteBalanceSettings(
            temperature=auto_temp,
            tint=auto_tint,
        )

        return exp_settings, wb_settings
