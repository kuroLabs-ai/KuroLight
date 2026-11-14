import json
from types import SimpleNamespace

from kurolight.domain.metadata import AssetMetadataOverrides
from kurolight.ui.web_bridge import PyBridge


def test_thumbnail_batch_returns_only_requested_existing_assets():
    assets = {
        "first": SimpleNamespace(id="first"),
        "second": SimpleNamespace(id="second"),
    }
    bridge = PyBridge.__new__(PyBridge)
    bridge.library_service = SimpleNamespace(
        asset_repo=SimpleNamespace(get_by_id=assets.get)
    )
    bridge._get_thumbnail_data_url = lambda asset: f"data:{asset.id}"

    result = json.loads(bridge.get_thumbnails('["first","missing","first","second"]'))

    assert result == {"first": "data:first", "second": "data:second"}


def test_thumbnail_batch_rejects_malformed_and_oversized_requests():
    bridge = PyBridge.__new__(PyBridge)

    malformed = json.loads(bridge.get_thumbnails('{"asset":"first"}'))
    oversized = json.loads(
        bridge.get_thumbnails(json.dumps([str(index) for index in range(33)]))
    )

    assert "error" in malformed
    assert "error" in oversized
    assert "32 assets" in oversized["error"]


def test_asset_refresh_uses_a_bounded_page_without_eager_thumbnails():
    emitted = []
    counts = []
    project = SimpleNamespace(id="project")
    asset = SimpleNamespace(
        id="photo",
        file_name="photo.jpg",
        source_path="photo.jpg",
        width=8,
        height=6,
        file_size=20,
        metadata={},
        date_captured=None,
        file_type="jpg",
        rating=0,
        flag="unflagged",
        metadata_overrides=AssetMetadataOverrides(),
        deleted_at=None,
    )
    page_requests = []
    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = SimpleNamespace(current_project=project)
    bridge.library_service = SimpleNamespace(asset_repo=SimpleNamespace(
        list_page=lambda project_id, offset, limit: (
            page_requests.append((project_id, offset, limit)) or [asset]
        ),
        count_by_project=lambda project_id: 501,
        count_trashed=lambda _project_id: 2,
    ))
    bridge.assets_updated = SimpleNamespace(emit=emitted.append)
    bridge.asset_count_updated = SimpleNamespace(emit=counts.append)
    bridge._get_thumbnail_data_url = lambda _asset: (_ for _ in ()).throw(
        AssertionError("thumbnail should be requested lazily")
    )

    bridge._push_assets()

    payload = json.loads(emitted[0])
    assert page_requests == [("project", 0, 200)]
    assert counts == [501]
    assert len(payload) == 1
    assert "thumbnail_url" not in payload[0]
    assert "metadata" not in payload[0]
    assert "metadata_overrides" not in payload[0]
    assert payload[0]["camera_model"] == ""


def test_initial_sync_selects_from_a_bounded_catalog_page():
    asset = SimpleNamespace(
        id="photo",
        file_name="photo.jpg",
        source_path="photo.jpg",
        width=8,
        height=6,
        file_size=20,
        metadata={},
        date_captured=None,
        file_type="jpg",
        rating=0,
        flag="unflagged",
        metadata_overrides=AssetMetadataOverrides(),
        deleted_at=None,
    )
    page_requests = []
    bridge = PyBridge.__new__(PyBridge)
    project = SimpleNamespace(id="project")
    bridge.library_service = SimpleNamespace(asset_repo=SimpleNamespace(
        list_page=lambda project_id, offset, limit: (
            page_requests.append((project_id, offset, limit)) or [asset]
        ),
        count_by_project=lambda _project_id: 501,
        count_trashed=lambda _project_id: 2,
    ))
    bridge.app_state = SimpleNamespace(current_project=project, active_asset=None)
    bridge.assets_updated = SimpleNamespace(emit=lambda _payload: None)
    bridge.asset_count_updated = SimpleNamespace(emit=lambda _count: None)
    bridge.trash_count_updated = SimpleNamespace(emit=lambda _count: None)
    bridge._set_library_loading = lambda *_args: None
    bridge._push_collections = lambda: None
    bridge._push_presets = lambda: None
    bridge._emit_history = lambda: None
    selected = []
    bridge.select_asset = selected.append

    bridge.initial_sync()

    assert page_requests == [("project", 0, 200)]
    assert selected == ["photo"]


def test_select_asset_emits_thumbnail_and_defers_full_render(tmp_path, monkeypatch):
    source_path = tmp_path / "photo.jpg"
    source_path.write_bytes(b"image")
    asset = SimpleNamespace(
        id="photo",
        file_name="photo.jpg",
        source_path=source_path,
    )
    state = SimpleNamespace(
        asset_id="photo",
        model_dump=lambda: {"asset_id": "photo"},
    )
    emitted = []
    scheduled = []
    bridge = PyBridge.__new__(PyBridge)
    bridge._save_timer = SimpleNamespace(isActive=lambda: False)
    bridge._render_timer = SimpleNamespace(start=scheduled.append)
    bridge._missing_source_notified = set()
    bridge.library_service = SimpleNamespace(
        asset_repo=SimpleNamespace(get_by_id=lambda _asset_id: asset)
    )
    bridge.app_state = SimpleNamespace(
        set_active_asset=lambda _asset: None,
        set_current_edit_state=lambda _state: None,
    )
    bridge.editing_service = SimpleNamespace(get_edit_state=lambda _asset_id: state)
    bridge._edit_start_state = None
    bridge._restore_asset_history = lambda _asset_id: None
    bridge._asset_to_dict = lambda _asset: {"id": "photo"}
    bridge._get_thumbnail_data_url = lambda _asset: "data:image/jpeg;base64,thumb"
    bridge.asset_selected = SimpleNamespace(emit=lambda *args: emitted.append(args))

    class NoOpThread:
        def __init__(self, **_kwargs):
            pass

        def start(self):
            pass

    monkeypatch.setattr("kurolight.ui.web_bridge.threading.Thread", NoOpThread)

    bridge.select_asset("photo")

    asset_payload = json.loads(emitted[0][0])
    assert asset_payload["thumbnail_url"] == "data:image/jpeg;base64,thumb"
    assert scheduled == [0]


def test_asset_page_keeps_full_metadata_for_loaded_gallery_rows():
    asset = SimpleNamespace(
        id="photo",
        file_name="photo.jpg",
        source_path="photo.jpg",
        width=8,
        height=6,
        file_size=20,
        metadata={"camera_model": "Test Camera"},
        date_captured=None,
        file_type="jpg",
        rating=0,
        flag="unflagged",
        metadata_overrides=AssetMetadataOverrides(),
        deleted_at=None,
    )
    serialized = PyBridge._asset_summary(asset)

    assert serialized["metadata"] == {"camera_model": "Test Camera"}
    assert serialized["metadata_overrides"] == AssetMetadataOverrides().model_dump(
        mode="json"
    )
