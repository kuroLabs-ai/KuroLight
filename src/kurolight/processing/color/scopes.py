"""Real-time color scopes computation: Histogram, Waveform, and Vectorscope."""

from dataclasses import dataclass
from math import ceil

import numpy as np

from kurolight.processing.buffer import ImageBuffer


@dataclass
class HistogramData:
    """Calculated 256-bin distribution for RGB and Master Luminance."""
    r_bins: np.ndarray  # shape (256,), normalized 0.0 to 1.0
    g_bins: np.ndarray
    b_bins: np.ndarray
    lum_bins: np.ndarray

    @classmethod
    def compute(cls, buffer: ImageBuffer, sample_step: int = 4) -> "HistogramData":
        """Fast calculation of 256 bins by downsampling."""
        if sample_step < 1:
            raise ValueError("Histogram sample step must be positive")
        if buffer.width < 1 or buffer.height < 1:
            raise ValueError("Image dimensions must be positive")

        # Subsample for 60fps performance on large images
        sub = buffer.data[::sample_step, ::sample_step, :3]
        clipped = np.clip(sub, 0.0, 1.0)

        # R, G, B histograms
        r_hist, _ = np.histogram(clipped[..., 0], bins=256, range=(0.0, 1.0))
        g_hist, _ = np.histogram(clipped[..., 1], bins=256, range=(0.0, 1.0))
        b_hist, _ = np.histogram(clipped[..., 2], bins=256, range=(0.0, 1.0))

        # Master Luminance
        lum = 0.2126 * clipped[..., 0] + 0.7152 * clipped[..., 1] + 0.0722 * clipped[..., 2]
        lum_hist, _ = np.histogram(lum, bins=256, range=(0.0, 1.0))

        # Normalize to [0.0, 1.0] peak
        def norm(h: np.ndarray) -> np.ndarray:
            max_val = np.max(h)
            return (h.astype(np.float32) / max_val) if max_val > 0 else np.zeros(256, dtype=np.float32)

        return cls(
            r_bins=norm(r_hist),
            g_bins=norm(g_hist),
            b_bins=norm(b_hist),
            lum_bins=norm(lum_hist),
        )


class ScopesCalculator:
    """Computes Waveform and Vectorscope matrices for professional color grading analysis."""

    @staticmethod
    def compute_waveform(buffer: ImageBuffer, width: int = 256, height: int = 128) -> np.ndarray:
        """Calculate 2D luminance waveform matrix (height, width) normalized 0.0 to 1.0."""
        if width < 1 or height < 1:
            raise ValueError("Waveform dimensions must be positive")
        if buffer.width < 1 or buffer.height < 1:
            raise ValueError("Image dimensions must be positive")

        step_y = max(1, ceil(buffer.height / height))
        step_x = max(1, ceil(buffer.width / width))
        sub = buffer.data[::step_y, ::step_x, :3]

        lum = 0.2126 * sub[..., 0] + 0.7152 * sub[..., 1] + 0.0722 * sub[..., 2]
        lum = np.clip(lum, 0.0, 1.0)

        matrix = np.zeros((height, width), dtype=np.float32)
        actual_h, actual_w = lum.shape
        x_indices = np.minimum(
            (np.arange(actual_w) * width // max(actual_w, 1)), width - 1
        )
        y_indices = np.minimum(
            ((1.0 - lum) * (height - 1)).astype(np.int32), height - 1
        )
        np.add.at(matrix, (y_indices.ravel(), np.broadcast_to(x_indices, y_indices.shape).ravel()), 1.0)

        max_val = np.max(matrix)
        if max_val > 0:
            matrix = np.log1p(matrix) / np.log1p(max_val)

        return matrix

    @staticmethod
    def compute_vectorscope(buffer: ImageBuffer, size: int = 140, sample_step: int = 4) -> np.ndarray:
        """
        Calculate 2D Cb/Cr chroma density vectorscope matrix (size, size).
        Centered at (size//2, size//2) with normalized log density [0.0, 1.0].
        """
        if size < 1 or sample_step < 1:
            raise ValueError("Vectorscope size and sample step must be positive")
        if buffer.width < 1 or buffer.height < 1:
            raise ValueError("Image dimensions must be positive")

        sub = buffer.data[::sample_step, ::sample_step, :3]
        flat_r = sub[..., 0].ravel()
        flat_g = sub[..., 1].ravel()
        flat_b = sub[..., 2].ravel()

        # ITU-R BT.601 / BT.709 Chroma difference projection
        cb = -0.168736 * flat_r - 0.331264 * flat_g + 0.500000 * flat_b  # [-0.5, 0.5]
        cr = 0.500000 * flat_r - 0.418688 * flat_g - 0.081312 * flat_b  # [-0.5, 0.5]

        # Map to Cartesian grid (size, size)
        scale = size - 1
        x_coords = np.clip(((cb + 0.5) * scale).astype(np.int32), 0, size - 1)
        y_coords = np.clip(((0.5 - cr) * scale).astype(np.int32), 0, size - 1)

        matrix = np.zeros((size, size), dtype=np.float32)
        np.add.at(matrix, (y_coords, x_coords), 1.0)

        max_val = np.max(matrix)
        if max_val > 0:
            matrix = np.log1p(matrix) / np.log1p(max_val)

        return matrix
