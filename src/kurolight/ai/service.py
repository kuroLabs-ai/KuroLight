"""Provider-backed Kuro AI image analysis and reviewable edit proposals."""

from __future__ import annotations

import base64
import json
import re
from typing import Any

import httpx

from kurolight.infrastructure.logging import get_logger

logger = get_logger("ai.service")

PROVIDERS = {"gemini", "openai", "anthropic"}

PERSONALITY = """You are Kuro, a thoughtful, confident photo-editing assistant inside KuroLight.
Study the actual attached image before answering. Describe visible content honestly; do not
invent camera facts or claim edits were applied. Be concise, warm, and explain photographic
choices in the user's language. You can propose only these non-destructive KuroLight edit
controls: exposure (exposure -5..5 EV, contrast/highlights/shadows/whites/blacks -100..100),
white_balance (temperature/tint/saturation/vibrance -100..100), detail (sharpening and
noise_reduction 0..100; clarity/texture/dehaze -100..100), color_grading (lift/gamma/gain/offset
objects with hue 0..360, saturation 0..1, luminance -1..1), geometry (rotation -180..180,
crop_x/crop_y/crop_width/crop_height 0..1), tone_curves (rgb_points/red_points/green_points/
blue_points arrays of normalized x/y points), and hsl (8 named color bands, each with hue,
saturation, luminance -100..100). Never propose changes to asset_id, masks, metadata, or
application settings. Do not execute edits. Return ONLY JSON shaped as
{"message":"helpful response or image analysis","edits":{...}}. For analysis without a requested
change, return an empty edits object. For an edit request, return only the changed nested fields.
Keep geometry unchanged unless explicitly requested."""


