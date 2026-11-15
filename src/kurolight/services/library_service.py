"""Enhanced service handling asset ingestion, metadata extraction, collections, and catalog filtering."""

import hashlib
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, List, Optional

from PySide6.QtGui import QPixmap

from kurolight.domain.assets import ImageAsset, source_folder_from_path
from kurolight.domain.collections import Collection, SmartCollectionRules
from kurolight.domain.editing import EditState
from kurolight.domain.metadata import AssetMetadataOverrides
from kurolight.infrastructure.cache.thumbnail_cache import ThumbnailCache
from kurolight.infrastructure.database.repository import (
    AssetRepository,
    CollectionRepository,
    EditStateRepository,
)
from kurolight.infrastructure.logging import get_logger
from kurolight.infrastructure.metadata.extractor import MetadataExtractor
from kurolight.infrastructure.metadata.sidecar import MetadataSidecarManager

logger = get_logger("services.library")

@dataclass
class ImportFailure:
    path: Path
    message: str


@dataclass
class ImportBatchResult:
    imported: List[ImageAsset] = field(default_factory=list)
    duplicates: List[ImageAsset] = field(default_factory=list)
    failures: List[ImportFailure] = field(default_factory=list)
    cancelled: bool = False


SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp", ".bmp", ".gif", ".ico",
    ".ppm", ".pgm", ".pbm", ".pnm", ".dng", ".cr2", ".cr3", ".nef", ".arw",
    ".orf", ".rw2", ".pef", ".raf", ".srw"
}


