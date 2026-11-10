import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from kurolight.domain.assets import ImageAsset, source_folder_from_path
from kurolight.domain.collections import Collection, SmartCollectionRules
from kurolight.domain.metadata import AssetMetadataOverrides
from kurolight.services.library_service import LibraryService
from kurolight.services.project_service import ProjectService
from kurolight.ui.web_bridge import PyBridge


def _create_catalog(tmp_path, filenames):
    service = ProjectService.open_or_create_project(tmp_path / "catalog.sqlite")
    project = service.get_current_project()
    assert project is not None
    for filename in filenames:
        service.asset_repo.save(
            ImageAsset.create(tmp_path / filename, project.id)
        )
    return service, project


def test_asset_repository_returns_stable_bounded_pages_and_total(tmp_path):
    service, project = _create_catalog(
        tmp_path, ["b.jpg", "A.jpg", "a.jpg", "c.jpg"]
    )
    try:
        expected = sorted(
            service.asset_repo.list_by_project(project.id),
            key=lambda asset: (asset.file_name.casefold(), asset.id),
        )
        first_page = service.asset_repo.list_page(project.id, 0, 2)
        second_page = service.asset_repo.list_page(project.id, 2, 2)

        assert [asset.id for asset in first_page + second_page] == [
            asset.id for asset in expected
        ]
        assert len({asset.id for asset in first_page + second_page}) == 4
        assert service.asset_repo.count_by_project(project.id) == 4
    finally:
        service.db_manager.close_thread_connection()


def test_asset_page_ordering_uses_project_gallery_indexes(tmp_path):
    service, project = _create_catalog(
        tmp_path, ["first.jpg", "second.jpg", "third.jpg"]
    )
    queries = {
        "file_name": """
            SELECT a.* FROM assets AS a WHERE a.project_id = ?
            ORDER BY a.file_name COLLATE NOCASE ASC, a.id ASC
            LIMIT ? OFFSET ?
        """,
        "date_taken": """
            SELECT a.* FROM assets AS a WHERE a.project_id = ?
            ORDER BY COALESCE(a.date_captured, '') DESC,
                     a.file_name COLLATE NOCASE ASC, a.id ASC
            LIMIT ? OFFSET ?
        """,
        "rating": """
            SELECT a.* FROM assets AS a WHERE a.project_id = ?
            ORDER BY a.rating DESC, a.file_name COLLATE NOCASE ASC, a.id ASC
            LIMIT ? OFFSET ?
        """,
        "file_size": """
            SELECT a.* FROM assets AS a WHERE a.project_id = ?
            ORDER BY COALESCE(a.file_size, 0) DESC,
                     a.file_name COLLATE NOCASE ASC, a.id ASC
            LIMIT ? OFFSET ?
        """,
    }
    expected_indexes = {
        "file_name": "idx_assets_project_gallery_name",
        "date_taken": "idx_assets_project_gallery_date",
        "rating": "idx_assets_project_gallery_rating",
        "file_size": "idx_assets_project_gallery_size",
    }
    try:
        connection = service.db_manager.get_connection()
        connection.executemany(
            """
            INSERT INTO assets (
                id, project_id, source_path, file_name, file_type, file_size,
                date_captured, rating, flag, metadata_json
            ) VALUES (?, ?, ?, ?, 'jpg', ?, ?, ?, 'unflagged', '{}')
            """,
            (
                (
                    f"generated-{index:05}",
                    project.id,
                    f"generated-{index:05}.jpg",
                    f"generated-{index:05}.jpg",
                    index,
                    f"2024-{index % 12 + 1:02}-01",
                    index % 6,
                )
                for index in range(5000)
            ),
        )
        connection.execute("ANALYZE;")
        for sort_mode, query in queries.items():
            plan = connection.execute(
                f"EXPLAIN QUERY PLAN {query}", (project.id, 100, 0)
            ).fetchall()
            plan_text = " ".join(row["detail"] for row in plan)
            assert expected_indexes[sort_mode] in plan_text
    finally:
        service.db_manager.close_thread_connection()


def test_asset_repository_pages_are_project_scoped(tmp_path):
    service, project = _create_catalog(tmp_path, ["first.jpg", "second.jpg"])
    try:
        assert len(service.asset_repo.list_page(project.id, 0, 10)) == 2
        assert service.asset_repo.list_page("missing-project", 0, 10) == []
        assert service.asset_repo.count_by_project("missing-project") == 0
    finally:
        service.db_manager.close_thread_connection()


