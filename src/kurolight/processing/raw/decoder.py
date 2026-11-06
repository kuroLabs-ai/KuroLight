"""Camera RAW image decoding architecture with fallback mechanisms."""

from pathlib import Path
from typing import Optional, Set
import numpy as np
from PIL import Image, ImageOps

from kurolight.infrastructure.logging import get_logger
from kurolight.processing.buffer import ImageBuffer
from kurolight.processing.interfaces import RawDecoder

logger = get_logger("processing.raw")

RAW_EXTENSIONS: Set[str] = {
    ".dng", ".cr2", ".cr3", ".nef", ".arw", ".orf", ".rw2", ".pef", ".raf", ".srw"
}


class DefaultRawDecoder(RawDecoder):
    """Decode a limited set of RAW extensions using rawpy or a Pillow fallback."""

    def __init__(self):
        self._rawpy_available = False
        try:
            import rawpy  # type: ignore
            _ = rawpy
            self._rawpy_available = True
            logger.info("rawpy / LibRaw backend is available.")
        except ImportError:
            logger.info("rawpy not installed; trying Pillow's raster decoder for RAW files.")

    def can_decode(self, source_path: Path) -> bool:
        """Verify if file extension matches camera RAW specifications."""
        path = Path(source_path)
        return path.suffix.lower() in RAW_EXTENSIONS

    def decode_raw(self, source_path: Path, half_size: bool = False) -> ImageBuffer:
        """Decode RAW camera file to high-precision float32 ImageBuffer."""
        path = Path(source_path).resolve()
        if not path.exists():
            raise FileNotFoundError(f"RAW file not found: {path}")

        # 1. Primary path: rawpy if available
        if self._rawpy_available:
            try:
                import rawpy  # type: ignore
                with rawpy.imread(str(path)) as raw:
                    rgb = raw.postprocess(
                        half_size=half_size,
                        use_camera_wb=True,
                        output_color=rawpy.ColorSpace.sRGB,
                        output_bps=16,
                    )
                    # Convert uint16 to float32 [0.0, 1.0]
                    float_data = rgb.astype(np.float32) / 65535.0
                    h, w, c = float_data.shape
                    return ImageBuffer(
                        data=float_data,
                        width=w,
                        height=h,
                        channels=c,
                        dtype=np.dtype(np.float32),
                        color_space="sRGB",
                    )
            except Exception as e:
                logger.warning("rawpy failed on %s: %s; falling back to Pillow", path, e)

        # 2. Fallback path: Decode a raster representation Pillow can read.
        try:
            with Image.open(path) as img:
                img = ImageOps.exif_transpose(img).convert("RGB")
                arr = np.array(img, dtype=np.float32) / 255.0
                h, w, c = arr.shape
                return ImageBuffer(
                    data=arr,
                    width=w,
                    height=h,
                    channels=c,
                    dtype=np.dtype(np.float32),
                    color_space="sRGB",
                )
        except Exception as e:
            raise RuntimeError(f"Unable to decode RAW file {path}: {e}") from e

    def extract_preview(self, source_path: Path) -> Optional[ImageBuffer]:
        """Decode Pillow's default image/frame as a preview when possible."""
        path = Path(source_path).resolve()
        try:
            with Image.open(path) as img:
                img = ImageOps.exif_transpose(img).convert("RGB")
                arr = np.array(img, dtype=np.float32) / 255.0
                h, w, c = arr.shape
                return ImageBuffer(
                    data=arr,
                    width=w,
                    height=h,
                    channels=c,
                    dtype=np.dtype(np.float32),
                    color_space="sRGB",
                )
        except Exception:
            return None
