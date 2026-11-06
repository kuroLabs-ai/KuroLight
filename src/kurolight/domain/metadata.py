"""User-authored, catalog-only metadata overrides."""

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AssetMetadataOverrides(BaseModel):
    """Editable fields stored by KuroLight without changing source files or EXIF snapshots."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    title: str = Field(default="", max_length=256)
    description: str = Field(default="", max_length=5000)
    keywords: list[str] = Field(default_factory=list, max_length=64)
    copyright: str = Field(default="", max_length=512)

    @field_validator("keywords")
    @classmethod
    def normalize_keywords(cls, keywords: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for keyword in keywords:
            value = keyword.strip()
            if len(value) > 256:
                raise ValueError("Keywords must be 256 characters or fewer.")
            if value and value.casefold() not in seen:
                normalized.append(value)
                seen.add(value.casefold())
        return normalized