class KuroAIService:
    """Calls supported vision-chat APIs and validates model selections."""

    def list_models(self, provider: str, api_key: str) -> list[dict[str, str]]:
        provider = self._validate_provider(provider)
        if not api_key.strip():
            raise ValueError(f"Add a {provider.title()} API key in Settings first.")
        with httpx.Client(timeout=20.0) as client:
            response = client.get(
                self._models_url(provider),
                headers=self._headers(provider, api_key),
                params={"key": api_key} if provider == "gemini" else None,
            )
        self._raise_for_response(response)
        payload = response.json()

        if provider == "gemini":
            models = [
                {
                    "id": item["name"].removeprefix("models/"),
                    "name": item.get("displayName", item["name"]),
                }
                for item in payload.get("models", [])
                if "generateContent" in item.get("supportedGenerationMethods", [])
            ]
        elif provider == "openai":
            models = [
                {"id": item["id"], "name": item["id"]}
                for item in payload.get("data", [])
                if item.get("id", "").startswith(("gpt-4o", "gpt-4.1", "gpt-4.5"))
                and not item.get("id", "").endswith(("-audio", "-transcribe"))
            ]
        else:
            models = [
                {"id": item["id"], "name": item.get("display_name", item["id"])}
                for item in payload.get("data", [])
                if item.get("id", "").startswith(("claude-3", "claude-4"))
            ]

        return sorted(models, key=lambda model: model["id"], reverse=True)

    def analyze(
        self,
        provider: str,
        model: str,
        api_key: str,
        prompt: str,
        image_data_url: str,
        current_state: dict[str, Any],
        image_metadata: dict[str, Any],
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        provider = self._validate_provider(provider)
        if not model.strip():
            raise ValueError("Select a model in Kuro AI Settings.")
        if not api_key.strip():
            raise ValueError(f"Add a {provider.title()} API key in Settings first.")
        mime_type, image_data = self._parse_image_data_url(image_data_url)
        request_prompt = (
            f"User request: {prompt}\n\n"
            "Image metadata (may be incomplete): "
            f"{json.dumps(image_metadata, ensure_ascii=False)}\n"
            f"Current edit settings: {json.dumps(current_state, ensure_ascii=False)}\n"
            "Analyze the attached photo and respond in the user's language. If they ask for "
            "an edit, return a conservative proposed edit patch. Do not assume it is approved."
        )
        with httpx.Client(timeout=httpx.Timeout(60.0, connect=15.0)) as client:
            if provider == "openai":
                messages = [{"role": "system", "content": PERSONALITY}]
                messages.extend(
                    {"role": item["role"], "content": item["content"]} for item in (history or [])
                )
                messages.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": request_prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": image_data_url, "detail": "low"},
                            },
                        ],
                    }
                )
                response = client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers=self._headers(provider, api_key),
                    json={
                        "model": model,
                        "temperature": 0.4,
                        "response_format": {"type": "json_object"},
                        "messages": messages,
                    },
                )
                self._raise_for_response(response)
                raw = response.json()["choices"][0]["message"]["content"]
            elif provider == "gemini":
                response = client.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                    headers=self._headers(provider, api_key),
                    params={"key": api_key},
                    json={
                        "system_instruction": {"parts": [{"text": PERSONALITY}]},
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "temperature": 0.4,
                        },
                        "contents": [
                            *[
                                {
                                    "role": "model" if item["role"] == "assistant" else "user",
                                    "parts": [{"text": item["content"]}],
                                }
                                for item in (history or [])
                            ],
                            {
                                "role": "user",
                                "parts": [
                                    {"text": request_prompt},
                                    {"inline_data": {"mime_type": mime_type, "data": image_data}},
                                ],
                            },
                        ],
                    },
                )
                self._raise_for_response(response)
                raw = response.json()["candidates"][0]["content"]["parts"][0]["text"]
            else:
                response = client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers=self._headers(provider, api_key),
                    json={
                        "model": model,
                        "max_tokens": 1200,
                        "system": PERSONALITY,
                        "messages": [
                            *[
                                {"role": item["role"], "content": item["content"]}
                                for item in (history or [])
                            ],
                            {
                                "role": "user",
                                "content": [
                                    {"type": "text", "text": request_prompt},
                                    {
                                        "type": "image",
                                        "source": {
                                            "type": "base64",
                                            "media_type": mime_type,
                                            "data": image_data,
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                )
                self._raise_for_response(response)
                raw = "".join(
                    item.get("text", "")
                    for item in response.json().get("content", [])
                    if item.get("type") == "text"
                )

        if not isinstance(raw, str):
            raise ValueError("The selected model returned an empty or unsupported response.")
        try:
            result = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning("Kuro AI returned invalid structured output")
            raise ValueError(
                "The selected model did not return a valid edit proposal. Try again."
            ) from exc
        if not isinstance(result, dict):
            raise TypeError("The selected model returned an unsupported response.")
        message = result.get("message")
        edits = result.get("edits", {})
        if not isinstance(message, str) or not isinstance(edits, dict):
            raise TypeError("The selected model returned an unsupported response.")
        return {"message": message, "edits": edits}

    @staticmethod
    def _parse_image_data_url(value: str) -> tuple[str, str]:
        if not isinstance(value, str) or not value.startswith("data:image/"):
            raise ValueError("Kuro AI needs a valid image preview to analyze.")
        header, separator, encoded = value.partition(",")
        if not separator or ";base64" not in header:
            raise ValueError("Image preview must use base64 encoding.")
        mime_type = header[5:].split(";", 1)[0]
        if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise ValueError("Kuro AI supports JPEG, PNG, and WebP image previews.")
        if len(encoded) > 18_000_000:
            raise ValueError("Image preview is too large to send to the AI provider.")
        try:
            base64.b64decode(encoded, validate=True)
        except ValueError as exc:
            raise ValueError("Image preview data is invalid.") from exc
        return mime_type, encoded

    @staticmethod
    def _validate_provider(provider: str) -> str:
        normalized = str(provider).lower()
        if normalized not in PROVIDERS:
            raise ValueError(f"Unsupported Kuro AI provider: {provider}")
        return normalized

    @staticmethod
    def _models_url(provider: str) -> str:
        return {
            "gemini": "https://generativelanguage.googleapis.com/v1beta/models",
            "openai": "https://api.openai.com/v1/models",
            "anthropic": "https://api.anthropic.com/v1/models",
        }[provider]

    @staticmethod
    def _headers(provider: str, api_key: str) -> dict[str, str]:
        if provider == "anthropic":
            return {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
        if provider == "openai":
            return {"Authorization": f"Bearer {api_key}"}
        return {}

    @staticmethod
    @staticmethod
    def _redact_sensitive_detail(message: str) -> str:
        if not isinstance(message, str):
            return ""
        redacted = re.sub(r"(?i)(Authorization\s*:\s*Bearer\s+)([A-Za-z0-9._-]+)", r"\1[REDACTED]", message)
        redacted = re.sub(r"(?i)(api[_-]?key\s*[:=]\s*)([A-Za-z0-9._-]+)", r"\1[REDACTED]", redacted)
        return redacted

    @staticmethod
    def _raise_for_response(response: httpx.Response) -> None:
        if response.is_success:
            return
        try:
            payload = response.json()
            detail = payload.get("error", {}).get("message") or payload.get("message")
        except (ValueError, AttributeError):
            detail = None
        if response.status_code in {401, 403}:
            raise ValueError("The API key was rejected. Check the key and provider in Settings.")
        if response.status_code == 404:
            raise ValueError("The selected model is unavailable for this account or provider.")
        message = KuroAIService._redact_sensitive_detail(str(detail)[:400]) if detail else f"Provider returned HTTP {response.status_code}."
        raise ValueError(f"Kuro AI provider error: {message}")