class LibraryService:
    """Coordinates image asset ingestion, EXIF extraction, collections, and querying."""

    def __init__(
        self,
        asset_repo: AssetRepository,
        edit_state_repo: EditStateRepository,
        collection_repo: Optional[CollectionRepository] = None,
        thumbnail_cache: Optional[ThumbnailCache] = None,
        import_settings: Any = None,
    ):
        self.asset_repo = asset_repo
        self.edit_state_repo = edit_state_repo
        self.collection_repo = collection_repo
        self.thumbnail_cache = thumbnail_cache or ThumbnailCache()
        self.import_settings = import_settings

    def import_file(
        self,
        file_path: Path,
        project_id: Optional[str] = None,
        hash_index: Optional[dict[str, ImageAsset]] = None,
    ) -> ImageAsset:
        """Ingest single image file, extract comprehensive EXIF, and persist asset record."""
        path = Path(file_path).resolve()
        if not path.is_file():
            raise FileNotFoundError(f"Image file does not exist: {path}")
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            raise ValueError(f"Unsupported image type: {path.suffix or '(no extension)'}")

        existing = self.asset_repo.get_by_source_path(path)
        if existing:
            return existing
        if self.import_settings and self.import_settings.duplicate_detection == "hash":
            digest = self._file_sha256(path)
            index = hash_index if hash_index is not None else self._build_hash_index(project_id)
            duplicate = index.get(digest)
            if duplicate:
                return duplicate

        asset = ImageAsset.create(source_path=path, project_id=project_id)

        # High-fidelity metadata extraction
        meta = MetadataExtractor.extract(path)
        if meta.width <= 0 or meta.height <= 0:
            raise ValueError(f"Could not read valid image dimensions: {path}")
        asset.width = meta.width
        asset.height = meta.height
        asset.file_size = meta.file_size_bytes
        asset.date_captured = meta.date_captured
        asset.metadata = meta.to_dict()
        if self.import_settings:
            asset.metadata_overrides = AssetMetadataOverrides(
                creator=self.import_settings.default_creator,
                copyright=self.import_settings.default_copyright,
                usage_terms=self.import_settings.default_usage_terms,
            )

        self.asset_repo.save(asset)

        try:
            if not self.edit_state_repo.get_by_asset_id(asset.id):
                self.edit_state_repo.save(EditState(asset_id=asset.id))
        except Exception:
            self.asset_repo.delete(asset.id)
            raise

        try:
            self.thumbnail_cache.generate_thumbnail(path)
        except Exception:
            logger.exception("Could not generate thumbnail for imported asset %s", path)

        logger.info("Imported asset: %s (%s)", asset.file_name, asset.id)
        return asset

    @staticmethod
    def _file_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as image_file:
            for chunk in iter(lambda: image_file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _build_hash_index(self, project_id: Optional[str]) -> dict[str, ImageAsset]:
        """Hash existing assets once before a hash-based batch import."""
        index: dict[str, ImageAsset] = {}
        for asset in self.get_assets(project_id):
            try:
                if asset.source_path.is_file():
                    index.setdefault(self._file_sha256(asset.source_path), asset)
            except OSError:
                logger.warning("Could not hash existing image %s", asset.source_path, exc_info=True)
        return index

    def import_files(
        self,
        file_paths: Iterable[Path],
        project_id: Optional[str] = None,
        cancel_event: Optional[threading.Event] = None,
    ) -> ImportBatchResult:
        """Import each path independently, retaining successes if other files fail."""
        result = ImportBatchResult()
        hash_index = (
            self._build_hash_index(project_id)
            if self.import_settings
            and self.import_settings.duplicate_detection == "hash"
            else None
        )
        for file_path in file_paths:
            if cancel_event and cancel_event.is_set():
                result.cancelled = True
                break

            path = Path(file_path).resolve()
            try:
                existing = self.asset_repo.get_by_source_path(path)
                if existing:
                    result.duplicates.append(existing)
                    continue
                digest = self._file_sha256(path) if hash_index is not None else None
                duplicate = hash_index.get(digest) if hash_index is not None else None
                if duplicate:
                    result.duplicates.append(duplicate)
                    continue
                asset = self.import_file(
                    path, project_id=project_id, hash_index=hash_index
                )
                if asset:
                    result.imported.append(asset)
                    if hash_index is not None and digest is not None:
                        hash_index[digest] = asset
            except Exception as exc:
                logger.exception("Could not import image %s", path)
                result.failures.append(ImportFailure(path=path, message=str(exc)))

        if cancel_event and cancel_event.is_set():
            result.cancelled = True
        return result

    def import_directory(
        self,
        dir_path: Path,
        project_id: Optional[str] = None,
        cancel_event: Optional[threading.Event] = None,
    ) -> ImportBatchResult:
        """Recursively scan a directory, reporting failures and honoring cancellation."""
        dir_path = Path(dir_path).resolve()
        if not dir_path.is_dir():
            return ImportBatchResult(
                failures=[ImportFailure(dir_path, "Folder does not exist or is not accessible.")]
            )

        failures: List[ImportFailure] = []

        def image_paths():
            def on_walk_error(error: OSError) -> None:
                failures.append(
                    ImportFailure(Path(error.filename or dir_path), str(error))
                )

            for root, directories, filenames in os.walk(
                dir_path, onerror=on_walk_error
            ):
                if cancel_event and cancel_event.is_set():
                    break
                directories.sort()
                for filename in sorted(filenames):
                    path = Path(root) / filename
                    if path.suffix.lower() in SUPPORTED_EXTENSIONS:
                        yield path

        result = self.import_files(image_paths(), project_id, cancel_event)
        result.failures[0:0] = failures
        logger.info(
            "Imported %d images from %s (%d duplicates, %d failures)",
            len(result.imported),
            dir_path,
            len(result.duplicates),
            len(result.failures),
        )
        return result

    def get_assets(self, project_id: Optional[str] = None) -> List[ImageAsset]:
        """List all registered assets."""
        return self.asset_repo.list_by_project(project_id)

    def filter_assets(
        self,
        project_id: Optional[str] = None,
        query: str = "",
        min_rating: int = 0,
        flag_filter: str = "all",  # "all", "flagged", "unflagged", "rejected"
        collection_id: Optional[str] = None,
        source_folder: Optional[str] = None,
        sort_by: str = "file_name",  # "file_name", "date_captured", "rating", "file_size"
        ascending: bool = True,
        trash_only: bool = False,
    ) -> List[ImageAsset]:
        """Filter and sort catalog assets according to user criteria."""
        all_assets = self.asset_repo.list_by_project(
            project_id, include_deleted=trash_only
        )
        all_assets = [asset for asset in all_assets if bool(asset.deleted_at) == trash_only]
        filtered: List[ImageAsset] = []

        # Collection mapping if specified
        collection_asset_ids = None
        smart_rules = None
        if collection_id and self.collection_repo:
            collection = self.collection_repo.get_by_id(collection_id)
            if not collection or (
                project_id is not None and collection.project_id != project_id
            ):
                return []
            if collection.collection_type == "smart":
                smart_rules = collection.rules
            else:
                collection_asset_ids = set(collection.asset_ids)

        query_clean = query.strip().lower()

        for a in all_assets:
            # Collection check
            if collection_asset_ids is not None and a.id not in collection_asset_ids:
                continue
            if smart_rules is not None and not smart_rules.matches(a):
                continue

            if source_folder is not None and source_folder_from_path(a.source_path) != source_folder:
                continue

            # Rating check
            if a.rating < min_rating:
                continue

            # Flag check
            if flag_filter != "all" and a.flag != flag_filter:
                continue

            # Query check
            if query_clean:
                extracted = a.metadata if isinstance(a.metadata, dict) else {}
                overrides = a.metadata_overrides
                searchable_values = [
                    a.file_name,
                    str(extracted.get("camera_model") or ""),
                    str(extracted.get("lens_model") or ""),
                    overrides.title,
                    overrides.description,
                    overrides.copyright,
                    *overrides.keywords,
                ]
                if not any(query_clean in value.casefold() for value in searchable_values):
                    continue

            filtered.append(a)

        # Sort
        def sort_key(asset: ImageAsset):
            if sort_by == "date_captured":
                return asset.date_captured or ""
            elif sort_by == "rating":
                return asset.rating
            elif sort_by == "file_size":
                return asset.file_size or 0
            else:
                return asset.file_name.lower()

        filtered.sort(key=sort_key, reverse=not ascending)
        return filtered

    def get_thumbnail(self, asset: ImageAsset, size: int = 256) -> Optional[QPixmap]:
        """Retrieve cached thumbnail for asset."""
        return self.thumbnail_cache.get_thumbnail(asset.source_path, size=size)

    def get_thumbnail_bytes(self, asset: ImageAsset, size: int = 256) -> Optional[bytes]:
        """Retrieve cached JPEG thumbnail bytes for web clients."""
        return self.thumbnail_cache.get_thumbnail_bytes(asset.source_path, size=size)

    # ------------------ Collection Management ------------------

    def create_collection(
        self, project_id: str, name: str, parent_id: Optional[str] = None
    ) -> Optional[Collection]:
        """Create new named collection in catalog."""
        if not self.collection_repo:
            return None
        coll = Collection.create(
            project_id=project_id, name=name, parent_id=parent_id
        )
        self.collection_repo.save(coll)
        return coll

    def create_smart_collection(
        self,
        project_id: str,
        name: str,
        rules: SmartCollectionRules,
        parent_id: Optional[str] = None,
    ) -> Optional[Collection]:
        """Create a dynamic catalog collection with validated matching rules."""
        if not self.collection_repo:
            return None
        coll = Collection.create_smart(
            project_id=project_id,
            name=name,
            rules=rules,
            parent_id=parent_id,
        )
        self.collection_repo.save(coll)
        return coll

    def update_smart_collection(
        self,
        collection_id: str,
        name: str,
        rules: SmartCollectionRules,
        project_id: str,
    ) -> Collection:
        """Update a smart collection's name and dynamic matching rules."""
        if not self.collection_repo:
            raise RuntimeError("Collection storage is not available.")
        collection = self.collection_repo.get_by_id(collection_id)
        if (
            not collection
            or collection.project_id != project_id
            or collection.collection_type != "smart"
        ):
            raise ValueError("Smart collection does not exist.")
        collection.name = Collection._validate_name(name)
        collection.rules = rules
        self.collection_repo.save(collection)
        return collection

    def list_collections(self, project_id: str) -> List[Collection]:
        """Fetch all collections within project."""
        if not self.collection_repo:
            return []
        return self.collection_repo.list_by_project(project_id)

    def rename_collection(self, collection_id: str, new_name: str) -> None:
        """Rename an existing collection."""
        if self.collection_repo and new_name.strip():
            conn = self.collection_repo.db_manager.get_connection()
            with self.collection_repo.db_manager.transaction():
                conn.execute(
                    "UPDATE collections SET name = ? WHERE id = ?;",
                    (new_name.strip(), collection_id),
                )

    def add_asset_to_collection(self, collection_id: str, asset_id: str) -> None:
        """Add asset reference to collection."""
        if self.collection_repo:
            conn = self.collection_repo.db_manager.get_connection()
            with self.collection_repo.db_manager.transaction():
                self._require_manual_collection(conn, collection_id)
                conn.execute(
                    """
                    INSERT OR IGNORE INTO collection_assets (collection_id, asset_id)
                    SELECT ?, a.id FROM assets AS a
                    JOIN collections AS c ON c.id = ?
                    WHERE a.id = ? AND a.project_id = c.project_id
                      AND a.deleted_at IS NULL;
                    """,
                    (collection_id, collection_id, asset_id),
                )

    def batch_add_to_collection(self, collection_id: str, asset_ids: List[str]) -> None:
        """Add multiple asset references to collection in a single transaction."""
        if self.collection_repo and asset_ids:
            conn = self.collection_repo.db_manager.get_connection()
            with self.collection_repo.db_manager.transaction():
                project_id = self._require_manual_collection(conn, collection_id)
                for aid in asset_ids:
                    conn.execute(
                        """
                        INSERT OR IGNORE INTO collection_assets (collection_id, asset_id)
                        SELECT ?, a.id FROM assets AS a
                        WHERE a.id = ? AND a.project_id = ?
                          AND a.deleted_at IS NULL;
                        """,
                        (collection_id, aid, project_id),
                    )

    def remove_asset_from_collection(self, collection_id: str, asset_id: str) -> None:
        """Remove asset reference from collection."""
        if self.collection_repo:
            conn = self.collection_repo.db_manager.get_connection()
            with self.collection_repo.db_manager.transaction():
                self._require_manual_collection(conn, collection_id)
                conn.execute(
                    "DELETE FROM collection_assets WHERE collection_id = ? AND asset_id = ?;",
                    (collection_id, asset_id),
                )

    def batch_remove_from_collection(self, collection_id: str, asset_ids: List[str]) -> None:
        """Remove multiple asset references from collection in a single transaction."""
        if self.collection_repo and asset_ids:
            conn = self.collection_repo.db_manager.get_connection()
            with self.collection_repo.db_manager.transaction():
                self._require_manual_collection(conn, collection_id)
                placeholders = ",".join("?" for _ in asset_ids)
                conn.execute(
                    f"DELETE FROM collection_assets WHERE collection_id = ? AND asset_id IN ({placeholders});",
                    [collection_id] + list(asset_ids),
                )

    def delete_collection(self, collection_id: str) -> None:
        """Delete collection and its references."""
        if self.collection_repo:
            conn = self.collection_repo.db_manager.get_connection()
            with self.collection_repo.db_manager.transaction():
                conn.execute(
                    "UPDATE collections SET parent_id = NULL WHERE parent_id = ?;",
                    (collection_id,),
                )
                conn.execute("DELETE FROM collection_assets WHERE collection_id = ?;", (collection_id,))
                conn.execute("DELETE FROM collections WHERE id = ?;", (collection_id,))

    @staticmethod
    def _require_manual_collection(conn: Any, collection_id: str) -> str:
        row = conn.execute(
            "SELECT project_id, collection_type FROM collections WHERE id = ?;",
            (collection_id,),
        ).fetchone()
        if not row:
            raise ValueError("Collection does not exist.")
        if row["collection_type"] != "manual":
            raise ValueError("Smart collection membership is determined by its rules.")
        return row["project_id"]

    # ------------------ Rating & Batch Operations ------------------

    def update_rating(self, asset_id: str, rating: int) -> Optional[ImageAsset]:
        """Set star rating (0 to 5) for asset."""
        asset = self.asset_repo.get_by_id(asset_id)
        if asset:
            asset.set_rating(rating)
            self.asset_repo.save(asset)
        return asset

    def update_flag(self, asset_id: str, flag: str) -> Optional[ImageAsset]:
        """Set flag state ('unflagged', 'flagged', 'rejected')."""
        asset = self.asset_repo.get_by_id(asset_id)
        if asset:
            asset.set_flag(flag)
            self.asset_repo.save(asset)
        return asset

    def update_metadata_overrides(
        self, asset_id: str, overrides: AssetMetadataOverrides
    ) -> ImageAsset:
        """Update catalog-only metadata without rewriting source EXIF or sidecars."""
        return self.asset_repo.update_metadata_overrides(asset_id, overrides)

    def export_metadata_sidecar(
        self,
        asset_id: str,
        overrides: AssetMetadataOverrides | dict[str, Any] | None = None,
        *,
        conflict: str = "error",
    ) -> str:
        """Explicitly export the asset's catalog-only metadata to an adjacent KuroLight sidecar."""
        asset = self.asset_repo.get_by_id(asset_id)
        if asset is None:
            raise ValueError(f"Asset {asset_id} does not exist.")
        metadata = overrides if overrides is not None else asset.metadata_overrides
        result = MetadataSidecarManager.export_metadata(asset.source_path, metadata, conflict=conflict)
        asset.metadata_overrides = result.metadata
        self.asset_repo.save(asset)
        return str(result.sidecar_path)

    def import_metadata_sidecar(
        self,
        asset_id: str,
    ) -> AssetMetadataOverrides:
        """Read the explicit KuroLight metadata sidecar for an asset, if present."""
        asset = self.asset_repo.get_by_id(asset_id)
        if asset is None:
            raise ValueError(f"Asset {asset_id} does not exist.")
        result = MetadataSidecarManager.import_metadata(asset.source_path)
        if result.metadata:
            asset.metadata_overrides = result.metadata
            self.asset_repo.save(asset)
        return result.metadata

    def batch_set_rating(self, asset_ids: List[str], rating: int) -> None:
        """Set rating for multiple assets at once."""
        for aid in asset_ids:
            self.update_rating(aid, rating)

    def batch_set_flag(self, asset_ids: List[str], flag: str) -> None:
        """Set flag state for multiple assets at once."""
        for aid in asset_ids:
            self.update_flag(aid, flag)

    def delete_asset(
        self, asset_id: str, project_id: Optional[str] = None
    ) -> None:
        """Move an asset to recoverable catalog trash without modifying source files."""
        self.move_assets_to_trash([asset_id], project_id)

    def move_assets_to_trash(
        self, asset_ids: List[str], project_id: Optional[str] = None
    ) -> None:
        self.asset_repo.move_many_to_trash(asset_ids, project_id)

    def restore_asset(
        self, asset_id: str, project_id: Optional[str] = None
    ) -> None:
        """Restore a trashed asset and its existing catalog relationships."""
        self.restore_assets([asset_id], project_id)

    def restore_assets(
        self, asset_ids: List[str], project_id: Optional[str] = None
    ) -> None:
        self.asset_repo.restore_many(asset_ids, project_id)

    def permanently_delete_asset(
        self, asset_id: str, project_id: Optional[str] = None
    ) -> None:
        """Permanently remove a trashed catalog record, never its source files."""
        self.permanently_delete_assets([asset_id], project_id)

    def permanently_delete_assets(
        self, asset_ids: List[str], project_id: Optional[str] = None
    ) -> None:
        self.asset_repo.permanently_delete_many(asset_ids, project_id)
