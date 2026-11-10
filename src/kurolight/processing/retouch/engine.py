"""Non-destructive Retouching and Spot Healing Engine."""

from typing import List, Union
import numpy as np

from kurolight.domain.retouch import RetouchMode, RetouchSpot
from kurolight.processing.buffer import ImageBuffer


class RetouchEngine:
    """Applies non-destructive spot healing and clone stamp corrections."""

    @staticmethod
    def apply_retouch(
        image: Union[np.ndarray, ImageBuffer],
        spots: List[RetouchSpot],
    ) -> ImageBuffer:
        """
        Apply a series of localized retouch spots onto the image.

        Parameters
        ----------
        image
            Input float32 [0..1] array or ImageBuffer.
        spots
            List of RetouchSpot configurations to apply.

        Returns
        -------
        ImageBuffer
            New buffer with retouched defects.
        """
        if isinstance(image, ImageBuffer):
            arr = image.data.copy()
            color_space = image.color_space
        else:
            arr = image.astype(np.float32).copy()
            color_space = "sRGB"

        h, w, c = arr.shape

        for spot in spots:
            if not spot.enabled or spot.opacity <= 0.0:
                continue

            cx = int(round(spot.target_x * (w - 1)))
            cy = int(round(spot.target_y * (h - 1)))
            sx = int(round(spot.source_x * (w - 1)))
            sy = int(round(spot.source_y * (h - 1)))

            radius = max(3, int(round(spot.radius * min(w, h))))

            # Target bounds
            y0 = max(0, cy - radius)
            y1 = min(h, cy + radius + 1)
            x0 = max(0, cx - radius)
            x1 = min(w, cx + radius + 1)

            box_h = y1 - y0
            box_w = x1 - x0
            if box_h <= 0 or box_w <= 0:
                continue

            # Offset for source box
            dx = sx - cx
            dy = sy - cy

            src_y0 = y0 + dy
            src_y1 = y1 + dy
            src_x0 = x0 + dx
            src_x1 = x1 + dx

            # Clamp source box to boundaries and adjust target box synchronously
            if src_x0 < 0:
                shift = -src_x0
                src_x0 += shift
                x0 += shift
            if src_y0 < 0:
                shift = -src_y0
                src_y0 += shift
                y0 += shift
            if src_x1 > w:
                shift = src_x1 - w
                src_x1 -= shift
                x1 -= shift
            if src_y1 > h:
                shift = src_y1 - h
                src_y1 -= shift
                y1 -= shift

            # Final check of matching dimensions
            cur_h = min(y1 - y0, src_y1 - src_y0)
            cur_w = min(x1 - x0, src_x1 - src_x0)
            if cur_h <= 0 or cur_w <= 0:
                continue

            y1 = y0 + cur_h
            x1 = x0 + cur_w
            src_y1 = src_y0 + cur_h
            src_x1 = src_x0 + cur_w

            # Radial distance grid
            yy, xx = np.ogrid[y0:y1, x0:x1]
            dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / float(radius)

            inner = max(0.0, 1.0 - spot.feather)
            mask = np.zeros_like(dist, dtype=np.float32)

            inner_mask = dist <= inner
            mask[inner_mask] = 1.0

            feather_band = (dist > inner) & (dist <= 1.0)
            if np.any(feather_band) and spot.feather > 0.0:
                t = (dist[feather_band] - inner) / spot.feather
                mask[feather_band] = 0.5 * (1.0 + np.cos(np.pi * t))

            weight = np.clip(mask * spot.opacity, 0.0, 1.0)
            weight = weight[:, :, np.newaxis]

            target_patch = arr[y0:y1, x0:x1]
            source_patch = arr[src_y0:src_y1, src_x0:src_x1]

            if spot.mode == RetouchMode.HEAL:
                # Border illumination & color matching for seamless texture synthesis
                border_mask = (dist >= 0.65) & (dist <= 1.0)
                if np.sum(border_mask) > 4:
                    target_mean = np.mean(target_patch[border_mask], axis=0)
                    source_mean = np.mean(source_patch[border_mask], axis=0)
                    color_offset = target_mean - source_mean
                    healed_source = np.clip(source_patch + color_offset, 0.0, 1.0)
                else:
                    healed_source = source_patch

                arr[y0:y1, x0:x1] = (1.0 - weight) * target_patch + weight * healed_source
            else:
                # Direct Clone Stamp
                arr[y0:y1, x0:x1] = (1.0 - weight) * target_patch + weight * source_patch

        arr = np.clip(arr, 0.0, 1.0)
        return ImageBuffer(
            data=arr,
            width=w,
            height=h,
            channels=c,
            dtype=np.dtype(np.float32),
            color_space=color_space,
        )