def test_source_folders_are_bounded_counted_and_filter_catalog_assets_only(tmp_path):
    service, project = _create_catalog(
        tmp_path,
        [
            "photos/first.jpg",
            "photos/second.jpg",
            "photos/portraits/third.jpg",
            "archive/fourth.jpg",
        ],
    )
    assets = service.asset_repo.list_by_project(project.id)
    original_paths = {asset.id: asset.source_path for asset in assets}
    assert all(not path.exists() for path in original_paths.values())
    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(current_project=project)
    bridge.library_service = SimpleNamespace(asset_repo=service.asset_repo)
    try:
        first_page, total = service.asset_repo.list_source_folders(project.id, 0, 2)
        next_page, next_total = service.asset_repo.list_source_folders(project.id, 2, 2)
        folder_page = json.loads(bridge.get_source_folders(0, 2))
        target_folder = source_folder_from_path(
            next(asset.source_path for asset in assets if asset.file_name == "first.jpg")
        )
        matching = service.asset_repo.list_filtered_page(
            project.id, 0, 10, source_folder=target_folder
        )
        matching_ids = service.asset_repo.list_filtered_ids(
            project.id, source_folder=target_folder
        )
        library_matches = LibraryService(
            service.asset_repo,
            service.edit_state_repo,
            service.collection_repo,
        ).filter_assets(project.id, source_folder=target_folder)
        bridge_page = json.loads(
            bridge.get_asset_page(
                0, 10, json.dumps({"source_folder": target_folder})
            )
        )

        assert total == next_total == 3
        assert len(first_page) == 2
        assert len(next_page) == 1
        assert {folder["source_folder"] for folder in first_page + next_page} == {
            source_folder_from_path(asset.source_path) for asset in assets
        }
        assert folder_page["total"] == 3
        assert len(folder_page["folders"]) == 2
        assert [asset.file_name for asset in matching] == ["first.jpg", "second.jpg"]
        assert matching_ids == [asset.id for asset in matching]
        assert [asset.file_name for asset in library_matches] == [
            "first.jpg",
            "second.jpg",
        ]
        assert [asset["file_name"] for asset in bridge_page["assets"]] == [
            "first.jpg",
            "second.jpg",
        ]
        assert bridge_page["total"] == 2
        assert {asset.id: asset.source_path for asset in service.asset_repo.list_by_project(
            project.id
        )} == original_paths
        assert all(not path.exists() for path in original_paths.values())
        with pytest.raises(ValueError, match="Folder page limit"):
            service.asset_repo.list_source_folders(project.id, 0, 201)
        with pytest.raises(ValueError, match="Folder page offset"):
            service.asset_repo.list_source_folders(project.id, -1, 100)
    finally:
        service.db_manager.close_thread_connection()


def test_source_folder_path_uses_recorded_windows_or_posix_separators():
    assert (
        source_folder_from_path(r"C:\Photos\Trips\photo.jpg")
        == r"C:\Photos\Trips"
    )
    assert source_folder_from_path("/photos/trips/photo.jpg") == "/photos/trips"


@pytest.mark.parametrize(
    ("offset", "limit"),
    [(-1, 10), (0.5, 10), (True, 10), (0, 0), (0, 201), (0, False)],
)
def test_asset_repository_rejects_invalid_page_bounds(tmp_path, offset, limit):
    service, project = _create_catalog(tmp_path, [])
    try:
        with pytest.raises(ValueError):
            service.asset_repo.list_page(project.id, offset, limit)
    finally:
        service.db_manager.close_thread_connection()


def test_bridge_asset_page_returns_summaries_and_catalog_total(tmp_path):
    service, project = _create_catalog(tmp_path, ["first.jpg", "second.jpg"])
    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(current_project=project)
    bridge.library_service = SimpleNamespace(asset_repo=service.asset_repo)
    try:
        page = json.loads(bridge.get_asset_page(1, 1))

        assert page["total"] == 2
        assert page["offset"] == 1
        assert page["limit"] == 1
        assert len(page["assets"]) == 1
        assert page["assets"][0]["file_name"] == "second.jpg"
        assert "metadata" in page["assets"][0]
        assert "thumbnail_url" not in page["assets"][0]
    finally:
        service.db_manager.close_thread_connection()


