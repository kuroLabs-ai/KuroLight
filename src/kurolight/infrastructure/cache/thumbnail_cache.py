"""High-performance persistent disk and memory thumbnail cache."""

import hashlib
from io import BytesIO
from pathlib import Path
from typing import Dict, Optional
from PIL import Image
from PySide6.QtGui import QPixmap

from kurolight.config.app_config import AppConfig
from kurolight.infrastructure.logging import get_logger

logger = get_logger("infrastructure.cache.thumbnail")


class ThumbnailCache:
    """Manages generation, disk persistence, and memory caching of image thumbnails."""

    def __init__(self, cache_dir: Optional[Path] = None, default_size: int = 256):
        self.cache_dir = cache_dir or (AppConfig.get_cache_dir() / "thumbnails")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.default_size = default_size
        self._memory_cache: Dict[str, QPixmap] = {}
        self._max_memory_items = 500

    def get_cache_key(self, source_path: Path, size: int) -> str:
        """Derive persistent cache hash from path, mtime, and dimensions."""
        path = Path(source_path).resolve()
        mtime = path.stat().st_mtime if path.exists() else 0
        raw_key = f"{path.as_posix()}_{mtime}_{size}"
        return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    def get_thumbnail_path(self, source_path: Path, size: Optional[int] = None) -> Path:
        """Return cached thumbnail file path."""
        s = size or self.default_size
        key = self.get_cache_key(source_path, s)
        return self.cache_dir / f"{key}.jpg"

    def get_thumbnail_bytes(self, source_path: Path, size: Optional[int] = None) -> Optional[bytes]:
        """Fetch or generate a thumbnail as JPEG bytes without creating a Qt image."""
        s = size or self.default_size
        path = Path(source_path).resolve()
        if not path.exists():
            return None

        disk_path = self.get_thumbnail_path(path, s)
        if disk_path.is_file():
            try:
                cached = disk_path.read_bytes()
                with Image.open(BytesIO(cached)) as image:
                    image.verify()
                return cached
            except (OSError, ValueError) as exc:
                logger.warning("Ignoring invalid thumbnail cache file %s: %s", disk_path, exc)

        try:
            with Image.open(path) as image:
                image.thumbnail((s, s), Image.Resampling.LANCZOS)
                if image.mode != "RGB":
                    image = image.convert("RGB")
                output = BytesIO()
                image.save(output, "JPEG", quality=85)
            data = output.getvalue()
            disk_path.write_bytes(data)
            return data
        except (OSError, ValueError) as exc:
            logger.warning("Failed to generate thumbnail for %s: %s", path, exc)
            return None

    def get_thumbnail(self, source_path: Path, size: Optional[int] = None) -> Optional[QPixmap]:
        """Fetch cached thumbnail from memory or disk, generating it if necessary."""
        s = size or self.default_size
        path = Path(source_path).resolve()
        if not path.exists():
            return None

        key = self.get_cache_key(path, s)

        # 1. Memory Cache
        if key in self._memory_cache:
            return self._memory_cache[key]

        # 2. Disk Cache
        disk_path = self.cache_dir / f"{key}.jpg"
        if disk_path.exists():
            pixmap = QPixmap(str(disk_path))
            if not pixmap.isNull():
                self._put_memory(key, pixmap)
                return pixmap

        # 3. Generate thumbnail
        return self.generate_thumbnail(path, s)

    def generate_thumbnail(self, source_path: Path, size: Optional[int] = None) -> Optional[QPixmap]:
        """Synchronously render and save thumbnail to disk and memory."""
        s = size or self.default_size
        path = Path(source_path).resolve()
        if not path.exists():
            return None

        key = self.get_cache_key(path, s)
        disk_path = self.cache_dir / f"{key}.jpg"

        try:
            with Image.open(path) as img:
                img.thumbnail((s, s), Image.Resampling.LANCZOS)
                # Convert to RGB if RGBA/CMYK/etc. for JPEG storage
                if img.mode != "RGB":
                    img = img.convert("RGB")
                img.save(disk_path, "JPEG", quality=85)

            pixmap = QPixmap(str(disk_path))
            if not pixmap.isNull():
                self._put_memory(key, pixmap)
                return pixmap
        except Exception as e:
            logger.warning("Failed to generate thumbnail for %s: %s", path, e)

        return None

    def _put_memory(self, key: str, pixmap: QPixmap) -> None:
        """Add to memory cache with simple eviction."""
        if len(self._memory_cache) >= self._max_memory_items:
            # Pop oldest item
            first_key = next(iter(self._memory_cache))
            self._memory_cache.pop(first_key, None)
        self._memory_cache[key] = pixmap

    def clear(self) -> None:
        """Clear memory cache."""
        self._memory_cache.clear()

    def invalidate(self, source_path: Path, size: Optional[int] = None) -> None:
        """Invalidate cached thumbnail from both memory and disk."""
        s = size or self.default_size
        key = self.get_cache_key(source_path, s)
        self._memory_cache.pop(key, None)
        disk_path = self.get_thumbnail_path(source_path, s)
        if disk_path.exists():
            disk_path.unlink()
