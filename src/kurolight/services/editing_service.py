"""Service coordinating preview rendering, buffer caching, and edit states."""

import threading
from collections.abc import Callable
from pathlib import Path
from typing import Dict, Optional

from PySide6.QtCore import QObject, Signal

from kurolight.domain.editing import EditState
from kurolight.infrastructure.database.repository import EditStateRepository
from kurolight.processing.buffer import ImageBuffer
from kurolight.processing.interfaces import ImageProcessor
from kurolight.processing.pipeline import DefaultImageProcessor


class EditingService(QObject):
    """Manages active image buffer caching and non-destructive rendering."""

    preview_rendered = Signal(object)  # ImageBuffer

    def __init__(
        self,
        edit_state_repo: EditStateRepository,
        processor: Optional[ImageProcessor] = None,
        max_preview_edge: int = 2048,
        parent: Optional[QObject] = None,
    ):
        super().__init__(parent)
        self.edit_state_repo = edit_state_repo
        self.processor = processor or DefaultImageProcessor()
        self.max_preview_edge = max_preview_edge

        # Decoded raw working buffers: asset_id -> ImageBuffer
        self._source_cache: Dict[str, ImageBuffer] = {}
        self._preview_cache: Dict[str, ImageBuffer] = {}

    def get_or_load_source_buffer(self, asset_id: str, source_path: Path) -> ImageBuffer:
        """Fetch cached source buffer or decode from disk."""
        if asset_id not in self._source_cache:
            decoded = self.processor.decode(source_path)
            # Downscale working preview if source is enormous
            working = self.processor.create_preview(decoded, max_edge=self.max_preview_edge)
            self._source_cache[asset_id] = working
        return self._source_cache[asset_id]

    def get_edit_state(self, asset_id: str) -> EditState:
        """Fetch persistent EditState or create clean default."""
        state = self.edit_state_repo.get_by_asset_id(asset_id)
        if not state:
            state = EditState(asset_id=asset_id)
            self.edit_state_repo.save(state)
        return state

    def save_edit_state(self, state: EditState) -> None:
        """Persist updated EditState."""
        self.edit_state_repo.save(state)

    def render_preview(
        self,
        asset_id: str,
        source_path: Path,
        edit_state: EditState,
        progress_callback: Callable[[int], None] | None = None,
        cancel_event: threading.Event | None = None,
    ) -> ImageBuffer:
        """Execute processing pipeline on source buffer and return rendered result."""
        source_buf = self.get_or_load_source_buffer(asset_id, source_path)
        if (
            (progress_callback is not None or cancel_event is not None)
            and isinstance(self.processor, DefaultImageProcessor)
        ):
            rendered = self.processor.process(
                source_buf, edit_state, progress_callback, cancel_event
            )
        else:
            rendered = self.processor.process(source_buf, edit_state)
        self._preview_cache[asset_id] = rendered
        self.preview_rendered.emit(rendered)
        return rendered

    def clear_cache(self, asset_id: Optional[str] = None) -> None:
        """Flush memory cache."""
        if asset_id:
            self._source_cache.pop(asset_id, None)
            self._preview_cache.pop(asset_id, None)
        else:
            self._source_cache.clear()
            self._preview_cache.clear()