def test_asset_page_filters_and_sorting_match_gallery_modes(tmp_path):
    service, project = _create_catalog(
        tmp_path, ["first.jpg", "portrait.jpg", "last.jpg", "unmatched.jpg"]
    )
    assets = service.asset_repo.list_by_project(project.id)
    by_name = {asset.file_name: asset for asset in assets}
    by_name["first.jpg"].rating = 5
    by_name["first.jpg"].flag = "flagged"
    by_name["first.jpg"].metadata = {"camera_model": "Kuro Camera"}
    by_name["portrait.jpg"].rating = 4
    by_name["portrait.jpg"].metadata = {"lens_model": "Wide Lens"}
    by_name["last.jpg"].rating = 3
    by_name["last.jpg"].flag = "rejected"
    for asset in assets:
        service.asset_repo.save(asset)

    collection = Collection.create(project.id, "Selected")
    collection.add_asset(by_name["first.jpg"].id)
    collection.add_asset(by_name["portrait.jpg"].id)
    service.collection_repo.save(collection)

    try:
        page = service.asset_repo.list_filtered_page(
            project.id,
            0,
            10,
            collection_id=collection.id,
            minimum_rating=4,
            search="lens",
            sort_by="rating",
            ascending=False,
        )
        total = service.asset_repo.count_filtered(
            project.id,
            collection_id=collection.id,
            minimum_rating=4,
            search="lens",
        )

        assert [asset.file_name for asset in page] == ["portrait.jpg"]
        assert total == 1
        assert service.asset_repo.list_filtered_ids(
            project.id,
            collection_id=collection.id,
            minimum_rating=4,
            search="lens",
            sort_by="rating",
            ascending=False,
        ) == [asset.id for asset in page]
        flagged = service.asset_repo.list_filtered_page(
            project.id, 0, 10, flag="flagged"
        )
        assert [asset.file_name for asset in flagged] == ["first.jpg"]
    finally:
        service.db_manager.close_thread_connection()


def test_search_matches_catalog_metadata_edits_for_pages_counts_ids_and_filter_assets(tmp_path):
    service, project = _create_catalog(
        tmp_path, ["title.jpg", "description.jpg", "keywords.jpg", "copyright.jpg"]
    )
    assets = service.asset_repo.list_by_project(project.id)
    overrides_by_filename = {
        "title.jpg": AssetMetadataOverrides(title="Northern Lights"),
        "description.jpg": AssetMetadataOverrides(description="Coastal sunset"),
        "keywords.jpg": AssetMetadataOverrides(keywords=["Wildlife", "Birding"]),
        "copyright.jpg": AssetMetadataOverrides(copyright="Studio Example"),
    }
    for asset in assets:
        asset.metadata_overrides = overrides_by_filename[asset.file_name]
        service.asset_repo.save(asset)

    queries = {
        "northern lights": "title.jpg",
        "COASTAL": "description.jpg",
        "birding": "keywords.jpg",
        "studio example": "copyright.jpg",
    }
    library = LibraryService(
        service.asset_repo,
        service.edit_state_repo,
        service.collection_repo,
    )
    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(current_project=project)
    bridge.library_service = SimpleNamespace(asset_repo=service.asset_repo)
    try:
        for query, expected_name in queries.items():
            page = service.asset_repo.list_filtered_page(
                project.id, 0, 10, search=query
            )
            matching_ids = service.asset_repo.list_filtered_ids(
                project.id, search=query
            )
            total = service.asset_repo.count_filtered(project.id, search=query)
            utility_matches = library.filter_assets(project.id, query=query)
            bridge_filter = json.dumps({"search": query})
            bridge_page = json.loads(bridge.get_asset_page(0, 10, bridge_filter))
            bridge_ids = json.loads(bridge.get_asset_ids(bridge_filter))

            assert [asset.file_name for asset in page] == [expected_name]
            assert matching_ids == [page[0].id]
            assert total == 1
            assert [asset.file_name for asset in utility_matches] == [expected_name]
            assert [asset["file_name"] for asset in bridge_page["assets"]] == [
                expected_name
            ]
            assert bridge_page["total"] == 1
            assert bridge_ids == [page[0].id]
    finally:
        service.db_manager.close_thread_connection()


