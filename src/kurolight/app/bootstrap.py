"""Application bootstrap sequence coordinating services and database (headless engine)."""

import sys
from pathlib import Path
from typing import Dict, Optional

from kurolight.app.app_state import AppState
from kurolight.app.command_dispatcher import CommandDispatcher
from kurolight.config.app_config import AppConfig
from kurolight.infrastructure.logging import get_logger, setup_logging
from kurolight.services.editing_service import EditingService
from kurolight.services.export_service import ExportService
from kurolight.services.library_service import LibraryService
from kurolight.services.preset_service import PresetService
from kurolight.services.project_service import ProjectService

logger = get_logger("bootstrap")


def _setup_crash_protection() -> None:
    """Install a global top-level unhandled exception hook to log unhandled exceptions."""
    def excepthook(exc_type, exc_val, exc_tb):
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_val, exc_tb)
            return
        logger.critical("Unhandled application exception:", exc_info=(exc_type, exc_val, exc_tb))

    sys.excepthook = excepthook


def bootstrap_services(db_path: Optional[Path] = None) -> Dict:
    """Initialize all backend services and return them as a dict.

    Returns:
        dict with keys: app_state, project_service, library_service,
        editing_service, preset_service, export_service, command_dispatcher
    """
    # 1. Initialize Logging
    setup_logging()
    _setup_crash_protection()
    logger.info("Starting KuroLight bootstrap sequence...")

    # 2. Load Configuration
    config = AppConfig.load()

    # 3. Resolve database path
    if db_path is None:
        if config.last_project_path and Path(config.last_project_path).exists():
            target_db = Path(config.last_project_path)
        else:
            target_db = AppConfig.get_data_dir() / "vaults" / "default.kurolight"
    else:
        target_db = Path(db_path)

    target_db.parent.mkdir(parents=True, exist_ok=True)

    # 4. Initialize Services
    project_service = ProjectService.open_or_create_project(target_db, "Kuro Vault")
    library_service = LibraryService(
        asset_repo=project_service.asset_repo,
        edit_state_repo=project_service.edit_state_repo,
        collection_repo=project_service.collection_repo,
    )
    editing_service = EditingService(edit_state_repo=project_service.edit_state_repo)
    preset_service = PresetService(preset_repo=project_service.preset_repo)
    export_service = ExportService()

    # 5. Initialize State & Command Dispatcher
    app_state = AppState()
    proj = project_service.get_current_project()
    if proj:
        app_state.set_current_project(proj)
    command_dispatcher = CommandDispatcher(undo_limit=config.editing.undo_limit)

    logger.info("Bootstrap complete. Engine ready.")
    return {
        "app_state": app_state,
        "project_service": project_service,
        "library_service": library_service,
        "editing_service": editing_service,
        "preset_service": preset_service,
        "export_service": export_service,
        "command_dispatcher": command_dispatcher,
    }
