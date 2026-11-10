"""Manual optical lens corrections."""

import cv2
import numpy as np


class LensCorrectionEngine:
    """Apply radial distortion, chromatic aberration, and vignetting corrections."""

    @staticmethod
    def apply(
        image: np.ndarray,
        distortion: float = 0.0,
        chromatic_aberration: float = 0.0,
        vignette: float = 0.0,
    ) -> np.ndarray:
        if image.ndim != 3 or image.shape[2] not in (3, 4):
            raise ValueError("Lens correction requires an RGB or RGBA image")
        if not all(np.isfinite(value) for value in (distortion, chromatic_aberration, vignette)):
            raise ValueError("Lens correction values must be finite")
        if not -100 <= distortion <= 100:
            raise ValueError("Distortion correction must be between -100 and 100")
        if not -100 <= chromatic_aberration <= 100:
            raise ValueError("Chromatic aberration correction must be between -100 and 100")
        if not 0 <= vignette <= 100:
            raise ValueError("Vignette correction must be between 0 and 100")
        if distortion == 0 and chromatic_aberration == 0 and vignette == 0:
            return image.copy()

        h, w = image.shape[:2]
        center_x = (w - 1) / 2.0
        center_y = (h - 1) / 2.0
        scale = float(max(w, h))
        y, x = np.indices((h, w), dtype=np.float32)
        dx = (x - center_x) / scale
        dy = (y - center_y) / scale
        radius_squared = dx * dx + dy * dy

        corrected = image.astype(np.float32, copy=False)
        if distortion != 0 or chromatic_aberration != 0:
            radial_scale = 1.0 + (distortion / 100.0 * 0.5) * radius_squared
            base_x = (center_x + dx * radial_scale * scale).astype(np.float32)
            base_y = (center_y + dy * radial_scale * scale).astype(np.float32)

            if chromatic_aberration != 0:
                channel_shift = (chromatic_aberration / 100.0 * 0.01) * radius_squared
                red_x = (base_x + dx * channel_shift * scale).astype(np.float32)
                red_y = (base_y + dy * channel_shift * scale).astype(np.float32)
                blue_x = (base_x - dx * channel_shift * scale).astype(np.float32)
                blue_y = (base_y - dy * channel_shift * scale).astype(np.float32)
                result = np.empty_like(corrected)
                result[..., 0] = cv2.remap(
                    corrected[..., 0], red_x, red_y, cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REFLECT_101,
                )
                result[..., 1] = cv2.remap(
                    corrected[..., 1], base_x, base_y, cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REFLECT_101,
                )
                result[..., 2] = cv2.remap(
                    corrected[..., 2], blue_x, blue_y, cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REFLECT_101,
                )
                if image.shape[2] == 4:
                    result[..., 3] = corrected[..., 3]
                corrected = result
            else:
                corrected = cv2.remap(
                    corrected, base_x, base_y, cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REFLECT_101,
                )

        if vignette > 0:
            normalized_radius_squared = np.clip(radius_squared / 0.5, 0.0, 1.0)
            gain = np.exp((vignette / 100.0) * np.log(2.0) * normalized_radius_squared)
            corrected = corrected.copy()
            corrected[..., :3] *= gain[..., np.newaxis]

        corrected = np.clip(corrected, 0.0, 1.0)
        return np.ascontiguousarray(corrected, dtype=np.float32)
