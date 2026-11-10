import base64
import json

import pytest

from kurolight.ai.service import KuroAIService


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.is_success = status_code < 400

    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, response, capture=None):
        self.response = response
        self.capture = capture

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def get(self, url, **kwargs):
        if self.capture is not None:
            self.capture.update(url=url, **kwargs)
        return self.response

    def post(self, url, **kwargs):
        if self.capture is not None:
            self.capture.update(url=url, **kwargs)
        return self.response


def test_list_models_filters_to_supported_openai_vision_models(monkeypatch):
    captured = {}
    monkeypatch.setattr(
        "kurolight.ai.service.httpx.Client",
        lambda **_kwargs: FakeClient(
            FakeResponse(
                {
                    "data": [
                        {"id": "gpt-4o-mini"},
                        {"id": "gpt-4.1"},
                        {"id": "whisper-1"},
                    ]
                }
            ),
            captured,
        ),
    )

    models = KuroAIService().list_models("openai", "test-key")

    assert {model["id"] for model in models} == {"gpt-4o-mini", "gpt-4.1"}
    assert captured["headers"] == {"Authorization": "Bearer test-key"}


def test_analyze_sends_image_and_returns_structured_proposal(monkeypatch):
    captured = {}
    raw = json.dumps(
        {"message": "Lift the shadows slightly.", "edits": {"exposure": {"shadows": 12}}}
    )
    monkeypatch.setattr(
        "kurolight.ai.service.httpx.Client",
        lambda **_kwargs: FakeClient(
            FakeResponse({"choices": [{"message": {"content": raw}}]}),
            captured,
        ),
    )
    image = base64.b64encode(b"image-bytes").decode("ascii")

    result = KuroAIService().analyze(
        "openai",
        "gpt-4o",
        "test-key",
        "Brighten the image",
        f"data:image/jpeg;base64,{image}",
        {"exposure": {"shadows": 0}},
        {"file_name": "sample.jpg"},
        [{"role": "user", "content": "What do you see?"}],
    )

    assert result == {
        "message": "Lift the shadows slightly.",
        "edits": {"exposure": {"shadows": 12}},
    }
    request = captured["json"]
    assert request["messages"][1]["content"] == "What do you see?"
    assert request["messages"][2]["content"][1]["image_url"]["url"].startswith("data:image/jpeg")


def test_analyze_rejects_malformed_image_data():
    with pytest.raises(ValueError, match="valid image preview"):
        KuroAIService().analyze("openai", "gpt-4o", "test-key", "analyze", "not-an-image", {}, {})


def test_list_models_requires_api_key():
    with pytest.raises(ValueError, match="API key"):
        KuroAIService().list_models("gemini", "")
