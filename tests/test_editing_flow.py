import base64
import json

import numpy as np
import pytest
from PIL import Image
from pydantic import ValidationError

from kurolight.app.command_dispatcher import (
    CommandDispatcher,
    EditStateSnapshotCommand,
)
from kurolight.domain.assets import ImageAsset
from kurolight.domain.editing import EditState
from kurolight.domain.export import (
    ColorSpace,
    ExportFormat,
    ExportJob,
    ExportSettings,
)
from kurolight.main import _dispatch_cli_command, _print_command_catalog
from kurolight.processing.buffer import ImageBuffer
from kurolight.services.editing_service import EditingService
from kurolight.services.export_service import ExportService
from kurolight.services.project_service import ProjectService
from kurolight.ui.web_bridge import PyBridge


def test_bridge_edit_update_validates_without_mutating_current_state():
    current = EditState(asset_id="photo")

    updated = PyBridge._apply_dict_to_edit_state(
        current,
        {
            "exposure": {"exposure": 1.25},
            "white_balance": {"temperature": -40},
        },
    )

    assert updated.exposure.exposure == 1.25
    assert updated.white_balance.temperature == -40
    assert current.exposure.exposure == 0
    assert current.white_balance.temperature == 0

    with pytest.raises(ValidationError):
        PyBridge._apply_dict_to_edit_state(
            current, {"exposure": {"exposure": 5.1}}
        )

    assert current.exposure.exposure == 0


def test_web_bridge_save_edit_state_persists_values_in_catalog(tmp_path):
    database_path = tmp_path / "catalog.sqlite"
    source_path = tmp_path / "photo.png"
    Image.new("RGB", (2, 2), color=(20, 40, 60)).save(source_path)

    project_service = ProjectService.open_or_create_project(database_path)
    try:
        project = project_service.get_current_project()
        assert project is not None
        asset = ImageAsset.create(source_path, project.id)
        project_service.asset_repo.save(asset)

        payload = EditState(asset_id=asset.id).model_dump(mode="json")
        payload["exposure"]["exposure"] = 1.25
        payload["color_grading"]["gain"]["saturation"] = 0.75
        payload["tone_curves"]["rgb_points"] = [
            {"x": 0.0, "y": 0.0},
            {"x": 0.4, "y": 0.65},
            {"x": 1.0, "y": 1.0},
        ]

        bridge = PyBridge.__new__(PyBridge)
        bridge.library_service = project_service
        bridge.editing_service = EditingService(project_service.edit_state_repo)
        bridge.save_edit_state(json.dumps(payload))

        restored = EditingService(project_service.edit_state_repo).get_edit_state(asset.id)
        assert restored.exposure.exposure == 1.25
        assert restored.color_grading.gain.saturation == 0.75
        assert restored.tone_curves.rgb_points[1].y == 0.65
    finally:
        project_service.db_manager.close_thread_connection()


def test_export_uses_unsaved_browser_state_without_persisting_it(tmp_path):
    database_path = tmp_path / "catalog.sqlite"
    source_path = tmp_path / "photo.png"
    Image.new("RGB", (4, 4), color=(30, 60, 90)).save(source_path)
    project_service = ProjectService.open_or_create_project(database_path)

    class CapturingExportJobManager:
        jobs = []

        def start(self, jobs):
            self.jobs = jobs
            return "export-job"

    try:
        project = project_service.get_current_project()
        assert project is not None
        asset = ImageAsset.create(source_path, project.id)
        project_service.asset_repo.save(asset)
        untouched_path = tmp_path / "untouched.png"
        Image.new("RGB", (4, 4), color=(90, 60, 30)).save(untouched_path)
        untouched_asset = ImageAsset.create(untouched_path, project.id)
        project_service.asset_repo.save(untouched_asset)

        saved_state = EditState(asset_id=asset.id)
        saved_state.exposure.exposure = 0.25
        project_service.edit_state_repo.save(saved_state)

        current_state = saved_state.model_copy(deep=True)
        current_state.exposure.exposure = 1.5
        current_state.color_grading.lut_name = "Imported Look"
        cube_data = base64.b64encode(
            np.full((2, 2, 2, 3), 0.25, dtype="<f4").tobytes()
        ).decode("ascii")
        export_jobs = CapturingExportJobManager()
        bridge = PyBridge.__new__(PyBridge)
        bridge.library_service = project_service
        bridge.editing_service = EditingService(project_service.edit_state_repo)
        bridge.export_service = ExportService()
        bridge.export_job_manager = export_jobs

        result = json.loads(
            bridge.export_assets(
                json.dumps(
                    {
                        "asset_ids": [asset.id, untouched_asset.id],
                        "edit_states": {
                            asset.id: current_state.model_dump(mode="json")
                        },
                        "custom_luts": {
                            "Imported Look": {
                                "size": 2,
                                "data_base64": cube_data,
                            }
                        },
                        "format": "PNG",
                        "output_folder": str(tmp_path / "exports"),
                    }
                )
            )
        )

        assert result["ok"]
        assert export_jobs.jobs[0].edit_state.exposure.exposure == 1.5
        assert export_jobs.jobs[0].custom_luts["Imported Look"].data_base64 == cube_data
        assert export_jobs.jobs[1].edit_state.asset_id == untouched_asset.id
        assert export_jobs.jobs[1].edit_state.exposure.exposure == 0
        assert (
            project_service.edit_state_repo.get_by_asset_id(untouched_asset.id)
            is None
        )
        assert project_service.edit_state_repo.get_by_asset_id(
            asset.id
        ).exposure.exposure == 0.25
    finally:
        project_service.db_manager.close_thread_connection()


