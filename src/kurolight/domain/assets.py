"""Asset domain models for image files, ratings, and extracted metadata."""

import uuid
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any, Dict, Optional

from kurolight.domain.metadata import AssetMetadataOverrides


def source_folder_from_path(source_path: str | Path) -> str:
    """Return a path's parent using the path's recorded platform separators."""
    value = str(source_path)
    if "\\" in value or (len(value) > 1 and value[1] == ":"):
        return str(PureWindowsPath(value).parent)
    return str(PurePosixPath(value).parent)


@dataclass
class ImageAsset:
    """Represents an imported photograph or raw image file."""
    id: str
    source_path: Path
    file_name: str
    file_type: str

    width: Optional[int] = None
    height: Optional[int] = None
    file_size: Optional[int] = None
    date_captured: Optional[str] = None

    rating: int = 0
    flag: str = "unflagged"  # "unflagged", "flagged", "rejected"
    metadata: Dict[str, Any] = field(default_factory=dict)
    metadata_overrides: AssetMetadataOverrides = field(default_factory=AssetMetadataOverrides)
    project_id: Optional[str] = None
    deleted_at: Optional[str] = None

    @classmethod
    def create(cls, source_path: Path, project_id: Optional[str] = None) -> "ImageAsset":
        """Factory method creating an ImageAsset with generated UUID."""
        path = Path(source_path).resolve()
        return cls(
            id=str(uuid.uuid4()),
            source_path=path,
            file_name=path.name,
            file_type=path.suffix.lower().lstrip("."),
            file_size=path.stat().st_size if path.exists() else None,
            project_id=project_id,
        )

    def set_rating(self, rating: int) -> None:
        """Set star rating clamped between 0 and 5."""
        self.rating = max(0, min(5, rating))

    def set_flag(self, flag: str) -> None:
        """Set flag state ('unflagged', 'flagged', 'rejected')."""
        if flag in ("unflagged", "flagged", "rejected"):
            self.flag = flag
        else:
            raise ValueError(f"Invalid flag value: {flag}")
