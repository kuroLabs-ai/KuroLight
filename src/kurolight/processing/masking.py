"""Spatial adjustment mask weight calculation and non-destructive image blending."""

import cv2
import numpy as np

from kurolight.domain.masking import AdjustmentMask, MaskCombineMode, MaskType


class MaskEngine:
    """Computes spatial weight fields and applies non-destructive local corrections."""

    @classmethod
    def compute_mask_weight(
        cls,
        mask: AdjustmentMask,
        height: int,
        width: int,
        image: np.ndarray | None = None,
    ) -> np.ndarray:
        """
        Compute normalized 2D spatial weight map in float32 [0.0, 1.0] for an AdjustmentMask.
        """
        geom = mask.geometry

        if mask.mask_type == MaskType.LINEAR:
            # Linear gradient defined by normalized points (x1, y1) -> (x2, y2)
            x1 = geom.get("x1", 0.0)
            y1 = geom.get("y1", 0.0)
            x2 = geom.get("x2", 0.0)
            y2 = geom.get("y2", 1.0)

            dx = x2 - x1
            dy = y2 - y1
            length_sq = dx * dx + dy * dy
            if length_sq < 1e-6:
                length_sq = 1.0
                dy = 1.0

            # Grid of coordinates [0..1]
            ys, xs = np.mgrid[0:height, 0:width]
            xs = xs / max(width - 1, 1)
            ys = ys / max(height - 1, 1)

            # Project coordinate onto normalized segment
            proj = ((xs - x1) * dx + (ys - y1) * dy) / length_sq
            proj = np.clip(proj, 0.0, 1.0)

            # Feathering curve
            feather = max(0.01, mask.feather)
            weight = np.clip((1.0 - proj) / feather, 0.0, 1.0)
            # Cosine smoothing
            weight = 0.5 * (1.0 - np.cos(np.pi * weight))

        elif mask.mask_type == MaskType.RADIAL:
            # Radial / Elliptical gradient from center (cx, cy) with radii (rx, ry)
            cx = geom.get("cx", 0.5)
            cy = geom.get("cy", 0.5)
            rx = max(geom.get("rx", 0.3), 1e-4)
            ry = max(geom.get("ry", 0.3), 1e-4)

            ys, xs = np.mgrid[0:height, 0:width]
            xs = xs / max(width - 1, 1)
            ys = ys / max(height - 1, 1)

            # Elliptical normalized distance
            dist = np.sqrt(((xs - cx) / rx) ** 2 + ((ys - cy) / ry) ** 2)

            feather = max(0.01, mask.feather)
            weight = np.clip(1.0 - (dist - (1.0 - feather)) / feather, 0.0, 1.0)
            # Smooth roll-off
            weight = 0.5 * (1.0 - np.cos(np.pi * weight))

        elif mask.mask_type == MaskType.BRUSH:
            strokes = geom.get("strokes", [])
            weight = np.zeros((height, width), dtype=np.float32)
            if strokes:
                radius_scale = min(height, width)
                hardness = float(np.clip(geom.get("brush_hardness", 0.7), 0.0, 1.0))
                for stroke in strokes:
                    cx = float(stroke.get("x", 0.5)) * max(width - 1, 1)
                    cy = float(stroke.get("y", 0.5)) * max(height - 1, 1)
                    radius = max(
                        float(stroke.get("r", geom.get("brush_size", 0.06)))
                        * radius_scale,
                        1.0,
                    )
                    opacity = float(np.clip(stroke.get("o", 1.0), 0.0, 1.0))
                    x0 = max(0, int(np.floor(cx - radius)))
                    x1 = min(width, int(np.ceil(cx + radius)) + 1)
                    y0 = max(0, int(np.floor(cy - radius)))
                    y1 = min(height, int(np.ceil(cy + radius)) + 1)
                    if x0 >= x1 or y0 >= y1:
                        continue

                    ys, xs = np.ogrid[y0:y1, x0:x1]
                    distance = np.hypot(xs - cx, ys - cy)
                    inner_radius = radius * hardness
                    falloff = np.clip(
                        (radius - distance) / max(radius - inner_radius, 1e-6),
                        0.0,
                        1.0,
                    )
                    falloff = 0.5 * (1.0 - np.cos(np.pi * falloff))
                    stroke_weight = falloff * opacity
                    region = weight[y0:y1, x0:x1]
                    region[:] = 1.0 - (1.0 - region) * (1.0 - stroke_weight)
        elif mask.mask_type == MaskType.LUMINANCE_RANGE:
            if image is None:
                raise ValueError("Luminance range masks require an RGB image")
            luminance = (
                image[..., 0] * 0.2126
                + image[..., 1] * 0.7152
                + image[..., 2] * 0.0722
            )
            low = float(np.clip(geom.get("luminance_min", 0.0), 0.0, 1.0))
            high = float(np.clip(geom.get("luminance_max", 1.0), 0.0, 1.0))
            softness = float(np.clip(geom.get("range_softness", 0.05), 0.0, 0.5))
            weight = cls._range_weight(luminance, low, high, softness)
        elif mask.mask_type == MaskType.COLOR_RANGE:
            if image is None:
                raise ValueError("Color range masks require an RGB image")
            hsv = cv2.cvtColor(
                np.clip(image[..., :3], 0.0, 1.0).astype(np.float32),
                cv2.COLOR_RGB2HSV,
            )
            hue_center = float(geom.get("hue_center", 0.0)) % 360.0
            hue_width = float(np.clip(geom.get("hue_width", 45.0), 0.0, 180.0))
            hue_distance = np.abs((hsv[..., 0] - hue_center + 180.0) % 360.0 - 180.0)
            softness = float(np.clip(geom.get("range_softness", 0.05), 0.0, 0.5))
            hue_weight = cls._range_weight(
                hue_distance, -softness * 180.0, hue_width, softness * 180.0
            )
            saturation_low = float(np.clip(geom.get("saturation_min", 0.0), 0.0, 1.0))
            saturation_high = float(np.clip(geom.get("saturation_max", 1.0), 0.0, 1.0))
            saturation_weight = cls._range_weight(
                hsv[..., 1], saturation_low, saturation_high, softness
            )
            weight = hue_weight * saturation_weight

        # Inversion
        if mask.inverted:
            weight = 1.0 - weight

        # Apply overall mask opacity
        weight = np.clip(weight * mask.opacity, 0.0, 1.0).astype(np.float32)
        return weight

    @staticmethod
    def _range_weight(
        values: np.ndarray, low: float, high: float, softness: float
    ) -> np.ndarray:
        if low > high:
            low, high = high, low
        if softness <= 0:
            return ((values >= low) & (values <= high)).astype(np.float32)
        lower = np.clip((values - (low - softness)) / (2.0 * softness), 0.0, 1.0)
        upper = np.clip(((high + softness) - values) / (2.0 * softness), 0.0, 1.0)
        lower = lower * lower * (3.0 - 2.0 * lower)
        upper = upper * upper * (3.0 - 2.0 * upper)
        return (lower * upper).astype(np.float32)

    @staticmethod
    def _combine_weights(
        accumulated: np.ndarray | None,
        current: np.ndarray,
        mode: MaskCombineMode,
    ) -> np.ndarray:
        if accumulated is None or mode == MaskCombineMode.REPLACE:
            return current
        if mode == MaskCombineMode.ADD:
            return 1.0 - (1.0 - accumulated) * (1.0 - current)
        if mode == MaskCombineMode.SUBTRACT:
            return accumulated * (1.0 - current)
        return accumulated * current

    @classmethod
    def apply_masks(cls, img_rgb: np.ndarray, masks: list[AdjustmentMask]) -> np.ndarray:
        """Apply all active local adjustment masks non-destructively to float32 RGB image."""
        if not masks:
            return img_rgb

        h, w = img_rgb.shape[:2]
        result = img_rgb.copy()
        accumulated_weight = None

        for mask in masks:
            if not mask.enabled:
                continue

            weight = cls.compute_mask_weight(mask, h, w, image=img_rgb)
            accumulated_weight = cls._combine_weights(
                accumulated_weight, weight, mask.combine_mode
            )

            # Check if any parameter is adjusted
            has_adjustments = (
                mask.exposure != 0.0
                or mask.contrast != 0.0
                or mask.temperature != 0.0
                or mask.saturation != 0.0
                or mask.clarity != 0.0
            )
            if not has_adjustments:
                continue

            if accumulated_weight is None or np.all(accumulated_weight == 0.0):
                continue

            # Create localized adjustment layer
            layer = result.copy()

            # 1. Local Exposure
            if mask.exposure != 0.0:
                mult = float(2.0 ** mask.exposure)
                layer = layer * mult

            # 2. Local Contrast
            if mask.contrast != 0.0:
                c_factor = (mask.contrast + 100.0) / 100.0
                layer = (layer - 0.5) * c_factor + 0.5

            # 3. Local Temperature
            if mask.temperature != 0.0:
                temp_shift = (mask.temperature / 100.0) * 0.15
                layer[..., 0] += temp_shift   # Red channel
                layer[..., 2] -= temp_shift   # Blue channel

            # 4. Local Saturation
            if mask.saturation != 0.0:
                hsv = cv2.cvtColor(np.clip(layer, 0.0, 1.0).astype(np.float32), cv2.COLOR_RGB2HSV)
                sat_factor = max(0.0, 1.0 + (mask.saturation / 100.0))
                hsv[..., 1] = np.clip(hsv[..., 1] * sat_factor, 0.0, 1.0)
                layer = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)

            if mask.clarity != 0.0:
                blurred = cv2.GaussianBlur(layer, (0, 0), sigmaX=2.0, sigmaY=2.0)
                layer = layer + (layer - blurred) * (mask.clarity / 100.0) * 2.0

            layer = np.clip(layer, 0.0, 1.0)
            w_3d = np.expand_dims(accumulated_weight, axis=-1)

            # Alpha blend localized adjustment onto base
            result = result * (1.0 - w_3d) + layer * w_3d

        return np.clip(result, 0.0, 1.0)
