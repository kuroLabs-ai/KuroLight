import sqlite3
from pathlib import Path

import numpy as np
import pytest

from kurolight.app.command_dispatcher import (
    CommandDispatcher,
    EditStateSnapshotCommand,
)
from kurolight.domain.assets import ImageAsset
from kurolight.domain.collections import Collection
from kurolight.domain.editing import EditState
from kurolight.domain.metadata import AssetMetadataOverrides
from kurolight.domain.presets import Preset
from kurolight.infrastructure.database.connection import DatabaseConnectionManager
from kurolight.infrastructure.database.migrations import (
    MIGRATION_V1,
    MIGRATION_V2,
    apply_migrations,
)
from kurolight.processing.buffer import ImageBuffer
from kurolight.services.editing_service import EditingService
from kurolight.services.preset_service import PresetService
from kurolight.services.project_service import ProjectService


def _close(service):
    service.db_manager.close_thread_connection()


def _add_catalog_content(service, image_path):
    project = service.get_current_project()
    assert project is not None
    asset = ImageAsset.create(image_path, project.id)
    asset.rating = 4
    asset.flag = "flagged"
    asset.metadata = {"camera_model": "Test Camera"}
    asset.metadata_overrides = AssetMetadataOverrides(
        title="Catalog title",
        description="Catalog description",
        keywords=["one", "two"],
        copyright="KuroLight test",
    )
    service.asset_repo.save(asset)

    edits = EditState(asset_id=asset.id)
    edits.exposure.exposure = 1.25
    edits.custom_metadata["reviewed"] = True
    edits.create_snapshot("Reviewed")
    service.edit_state_repo.save(edits)

    collection = Collection.create(project.id, "Favorites")
    collection.add_asset(asset.id)
    service.collection_repo.save(collection)
    return project.id, asset.id, collection.id


def _assert_catalog_content(service, project_id, asset_id, collection_id):
    project = service.get_current_project()
    assert project is not None
    assert project.id == project_id

    asset = service.asset_repo.get_by_id(asset_id)
    assert asset is not None
    assert asset.rating == 4
    assert asset.flag == "flagged"
    assert asset.metadata["camera_model"] == "Test Camera"
    assert asset.metadata_overrides == AssetMetadataOverrides(
        title="Catalog title",
        description="Catalog description",
        keywords=["one", "two"],
        copyright="KuroLight test",
    )

    edits = service.edit_state_repo.get_by_asset_id(asset_id)
    assert edits is not None
    assert edits.asset_id == asset.id
    assert edits.exposure.exposure == 1.25
    assert edits.custom_metadata["reviewed"] is True
    assert edits.snapshots["Reviewed"]["exposure"]["exposure"] == 1.25

    collections = service.collection_repo.list_by_project(project_id)
    collection = next(item for item in collections if item.id == collection_id)
    assert collection.asset_ids == [asset_id]


def test_catalog_migration_is_idempotent(tmp_path):
    manager = DatabaseConnectionManager(tmp_path / "catalog.sqlite")
    connection = manager.get_connection()

    apply_migrations(connection)
    apply_migrations(connection)

    versions = connection.execute(
        "SELECT version FROM schema_migrations ORDER BY version"
    ).fetchall()
    assert [row["version"] for row in versions] == [1, 2, 3, 4, 5, 6, 7]
    indexes = {
        row["name"]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index';"
        ).fetchall()
    }
    assert {
        "idx_assets_project_gallery_name",
        "idx_assets_project_gallery_date",
        "idx_assets_project_gallery_rating",
        "idx_assets_project_gallery_size",
        "idx_assets_project_source_folder",
        "idx_assets_project_source_folder_binary",
        "idx_collections_project_parent_name",
        "idx_assets_project_deleted_at",
    } <= indexes
    manager.close_thread_connection()


def test_catalog_migrates_existing_v1_database():
    connection = sqlite3.connect(":memory:")
    try:
        connection.executescript(MIGRATION_V1)
        connection.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (1, 'existing');"
        )

        apply_migrations(connection)

        versions = connection.execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        ).fetchall()
        assert [row[0] for row in versions] == [1, 2, 3, 4, 5, 6, 7]
        assert connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'edit_history'"
        ).fetchone()
        indexes = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index';"
            ).fetchall()
        }
        assert "idx_assets_project_gallery_name" in indexes
    finally:
        connection.close()


