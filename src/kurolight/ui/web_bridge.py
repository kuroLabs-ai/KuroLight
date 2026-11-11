"""KuroLight Web Bridge — pywebview bridge connecting React to Python.

Exposes Python core services (editing, library, collections, RAW pipeline, OpenCV, SQLite, Presets, History, AI)
to the high-performance React + Tailwind frontend.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import logging
import os
import platform
import sys
import threading
import uuid
import webbrowser
from pathlib import Path
from typing import Any, Callable, Optional

import cv2
import numpy as np

from kurolight.ai.service import KuroAIService
from kurolight.app import AppState, EditStateSnapshotCommand
from kurolight.config.app_config import AppConfig
from kurolight.domain.assets import ImageAsset
from kurolight.domain.collections import SmartCollectionRules
from kurolight.domain.editing import CurvePoint, EditState
from kurolight.domain.export import ColorSpace, ExportFormat, ExportJob, ExportSettings, ResizeMode
from kurolight.domain.masking import AdjustmentMask
from kurolight.domain.metadata import AssetMetadataOverrides
from kurolight.domain.retouch import RetouchSpot
from kurolight.processing.analysis.auto_tone import AutoToneAnalyzer
from kurolight.processing.buffer import ImageBuffer
from kurolight.processing.color.scopes import ScopesCalculator
from kurolight.processing.enhancement import ImageEnhancementEngine, ProcessingCancelled
from kurolight.services.editing_service import EditingService
from kurolight.services.export_job_manager import ExportJobManager
from kurolight.services.library_service import SUPPORTED_EXTENSIONS, ImportBatchResult

logger = logging.getLogger(__name__)


class _BridgeEvent:
    def __init__(self, bridge: "PyBridge", event_name: str) -> None:
        self._bridge = bridge
        self._event_name = event_name

    def emit(self, *args: Any) -> None:
        self._bridge._emit_event(self._event_name, args)


class _SingleShotTimer:
    def __init__(self, callback: Any, interval_ms: int) -> None:
        self._callback = callback
        self._interval_ms = interval_ms
        self._timer: Optional[threading.Timer] = None
        self._lock = threading.Lock()

    def start(self, interval_ms: Optional[int] = None) -> None:
        with self._lock:
            if interval_ms is not None:
                self._interval_ms = interval_ms
            if self._timer:
                self._timer.cancel()
            timer = threading.Timer(self._interval_ms / 1000, self._fire)
            timer.daemon = True
            self._timer = timer
            timer.start()

    def stop(self) -> None:
        with self._lock:
            if self._timer:
                self._timer.cancel()
                self._timer = None

    def isActive(self) -> bool:
        with self._lock:
            return self._timer is not None

    def _fire(self) -> None:
        with self._lock:
            self._timer = None
        self._callback()


class _SerializedAPI:
    def __init__(self, bridge: "PyBridge") -> None:
        self._lock = bridge._lock
        concurrent_methods = {
            "get_ai_models",
            "test_ai_connection",
            "save_ai_settings",
            "propose_ai_edits",
            "cancel_import",
            "download_local_enhancement_model",
            "has_local_enhancement_model",
            "cancel_processing",
            "import_files",
            "import_folder",
            "choose_export_folder",
        }
        for name in dir(bridge):
            if name.startswith("_"):
                continue
            method = getattr(bridge, name)
            if callable(method):
                setattr(
                    self,
                    name,
                    method if name in concurrent_methods else self._wrap(method),
                )

    def _wrap(self, method: Any) -> Any:
        def invoke(*args: Any) -> Any:
            with self._lock:
                return method(*args)

        return invoke


class PyBridge:
    """Python API exposed to JavaScript by pywebview."""

    _EVENTS = (
        "image_updated",
        "before_image_updated",
        "histogram_updated",
        "assets_updated",
        "asset_count_updated",
        "trash_count_updated",
        "library_loading",
        "collections_updated",
        "presets_updated",
        "history_updated",
        "asset_selected",
        "filmstrip_toggled",
        "workspace_changed",
        "color_scopes_updated",
        "notification",
        "processing_progress",
    )

    def __init__(
        self,
        app_state: AppState,
        library_service: Any,
        editing_service: Any,
        command_dispatcher: Any,
        preset_service: Any,
        export_service: Any = None,
        history_repository: Any = None,
        parent_widget: Any = None,
        parent: Any = None,
    ) -> None:
        self.app_state = app_state
        self.library_service = library_service
        self.editing_service = editing_service
        self.command_dispatcher = command_dispatcher
        self.preset_service = preset_service
        self.export_service = export_service
        self.history_repository = history_repository
        self.export_job_manager = ExportJobManager(export_service) if export_service else None
        self.config = AppConfig.load()
        self.kuro_ai_service = KuroAIService()
        self._window: Any = None
        self._lock = threading.RLock()
        self._processing_cancel_lock = threading.Lock()
        self._active_processing_cancel: threading.Event | None = None
        self._import_cancel_event = threading.Event()
        self._missing_source_notified: set[str] = set()
        for event_name in self._EVENTS:
            setattr(self, event_name, _BridgeEvent(self, event_name))

        self._pending_edit_state: Optional[EditState] = None
        self._edit_start_state: Optional[EditState] = None
        self._filmstrip_visible: bool = True
        self._is_crop_mode: bool = False
        self._active_workspace: str = self.app_state.active_workspace

        # Throttle preview rendering to 20ms (~50 FPS)
        self._render_timer = _SingleShotTimer(
            lambda: self._run_serialized(self._do_render_preview), 20
        )

        # Debounce disk saving & undo stack to 300ms idle
        self._save_timer = _SingleShotTimer(
            lambda: self._run_serialized(self._do_commit_edit_state), 300
        )

    def _run_serialized(self, callback: Any) -> None:
        with self._lock:
            callback()

    def toggle_fullscreen(self) -> None:
        if self._window:
            self._window.toggle_fullscreen()

    def show_devtools(self) -> None:
        if self._window:
            self._window.show_devtools()

    def _emit_history(self) -> None:
        if self.command_dispatcher:
            history = self.command_dispatcher.get_history_list()
            self.history_updated.emit(history, self.command_dispatcher.active_index)

    def _restore_asset_history(self, asset_id: Optional[str]) -> None:
        if not self.command_dispatcher:
            return
        try:
            saved = (
                self.history_repository.get_by_asset_id(asset_id)
                if self.history_repository and asset_id
                else None
            )
            if saved:
                self.command_dispatcher.restore_history(*saved)
            else:
                self.command_dispatcher.clear()
        except Exception as exc:
            logger.exception("Could not restore edit history for asset %s", asset_id)
            self.command_dispatcher.clear()
            self.notification.emit(
                "Edit History Unavailable",
                f"Could not restore this photo's undo history: {exc}",
                "error",
            )
        self._emit_history()

    def _persist_asset_history(self, asset_id: str) -> bool:
        if not self.history_repository or not self.command_dispatcher:
            return True
        try:
            commands, active_index = self.command_dispatcher.serialize_history()
            self.history_repository.save(asset_id, commands, active_index)
            return True
        except Exception as exc:
            logger.exception("Could not persist edit history for asset %s", asset_id)
            self.notification.emit(
                "Edit History Not Saved",
                f"Changes are saved, but this photo's undo history could not be saved: {exc}",
                "error",
            )
            return False

    def _file_dialog(self_or_dialog: Any, dialog_or_none: str | None = None) -> Any:
        """Open a native Windows/OS file or folder selection dialog.

        Uses the native pywebview window file dialog first (modern Windows IFileDialog),
        falling back to PySide6 QFileDialog and finally tkinter if present.
        """
        if isinstance(self_or_dialog, str) and dialog_or_none is None:
            inst: Any = None
            dialog = self_or_dialog
        else:
            inst = self_or_dialog
            dialog = dialog_or_none or ""

        # 1. Preferred: Native pywebview window dialog attached to the application window
        window = getattr(inst, "_window", None) if inst is not None else None
        if window is not None and hasattr(window, "create_file_dialog"):
            try:
                import webview

                if dialog == "files":
                    patterns = ";".join(f"*{ext}" for ext in sorted(SUPPORTED_EXTENSIONS))
                    file_types = (f"Image Files ({patterns})", "All Files (*.*)")
                    res = window.create_file_dialog(
                        dialog_type=webview.FileDialog.OPEN,
                        allow_multiple=True,
                        file_types=file_types,
                    )
                    return list(res) if res else []
                else:
                    init_dir = str(Path.home() / "Pictures") if dialog == "export_folder" else ""
                    res = window.create_file_dialog(
                        dialog_type=webview.FileDialog.FOLDER,
                        directory=init_dir,
                    )
                    if res and len(res) > 0:
                        return res[0]
                    return ""
            except Exception as exc:
                logger.warning("pywebview create_file_dialog failed (%s), falling back to Qt dialog", exc)

        # 2. PySide6 native dialog (always bundled in KuroLight executable)
        try:
            from PySide6.QtWidgets import QApplication, QFileDialog

            _ = QApplication.instance() or QApplication(sys.argv)
            if dialog == "files":
                patterns = " ".join(f"*{ext}" for ext in sorted(SUPPORTED_EXTENSIONS))
                files, _ = QFileDialog.getOpenFileNames(
                    None,
                    "Import Photos into KuroLight",
                    str(Path.home() / "Pictures"),
                    f"Image Files ({patterns});;All Files (*.*)",
                )
                return files or []
            elif dialog == "import_folder":
                folder = QFileDialog.getExistingDirectory(
                    None,
                    "Select Folder to Import into KuroLight",
                    str(Path.home() / "Pictures"),
                    QFileDialog.Option.ShowDirsOnly,
                )
                return folder or ""
            else:
                folder = QFileDialog.getExistingDirectory(
                    None,
                    "Choose Export Destination Folder",
                    str(Path.home() / "Pictures"),
                    QFileDialog.Option.ShowDirsOnly,
                )
                return folder or ""
        except Exception as exc:
            logger.warning("PySide6 QFileDialog failed (%s), falling back to tkinter", exc)

        # 3. Fallback to tkinter only if available
        try:
            import tkinter as tk
            from tkinter import filedialog

            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            try:
                if dialog == "files":
                    return filedialog.askopenfilenames(
                        parent=root,
                        title="Import Photos into KuroLight",
                        filetypes=[
                            (
                                "Image Files",
                                " ".join(f"*{extension}" for extension in sorted(SUPPORTED_EXTENSIONS)),
                            ),
                            ("All Files", "*.*"),
                        ],
                    )
                if dialog == "import_folder":
                    return filedialog.askdirectory(
                        parent=root,
                        title="Select Folder to Import into KuroLight",
                    )
                return filedialog.askdirectory(
                    parent=root,
                    title="Choose Export Destination Folder",
                    initialdir=str(Path.home() / "Pictures"),
                )
            finally:
                root.destroy()
        except Exception as exc:
            logger.error("All native file dialog providers failed: %s", exc)
            return [] if dialog == "files" else ""

    def _emit_event(self, event_name: str, args: tuple[Any, ...]) -> None:
        window = self._window
        if window is None:
            return
        event = json.dumps(f"kurolight:{event_name}")
        payload = json.dumps(args, separators=(",", ":"))
        try:
            window.evaluate_js(
                f"window.dispatchEvent(new CustomEvent({event}, {{ detail: {payload} }}));"
            )
        except Exception:
            logger.exception("Could not send %s event to the webview", event_name)

    # ── Initial Sync ───────────────────────────────────────────────────────

    def initial_sync(self) -> None:
        """Push initial library assets, collections, presets, and active asset state to the webview."""
        self._set_library_loading(True, "Loading photo library…")
        try:
            assets = self._push_assets()
            self._push_trash_count()
            self._push_collections()
            self._push_presets()
            self._emit_history()
            if assets:
                active_id = self.app_state.active_asset.id if self.app_state.active_asset else assets[0].id
                self.select_asset(active_id)
        finally:
            self._set_library_loading(False)

    def _push_assets(self) -> list[ImageAsset]:
        project = self.app_state.current_project
        project_id = project.id if project else None
        repository = self.library_service.asset_repo
        assets = repository.list_page(project_id, 0, 200)
        total = repository.count_by_project(project_id)
        self.assets_updated.emit(
            json.dumps([self._asset_summary(asset, include_metadata=False) for asset in assets])
        )
        self.asset_count_updated.emit(total)
        return assets

    def _push_trash_count(self) -> None:
        project = self.app_state.current_project
        if not project:
            self.trash_count_updated.emit(0)
            return
        self.trash_count_updated.emit(
            self.library_service.asset_repo.count_trashed(project.id)
        )

    @staticmethod
    def _asset_summary(
        asset: ImageAsset, *, include_metadata: bool = True
    ) -> dict[str, Any]:
        meta = asset.metadata or {}
        summary = {
            "id": asset.id,
            "file_name": asset.file_name,
            "source_path": str(asset.source_path),
            "width": asset.width,
            "height": asset.height,
            "file_size": asset.file_size or meta.get("file_size_bytes", 0),
            "file_size_bytes": asset.file_size or meta.get("file_size_bytes", 0),
            "camera_model": meta.get("camera_model") or "",
            "camera_make": meta.get("camera_make") or "",
            "lens_model": meta.get("lens_model") or "",
            "iso": meta.get("iso"),
            "shutter_speed": meta.get("shutter_speed_str") or "",
            "f_number": meta.get("aperture_f_number"),
            "focal_length": meta.get("focal_length_mm"),
            "date_taken": str(asset.date_captured) if asset.date_captured else None,
            "format": meta.get("format") or asset.file_type or "",
            "rating": asset.rating or 0,
            "flag": asset.flag or "unflagged",
            "deleted_at": asset.deleted_at,
        }
        if include_metadata:
            summary["metadata"] = meta
            summary["metadata_overrides"] = asset.metadata_overrides.model_dump(mode="json")
        return summary

    def get_asset_page(
        self, offset: int, limit: int = 100, filters_json: str = "{}"
    ) -> str:
        """Return one bounded, Gallery-filtered catalog page and its result count."""
        if isinstance(offset, bool) or not isinstance(offset, int):
            raise ValueError("Asset page offset must be an integer.")
        if isinstance(limit, bool) or not isinstance(limit, int):
            raise ValueError("Asset page limit must be an integer.")
        filters = json.loads(filters_json)
        if not isinstance(filters, dict):
            raise ValueError("Asset page filters must be a JSON object.")
        allowed_filters = {
            "collection_id",
            "source_folder",
            "minimum_rating",
            "flag",
            "search",
            "sort_by",
            "ascending",
            "trash_only",
        }
        unknown = set(filters) - allowed_filters
        if unknown:
            raise ValueError(f"Unsupported asset page filters: {', '.join(sorted(unknown))}")

        collection_id = filters.get("collection_id")
        source_folder = filters.get("source_folder")
        minimum_rating = filters.get("minimum_rating", 0)
        flag = filters.get("flag", "all")
        search = filters.get("search", "")
        sort_by = filters.get("sort_by", "file_name")
        ascending = filters.get("ascending", True)
        trash_only = filters.get("trash_only", False)
        if collection_id is not None and not isinstance(collection_id, str):
            raise ValueError("Collection ID must be a string.")
        if source_folder is not None and not isinstance(source_folder, str):
            raise ValueError("Source folder must be a string.")
        if isinstance(minimum_rating, bool) or not isinstance(minimum_rating, int):
            raise ValueError("Minimum rating must be an integer from 0 to 5.")
        if not isinstance(flag, str) or not isinstance(search, str):
            raise ValueError("Asset flag and search filters must be strings.")
        if not isinstance(sort_by, str) or not isinstance(ascending, bool):
            raise ValueError("Asset sort mode and direction are invalid.")
        if not isinstance(trash_only, bool):
            raise ValueError("Trash-only filter must be a boolean.")

        project = self.app_state.current_project
        project_id = project.id if project else None
        repository = self.library_service.asset_repo
        query = {
            "collection_id": collection_id,
            "source_folder": source_folder,
            "minimum_rating": minimum_rating,
            "flag": flag,
            "search": search,
            "trash_only": trash_only,
        }
        assets = repository.list_filtered_page(
            project_id,
            offset,
            limit,
            **query,
            sort_by=sort_by,
            ascending=ascending,
        )
        return json.dumps({
            "assets": [self._asset_summary(asset) for asset in assets],
            "total": repository.count_filtered(project_id, **query),
            "offset": offset,
            "limit": limit,
        })

    def get_source_folders(self, offset: int = 0, limit: int = 100) -> str:
        """Return a bounded page of source folders represented in the catalog."""
        if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
            raise ValueError("Folder page offset must be a non-negative integer.")
        if (
            isinstance(limit, bool)
            or not isinstance(limit, int)
            or not 1 <= limit <= 200
        ):
            raise ValueError("Folder page limit must be an integer between 1 and 200.")
        project = self.app_state.current_project
        if not project:
            return json.dumps({"folders": [], "total": 0, "offset": offset, "limit": limit})
        folders, total = self.library_service.asset_repo.list_source_folders(
            project.id, offset, limit
        )
        return json.dumps(
            {"folders": folders, "total": total, "offset": offset, "limit": limit}
        )

    def get_asset_ids(self, filters_json: str = "{}") -> str:
        """Return ordered matching IDs for cross-page selection and batch operations."""
        filters = json.loads(filters_json)
        if not isinstance(filters, dict):
            raise ValueError("Asset ID filters must be a JSON object.")
        allowed_filters = {
            "collection_id",
            "source_folder",
            "minimum_rating",
            "flag",
            "search",
            "sort_by",
            "ascending",
            "trash_only",
        }
        unknown = set(filters) - allowed_filters
        if unknown:
            raise ValueError(f"Unsupported asset ID filters: {', '.join(sorted(unknown))}")

        project = self.app_state.current_project
        project_id = project.id if project else None
        repository = self.library_service.asset_repo
        ids = repository.list_filtered_ids(
            project_id,
            collection_id=filters.get("collection_id"),
            source_folder=filters.get("source_folder"),
            minimum_rating=filters.get("minimum_rating", 0),
            flag=filters.get("flag", "all"),
            search=filters.get("search", ""),
            sort_by=filters.get("sort_by", "file_name"),
            ascending=filters.get("ascending", True),
            trash_only=filters.get("trash_only", False),
        )
        return json.dumps(ids)

    def is_asset_in_collection(self, asset_id: str, collection_id: str) -> bool:
        """Check collection membership without sending full membership lists to the UI."""
        project = self.app_state.current_project
        if not project:
            return False
        return self.library_service.collection_repo.contains_asset(
            collection_id, asset_id, project.id
        )

    def _push_collections(self) -> None:
        project = self.app_state.current_project
        if not project:
            return
        colls_payload = [
            {
                "id": collection["id"],
                "name": collection["name"],
                "parent_id": collection["parent_id"],
                "collection_type": collection["collection_type"],
                "rules": collection["rules"],
                "asset_ids": [],
                "asset_count": collection["asset_count"],
                "created_at": collection["created_at"],
            }
            for collection in self.library_service.collection_repo.list_summaries_by_project(
                project.id
            )
        ]
        self.collections_updated.emit(json.dumps(colls_payload))

    def _push_presets(self) -> None:
        if not self.preset_service:
            return
        presets = self.preset_service.get_presets()
        payload = []
        for p in presets:
            payload.append({
                "id": p.id,
                "name": p.name,
                "category": p.category,
                "parameters": p.parameters if hasattr(p, "parameters") else {},
            })
        self.presets_updated.emit(json.dumps(payload))

    def _get_thumbnail_data_url(self, asset: ImageAsset) -> str:
        try:
            thumbnail = self.library_service.get_thumbnail_bytes(asset, size=240)
            if thumbnail:
                return "data:image/jpeg;base64," + base64.b64encode(thumbnail).decode("ascii")
        except Exception as e:
            logger.debug(f"Thumbnail error for {asset.id}: {e}")
        return ""

    def get_thumbnails(self, asset_ids_json: str) -> str:
        """Return a bounded batch of thumbnail data URLs keyed by asset ID."""
        try:
            asset_ids = json.loads(asset_ids_json)
            if not isinstance(asset_ids, list) or not all(
                isinstance(asset_id, str) for asset_id in asset_ids
            ):
                raise ValueError("Thumbnail request must be a list of asset IDs")
            if len(asset_ids) > 32:
                raise ValueError("Thumbnail batch cannot contain more than 32 assets")

            thumbnails = {}
            for asset_id in dict.fromkeys(asset_ids):
                asset = self.library_service.asset_repo.get_by_id(asset_id)
                if asset:
                    thumbnails[asset_id] = self._get_thumbnail_data_url(asset)
            return json.dumps(thumbnails)
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("Invalid thumbnail batch request: %s", exc)
            return json.dumps({"error": str(exc)})

    # ── JavaScript API ─────────────────────────────────────────────────────

    def select_asset(self, asset_id: str) -> None:
        """Called from JS when user selects a photo in filmstrip or gallery."""
        asset = self.library_service.asset_repo.get_by_id(asset_id)
        if not asset:
            return

        if self._save_timer.isActive():
            self._save_timer.stop()
            self._do_commit_edit_state()
        self.app_state.set_active_asset(asset)
        edit_state = self.editing_service.get_edit_state(asset_id)
        self.app_state.set_current_edit_state(edit_state)
        self._edit_start_state = None
        self._restore_asset_history(asset_id)

        state_dict = edit_state.model_dump()
        self.asset_selected.emit(json.dumps(self._asset_to_dict(asset)), json.dumps(state_dict))

        # Render unedited 'Before' preview
        if not asset.source_path.is_file():
            self.image_updated.emit("")
            self.before_image_updated.emit("")
            self.histogram_updated.emit([], [], [], [])
            self.color_scopes_updated.emit(None)
            if asset.id not in self._missing_source_notified:
                self.notification.emit(
                    "Source Image Missing",
                    f"Could not find '{asset.file_name}' at {asset.source_path}. "
                    "The catalog entry and saved edits were kept.",
                    "error",
                )
                self._missing_source_notified.add(asset.id)
            return

        self._missing_source_notified.discard(asset.id)

        # 1. Render active preview & histogram FIRST so user sees photo immediately without delay
        self._do_render_preview()

        # 2. Render unedited 'Before' preview in background thread so it never blocks active photo display
        def _render_before_async() -> None:
            try:
                unedited = EditState(asset_id=asset.id)
                source_buf = self.editing_service.get_or_load_source_buffer(
                    asset.id, asset.source_path
                )
                before_buf = self.editing_service.processor.process(source_buf, unedited)
                before_url = self._buffer_to_data_url(before_buf)
                self.before_image_updated.emit(before_url)
            except Exception as exc:
                logger.warning("Could not render before preview for %s: %s", asset.file_name, exc)

        threading.Thread(
            target=_render_before_async,
            daemon=True,
            name=f"before-preview-{asset.id}",
        ).start()

    def open_in_develop(self, asset_id: str) -> None:
        """Selects asset and immediately transitions workspace to Lightbox (develop)."""
        self.select_asset(asset_id)
        self.app_state.set_active_workspace("develop")
        self._active_workspace = "develop"
        self.workspace_changed.emit("develop")

    def set_rating(self, asset_id: str, rating: int) -> None:
        """Update 0-5 star rating for an asset."""
        self.library_service.update_rating(asset_id, rating)
        self._push_assets()
        self._push_collections()

    def batch_set_rating(self, asset_ids_json: str, rating: int) -> None:
        """Batch set rating for multiple assets."""
        try:
            ids = json.loads(asset_ids_json)
            self.library_service.batch_set_rating(ids, rating)
            self._push_assets()
            self._push_collections()
            self.notification.emit("Rating Updated", f"Set {len(ids)} photo(s) to ★ {rating}", "info")
        except Exception as e:
            logger.error(f"Batch rating error: {e}")

    def set_flag(self, asset_id: str, flag: str) -> None:
        """Update flag for an asset ('flagged', 'unflagged', 'rejected')."""
        self.library_service.update_flag(asset_id, flag)
        self._push_assets()
        self._push_collections()

    def update_asset_metadata_overrides(self, asset_id: str, overrides_json: str) -> str:
        """Save user-authored metadata in the catalog without writing images or sidecars."""
        overrides_data = json.loads(overrides_json)
        if not isinstance(overrides_data, dict):
            raise TypeError("Metadata overrides must be a JSON object.")
        asset = self.library_service.update_metadata_overrides(
            asset_id, AssetMetadataOverrides.model_validate(overrides_data)
        )
        self._push_assets()
        self._push_collections()
        return asset.metadata_overrides.model_dump_json()

    def batch_set_flag(self, asset_ids_json: str, flag: str) -> None:
        """Batch set flag for multiple assets."""
        try:
            ids = json.loads(asset_ids_json)
            self.library_service.batch_set_flag(ids, flag)
            self._push_assets()
            self._push_collections()
            flag_label = "Pick" if flag == "flagged" else ("Reject" if flag == "rejected" else "Unflagged")
            self.notification.emit("Flag Updated", f"Marked {len(ids)} photo(s) as {flag_label}", "info")
        except Exception as e:
            logger.error(f"Batch flag error: {e}")

    def delete_assets(self, asset_ids_json: str) -> None:
        """Move assets to recoverable catalog trash."""
        try:
            ids = json.loads(asset_ids_json)
            if not isinstance(ids, list) or not all(
                isinstance(aid, str) for aid in ids
            ):
                raise ValueError("Asset IDs must be a JSON array of strings.")
            project = self.app_state.current_project
            if not project:
                raise ValueError("There is no active project.")
            self.library_service.move_assets_to_trash(ids, project.id)

            self._push_assets()
            self._push_collections()
            self._push_trash_count()

            remaining = self.library_service.asset_repo.list_page(project.id, 0, 1)
            if remaining:
                self.select_asset(remaining[0].id)
            else:
                self.app_state.set_active_asset(None)
                self.app_state.set_current_edit_state(None)
                self.asset_selected.emit("null", "null")

            self.notification.emit(
                "Moved to Recently Deleted",
                f"Moved {len(ids)} photo(s) to Recently Deleted",
                "info",
            )
        except Exception as e:
            logger.error(f"Delete assets error: {e}")
            self.notification.emit("Could Not Move Photos", str(e), "error")

    def restore_assets(self, asset_ids_json: str) -> None:
        """Restore trashed assets in the active project."""
        try:
            ids = json.loads(asset_ids_json)
            if not isinstance(ids, list) or not all(
                isinstance(aid, str) for aid in ids
            ):
                raise ValueError("Asset IDs must be a JSON array of strings.")
            project = self.app_state.current_project
            if not project:
                raise ValueError("There is no active project.")
            self.library_service.restore_assets(ids, project.id)
            self._push_assets()
            self._push_collections()
            self._push_trash_count()
            self.notification.emit(
                "Photos Restored", f"Restored {len(ids)} photo(s)", "success"
            )
        except Exception as e:
            logger.error(f"Restore assets error: {e}")
            self.notification.emit("Could Not Restore Photos", str(e), "error")

    def permanently_delete_assets(self, asset_ids_json: str) -> None:
        """Permanently remove trashed catalog records, not source files."""
        try:
            ids = json.loads(asset_ids_json)
            if not isinstance(ids, list) or not all(
                isinstance(aid, str) for aid in ids
            ):
                raise ValueError("Asset IDs must be a JSON array of strings.")
            project = self.app_state.current_project
            if not project:
                raise ValueError("There is no active project.")
            self.library_service.permanently_delete_assets(ids, project.id)
            self._push_assets()
            self._push_collections()
            self._push_trash_count()
            self.notification.emit(
                "Photos Permanently Deleted",
                f"Permanently deleted {len(ids)} catalog record(s)",
                "info",
            )
        except Exception as e:
            logger.error(f"Permanently delete assets error: {e}")
            self.notification.emit("Could Not Permanently Delete Photos", str(e), "error")

    # ── Collection API ─────────────────────────────────────────────────────

    def create_collection(
        self, name: str, parent_id: Optional[str] = None
    ) -> None:
        project = self.app_state.current_project
        if not isinstance(name, str):
            raise ValueError("Collection name must be a string.")
        if parent_id is not None and not isinstance(parent_id, str):
            raise ValueError("Parent collection ID must be a string or null.")
        if project and name.strip():
            self.library_service.create_collection(
                project.id, name.strip(), parent_id
            )
            self._push_collections()
            self.notification.emit("Collection Created", f"Created collection '{name}'", "success")

    def create_smart_collection(
        self,
        name: str,
        rules_json: str,
        parent_id: Optional[str] = None,
    ) -> None:
        project = self.app_state.current_project
        if not project:
            return
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Collection name must not be empty.")
        if parent_id is not None and not isinstance(parent_id, str):
            raise ValueError("Parent collection ID must be a string or null.")
        rules = self._validated_smart_collection_rules(rules_json)
        self.library_service.create_smart_collection(
            project.id, name.strip(), rules, parent_id
        )
        self._push_collections()
        self.notification.emit(
            "Smart Collection Created",
            f"Created smart collection '{name.strip()}'",
            "success",
        )

    def update_smart_collection(
        self, collection_id: str, name: str, rules_json: str
    ) -> None:
        project = self.app_state.current_project
        if not project:
            return
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Collection name must not be empty.")
        rules = self._validated_smart_collection_rules(rules_json)
        self.library_service.update_smart_collection(
            collection_id, name.strip(), rules, project.id
        )
        self._push_collections()
        self.notification.emit(
            "Smart Collection Updated",
            f"Updated smart collection '{name.strip()}'",
            "success",
        )

    @staticmethod
    def _validated_smart_collection_rules(rules_json: str) -> SmartCollectionRules:
        rules_value = json.loads(rules_json)
        if not isinstance(rules_value, dict):
            raise ValueError("Smart collection rules must be a JSON object.")
        return SmartCollectionRules.model_validate(rules_value)

    def delete_collection(self, collection_id: str) -> None:
        self.library_service.delete_collection(collection_id)
        self._push_collections()
        self.notification.emit("Collection Deleted", "Collection removed", "info")

    def rename_collection(self, collection_id: str, new_name: str) -> None:
        if new_name.strip():
            self.library_service.rename_collection(collection_id, new_name.strip())
            self._push_collections()

    def add_to_collection(self, collection_id: str, asset_ids_json: str) -> None:
        try:
            ids = json.loads(asset_ids_json)
            self.library_service.batch_add_to_collection(collection_id, ids)
            self._push_collections()
            self.notification.emit("Collection Updated", f"Added {len(ids)} photo(s) to collection", "success")
        except Exception as e:
            logger.error(f"Add to collection error: {e}")

    def remove_from_collection(self, collection_id: str, asset_ids_json: str) -> None:
        try:
            ids = json.loads(asset_ids_json)
            self.library_service.batch_remove_from_collection(collection_id, ids)
            self._push_collections()
            self.notification.emit("Collection Updated", f"Removed {len(ids)} photo(s) from collection", "info")
        except Exception as e:
            logger.error(f"Remove from collection error: {e}")

    # ── Preset API ─────────────────────────────────────────────────────────

    def apply_preset(self, preset_id_or_name: str) -> None:
        """Apply built-in or user preset recipe."""
        if not self.preset_service or not self.app_state.current_edit_state:
            return
        presets = self.preset_service.get_presets()
        matching = [p for p in presets if p.id == preset_id_or_name or p.name == preset_id_or_name]
        if matching:
            p = matching[0]
            new_state = self.preset_service.apply_preset(p, self.app_state.current_edit_state)
            self.app_state.set_current_edit_state(new_state)
            self._do_render_preview()
            self._do_commit_edit_state()
            asset = self.app_state.active_asset
            if asset:
                self.asset_selected.emit(json.dumps({"id": asset.id, "file_name": asset.file_name}), json.dumps(new_state.model_dump()))
            self.notification.emit("Preset Applied", f"Applied preset '{p.name}'", "info")

    def save_preset(self, name: str, category: str) -> None:
        """Save current edit parameters as new preset."""
        if not self.preset_service or not self.app_state.current_edit_state:
            return
        self.preset_service.create_preset_from_edit_state(name, category, self.app_state.current_edit_state)
        self._push_presets()
        self.notification.emit("Preset Saved", f"Saved preset '{name}'", "success")

    def delete_preset(self, preset_id: str) -> None:
        """Delete user preset."""
        if not self.preset_service:
            return
        self.preset_service.delete_preset(preset_id)
        self._push_presets()
        self.notification.emit("Preset Deleted", "Preset removed", "info")

    # ── History Jump API ───────────────────────────────────────────────────

    def jump_history(self, index: int) -> None:
        """Jump to specific step in command history timeline."""
        curr = self.app_state.current_edit_state
        if self.command_dispatcher and curr:
            previous_history = self.command_dispatcher.serialize_history()
            new_state = self.command_dispatcher.jump_to_step(index, curr)
            if new_state:
                self.app_state.set_current_edit_state(new_state)
                if not self._save_state_with_notification(new_state):
                    self.command_dispatcher.restore_history(*previous_history)
                    self.app_state.set_current_edit_state(curr)
                    self._emit_history()
                    return
                asset = self.app_state.active_asset
                if asset:
                    self._persist_asset_history(asset.id)
                self._emit_history()
                self._do_render_preview()
                asset = self.app_state.active_asset
                if asset:
                    self.asset_selected.emit(json.dumps({"id": asset.id, "file_name": asset.file_name}), json.dumps(new_state.model_dump()))

    def get_ai_settings(self) -> str:
        """Return provider/model configuration without revealing stored credentials."""
        provider = self.config.ai.provider
        import keyring

        return json.dumps({
            "provider": provider,
            "model": self.config.ai.model or "",
            "has_api_key": bool(keyring.get_password("KuroLight", f"kuro-ai:{provider}")),
            "saved_keys": {
                name: bool(keyring.get_password("KuroLight", f"kuro-ai:{name}"))
                for name in ("gemini", "openai", "anthropic")
            },
            "privacy_disclosure_accepted": bool(getattr(self.config.ai, "privacy_disclosure_accepted", False)),
            "privacy_disclosure_version": getattr(self.config.ai, "privacy_disclosure_version", "2026-11"),
            "send_image_context": bool(getattr(self.config.ai, "send_image_context", True)),
        })

    def get_ai_models(self, provider: str, api_key: str = "") -> str:
        """Fetch vision-capable models available to the selected provider key."""
        import keyring

        selected_key = api_key.strip() or keyring.get_password(
            "KuroLight", f"kuro-ai:{provider}"
        ) or ""
        return json.dumps(self.kuro_ai_service.list_models(provider, selected_key))

    def test_ai_connection(self, provider: str, api_key: str = "") -> str:
        """Validate credentials and connectivity by listing available models."""
        models = json.loads(self.get_ai_models(provider, api_key))
        return json.dumps({"ok": True, "model_count": len(models), "models": models})

    def save_ai_settings(self, settings_json: str) -> str:
        """Save AI provider settings and store API credentials in the OS keychain."""
        data = json.loads(settings_json)
        provider = str(data.get("provider", "")).lower()
        if provider not in {"openai", "gemini", "anthropic"}:
            raise ValueError(f"Unsupported Kuro AI provider: {provider}")
        model = str(data.get("model", "")).strip()
        if not model:
            raise ValueError("A model name is required")
        api_key = str(data.get("api_key", "")).strip()
        privacy_accepted = bool(data.get("privacy_disclosure_accepted", getattr(self.config.ai, "privacy_disclosure_accepted", False)))
        send_image_context = bool(data.get("send_image_context", getattr(self.config.ai, "send_image_context", True)))
        import keyring

        active_key = "" if data.get("remove_api_key") else (
            api_key or keyring.get_password("KuroLight", f"kuro-ai:{provider}") or ""
        )
        if active_key:
            models = self.kuro_ai_service.list_models(provider, active_key)
            if model not in {item["id"] for item in models}:
                raise ValueError("Choose a model returned by Refresh Models for this provider.")

        if api_key:
            keyring.set_password("KuroLight", f"kuro-ai:{provider}", api_key)
        elif data.get("remove_api_key") and keyring.get_password("KuroLight", f"kuro-ai:{provider}"):
            keyring.delete_password("KuroLight", f"kuro-ai:{provider}")

        with self._lock:
            self.config.ai.provider = provider
            self.config.ai.model = model
            self.config.ai.privacy_disclosure_accepted = privacy_accepted
            self.config.ai.send_image_context = send_image_context
            self.config.ai.privacy_disclosure_version = str(
                data.get(
                    "privacy_disclosure_version",
                    getattr(self.config.ai, "privacy_disclosure_version", "2026-11"),
                )
            )
            self.config.save()
            return self.get_ai_settings()

    def accept_ai_privacy_disclosure(self, accepted: bool = True, version: str = "2026-11") -> str:
        """Persist explicit user approval for AI image-context upload and disclosure review."""
        with self._lock:
            self.config.ai.privacy_disclosure_accepted = bool(accepted)
            self.config.ai.privacy_disclosure_version = str(version)
            self.config.save()
            return self.get_ai_settings()

    def get_app_info(self) -> str:
        """Return application metadata, environment runtime info, filesystem paths, and community links."""
        return json.dumps({
            "name": "KuroLight",
            "tagline": "Intelligent Visual Creation & Photo Editing Engine",
            "version": "1.0.0",
            "build": "2026.11",
            "release_channel": "Desktop Production",
            "python_version": sys.version.split()[0],
            "platform": platform.platform(),
            "architecture": platform.machine(),
            "config_path": str(AppConfig.get_config_file_path()),
            "data_dir": str(AppConfig.get_data_dir()),
            "cache_dir": str(AppConfig.get_cache_dir()),
            "working_color_space": getattr(self.config.editing, "default_color_space", "sRGB"),
            "max_cache_mb": getattr(self.config.performance, "max_cache_mb", 4096),
            "preview_max_edge": getattr(self.config.performance, "preview_max_edge", 2048),
            "gpu_enabled": getattr(self.config.performance, "enable_gpu", False),
            "github_url": "https://github.com/kuroLabs-ai/KuroLight",
            "discord_url": "https://discord.gg/2pj9TuqWr",
            "docs_url": "https://github.com/kuroLabs-ai/KuroLight#documentation",
        })

    def open_external_url(self, url: str) -> bool:
        """Open a web URL in the user's default external browser."""
        try:
            clean = str(url).strip()
            if clean.startswith(("https://", "http://")):
                return webbrowser.open(clean)
            return False
        except Exception as exc:
            logger.warning("Failed to open external url %s: %s", url, exc)
            return False

    def get_preferences(self) -> str:
        """Return all user preferences across performance, storage, import, color, local AI, and appearance."""
        return json.dumps({
            "performance": {
                "enable_gpu": getattr(self.config.performance, "enable_gpu", True),
                "gpu_engine": getattr(self.config.performance, "gpu_engine", "auto"),
                "selected_gpu_device": getattr(self.config.performance, "selected_gpu_device", "Auto-detect High Performance"),
                "preview_max_edge": getattr(self.config.performance, "preview_max_edge", 2048),
                "preview_quality": getattr(self.config.performance, "preview_quality", "balanced"),
                "max_cache_mb": getattr(self.config.performance, "max_cache_mb", 4096),
                "vram_cache_mb": getattr(self.config.performance, "vram_cache_mb", 2048),
            },
            "storage": {
                "custom_cache_dir": getattr(getattr(self.config, "storage", None), "custom_cache_dir", "") or "",
                "backup_schedule": getattr(getattr(self.config, "storage", None), "backup_schedule", "on_exit"),
                "backup_retention_count": getattr(getattr(self.config, "storage", None), "backup_retention_count", 5),
            },
            "import_settings": {
                "default_creator": getattr(getattr(self.config, "import_settings", None), "default_creator", ""),
                "default_copyright": getattr(getattr(self.config, "import_settings", None), "default_copyright", "© 2026 KuroLabs. All rights reserved."),
                "default_usage_terms": getattr(getattr(self.config, "import_settings", None), "default_usage_terms", "All rights reserved"),
                "duplicate_detection": getattr(getattr(self.config, "import_settings", None), "duplicate_detection", "path"),
                "auto_apply_preset": getattr(getattr(self.config, "import_settings", None), "auto_apply_preset", "None"),
                "raw_preview_priority": getattr(getattr(self.config, "import_settings", None), "raw_preview_priority", "embedded_jpeg"),
            },
            "color_management": {
                "working_space": getattr(getattr(self.config, "color_management", None), "working_space", "sRGB"),
                "monitor_icc_profile": getattr(getattr(self.config, "color_management", None), "monitor_icc_profile", "System Default"),
                "soft_proofing_enabled": getattr(getattr(self.config, "color_management", None), "soft_proofing_enabled", False),
                "gamut_warning_color": getattr(getattr(self.config, "color_management", None), "gamut_warning_color", "#FF00FF"),
            },
            "local_ai": {
                "strict_offline": getattr(getattr(self.config, "local_ai", None), "strict_offline", False),
            },
            "appearance": {
                "theme": getattr(self.config.appearance, "theme", "dark"),
                "accent_color": getattr(self.config.appearance, "accent_color", "#0088FF"),
                "ui_scale": getattr(self.config.appearance, "ui_scale", 1.0),
                "startup_workspace": getattr(self.config.appearance, "startup_workspace", "remember"),
                "confirm_disk_deletion": getattr(self.config.appearance, "confirm_disk_deletion", True),
                "warn_discard_crop_edits": getattr(self.config.appearance, "warn_discard_crop_edits", True),
            },
            "external_editor": {
                "editor_path": getattr(getattr(self.config, "external_editor", None), "editor_path", ""),
                "editor_name": getattr(getattr(self.config, "external_editor", None), "editor_name", "Photoshop"),
                "roundtrip_format": getattr(getattr(self.config, "external_editor", None), "roundtrip_format", "TIFF (16-bit)"),
            },
        })

    def save_preferences(self, prefs_json: str) -> str:
        """Update and save preferences across all categories."""
        data = json.loads(prefs_json)
        with self._lock:
            if "performance" in data and hasattr(self.config, "performance"):
                for k, v in data["performance"].items():
                    if hasattr(self.config.performance, k):
                        setattr(self.config.performance, k, v)
            if "storage" in data and hasattr(self.config, "storage"):
                for k, v in data["storage"].items():
                    if hasattr(self.config.storage, k):
                        setattr(self.config.storage, k, v)
            if "import_settings" in data and hasattr(self.config, "import_settings"):
                for k, v in data["import_settings"].items():
                    if hasattr(self.config.import_settings, k):
                        setattr(self.config.import_settings, k, v)
            if "color_management" in data and hasattr(self.config, "color_management"):
                for k, v in data["color_management"].items():
                    if hasattr(self.config.color_management, k):
                        setattr(self.config.color_management, k, v)
            if "local_ai" in data and hasattr(self.config, "local_ai"):
                for k, v in data["local_ai"].items():
                    if hasattr(self.config.local_ai, k):
                        setattr(self.config.local_ai, k, v)
            if "appearance" in data and hasattr(self.config, "appearance"):
                for k, v in data["appearance"].items():
                    if hasattr(self.config.appearance, k):
                        setattr(self.config.appearance, k, v)
            if "external_editor" in data and hasattr(self.config, "external_editor"):
                for k, v in data["external_editor"].items():
                    if hasattr(self.config.external_editor, k):
                        setattr(self.config.external_editor, k, v)
            self.config.save()
            return self.get_preferences()

    def get_storage_stats(self) -> str:
        """Calculate and return live storage, catalog, and cache usage metrics."""
        cache_dir = AppConfig.get_cache_dir()
        cache_bytes = 0
        cache_files = 0
        if cache_dir.exists():
            for root, _, files in os.walk(cache_dir):
                for f in files:
                    try:
                        p = Path(root) / f
                        cache_bytes += p.stat().st_size
                        cache_files += 1
                    except OSError:
                        pass

        data_dir = AppConfig.get_data_dir()
        db_path = data_dir / "catalog.db"
        db_bytes = db_path.stat().st_size if db_path.exists() else 0

        asset_count = 0
        if hasattr(self, "library_service") and hasattr(self.library_service, "get_asset_count"):
            try:
                asset_count = self.library_service.get_asset_count()
            except Exception:
                pass

        return json.dumps({
            "asset_count": asset_count,
            "db_size_bytes": db_bytes,
            "cache_size_bytes": cache_bytes,
            "cache_file_count": cache_files,
            "catalog_path": str(db_path),
            "cache_path": str(cache_dir),
        })

    def clear_cache(self) -> str:
        """Purge thumbnail and proxy preview cache files to reclaim disk space."""
        cache_dir = AppConfig.get_cache_dir()
        freed = 0
        if cache_dir.exists():
            for root, dirs, files in os.walk(cache_dir, topdown=False):
                for f in files:
                    try:
                        p = Path(root) / f
                        freed += p.stat().st_size
                        p.unlink(missing_ok=True)
                    except OSError:
                        pass
        return json.dumps({"ok": True, "freed_bytes": freed})

    def optimize_database(self) -> str:
        """Run SQLite VACUUM and PRAGMA optimize on the catalog database."""
        db_path = AppConfig.get_data_dir() / "catalog.db"
        if db_path.exists():
            import sqlite3
            try:
                con = sqlite3.connect(str(db_path))
                con.execute("PRAGMA optimize;")
                con.execute("VACUUM;")
                con.close()
                return json.dumps({"ok": True, "message": "Catalog database optimized and vacuumed."})
            except Exception as exc:
                return json.dumps({"ok": False, "error": str(exc)})
        return json.dumps({"ok": True, "message": "Database optimized."})

    def backup_catalog_now(self) -> str:
        """Create an on-demand verified SQLite backup of the catalog."""
        import datetime
        import sqlite3
        backups_dir = AppConfig.get_data_dir() / "backups"
        backups_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        dest = backups_dir / f"catalog_backup_{ts}.db"
        source = AppConfig.get_data_dir() / "catalog.db"
        if not source.exists():
            return json.dumps({"ok": False, "error": "No active catalog file to backup."})

        try:
            src_conn = sqlite3.connect(str(source))
            dst_conn = sqlite3.connect(str(dest))
            src_conn.backup(dst_conn)
            dst_conn.close()
            src_conn.close()
            return json.dumps({"ok": True, "path": str(dest)})
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})

    def get_local_ai_status(self) -> str:
        """Return download and runtime status of local offline AI models."""
        from kurolight.processing.enhancement import ImageEnhancementEngine
        has_esrgan = ImageEnhancementEngine.has_model()
        model_p = ImageEnhancementEngine.model_path()
        return json.dumps({
            "models": [
                {
                    "id": "realesrgan_x4",
                    "name": "Real-ESRGAN x4 Plus",
                    "category": "Super-Resolution & Denoise",
                    "size_mb": 67,
                    "is_installed": has_esrgan,
                    "path": str(model_p) if has_esrgan else "",
                    "description": "High-fidelity 4x image super-resolution with DirectML/CUDA GPU acceleration and CPU fallback.",
                },
                {
                    "id": "fast_denoise_ai",
                    "name": "Fast Denoise AI",
                    "category": "Noise Reduction",
                    "size_mb": 34,
                    "is_installed": False,
                    "description": "Deep learning color and luminance noise suppression for high ISO RAW files.",
                },
                {
                    "id": "segment_anything",
                    "name": "MobileSAM Subject Segmenter",
                    "category": "Segmentation & Masks",
                    "size_mb": 40,
                    "is_installed": False,
                    "description": "Real-time 1-click subject and foreground segmentation mask generator.",
                },
            ]
        })

    def delete_local_ai_model(self, model_id: str) -> str:
        """Delete local model weights from disk to reclaim storage."""
        from kurolight.processing.enhancement import ImageEnhancementEngine
        if model_id == "realesrgan_x4":
            p = ImageEnhancementEngine.model_path()
            p.unlink(missing_ok=True)
            return json.dumps({"ok": True})
        return json.dumps({"ok": False, "error": "Unknown model ID"})

    @staticmethod
    def _merge_ai_edit_proposal(current: dict, proposed: dict, model_type: Any) -> dict:
        """Merge only fields declared by the edit-state pydantic models."""
        from pydantic import BaseModel

        if not isinstance(proposed, dict):
            raise TypeError("Kuro AI edit proposal must be a JSON object.")
        if not issubclass(model_type, BaseModel):
            raise TypeError("Expected an edit-state model for proposal validation.")
        fields = model_type.model_fields
        unknown = set(proposed) - set(fields)
        if unknown:
            raise ValueError(
                f"Kuro AI proposed unsupported {model_type.__name__} fields: "
                f"{', '.join(sorted(unknown))}"
            )
        merged = dict(current)
        for key, value in proposed.items():
            annotation = fields[key].annotation
            nested_type = (
                annotation
                if isinstance(annotation, type) and issubclass(annotation, BaseModel)
                else None
            )
            if nested_type:
                merged[key] = PyBridge._merge_ai_edit_proposal(
                    current.get(key, {}), value, nested_type
                )
            else:
                merged[key] = value
        return merged

    def propose_ai_edits(self, prompt: str, history_json: str = "[]") -> str:
        """Analyze the current image and return a non-destructive edit proposal."""
        prompt = prompt.strip()
        if not prompt:
            raise ValueError("Enter a question or editing request for Kuro AI.")
        history = json.loads(history_json)
        if not isinstance(history, list):
            raise TypeError("Kuro AI conversation history must be a list.")
        history = [
            {"role": item["role"], "content": item["content"][:2000]}
            for item in history[-12:]
            if isinstance(item, dict)
            and item.get("role") in {"user", "assistant"}
            and isinstance(item.get("content"), str)
        ]

        with self._lock:
            asset = self.app_state.active_asset
            active_state = self.app_state.current_edit_state
            if not asset or not active_state or not asset.source_path.exists():
                raise ValueError("Select an image before asking Kuro AI.")
            current_state = active_state.model_copy(deep=True)
            provider = self.config.ai.provider
            model = self.config.ai.model or ""
            source = self.editing_service.get_or_load_source_buffer(asset.id, asset.source_path)
            current_render = self.editing_service.processor.process(source, current_state)
            current_preview = self.editing_service.processor.create_preview(
                current_render, max_edge=1280
            )
            current_image_url = self._buffer_to_data_url(current_preview)
            state_data = current_state.model_dump(mode="json")
            metadata = {
                "file_name": asset.file_name,
                "width": asset.width,
                "height": asset.height,
                "camera_model": (asset.metadata or {}).get("camera_model"),
                "lens_model": (asset.metadata or {}).get("lens_model"),
                "iso": (asset.metadata or {}).get("iso"),
                "date_captured": asset.date_captured,
            }

        if not getattr(self.config.ai, "privacy_disclosure_accepted", False):
            raise ValueError(
                "Kuro AI privacy disclosure must be accepted before sending image context to a provider."
            )
        if not getattr(self.config.ai, "send_image_context", True):
            raise ValueError("Kuro AI image-context upload is currently disabled in Settings.")

        import keyring

        api_key = keyring.get_password("KuroLight", f"kuro-ai:{provider}") or ""
        allowed_fields = {
            "exposure", "white_balance", "detail", "geometry", "hsl",
            "color_grading", "tone_curves",
        }
        current_controls = {key: state_data[key] for key in allowed_fields}
        answer = self.kuro_ai_service.analyze(
            provider,
            model,
            api_key,
            prompt,
            current_image_url,
            current_controls,
            metadata,
            history,
        )
        edits = answer["edits"]
        if set(edits) - allowed_fields:
            raise ValueError("Kuro AI proposed a setting outside the available photo controls.")

        candidate_data = self._merge_ai_edit_proposal(state_data, edits, EditState)
        candidate_state = EditState.model_validate(candidate_data)
        with self._lock:
            candidate_preview = self.editing_service.processor.process(source, candidate_state)
            candidate_preview = self.editing_service.processor.create_preview(
                candidate_preview, max_edge=1280
            )
        return json.dumps({
            "message": answer["message"],
            "edits": edits,
            "current_preview": current_image_url,
            "proposed_preview": self._buffer_to_data_url(candidate_preview) if edits else "",
            "candidate_state": candidate_state.model_dump(mode="json") if edits else None,
            "base_state_fingerprint": self._edit_state_fingerprint(state_data),
        })

    @staticmethod
    def _edit_state_fingerprint(state_data: dict[str, Any]) -> str:
        serialized = json.dumps(state_data, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def apply_ai_proposal(
        self,
        candidate_state_json: str,
        expected_asset_id: str,
        expected_base_fingerprint: str,
    ) -> None:
        """Commit a reviewed Kuro AI edit proposal to the active image."""
        candidate = EditState.model_validate(json.loads(candidate_state_json))
        asset = self.app_state.active_asset
        current = self.app_state.current_edit_state
        if not asset or not current or asset.id != expected_asset_id:
            raise ValueError("The active image changed. Review a new Kuro AI proposal before applying.")
        if candidate.asset_id != asset.id:
            raise ValueError("Kuro AI proposal belongs to a different image.")
        if self._edit_state_fingerprint(current.model_dump(mode="json")) != expected_base_fingerprint:
            raise ValueError("Photo settings changed after this preview. Ask Kuro for a fresh proposal.")

        self._render_timer.stop()
        self._save_timer.stop()
        self._edit_start_state = current.model_copy(deep=True)
        self.app_state.set_current_edit_state(candidate)
        self._pending_edit_state = candidate
        self._do_render_preview()
        self._do_commit_edit_state()
        self.asset_selected.emit(
            json.dumps(self._asset_to_dict(asset)),
            json.dumps(candidate.model_dump()),
        )
        self.notification.emit("Kuro AI Applied", "Approved edits were applied to the photo.", "success")

    @staticmethod
    def _asset_to_dict(asset: ImageAsset) -> dict[str, Any]:
        metadata = asset.metadata or {}
        return {
            "id": asset.id,
            "file_name": asset.file_name,
            "source_path": str(asset.source_path),
            "width": asset.width,
            "height": asset.height,
            "file_size": asset.file_size or metadata.get("file_size_bytes", 0),
            "file_size_bytes": asset.file_size or metadata.get("file_size_bytes", 0),
            "camera_model": metadata.get("camera_model") or "",
            "camera_make": metadata.get("camera_make") or "",
            "lens_model": metadata.get("lens_model") or "",
            "iso": metadata.get("iso"),
            "shutter_speed": metadata.get("shutter_speed_str") or "",
            "f_number": metadata.get("aperture_f_number"),
            "focal_length": metadata.get("focal_length_mm"),
            "date_taken": str(asset.date_captured) if asset.date_captured else None,
            "format": metadata.get("format") or asset.file_type or "",
            "rating": asset.rating or 0,
            "flag": asset.flag or "unflagged",
            "metadata": metadata,
            "metadata_overrides": asset.metadata_overrides.model_dump(mode="json"),
        }

    # ── Edit State & Rendering ─────────────────────────────────────────────

    def update_edit_state(self, state_json: str) -> None:
        """Called from JS on every slider drag (throttled live preview)."""
        try:
            data = json.loads(state_json)
            curr = self.app_state.current_edit_state
            if not curr:
                return

            start_state = (
                curr.model_copy(deep=True)
                if self._edit_start_state is None
                else None
            )
            curr = self._apply_dict_to_edit_state(curr, data)
            if self._edit_start_state is None:
                self._edit_start_state = start_state

            self._pending_edit_state = curr
            self.app_state.set_current_edit_state(curr)

            if not self._render_timer.isActive():
                self._render_timer.start(20)

            # Schedule disk save and undo push
            self._save_timer.start(300)

        except Exception as e:
            logger.exception("Error updating edit state")
            self.notification.emit("Edit Not Saved", str(e), "error")

    def save_edit_state(self, state_json: str) -> None:
        """Called when user releases slider or explicitly saves."""
        try:
            self.update_edit_state(state_json)
            self._save_timer.stop()
            self._do_commit_edit_state()
        except Exception as e:
            logger.exception("Error saving edit state")
            self.notification.emit("Edit Not Saved", str(e), "error")

    def import_files(self) -> None:
        """Open native file dialog and import photos."""
        files = self._file_dialog("files")
        if not files:
            return

        project = self.app_state.current_project
        pid = project.id if project else None
        self._run_file_import(
            lambda: self.library_service.import_files(
                (Path(file_path) for file_path in files),
                project_id=pid,
                cancel_event=self._import_cancel_event,
            ),
            "Import Complete",
        )

    def import_dropped_file(self, file_name: str, data_url: str) -> str:
        """Persist a dropped image and import it into the current catalog."""
        destination: Optional[Path] = None
        imported = False
        try:
            header, encoded = data_url.split(",", 1)
            if not header.startswith("data:") or ";base64" not in header:
                raise ValueError("Dropped file data must be base64 encoded")
            if len(encoded) > 700_000_000:
                raise ValueError("Dropped image exceeds the 500 MB import limit")
            payload = base64.b64decode(encoded, validate=True)
            safe_name = Path(file_name).name
            if not safe_name or Path(safe_name).suffix.lower() not in SUPPORTED_EXTENSIONS:
                raise ValueError(f"Unsupported image type: {Path(file_name).suffix}")

            import_dir = Path.home() / "Pictures" / "KuroLight Imports"
            import_dir.mkdir(parents=True, exist_ok=True)
            destination = import_dir / safe_name
            if destination.exists():
                destination = import_dir / f"{destination.stem}_{uuid.uuid4().hex[:8]}{destination.suffix}"
            destination.write_bytes(payload)

            project = self.app_state.current_project
            asset = self.library_service.import_file(
                destination, project_id=project.id if project else None
            )
            if not asset:
                raise ValueError("The dropped file could not be imported as an image")
            imported = True
            self._push_assets()
            self._push_collections()
            self.select_asset(asset.id)
            return json.dumps({"ok": True, "asset_id": asset.id})
        except (ValueError, OSError, binascii.Error) as exc:
            logger.warning("Dropped image import failed: %s", exc)
            return json.dumps({"ok": False, "error": str(exc)})
        finally:
            if destination and not imported and destination.exists():
                destination.unlink(missing_ok=True)

    def import_folder(self) -> None:
        """Open native directory dialog and recursively import all photos."""
        folder = self._file_dialog("import_folder")
        if not folder:
            return

        project = self.app_state.current_project
        pid = project.id if project else None
        self._run_file_import(
            lambda: self.library_service.import_directory(
                Path(folder),
                project_id=pid,
                cancel_event=self._import_cancel_event,
            ),
            "Folder Import Complete",
        )

    def _set_library_loading(
        self, loading: bool, message: str = "", cancellable: bool = False
    ) -> None:
        self.library_loading.emit(json.dumps({
            "loading": loading,
            "message": message,
            "cancellable": loading and cancellable,
        }))

    def cancel_import(self) -> None:
        """Request cancellation after the current file finishes importing."""
        self._import_cancel_event.set()

    def _run_file_import(self, operation: Callable[[], ImportBatchResult], title: str) -> None:
        self._import_cancel_event.clear()
        self._set_library_loading(True, "Importing photos…", cancellable=True)
        try:
            result = operation()
            if result.imported:
                self._push_assets()
                self._push_collections()
                self.select_asset(result.imported[0].id)
            self._report_import_result(title, result)
        except Exception as exc:
            logger.exception("Photo import failed")
            self.notification.emit("Import Failed", str(exc), "error")
        finally:
            self._set_library_loading(False)

    def _report_import_result(self, title: str, result: ImportBatchResult) -> None:
        imported_count = len(result.imported)
        duplicate_count = len(result.duplicates)
        failure_count = len(result.failures)
        summary = (
            f"Imported {imported_count}; skipped {duplicate_count} duplicate(s); "
            f"{failure_count} failed."
        )
        if result.cancelled:
            summary += " Import cancelled."
        details = [
            f"IMPORTED  {asset.file_name}"
            for asset in result.imported
        ]
        details.extend(
            f"SKIPPED   {asset.file_name} (already in library)"
            for asset in result.duplicates
        )
        details.extend(
            f"FAILED    {failure.path}: {failure.message}"
            for failure in result.failures
        )
        if details:
            summary += "\n\n" + "\n".join(details)

        if failure_count and not imported_count:
            level = "error"
        elif failure_count or result.cancelled:
            level = "warning"
        elif imported_count:
            level = "success"
        else:
            level = "info"
        self.notification.emit(title, summary, level)

    def auto_tone(self) -> None:
        """Analyze the source image and apply measured baseline tone corrections."""
        curr = self.app_state.current_edit_state
        asset = self.app_state.active_asset
        if not curr or not asset:
            return

        source = self.editing_service.get_or_load_source_buffer(asset.id, asset.source_path)
        exposure, white_balance = AutoToneAnalyzer.analyze(source)

        if self._edit_start_state is None:
            self._edit_start_state = curr.model_copy(deep=True)

        curr.exposure = exposure
        curr.white_balance.temperature = white_balance.temperature
        curr.white_balance.tint = white_balance.tint

        self.app_state.set_current_edit_state(curr)
        self._do_render_preview()
        self._save_timer.start(300)

        # Notify JS of new state
        asset_dict = {"id": asset.id, "file_name": asset.file_name}
        self.asset_selected.emit(json.dumps(asset_dict), json.dumps(curr.model_dump()))

    def undo(self) -> None:
        curr = self.app_state.current_edit_state
        if self.command_dispatcher and curr:
            previous_history = self.command_dispatcher.serialize_history()
            new_state = self.command_dispatcher.undo(curr)
            if new_state:
                self.app_state.set_current_edit_state(new_state)
                if not self._save_state_with_notification(new_state):
                    self.command_dispatcher.restore_history(*previous_history)
                    self.app_state.set_current_edit_state(curr)
                    self._emit_history()
                    return
                asset = self.app_state.active_asset
                if asset:
                    self._persist_asset_history(asset.id)
                self._emit_history()
                self._do_render_preview()
                asset = self.app_state.active_asset
                if asset:
                    self.asset_selected.emit(json.dumps({"id": asset.id, "file_name": asset.file_name}), json.dumps(new_state.model_dump()))

    def redo(self) -> None:
        curr = self.app_state.current_edit_state
        if self.command_dispatcher and curr:
            previous_history = self.command_dispatcher.serialize_history()
            new_state = self.command_dispatcher.redo(curr)
            if new_state:
                self.app_state.set_current_edit_state(new_state)
                if not self._save_state_with_notification(new_state):
                    self.command_dispatcher.restore_history(*previous_history)
                    self.app_state.set_current_edit_state(curr)
                    self._emit_history()
                    return
                asset = self.app_state.active_asset
                if asset:
                    self._persist_asset_history(asset.id)
                self._emit_history()
                self._do_render_preview()
                asset = self.app_state.active_asset
                if asset:
                    self.asset_selected.emit(json.dumps({"id": asset.id, "file_name": asset.file_name}), json.dumps(new_state.model_dump()))

    def toggle_filmstrip(self) -> None:
        self._filmstrip_visible = not self._filmstrip_visible
        self.filmstrip_toggled.emit(self._filmstrip_visible)

    def set_workspace(self, workspace_id: str) -> None:
        self.app_state.set_active_workspace(workspace_id)
        self._active_workspace = workspace_id
        self.workspace_changed.emit(workspace_id)
        if workspace_id == "color_studio":
            self._render_timer.start()

    def save_snapshot(self, name: str) -> None:
        curr = self.app_state.current_edit_state
        if curr:
            curr.create_snapshot(name)
            if not self._save_state_with_notification(curr):
                return
            asset = self.app_state.active_asset
            if asset:
                self.asset_selected.emit(
                    json.dumps({"id": asset.id, "file_name": asset.file_name}),
                    json.dumps(curr.model_dump()),
                )
            self.notification.emit("Snapshot Created", f"Saved snapshot '{name}'", "info")

    def restore_snapshot(self, name: str) -> None:
        curr = self.app_state.current_edit_state
        if curr and name in curr.snapshots:
            self._edit_start_state = curr.model_copy(deep=True)
            restored = curr.restore_snapshot(name)
            self.app_state.set_current_edit_state(restored)
            self._do_render_preview()
            self._do_commit_edit_state()
            asset = self.app_state.active_asset
            if asset:
                self.asset_selected.emit(
                    json.dumps({"id": asset.id, "file_name": asset.file_name}),
                    json.dumps(restored.model_dump()),
                )

    def delete_snapshot(self, name: str) -> None:
        curr = self.app_state.current_edit_state
        if curr:
            previous = curr.model_copy(deep=True)
            curr.delete_snapshot(name)
            if not self._save_state_with_notification(curr):
                self.app_state.set_current_edit_state(previous)
                return
            asset = self.app_state.active_asset
            if asset:
                self.asset_selected.emit(
                    json.dumps({"id": asset.id, "file_name": asset.file_name}),
                    json.dumps(curr.model_dump()),
                )

    # ── Crop Tool API ──────────────────────────────────────────────────────

    def set_crop_mode(self, active: bool) -> None:
        """Toggle crop framing mode. When active, sends uncropped full-frame preview."""
        self._is_crop_mode = active
        self._do_render_preview()

    def apply_crop(self, x: float, y: float, w: float, h: float) -> None:
        """Apply committed crop bounds [0..1] and exit crop mode."""
        curr = self.app_state.current_edit_state
        if not curr:
            return
        if self._edit_start_state is None:
            self._edit_start_state = curr.model_copy(deep=True)

        curr.geometry.crop_x = max(0.0, min(0.99, float(x)))
        curr.geometry.crop_y = max(0.0, min(0.99, float(y)))
        curr.geometry.crop_width = max(0.01, min(1.0 - curr.geometry.crop_x, float(w)))
        curr.geometry.crop_height = max(0.01, min(1.0 - curr.geometry.crop_y, float(h)))

        self._is_crop_mode = False
        self.app_state.set_current_edit_state(curr)
        self._do_render_preview()
        self._do_commit_edit_state()

        asset = self.app_state.active_asset
        if asset:
            self.asset_selected.emit(json.dumps({"id": asset.id, "file_name": asset.file_name}), json.dumps(curr.model_dump()))
        self.notification.emit("Crop Applied", f"Cropped to {int(curr.geometry.crop_width*100)}% × {int(curr.geometry.crop_height*100)}%", "success")

    def reset_crop(self) -> None:
        """Reset crop to 100% full frame."""
        self.apply_crop(0.0, 0.0, 1.0, 1.0)

    def cancel_crop(self) -> None:
        """Cancel crop mode without changing crop bounds."""
        self._is_crop_mode = False
        self._do_render_preview()

    # ── Export & Deliver API ───────────────────────────────────────────────

    def choose_export_folder(self) -> str:
        """Open native folder picker and return selected path."""
        folder = self._file_dialog("export_folder")
        return folder or ""

    def export_assets(self, settings_json: str) -> str:
        """Batch export assets with given settings. Returns JSON result summary."""
        try:
            if not self.export_service:
                return json.dumps({"ok": False, "error": "Export service not initialized", "count": 0})

            data = json.loads(settings_json)
            asset_ids: list = data.get("asset_ids", [])
            fmt_str: str = str(data.get("format", "JPEG")).lower()
            quality: int = int(data.get("quality", 90))
            color_space_str: str = str(data.get("color_space", "sRGB"))
            resize_mode_str: str = str(data.get("resize_mode", "original"))
            resize_value: int = int(data.get("resize_value", 2048))
            resize_unit: str = str(data.get("resize_unit", "px"))
            if resize_mode_str not in {
                "original", "fit_width", "fit_height", "fit_long", "fit_short", "custom"
            }:
                raise ValueError(f"Unsupported resize mode: {resize_mode_str}")
            if resize_unit not in {"px", "%"}:
                raise ValueError(f"Unsupported resize unit: {resize_unit}")
            if resize_mode_str != "original" and resize_value < 1:
                raise ValueError("Resize value must be a positive integer")
            output_folder: str = str(data.get("output_folder") or "")
            filename_suffix: str = str(data.get("filename_suffix") or "")
            filename_pattern: str = str(data.get("filename_pattern") or "")

            watermark_enabled: bool = bool(data.get("watermark_enabled", False))
            watermark_type = str(data.get("watermark_type", "app_icon"))
            if watermark_type == "logo":
                watermark_type = "app_icon"
            if watermark_type not in {"app_icon", "wordmark", "text"}:
                raise ValueError(f"Unsupported watermark type: {watermark_type}")
            watermark_text: str = str(data.get("watermark_text", ""))
            watermark_opacity: float = float(data.get("watermark_opacity", 0.75))
            watermark_position: str = str(data.get("watermark_position", "bottom_right"))

            if not asset_ids:
                return json.dumps({"ok": False, "error": "No assets selected", "count": 0})

            # Format mapping
            fmt_map = {
                "jpeg": ExportFormat.JPEG,
                "jpg": ExportFormat.JPEG,
                "png": ExportFormat.PNG,
                "tiff": ExportFormat.TIFF,
                "tif": ExportFormat.TIFF,
                "webp": ExportFormat.WEBP,
                "bmp": ExportFormat.BMP,
                "gif": ExportFormat.GIF,
                "ppm": ExportFormat.PPM,
            }
            if fmt_str not in fmt_map:
                raise ValueError(f"Unsupported export format: {fmt_str}")
            export_format = fmt_map[fmt_str]

            # Color space mapping
            cs_map = {
                "srgb": ColorSpace.SRGB,
                "adobe rgb": ColorSpace.ADOBE_RGB,
                "adobergb": ColorSpace.ADOBE_RGB,
                "display p3": ColorSpace.DISPLAY_P3,
                "display_p3": ColorSpace.DISPLAY_P3,
            }
            try:
                color_space = cs_map[color_space_str.lower()]
            except KeyError as exc:
                raise ValueError(f"Unsupported color profile: {color_space_str}") from exc
            if color_space != ColorSpace.SRGB:
                raise ValueError(
                    "Only sRGB export is currently supported; wide-gamut color conversion "
                    "and profile embedding are not available."
                )

            # Build jobs
            jobs = []
            for aid in asset_ids:
                asset = self.library_service.asset_repo.get_by_id(aid)
                if not asset or not asset.source_path.exists():
                    continue
                edit_state = self.editing_service.get_edit_state(aid)

                resize_mode = ResizeMode.ORIGINAL
                max_w: Optional[int] = None
                max_h: Optional[int] = None
                if resize_mode_str != "original":
                    if resize_unit == "%":
                        if not asset.width or not asset.height:
                            raise ValueError(
                                f"Image dimensions are missing for percentage resize: {asset.file_name}"
                            )
                        scale = max(0.01, min(resize_value / 100.0, 100.0))
                        if resize_mode_str == "fit_width":
                            resize_mode = ResizeMode.FIT
                            max_w = max(1, round(asset.width * scale))
                        elif resize_mode_str == "fit_height":
                            resize_mode = ResizeMode.FIT
                            max_h = max(1, round(asset.height * scale))
                        elif resize_mode_str == "fit_short":
                            resize_mode = ResizeMode.FIT
                            if asset.width <= asset.height:
                                max_w = max(1, round(asset.width * scale))
                            else:
                                max_h = max(1, round(asset.height * scale))
                        else:
                            resize_mode = ResizeMode.LONGEST_EDGE
                            longest = max(asset.width, asset.height)
                            max_w = max_h = max(1, round(longest * scale))
                    elif resize_mode_str == "fit_width":
                        resize_mode = ResizeMode.FIT
                        max_w = resize_value
                    elif resize_mode_str == "fit_height":
                        resize_mode = ResizeMode.FIT
                        max_h = resize_value
                    elif resize_mode_str in ("fit_long", "custom"):
                        resize_mode = ResizeMode.LONGEST_EDGE
                        max_w = max_h = resize_value
                    elif resize_mode_str == "fit_short":
                        resize_mode = ResizeMode.FIT
                        if asset.width <= asset.height:
                            max_w = resize_value
                        else:
                            max_h = resize_value

                if output_folder:
                    out_dir = Path(output_folder)
                else:
                    out_dir = Path(asset.source_path).parent
                out_dir.mkdir(parents=True, exist_ok=True)

                pattern = f"{{name}}{filename_suffix}" if filename_suffix else "{name}_export"

                settings = ExportSettings(
                    format=export_format,
                    quality=quality,
                    output_dir=out_dir,
                    filename_pattern=filename_pattern or pattern,
                    color_space=color_space,
                    resize_mode=resize_mode,
                    max_width=max_w,
                    max_height=max_h,
                    watermark_enabled=watermark_enabled,
                    watermark_type=watermark_type,
                    watermark_text=watermark_text,
                    watermark_opacity=watermark_opacity,
                    watermark_position=watermark_position,
                )
                target_path = self.export_service.compute_target_path(
                    asset.file_name, settings, asset.metadata
                )
                jobs.append(ExportJob(
                    asset_id=aid,
                    asset_name=asset.file_name,
                    source_path=asset.source_path,
                    settings=settings,
                    edit_state=edit_state,
                    target_path=target_path,
                ))

            if not jobs:
                return json.dumps({"ok": False, "error": "No valid image files found to export", "count": 0})

            if not self.export_job_manager:
                raise RuntimeError("Export job manager is not initialized")
            job_id = self.export_job_manager.start(jobs)
            return json.dumps({"ok": True, "job_id": job_id, "status": "queued"})

        except Exception as exc:
            logger.error(f"export_assets error: {exc}", exc_info=True)
            return json.dumps({"ok": False, "error": str(exc), "count": 0})

    def get_export_job(self, job_id: str) -> str:
        """Return the current state of a background export batch."""
        if not self.export_job_manager:
            raise RuntimeError("Export job manager is not initialized")
        return json.dumps(self.export_job_manager.get(job_id))

    def control_export_job(self, job_id: str, action: str) -> str:
        """Pause, resume, or cancel a running batch."""
        if not self.export_job_manager:
            raise RuntimeError("Export job manager is not initialized")
        return json.dumps(self.export_job_manager.control(job_id, action))

    def dispatch_command(self, command_id: str, payload_json: str | None = None) -> str:
        """Dispatch a typed command through the shared command registry."""
        try:
            payload = json.loads(payload_json) if payload_json else {}
            result = self.command_dispatcher.dispatch(
                command_id,
                payload if isinstance(payload, dict) else {"value": payload},
                self.app_state.current_edit_state,
            )
            return json.dumps(result.to_dict())
        except json.JSONDecodeError as exc:
            return json.dumps({
                "ok": False,
                "command_id": command_id,
                "error": f"Payload is not valid JSON: {exc}",
                "error_code": "invalid_input",
            })

    def get_processing_cache_info(self) -> str:
        """Return bounded processor cache statistics for Settings."""
        processors = {
            id(processor): processor
            for processor in (
                getattr(self.editing_service, "processor", None),
                getattr(self.export_service, "processor", None),
            )
            if processor is not None
        }
        graphs = [
            graph
            for processor in processors.values()
            if (graph := getattr(processor, "graph", None)) is not None
        ]
        return json.dumps({
            "entries": sum(graph.cache_info()["entries"] for graph in graphs),
            "bytes": sum(graph.cache_info()["bytes"] for graph in graphs),
            "max_bytes": sum(graph.cache_info()["max_bytes"] for graph in graphs),
            "hits": sum(graph.cache_info()["hits"] for graph in graphs),
            "misses": sum(graph.cache_info()["misses"] for graph in graphs),
        })

    def clear_processing_cache(self) -> None:
        """Clear cached intermediate image results."""
        processors = {
            id(processor): processor
            for processor in (
                getattr(self.editing_service, "processor", None),
                getattr(self.export_service, "processor", None),
            )
            if processor is not None
        }
        for processor in processors.values():
            graph = getattr(processor, "graph", None)
            if graph:
                graph.clear_cache()

    def get_export_presets(self) -> str:
        """Return JSON list of built-in export presets."""
        presets = [
            {
                "id": "web_srgb",
                "name": "Web / Social Media",
                "format": "JPEG",
                "quality": 85,
                "color_space": "sRGB",
                "resize_mode": "fit_long",
                "resize_value": 2048,
                "resize_unit": "px",
            },
            {
                "id": "fullres_jpeg",
                "name": "Full Res JPEG",
                "format": "JPEG",
                "quality": 95,
                "color_space": "sRGB",
                "resize_mode": "original",
                "resize_value": 0,
                "resize_unit": "px",
            },
            {
                "id": "print_tiff",
                "name": "Print TIFF (8-bit sRGB)",
                "format": "TIFF",
                "quality": 100,
                "color_space": "sRGB",
                "resize_mode": "original",
                "resize_value": 0,
                "resize_unit": "px",
            },
            {
                "id": "instagram_square",
                "name": "Instagram (1080px)",
                "format": "JPEG",
                "quality": 90,
                "color_space": "sRGB",
                "resize_mode": "fit_long",
                "resize_value": 1080,
                "resize_unit": "px",
            },
            {
                "id": "lossless_png",
                "name": "Lossless PNG",
                "format": "PNG",
                "quality": 100,
                "color_space": "sRGB",
                "resize_mode": "original",
                "resize_value": 0,
                "resize_unit": "px",
            },
        ]
        return json.dumps(presets)

    # ── Internal Rendering & Processing ───────────────────────────────────

    def _do_render_preview(self) -> None:
        asset = self.app_state.active_asset
        state = self.app_state.current_edit_state
        if not asset or not state:
            return
        if not asset.source_path.is_file():
            self.histogram_updated.emit([], [], [], [])
            self.color_scopes_updated.emit(None)
            if asset.id not in self._missing_source_notified:
                self.image_updated.emit("")
                self.before_image_updated.emit("")
                self.notification.emit(
                    "Source Image Missing",
                    f"Could not find '{asset.file_name}' at {asset.source_path}. "
                    "The catalog entry and saved edits were kept.",
                    "error",
                )
                self._missing_source_notified.add(asset.id)
            return

        try:
            self._missing_source_notified.discard(asset.id)
            render_state = state
            if getattr(self, "_is_crop_mode", False):
                render_state = state.model_copy(deep=True)
                render_state.geometry.crop_x = 0.0
                render_state.geometry.crop_y = 0.0
                render_state.geometry.crop_width = 1.0
                render_state.geometry.crop_height = 1.0

            cancel_event = (
                threading.Event()
                if render_state.detail.enhancement_resolution > 0
                and isinstance(self.editing_service, EditingService)
                else None
            )
            try:
                if cancel_event is not None:
                    with self._processing_cancel_lock:
                        self._active_processing_cancel = cancel_event
                    rendered = self.editing_service.render_preview(
                        asset.id,
                        asset.source_path,
                        render_state,
                        progress_callback=lambda percent: self._emit_processing_progress(
                            percent,
                            "AI restoration — "
                            f"{ImageEnhancementEngine.compute_device_label()}",
                            True,
                        ),
                        cancel_event=cancel_event,
                    )
                else:
                    rendered = self.editing_service.render_preview(
                        asset.id, asset.source_path, render_state
                    )
            finally:
                if cancel_event is not None:
                    with self._processing_cancel_lock:
                        if self._active_processing_cancel is cancel_event:
                            self._active_processing_cancel = None
                    self._emit_processing_progress(
                        None,
                        "Restoring image with local AI",
                    )
            if rendered is None:
                return

            # Convert to Data URL
            data_url = self._buffer_to_data_url(rendered)
            self.image_updated.emit(data_url)

            # Compute Histogram
            r, g, b, lum = self._compute_histogram(rendered)
            self.histogram_updated.emit(r, g, b, lum)
            if self._active_workspace == "color_studio":
                self.color_scopes_updated.emit(self._compute_color_scopes(rendered))

        except ProcessingCancelled:
            self.notification.emit(
                "AI Restoration Cancelled",
                "The operation was cancelled. No partial result was applied.",
                "info",
            )
        except Exception as e:
            logger.exception("Render error for %s", asset.file_name)
            self.color_scopes_updated.emit(None)
            self.notification.emit(
                "Preview Failed",
                f"Could not render '{asset.file_name}': {e}",
                "error",
            )

    def has_local_enhancement_model(self) -> bool:
        return ImageEnhancementEngine.has_model()

    def _emit_processing_progress(
        self, percent: int | None, message: str, cancellable: bool = False
    ) -> None:
        progress_event = getattr(self, "processing_progress", None)
        if progress_event is not None:
            progress_event.emit(percent, message, cancellable)

    def download_local_enhancement_model(self) -> str:
        cancel_event = threading.Event()
        with self._processing_cancel_lock:
            self._active_processing_cancel = cancel_event
        try:
            ImageEnhancementEngine.download_model(
                progress_callback=lambda percent: self._emit_processing_progress(
                    percent, "Downloading local AI model", True
                ),
                cancel_event=cancel_event,
            )
        except ProcessingCancelled:
            return json.dumps({"ok": False, "cancelled": True})
        finally:
            with self._processing_cancel_lock:
                if self._active_processing_cancel is cancel_event:
                    self._active_processing_cancel = None
            self._emit_processing_progress(None, "Downloading local AI model")
        return json.dumps({"ok": True})

    def cancel_processing(self) -> bool:
        with self._processing_cancel_lock:
            cancel_event = self._active_processing_cancel
            if cancel_event is None:
                return False
            cancel_event.set()
            return True

    def _do_commit_edit_state(self) -> None:
        state = self.app_state.current_edit_state
        if not state:
            return

        old_state = self._edit_start_state
        try:
            self.editing_service.save_edit_state(state)
        except Exception as exc:
            logger.exception("Could not save edits for asset %s", state.asset_id)
            self.notification.emit(
                "Edit Not Saved",
                f"Changes to this photo remain in the current session but could not be saved: {exc}",
                "error",
            )
            if old_state:
                self.app_state.set_current_edit_state(old_state)
                self._pending_edit_state = old_state
                self._do_render_preview()
                asset = self.app_state.active_asset
                if asset:
                    self.asset_selected.emit(
                        json.dumps(self._asset_to_dict(asset)),
                        json.dumps(old_state.model_dump()),
                    )
            self._edit_start_state = None
            return

        if old_state:
            cmd = EditStateSnapshotCommand(old_state, state, "Adjust Parameters")
            self.command_dispatcher.execute_command(cmd, state)
            self._emit_history()
            self._persist_asset_history(state.asset_id)
        self._edit_start_state = None

    def _save_state_with_notification(self, state: EditState) -> bool:
        try:
            self.editing_service.save_edit_state(state)
            return True
        except Exception as exc:
            logger.exception("Could not save edits for asset %s", state.asset_id)
            self.notification.emit(
                "Edit Not Saved",
                f"Changes to this photo remain in the current session but could not be saved: {exc}",
                "error",
            )
            return False

    def _buffer_to_data_url(self, buf: Any) -> str:
        arr = buf.to_uint8()
        if arr.shape[-1] == 4:
            encoded = cv2.cvtColor(arr, cv2.COLOR_RGBA2BGRA)
            extension = ".png"
        else:
            encoded = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
            extension = ".jpg"
        ok, enc = cv2.imencode(extension, encoded)
        if not ok:
            return ""
        mime_type = "image/png" if extension == ".png" else "image/jpeg"
        return f"data:{mime_type};base64," + base64.b64encode(enc.tobytes()).decode("ascii")

    def _compute_histogram(self, buf: Any) -> tuple[list, list, list, list]:
        arr = buf.to_uint8()
        r = cv2.calcHist([arr], [0], None, [256], [0, 256]).flatten()
        g = cv2.calcHist([arr], [1], None, [256], [0, 256]).flatten()
        b = cv2.calcHist([arr], [2], None, [256], [0, 256]).flatten()
        lum = cv2.calcHist(
            [cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)], [0], None, [256], [0, 256]
        ).flatten()

        max_val = max(float(r.max()), float(g.max()), float(b.max()), float(lum.max()), 1.0)
        r_norm = (r / max_val).tolist()
        g_norm = (g / max_val).tolist()
        b_norm = (b / max_val).tolist()
        lum_norm = (lum / max_val).tolist()
        return r_norm, g_norm, b_norm, lum_norm

    def _compute_color_scopes(self, buf: Any) -> dict[str, Any]:
        """Return bounded, quantized scopes for the current rendered preview."""
        arr = buf.data[..., :3]
        max_edge = max(arr.shape[:2])
        if max_edge > 512:
            scale = 512 / max_edge
            arr = cv2.resize(
                arr,
                (max(1, round(arr.shape[1] * scale)), max(1, round(arr.shape[0] * scale))),
                interpolation=cv2.INTER_AREA,
            )

        preview = ImageBuffer.from_numpy(arr, color_space=getattr(buf, "color_space", "sRGB"))
        waveform = ScopesCalculator.compute_waveform(preview, width=160, height=90)
        vectorscope = ScopesCalculator.compute_vectorscope(preview, size=112, sample_step=2)
        return {
            "waveform": {
                "width": waveform.shape[1],
                "height": waveform.shape[0],
                "data": np.rint(waveform * 255).astype(np.uint8).ravel().tolist(),
            },
            "vectorscope": {
                "width": vectorscope.shape[1],
                "height": vectorscope.shape[0],
                "data": np.rint(vectorscope * 255).astype(np.uint8).ravel().tolist(),
            },
        }

    @staticmethod
    def _apply_dict_to_edit_state(state: EditState, data: dict) -> EditState:
        state = state.model_copy(deep=True)
        if "exposure" in data:
            for k, v in data["exposure"].items():
                if hasattr(state.exposure, k):
                    setattr(state.exposure, k, float(v))
        if "white_balance" in data:
            for k, v in data["white_balance"].items():
                if hasattr(state.white_balance, k):
                    setattr(state.white_balance, k, float(v))
        if "detail" in data:
            for k, v in data["detail"].items():
                if hasattr(state.detail, k):
                    setattr(state.detail, k, float(v))
        if "geometry" in data:
            for k, v in data["geometry"].items():
                if hasattr(state.geometry, k):
                    if isinstance(v, (bool, str)):
                        setattr(state.geometry, k, v)
                    else:
                        setattr(state.geometry, k, float(v))
        if "hsl" in data and hasattr(state, "hsl") and state.hsl:
            for band_name, band_data in data["hsl"].items():
                if hasattr(state.hsl, band_name) and isinstance(band_data, dict):
                    band = getattr(state.hsl, band_name)
                    for param, val in band_data.items():
                        if hasattr(band, param):
                            setattr(band, param, float(val))
        if "color_grading" in data and hasattr(state, "color_grading") and state.color_grading:
            cg_data = data["color_grading"]
            for wheel_name in ("lift", "gamma", "gain", "offset"):
                if wheel_name in cg_data and hasattr(state.color_grading, wheel_name):
                    wheel = getattr(state.color_grading, wheel_name)
                    w_dict = cg_data[wheel_name]
                    if "hue" in w_dict:
                        wheel.hue = max(0.0, min(360.0, float(w_dict["hue"])))
                    if "saturation" in w_dict:
                        s_val = float(w_dict["saturation"])
                        if s_val > 1.0:
                            s_val /= 100.0
                        wheel.saturation = max(0.0, min(1.0, s_val))
                    if "luminance" in w_dict:
                        l_val = float(w_dict["luminance"])
                        if abs(l_val) > 1.0:
                            l_val /= 100.0
                        wheel.luminance = max(-1.0, min(1.0, l_val))
            if "lut_name" in cg_data:
                state.color_grading.lut_name = cg_data["lut_name"]
            if "lut_intensity" in cg_data:
                state.color_grading.lut_intensity = float(cg_data["lut_intensity"])
        if "tone_curves" in data and hasattr(state, "tone_curves") and state.tone_curves:
            tc_data = data["tone_curves"]
            for ch in ("rgb_points", "red_points", "green_points", "blue_points"):
                if ch in tc_data and isinstance(tc_data[ch], list):
                    points = [CurvePoint(x=float(pt["x"]), y=float(pt["y"])) for pt in tc_data[ch] if "x" in pt and "y" in pt]
                    setattr(state.tone_curves, ch, points)
        if "masks" in data and isinstance(data["masks"], list):
            state.masks = [AdjustmentMask.model_validate(mask) for mask in data["masks"]]
        if "retouch_spots" in data and isinstance(data["retouch_spots"], list):
            state.retouch_spots = [
                RetouchSpot.model_validate(spot) for spot in data["retouch_spots"]
            ]
        if "custom_metadata" in data and isinstance(data["custom_metadata"], dict):
            state.custom_metadata = data["custom_metadata"]
        return EditState.model_validate(state.model_dump(mode="python"))
