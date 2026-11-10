"""Comprehensive tests for PresetService, built-in presets, and custom user recipes."""

import pytest
from pathlib import Path
from kurolight.domain.editing import EditState
from kurolight.services.project_service import ProjectService
from kurolight.services.preset_service import PresetService


@pytest.fixture
def preset_service(tmp_path: Path) -> PresetService:
    db_path = tmp_path / "test_presets.db"
    proj = ProjectService.open_or_create_project(db_path)
    return PresetService(proj.preset_repo)


def test_builtin_presets_count_and_categories(preset_service: PresetService):
    """Verify that all 54 built-in style recipes are loaded across valid categories."""
    presets = preset_service.get_presets()
    assert len(presets) >= 54

    categories = {p.category for p in presets}
    expected_categories = {
        "Film Emulation",
        "Portrait",
        "Cinematic",
        "Landscape",
        "Urban / Street",
        "Monochrome",
    }
    # Ensure all primary categories are represented
    for expected in expected_categories:
        assert expected in categories, f"Missing category: {expected}"

    # Verify each preset has non-empty fields
    for p in presets:
        assert p.id, "Preset ID must not be empty"
        assert p.name, "Preset name must not be empty"
        assert p.category, f"Preset {p.name} category must not be empty"
        assert isinstance(p.parameters, dict), f"Preset {p.name} parameters must be a dict"
        assert len(p.parameters) > 0, f"Preset {p.name} parameters cannot be empty"


def test_builtin_presets_produce_valid_edit_states(preset_service: PresetService):
    """Verify that applying every built-in preset produces a valid EditState without error."""
    presets = preset_service.get_presets()
    initial_state = EditState(asset_id="test_photo")

    for p in presets:
        applied = preset_service.apply_preset(p, initial_state)
        assert isinstance(applied, EditState)
        dumped = applied.model_dump()
        assert "exposure" in dumped
        assert "white_balance" in dumped
        assert "color_grading" in dumped
        assert "detail" in dumped
        assert "lens_correction" in dumped


def test_preset_application_is_non_destructive(preset_service: PresetService):
    """Verify that applying a preset only modifies touched fields, preserving unrelated edits."""
    initial_state = EditState(asset_id="test_photo")
    initial_state.exposure.exposure = 1.25
    initial_state.geometry.rotation = 90.0

    # Select a preset that modifies white_balance and tone
    presets = preset_service.get_presets()
    target_preset = next(p for p in presets if "B&W" in p.name or "Monochrome" in p.category)

    applied = preset_service.apply_preset(target_preset, initial_state)

    # Crop was not in the preset and should be strictly preserved
    assert applied.geometry.rotation == 90.0


def test_custom_user_preset_crud(preset_service: PresetService):
    """Verify creating, listing, fetching, applying, and deleting custom user presets."""
    # 1. Create custom preset
    st = EditState(asset_id="test_photo")
    st.exposure.exposure = 0.45
    st.exposure.contrast = 25.0
    st.white_balance.temperature = 18.0
    created = preset_service.create_preset_from_edit_state(
        name="My Sunset Recipe",
        category="Custom",
        edit_state=st,
    )
    assert created.id
    assert created.name == "My Sunset Recipe"
    assert created.category == "Custom"
    assert created.parameters["exposure"]["exposure"] == 0.45

    # 2. Verify it appears in get_presets()
    all_presets = preset_service.get_presets()
    found = next((p for p in all_presets if p.id == created.id), None)
    assert found is not None
    assert found.name == "My Sunset Recipe"

    # 3. Apply custom preset
    base = EditState(asset_id="test_photo")
    res = preset_service.apply_preset(found, base)
    assert res.exposure.exposure == 0.45
    assert res.exposure.contrast == 25.0
    assert res.white_balance.temperature == 18.0

    # 4. Delete custom preset
    preset_service.delete_preset(created.id)
    after_delete = preset_service.get_presets()
    assert not any(p.id == created.id for p in after_delete)


def test_apply_preset_by_invalid_data_handles_gracefully(preset_service: PresetService):
    """Verify applying with empty or corrupt parameters returns state gracefully."""
    base = EditState(asset_id="test_photo")
    from kurolight.domain.presets import Preset

    dummy = Preset(id="invalid_dummy", name="Dummy", category="Test", parameters={})
    res = preset_service.apply_preset(dummy, base)
    assert isinstance(res, EditState)
    assert res.exposure.exposure == 0.0
