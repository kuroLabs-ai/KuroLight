"""Service coordinating project catalogs and persistence."""

import os
import sqlite3
import uuid
from pathlib import Path
from typing import Optional

from kurolight.domain.projects import Project
from kurolight.infrastructure.database.connection import DatabaseConnectionManager
from kurolight.infrastructure.database.migrations import apply_migrations
from kurolight.infrastructure.database.repository import (
    AssetRepository,
    CollectionRepository,
    EditHistoryRepository,
    EditStateRepository,
    PresetRepository,
    ProjectRepository,
)
from kurolight.infrastructure.logging import get_logger

logger = get_logger("services.project")


class ProjectService:
    """Manages project creation, loading, and persistence lifecycle."""

    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager
        self.project_repo = ProjectRepository(db_manager)
        self.asset_repo = AssetRepository(db_manager)
        self.edit_history_repo = EditHistoryRepository(db_manager)
        self.edit_state_repo = EditStateRepository(db_manager)
        self.collection_repo = CollectionRepository(db_manager)
        self.preset_repo = PresetRepository(db_manager)

    @classmethod
    def open_or_create_project(cls, db_path: Path, name: str = "Untitled Project") -> "ProjectService":
        """Initialize database, run migrations, and return active ProjectService."""
        db_path = Path(db_path)
        db_manager = DatabaseConnectionManager(db_path)

        with db_manager.transaction() as conn:
            apply_migrations(conn)

        service = cls(db_manager)
        # Check if project record exists
        conn = db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM projects LIMIT 1;")
        row = cursor.fetchone()

        if not row:
            project = Project.create(name=name, db_path=db_path)
            service.project_repo.save(project)
            logger.info("Created new project: %s (%s)", name, project.id)
        else:
            project = service.project_repo.get_by_id(row["id"])
            logger.info("Loaded existing project: %s", project.name if project else "Unknown")

        return service

    def get_current_project(self) -> Optional[Project]:
        """Fetch primary project in catalog."""
        conn = self.db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM projects LIMIT 1;")
        row = cursor.fetchone()
        if row:
            return self.project_repo.get_by_id(row["id"])
        return None

    def backup_catalog(self, destination: Path) -> Path:
        """Create and verify an atomic SQLite backup of the current catalog."""
        destination = Path(destination).expanduser().resolve()
        source = self.db_manager.db_path.expanduser().resolve()
        if destination == source:
            raise ValueError("Catalog backup destination must differ from the active database.")
        if destination.exists():
            raise FileExistsError(f"Catalog backup already exists: {destination}")

        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(
            f".{destination.name}.{uuid.uuid4().hex}.tmp"
        )
        try:
            backup_connection = sqlite3.connect(temporary)
            try:
                self.db_manager.get_connection().backup(backup_connection)
                check = backup_connection.execute("PRAGMA integrity_check;").fetchone()
                if not check or check[0] != "ok":
                    raise sqlite3.DatabaseError(
                        f"Catalog backup integrity check failed: {check[0] if check else 'no result'}"
                    )
            finally:
                backup_connection.close()
            if destination.exists():
                raise FileExistsError(f"Catalog backup already exists: {destination}")
            os.replace(temporary, destination)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        return destination
