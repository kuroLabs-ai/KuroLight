"""Kuro AI Tool Registry managing tool definitions and dispatch."""

from typing import Any, Callable, Dict, List, Optional
from kurolight.ai.tools import ToolDefinition, ToolExecutionResult, ToolParameter
from kurolight.infrastructure.logging import get_logger

logger = get_logger("ai.registry")


class AIToolRegistry:
    """Registry maintaining available AI assistant tools and their handlers."""

    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}
        self._handlers: Dict[str, Callable[..., ToolExecutionResult]] = {}
        self._register_default_tools()

    def register(
        self,
        tool: ToolDefinition,
        handler: Callable[..., ToolExecutionResult],
    ) -> None:
        """Register a new tool and its invocation handler."""
        self._tools[tool.name] = tool
        self._handlers[tool.name] = handler
        logger.debug("Registered AI tool: %s", tool.name)

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        return self._tools.get(name)

    def get_schemas(self) -> List[Dict[str, Any]]:
        """Return all registered tools as JSON Schema function declarations."""
        return [t.to_function_schema() for t in self._tools.values()]

    def execute(self, name: str, arguments: Dict[str, Any], context: Optional[Dict[str, Any]] = None) -> ToolExecutionResult:
        """Execute a tool by name with arguments and application context."""
        handler = self._handlers.get(name)
        if not handler:
            return ToolExecutionResult(
                success=False,
                data=None,
                message=f"Unknown tool: '{name}'",
            )
        try:
            return handler(arguments, context or {})
        except Exception as exc:
            logger.error("Error executing tool %s: %s", name, exc, exc_info=True)
            return ToolExecutionResult(
                success=False,
                data=None,
                message=f"Execution error in {name}: {str(exc)}",
            )

    # ------------------------------------------------------------------
    # Default built-in tool handlers
    # ------------------------------------------------------------------

    def _register_default_tools(self) -> None:
        # 1. adjust_exposure
        self.register(
            ToolDefinition(
                name="adjust_exposure",
                description="Modify photographic exposure, contrast, highlights, shadows, whites, and blacks.",
                parameters=[
                    ToolParameter(name="exposure", type="number", description="Exposure compensation in EV stops (-5.0 to +5.0)", required=False, minimum=-5.0, maximum=5.0),
                    ToolParameter(name="contrast", type="number", description="Tonal contrast adjustment (-100 to +100)", required=False, minimum=-100.0, maximum=100.0),
                    ToolParameter(name="highlights", type="number", description="Highlights recovery or boost (-100 to +100)", required=False, minimum=-100.0, maximum=100.0),
                    ToolParameter(name="shadows", type="number", description="Shadows lift or deepening (-100 to +100)", required=False, minimum=-100.0, maximum=100.0),
                    ToolParameter(name="whites", type="number", description="White point clipping control (-100 to +100)", required=False, minimum=-100.0, maximum=100.0),
                    ToolParameter(name="blacks", type="number", description="Black point floor control (-100 to +100)", required=False, minimum=-100.0, maximum=100.0),
                ],
            ),
            self._handle_adjust_exposure,
        )

        # 2. adjust_white_balance
        self.register(
            ToolDefinition(
                name="adjust_white_balance",
                description="Modify color temperature, tint, vibrance, and saturation.",
                parameters=[
                    ToolParameter(name="temperature", type="number", description="Color temperature cool to warm (-100 to +100)", required=False, minimum=-100.0, maximum=100.0),
                    ToolParameter(name="tint", type="number", description="Green to magenta tint (-100 to +100)", required=False, minimum=-100.0, maximum=100.0),
                    ToolParameter(name="saturation", type="number", description="Global color saturation (-100 to +100)", required=False, minimum=-100.0, maximum=100.0),
                    ToolParameter(name="vibrance", type="number", description="Smart skin-safe vibrance (-100 to +100)", required=False, minimum=-100.0, maximum=100.0),
                ],
            ),
            self._handle_adjust_white_balance,
        )

        # 3. auto_enhance
        self.register(
            ToolDefinition(
                name="auto_enhance",
                description="Intelligently calculate optimal dynamic range, exposure balance, and clarity.",
                parameters=[
                    ToolParameter(name="intensity", type="number", description="Strength of enhancement factor from 0.0 to 1.0", required=False, minimum=0.0, maximum=1.0, default=1.0),
                ],
            ),
            self._handle_auto_enhance,
        )

        # 4. color_grade
        self.register(
            ToolDefinition(
                name="color_grade",
                description="Apply professional 3-way color grading (Lift, Gamma, Gain) for cinematic looks.",
                parameters=[
                    ToolParameter(name="shadows_hue", type="number", description="Lift/Shadows hue angle in degrees (0..360)", required=False, minimum=0.0, maximum=360.0),
                    ToolParameter(name="shadows_sat", type="number", description="Lift/Shadows chromatic intensity (0.0..1.0)", required=False, minimum=0.0, maximum=1.0),
                    ToolParameter(name="highlights_hue", type="number", description="Gain/Highlights hue angle in degrees (0..360)", required=False, minimum=0.0, maximum=360.0),
                    ToolParameter(name="highlights_sat", type="number", description="Gain/Highlights chromatic intensity (0.0..1.0)", required=False, minimum=0.0, maximum=1.0),
                ],
            ),
            self._handle_color_grade,
        )

        # 5. apply_preset
        self.register(
            ToolDefinition(
                name="apply_preset",
                description="Apply a named style preset recipe to the active image.",
                parameters=[
                    ToolParameter(name="preset_name", type="string", description="Name of the preset to apply (e.g. 'B&W High Contrast', 'Teal & Orange', 'Matte Film', 'Warm Editorial', 'Vivid Landscape')", required=True),
                ],
            ),
            self._handle_apply_preset,
        )

        # 6. apply_lut
        self.register(
            ToolDefinition(
                name="apply_lut",
                description="Apply a creative 3D Look-Up Table (LUT) such as teal_orange, bleach_bypass, or vintage_warmth.",
                parameters=[
                    ToolParameter(name="lut_name", type="string", description="Name of the 3D LUT ('teal_orange', 'bleach_bypass', 'vintage_warmth')", required=True),
                    ToolParameter(name="intensity", type="number", description="Blending strength from 0.0 to 1.0", required=False, minimum=0.0, maximum=1.0, default=1.0),
                ],
            ),
            self._handle_apply_lut,
        )

        # 7. auto_tone
        self.register(
            ToolDefinition(
                name="auto_tone",
                description="Perform automatic tonal balance and dynamic range compensation.",
                parameters=[
                    ToolParameter(name="strength", type="number", description="Adjustment strength from 0.0 to 1.0", required=False, minimum=0.0, maximum=1.0, default=1.0),
                ],
            ),
            self._handle_auto_tone,
        )

    def _handle_adjust_exposure(self, args: Dict[str, Any], context: Dict[str, Any]) -> ToolExecutionResult:
        edits = {"exposure": {k: float(v) for k, v in args.items() if v is not None}}
        parts = [f"{k}={v}" for k, v in args.items() if v is not None]
        return ToolExecutionResult(
            success=True,
            data=edits,
            message=f"Adjusted exposure parameters: {', '.join(parts)}",
            proposed_edits=edits,
        )

    def _handle_adjust_white_balance(self, args: Dict[str, Any], context: Dict[str, Any]) -> ToolExecutionResult:
        edits = {"white_balance": {k: float(v) for k, v in args.items() if v is not None}}
        parts = [f"{k}={v}" for k, v in args.items() if v is not None]
        return ToolExecutionResult(
            success=True,
            data=edits,
            message=f"Adjusted white balance parameters: {', '.join(parts)}",
            proposed_edits=edits,
        )

    def _handle_auto_enhance(self, args: Dict[str, Any], context: Dict[str, Any]) -> ToolExecutionResult:
        factor = float(args.get("intensity", 1.0))
        edits = {
            "exposure": {
                "exposure": round(0.35 * factor, 2),
                "contrast": round(15.0 * factor, 1),
                "highlights": round(-20.0 * factor, 1),
                "shadows": round(25.0 * factor, 1),
                "whites": round(10.0 * factor, 1),
                "blacks": round(-10.0 * factor, 1),
            },
            "white_balance": {
                "vibrance": round(20.0 * factor, 1),
                "saturation": round(5.0 * factor, 1),
            },
            "detail": {
                "sharpening": round(30.0 * factor, 1),
                "clarity": round(15.0 * factor, 1),
            },
        }
        return ToolExecutionResult(
            success=True,
            data=edits,
            message=f"Generated auto-enhancement recipe (intensity={factor:.1f}) with balanced dynamic range.",
            proposed_edits=edits,
        )

    def _handle_color_grade(self, args: Dict[str, Any], context: Dict[str, Any]) -> ToolExecutionResult:
        sh_hue = float(args.get("shadows_hue", 210.0))
        sh_sat = float(args.get("shadows_sat", 0.15))
        hl_hue = float(args.get("highlights_hue", 35.0))
        hl_sat = float(args.get("highlights_sat", 0.20))
        edits = {
            "color_grading": {
                "lift": {"hue": sh_hue, "saturation": sh_sat, "luminance": -0.04},
                "gain": {"hue": hl_hue, "saturation": hl_sat, "luminance": 0.06},
            }
        }
        return ToolExecutionResult(
            success=True,
            data=edits,
            message=f"Applied color grading: Shadows ({sh_hue:.0f}°, sat={sh_sat:.2f}), Highlights ({hl_hue:.0f}°, sat={hl_sat:.2f}).",
            proposed_edits=edits,
        )

    def _handle_apply_preset(self, args: Dict[str, Any], context: Dict[str, Any]) -> ToolExecutionResult:
        preset_name = args.get("preset_name", "")
        # Lookup preset parameters
        preset_recipes = {
            "B&W High Contrast": {
                "white_balance": {"saturation": -100.0},
                "exposure": {"contrast": 35.0, "whites": 20.0, "blacks": -25.0, "highlights": -15.0},
                "detail": {"sharpening": 35.0, "clarity": 20.0},
            },
            "Teal & Orange": {
                "color_grading": {
                    "lift": {"hue": 210.0, "saturation": 0.25, "luminance": -0.05},
                    "gain": {"hue": 35.0, "saturation": 0.25, "luminance": 0.08},
                },
                "exposure": {"contrast": 15.0, "highlights": -10.0},
                "white_balance": {"vibrance": 15.0},
            },
            "Matte Film": {
                "exposure": {"contrast": -10.0, "highlights": -20.0, "shadows": 25.0},
                "color_grading": {
                    "lift": {"hue": 0.0, "saturation": 0.0, "luminance": 0.12},
                    "gain": {"hue": 40.0, "saturation": 0.10, "luminance": -0.05},
                },
                "white_balance": {"temperature": 8.0, "vibrance": 10.0},
            },
            "Warm Editorial": {
                "white_balance": {"temperature": 16.0, "tint": 4.0, "vibrance": 12.0},
                "exposure": {"exposure": 0.20, "highlights": -15.0, "shadows": 15.0},
                "detail": {"clarity": -5.0, "sharpening": 20.0},
            },
            "Vivid Landscape": {
                "exposure": {"contrast": 20.0, "highlights": -25.0, "shadows": 20.0, "whites": 15.0},
                "white_balance": {"vibrance": 25.0, "saturation": 8.0},
                "detail": {"sharpening": 30.0, "clarity": 15.0, "dehaze": 10.0},
            },
        }

        recipe = preset_recipes.get(preset_name)
        if not recipe:
            # Fuzzy match
            for k, v in preset_recipes.items():
                if preset_name.lower() in k.lower():
                    preset_name = k
                    recipe = v
                    break

        if not recipe:
            return ToolExecutionResult(
                success=False,
                data=None,
                message=f"Preset '{preset_name}' not found. Available: {', '.join(preset_recipes.keys())}",
            )

        return ToolExecutionResult(
            success=True,
            data=recipe,
            message=f"Applied preset '{preset_name}'.",
            proposed_edits=recipe,
        )

    def _handle_apply_lut(self, args: Dict[str, Any], context: Dict[str, Any]) -> ToolExecutionResult:
        lut_name = str(args.get("lut_name", "teal_orange")).lower().replace(" ", "_").replace("&", "_")
        if "teal" in lut_name:
            lut_id = "teal_orange"
            display_name = "Teal & Orange"
        elif "bleach" in lut_name:
            lut_id = "bleach_bypass"
            display_name = "Film Bleach Bypass"
        elif "vintage" in lut_name or "warm" in lut_name:
            lut_id = "vintage_warmth"
            display_name = "Vintage Warmth"
        else:
            lut_id = lut_name
            display_name = lut_name.replace("_", " ").title()

        intensity = float(args.get("intensity", 1.0))
        edits = {
            "color_grading": {
                "lut_name": display_name,
                "lut_intensity": intensity,
            },
            "lut_3d": {
                "enabled": True,
                "builtin_name": lut_id,
                "intensity": intensity,
            },
        }
        return ToolExecutionResult(
            success=True,
            data=edits,
            message=f"Applied 3D LUT '{display_name}' at {int(intensity*100)}% strength.",
            proposed_edits=edits,
        )

    def _handle_auto_tone(self, args: Dict[str, Any], context: Dict[str, Any]) -> ToolExecutionResult:
        strength = float(args.get("strength", 1.0))
        edits = {
            "exposure": {
                "exposure": round(0.25 * strength, 2),
                "contrast": round(10.0 * strength, 1),
                "highlights": round(-15.0 * strength, 1),
                "shadows": round(20.0 * strength, 1),
                "whites": round(10.0 * strength, 1),
                "blacks": round(-8.0 * strength, 1),
            }
        }
        return ToolExecutionResult(
            success=True,
            data=edits,
            message=f"Balanced dynamic range tones (strength={strength:.1f}).",
            proposed_edits=edits,
        )
