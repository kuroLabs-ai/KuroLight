"""Explicit metadata sidecar import/export for catalog-only overrides.

This module intentionally keeps source image files and existing vendor sidecars
untouched unless the caller explicitly requests a sidecar write. The sidecar is
stored next to the image as a JSON file with a KuroLight-specific name so it does
not overwrite a standard XMP/.xmp sidecar accidentally.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from kurolight.domain.metadata import AssetMetadataOverrides

SIDECAR_SUFFIX = ".kuro.metadata.json"


class SidecarConflictError(ValueError):
    """Raised when an explicit sidecar update would overwrite conflicting data."""


@dataclass
class MetadataSidecarResult:
    """Structured metadata read/write result for an explicit sidecar round trip."""

    source_path: Path
    sidecar_path: Path
    metadata: AssetMetadataOverrides = field(default_factory=AssetMetadataOverrides)
    extra_fields: dict[str, Any] = field(default_factory=dict)
    existed: bool = False
    conflict_detected: bool = False


class MetadataSidecarManager:
    """Import and export catalog-only metadata overrides as an adjacent sidecar."""

    @staticmethod
    def sidecar_path_for(source_path: str | Path) -> Path:
        path = Path(source_path).resolve()
        if path.suffix:
            return path.with_name(f"{path.stem}{SIDECAR_SUFFIX}")
        return path.with_name(f"{path.name}{SIDECAR_SUFFIX}")

    @staticmethod
    def _normalize_metadata(overrides: AssetMetadataOverrides | dict[str, Any]) -> AssetMetadataOverrides:
        if isinstance(overrides, AssetMetadataOverrides):
            return overrides
        if isinstance(overrides, dict):
            return AssetMetadataOverrides.model_validate(overrides)
        raise TypeError("Expected AssetMetadataOverrides or a dict of override values.")

    @staticmethod
    def _read_payload(path: Path) -> dict[str, Any]:
        if not path.exists():
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Metadata sidecar {path} is not valid JSON: {exc}") from exc
        if not isinstance(payload, dict):
            raise ValueError(f"Metadata sidecar {path} must contain a JSON object.")
        return payload

    @staticmethod
    def import_metadata(source_path: str | Path) -> MetadataSidecarResult:
        """Read explicit metadata overrides from the adjacent sidecar file."""
        source = Path(source_path).resolve()
        sidecar_path = MetadataSidecarManager.sidecar_path_for(source)
        payload = MetadataSidecarManager._read_payload(sidecar_path)
        if not payload:
            return MetadataSidecarResult(
                source_path=source,
                sidecar_path=sidecar_path,
                metadata=AssetMetadataOverrides(),
                extra_fields={},
                existed=False,
            )

        metadata_payload = payload.get("metadata", {})
        if not isinstance(metadata_payload, dict):
            raise ValueError(f"Metadata sidecar {sidecar_path} has an invalid metadata payload.")

        known_fields = {field_name: metadata_payload.get(field_name) for field_name in AssetMetadataOverrides.model_fields}
        extra_fields = payload.get("unknown_fields", {})
        if not isinstance(extra_fields, dict):
            raise ValueError(f"Metadata sidecar {sidecar_path} has an invalid unknown_fields payload.")

        metadata = AssetMetadataOverrides.model_validate(known_fields)
        return MetadataSidecarResult(
            source_path=source,
            sidecar_path=sidecar_path,
            metadata=metadata,
            extra_fields=extra_fields,
            existed=True,
        )

    @staticmethod
    def export_metadata(
        source_path: str | Path,
        overrides: AssetMetadataOverrides | dict[str, Any],
        *,
        conflict: str = "error",
    ) -> MetadataSidecarResult:
        """Write the explicit metadata sidecar file with conflict handling.

        conflict can be: "error" (raise on mismatch), "merge" (use the incoming values and
        keep legacy unknown fields), or "overwrite" (replace the existing explicit sidecar data).
        """
        if conflict not in {"error", "merge", "overwrite"}:
            raise ValueError("conflict must be one of: 'error', 'merge', 'overwrite'.")

        source = Path(source_path).resolve()
        sidecar_path = MetadataSidecarManager.sidecar_path_for(source)
        new_metadata = MetadataSidecarManager._normalize_metadata(overrides)
        payload = MetadataSidecarManager._read_payload(sidecar_path)
        existing = payload.get("metadata", {}) if isinstance(payload, dict) else {}
        extra_fields = payload.get("unknown_fields", {}) if isinstance(payload, dict) else {}

        if sidecar_path.exists() and existing:
            existing_metadata = AssetMetadataOverrides.model_validate(existing)
            known_conflicts = [
                field_name
                for field_name in AssetMetadataOverrides.model_fields
                if getattr(existing_metadata, field_name) != getattr(new_metadata, field_name)
            ]
            if known_conflicts:
                if conflict == "error":
                    raise SidecarConflictError(
                        f"Metadata sidecar {sidecar_path} already contains conflicting values for: "
                        f"{', '.join(known_conflicts)}"
                    )
                if conflict == "merge":
                    # Keep the explicit incoming values and preserve the older vendor payload.
                    final_metadata = new_metadata
                    final_extra = extra_fields
                else:
                    final_metadata = new_metadata
                    final_extra = extra_fields
                conflict_detected = True
            else:
                final_metadata = new_metadata
                final_extra = extra_fields
                conflict_detected = False
        else:
            final_metadata = new_metadata
            final_extra = extra_fields
            conflict_detected = False

        result = MetadataSidecarResult(
            source_path=source,
            sidecar_path=sidecar_path,
            metadata=final_metadata,
            extra_fields=final_extra,
            existed=sidecar_path.exists(),
            conflict_detected=conflict_detected,
        )

        sidecar_path.write_text(
            json.dumps(
                {
                    "version": 1,
                    "type": "kurolight.metadata-overrides",
                    "metadata": final_metadata.model_dump(mode="json"),
                    "unknown_fields": final_extra,
                },
                indent=2,
                sort_keys=True,
            ),
            encoding="utf-8",
        )
        return result

    @staticmethod
    def read_metadata(source_path: str | Path) -> MetadataSidecarResult:
        return MetadataSidecarManager.import_metadata(source_path)

    @staticmethod
    def write_metadata(
        source_path: str | Path,
        overrides: AssetMetadataOverrides | dict[str, Any],
        *,
        conflict: str = "error",
    ) -> MetadataSidecarResult:
        return MetadataSidecarManager.export_metadata(source_path, overrides, conflict=conflict)


__all__ = [
    "MetadataSidecarManager",
    "MetadataSidecarResult",
    "SidecarConflictError",
    "SIDECAR_SUFFIX",
]