def test_collection_summaries_and_membership_avoid_loading_all_asset_ids(tmp_path):
    service, project = _create_catalog(tmp_path, ["first.jpg", "second.jpg"])
    assets = service.asset_repo.list_by_project(project.id)
    collection = Collection.create(project.id, "Selected")
    collection.add_asset(assets[0].id)
    service.collection_repo.save(collection)

    try:
        summaries = service.collection_repo.list_summaries_by_project(project.id)

        assert summaries == [{
            "id": collection.id,
            "project_id": project.id,
            "name": "Selected",
            "created_at": collection.created_at,
            "parent_id": None,
            "collection_type": "manual",
            "rules": {
                "search": "",
                "minimum_rating": 0,
                "flag": "all",
                "source_folder": None,
            },
            "asset_count": 1,
        }]
        assert service.collection_repo.contains_asset(
            collection.id, assets[0].id, project.id
        )
        assert not service.collection_repo.contains_asset(
            collection.id, assets[1].id, project.id
        )
        assert not service.collection_repo.contains_asset(
            collection.id, assets[0].id, "different-project"
        )
    finally:
        service.db_manager.close_thread_connection()


def test_bridge_pushes_collection_counts_without_member_ids(tmp_path):
    service, project = _create_catalog(tmp_path, ["first.jpg"])
    asset = service.asset_repo.list_page(project.id, 0, 1)[0]
    collection = Collection.create(project.id, "Selected")
    collection.add_asset(asset.id)
    service.collection_repo.save(collection)
    emitted = []
    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(current_project=project)
    bridge.library_service = SimpleNamespace(collection_repo=service.collection_repo)
    bridge.collections_updated = SimpleNamespace(emit=emitted.append)

    try:
        bridge._push_collections()

        assert json.loads(emitted[0]) == [{
            "id": collection.id,
            "name": "Selected",
            "created_at": collection.created_at,
            "parent_id": None,
            "collection_type": "manual",
            "rules": {
                "search": "",
                "minimum_rating": 0,
                "flag": "all",
                "source_folder": None,
            },
            "asset_ids": [],
            "asset_count": 1,
        }]
        assert bridge.is_asset_in_collection(asset.id, collection.id)
    finally:
        service.db_manager.close_thread_connection()


def test_smart_collection_filters_are_dynamic_and_match_gallery_queries(tmp_path):
    service, project = _create_catalog(tmp_path, [])
    trip_folder = str((tmp_path / "trip").resolve())
    asset_specs = [
        ("pick.jpg", trip_folder, 5, "flagged"),
        ("reject.jpg", trip_folder, 5, "rejected"),
        ("unflagged.jpg", trip_folder, 5, "unflagged"),
        ("low-rating.jpg", trip_folder, 2, "flagged"),
    ]
    assets = []
    for filename, folder, rating, flag in asset_specs:
        asset = ImageAsset.create(Path(folder) / filename, project.id)
        asset.rating = rating
        asset.flag = flag
        asset.metadata = {"camera_model": "Forest Camera"}
        service.asset_repo.save(asset)
        assets.append(asset)
    rules = SmartCollectionRules(
        search="forest",
        minimum_rating=4,
        flag="flagged",
        source_folder=trip_folder,
    )
    library = LibraryService(
        service.asset_repo,
        service.edit_state_repo,
        service.collection_repo,
    )
    collection = library.create_smart_collection(project.id, "Forest Picks", rules)
    assert collection is not None
    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(current_project=project)
    bridge.library_service = library
    collection_events = []
    bridge.collections_updated = SimpleNamespace(emit=collection_events.append)
    bridge._push_assets = lambda: None

    try:
        page = service.asset_repo.list_filtered_page(
            project.id, 0, 10, collection_id=collection.id
        )
        assert [asset.file_name for asset in page] == ["pick.jpg"]
        assert service.asset_repo.count_filtered(
            project.id, collection_id=collection.id
        ) == 1
        assert service.asset_repo.list_filtered_ids(
            project.id, collection_id=collection.id
        ) == [assets[0].id]
        assert [
            asset.file_name
            for asset in LibraryService(
                service.asset_repo,
                service.edit_state_repo,
                service.collection_repo,
            ).filter_assets(project.id, collection_id=collection.id)
        ] == ["pick.jpg"]
        assert service.collection_repo.contains_asset(
            collection.id, assets[0].id, project.id
        )
        assert not service.collection_repo.contains_asset(
            collection.id, assets[1].id, project.id
        )
        assert json.loads(
            bridge.get_asset_page(
                0, 10, json.dumps({"collection_id": collection.id})
            )
        )["total"] == 1
        assert json.loads(
            bridge.get_asset_ids(json.dumps({"collection_id": collection.id}))
        ) == [assets[0].id]
        assert service.collection_repo.list_summaries_by_project(project.id)[0][
            "asset_count"
        ] == 1

        bridge.set_flag(assets[2].id, "flagged")

        assert service.asset_repo.count_filtered(
            project.id, collection_id=collection.id
        ) == 2
        assert json.loads(collection_events[-1])[0]["asset_count"] == 2
        assert service.collection_repo.contains_asset(
            collection.id, assets[2].id, project.id
        )
    finally:
        service.db_manager.close_thread_connection()


