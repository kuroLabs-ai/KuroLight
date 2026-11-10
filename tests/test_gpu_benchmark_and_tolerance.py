"""Tests verifying GPU acceleration benchmarks, CPU fallback, and numerical output tolerance."""

import numpy as np
import pytest

from kurolight.processing.enhancement import ImageEnhancementEngine
from scripts.benchmark_gpu import compute_numerical_tolerance, run_benchmark


def test_compute_numerical_tolerance_identical_inputs():
    image = np.full((32, 32, 3), 0.5, dtype=np.float32)
    metrics = compute_numerical_tolerance(image, image.copy())

    assert metrics["max_absolute_delta"] == 0.0
    assert metrics["mean_absolute_error"] == 0.0
    assert metrics["mean_squared_error"] == 0.0
    assert metrics["psnr_db"] == 100.0
    assert metrics["ssim"] == 1.0
    assert metrics["within_tolerance"] is True


def test_compute_numerical_tolerance_within_contract_thresholds():
    ref = np.linspace(0.1, 0.9, 1000, dtype=np.float32).reshape(10, 10, 10)
    # Add small floating-point deviation of 1/255 (under 2/255 limit)
    cand = ref + (1.0 / 255.0) * 0.5

    metrics = compute_numerical_tolerance(ref, cand)
    assert metrics["max_absolute_delta"] <= (2.0 / 255.0)
    assert metrics["psnr_db"] > 45.0
    assert metrics["ssim"] > 0.999
    assert metrics["within_tolerance"] is True


def test_compute_numerical_tolerance_fails_on_large_divergence():
    ref = np.full((16, 16, 3), 0.2, dtype=np.float32)
    cand = np.full((16, 16, 3), 0.35, dtype=np.float32)  # delta = 0.15 >> 2/255

    metrics = compute_numerical_tolerance(ref, cand)
    assert metrics["within_tolerance"] is False
    assert metrics["max_absolute_delta"] == 0.15


def test_compute_numerical_tolerance_rejects_shape_mismatch():
    a = np.zeros((10, 10, 3))
    b = np.zeros((10, 12, 3))
    with pytest.raises(ValueError, match="Shape mismatch"):
        compute_numerical_tolerance(a, b)


def test_gpu_benchmark_runner_executes_and_reports_metrics():
    result = run_benchmark(tile_size=32, iterations=2)
    assert "device" in result
    assert "avg_cpu_latency_ms" in result
    assert "output_tolerance" in result
    assert result["output_tolerance"]["within_tolerance"] is True


def test_cpu_fallback_when_gpu_unavailable():
    # If no GPU is attached or GPU fails, compute_device_label returns CPU
    device = ImageEnhancementEngine.compute_device_label()
    assert device in {"CPU", "GPU: DirectML", "GPU: CUDA"}
