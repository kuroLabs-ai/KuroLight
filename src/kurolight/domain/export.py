"""Export domain models, format specifications, and job configurations."""

from enum import Enum
from pathlib import Path
from typing import Literal, Optional
import uuid
from pydantic import BaseModel, Field

from kurolight.domain.editing import EditState


class ExportFormat(str, Enum):
    """Supported output image container formats."""
    JPEG = "jpeg"
    PNG = "png"
    TIFF = "tiff"
    WEBP = "webp"
    BMP = "bmp"
    GIF = "gif"
    PPM = "ppm"


class ColorSpace(str, Enum):
    """Target output color profile."""
    SRGB = "sRGB"
    ADOBE_RGB = "Adobe RGB"
    DISPLAY_P3 = "Display P3"


class ResizeMode(str, Enum):
    """Image resizing strategy."""
    ORIGINAL = "original"
    FIT = "fit"
    LONGEST_EDGE = "longest_edge"


class ExportSettings(BaseModel):
    """Parameters governing rendering, encoding, and output serialization."""
    format: ExportFormat = ExportFormat.JPEG
    quality: int = Field(default=92, ge=1, le=100)
    output_dir: Path
    filename_pattern: str = "{name}_export"
    color_space: ColorSpace = ColorSpace.SRGB
    resize_mode: ResizeMode = ResizeMode.ORIGINAL
    max_width: Optional[int] = Field(default=None, gt=0)
    max_height: Optional[int] = Field(default=None, gt=0)
    strip_metadata: bool = True
    sharpen_for_screen: bool = False

    watermark_enabled: bool = False
    watermark_type: Literal["app_icon", "wordmark", "text"] = "app_icon"
    watermark_text: str = ""
    watermark_opacity: float = Field(default=0.75, ge=0.0, le=1.0)
    watermark_position: str = "bottom_right"  # "bottom_right", "bottom_left", "center", "top_right"


class ExportJob(BaseModel):
    """Individual unit of work in an export batch."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    asset_id: str
    asset_name: str
    source_path: Path
    target_path: Optional[Path] = None
    settings: ExportSettings
    edit_state: EditState
    status: str = "pending"  # "pending", "processing", "completed", "failed", "cancelled"
    progress: float = 0.0
    error_message: Optional[str] = None


class ExportResult(BaseModel):
    """Outcome report for an executed export job."""
    job_id: str
    asset_id: str
    output_path: Path
    success: bool
    file_size_bytes: int = 0
    duration_seconds: float = 0.0
    error_message: Optional[str] = None
