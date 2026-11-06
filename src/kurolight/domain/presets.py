"""Preset domain model for saving and applying editing recipes."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict
import uuid


@dataclass
class Preset:
    """Reusable parameter recipe."""
    id: str
    name: str
    category: str
    parameters: Dict[str, Any]
    schema_version: int = 1
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @classmethod
    def create(cls, name: str, category: str, parameters: Dict[str, Any]) -> "Preset":
        """Factory for new Preset entity."""
        return cls(
            id=str(uuid.uuid4()),
            name=name,
            category=category,
            parameters=parameters,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
