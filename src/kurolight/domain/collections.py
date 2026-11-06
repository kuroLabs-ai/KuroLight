"""Collection domain model for organizing image assets without duplicating files."""

import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from kurolight.domain.assets import ImageAsset, source_folder_from_path


class SmartCollectionRules(BaseModel):
    """Validated catalog-only criteria for dynamic collections."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    search: str = Field(default="", max_length=256)
    minimum_rating: int = Field(default=0, ge=0, le=5)
    flag: Literal["all", "flagged", "unflagged", "rejected"] = "all"
    source_folder: Optional[str] = Field(default=None, max_length=4096)

    @field_validator("minimum_rating", mode="before")
    @classmethod
    def validate_minimum_rating(cls, value: object) -> object:
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("Minimum rating must be an integer from 0 to 5.")
        return value

    @field_validator("source_folder")
    @classmethod
    def normalize_source_folder(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            return None
        return value

    def matches(self, asset: ImageAsset) -> bool:
        if asset.rating < self.minimum_rating:
            return False
        if self.flag != "all" and asset.flag != self.flag:
            return False
        if self.source_folder is not None:
            asset_folder = source_folder_from_path(asset.source_path)
            if os.name == "nt":
                if asset_folder.casefold() != self.source_folder.casefold():
                    return False
            elif asset_folder != self.source_folder:
                return False

        query = self.search.casefold()
        if query:
            metadata = asset.metadata if isinstance(asset.metadata, dict) else {}
            overrides = asset.metadata_overrides
            searchable_values = [
                asset.file_name,
                str(metadata.get("camera_model") or ""),
                str(metadata.get("lens_model") or ""),
                overrides.title,
                overrides.description,
                overrides.copyright,
                *overrides.keywords,
            ]
            if not any(query in value.casefold() for value in searchable_values):
                return False
        return True


CollectionType = Literal["manual", "smart"]


@dataclass
class Collection:
    """Named user collection of asset references."""
    id: str
    project_id: str
    name: str
    created_at: str
    asset_ids: List[str] = field(default_factory=list)
    parent_id: Optional[str] = None
    collection_type: CollectionType = "manual"
    rules: SmartCollectionRules = field(default_factory=SmartCollectionRules)

    @classmethod
    def create(
        cls, project_id: str, name: str, parent_id: Optional[str] = None
    ) -> "Collection":
        """Factory for a new manual collection."""
        normalized_name = cls._validate_name(name)
        normalized_parent_id = cls._validate_parent_id(parent_id)
        now = datetime.now(timezone.utc).isoformat()
        return cls(
            id=str(uuid.uuid4()),
            project_id=project_id,
            name=normalized_name,
            created_at=now,
            parent_id=normalized_parent_id,
        )

    @classmethod
    def create_smart(
        cls,
        project_id: str,
        name: str,
        rules: SmartCollectionRules,
        parent_id: Optional[str] = None,
    ) -> "Collection":
        """Factory for a new rule-based collection."""
        collection = cls.create(project_id, name, parent_id)
        collection.collection_type = "smart"
        collection.rules = rules
        return collection

    @staticmethod
    def _validate_name(name: str) -> str:
        if not isinstance(name, str):
            raise ValueError("Collection name must be a string.")
        normalized_name = name.strip()
        if not normalized_name or len(normalized_name) > 128:
            raise ValueError("Collection name must be between 1 and 128 characters.")
        return normalized_name

    @staticmethod
    def _validate_parent_id(parent_id: Optional[str]) -> Optional[str]:
        if parent_id is None:
            return None
        if not isinstance(parent_id, str) or not parent_id.strip() or len(parent_id) > 128:
            raise ValueError("Parent collection ID must be a non-empty string of at most 128 characters.")
        return parent_id

    def add_asset(self, asset_id: str) -> None:
        """Add asset reference if not already present."""
        if self.collection_type != "manual":
            raise ValueError("Assets cannot be added manually to a smart collection.")
        if asset_id not in self.asset_ids:
            self.asset_ids.append(asset_id)

    def remove_asset(self, asset_id: str) -> None:
        """Remove asset reference from collection."""
        if self.collection_type != "manual":
            raise ValueError("Assets cannot be removed manually from a smart collection.")
        if asset_id in self.asset_ids:
            self.asset_ids.remove(asset_id)
