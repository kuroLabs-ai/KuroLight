"""Non-destructive edit state models and parameter schemas."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

from kurolight.domain.masking import AdjustmentMask
from kurolight.domain.retouch import RetouchSpot


class ExposureSettings(BaseModel):
    """Photographic exposure and tonal distribution parameters."""
    exposure: float = Field(default=0.0, ge=-5.0, le=5.0)  # EV stops
    contrast: float = Field(default=0.0, ge=-100.0, le=100.0)
    highlights: float = Field(default=0.0, ge=-100.0, le=100.0)
    shadows: float = Field(default=0.0, ge=-100.0, le=100.0)
    whites: float = Field(default=0.0, ge=-100.0, le=100.0)
    blacks: float = Field(default=0.0, ge=-100.0, le=100.0)
    brightness: float = Field(default=0.0, ge=-100.0, le=100.0)


class WhiteBalanceSettings(BaseModel):
    """White balance chromaticity adjustments."""
    temperature: float = Field(default=0.0, ge=-100.0, le=100.0)  # Blue <-> Yellow
    tint: float = Field(default=0.0, ge=-100.0, le=100.0)         # Green <-> Magenta
    saturation: float = Field(default=0.0, ge=-100.0, le=100.0)
    vibrance: float = Field(default=0.0, ge=-100.0, le=100.0)


class GeometrySettings(BaseModel):
    """Geometric orientation, lens transformations, and framing."""
    crop_x: float = Field(default=0.0, ge=0.0, le=1.0)
    crop_y: float = Field(default=0.0, ge=0.0, le=1.0)
    crop_width: float = Field(default=1.0, ge=0.0, le=1.0)
    crop_height: float = Field(default=1.0, ge=0.0, le=1.0)
    rotation: float = Field(default=0.0, ge=-180.0, le=180.0)
    straighten: float = Field(default=0.0, ge=-45.0, le=45.0)
    horizontal_flip: bool = False
    vertical_flip: bool = False
    aspect_ratio: str = "original"


class LensCorrectionSettings(BaseModel):
    """Manual optical corrections; profiles are not currently supported."""
    distortion: float = Field(default=0.0, ge=-100.0, le=100.0)
    chromatic_aberration: float = Field(default=0.0, ge=-100.0, le=100.0)
    vignette: float = Field(default=0.0, ge=0.0, le=100.0)


class DetailSettings(BaseModel):
    """Sharpness, clarity, and noise parameters."""
    sharpening: float = Field(default=0.0, ge=0.0, le=100.0)
    noise_reduction: float = Field(default=0.0, ge=0.0, le=100.0)
    clarity: float = Field(default=0.0, ge=-100.0, le=100.0)
    texture: float = Field(default=0.0, ge=-100.0, le=100.0)
    dehaze: float = Field(default=0.0, ge=-100.0, le=100.0)
    enhancement_resolution: Literal[0, 720, 1080, 1440, 2160] = 0


class HSLBand(BaseModel):
    """Adjustments for a single target color band."""
    hue: float = Field(default=0.0, ge=-100.0, le=100.0)
    saturation: float = Field(default=0.0, ge=-100.0, le=100.0)
    luminance: float = Field(default=0.0, ge=-100.0, le=100.0)


class HSLSettings(BaseModel):
    """8-band selective color adjustments."""
    red: HSLBand = Field(default_factory=HSLBand)
    orange: HSLBand = Field(default_factory=HSLBand)
    yellow: HSLBand = Field(default_factory=HSLBand)
    green: HSLBand = Field(default_factory=HSLBand)
    aqua: HSLBand = Field(default_factory=HSLBand)
    blue: HSLBand = Field(default_factory=HSLBand)
    purple: HSLBand = Field(default_factory=HSLBand)
    magenta: HSLBand = Field(default_factory=HSLBand)


class ColorWheelValue(BaseModel):
    """Vector representation of color grading wheel adjustment."""
    hue: float = Field(default=0.0, ge=0.0, le=360.0)       # Degrees
    saturation: float = Field(default=0.0, ge=0.0, le=1.0)  # Distance from neutral center
    luminance: float = Field(default=0.0, ge=-1.0, le=1.0)  # Master level slider


class ColorGradingSettings(BaseModel):
    """Lift, Gamma, Gain, Offset 3-way color grading system with 3D LUT."""
    lift: ColorWheelValue = Field(default_factory=ColorWheelValue)      # Shadows
    gamma: ColorWheelValue = Field(default_factory=ColorWheelValue)     # Midtones
    gain: ColorWheelValue = Field(default_factory=ColorWheelValue)      # Highlights
    offset: ColorWheelValue = Field(default_factory=ColorWheelValue)    # Global Offset
    lut_name: Optional[str] = None                                      # "Teal & Orange", "Film Bleach Bypass", "Vintage Warmth"
    lut_intensity: float = Field(default=1.0, ge=0.0, le=1.0)


class CurvePoint(BaseModel):
    """Control point for tone curves."""
    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)


class ToneCurvesSettings(BaseModel):
    """Parametric & RGB tone curves."""
    rgb_points: List[CurvePoint] = Field(
        default_factory=lambda: [CurvePoint(x=0.0, y=0.0), CurvePoint(x=1.0, y=1.0)]
    )
    red_points: List[CurvePoint] = Field(
        default_factory=lambda: [CurvePoint(x=0.0, y=0.0), CurvePoint(x=1.0, y=1.0)]
    )
    green_points: List[CurvePoint] = Field(
        default_factory=lambda: [CurvePoint(x=0.0, y=0.0), CurvePoint(x=1.0, y=1.0)]
    )
    blue_points: List[CurvePoint] = Field(
        default_factory=lambda: [CurvePoint(x=0.0, y=0.0), CurvePoint(x=1.0, y=1.0)]
    )


class EditState(BaseModel):
    """Full non-destructive editing specification for an image asset."""
    schema_version: int = 1
    asset_id: str

    exposure: ExposureSettings = Field(default_factory=ExposureSettings)
    white_balance: WhiteBalanceSettings = Field(default_factory=WhiteBalanceSettings)
    geometry: GeometrySettings = Field(default_factory=GeometrySettings)
    lens_correction: LensCorrectionSettings = Field(default_factory=LensCorrectionSettings)
    detail: DetailSettings = Field(default_factory=DetailSettings)
    hsl: HSLSettings = Field(default_factory=HSLSettings)
    color_grading: ColorGradingSettings = Field(default_factory=ColorGradingSettings)
    tone_curves: ToneCurvesSettings = Field(default_factory=ToneCurvesSettings)

    retouch_spots: List[RetouchSpot] = Field(default_factory=list)
    masks: List[AdjustmentMask] = Field(default_factory=list)
    snapshots: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    custom_metadata: Dict[str, Any] = Field(default_factory=dict)

    def create_snapshot(self, name: str) -> None:
        """Save current edit parameters into a named snapshot."""
        data = self.model_dump(exclude={"snapshots"})
        self.snapshots[name] = data

    def restore_snapshot(self, name: str) -> "EditState":
        """Return a new EditState restored from the named snapshot while preserving snapshots."""
        if name not in self.snapshots:
            raise KeyError(f"Snapshot '{name}' not found")
        data = dict(self.snapshots[name])
        data["snapshots"] = dict(self.snapshots)
        return EditState.model_validate(data)

    def delete_snapshot(self, name: str) -> bool:
        """Delete a named snapshot if it exists."""
        if name in self.snapshots:
            del self.snapshots[name]
            return True
        return False