def test_catalog_migrates_existing_v2_database_and_preserves_rows():
    connection = sqlite3.connect(":memory:")
    try:
        connection.executescript(MIGRATION_V1)
        connection.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (1, 'existing');"
        )
        connection.executescript(MIGRATION_V2)
        connection.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (2, 'existing');"
        )
        connection.execute(
            """
            INSERT INTO projects (id, name, created_at, updated_at, schema_version, settings_json)
            VALUES ('project', 'Existing', 'now', 'now', 1, '{}');
            """
        )
        connection.execute(
            """
            INSERT INTO assets (id, project_id, source_path, file_name, file_type)
            VALUES ('asset', 'project', 'photo.jpg', 'photo.jpg', 'jpg');
            """
        )
        connection.execute(
            """
            INSERT INTO collections (id, project_id, name, created_at)
            VALUES ('legacy-collection', 'project', 'Legacy', 'now');
            """
        )
        connection.execute(
            """
            INSERT INTO collection_assets (collection_id, asset_id)
            VALUES ('legacy-collection', 'asset');
            """
        )

        apply_migrations(connection)

        versions = connection.execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        ).fetchall()
        assert [row[0] for row in versions] == [1, 2, 3, 4, 5, 6, 7]
        assert connection.execute(
            "SELECT deleted_at FROM assets WHERE id = 'asset';"
        ).fetchone()[0] is None
        assert connection.execute(
            "SELECT file_name FROM assets WHERE id = 'asset';"
        ).fetchone()[0] == "photo.jpg"
        assert connection.execute(
            "SELECT source_folder FROM assets WHERE id = 'asset';"
        ).fetchone()[0] == "."
        collection_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(collections);")
        }
        assert {"parent_id", "collection_type", "rules_json"} <= collection_columns
        migrated_collection = connection.execute(
            """
            SELECT parent_id, collection_type, rules_json
            FROM collections WHERE id = 'legacy-collection';
            """
        ).fetchone()
        assert migrated_collection == (None, "manual", "{}")
        assert connection.execute(
            "SELECT asset_id FROM collection_assets WHERE collection_id = 'legacy-collection';"
        ).fetchone()[0] == "asset"
        indexes = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index';"
            ).fetchall()
        }
        assert "idx_assets_project_gallery_date" in indexes
        assert "idx_assets_project_gallery_rating" in indexes
        assert "idx_assets_project_gallery_size" in indexes
        assert "idx_assets_project_source_folder" in indexes
        assert "idx_assets_project_source_folder_binary" in indexes
    finally:
        connection.close()


def test_legacy_edit_state_defaults_new_fields_without_data_loss():
    legacy = EditState.model_validate_json(
        """
        {
          "schema_version": 1,
          "asset_id": "legacy-photo",
          "exposure": {"exposure": 1.25},
          "masks": [
            {
              "id": "legacy-mask",
              "name": "Legacy radial",
              "mask_type": "radial",
              "enabled": true,
              "inverted": false,
              "feather": 0.5,
              "opacity": 1.0,
              "exposure": 0.5,
              "contrast": 0.0,
              "temperature": 0.0,
              "saturation": 0.0,
              "clarity": 0.0,
              "geometry": {"cx": 0.4, "cy": 0.6, "rx": 0.2, "ry": 0.3}
            }
          ]
        }
        """
    )

    assert legacy.asset_id == "legacy-photo"
    assert legacy.exposure.exposure == 1.25
    assert legacy.lens_correction.distortion == 0
    assert legacy.masks[0].combine_mode.value == "replace"
    assert legacy.masks[0].geometry["cx"] == 0.4



def test_catalog_transaction_rolls_back_partial_writes(tmp_path):
    manager = DatabaseConnectionManager(tmp_path / "catalog.sqlite")
    connection = manager.get_connection()
    try:
        connection.execute("CREATE TABLE transaction_probe (value TEXT NOT NULL);")
        with pytest.raises(RuntimeError, match="abort transaction"), manager.transaction() as transaction:
            transaction.execute(
                "INSERT INTO transaction_probe (value) VALUES ('partial');"
            )
            raise RuntimeError("abort transaction")

        assert connection.execute("SELECT value FROM transaction_probe").fetchall() == []
    finally:
        manager.close_thread_connection()


