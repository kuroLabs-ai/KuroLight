"""Measure synthetic catalog, import, image-processing, and export workloads."""

import argparse
import json
import platform
import sqlite3
import statistics
import sys
import tempfile
import time
import tracemalloc
from collections.abc import Callable
from pathlib import Path

import numpy as np
from PIL import Image

from kurolight.domain.editing import EditState
from kurolight.domain.export import ExportFormat, ExportJob, ExportSettings
from kurolight.domain.projects import Project
from kurolight.infrastructure.cache.thumbnail_cache import ThumbnailCache
from kurolight.services.editing_service import EditingService
from kurolight.services.export_service import ExportService
from kurolight.services.library_service import LibraryService
from kurolight.services.project_service import ProjectService
from kurolight.ui.web_bridge import PyBridge

STARTUP_PAGE_SIZE = 200


def _measure(operation: Callable[[], object], repeats: int) -> list[float]:
    samples = []
    for _ in range(repeats):
        started = time.perf_counter()
        operation()
        samples.append((time.perf_counter() - started) * 1000)
    return samples


def _summary(samples: list[float]) -> dict[str, float]:
    ordered = sorted(samples)
    p95_index = min(len(ordered) - 1, int(len(ordered) * 0.95))
    return {
        "median_ms": round(statistics.median(ordered), 3),
        "p95_ms": round(ordered[p95_index], 3),
    }


def _write_synthetic_jpeg(path: Path, width: int, height: int) -> None:
    y, x = np.indices((height, width))
    pixels = np.stack((x % 256, y % 256, (x + y) % 256), axis=-1).astype(np.uint8)
    Image.fromarray(pixels).save(path, "JPEG", quality=90)


class _NoOpThumbnailCache:
    def generate_thumbnail(self, _source_path: Path) -> None:
        return None


def run_benchmark(asset_count: int, repeats: int) -> dict[str, object]:
    if isinstance(asset_count, bool) or not isinstance(asset_count, int) or asset_count < 1:
        raise ValueError("Asset count must be a positive integer.")
    if isinstance(repeats, bool) or not isinstance(repeats, int) or repeats < 1:
        raise ValueError("Repeat count must be a positive integer.")
    with tempfile.TemporaryDirectory(prefix="kurolight-catalog-benchmark-") as temp_dir:
        service = ProjectService.open_or_create_project(Path(temp_dir) / "catalog.sqlite")
        try:
            project = service.get_current_project()
            if project is None:
                raise RuntimeError("Benchmark project was not created.")
            return _run_project_benchmark(service, project, Path(temp_dir), asset_count, repeats)
        finally:
            service.db_manager.close_thread_connection()


def run_import_benchmark(image_count: int, repeats: int) -> dict[str, object]:
    if isinstance(image_count, bool) or not isinstance(image_count, int) or image_count < 1:
        raise ValueError("Import image count must be a positive integer.")
    if isinstance(repeats, bool) or not isinstance(repeats, int) or repeats < 1:
        raise ValueError("Repeat count must be a positive integer.")

    with tempfile.TemporaryDirectory(prefix="kurolight-import-benchmark-") as temp_dir:
        root = Path(temp_dir)
        source_dir = root / "sources"
        source_dir.mkdir()
        paths = []
        for index in range(image_count):
            image_path = source_dir / f"photo-{index:06}.jpg"
            Image.new(
                "RGB",
                (320, 240),
                (index % 256, (index * 7) % 256, (index * 13) % 256),
            ).save(image_path, "JPEG", quality=85)
            paths.append(image_path)

        import_samples: list[float] = []
        import_peaks: list[int] = []
        imported_count = 0
        thumbnail_samples: list[float] = []
        thumbnail_bytes = 0

        for repeat in range(repeats):
            project_service = ProjectService.open_or_create_project(
                root / f"catalog-{repeat}.sqlite"
            )
            try:
                project = project_service.get_current_project()
                if project is None:
                    raise RuntimeError("Import benchmark project was not created.")
                library = LibraryService(
                    project_service.asset_repo,
                    project_service.edit_state_repo,
                    project_service.collection_repo,
                    thumbnail_cache=_NoOpThumbnailCache(),
                )
                tracemalloc.start()
                try:
                    started = time.perf_counter()
                    result = library.import_files(paths, project.id)
                    import_samples.append((time.perf_counter() - started) * 1000)
                    _, peak = tracemalloc.get_traced_memory()
                    import_peaks.append(peak)
                finally:
                    tracemalloc.stop()

                if result.failures or len(result.imported) != image_count:
                    failures = [str(failure.path) for failure in result.failures[:5]]
                    raise RuntimeError(
                        f"Import benchmark expected {image_count} successes, "
                        f"got {len(result.imported)}; failures: {failures}"
                    )
                imported_count = len(result.imported)

                cache = ThumbnailCache(root / f"thumbnails-{repeat}")
                started = time.perf_counter()
                for path in paths:
                    data = cache.get_thumbnail_bytes(path)
                    if data is None:
                        raise RuntimeError(f"Thumbnail benchmark failed for {path}.")
                    thumbnail_bytes += len(data)
                thumbnail_samples.append((time.perf_counter() - started) * 1000)
            finally:
                project_service.db_manager.close_thread_connection()

        return {
            "image_count": image_count,
            "repeats": repeats,
            "import_includes_thumbnail_generation": False,
            "import_summary": _summary(import_samples),
            "import_peak_python_bytes": max(import_peaks),
            "imported_count": imported_count,
            "thumbnail_bytes_generation": _summary(thumbnail_samples),
            "thumbnail_output_bytes_per_repeat": thumbnail_bytes // repeats,
            "image_dimensions": [320, 240],
        }