def test_nested_collections_preserve_children_when_parent_is_deleted(tmp_path):
    service, project = _create_catalog(tmp_path, [])
    parent = Collection.create(project.id, "Travel")
    service.collection_repo.save(parent)
    child = Collection.create_smart(
        project.id,
        "Rated Travel",
        SmartCollectionRules(minimum_rating=3),
        parent_id=parent.id,
    )
    service.collection_repo.save(child)
    grandchild = Collection.create(project.id, "Favorites", parent_id=child.id)
    service.collection_repo.save(grandchild)

    try:
        summaries = {
            summary["id"]: summary
            for summary in service.collection_repo.list_summaries_by_project(project.id)
        }
        assert summaries[child.id]["parent_id"] == parent.id
        assert summaries[child.id]["collection_type"] == "smart"
        assert summaries[grandchild.id]["parent_id"] == child.id

        library = LibraryService(
            service.asset_repo,
            service.edit_state_repo,
            service.collection_repo,
        )
        library.delete_collection(parent.id)

        assert service.collection_repo.get_by_id(parent.id) is None
        assert service.collection_repo.get_by_id(child.id).parent_id is None
        assert service.collection_repo.get_by_id(grandchild.id).parent_id == child.id
    finally:
        service.db_manager.close_thread_connection()


def test_smart_collections_reject_manual_membership_changes(tmp_path):
    service, project = _create_catalog(tmp_path, ["photo.jpg"])
    asset = service.asset_repo.list_page(project.id, 0, 1)[0]
    library = LibraryService(
        service.asset_repo,
        service.edit_state_repo,
        service.collection_repo,
    )
    collection = library.create_smart_collection(
        project.id, "Rated", SmartCollectionRules(minimum_rating=1)
    )
    assert collection is not None

    try:
        with pytest.raises(ValueError, match="determined by its rules"):
            library.add_asset_to_collection(collection.id, asset.id)
        with pytest.raises(ValueError, match="cannot be added manually"):
            collection.add_asset(asset.id)
    finally:
        service.db_manager.close_thread_connection()


def test_bridge_creates_validated_smart_child_collection(tmp_path):
    service, project = _create_catalog(tmp_path, [])
    parent = Collection.create(project.id, "Parent")
    service.collection_repo.save(parent)
    emitted_collections = []
    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(current_project=project)
    bridge.library_service = LibraryService(
        service.asset_repo,
        service.edit_state_repo,
        service.collection_repo,
    )
    bridge.collections_updated = SimpleNamespace(emit=emitted_collections.append)
    bridge.notification = SimpleNamespace(emit=lambda *args: None)

    try:
        bridge.create_smart_collection(
            "Recent Picks",
            json.dumps({
                "search": "landscape",
                "minimum_rating": 4,
                "flag": "flagged",
                "source_folder": None,
            }),
            parent.id,
        )

        child = service.collection_repo.list_by_project(project.id)[1]
        assert child.collection_type == "smart"
        assert child.parent_id == parent.id
        assert child.rules == SmartCollectionRules(
            search="landscape",
            minimum_rating=4,
            flag="flagged",
        )
        assert json.loads(emitted_collections[-1])[1]["collection_type"] == "smart"
        bridge.update_smart_collection(
            child.id,
            "Rejected Landscapes",
            json.dumps({
                "search": "landscape",
                "minimum_rating": 2,
                "flag": "rejected",
                "source_folder": None,
            }),
        )
        updated_child = service.collection_repo.get_by_id(child.id)
        assert updated_child is not None
        assert updated_child.name == "Rejected Landscapes"
        assert updated_child.rules.flag == "rejected"
        with pytest.raises(ValueError):
            bridge.create_smart_collection(
                "Invalid",
                json.dumps({"minimum_rating": True}),
                parent.id,
            )
    finally:
        service.db_manager.close_thread_connection()