def test_bridge_preview_sends_raw_source_for_webgl_rendering(tmp_path):
    source_path = tmp_path / "source.png"
    source_path.write_bytes(b"source")
    asset = type(
        "Asset",
        (),
        {"id": "photo", "file_name": "photo.png", "source_path": source_path},
    )()
    raw_buffer = ImageBuffer.from_numpy(
        np.full((2, 2, 3), 0.25, dtype=np.float32)
    )
    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = type("AppState", (), {"active_asset": asset})()
    bridge.editing_service = type(
        "EditingServiceStub",
        (),
        {"get_or_load_source_buffer": lambda *_args: raw_buffer},
    )()
    bridge._missing_source_notified = set()
    bridge.config = type(
        "Config",
        (),
        {
            "performance": type(
                "Performance",
                (),
                {"preview_quality": "balanced", "preview_max_edge": 2048},
            )(),
        },
    )()

    class CapturedEvent:
        value = None

        def emit(self, value):
            self.value = value

    bridge.image_updated = CapturedEvent()
    bridge.before_image_updated = CapturedEvent()
    bridge.notification = type("NotificationEvent", (), {"emit": lambda *_args: None})()

    bridge._do_render_preview()

    assert bridge.image_updated.value.startswith("data:image/")
    assert bridge.before_image_updated.value == bridge.image_updated.value


def test_dispatcher_supports_typed_registry_and_bridge_dispatch(capsys):
    state = EditState(asset_id="photo-42")
    dispatcher = CommandDispatcher()

    catalog = dispatcher.get_command_catalog()
    command_ids = {item["id"] for item in catalog}
    assert {"undo", "redo", "edit_state_update", "kuro_ai_apply_proposal"}.issubset(command_ids)

    ai_spec = dispatcher._command_specs["kuro_ai_apply_proposal"]
    assert ai_spec.authorization == "trusted_user"
    assert ai_spec.shortcut == ("Ctrl+K", "⌘K")
    assert ai_spec.payload_limit_bytes > 0
    assert ai_spec.retry_policy == "retry_on_stale_state"

    result = dispatcher.dispatch(
        "edit_state_update",
        {"asset_id": "photo-42", "patch": {"exposure": {"exposure": 0.75}}},
        state,
    )
    assert result.ok
    assert result.result["state"]["exposure"]["exposure"] == 0.75

    invalid = dispatcher.dispatch(
        "edit_state_update",
        {"asset_id": "other-photo", "patch": "bad"},
        state,
    )
    assert not invalid.ok
    assert invalid.error_code == "invalid_input"

    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = type("AppStateShim", (), {"current_edit_state": state})()
    bridge.command_dispatcher = dispatcher

    bridge_response = json.loads(
        bridge.dispatch_command(
            "edit_state_update",
            json.dumps({"asset_id": "photo-42", "patch": {"white_balance": {"temperature": 24}}}),
        )
    )
    assert bridge_response["ok"]
    assert bridge_response["result"]["state"]["white_balance"]["temperature"] == 24

    list_result = _print_command_catalog()
    assert list_result == 0
    captured = capsys.readouterr().out
    assert "kuro_ai_apply_proposal" in captured
    assert "payload_limit_bytes" in captured

    dispatch_result = _dispatch_cli_command(
        "edit_state_update",
        json.dumps({"asset_id": "photo-42", "patch": {"white_balance": {"tint": -2}}}),
    )
    assert dispatch_result == 0


