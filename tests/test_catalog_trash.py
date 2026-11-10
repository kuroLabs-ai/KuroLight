import json
from types import SimpleNamespace

import pytest

from kurolight.domain.assets import ImageAsset
from kurolight.domain.collections import Collection, SmartCollectionRules
from kurolight.domain.editing import EditState
from kurolight.services.library_service import LibraryService
from kurolight.services.project_service import ProjectService
from kurolight.ui.web_bridge import PyBridge


def test_trash_restore_and_permanent_delete_preserve_source_files(tmp_path):
    service = ProjectService.open_or_create_project(tmp_path / "catalog.sqlite")
    project = service.get_current_project()
    assert project is not None
    try:
        source_path = tmp_path / "photos" / "photo.jpg"
        source_path.parent.mkdir()
        source_path.write_bytes(b"source image bytes")
        sidecar_path = source_path.with_suffix(".xmp")
        sidecar_path.write_bytes(b"sidecar bytes")

        asset = ImageAsset.create(source_path, project.id)
        asset.rating = 5
        asset.metadata = {"camera_model": "Test Camera"}
        service.asset_repo.save(asset)
        edit_state = EditState(asset_id=asset.id)
        edit_state.exposure.exposure = 1.5
        service.edit_state_repo.save(edit_state)

        manual_collection = Collection.create(project.id, "Favorites")
        manual_collection.add_asset(asset.id)
        service.collection_repo.save(manual_collection)
        smart_collection = Collection.create_smart(
            project.id, "Five Stars", SmartCollectionRules(minimum_rating=5)
        )
        service.collection_repo.save(smart_collection)

        library = LibraryService(
            service.asset_repo,
            service.edit_state_repo,
            service.collection_repo,
        )
        selected_events = []
        bridge = PyBridge.__new__(PyBridge)
        bridge.app_state = SimpleNamespace(
            current_project=project,
            set_active_asset=lambda _asset: None,
            set_current_edit_state=lambda _state: None,
        )
        bridge.library_service = library
        bridge._push_assets = lambda: []
        bridge._push_collections = lambda: None
        bridge._push_trash_count = lambda: None
        bridge.asset_selected = SimpleNamespace(
            emit=lambda *args: selected_events.append(args)
        )
        bridge.notification = SimpleNamespace(emit=lambda *_args: None)

        with pytest.raises(KeyError, match="Trashed asset not found"):
            library.permanently_delete_asset(asset.id, project.id)

        with pytest.raises(KeyError, match="Active asset not found"):
            library.move_assets_to_trash([asset.id, "missing"], project.id)
        assert service.asset_repo.get_by_id(asset.id) is not None
        bridge.delete_assets(json.dumps([asset.id]))
        assert selected_events == [("null", "null")]

        trashed = service.asset_repo.get_by_id(asset.id, include_deleted=True)
        assert trashed is not None
        assert trashed.deleted_at
        assert service.asset_repo.get_by_id(asset.id) is None
        assert service.asset_repo.list_by_project(project.id) == []
        assert service.asset_repo.count_by_project(project.id) == 0
        assert service.asset_repo.count_trashed(project.id) == 1
        assert service.asset_repo.list_source_folders(project.id, 0, 10) == ([], 0)
        assert service.asset_repo.list_filtered_page(
            project.id, 0, 10, trash_only=True
        )[0].id == asset.id
        assert service.asset_repo.list_filtered_ids(
            project.id, trash_only=True
        ) == [asset.id]
        assert service.asset_repo.get_by_source_path(source_path.resolve()).id == asset.id
        assert library.import_file(source_path, project.id).id == asset.id
        assert service.asset_repo.count_trashed(project.id) == 1
        stored_manual = service.collection_repo.get_by_id(manual_collection.id)
        assert stored_manual is not None
        assert stored_manual.asset_ids == []
        service.collection_repo.save(stored_manual)
        assert service.db_manager.get_connection().execute(
            "SELECT COUNT(*) FROM collection_assets WHERE collection_id = ?;",
            (manual_collection.id,),
        ).fetchone()[0] == 1
        summaries = service.collection_repo.list_summaries_by_project(project.id)
        assert {item["name"]: item["asset_count"] for item in summaries} == {
            "Favorites": 0,
            "Five Stars": 0,
        }
        assert service.edit_state_repo.get_by_asset_id(asset.id) is not None

        page = json.loads(
            bridge.get_asset_page(0, 10, json.dumps({"trash_only": True}))
        )
        assert page["total"] == 1
        assert page["assets"][0]["id"] == asset.id
        assert page["assets"][0]["deleted_at"] == trashed.deleted_at
        assert json.loads(bridge.get_asset_ids('{"trash_only": true}')) == [asset.id]

        bridge.restore_assets(json.dumps([asset.id]))
        restored = service.asset_repo.get_by_id(asset.id)
        assert restored is not None
        assert restored.deleted_at is None
        assert service.asset_repo.count_by_project(project.id) == 1
        assert service.asset_repo.count_trashed(project.id) == 0
        assert service.collection_repo.get_by_id(manual_collection.id).asset_ids == [
            asset.id
        ]
        assert {
            item["name"]: item["asset_count"]
            for item in service.collection_repo.list_summaries_by_project(project.id)
        } == {"Favorites": 1, "Five Stars": 1}
        assert service.edit_state_repo.get_by_asset_id(asset.id).exposure.exposure == 1.5

        bridge.delete_assets(json.dumps([asset.id]))
        bridge.permanently_delete_assets(json.dumps([asset.id]))
        assert service.asset_repo.get_by_id(asset.id, include_deleted=True) is None
        assert service.edit_state_repo.get_by_asset_id(asset.id) is None
        assert service.asset_repo.count_trashed(project.id) == 0
        assert source_path.read_bytes() == b"source image bytes"
        assert sidecar_path.read_bytes() == b"sidecar bytes"
    finally:
        service.db_manager.close_thread_connection()


def test_trash_filter_requires_a_boolean(tmp_path):
    service = ProjectService.open_or_create_project(tmp_path / "catalog.sqlite")
    try:
        with pytest.raises(ValueError, match="Trash-only filter"):
            service.asset_repo.count_filtered(service.get_current_project().id, trash_only=1)
    finally:
        service.db_manager.close_thread_connection()