def run_decode_benchmark(width: int, height: int, repeats: int) -> dict[str, object]:
    for name, value in (("width", width), ("height", height), ("repeat count", repeats)):
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(f"Decode benchmark {name} must be a positive integer.")

    with tempfile.TemporaryDirectory(prefix="kurolight-decode-benchmark-") as temp_dir:
        image_path = Path(temp_dir) / "full-resolution.jpg"
        _write_synthetic_jpeg(image_path, width, height)

        service = ExportService()
        samples = []
        output_buffer_bytes = 0
        for _ in range(repeats):
            started = time.perf_counter()
            decoded = service.load_full_resolution_buffer(image_path)
            samples.append((time.perf_counter() - started) * 1000)
            if decoded.width != width or decoded.height != height or decoded.channels != 3:
                raise RuntimeError(
                    "Decode benchmark returned unexpected image dimensions or channels."
                )
            output_buffer_bytes = decoded.data.nbytes

        return {
            "image_dimensions": [width, height],
            "repeats": repeats,
            "decoder": "ExportService.load_full_resolution_buffer",
            "decode_summary": _summary(samples),
            "output_buffer_bytes": output_buffer_bytes,
            "source_file_bytes": image_path.stat().st_size,
        }


def run_preview_benchmark(
    width: int, height: int, repeats: int, max_preview_edge: int = 2048
) -> dict[str, object]:
    for name, value in (
        ("width", width),
        ("height", height),
        ("repeat count", repeats),
        ("maximum preview edge", max_preview_edge),
    ):
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(f"Preview benchmark {name} must be a positive integer.")

    with tempfile.TemporaryDirectory(prefix="kurolight-preview-benchmark-") as temp_dir:
        image_path = Path(temp_dir) / "preview-source.jpg"
        _write_synthetic_jpeg(image_path, width, height)
        samples = []
        preview_dimensions = None

        for repeat in range(repeats):
            service = EditingService(edit_state_repo=None, max_preview_edge=max_preview_edge)
            state = EditState(asset_id=f"benchmark-preview-{repeat}")
            started = time.perf_counter()
            preview = service.render_preview(state.asset_id, image_path, state)
            samples.append((time.perf_counter() - started) * 1000)
            if max(preview.width, preview.height) > max_preview_edge:
                raise RuntimeError("Preview benchmark exceeded the configured maximum edge.")
            preview_dimensions = [preview.width, preview.height]

        return {
            "source_dimensions": [width, height],
            "preview_dimensions": preview_dimensions,
            "maximum_preview_edge": max_preview_edge,
            "repeats": repeats,
            "operation": "EditingService.render_preview",
            "preview_summary": _summary(samples),
            "source_file_bytes": image_path.stat().st_size,
        }


def run_export_benchmark(width: int, height: int, repeats: int) -> dict[str, object]:
    for name, value in (("width", width), ("height", height), ("repeat count", repeats)):
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(f"Export benchmark {name} must be a positive integer.")

    with tempfile.TemporaryDirectory(prefix="kurolight-export-benchmark-") as temp_dir:
        root = Path(temp_dir)
        image_path = root / "export-source.jpg"
        _write_synthetic_jpeg(image_path, width, height)
        samples = []
        output_file_bytes = 0

        for repeat in range(repeats):
            service = ExportService()
            output_path = root / f"export-{repeat}.jpg"
            job = ExportJob(
                asset_id=f"benchmark-export-{repeat}",
                asset_name=image_path.name,
                source_path=image_path,
                target_path=output_path,
                settings=ExportSettings(
                    format=ExportFormat.JPEG,
                    output_dir=root,
                    quality=90,
                ),
                edit_state=EditState(asset_id=f"benchmark-export-{repeat}"),
            )
            started = time.perf_counter()
            result = service.export_job(job)
            samples.append((time.perf_counter() - started) * 1000)
            if not result.success or not output_path.is_file():
                raise RuntimeError(f"Export benchmark failed: {result.error_message}")
            output_file_bytes = result.file_size_bytes

        return {
            "image_dimensions": [width, height],
            "repeats": repeats,
            "operation": "ExportService.export_job",
            "format": ExportFormat.JPEG.value,
            "export_summary": _summary(samples),
            "output_file_bytes": output_file_bytes,
            "source_file_bytes": image_path.stat().st_size,
        }


