import json

import pytest
from PIL import Image

from kurolight.domain.metadata import AssetMetadataOverrides
from kurolight.infrastructure.metadata.sidecar import MetadataSidecarManager, SidecarConflictError


def test_metadata_sidecar_round_trip_and_conflicts(tmp_path):
    source_path = tmp_path / "photo.jpg"
    Image.new("RGB", (8, 8), color="navy").save(source_path)

    overrides = AssetMetadataOverrides(
        title="  Morning light  ",
        description="Coastal cliffs",
        keywords=["Coast", "cliffs", "coast"],
        copyright="A. Photographer",
    )

    result = MetadataSidecarManager.export_metadata(source_path, overrides)
    sidecar_path = result.sidecar_path

    assert sidecar_path.exists()
    payload = json.loads(sidecar_path.read_text(encoding="utf-8"))
    assert payload["metadata"] == {
        "title": "Morning light",
        "description": "Coastal cliffs",
        "keywords": ["Coast", "cliffs"],
        "creator": "",
        "copyright": "A. Photographer",
        "usage_terms": "",
    }

    imported = MetadataSidecarManager.import_metadata(source_path)
    assert imported.metadata == overrides
    assert imported.extra_fields == {}

    payload["unknown_fields"] = {"xmp:Label": "Editorial", "camera": {"make": "Canon"}}
    sidecar_path.write_text(json.dumps(payload), encoding="utf-8")
    imported_with_unknown = MetadataSidecarManager.import_metadata(source_path)
    assert imported_with_unknown.extra_fields["xmp:Label"] == "Editorial"
    assert imported_with_unknown.metadata == overrides

    with pytest.raises(SidecarConflictError):
        MetadataSidecarManager.export_metadata(
            source_path,
            AssetMetadataOverrides(title="Changed title"),
            conflict="error",
        )

    overwritten = MetadataSidecarManager.export_metadata(
        source_path,
        AssetMetadataOverrides(title="Changed title"),
        conflict="overwrite",
    )
    assert overwritten.metadata.title == "Changed title"
    assert json.loads(sidecar_path.read_text(encoding="utf-8"))["metadata"]["title"] == "Changed title"


def test_library_service_can_export_and_import_kuro_sidecars(tmp_path):
    from kurolight.domain.assets import ImageAsset
    from kurolight.infrastructure.database.connection import DatabaseConnectionManager
    from kurolight.infrastructure.database.migrations import apply_migrations
    from kurolight.infrastructure.database.repository import AssetRepository
    from kurolight.services.library_service import LibraryService

    source_path = tmp_path / "archive.jpg"
    Image.new("RGB", (12, 10), "olive").save(source_path)

    manager = DatabaseConnectionManager(tmp_path / "catalog.sqlite")
    try:
        with manager.transaction() as connection:
            apply_migrations(connection)
        repository = AssetRepository(manager)
        asset = ImageAsset.create(source_path)
        repository.save(asset)
        library_service = LibraryService(repository, edit_state_repo=object())

        sidecar_path = library_service.export_metadata_sidecar(
            asset.id,
            AssetMetadataOverrides(title="Teal skyline", keywords=["skyline", "city"]),
        )
        assert sidecar_path.endswith("archive.kuro.metadata.json")
        reloaded = library_service.import_metadata_sidecar(asset.id)
        assert reloaded.title == "Teal skyline"
        assert reloaded.keywords == ["skyline", "city"]
    finally:
        manager.close_thread_connection()
