"""High-fidelity metadata extraction for photography formats and camera RAWs."""

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional
from PIL import ExifTags, Image, ImageOps

from kurolight.infrastructure.logging import get_logger

logger = get_logger("infrastructure.metadata")


@dataclass
class ImageMetadata:
    """Structured camera and photographic exposure metadata."""
    file_name: str
    file_size_bytes: int
    format: str
    width: int = 0
    height: int = 0

    # Camera & Lens
    camera_make: Optional[str] = None
    camera_model: Optional[str] = None
    lens_model: Optional[str] = None

    # Photographic Parameters
    iso: Optional[int] = None
    focal_length_mm: Optional[float] = None
    aperture_f_number: Optional[float] = None
    shutter_speed_str: Optional[str] = None
    exposure_program: Optional[str] = None
    exposure_compensation: Optional[float] = None

    # Timestamps
    date_captured: Optional[str] = None

    # Color & Technical
    color_space: Optional[str] = None
    raw_metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary."""
        return asdict(self)


class MetadataExtractor:
    """Extracts photographic EXIF metadata from image files."""

    @staticmethod
    def extract(file_path: Path) -> ImageMetadata:
        """Parse image file and return populated ImageMetadata."""
        path = Path(file_path).resolve()
        file_size = path.stat().st_size if path.exists() else 0
        fmt = path.suffix.lower().lstrip(".")

        meta = ImageMetadata(
            file_name=path.name,
            file_size_bytes=file_size,
            format=fmt,
        )

        if not path.exists():
            return meta

        try:
            with Image.open(path) as img:
                meta.format = (img.format or fmt).lower()

                exif_data = img.getexif()
                oriented = ImageOps.exif_transpose(img)
                meta.width = oriented.width
                meta.height = oriented.height
                if not exif_data:
                    return meta

                # Map EXIF tags
                tag_map = {ExifTags.TAGS.get(k, str(k)): v for k, v in exif_data.items()}

                # Also inspect IFD EXIF sub-block
                try:
                    for ifd_id in (ExifTags.IFD.Exif, ExifTags.IFD.GPSInfo):
                        try:
                            ifd = exif_data.get_ifd(ifd_id)
                            if ifd:
                                for k, v in ifd.items():
                                    tag_name = ExifTags.TAGS.get(k, str(k))
                                    tag_map[tag_name] = v
                        except Exception:
                            pass
                except Exception:
                    pass

                meta.camera_make = str(tag_map.get("Make", "")).strip() or None
                meta.camera_model = str(tag_map.get("Model", "")).strip() or None
                meta.lens_model = str(tag_map.get("LensModel", "")).strip() or None

                # ISO
                iso_val = tag_map.get("ISOSpeedRatings") or tag_map.get("PhotographicSensitivity")
                if iso_val is not None:
                    try:
                        meta.iso = int(iso_val)
                    except (ValueError, TypeError):
                        pass

                # Focal Length
                focal = tag_map.get("FocalLength")
                if focal is not None:
                    try:
                        meta.focal_length_mm = round(float(focal), 1)
                    except (ValueError, TypeError):
                        pass

                # F-Number / Aperture
                f_num = tag_map.get("FNumber")
                if f_num is not None:
                    try:
                        meta.aperture_f_number = round(float(f_num), 1)
                    except (ValueError, TypeError):
                        pass

                # Shutter Speed (Exposure Time)
                exp_time = tag_map.get("ExposureTime")
                if exp_time is not None:
                    try:
                        f_exp = float(exp_time)
                        if f_exp > 0:
                            if f_exp < 1.0:
                                meta.shutter_speed_str = f"1/{int(round(1.0 / f_exp))}s"
                            else:
                                meta.shutter_speed_str = f"{round(f_exp, 1)}s"
                    except (ValueError, TypeError):
                        meta.shutter_speed_str = str(exp_time)

                # Date Captured
                meta.date_captured = (
                    str(tag_map.get("DateTimeOriginal") or tag_map.get("DateTime") or "").strip() or None
                )

                # Save raw stringified tags
                cleaned_raw = {}
                for k, v in tag_map.items():
                    try:
                        cleaned_raw[str(k)] = str(v)
                    except Exception:
                        pass
                meta.raw_metadata = cleaned_raw

        except Exception as e:
            logger.warning("Could not extract EXIF from %s: %s", path, e)

        return meta
