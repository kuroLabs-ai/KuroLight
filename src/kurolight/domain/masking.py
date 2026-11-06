"""Domain models for local adjustment masks and spatial weighting."""

import uuid
from enum import Enum
from typing import Any, Dict

from pydantic import BaseModel, Field


class MaskType(str, Enum):
    """Geometric and spatial mask generation types."""
    LINEAR = "linear"
    RADIAL = "radial"
    BRUSH = "brush"
    LUMINANCE_RANGE = "luminance_range"
    COLOR_RANGE = "color_range"


class MaskCombineMode(str, Enum):
    """How a mask selection combines with the accumulated selection."""
    REPLACE = "replace"
    ADD = "add"
    SUBTRACT = "subtract"
    INTERSECT = "intersect"


class AdjustmentMask(BaseModel):
    """Specification for a localized non-destructive parametric adjustment mask."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "New Mask"
    mask_type: MaskType = MaskType.LINEAR
    enabled: bool = True
    inverted: bool = False
    combine_mode: MaskCombineMode = MaskCombineMode.REPLACE
    feather: float = Field(default=0.5, ge=0.0, le=1.0)
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)

    # Localized parameter deltas
    exposure: float = Field(default=0.0, ge=-5.0, le=5.0)
    contrast: float = Field(default=0.0, ge=-100.0, le=100.0)
    temperature: float = Field(default=0.0, ge=-100.0, le=100.0)
    saturation: float = Field(default=0.0, ge=-100.0, le=100.0)
    clarity: float = Field(default=0.0, ge=-100.0, le=100.0)

    # Normalized spatial geometry in [0.0, 1.0] relative image coordinates
    geometry: Dict[str, Any] = Field(default_factory=dict)
