"""Repository implementations for SQLite persistence."""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from kurolight.domain.assets import ImageAsset, source_folder_from_path
from kurolight.domain.collections import Collection, SmartCollectionRules
from kurolight.domain.editing import EditState
from kurolight.domain.metadata import AssetMetadataOverrides
from kurolight.domain.presets import Preset
from kurolight.domain.projects import Project
from kurolight.infrastructure.database.connection import DatabaseConnectionManager


class ProjectRepository:
    """Persistence operations for Project entities."""

    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager

    def save(self, project: Project) -> None:
        """Insert or update project record."""
        with self.db_manager.transaction() as conn:
            conn.execute(
                """
                INSERT INTO projects (id, name, created_at, updated_at, schema_version, settings_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    updated_at = excluded.updated_at,
                    settings_json = excluded.settings_json;
                """,
                (
                    project.id,
                    project.name,
                    project.created_at,
                    project.updated_at,
                    project.schema_version,
                    json.dumps(project.settings),
                ),
            )

    def get_by_id(self, project_id: str) -> Optional[Project]:
        """Fetch project by UUID."""
        conn = self.db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM projects WHERE id = ?;", (project_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return Project(
            id=row["id"],
            name=row["name"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            schema_version=row["schema_version"],
            db_path=self.db_manager.db_path,
            settings=json.loads(row["settings_json"]),
        )