def test_catalog_and_edit_state_survive_close_and_reopen(tmp_path):
    database_path = tmp_path / "catalog.sqlite"
    image_path = tmp_path / "photo.jpg"
    image_path.write_bytes(b"fixture")
    service = ProjectService.open_or_create_project(database_path)
    project_id, asset_id, collection_id = _add_catalog_content(service, image_path)
    _close(service)

    reopened = ProjectService.open_or_create_project(database_path)
    try:
        _assert_catalog_content(reopened, project_id, asset_id, collection_id)
    finally:
        _close(reopened)


def test_preview_rebuild_after_reopen_uses_matching_asset_and_saved_edits(tmp_path):
    class Processor:
        def decode(self, path):
            source_value = 0.2 if Path(path).name == "first.jpg" else 0.4
            return ImageBuffer.from_numpy(
                np.full((2, 2, 3), source_value, dtype=np.float32)
            )

        def create_preview(self, image, max_edge):
            return image

        def process(self, source, state):
            result = source.clone()
            result.data += state.exposure.exposure / 10
            return result

    database_path = tmp_path / "catalog.sqlite"
    first_path = tmp_path / "first.jpg"
    second_path = tmp_path / "second.jpg"
    first_path.write_bytes(b"first")
    second_path.write_bytes(b"second")
    service = ProjectService.open_or_create_project(database_path)
    project = service.get_current_project()
    assert project is not None
    first_asset = ImageAsset.create(first_path, project.id)
    second_asset = ImageAsset.create(second_path, project.id)
    service.asset_repo.save(first_asset)
    service.asset_repo.save(second_asset)

    first_state = EditState(asset_id=first_asset.id)
    first_state.exposure.exposure = 1.0
    service.edit_state_repo.save(first_state)
    second_state = EditState(asset_id=second_asset.id)
    second_state.exposure.exposure = 2.0
    service.edit_state_repo.save(second_state)
    _close(service)

    reopened = ProjectService.open_or_create_project(database_path)
    try:
        editing_service = EditingService(reopened.edit_state_repo, processor=Processor())
        first_preview = editing_service.render_preview(
            first_asset.id,
            first_path,
            editing_service.get_edit_state(first_asset.id),
        )
        second_preview = editing_service.render_preview(
            second_asset.id,
            second_path,
            editing_service.get_edit_state(second_asset.id),
        )
        np.testing.assert_allclose(first_preview.data, 0.3)
        np.testing.assert_allclose(second_preview.data, 0.6)
        assert first_asset.id != second_asset.id
    finally:
        _close(reopened)


def test_undo_redo_history_survives_reopen_per_asset(tmp_path):
    database_path = tmp_path / "catalog.sqlite"
    first_path = tmp_path / "first.jpg"
    second_path = tmp_path / "second.jpg"
    first_path.write_bytes(b"first")
    second_path.write_bytes(b"second")
    service = ProjectService.open_or_create_project(database_path)
    project = service.get_current_project()
    assert project is not None
    first_asset = ImageAsset.create(first_path, project.id)
    second_asset = ImageAsset.create(second_path, project.id)
    service.asset_repo.save(first_asset)
    service.asset_repo.save(second_asset)

    before = EditState(asset_id=first_asset.id)
    middle = before.model_copy(deep=True)
    middle.exposure.exposure = 1.0
    after = middle.model_copy(deep=True)
    after.exposure.exposure = 2.0
    dispatcher = CommandDispatcher()
    dispatcher.execute_command(
        EditStateSnapshotCommand(before, middle, "First adjustment"), middle
    )
    dispatcher.execute_command(
        EditStateSnapshotCommand(middle, after, "Second adjustment"), after
    )
    dispatcher.undo(after)
    commands, active_index = dispatcher.serialize_history()
    service.edit_history_repo.save(first_asset.id, commands, active_index)

    second_before = EditState(asset_id=second_asset.id)
    second_after = second_before.model_copy(deep=True)
    second_after.white_balance.temperature = 35
    second_dispatcher = CommandDispatcher()
    second_dispatcher.execute_command(
        EditStateSnapshotCommand(second_before, second_after, "Warm second photo"),
        second_before,
    )
    second_commands, second_active_index = second_dispatcher.serialize_history()
    service.edit_history_repo.save(
        second_asset.id, second_commands, second_active_index
    )
    _close(service)

    reopened = ProjectService.open_or_create_project(database_path)
    try:
        restored = CommandDispatcher()
        stored_history = reopened.edit_history_repo.get_by_asset_id(first_asset.id)
        assert stored_history is not None
        restored.restore_history(*stored_history)
        assert restored.get_history_list() == [
            "First adjustment",
            "Second adjustment",
        ]
        assert restored.active_index == 0
        assert restored.can_undo
        assert restored.can_redo

        undone_state = restored.undo(middle)
        assert undone_state.exposure.exposure == 0
        redone_state = restored.redo(undone_state)
        assert redone_state.exposure.exposure == 1.0
        redone_state = restored.redo(redone_state)
        assert redone_state.exposure.exposure == 2.0

        stored_second_history = reopened.edit_history_repo.get_by_asset_id(
            second_asset.id
        )
        assert stored_second_history is not None
        restored_second = CommandDispatcher()
        restored_second.restore_history(*stored_second_history)
        assert restored_second.get_history_list() == ["Warm second photo"]
        second_undone = restored_second.undo(second_after)
        assert second_undone.asset_id == second_asset.id
        assert second_undone.white_balance.temperature == 0
        second_redone = restored_second.redo(second_undone)
        assert second_redone.white_balance.temperature == 35

        assert redone_state.asset_id == first_asset.id
        assert restored_second.active_index == 0
    finally:
        _close(reopened)