def _run_project_benchmark(
    service: ProjectService,
    project: Project,
    temp_dir: Path,
    asset_count: int,
    repeats: int,
) -> dict[str, object]:
    with service.db_manager.transaction() as connection:
        connection.executemany(
            """
            INSERT INTO assets (
                id, project_id, source_path, file_name, file_type, file_size,
                date_captured, rating, flag, metadata_json
            ) VALUES (?, ?, ?, ?, 'jpg', ?, ?, ?, ?, '{}')
            """,
            (
                (
                    f"benchmark-{index:08}",
                    project.id,
                    str(temp_dir / f"photo-{index:08}.jpg"),
                    f"photo-{index:08}.jpg",
                    index * 1024,
                    f"2024-{index % 12 + 1:02}-01",
                    index % 6,
                    "flagged" if index % 5 == 0 else "unflagged",
                )
                for index in range(asset_count)
            ),
        )
    connection = service.db_manager.get_connection()
    connection.execute("ANALYZE;")

    emitted_payload = [""]

    def record_assets(_event: object, payload: str) -> None:
        emitted_payload[0] = payload

    bridge = PyBridge.__new__(PyBridge)
    bridge.app_state = type("AppState", (), {"current_project": project})()
    bridge.library_service = service
    bridge.assets_updated = type("AssetEvent", (), {"emit": record_assets})()
    bridge.asset_count_updated = type("CountEvent", (), {"emit": lambda *_args: None})()

    page_query = lambda: service.asset_repo.list_page(project.id, 0, STARTUP_PAGE_SIZE)
    filtered_query = lambda: service.asset_repo.list_filtered_page(
        project.id, 0, 200, minimum_rating=4, flag="flagged"
    )
    startup_query = bridge._push_assets

    tracemalloc.start()
    try:
        startup_samples = _measure(startup_query, repeats)
        _, startup_peak_bytes = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()

    emitted_payload_bytes = len(emitted_payload[0].encode("utf-8"))
    emitted_asset_count = len(json.loads(emitted_payload[0]))
    return {
        "python_version": sys.version.split()[0],
        "platform": platform.platform(),
        "sqlite_version": sqlite3.sqlite_version,
        "asset_count": asset_count,
        "repeats": repeats,
        "startup_page_size": STARTUP_PAGE_SIZE,
        "startup_asset_count": emitted_asset_count,
        "startup_summary": _summary(startup_samples),
        "startup_asset_payload_bytes": emitted_payload_bytes,
        "startup_peak_python_bytes": startup_peak_bytes,
        "page_200": _summary(_measure(page_query, repeats)),
        "filtered_page_200": _summary(_measure(filtered_query, repeats)),
        "filtered_result_count": service.asset_repo.count_filtered(
            project.id, minimum_rating=4, flag="flagged"
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=int, default=10000, help="synthetic catalog size")
    parser.add_argument("--repeats", type=int, default=7, help="measurement repetitions")
    parser.add_argument(
        "--import-assets",
        type=int,
        default=100,
        help="synthetic images to import and thumbnail per repeat",
    )
    parser.add_argument("--decode-width", type=int, default=2048, help="decode benchmark width")
    parser.add_argument("--decode-height", type=int, default=1536, help="decode benchmark height")
    args = parser.parse_args()
    if args.assets < 1:
        parser.error("--assets must be at least 1")
    if args.repeats < 1:
        parser.error("--repeats must be at least 1")
    if args.import_assets < 1:
        parser.error("--import-assets must be at least 1")
    if args.decode_width < 1:
        parser.error("--decode-width must be at least 1")
    if args.decode_height < 1:
        parser.error("--decode-height must be at least 1")
    print(
        json.dumps(
            {
                "catalog": run_benchmark(args.assets, args.repeats),
                "import": run_import_benchmark(args.import_assets, args.repeats),
                "decode": run_decode_benchmark(args.decode_width, args.decode_height, args.repeats),
                "preview": run_preview_benchmark(
                    args.decode_width, args.decode_height, args.repeats
                ),
                "export": run_export_benchmark(args.decode_width, args.decode_height, args.repeats),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