class AssetRepository:
    """Persistence operations for ImageAsset entities."""

    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager

    def save(self, asset: ImageAsset) -> None:
        """Insert or update asset record."""
        with self.db_manager.transaction() as conn:
            conn.execute(
                """
                INSERT INTO assets (
                    id, project_id, source_path, file_name, file_type,
                    width, height, file_size, metadata_json, metadata_overrides_json,
                    source_folder, date_captured, rating, flag, deleted_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    rating = excluded.rating,
                    flag = excluded.flag,
                    metadata_json = excluded.metadata_json,
                    metadata_overrides_json = excluded.metadata_overrides_json,
                    source_folder = excluded.source_folder,
                    width = excluded.width,
                    height = excluded.height,
                    file_size = excluded.file_size;
                """,
                (
                    asset.id,
                    asset.project_id,
                    str(asset.source_path),
                    asset.file_name,
                    asset.file_type,
                    asset.width,
                    asset.height,
                    asset.file_size,
                    json.dumps(asset.metadata),
                    asset.metadata_overrides.model_dump_json(),
                    source_folder_from_path(asset.source_path),
                    asset.date_captured,
                    asset.rating,
                    asset.flag,
                    asset.deleted_at,
                ),
            )

    def update_metadata_overrides(
        self, asset_id: str, overrides: AssetMetadataOverrides
    ) -> ImageAsset:
        """Persist user-authored metadata without changing EXIF or source files."""
        with self.db_manager.transaction() as conn:
            cursor = conn.execute(
                """
                UPDATE assets
                SET metadata_overrides_json = ?
                WHERE id = ? AND deleted_at IS NULL;
                """,
                (overrides.model_dump_json(), asset_id),
            )
            if cursor.rowcount != 1:
                raise KeyError(f"Asset not found: {asset_id}")
        asset = self.get_by_id(asset_id)
        if asset is None:
            raise RuntimeError(f"Updated asset disappeared from catalog: {asset_id}")
        return asset

    def get_by_id(
        self, asset_id: str, *, include_deleted: bool = False
    ) -> Optional[ImageAsset]:
        """Retrieve single asset by ID."""
        conn = self.db_manager.get_connection()
        cursor = conn.cursor()
        if include_deleted:
            cursor.execute("SELECT * FROM assets WHERE id = ?;", (asset_id,))
        else:
            cursor.execute(
                "SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL;",
                (asset_id,),
            )
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_asset(row)

    def get_by_source_path(self, source_path: Path) -> Optional[ImageAsset]:
        """Find assets by path, including trash to prevent duplicate catalog rows."""
        conn = self.db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM assets WHERE source_path = ?;", (str(source_path),))
        row = cursor.fetchone()
        if row is None and os.name == "nt":
            cursor.execute(
                "SELECT * FROM assets WHERE source_path = ? COLLATE NOCASE;",
                (str(source_path),),
            )
            row = cursor.fetchone()
        return self._row_to_asset(row) if row else None

    def list_by_project(
        self, project_id: Optional[str] = None, *, include_deleted: bool = False
    ) -> List[ImageAsset]:
        """List assets, optionally filtered by project_id."""
        conn = self.db_manager.get_connection()
        cursor = conn.cursor()
        active_condition = "" if include_deleted else " AND deleted_at IS NULL"
        if project_id:
            cursor.execute(
                f"""
                SELECT * FROM assets WHERE project_id = ?{active_condition}
                ORDER BY file_name ASC;
                """,
                (project_id,),
            )
        else:
            cursor.execute(
                f"SELECT * FROM assets WHERE 1 = 1{active_condition} ORDER BY file_name ASC;"
            )
        return [self._row_to_asset(row) for row in cursor.fetchall()]

    def list_page(
        self, project_id: Optional[str], offset: int, limit: int
    ) -> List[ImageAsset]:
        """List a stable, bounded page of assets for a project."""
        return self.list_filtered_page(
            project_id, offset, limit, sort_by="file_name", ascending=True
        )

    def list_source_folders(
        self, project_id: Optional[str], offset: int, limit: int
    ) -> tuple[List[Dict[str, Any]], int]:
        """Return a bounded page of catalog directories and their direct asset counts."""
        if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
            raise ValueError("Folder page offset must be a non-negative integer.")
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 200:
            raise ValueError("Folder page limit must be an integer between 1 and 200.")
        folder_collation = "NOCASE" if os.name == "nt" else "BINARY"
        conn = self.db_manager.get_connection()
        conditions = ["deleted_at IS NULL"]
        parameters: tuple[Any, ...] = ()
        if project_id:
            conditions.append("project_id = ?")
            parameters = (project_id,)
        where_sql = f"WHERE {' AND '.join(conditions)}"
        rows = conn.execute(
            f"""
            SELECT MIN(source_folder) AS source_folder, COUNT(*) AS asset_count
            FROM assets
            {where_sql}
            GROUP BY source_folder COLLATE {folder_collation}
            ORDER BY source_folder COLLATE {folder_collation} ASC
            LIMIT ? OFFSET ?;
            """,
            (*parameters, limit, offset),
        ).fetchall()
        count_row = conn.execute(
            f"""
            SELECT COUNT(DISTINCT source_folder COLLATE {folder_collation}) AS folder_count
            FROM assets
            {where_sql};
            """,
            parameters,
        ).fetchone()
        folders = [
            {
                "source_folder": row["source_folder"],
                "asset_count": int(row["asset_count"]),
            }
            for row in rows
        ]
        return folders, int(count_row["folder_count"])

    def list_filtered_page(
        self,
        project_id: Optional[str],
        offset: int,
        limit: int,
        *,
        collection_id: Optional[str] = None,
        source_folder: Optional[str] = None,
        minimum_rating: int = 0,
        flag: str = "all",
        search: str = "",
        sort_by: str = "file_name",
        ascending: bool = True,
        trash_only: bool = False,
    ) -> List[ImageAsset]:
        """Return a bounded page using the Gallery's supported filters and sort modes."""
        where_sql, parameters = self._gallery_where(
            project_id,
            collection_id,
            source_folder,
            minimum_rating,
            flag,
            search,
            trash_only,
        )
        if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
            raise ValueError("Asset page offset must be a non-negative integer.")
        if (
            isinstance(limit, bool)
            or not isinstance(limit, int)
            or not 1 <= limit <= 200
        ):
            raise ValueError("Asset page limit must be an integer between 1 and 200.")

        sort_columns = {
            "file_name": "a.file_name COLLATE NOCASE",
            "date_taken": "COALESCE(a.date_captured, '')",
            "rating": "a.rating",
            "file_size": "COALESCE(a.file_size, 0)",
        }
        if not isinstance(sort_by, str) or sort_by not in sort_columns:
            raise ValueError("Unsupported asset page sort mode.")
        if not isinstance(ascending, bool):
            raise ValueError("Asset page sort direction must be a boolean.")
        direction = "ASC" if ascending else "DESC"
        tie_breakers = (
            ", a.file_name COLLATE NOCASE ASC, a.id ASC"
            if sort_by != "file_name"
            else ", a.id ASC"
        )
        conn = self.db_manager.get_connection()
        rows = conn.execute(
            f"""
            SELECT a.* FROM assets AS a
            {where_sql}
            ORDER BY {sort_columns[sort_by]} {direction}{tie_breakers}
            LIMIT ? OFFSET ?;
            """,
            (*parameters, limit, offset),
        ).fetchall()
        return [self._row_to_asset(row) for row in rows]

    def count_by_project(self, project_id: Optional[str] = None) -> int:
        """Count catalog assets, optionally restricted to a project."""
        conn = self.db_manager.get_connection()
        if project_id:
            row = conn.execute(
                """
                SELECT COUNT(*) AS asset_count FROM assets
                WHERE project_id = ? AND deleted_at IS NULL;
                """,
                (project_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT COUNT(*) AS asset_count FROM assets WHERE deleted_at IS NULL;"
            ).fetchone()
        return int(row["asset_count"])

    def count_trashed(self, project_id: Optional[str] = None) -> int:
        """Count trashed assets, optionally restricted to a project."""
        conn = self.db_manager.get_connection()
        if project_id:
            row = conn.execute(
                """
                SELECT COUNT(*) AS asset_count FROM assets
                WHERE project_id = ? AND deleted_at IS NOT NULL;
                """,
                (project_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT COUNT(*) AS asset_count FROM assets WHERE deleted_at IS NOT NULL;"
            ).fetchone()
        return int(row["asset_count"])

    def count_filtered(
        self,
        project_id: Optional[str],
        *,
        collection_id: Optional[str] = None,
        source_folder: Optional[str] = None,
        minimum_rating: int = 0,
        flag: str = "all",
        search: str = "",
        trash_only: bool = False,
    ) -> int:
        """Count assets matching the Gallery's supported filters."""
        where_sql, parameters = self._gallery_where(
            project_id,
            collection_id,
            source_folder,
            minimum_rating,
            flag,
            search,
            trash_only,
        )
        conn = self.db_manager.get_connection()
        row = conn.execute(
            f"SELECT COUNT(*) AS asset_count FROM assets AS a {where_sql};",
            parameters,
        ).fetchone()
        return int(row["asset_count"])

    def list_filtered_ids(
        self,
        project_id: Optional[str],
        *,
        collection_id: Optional[str] = None,
        source_folder: Optional[str] = None,
        minimum_rating: int = 0,
        flag: str = "all",
        search: str = "",
        sort_by: str = "file_name",
        ascending: bool = True,
        trash_only: bool = False,
    ) -> List[str]:
        """Return ordered IDs for operations such as select-all without asset payloads."""
        where_sql, parameters = self._gallery_where(
            project_id,
            collection_id,
            source_folder,
            minimum_rating,
            flag,
            search,
            trash_only,
        )
        sort_columns = {
            "file_name": "a.file_name COLLATE NOCASE",
            "date_taken": "COALESCE(a.date_captured, '')",
            "rating": "a.rating",
            "file_size": "COALESCE(a.file_size, 0)",
        }
        if not isinstance(sort_by, str) or sort_by not in sort_columns:
            raise ValueError("Unsupported asset page sort mode.")
        if not isinstance(ascending, bool):
            raise ValueError("Asset page sort direction must be a boolean.")
        direction = "ASC" if ascending else "DESC"
        tie_breakers = (
            ", a.file_name COLLATE NOCASE ASC, a.id ASC"
            if sort_by != "file_name"
            else ", a.id ASC"
        )
        conn = self.db_manager.get_connection()
        rows = conn.execute(
            f"""
            SELECT a.id FROM assets AS a
            {where_sql}
            ORDER BY {sort_columns[sort_by]} {direction}{tie_breakers};
            """,
            parameters,
        ).fetchall()
        return [row["id"] for row in rows]

    def _gallery_where(
        self,
        project_id: Optional[str],
        collection_id: Optional[str],
        source_folder: Optional[str],
        minimum_rating: int,
        flag: str,
        search: str,
        trash_only: bool = False,
    ) -> tuple[str, tuple[Any, ...]]:
        if isinstance(minimum_rating, bool) or not isinstance(minimum_rating, int):
            raise ValueError("Minimum rating must be an integer from 0 to 5.")
        if not 0 <= minimum_rating <= 5:
            raise ValueError("Minimum rating must be an integer from 0 to 5.")
        if not isinstance(flag, str) or flag not in {
            "all",
            "flagged",
            "unflagged",
            "rejected",
        }:
            raise ValueError("Unsupported asset flag filter.")
        if not isinstance(search, str) or len(search) > 256:
            raise ValueError("Asset search must be a string of at most 256 characters.")
        if not isinstance(trash_only, bool):
            raise ValueError("Trash-only filter must be a boolean.")
        if collection_id is not None and (
            not isinstance(collection_id, str) or len(collection_id) > 128
        ):
            raise ValueError("Collection ID must be a string of at most 128 characters.")
        if source_folder is not None and (
            not isinstance(source_folder, str) or len(source_folder) > 4096
        ):
            raise ValueError("Source folder must be a string of at most 4096 characters.")

        conditions: list[str] = [
            "a.deleted_at IS NOT NULL" if trash_only else "a.deleted_at IS NULL"
        ]
        parameters: list[Any] = []
        conn = self.db_manager.get_connection()
        if project_id:
            conditions.append("a.project_id = ?")
            parameters.append(project_id)
        if collection_id:
            collection = conn.execute(
                """
                SELECT project_id, collection_type, rules_json
                FROM collections WHERE id = ?;
                """,
                (collection_id,),
            ).fetchone()
            if not collection or (
                project_id is not None and collection["project_id"] != project_id
            ):
                conditions.append("0")
            else:
                if project_id is None:
                    conditions.append("a.project_id = ?")
                    parameters.append(collection["project_id"])
                if collection["collection_type"] == "manual":
                    conditions.append(
                        """
                        EXISTS (
                            SELECT 1 FROM collection_assets AS ca
                            WHERE ca.asset_id = a.id AND ca.collection_id = ?
                        )
                        """
                    )
                    parameters.append(collection_id)
                elif collection["collection_type"] == "smart":
                    rules = SmartCollectionRules.model_validate_json(
                        collection["rules_json"]
                    )
                    conditions.append(
                        """
                        EXISTS (
                            SELECT 1 FROM collections AS sc
                            WHERE sc.id = ? AND sc.project_id = a.project_id
                              AND sc.collection_type = 'smart'
                        )
                        """
                    )
                    parameters.append(collection_id)
                    rules_sql, rules_parameters = self._smart_collection_where(rules)
                    conditions.append(rules_sql)
                    parameters.extend(rules_parameters)
                else:
                    raise ValueError("Unsupported collection type in catalog.")
        if source_folder:
            folder_collation = "NOCASE" if os.name == "nt" else "BINARY"
            conditions.append(f"a.source_folder = ? COLLATE {folder_collation}")
            parameters.append(source_folder)
        if minimum_rating:
            conditions.append("a.rating >= ?")
            parameters.append(minimum_rating)
        if flag != "all":
            conditions.append("a.flag = ?")
            parameters.append(flag)
        query = search.strip()
        if query:
            search_sql, search_parameters = self._asset_search_condition(query)
            conditions.append(search_sql)
            parameters.extend(search_parameters)

        where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        return where_sql, tuple(parameters)

    @staticmethod
    def _smart_collection_where(
        rules: SmartCollectionRules,
    ) -> tuple[str, tuple[Any, ...]]:
        conditions: list[str] = []
        parameters: list[Any] = []
        if rules.minimum_rating:
            conditions.append("a.rating >= ?")
            parameters.append(rules.minimum_rating)
        if rules.flag != "all":
            conditions.append("a.flag = ?")
            parameters.append(rules.flag)
        if rules.source_folder:
            folder_collation = "NOCASE" if os.name == "nt" else "BINARY"
            conditions.append(f"a.source_folder = ? COLLATE {folder_collation}")
            parameters.append(rules.source_folder)
        if rules.search:
            search_sql, search_parameters = AssetRepository._asset_search_condition(
                rules.search
            )
            conditions.append(search_sql)
            parameters.extend(search_parameters)
        return " AND ".join(conditions) if conditions else "1", tuple(parameters)

    @staticmethod
    def _asset_search_condition(search: str) -> tuple[str, tuple[str, ...]]:
        escaped_query = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped_query}%"
        return (
            """
            (
                a.file_name LIKE ? ESCAPE '\\'
                OR json_extract(a.metadata_json, '$.camera_model') LIKE ? ESCAPE '\\'
                OR json_extract(a.metadata_json, '$.lens_model') LIKE ? ESCAPE '\\'
                OR json_extract(a.metadata_overrides_json, '$.title') LIKE ? ESCAPE '\\'
                OR json_extract(a.metadata_overrides_json, '$.description') LIKE ? ESCAPE '\\'
                OR json_extract(a.metadata_overrides_json, '$.copyright') LIKE ? ESCAPE '\\'
                OR EXISTS (
                    SELECT 1
                    FROM json_each(a.metadata_overrides_json, '$.keywords') AS keyword
                    WHERE keyword.value LIKE ? ESCAPE '\\'
                )
            )
            """,
            (pattern,) * 7,
        )

    def delete(self, asset_id: str) -> None:
        """Remove asset record."""
        with self.db_manager.transaction() as conn:
            conn.execute("DELETE FROM collection_assets WHERE asset_id = ?;", (asset_id,))
            conn.execute("DELETE FROM edit_states WHERE asset_id = ?;", (asset_id,))
            conn.execute("DELETE FROM assets WHERE id = ?;", (asset_id,))

    def move_to_trash(
        self, asset_id: str, project_id: Optional[str] = None
    ) -> bool:
        """Mark an active catalog record as trashed without touching related rows."""
        now = datetime.now(timezone.utc).isoformat()
        with self.db_manager.transaction() as conn:
            conditions = "id = ? AND deleted_at IS NULL"
            parameters: tuple[Any, ...] = (now, asset_id)
            if project_id is not None:
                conditions += " AND project_id = ?"
                parameters += (project_id,)
            cursor = conn.execute(
                f"UPDATE assets SET deleted_at = ? WHERE {conditions};",
                parameters,
            )
        return cursor.rowcount == 1

    def move_many_to_trash(
        self, asset_ids: List[str], project_id: Optional[str] = None
    ) -> None:
        """Atomically mark active catalog records as trashed."""
        now = datetime.now(timezone.utc).isoformat()
        with self.db_manager.transaction() as conn:
            for asset_id in dict.fromkeys(asset_ids):
                conditions = "id = ? AND deleted_at IS NULL"
                parameters: tuple[Any, ...] = (now, asset_id)
                if project_id is not None:
                    conditions += " AND project_id = ?"
                    parameters += (project_id,)
                cursor = conn.execute(
                    f"UPDATE assets SET deleted_at = ? WHERE {conditions};",
                    parameters,
                )
                if cursor.rowcount != 1:
                    raise KeyError(f"Active asset not found: {asset_id}")

    def restore(
        self, asset_id: str, project_id: Optional[str] = None
    ) -> bool:
        """Restore a trashed catalog record."""
        with self.db_manager.transaction() as conn:
            conditions = "id = ? AND deleted_at IS NOT NULL"
            parameters: tuple[Any, ...] = (asset_id,)
            if project_id is not None:
                conditions += " AND project_id = ?"
                parameters += (project_id,)
            cursor = conn.execute(
                f"UPDATE assets SET deleted_at = NULL WHERE {conditions};",
                parameters,
            )
        return cursor.rowcount == 1

    def restore_many(
        self, asset_ids: List[str], project_id: Optional[str] = None
    ) -> None:
        """Atomically restore trashed catalog records."""
        with self.db_manager.transaction() as conn:
            for asset_id in dict.fromkeys(asset_ids):
                conditions = "id = ? AND deleted_at IS NOT NULL"
                parameters: tuple[Any, ...] = (asset_id,)
                if project_id is not None:
                    conditions += " AND project_id = ?"
                    parameters += (project_id,)
                cursor = conn.execute(
                    f"UPDATE assets SET deleted_at = NULL WHERE {conditions};",
                    parameters,
                )
                if cursor.rowcount != 1:
                    raise KeyError(f"Trashed asset not found: {asset_id}")

    def permanently_delete(
        self, asset_id: str, project_id: Optional[str] = None
    ) -> bool:
        """Delete a trashed catalog record and its dependent catalog data."""
        with self.db_manager.transaction() as conn:
            conditions = "id = ? AND deleted_at IS NOT NULL"
            parameters: tuple[Any, ...] = (asset_id,)
            if project_id is not None:
                conditions += " AND project_id = ?"
                parameters += (project_id,)
            row = conn.execute(
                f"SELECT id FROM assets WHERE {conditions};", parameters
            ).fetchone()
            if row is None:
                return False
            conn.execute("DELETE FROM collection_assets WHERE asset_id = ?;", (asset_id,))
            conn.execute("DELETE FROM edit_states WHERE asset_id = ?;", (asset_id,))
            conn.execute("DELETE FROM assets WHERE id = ?;", (asset_id,))
        return True

    def permanently_delete_many(
        self, asset_ids: List[str], project_id: Optional[str] = None
    ) -> None:
        """Atomically purge trashed catalog records and dependent catalog data."""
        with self.db_manager.transaction() as conn:
            for asset_id in dict.fromkeys(asset_ids):
                conditions = "id = ? AND deleted_at IS NOT NULL"
                parameters: tuple[Any, ...] = (asset_id,)
                if project_id is not None:
                    conditions += " AND project_id = ?"
                    parameters += (project_id,)
                row = conn.execute(
                    f"SELECT id FROM assets WHERE {conditions};", parameters
                ).fetchone()
                if row is None:
                    raise KeyError(f"Trashed asset not found: {asset_id}")
                conn.execute(
                    "DELETE FROM collection_assets WHERE asset_id = ?;", (asset_id,)
                )
                conn.execute("DELETE FROM edit_states WHERE asset_id = ?;", (asset_id,))
                conn.execute("DELETE FROM assets WHERE id = ?;", (asset_id,))

    def _row_to_asset(self, row: Any) -> ImageAsset:
        return ImageAsset(
            id=row["id"],
            source_path=Path(row["source_path"]),
            file_name=row["file_name"],
            file_type=row["file_type"],
            width=row["width"],
            height=row["height"],
            file_size=row["file_size"],
            date_captured=row["date_captured"],
            rating=row["rating"],
            flag=row["flag"],
            metadata=json.loads(row["metadata_json"]),
            metadata_overrides=AssetMetadataOverrides.model_validate_json(
                row["metadata_overrides_json"]
            ),
            project_id=row["project_id"],
            deleted_at=row["deleted_at"],
        )


class EditStateRepository:
    """Persistence operations for non-destructive EditState models."""

    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager

    def save(self, edit_state: EditState) -> None:
        """Save or update EditState for asset."""
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        with self.db_manager.transaction() as conn:
            conn.execute(
                """
                INSERT INTO edit_states (id, asset_id, schema_version, parameters_json, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(asset_id) DO UPDATE SET
                    parameters_json = excluded.parameters_json,
                    updated_at = excluded.updated_at,
                    schema_version = excluded.schema_version;
                """,
                (
                    str(uuid.uuid4()),
                    edit_state.asset_id,
                    edit_state.schema_version,
                    edit_state.model_dump_json(),
                    now,
                ),
            )

    def get_by_asset_id(self, asset_id: str) -> Optional[EditState]:
        """Fetch EditState for specified asset ID."""
        conn = self.db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT parameters_json FROM edit_states WHERE asset_id = ?;", (asset_id,))
        row = cursor.fetchone()
        if not row:
            return None
        return EditState.model_validate_json(row["parameters_json"])


class EditHistoryRepository:
    """Persistence operations for each asset's undo/redo timeline."""

    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager

    def save(
        self,
        asset_id: str,
        commands: List[Dict[str, str]],
        active_index: int,
    ) -> None:
        with self.db_manager.transaction() as conn:
            conn.execute(
                """
                INSERT INTO edit_history (asset_id, history_json, active_index, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(asset_id) DO UPDATE SET
                    history_json = excluded.history_json,
                    active_index = excluded.active_index,
                    updated_at = excluded.updated_at;
                """,
                (
                    asset_id,
                    json.dumps(commands),
                    active_index,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

    def get_by_asset_id(
        self, asset_id: str
    ) -> Optional[tuple[List[Dict[str, str]], int]]:
        conn = self.db_manager.get_connection()
        row = conn.execute(
            "SELECT history_json, active_index FROM edit_history WHERE asset_id = ?;",
            (asset_id,),
        ).fetchone()
        if row is None:
            return None
        commands = json.loads(row["history_json"])
        if not isinstance(commands, list):
            raise ValueError(f"Invalid edit history for asset {asset_id}.")
        return commands, int(row["active_index"])

    def delete(self, asset_id: str) -> None:
        with self.db_manager.transaction() as conn:
            conn.execute("DELETE FROM edit_history WHERE asset_id = ?;", (asset_id,))


class CollectionRepository:
    """Persistence operations for Collections."""

    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager

    def save(self, collection: Collection) -> None:
        """Insert or update collection and its asset mappings."""
        collection.name = Collection._validate_name(collection.name)
        if collection.collection_type not in {"manual", "smart"}:
            raise ValueError("Unsupported collection type.")
        if collection.collection_type == "smart" and collection.asset_ids:
            raise ValueError("Smart collections cannot contain manual asset references.")
        collection.parent_id = Collection._validate_parent_id(collection.parent_id)
        rules_json = collection.rules.model_dump_json()
        with self.db_manager.transaction() as conn:
            if collection.parent_id is not None:
                parent = collection.parent_id
                visited: set[str] = set()
                while parent:
                    if parent == collection.id:
                        raise ValueError("A collection cannot be nested inside itself.")
                    if parent in visited:
                        raise ValueError("Collection hierarchy contains a cycle.")
                    visited.add(parent)
                    parent_row = conn.execute(
                        """
                        SELECT project_id, parent_id FROM collections WHERE id = ?;
                        """,
                        (parent,),
                    ).fetchone()
                    if not parent_row or parent_row["project_id"] != collection.project_id:
                        raise ValueError("Parent collection must belong to the same project.")
                    parent = parent_row["parent_id"]
            conn.execute(
                """
                INSERT INTO collections (
                    id, project_id, name, created_at, parent_id, collection_type, rules_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    parent_id = excluded.parent_id,
                    collection_type = excluded.collection_type,
                    rules_json = excluded.rules_json;
                """,
                (
                    collection.id,
                    collection.project_id,
                    collection.name,
                    collection.created_at,
                    collection.parent_id,
                    collection.collection_type,
                    rules_json,
                ),
            )
            if collection.collection_type == "manual":
                conn.execute(
                    """
                    DELETE FROM collection_assets
                    WHERE collection_id = ?
                      AND asset_id IN (
                          SELECT id FROM assets WHERE deleted_at IS NULL
                      );
                    """,
                    (collection.id,),
                )
                for asset_id in collection.asset_ids:
                    conn.execute(
                        """
                        INSERT INTO collection_assets (collection_id, asset_id)
                        SELECT ?, a.id FROM assets AS a
                        WHERE a.id = ? AND a.project_id = ?
                          AND a.deleted_at IS NULL;
                        """,
                        (collection.id, asset_id, collection.project_id),
                    )
            else:
                conn.execute(
                    "DELETE FROM collection_assets WHERE collection_id = ?;",
                    (collection.id,),
                )

    def list_by_project(self, project_id: str) -> List[Collection]:
        """Retrieve all collections in a project."""
        conn = self.db_manager.get_connection()
        cursor = conn.execute(
            """
            SELECT * FROM collections WHERE project_id = ?
            ORDER BY parent_id, name COLLATE NOCASE ASC, id ASC;
            """,
            (project_id,),
        )
        collections = []
        for row in cursor.fetchall():
            asset_ids = []
            if row["collection_type"] == "manual":
                asset_ids = [
                    asset_row["asset_id"]
                    for asset_row in conn.execute(
                        """
                        SELECT ca.asset_id
                        FROM collection_assets AS ca
                        JOIN assets AS a ON a.id = ca.asset_id
                        WHERE ca.collection_id = ? AND a.deleted_at IS NULL;
                        """,
                        (row["id"],),
                    ).fetchall()
                ]
            collections.append(self._row_to_collection(row, asset_ids))
        return collections

    def get_by_id(self, collection_id: str) -> Optional[Collection]:
        """Retrieve one collection, including manual membership when applicable."""
        conn = self.db_manager.get_connection()
        row = conn.execute(
            "SELECT * FROM collections WHERE id = ?;", (collection_id,)
        ).fetchone()
        if not row:
            return None
        asset_ids = []
        if row["collection_type"] == "manual":
            asset_ids = [
                asset_row["asset_id"]
                for asset_row in conn.execute(
                    """
                    SELECT ca.asset_id
                    FROM collection_assets AS ca
                    JOIN assets AS a ON a.id = ca.asset_id
                    WHERE ca.collection_id = ? AND a.deleted_at IS NULL;
                    """,
                    (collection_id,),
                ).fetchall()
            ]
        return self._row_to_collection(row, asset_ids)

    @staticmethod
    def _row_to_collection(row: Any, asset_ids: Optional[List[str]] = None) -> Collection:
        return Collection(
            id=row["id"],
            project_id=row["project_id"],
            name=row["name"],
            created_at=row["created_at"],
            asset_ids=asset_ids or [],
            parent_id=row["parent_id"],
            collection_type=row["collection_type"],
            rules=SmartCollectionRules.model_validate_json(row["rules_json"]),
        )

    def list_summaries_by_project(self, project_id: str) -> List[Dict[str, Any]]:
        """List collection names and counts without materializing every member ID."""
        conn = self.db_manager.get_connection()
        rows = conn.execute(
            """
            SELECT c.id, c.project_id, c.name, c.created_at, c.parent_id,
                   c.collection_type, c.rules_json,
                   COUNT(CASE WHEN c.collection_type = 'manual' THEN a.id END)
                       AS asset_count
            FROM collections AS c
            LEFT JOIN collection_assets AS ca ON ca.collection_id = c.id
            LEFT JOIN assets AS a ON a.id = ca.asset_id AND a.deleted_at IS NULL
            WHERE c.project_id = ?
            GROUP BY c.id
            ORDER BY c.name COLLATE NOCASE ASC, c.id ASC;
            """,
            (project_id,),
        ).fetchall()
        asset_repository = AssetRepository(self.db_manager)
        summaries = []
        for row in rows:
            rules = SmartCollectionRules.model_validate_json(row["rules_json"])
            asset_count = int(row["asset_count"])
            if row["collection_type"] == "smart":
                asset_count = asset_repository.count_filtered(
                    project_id, collection_id=row["id"]
                )
            summaries.append({
                "id": row["id"],
                "project_id": row["project_id"],
                "name": row["name"],
                "created_at": row["created_at"],
                "parent_id": row["parent_id"],
                "collection_type": row["collection_type"],
                "rules": rules.model_dump(mode="json"),
                "asset_count": asset_count,
            })
        return summaries

    def contains_asset(self, collection_id: str, asset_id: str, project_id: str) -> bool:
        """Check collection membership without loading the collection's asset IDs."""
        conn = self.db_manager.get_connection()
        collection = conn.execute(
            """
            SELECT collection_type, rules_json FROM collections
            WHERE id = ? AND project_id = ?;
            """,
            (collection_id, project_id),
        ).fetchone()
        if not collection:
            return False
        if collection["collection_type"] == "smart":
            asset_row = conn.execute(
                "SELECT * FROM assets WHERE id = ? AND project_id = ? AND deleted_at IS NULL;",
                (asset_id, project_id),
            ).fetchone()
            if not asset_row:
                return False
            rules = SmartCollectionRules.model_validate_json(
                collection["rules_json"]
            )
            return rules.matches(AssetRepository(self.db_manager)._row_to_asset(asset_row))
        if collection["collection_type"] != "manual":
            raise ValueError("Unsupported collection type in catalog.")
        row = conn.execute(
            """
            SELECT 1
            FROM collection_assets AS ca
            JOIN collections AS c ON c.id = ca.collection_id
            JOIN assets AS a ON a.id = ca.asset_id
            WHERE ca.collection_id = ? AND ca.asset_id = ? AND c.project_id = ?
              AND a.project_id = ? AND a.deleted_at IS NULL
            LIMIT 1;
            """,
            (collection_id, asset_id, project_id, project_id),
        ).fetchone()
        return row is not None


class PresetRepository:
    """Persistence operations for Presets."""

    def __init__(self, db_manager: DatabaseConnectionManager):
        self.db_manager = db_manager

    def save(self, preset: Preset) -> None:
        """Insert or update preset record."""
        with self.db_manager.transaction() as conn:
            conn.execute(
                """
                INSERT INTO presets (id, name, category, schema_version, parameters_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    category = excluded.category,
                    schema_version = excluded.schema_version,
                    parameters_json = excluded.parameters_json;
                """,
                (
                    preset.id,
                    preset.name,
                    preset.category,
                    preset.schema_version,
                    json.dumps(preset.parameters),
                    preset.created_at,
                ),
            )

    def list_all(self) -> List[Preset]:
        """Fetch all stored presets."""
        conn = self.db_manager.get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM presets ORDER BY category ASC, name ASC;")
        presets = []
        for row in cursor.fetchall():
            presets.append(
                Preset(
                    id=row["id"],
                    name=row["name"],
                    category=row["category"],
                    schema_version=row["schema_version"],
                    parameters=json.loads(row["parameters_json"]),
                    created_at=row["created_at"],
                )
            )
        return presets

    def delete(self, preset_id: str) -> None:
        """Delete preset record."""
        with self.db_manager.transaction() as conn:
            conn.execute("DELETE FROM presets WHERE id = ?;", (preset_id,))
