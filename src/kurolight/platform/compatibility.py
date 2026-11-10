"""Platform detection, path normalization, credential verification, and hardware acceleration discovery."""

from __future__ import annotations

import os
import platform
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

PlatformOS = Literal["windows", "macos", "linux", "unknown"]
WebviewBackend = Literal["edge_webview2", "webkit_wkwebview", "webkitgtk", "unsupported"]


@dataclass(frozen=True)
class DesktopPlatformInfo:
    os_name: PlatformOS
    os_release: str
    machine: str
    python_version: str
    is_64bit: bool
    recommended_webview_backend: WebviewBackend
    supported_accelerators: list[str]


class PlatformCompatibility:
    """Provides cross-platform normalization and runtime environment checks."""

    @staticmethod
    def get_current_os() -> PlatformOS:
        if sys.platform == "win32":
            return "windows"
        if sys.platform == "darwin":
            return "macos"
        if sys.platform.startswith("linux"):
            return "linux"
        return "unknown"

    @staticmethod
    def get_platform_info() -> DesktopPlatformInfo:
        current_os = PlatformCompatibility.get_current_os()
        machine = platform.machine().lower()

        if current_os == "windows":
            backend: WebviewBackend = "edge_webview2"
            accelerators = ["DirectML", "CUDA", "CPU"]
        elif current_os == "macos":
            backend = "webkit_wkwebview"
            accelerators = ["CoreML", "MPS", "CPU"]
        elif current_os == "linux":
            backend = "webkitgtk"
            accelerators = ["CUDA", "ROCm", "OpenVINO", "CPU"]
        else:
            backend = "unsupported"
            accelerators = ["CPU"]

        return DesktopPlatformInfo(
            os_name=current_os,
            os_release=platform.release(),
            machine=machine,
            python_version=platform.python_version(),
            is_64bit=sys.maxsize > 2**32,
            recommended_webview_backend=backend,
            supported_accelerators=accelerators,
        )

    @staticmethod
    def normalize_path(raw_path: str | Path, target_os: PlatformOS | None = None) -> str:
        """Normalizes path strings across OS conventions (handling slashes and drive letters)."""
        if not raw_path:
            return ""

        path_str = str(raw_path).strip()
        os_to_use = target_os or PlatformCompatibility.get_current_os()

        if os_to_use == "windows":
            # Convert forward slashes to backslashes
            normalized = path_str.replace("/", "\\")
            # If path has drive letter like c:\ or C:\, capitalize drive letter
            if len(normalized) >= 2 and normalized[1] == ":" and normalized[0].isalpha():
                normalized = normalized[0].upper() + normalized[1:]
            return normalized
        else:
            # POSIX: convert backslashes to forward slashes
            normalized = path_str.replace("\\", "/")
            return normalized

    @staticmethod
    def is_path_safe(base_dir: Path, target_path: Path) -> bool:
        """Ensures target_path does not escape base_dir via directory traversal."""
        try:
            resolved_base = base_dir.resolve()
            resolved_target = target_path.resolve()
            return resolved_base in resolved_target.parents or resolved_base == resolved_target
        except (ValueError, RuntimeError):
            return False

    @staticmethod
    def get_data_directory_for_platform(app_name: str = "KuroLight", target_os: PlatformOS | None = None) -> Path:
        """Returns the canonical user application data directory per OS."""
        os_to_use = target_os or PlatformCompatibility.get_current_os()
        if os_to_use == "windows":
            base = os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local"
            return Path(base) / app_name
        elif os_to_use == "macos":
            return Path.home() / "Library" / "Application Support" / app_name
        else:
            # Linux / XDG
            xdg_data = os.environ.get("XDG_DATA_HOME")
            base = Path(xdg_data) if xdg_data else Path.home() / ".local" / "share"
            return base / app_name.lower()

    @staticmethod
    def verify_keyring_backend() -> dict[str, Any]:
        """Checks if a functional OS keychain is accessible or in-memory fallback is active."""
        try:
            import keyring
            backend = keyring.get_keyring()
            backend_name = backend.__class__.__name__
            priority = getattr(backend, "priority", 0)
            is_usable = priority > 0
            return {
                "backend_class": backend_name,
                "priority": priority,
                "is_usable": is_usable,
                "is_fallback": "fail" in backend_name.lower() or priority <= 0,
            }
        except Exception as exc:
            return {
                "backend_class": "None",
                "priority": 0,
                "is_usable": False,
                "is_fallback": True,
                "error": str(exc),
            }
