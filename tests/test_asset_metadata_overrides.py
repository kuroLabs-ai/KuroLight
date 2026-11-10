import json

import pytest
from PIL import Image
from pydantic import ValidationError

from kurolight.domain.assets import ImageAsset
from kurolight.domain.metadata import AssetMetadataOverrides
from kurolight.infrastructure.database.connection import DatabaseConnectionManager
from kurolight.infrastructure.database.migrations import apply_migrations
from kurolight.infrastructure.database.repository import AssetRepository
from kurolight.infrastructure.metadata.extractor import MetadataExtractor
from kurolight.services.library_service import LibraryService
from kurolight.ui.web_bridge import PyBridge


def test_metadata_overrides_normalize_keywords_and_reject_invalid_fields():
    overrides = AssetMetadataOverrides(
        title="  A title  ",
        keywords=[" landscape ", "LANDSCAPE", "", "mountains"],
    )

    assert overrides.title == "A title"
    assert overrides.keywords == ["landscape", "mountains"]
    with pytest.raises(ValidationError):
        AssetMetadataOverrides(title="x" * 257)
    with pytest.raises(ValidationError):
        AssetMetadataOverrides(extra_field="not supported")
    with pytest.raises(ValidationError):
        AssetMetadataOverrides(keywords=["keyword"] * 65)


def test_bridge_saves_catalog_overrides_without_changing_exif_source_or_sidecar(tmp_path):
    source_path = tmp_path / "photo.jpg"
    exif = Image.Exif()
    exif[271] = "Extracted camera"
    Image.new("RGB", (8, 6), "blue").save(source_path, exif=exif)
    sidecar_path = source_path.with_suffix(".xmp")
    sidecar_path.write_bytes(b"original sidecar bytes")
    original_source = source_path.read_bytes()
    original_sidecar = sidecar_path.read_bytes()

    manager = DatabaseConnectionManager(tmp_path / "catalog.sqlite")
    try:
        with manager.transaction() as connection:
            apply_migrations(connection)
        repository = AssetRepository(manager)
        asset = ImageAsset.create(source_path)
        asset.metadata = MetadataExtractor.extract(source_path).to_dict()
        repository.save(asset)
        library_service = LibraryService(repository, edit_state_repo=object())

        bridge = PyBridge.__new__(PyBridge)
        bridge.library_service = library_service
        refreshes = []
        collection_refreshes = []
        bridge._push_assets = lambda: refreshes.append(True)
        bridge._push_collections = lambda: collection_refreshes.append(True)
        response = bridge.update_asset_metadata_overrides(
            asset.id,
            json.dumps(
                {
                    "title": "  Mountain light ",
                    "description": "Late afternoon",
                    "keywords": ["Landscape", "Mountains", "landscape"],
                    "copyright": "Photographer",
                }
            ),
        )

        assert json.loads(response) == {
            "title": "Mountain light",
            "description": "Late afternoon",
            "keywords": ["Landscape", "Mountains"],
            "copyright": "Photographer",
        }
        saved = repository.get_by_id(asset.id)
        assert saved is not None
        assert saved.metadata == asset.metadata
        assert saved.metadata_overrides.title == "Mountain light"
        assert refreshes == [True]
        assert collection_refreshes == [True]
        assert source_path.read_bytes() == original_source
        assert sidecar_path.read_bytes() == original_sidecar
        with pytest.raises(ValidationError):
            bridge.update_asset_metadata_overrides(
                asset.id, json.dumps({"title": "valid", "unexpected": True})
            )
    finally:
        manager.close_thread_connection()

    reopened_manager = DatabaseConnectionManager(tmp_path / "catalog.sqlite")
    try:
        reopened_repository = AssetRepository(reopened_manager)
        reopened = reopened_repository.get_by_id(asset.id)
        assert reopened is not None
        assert reopened.metadata == asset.metadata
        assert reopened.metadata_overrides == AssetMetadataOverrides(
            title="Mountain light",
            description="Late afternoon",
            keywords=["Landscape", "Mountains"],
            copyright="Photographer",
        )
    finally:
        reopened_manager.close_thread_connection()
