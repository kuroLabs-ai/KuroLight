import pytest

from scripts.benchmark_catalog import (
    run_benchmark,
    run_decode_benchmark,
    run_export_benchmark,
    run_import_benchmark,
    run_preview_benchmark,
)


def test_catalog_benchmark_reports_bounded_startup_and_query_metrics():
    result = run_benchmark(asset_count=250, repeats=1)

    assert result["asset_count"] == 250
    assert result["startup_page_size"] == 200
    assert result["startup_asset_count"] == 200
    assert result["startup_asset_payload_bytes"] > 0
    assert result["startup_peak_python_bytes"] > 0
    assert result["page_200"]["median_ms"] >= 0
    assert result["filtered_page_200"]["median_ms"] >= 0


@pytest.mark.parametrize(
    ("asset_count", "repeats"),
    [(0, 1), (-1, 1), (1, 0), (1, -1), (True, 1), (1, False)],
)
def test_catalog_benchmark_rejects_non_positive_parameters(asset_count, repeats):
    with pytest.raises(ValueError):
        run_benchmark(asset_count, repeats)


def test_import_benchmark_reports_successes_and_thumbnail_metrics():
    result = run_import_benchmark(image_count=3, repeats=1)

    assert result["image_count"] == 3
    assert result["imported_count"] == 3
    assert result["import_includes_thumbnail_generation"] is False
    assert result["import_summary"]["median_ms"] >= 0
    assert result["thumbnail_bytes_generation"]["median_ms"] >= 0
    assert result["thumbnail_output_bytes_per_repeat"] > 0


@pytest.mark.parametrize(
    ("image_count", "repeats"),
    [(0, 1), (-1, 1), (1, 0), (1, -1), (True, 1), (1, False)],
)
def test_import_benchmark_rejects_non_positive_parameters(image_count, repeats):
    with pytest.raises(ValueError):
        run_import_benchmark(image_count, repeats)


def test_decode_benchmark_reports_full_resolution_output():
    result = run_decode_benchmark(width=64, height=48, repeats=1)

    assert result["image_dimensions"] == [64, 48]
    assert result["decoder"] == "ExportService.load_full_resolution_buffer"
    assert result["decode_summary"]["median_ms"] >= 0
    assert result["output_buffer_bytes"] == 64 * 48 * 3 * 4
    assert result["source_file_bytes"] > 0


@pytest.mark.parametrize(
    ("width", "height", "repeats"),
    [(0, 48, 1), (64, 0, 1), (64, 48, 0), (True, 48, 1), (64, 48, False)],
)
def test_decode_benchmark_rejects_non_positive_parameters(width, height, repeats):
    with pytest.raises(ValueError):
        run_decode_benchmark(width, height, repeats)


def test_preview_benchmark_reports_preview_dimensions_and_timing():
    result = run_preview_benchmark(width=64, height=48, repeats=1, max_preview_edge=32)

    assert result["source_dimensions"] == [64, 48]
    assert result["preview_dimensions"] == [32, 24]
    assert result["operation"] == "EditingService.render_preview"
    assert result["preview_summary"]["median_ms"] >= 0


@pytest.mark.parametrize(
    ("width", "height", "repeats", "max_preview_edge"),
    [(0, 48, 1, 32), (64, 0, 1, 32), (64, 48, 0, 32), (64, 48, 1, 0)],
)
def test_preview_benchmark_rejects_non_positive_parameters(
    width, height, repeats, max_preview_edge
):
    with pytest.raises(ValueError):
        run_preview_benchmark(width, height, repeats, max_preview_edge)


def test_export_benchmark_reports_complete_jpeg_export():
    result = run_export_benchmark(width=64, height=48, repeats=1)

    assert result["image_dimensions"] == [64, 48]
    assert result["operation"] == "ExportService.export_job"
    assert result["format"] == "jpeg"
    assert result["export_summary"]["median_ms"] >= 0
    assert result["output_file_bytes"] > 0


@pytest.mark.parametrize(
    ("width", "height", "repeats"),
    [(0, 48, 1), (64, 0, 1), (64, 48, 0), (True, 48, 1), (64, 48, False)],
)
def test_export_benchmark_rejects_non_positive_parameters(width, height, repeats):
    with pytest.raises(ValueError):
        run_export_benchmark(width, height, repeats)
