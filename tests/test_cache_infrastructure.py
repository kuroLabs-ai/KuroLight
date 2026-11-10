"""Tests for ThumbnailCache infrastructure."""

from pathlib import Path
from PIL import Image
from kurolight.infrastructure.cache.thumbnail_cache import ThumbnailCache


def _create_sample_image(path: Path, width: int = 400, height: int = 300) -> Path:
    img = Image.new("RGB", (width, height), color=(100, 150, 200))
    img.save(path, format="JPEG")
    return path


def test_thumbnail_cache_initialization(tmp_path: Path):
    """Verify ThumbnailCache initializes directory structure and default size."""
    cache = ThumbnailCache(cache_dir=tmp_path / "thumbs", default_size=256)
    assert cache.cache_dir.exists()
    assert cache.default_size == 256


def test_thumbnail_cache_generation_and_retrieval(tmp_path: Path):
    """Verify generating and retrieving thumbnail bytes and paths."""
    cache_dir = tmp_path / "thumbs"
    cache = ThumbnailCache(cache_dir=cache_dir, default_size=128)
    src_image = _create_sample_image(tmp_path / "sample.jpg")

    # 1. Retrieve thumbnail bytes
    thumb_bytes = cache.get_thumbnail_bytes(src_image, size=128)
    assert thumb_bytes is not None
    assert len(thumb_bytes) > 0

    # 2. Check disk file was generated
    thumb_path = cache.get_thumbnail_path(src_image, size=128)
    assert thumb_path.exists()

    # 3. Subsequent fetch should hit disk cache
    cached_bytes = cache.get_thumbnail_bytes(src_image, size=128)
    assert cached_bytes == thumb_bytes


def test_thumbnail_cache_missing_file_returns_none(tmp_path: Path):
    """Verify attempting to get thumbnail for missing file returns None."""
    cache = ThumbnailCache(cache_dir=tmp_path / "thumbs")
    missing_path = tmp_path / "non_existent.jpg"
    assert cache.get_thumbnail_bytes(missing_path) is None


def test_thumbnail_cache_invalidation(tmp_path: Path):
    """Verify invalidating a specific image removes its cached thumbnail."""
    cache = ThumbnailCache(cache_dir=tmp_path / "thumbs", default_size=128)
    src_image = _create_sample_image(tmp_path / "to_invalidate.jpg")

    _ = cache.get_thumbnail_bytes(src_image, size=128)
    thumb_path = cache.get_thumbnail_path(src_image, size=128)
    assert thumb_path.exists()

    cache.invalidate(src_image)
    assert not thumb_path.exists()