def test_asset_page_search_treats_sql_wildcards_as_literal_characters(tmp_path):
    service, project = _create_catalog(
        tmp_path, ["100%_complete.jpg", "100XXcomplete.jpg"]
    )
    try:
        matching = service.asset_repo.list_filtered_page(
            project.id, 0, 10, search="%_"
        )
        assert [asset.file_name for asset in matching] == ["100%_complete.jpg"]
    finally:
        service.db_manager.close_thread_connection()


@pytest.mark.parametrize(
    ("sort_by", "ascending", "sort_key"),
    [
        ("file_name", True, lambda asset: (asset.file_name.casefold(), asset.id)),
        (
            "date_taken",
            False,
            lambda asset: (
                -(int(asset.date_captured.replace("-", "")) if asset.date_captured else 0),
                asset.file_name.casefold(),
                asset.id,
            ),
        ),
        (
            "rating",
            False,
            lambda asset: (-asset.rating, asset.file_name.casefold(), asset.id),
        ),
        (
            "file_size",
            False,
            lambda asset: (
                -(asset.file_size or 0),
                asset.file_name.casefold(),
                asset.id,
            ),
        ),
    ],
)
def test_filtered_page_sort_order_is_stable_across_page_boundaries(
    tmp_path, sort_by, ascending, sort_key
):
    service, project = _create_catalog(
        tmp_path, ["same-b.jpg", "Alpha.jpg", "same-a.jpg", "zeta.jpg"]
    )
    assets = service.asset_repo.list_by_project(project.id)
    for index, asset in enumerate(assets):
        asset.rating = index % 2
        asset.file_size = (index % 2) * 100
        asset.date_captured = "2024-01-01" if index % 2 else None
        service.asset_repo.save(asset)
    with service.db_manager.transaction() as connection:
        for asset in assets:
            connection.execute(
                "UPDATE assets SET date_captured = ? WHERE id = ?;",
                (asset.date_captured, asset.id),
            )

    try:
        expected = sorted(assets, key=sort_key)
        pages = [
            *service.asset_repo.list_filtered_page(
                project.id, 0, 2, sort_by=sort_by, ascending=ascending
            ),
            *service.asset_repo.list_filtered_page(
                project.id, 2, 2, sort_by=sort_by, ascending=ascending
            ),
        ]
        assert [asset.id for asset in pages] == [asset.id for asset in expected]
    finally:
        service.db_manager.close_thread_connection()


@pytest.mark.parametrize(
    "filters",
    [
        {"sort_by": "source_path"},
        {"flag": "other"},
        {"minimum_rating": 6},
        {"unexpected": True},
    ],
)
def test_bridge_rejects_unsupported_gallery_page_filters(tmp_path, filters):
    service, project = _create_catalog(tmp_path, [])
    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(current_project=project)
    bridge.library_service = SimpleNamespace(asset_repo=service.asset_repo)
    try:
        with pytest.raises(ValueError):
            bridge.get_asset_page(0, 20, json.dumps(filters))
    finally:
        service.db_manager.close_thread_connection()


@pytest.mark.parametrize(
    ("offset", "limit"),
    [(True, 10), (0.5, 10), (0, False)],
)
def test_bridge_asset_page_rejects_non_integer_arguments(tmp_path, offset, limit):
    service, project = _create_catalog(tmp_path, [])
    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(current_project=project)
    bridge.library_service = SimpleNamespace(asset_repo=service.asset_repo)
    try:
        with pytest.raises(ValueError, match="integer"):
            bridge.get_asset_page(offset, limit)
    finally:
        service.db_manager.close_thread_connection()