def test_custom_preset_persists_and_applies_to_another_asset(tmp_path):
    database_path = tmp_path / "catalog.sqlite"
    service = ProjectService.open_or_create_project(database_path)
    try:
        source_state = EditState(asset_id="source-photo")
        source_state.exposure.exposure = 1.5
        source_state.lens_correction.distortion = 24
        source_state.lens_correction.vignette = 35
        preset_service = PresetService(service.preset_repo)
        preset = preset_service.create_preset_from_edit_state(
            "My optical look", "User", source_state
        )
        preset_id = preset.id
    finally:
        _close(service)

    reopened = ProjectService.open_or_create_project(database_path)
    try:
        stored = next(
            item
            for item in reopened.preset_repo.list_all()
            if item.id == preset_id
        )
        assert stored.name == "My optical look"
        assert stored.parameters["lens_correction"] == {
            "distortion": 24,
            "chromatic_aberration": 0,
            "vignette": 35,
        }

        target = EditState(asset_id="target-photo")
        target.white_balance.temperature = -12
        applied = PresetService(reopened.preset_repo).apply_preset(stored, target)

        assert applied.asset_id == "target-photo"
        assert applied.exposure.exposure == 1.5
        assert applied.lens_correction.distortion == 24
        assert applied.lens_correction.vignette == 35
        assert applied.white_balance.temperature == 0
        assert target.white_balance.temperature == -12
        assert target.lens_correction.distortion == 0

        updated = Preset(
            id=stored.id,
            name=stored.name,
            category=stored.category,
            parameters={"exposure": {"exposure": 2.0}},
            schema_version=stored.schema_version + 1,
            created_at=stored.created_at,
        )
        reopened.preset_repo.save(updated)
        round_tripped = next(
            item
            for item in reopened.preset_repo.list_all()
            if item.id == preset_id
        )
        assert round_tripped.schema_version == updated.schema_version
        assert round_tripped.parameters == {"exposure": {"exposure": 2.0}}
    finally:
        _close(reopened)


def test_catalog_backup_is_integrity_checked_and_reopens(tmp_path):
    database_path = tmp_path / "catalog.sqlite"
    backup_path = tmp_path / "backups" / "catalog-backup.sqlite"
    image_path = tmp_path / "photo.jpg"
    image_path.write_bytes(b"fixture")
    service = ProjectService.open_or_create_project(database_path)
    project_id, asset_id, collection_id = _add_catalog_content(service, image_path)

    created_backup = service.backup_catalog(backup_path)

    assert created_backup == backup_path
    assert backup_path.is_file()
    connection = sqlite3.connect(backup_path)
    try:
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    finally:
        connection.close()

    backup_service = ProjectService.open_or_create_project(backup_path)
    try:
        _assert_catalog_content(backup_service, project_id, asset_id, collection_id)
        with pytest.raises(FileExistsError, match="already exists"):
            service.backup_catalog(backup_path)
        with pytest.raises(ValueError, match="must differ"):
            service.backup_catalog(database_path)
    finally:
        _close(backup_service)
        _close(service)
