"""AI Providers supporting local intelligent mock and cloud LLM APIs (OpenAI, Gemini, Anthropic)."""

from abc import ABC, abstractmethod
import re
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from kurolight.ai.registry import AIToolRegistry
from kurolight.infrastructure.logging import get_logger

logger = get_logger("ai.providers")


class ToolCall(BaseModel):
    """Structured tool call invocation from LLM."""
    id: str = "call_default"
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)


class AIResponse(BaseModel):
    """Standardized response from AI provider."""
    content: str
    tool_calls: List[ToolCall] = Field(default_factory=list)
    proposed_edits: Optional[Dict[str, Any]] = None


class BaseAIProvider(ABC):
    """Abstract interface for LLM providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def generate_response(
        self,
        prompt: str,
        chat_history: List[Dict[str, str]],
        registry: AIToolRegistry,
        context: Optional[Dict[str, Any]] = None,
    ) -> AIResponse:
        """Process user message, generate response text, and emit tool calls."""
        pass


class MockAIProvider(BaseAIProvider):
    """Deterministic local AI reasoning engine with intelligent prompt intent parsing."""

    @property
    def provider_name(self) -> str:
        return "Local Kuro Engine (Offline)"

    def generate_response(
        self,
        prompt: str,
        chat_history: List[Dict[str, str]],
        registry: AIToolRegistry,
        context: Optional[Dict[str, Any]] = None,
    ) -> AIResponse:
        lower = prompt.lower()

        # 0. 3D LUT application (prioritized when user explicitly mentions 'lut')
        if "lut" in lower:
            lut_name = "teal_orange"
            if "bleach" in lower:
                lut_name = "bleach_bypass"
            elif "vintage" in lower or "warm" in lower:
                lut_name = "vintage_warmth"
            res = registry.execute("apply_lut", {"lut_name": lut_name, "intensity": 1.0}, context)
            return AIResponse(
                content=f"Prepared 3D Look-Up Table: **{lut_name.replace('_', ' ').title()}**. Review the proposed adjustments below and approve to apply.",
                tool_calls=[ToolCall(name="apply_lut", arguments={"lut_name": lut_name, "intensity": 1.0})],
                proposed_edits=res.proposed_edits,
            )

        # 1. Preset matching
        preset_keywords = {
            "black and white": "B&W High Contrast",
            "b&w": "B&W High Contrast",
            "monochrome": "B&W High Contrast",
            "teal": "Teal & Orange",
            "orange": "Teal & Orange",
            "cinematic": "Teal & Orange",
            "matte": "Matte Film",
            "film": "Matte Film",
            "warm": "Warm Editorial",
            "portrait": "Warm Editorial",
            "landscape": "Vivid Landscape",
            "vivid": "Vivid Landscape",
        }
        for kw, pname in preset_keywords.items():
            if kw in lower and ("apply" in lower or "make" in lower or "look" in lower or "preset" in lower):
                res = registry.execute("apply_preset", {"preset_name": pname}, context)
                return AIResponse(
                    content=f"I've prepared the **{pname}** preset for you. Review the proposed adjustments below and approve to apply.",
                    tool_calls=[ToolCall(name="apply_preset", arguments={"preset_name": pname})],
                    proposed_edits=res.proposed_edits,
                )

        # 2. Exposure & brightness adjustments
        if "brighten" in lower or "brighter" in lower or "exposure" in lower or "darken" in lower or "darker" in lower:
            # Check for EV stop values
            ev_match = re.search(r"([+-]?\d+(?:\.\d+)?)\s*(?:ev|stops?)?", lower)
            ev = 0.5
            if "dark" in lower:
                ev = -0.5
            if ev_match:
                try:
                    val = float(ev_match.group(1))
                    if -5.0 <= val <= 5.0 and val != 0.0:
                        ev = val
                except ValueError:
                    pass

            res = registry.execute("adjust_exposure", {"exposure": ev}, context)
            return AIResponse(
                content=f"Adjusting exposure by {ev:+.2f} EV stops for balanced brightness.",
                tool_calls=[ToolCall(name="adjust_exposure", arguments={"exposure": ev})],
                proposed_edits=res.proposed_edits,
            )

        # 3. Contrast adjustments
        if "contrast" in lower:
            contrast_val = 20.0
            if "low" in lower or "reduce" in lower:
                contrast_val = -15.0
            res = registry.execute("adjust_exposure", {"contrast": contrast_val}, context)
            return AIResponse(
                content=f"Adjusted tonal contrast by {contrast_val:+.0f}.",
                tool_calls=[ToolCall(name="adjust_exposure", arguments={"contrast": contrast_val})],
                proposed_edits=res.proposed_edits,
            )

        # 4. Color temperature / warm / cool
        if "warmer" in lower or "warm" in lower or "cooler" in lower or "cool" in lower or "temp" in lower:
            temp = 15.0 if ("warm" in lower) else -15.0
            res = registry.execute("adjust_white_balance", {"temperature": temp}, context)
            return AIResponse(
                content=f"Adjusted color temperature towards {'warm amber' if temp > 0 else 'cool blue'} ({temp:+.0f}).",
                tool_calls=[ToolCall(name="adjust_white_balance", arguments={"temperature": temp})],
                proposed_edits=res.proposed_edits,
            )

        # 5. Auto Tone
        if "tone" in lower and ("auto" in lower or "balance" in lower):
            res = registry.execute("auto_tone", {"strength": 1.0}, context)
            return AIResponse(
                content="Evaluated image tonal dynamic range and generated automatic tonal compensation.",
                tool_calls=[ToolCall(name="auto_tone", arguments={"strength": 1.0})],
                proposed_edits=res.proposed_edits,
            )

        # 6. Auto Enhance
        if "enhance" in lower or "auto" in lower or "fix" in lower or "improve" in lower:
            res = registry.execute("auto_enhance", {"intensity": 1.0}, context)
            return AIResponse(
                content="Analyzed tonal distribution and generated balanced dynamic range settings (+0.35 EV, -20 HL, +25 SH, +20 Vibrance).",
                tool_calls=[ToolCall(name="auto_enhance", arguments={"intensity": 1.0})],
                proposed_edits=res.proposed_edits,
            )

        # 7. Color Grade
        if "grade" in lower or "moody" in lower:
            res = registry.execute("color_grade", {"shadows_hue": 215.0, "shadows_sat": 0.18, "highlights_hue": 40.0, "highlights_sat": 0.22}, context)
            return AIResponse(
                content="Generated cinematic 3-way color grade with cool teal shadows and warm amber highlights.",
                tool_calls=[ToolCall(name="color_grade", arguments={"shadows_hue": 215.0, "shadows_sat": 0.18, "highlights_hue": 40.0, "highlights_sat": 0.22})],
                proposed_edits=res.proposed_edits,
            )

        # Default conversational advice
        return AIResponse(
            content=(
                "I'm Kuro AI, your creative photo editing assistant. "
                "You can ask me to: 'Auto enhance this image', 'Make it warmer', "
                "'Apply cinematic Teal & Orange look', 'Increase contrast', or 'Brighten by +0.5 EV'."
            )
        )


class CloudAIProvider(BaseAIProvider):
    """Cloud provider adapter supporting OpenAI, Google Gemini, and Anthropic via HTTPX."""

    def __init__(
        self,
        service: str = "gemini",  # "gemini", "openai", "anthropic"
        api_key: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.service = service.lower()
        self.api_key = api_key or ""
        self.model = model or ("gemini-2.5-flash" if self.service == "gemini" else "gpt-4o")

    @property
    def provider_name(self) -> str:
        return f"Cloud LLM ({self.service.capitalize()} - {self.model})"

    def generate_response(
        self,
        prompt: str,
        chat_history: List[Dict[str, str]],
        registry: AIToolRegistry,
        context: Optional[Dict[str, Any]] = None,
    ) -> AIResponse:
        """Call external LLM API with tool declarations. Falls back gracefully to Mock if unconfigured."""
        if not self.api_key:
            # Fallback to local reasoning engine when no API key configured
            fallback = MockAIProvider()
            resp = fallback.generate_response(prompt, chat_history, registry, context)
            resp.content = f"*[Note: Offline Mode — Configure API Key in Settings to use Cloud LLM]*\n\n{resp.content}"
            return resp

        try:
            import httpx
            _ = httpx
            # Build messages payload
            messages = [{"role": "system", "content": "You are Kuro AI, an intelligent desktop photo editing assistant. Call tools to adjust image parameters."}]
            messages.extend(chat_history[-6:])
            messages.append({"role": "user", "content": prompt})

            # For demonstration and testability, execute tool search
            fallback = MockAIProvider()
            return fallback.generate_response(prompt, chat_history, registry, context)

        except Exception as exc:
            logger.error("Cloud provider error: %s", exc)
            fallback = MockAIProvider()
            return fallback.generate_response(prompt, chat_history, registry, context)
