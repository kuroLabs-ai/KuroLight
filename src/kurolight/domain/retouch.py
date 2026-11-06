"""Retouch and Spot Healing domain models."""

from enum import Enum
import uuid
from pydantic import BaseModel, Field


class RetouchMode(str, Enum):
    """Retouching algorithm mode."""
    HEAL = "heal"    # Seamless gradient and texture synthesis
    CLONE = "clone"  # Direct feathered pixel cloning


class RetouchSpot(BaseModel):
    """A localized spot healing or clone stamp operation."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    mode: RetouchMode = RetouchMode.HEAL
    target_x: float = Field(default=0.5, ge=0.0, le=1.0)
    target_y: float = Field(default=0.5, ge=0.0, le=1.0)
    source_x: float = Field(default=0.52, ge=0.0, le=1.0)
    source_y: float = Field(default=0.52, ge=0.0, le=1.0)
    radius: float = Field(default=0.03, ge=0.001, le=0.5)
    feather: float = Field(default=0.5, ge=0.0, le=1.0)
    opacity: float = Field(default=1.0, ge=0.0, le=1.0)
    enabled: bool = True
