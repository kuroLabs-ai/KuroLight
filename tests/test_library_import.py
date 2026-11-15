import threading
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

from kurolight.domain.assets import ImageAsset
from kurolight.infrastructure.database.connection import DatabaseConnectionManager
from kurolight.infrastructure.database.migrations import apply_migrations
from kurolight.infrastructure.database.repository import AssetRepository
from kurolight.infrastructure.metadata.extractor import ImageMetadata
from kurolight.services import library_service
from kurolight.services.library_service import (
    ImportBatchResult,
    ImportFailure,
    LibraryService,
)
from kurolight.ui.web_bridge import PyBridge


class _AssetRepository:
    def __init__(self):
        self.assets = {}

    def get_by_source_path(self, source_path):
        normalized = Path(source_path).resolve()
        return next(
            (asset for asset in self.assets.values() if asset.source_path == normalized),
            None,
        )

    def save(self, asset):
        self.assets[asset.id] = asset

    def list_by_project(self, _project_id=None):
        return list(self.assets.values())

    def delete(self, asset_id):
        self.assets.pop(asset_id, None)


class _EditStateRepository:
    def __init__(self, fail_save=False):
        self.states = {}
        self.fail_save = fail_save

    def get_by_asset_id(self, asset_id):
        return self.states.get(asset_id)

    def save(self, state):
        if self.fail_save:
            raise OSError("catalog write failed")
        self.states[state.asset_id] = state


class _ThumbnailCache:
    def __init__(self):
        self.generated = []

    def generate_thumbnail(self, path):
        self.generated.append(path)


def _service(monkeypatch, asset_repo=None, edit_state_repo=None):
    assets = asset_repo or _AssetRepository()
    edits = edit_state_repo or _EditStateRepository()
    thumbnails = _ThumbnailCache()

    def extract(path):
        if path.name.startswith("broken"):
            raise ValueError("invalid image data")
        return ImageMetadata(
            file_name=path.name,
            file_size_bytes=path.stat().st_size,
            format=path.suffix.lstrip("."),
            width=8,
            height=6,
        )

    monkeypatch.setattr(library_service.MetadataExtractor, "extract", extract)
    return LibraryService(assets, edits, thumbnail_cache=thumbnails), assets, edits, thumbnails


def _real_service(asset_repo=None):
    assets = asset_repo or _AssetRepository()
    edits = _EditStateRepository()
    thumbnails = _ThumbnailCache()
    return LibraryService(assets, edits, thumbnail_cache=thumbnails), assets, thumbnails


def _write_image(path, color):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (8, 6), color).save(path)


def test_import_batch_skips_duplicate_source_paths(tmp_path, monkeypatch):
    image = tmp_path / "photo.jpg"
    image.write_bytes(b"image")
    service, assets, _, thumbnails = _service(monkeypatch)

    result = service.import_files([image, image])

    assert len(result.imported) == 1
    assert len(result.duplicates) == 1
    assert result.imported[0].id == result.duplicates[0].id
    assert len(assets.assets) == 1
    assert len(thumbnails.generated) == 1


def test_hash_duplicate_detection_and_default_metadata(tmp_path, monkeypatch):
    first = tmp_path / "first.jpg"
    second = tmp_path / "second.jpg"
    first.write_bytes(b"same image data")
    second.write_bytes(b"same image data")
    service, assets, _, _ = _service(monkeypatch)
    service.import_settings = SimpleNamespace(
        duplicate_detection="hash",
        default_creator="Photographer",
        default_copyright="Copyright",
        default_usage_terms="Editorial use",
    )

    result = service.import_files([first, second])

    assert len(result.imported) == 1
    assert len(result.duplicates) == 1
    assert len(assets.assets) == 1
    assert result.imported[0].metadata_overrides.creator == "Photographer"
    assert result.imported[0].metadata_overrides.copyright == "Copyright"
    assert result.imported[0].metadata_overrides.usage_terms == "Editorial use"


def test_asset_repository_finds_existing_source_path(tmp_path):
    source = tmp_path / "photo.jpg"
    source.write_bytes(b"image")
    manager = DatabaseConnectionManager(tmp_path / "catalog.sqlite")
    with manager.transaction() as connection:
        apply_migrations(connection)
    repository = AssetRepository(manager)
    asset = ImageAsset.create(source)
    repository.save(asset)

    existing = repository.get_by_source_path(source.resolve())

    assert existing is not None
    assert existing.id == asset.id
    manager.close_thread_connection()


def test_import_batch_continues_after_missing_unsupported_and_invalid_files(
    tmp_path, monkeypatch
):
    valid = tmp_path / "valid.jpg"
    broken = tmp_path / "broken.png"
    unsupported = tmp_path / "notes.txt"
    valid.write_bytes(b"image")
    broken.write_bytes(b"not an image")
    unsupported.write_text("not a photo", encoding="utf-8")
    missing = tmp_path / "missing.jpg"
    service, assets, _, _ = _service(monkeypatch)

    result = service.import_files([valid, missing, unsupported, broken])

    assert [asset.file_name for asset in result.imported] == ["valid.jpg"]
    assert len(result.failures) == 3
    assert {failure.path.name for failure in result.failures} == {
        "missing.jpg",
        "notes.txt",
        "broken.png",
    }
    assert len(assets.assets) == 1


def test_import_batch_stops_after_current_file_when_cancelled(tmp_path, monkeypatch):
    first = tmp_path / "first.jpg"
    second = tmp_path / "second.jpg"
    first.write_bytes(b"image")
    second.write_bytes(b"image")
    cancel_event = threading.Event()

    class CancellingAssetRepository(_AssetRepository):
        def save(self, asset):
            super().save(asset)
            cancel_event.set()

    service, _, _, _ = _service(
        monkeypatch, asset_repo=CancellingAssetRepository()
    )

    result = service.import_files([first, second], cancel_event=cancel_event)

    assert [asset.file_name for asset in result.imported] == ["first.jpg"]
    assert result.cancelled


