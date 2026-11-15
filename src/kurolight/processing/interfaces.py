"""Protocols and abstract interfaces for image processing and decoding."""

import threading
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Optional, Protocol, runtime_checkable

import numpy as np

from kurolight.domain.editing import EditState
from kurolight.processing.buffer import ImageBuffer


@runtime_checkable
class ImageProcessor(Protocol):
    """Core contract for non-destructive image manipulation."""

    def decode(self, source_path: Path) -> ImageBuffer:
        """Decode image file into an ImageBuffer."""
        ...

    def create_preview(self, buffer: ImageBuffer, max_edge: int = 2048) -> ImageBuffer:
        """Downscale buffer to maximum edge dimension preserving aspect ratio."""
        ...

    def process(
        self,
        buffer: ImageBuffer,
        edit_state: EditState,
        progress_callback: Callable[[int], None] | None = None,
        cancel_event: threading.Event | None = None,
        custom_luts: Mapping[str, np.ndarray] | None = None,
    ) -> ImageBuffer:
        """Execute full non-destructive parameter pipeline."""
        ...


@runtime_checkable
class RawDecoder(Protocol):
    """Isolated contract for camera RAW decoding."""

    def can_decode(self, source_path: Path) -> bool:
        """Check if format/file is supported RAW."""
        ...

    def decode_raw(self, source_path: Path, half_size: bool = False) -> ImageBuffer:
        """Decode RAW camera file to an ImageBuffer."""
        ...

    def extract_preview(self, source_path: Path) -> Optional[ImageBuffer]:
        """Fast extraction of embedded JPEG preview if available."""
        ...


@runtime_checkable
class ColorEngineInterface(Protocol):
    """Contract for color space transformations and grading operations."""

    def apply_color_grading(self, buffer: ImageBuffer, edit_state: EditState) -> ImageBuffer:
        """Apply 4-way wheels and tone curves."""
        ...

    def transform_color_space(
        self, buffer: ImageBuffer, source_space: str, target_space: str
    ) -> ImageBuffer:
        """Transform between designated color spaces."""
        ...
