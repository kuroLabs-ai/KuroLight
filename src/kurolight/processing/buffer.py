"""Explicit typed ImageBuffer representation for high-fidelity processing."""

from dataclasses import dataclass
import numpy as np
from PIL import Image


@dataclass
class ImageBuffer:
    """Explicitly typed image array structure with dimension and color space guarantees."""

    data: np.ndarray  # Shape: (H, W, C) in float32 [0.0, 1.0] or uint8 [0, 255]
    width: int
    height: int
    channels: int
    dtype: np.dtype
    color_space: str = "sRGB"  # "sRGB", "Linear", "Display P3", "Adobe RGB"
    has_alpha: bool = False

    @classmethod
    def from_numpy(
        cls,
        array: np.ndarray,
        color_space: str = "sRGB",
        channel_order: str = "RGB",
    ) -> "ImageBuffer":
        """Create buffer from numpy ndarray with shape validation."""
        if array.ndim == 2:
            # Grayscale -> expand to 3 channels
            array = np.stack([array] * 3, axis=-1)
        elif array.ndim != 3:
            raise ValueError(f"Expected 2D or 3D array, got {array.ndim}D")

        h, w, c = array.shape
        has_alpha = c == 4

        # Convert to float32 [0.0, 1.0] for precision processing
        if array.dtype == np.uint8:
            data = array.astype(np.float32) / 255.0
        elif array.dtype == np.uint16:
            data = array.astype(np.float32) / 65535.0
        elif np.issubdtype(array.dtype, np.floating):
            data = array.astype(np.float32)
        else:
            data = array.astype(np.float32)

        return cls(
            data=data,
            width=w,
            height=h,
            channels=c,
            dtype=np.dtype(np.float32),
            color_space=color_space,
            has_alpha=has_alpha,
        )

    @classmethod
    def from_file(cls, path: str) -> "ImageBuffer":
        """Load standard raster file via Pillow."""
        with Image.open(path) as img:
            img = img.convert("RGB")
            arr = np.array(img)
            return cls.from_numpy(arr, color_space="sRGB")

    def to_uint8(self) -> np.ndarray:
        """Export as uint8 RGB array clamped to [0, 255]."""
        clipped = np.clip(self.data, 0.0, 1.0)
        return (clipped * 255.0).astype(np.uint8)

    def to_qimage(self):
        """Convert buffer to PySide6.QtGui.QImage for UI preview rendering."""
        from PySide6.QtGui import QImage
        u8_data = self.to_uint8()
        h, w, c = u8_data.shape
        bytes_per_line = c * w

        if c == 3:
            # Ensure memory is contiguous
            contiguous = np.ascontiguousarray(u8_data)
            return QImage(
                contiguous.data,
                w,
                h,
                bytes_per_line,
                QImage.Format.Format_RGB888,
            ).copy()
        elif c == 4:
            contiguous = np.ascontiguousarray(u8_data)
            return QImage(
                contiguous.data,
                w,
                h,
                bytes_per_line,
                QImage.Format.Format_RGBA8888,
            ).copy()
        else:
            raise ValueError(f"Unsupported channel count for QImage: {c}")

    def clone(self) -> "ImageBuffer":
        """Deep copy of the image buffer."""
        return ImageBuffer(
            data=self.data.copy(),
            width=self.width,
            height=self.height,
            channels=self.channels,
            dtype=self.dtype,
            color_space=self.color_space,
            has_alpha=self.has_alpha,
        )

    def copy(self) -> "ImageBuffer":
        """Alias for clone."""
        return self.clone()
