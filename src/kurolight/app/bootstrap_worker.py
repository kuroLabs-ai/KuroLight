"""Background bootstrap worker for the KuroLight GUI launch sequence.

Runs ``bootstrap_services()`` in a separate thread so the splash screen
animation stays perfectly smooth on the main thread.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PySide6.QtCore import QThread, Signal


class BootstrapWorker(QThread):
    """Qt thread that initialises all backend services and reports progress.

    Signals
    -------
    stage_changed(int) :
        Emitted at each boot stage with the stage index (0-based, maps to
        ``SplashScreen.STAGES``).
    services_ready(dict) :
        Emitted once with the full services dict when bootstrap is complete.
    error_occurred(str) :
        Emitted if an unrecoverable exception happens during bootstrap.
    """

    stage_changed   = Signal(int)   # stage index → SplashScreen.STAGES
    services_ready  = Signal(object)
    error_occurred  = Signal(str)

    def __init__(self, db_path: Optional[Path] = None, parent=None) -> None:
        super().__init__(parent)
        self._db_path = db_path

    def run(self) -> None:
        try:
            # Stage 0 — logging & config
            self.stage_changed.emit(0)
            from kurolight.infrastructure.logging import setup_logging
            from kurolight.config.app_config import AppConfig
            setup_logging()
            config = AppConfig.load()

            # Stage 1 — project vault
            self.stage_changed.emit(1)
            from kurolight.services.project_service import ProjectService
            from pathlib import Path as _Path
            if self._db_path:
                target_db = _Path(self._db_path)
            elif config.last_project_path and _Path(config.last_project_path).exists():
                target_db = _Path(config.last_project_path)
            else:
                target_db = AppConfig.get_data_dir() / "vaults" / "default.kurolight"
            target_db.parent.mkdir(parents=True, exist_ok=True)
            project_service = ProjectService.open_or_create_project(target_db, "Kuro Vault")

            # Stage 2 — asset library
            self.stage_changed.emit(2)
            from kurolight.services.library_service import LibraryService
            library_service = LibraryService(
                asset_repo=project_service.asset_repo,
                edit_state_repo=project_service.edit_state_repo,
                collection_repo=project_service.collection_repo,
            )

            # Stage 3 — editing engine
            self.stage_changed.emit(3)
            from kurolight.services.editing_service import EditingService
            editing_service = EditingService(
                edit_state_repo=project_service.edit_state_repo
            )

            # Stage 4 — presets & export
            self.stage_changed.emit(4)
            from kurolight.services.preset_service import PresetService
            from kurolight.services.export_service import ExportService
            preset_service = PresetService(preset_repo=project_service.preset_repo)
            export_service = ExportService()

            # Stage 5 — app state & command dispatcher
            self.stage_changed.emit(5)
            from kurolight.app.app_state import AppState
            from kurolight.app.command_dispatcher import CommandDispatcher
            app_state = AppState()
            proj = project_service.get_current_project()
            if proj:
                app_state.set_current_project(proj)
            command_dispatcher = CommandDispatcher(undo_limit=config.editing.undo_limit)

            # Stage 6 — done
            self.stage_changed.emit(6)

            self.services_ready.emit({
                "app_state":          app_state,
                "project_service":    project_service,
                "library_service":    library_service,
                "editing_service":    editing_service,
                "preset_service":     preset_service,
                "export_service":     export_service,
                "command_dispatcher": command_dispatcher,
            })

        except Exception as exc:  # noqa: BLE001
            self.error_occurred.emit(str(exc))