def test_float_to_uint8_quantization_is_bounded_to_one_lsb():
    values = np.array([[[0.0, 0.1, 0.5], [0.999, 1.0, -0.1]]], dtype=np.float32)
    buffer = ImageBuffer.from_numpy(values)

    encoded = buffer.to_uint8()
    normalized_error = np.abs(np.clip(values, 0, 1) - encoded.astype(np.float32) / 255)

    assert np.array_equal(encoded, (np.clip(values, 0, 1) * 255).astype(np.uint8))
    assert np.all(normalized_error < 1 / 255)


def test_edits_persist_undo_preview_and_export_consistently(tmp_path):
    database_path = tmp_path / "catalog.sqlite"
    source_path = tmp_path / "photo.png"
    output_path = tmp_path / "edited.png"
    source_pixels = np.array([[[64, 128, 192], [32, 96, 160]]], dtype=np.uint8)
    Image.fromarray(source_pixels).save(source_path)

    service = ProjectService.open_or_create_project(database_path)
    try:
        project = service.get_current_project()
        assert project is not None
        asset = ImageAsset.create(source_path, project.id)
        service.asset_repo.save(asset)

        before = EditState(asset_id=asset.id)
        edited = PyBridge._apply_dict_to_edit_state(
            before,
            {
                "exposure": {"exposure": 1.0},
                "white_balance": {"temperature": 30, "tint": -10},
            },
        )
        dispatcher = CommandDispatcher()
        dispatcher.execute_command(
            EditStateSnapshotCommand(before, edited, "Exposure and white balance"),
            before,
        )
        service.edit_state_repo.save(edited)
        history, active_index = dispatcher.serialize_history()
        service.edit_history_repo.save(asset.id, history, active_index)

        restored_state = service.edit_state_repo.get_by_asset_id(asset.id)
        restored_history = service.edit_history_repo.get_by_asset_id(asset.id)
        assert restored_state is not None
        assert restored_history is not None
        assert restored_state.exposure.exposure == 1.0
        assert restored_state.white_balance.temperature == 30

        restored_dispatcher = CommandDispatcher()
        restored_dispatcher.restore_history(*restored_history)
        undone = restored_dispatcher.undo(restored_state)
        assert undone.exposure.exposure == 0
        assert undone.white_balance.temperature == 0
        redone = restored_dispatcher.redo(undone)
        assert redone.exposure.exposure == 1.0
        assert redone.white_balance.tint == -10

        preview = EditingService(service.edit_state_repo).render_preview(
            asset.id, source_path, redone
        )
        export_result = ExportService().export_job(
            ExportJob(
                asset_id=asset.id,
                asset_name=asset.file_name,
                source_path=source_path,
                target_path=output_path,
                settings=ExportSettings(
                    format=ExportFormat.PNG,
                    output_dir=tmp_path,
                ),
                edit_state=redone,
            )
        )

        assert export_result.success
        with Image.open(output_path) as exported:
            np.testing.assert_array_equal(
                np.asarray(exported.convert("RGB")), preview.to_uint8()
            )
    finally:
        service.db_manager.close_thread_connection()


def test_export_rejects_unimplemented_wide_gamut_profiles(tmp_path):
    output_path = tmp_path / "wide-gamut.png"
    result = ExportService().export_job(
        ExportJob(
            asset_id="photo",
            asset_name="photo.png",
            source_path=tmp_path / "source-does-not-need-to-be-read.png",
            target_path=output_path,
            settings=ExportSettings(
                format=ExportFormat.PNG,
                output_dir=tmp_path,
                color_space=ColorSpace.DISPLAY_P3,
            ),
            edit_state=EditState(asset_id="photo"),
        )
    )

    assert not result.success
    assert "Only sRGB export is currently supported" in (result.error_message or "")
    assert not output_path.exists()


@pytest.mark.parametrize(
    ("profile", "error"),
    [
        ("Adobe RGB", "Only sRGB export is currently supported"),
        ("Display P3", "Only sRGB export is currently supported"),
        ("not-a-profile", "Unsupported color profile"),
    ],
)
def test_export_bridge_rejects_unsupported_color_profiles(profile, error):
    bridge = PyBridge.__new__(PyBridge)
    bridge.export_service = object()

    result = json.loads(
        bridge.export_assets(
            json.dumps({"asset_ids": ["photo"], "color_space": profile})
        )
    )

    assert not result["ok"]
    assert error in result["error"]
