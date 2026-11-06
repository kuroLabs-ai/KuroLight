"""Project domain model representing an editing session and database catalog."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
import uuid


@dataclass
class Project:
    """Project metadata and persistence reference."""
    id: str
    name: str
    created_at: str
    updated_at: str
    schema_version: int = 1
    db_path: Optional[Path] = None
    settings: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def create(cls, name: str, db_path: Optional[Path] = None) -> "Project":
        """Factory for new Project."""
        now = datetime.now(timezone.utc).isoformat()
        return cls(
            id=str(uuid.uuid4()),
            name=name,
            created_at=now,
            updated_at=now,
            db_path=db_path,
        )

    def mark_updated(self) -> None:
        """Update last modified timestamp."""
        self.updated_at = datetime.now(timezone.utc).isoformat()