def test_import_rolls_back_asset_if_default_edit_state_cannot_be_saved(
    tmp_path, monkeypatch
):
    image = tmp_path / "photo.jpg"
    image.write_bytes(b"image")
    service, assets, _, thumbnails = _service(
        monkeypatch, edit_state_repo=_EditStateRepository(fail_save=True)
    )

    result = service.import_files([image])

    assert result.imported == []
    assert len(result.failures) == 1
    assert assets.assets == {}
    assert thumbnails.generated == []


def test_import_directory_reports_unavailable_folder(tmp_path, monkeypatch):
    service, _, _, _ = _service(monkeypatch)

    result = service.import_directory(tmp_path / "missing")

    assert result.imported == []
    assert result.failures[0].path == (tmp_path / "missing").resolve()
    assert "Folder does not exist" in result.failures[0].message


def test_import_directory_recurses_reports_duplicates_and_keeps_partial_success(tmp_path):
    root = tmp_path / "photo-library"
    duplicate_path = root / "day-one" / "already-imported.png"
    valid_path = root / "day-two" / "nested" / "valid.png"
    invalid_path = root / "day-two" / "nested" / "unreadable.jpg"
    ignored_path = root / "notes.txt"
    _write_image(duplicate_path, "red")
    _write_image(valid_path, "blue")
    invalid_path.parent.mkdir(parents=True, exist_ok=True)
    invalid_path.write_bytes(b"not an image")
    ignored_path.write_text("not an image", encoding="utf-8")
    service, assets, thumbnails = _real_service()
    service.import_file(duplicate_path)

    result = service.import_directory(root)

    assert [asset.file_name for asset in result.imported] == ["valid.png"]
    assert [asset.file_name for asset in result.duplicates] == ["already-imported.png"]
    assert [failure.path for failure in result.failures] == [invalid_path.resolve()]
    assert "valid image dimensions" in result.failures[0].message
    assert len(assets.assets) == 2
    assert len(thumbnails.generated) == 2


def test_import_directory_cancellation_keeps_completed_files_only(tmp_path):
    root = tmp_path / "photo-library"
    first_path = root / "a" / "first.png"
    second_path = root / "b" / "second.png"
    _write_image(first_path, "green")
    _write_image(second_path, "yellow")
    cancel_event = threading.Event()

    class CancellingAssetRepository(_AssetRepository):
        def save(self, asset):
            super().save(asset)
            cancel_event.set()

    service, assets, _ = _real_service(CancellingAssetRepository())

    result = service.import_directory(root, cancel_event=cancel_event)

    assert [asset.file_name for asset in result.imported] == ["first.png"]
    assert result.cancelled
    assert len(assets.assets) == 1


def test_bridge_import_report_includes_every_file_outcome(tmp_path):
    imported = ImageAsset.create(tmp_path / "imported.jpg")
    duplicate = ImageAsset.create(tmp_path / "duplicate.jpg")
    result = ImportBatchResult(
        imported=[imported],
        duplicates=[duplicate],
        failures=[
            ImportFailure(tmp_path / "missing.jpg", "File does not exist"),
            ImportFailure(tmp_path / "broken.png", "Invalid image data"),
        ],
    )
    notices = []
    bridge = SimpleNamespace(
        notification=SimpleNamespace(emit=lambda *args: notices.append(args))
    )

    PyBridge._report_import_result(bridge, "Import Complete", result)

    assert len(notices) == 1
    title, message, level = notices[0]
    assert title == "Import Complete"
    assert level == "warning"
    for expected in (
        "imported.jpg",
        "duplicate.jpg",
        "missing.jpg",
        "broken.png",
        "File does not exist",
        "Invalid image data",
    ):
        assert expected in message


def test_missing_source_preview_reports_error_and_clears_stale_preview(tmp_path):
    notifications = []
    cleared_previews = []
    asset = SimpleNamespace(
        id="missing-asset",
        file_name="missing.jpg",
        source_path=tmp_path / "missing.jpg",
    )
    bridge = SimpleNamespace(
        app_state=SimpleNamespace(
            active_asset=asset,
            current_edit_state=SimpleNamespace(asset_id=asset.id),
        ),
        _missing_source_notified=set(),
        image_updated=SimpleNamespace(emit=cleared_previews.append),
        before_image_updated=SimpleNamespace(emit=cleared_previews.append),
        notification=SimpleNamespace(emit=lambda *args: notifications.append(args)),
    )

    PyBridge._do_render_preview(bridge)
    PyBridge._do_render_preview(bridge)

    assert cleared_previews == ["", ""]
    assert len(notifications) == 1
    assert notifications[0][0] == "Source Image Missing"
    assert "saved edits were kept" in notifications[0][1]


def test_edit_save_failure_is_visible_to_user():
    notifications = []

    def fail_save(_state):
        raise OSError("catalog is read-only")

    bridge = SimpleNamespace(
        editing_service=SimpleNamespace(save_edit_state=fail_save),
        notification=SimpleNamespace(emit=lambda *args: notifications.append(args)),
    )

    assert not PyBridge._save_state_with_notification(
        bridge, SimpleNamespace(asset_id="asset-1")
    )

    assert notifications[0][0] == "Edit Not Saved"
    assert "catalog is read-only" in notifications[0][1]
    assert notifications[0][2] == "error"
