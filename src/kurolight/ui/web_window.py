"""KuroLight main window, hosted by pywebview."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Optional

import webview

from kurolight.app import AppState
from kurolight.ui.web_bridge import PyBridge, _SerializedAPI

logger = logging.getLogger(__name__)


class WebWindow:
    """Create the native pywebview window for the React application."""

    def __init__(
        self,
        app_state: AppState,
        project_service: Any,
        library_service: Any,
        editing_service: Any,
        command_dispatcher: Any,
        preset_service: Any,
        export_service: Any,
        dev_url: Optional[str] = None,
    ) -> None:
        self.bridge = PyBridge(
            app_state=app_state,
            library_service=library_service,
            editing_service=editing_service,
            command_dispatcher=command_dispatcher,
            preset_service=preset_service,
            export_service=export_service,
            history_repository=project_service.edit_history_repo,
        )
        self.api = _SerializedAPI(self.bridge)

        url = dev_url or self._find_frontend()
        self.window = webview.create_window(
            "KuroLight — Intelligent Visual Creation",
            url,
            js_api=self.api,
            width=1440,
            height=900,
            min_size=(1024, 680),
            background_color="#0D0E11",
        )
        self.bridge._window = self.window
        self.window.events.loaded += self._on_loaded

    @staticmethod
    def _find_frontend() -> str:
        import sys
        candidates = []
        if getattr(sys, "frozen", False):
            meipass = getattr(sys, "_MEIPASS", None)
            if meipass:
                candidates.append(Path(meipass) / "web" / "dist" / "index.html")
            exe_dir = Path(sys.executable).resolve().parent
            candidates.append(exe_dir / "web" / "dist" / "index.html")
            candidates.append(exe_dir / "_internal" / "web" / "dist" / "index.html")
        for parent in Path(__file__).resolve().parents:
            candidates.append(parent / "web" / "dist" / "index.html")
        for dist_path in candidates:
            if dist_path.is_file():
                return dist_path.resolve().as_uri()
        raise FileNotFoundError(
            "Could not find web/dist/index.html. Build the React frontend by running "
            "'npm run build' in the web directory."
        )

    def _on_loaded(self, *_args: Any) -> None:
        logger.info("KuroLight React frontend loaded in pywebview.")
        self.bridge.initial_sync()

    @staticmethod
    def start(debug: bool = False) -> None:
        """Run pywebview's native event loop until the main window closes."""
        webview.start(debug=debug)
