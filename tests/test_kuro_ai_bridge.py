import json
import threading
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

from kurolight.config.app_config import AppConfig
from kurolight.domain.editing import EditState
from kurolight.domain.metadata import AssetMetadataOverrides
from kurolight.ui.web_bridge import PyBridge


class EventRecorder:
    def emit(self, *_args):
        return None


def test_ai_proposal_is_not_applied_until_approval(tmp_path: Path):
    source_path = tmp_path / "photo.jpg"
    source_path.write_bytes(b"placeholder")
    asset = SimpleNamespace(
        id="asset-1",
        source_path=source_path,
        file_name="photo.jpg",
        file_type="jpg",
        width=100,
        height=100,
        file_size=10,
        rating=0,
        flag="unflagged",
        metadata={},
        date_captured=None,
        metadata_overrides=AssetMetadataOverrides(),
    )
    initial_state = EditState(asset_id=asset.id)
    original_state = initial_state.model_copy(deep=True)
    app_state = SimpleNamespace(
        active_asset=asset,
        current_edit_state=initial_state,
        set_current_edit_state=lambda state: setattr(app_state, "current_edit_state", state),
    )
    buffer = object()
    processor = SimpleNamespace(
        process=lambda _buffer, _state: buffer,
        create_preview=lambda image, max_edge: image,
    )
    editing_service = SimpleNamespace(
        processor=processor,
        get_or_load_source_buffer=lambda _asset_id, _path: buffer,
    )
    bridge = SimpleNamespace(
        app_state=app_state,
        _lock=threading.RLock(),
        editing_service=editing_service,
        config=SimpleNamespace(
            ai=SimpleNamespace(
                provider="openai",
                model="gpt-4o",
                privacy_disclosure_accepted=True,
                send_image_context=True,
            )
        ),
        kuro_ai_service=SimpleNamespace(
            analyze=lambda *_args: {
                "message": "A small exposure lift should help.",
                "edits": {"exposure": {"exposure": 0.5}},
            }
        ),
        _merge_ai_edit_proposal=PyBridge._merge_ai_edit_proposal,
        _asset_to_dict=PyBridge._asset_to_dict,
        _edit_state_fingerprint=PyBridge._edit_state_fingerprint,
        _buffer_to_data_url=lambda _buffer: "data:image/jpeg;base64,aW1hZ2U=",
    )

    proposal = json.loads(PyBridge.propose_ai_edits(bridge, "Brighten this photo"))

    assert app_state.current_edit_state is initial_state
    assert app_state.current_edit_state.exposure.exposure == 0
    assert proposal["candidate_state"]["exposure"]["exposure"] == 0.5

    timer = SimpleNamespace(stop=lambda: None)
    bridge._render_timer = timer
    bridge._save_timer = timer
    bridge._edit_start_state = None
    bridge._pending_edit_state = None
    bridge._do_render_preview = lambda: None
    bridge._do_commit_edit_state = lambda: None
    bridge.asset_selected = EventRecorder()
    bridge.notification = EventRecorder()
    app_state.current_edit_state.exposure.exposure = 0.25
    try:
        PyBridge.apply_ai_proposal(
            bridge,
            json.dumps(proposal["candidate_state"]),
            asset.id,
            proposal["base_state_fingerprint"],
        )
    except ValueError as error:
        assert "settings changed" in str(error)
    else:
        raise AssertionError("A stale Kuro AI preview was applied")

    app_state.current_edit_state = original_state
    PyBridge.apply_ai_proposal(
        bridge,
        json.dumps(proposal["candidate_state"]),
        asset.id,
        proposal["base_state_fingerprint"],
    )

    assert app_state.current_edit_state.exposure.exposure == 0.5


def test_ai_privacy_disclosure_must_be_accepted_before_proposal(tmp_path: Path):
    source_path = tmp_path / "photo.jpg"
    source_path.write_bytes(b"placeholder")
    config = AppConfig()
    config.ai.provider = "openai"
    config.ai.model = "gpt-4o"
    config.ai.privacy_disclosure_accepted = False
    asset = SimpleNamespace(
        id="asset-1",
        source_path=source_path,
        file_name="photo.jpg",
        file_type="jpg",
        width=100,
        height=100,
        file_size=10,
        metadata={},
        date_captured=None,
        metadata_overrides=AssetMetadataOverrides(),
    )

    bridge = SimpleNamespace(
        app_state=SimpleNamespace(active_asset=asset, current_edit_state=EditState(asset_id=asset.id)),
        config=config,
        _lock=threading.RLock(),
        editing_service=SimpleNamespace(
            processor=SimpleNamespace(
                process=lambda _buffer, _state: object(),
                create_preview=lambda _buffer, max_edge=1280: _buffer,
            ),
            get_or_load_source_buffer=lambda _asset_id, _path: object(),
        ),
        kuro_ai_service=SimpleNamespace(analyze=lambda *args, **kwargs: {"message": "hi", "edits": {}}),
        _buffer_to_data_url=lambda _buffer: "data:image/jpeg;base64,aW1hZ2U=",
    )

    with pytest.raises(ValueError, match="privacy disclosure"):
        PyBridge.propose_ai_edits(bridge, "Brighten this photo")


def test_ai_edit_proposal_rejects_fields_outside_edit_state():
    current = EditState(asset_id="asset-1").model_dump(mode="json")

    try:
        PyBridge._merge_ai_edit_proposal(
            current, {"unsupported_setting": {"unsafe": True}}, EditState
        )
    except ValueError as error:
        assert "unsupported EditState fields" in str(error)
    else:
        raise AssertionError("Unsupported Kuro AI proposal field was accepted")


def test_auto_tone_uses_source_analysis_and_preserves_unrelated_settings(tmp_path: Path):
    source_path = tmp_path / "photo.jpg"
    source_path.write_bytes(b"placeholder")
    asset = SimpleNamespace(id="asset-1", source_path=source_path, file_name="photo.jpg")
    state = EditState(asset_id=asset.id)
    state.white_balance.saturation = 17
    state.white_balance.vibrance = 23
    state.detail.clarity = 8
    source = np.empty((8, 8, 3), dtype=np.float32)
    source[:] = (0.2, 0.3, 0.4)
    app_state = SimpleNamespace(
        active_asset=asset,
        current_edit_state=state,
        set_current_edit_state=lambda updated: setattr(app_state, "current_edit_state", updated),
    )
    bridge = SimpleNamespace(
        app_state=app_state,
        editing_service=SimpleNamespace(get_or_load_source_buffer=lambda *_args: source),
        _edit_start_state=None,
        _do_render_preview=lambda: None,
        _save_timer=SimpleNamespace(start=lambda *_args: None),
        asset_selected=EventRecorder(),
    )

    PyBridge.auto_tone(bridge)

    assert app_state.current_edit_state.exposure.exposure != 0.25
    assert app_state.current_edit_state.white_balance.temperature > 0
    assert app_state.current_edit_state.white_balance.saturation == 17
    assert app_state.current_edit_state.white_balance.vibrance == 23
    assert app_state.current_edit_state.detail.clarity == 8
