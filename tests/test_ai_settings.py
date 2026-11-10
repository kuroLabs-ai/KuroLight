import json
import threading
from types import SimpleNamespace

from kurolight.ai.service import KuroAIService
from kurolight.ui.web_bridge import PyBridge


def test_ai_api_key_is_saved_in_keyring_not_application_config(monkeypatch):
    stored = {}
    monkeypatch.setattr(
        "keyring.set_password",
        lambda service, username, password: stored.__setitem__((service, username), password),
    )
    monkeypatch.setattr(
        "keyring.get_password",
        lambda service, username: stored.get((service, username)),
    )
    config = SimpleNamespace(
        ai=SimpleNamespace(provider="gemini", model="gemini-2.5-flash"),
        save=lambda: None,
    )
    bridge = SimpleNamespace(
        config=config,
        _lock=threading.RLock(),
        kuro_ai_service=SimpleNamespace(
            list_models=lambda provider, api_key: [{"id": "gpt-4o-mini", "name": "GPT-4o mini"}],
        ),
    )
    bridge.get_ai_settings = lambda: PyBridge.get_ai_settings(bridge)

    result = json.loads(
        PyBridge.save_ai_settings(
            bridge,
            json.dumps(
                {
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "api_key": "test-secret",
                }
            ),
        )
    )

    assert result == {
        "provider": "openai",
        "model": "gpt-4o-mini",
        "has_api_key": True,
        "saved_keys": {
            "gemini": False,
            "openai": True,
            "anthropic": False,
        },
        "privacy_disclosure_accepted": False,
        "privacy_disclosure_version": "2026-11",
        "send_image_context": True,
    }
    assert stored[("KuroLight", "kuro-ai:openai")] == "test-secret"
    assert not hasattr(config, "api_key")


def test_ai_settings_consent_and_context_toggle_persists(monkeypatch):
    stored = {("KuroLight", "kuro-ai:gemini"): "active-gemini-key"}
    monkeypatch.setattr(
        "keyring.get_password",
        lambda service, username: stored.get((service, username)),
    )
    monkeypatch.setattr(
        "keyring.set_password",
        lambda service, username, password: stored.__setitem__((service, username), password),
    )
    config = SimpleNamespace(
        ai=SimpleNamespace(
            provider="gemini",
            model="gemini-2.5-flash",
            privacy_disclosure_accepted=False,
            privacy_disclosure_version="2026-11",
            send_image_context=True,
        ),
        save=lambda: None,
    )
    bridge = SimpleNamespace(
        config=config,
        _lock=threading.RLock(),
        kuro_ai_service=SimpleNamespace(
            list_models=lambda provider, api_key: [{"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash"}],
        ),
    )
    bridge.get_ai_settings = lambda: PyBridge.get_ai_settings(bridge)

    result = json.loads(
        PyBridge.save_ai_settings(
            bridge,
            json.dumps(
                {
                    "provider": "gemini",
                    "model": "gemini-2.5-flash",
                    "privacy_disclosure_accepted": True,
                    "privacy_disclosure_version": "2026-11",
                    "send_image_context": False,
                }
            ),
        )
    )

    assert result["privacy_disclosure_accepted"] is True
    assert result["send_image_context"] is False
    assert config.ai.privacy_disclosure_accepted is True
    assert config.ai.send_image_context is False


def test_ai_settings_key_removal_deletes_from_keyring(monkeypatch):
    stored = {("KuroLight", "kuro-ai:anthropic"): "secret-claude-key"}
    monkeypatch.setattr(
        "keyring.get_password",
        lambda service, username: stored.get((service, username)),
    )
    monkeypatch.setattr(
        "keyring.delete_password",
        lambda service, username: stored.pop((service, username), None),
    )
    config = SimpleNamespace(
        ai=SimpleNamespace(
            provider="anthropic",
            model="claude-3-7-sonnet-latest",
            privacy_disclosure_accepted=True,
            send_image_context=True,
        ),
        save=lambda: None,
    )
    bridge = SimpleNamespace(
        config=config,
        _lock=threading.RLock(),
        kuro_ai_service=SimpleNamespace(
            list_models=lambda provider, api_key: [{"id": "claude-3-7-sonnet-latest", "name": "Claude 3.7"}],
        ),
    )
    bridge.get_ai_settings = lambda: PyBridge.get_ai_settings(bridge)

    result = json.loads(
        PyBridge.save_ai_settings(
            bridge,
            json.dumps(
                {
                    "provider": "anthropic",
                    "model": "claude-3-7-sonnet-latest",
                    "remove_api_key": True,
                }
            ),
        )
    )

    assert ("KuroLight", "kuro-ai:anthropic") not in stored
    assert result["has_api_key"] is False


def test_ai_provider_error_redacts_bearer_tokens_and_api_keys():
    raw_error = "Failed with Authorization: Bearer sk-1234567890abcdef and api_key=xyz987654321"
    redacted = KuroAIService._redact_sensitive_detail(raw_error)
    assert "sk-1234567890abcdef" not in redacted
    assert "xyz987654321" not in redacted
    assert "[REDACTED]" in redacted
