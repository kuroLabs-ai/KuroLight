"""Evaluate local AI restoration against paired high-resolution references.

Run with ``python -m kurolight.processing.enhancement_evaluation --help``.
"""

import argparse
import json
import logging
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from kurolight.processing.enhancement import ImageEnhancementEngine

logger = logging.getLogger(__name__)


def _read_rgb(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError(f"Could not read evaluation image: {path}")
    if image.dtype == np.uint8:
        scale = 255.0
    elif image.dtype == np.uint16:
        scale = 65535.0
    else:
        raise ValueError(f"Expected an 8-bit or 16-bit image: {path}")

    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGB)
    elif image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2RGB)
    elif image.shape[2] == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    else:
        raise ValueError(f"Expected a grayscale, RGB, or RGBA image: {path}")
    return np.ascontiguousarray(image.astype(np.float32) / scale)


def _psnr_db(actual: np.ndarray, reference: np.ndarray) -> float | None:
    mse = float(np.mean(np.square(actual - reference)))
    if mse == 0:
        return None
    return float(10.0 * np.log10(1.0 / mse))


def _ssim(actual: np.ndarray, reference: np.ndarray) -> float:
    window = (11, 11)
    mean_actual = cv2.GaussianBlur(actual, window, 1.5)
    mean_reference = cv2.GaussianBlur(reference, window, 1.5)
    mean_actual_sq = np.square(mean_actual)
    mean_reference_sq = np.square(mean_reference)
    mean_product = mean_actual * mean_reference

    variance_actual = cv2.GaussianBlur(np.square(actual), window, 1.5) - mean_actual_sq
    variance_reference = (
        cv2.GaussianBlur(np.square(reference), window, 1.5) - mean_reference_sq
    )
    covariance = cv2.GaussianBlur(actual * reference, window, 1.5) - mean_product
    c1 = 0.01**2
    c2 = 0.03**2
    numerator = (2 * mean_product + c1) * (2 * covariance + c2)
    denominator = (mean_actual_sq + mean_reference_sq + c1) * (
        variance_actual + variance_reference + c2
    )
    return float(np.mean(numerator / np.maximum(denominator, np.finfo(np.float32).eps)))


def _metrics(actual: np.ndarray, reference: np.ndarray) -> dict[str, float | None]:
    if actual.shape != reference.shape:
        raise ValueError(
            f"Image and reference dimensions differ: {actual.shape} != {reference.shape}"
        )
    return {"psnr_db": _psnr_db(actual, reference), "ssim": _ssim(actual, reference)}


def _load_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not load evaluation manifest {path}: {error}") from error
    if not isinstance(manifest, dict):
        raise TypeError("Evaluation manifest must be a JSON object")
    for field in ("dataset_license", "dataset_provenance"):
        if not isinstance(manifest.get(field), str) or not manifest[field].strip():
            raise ValueError(f"Manifest must include a non-empty {field}")
    items = manifest.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("Manifest must contain a non-empty items array")
    seen_ids = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise TypeError(f"Manifest item {index} must be an object")
        for field in ("id", "category", "input", "reference"):
            if not isinstance(item.get(field), str) or not item[field].strip():
                raise ValueError(f"Manifest item {index} must include a non-empty {field}")
        if item["id"] in seen_ids:
            raise ValueError(f"Manifest contains duplicate item id: {item['id']}")
        seen_ids.add(item["id"])
        if item.get("target_height") not in (720, 1080, 1440, 2160):
            raise ValueError(f"Manifest item {item['id']} has an unsupported target_height")
    return manifest


def _mean(values: list[float | None]) -> float | None:
    available = [value for value in values if value is not None]
    return float(np.mean(available)) if available else None


def evaluate_manifest(manifest_path: Path, output_dir: Path) -> dict[str, Any]:
    """Run restoration and paired image metrics for each manifest entry."""
    manifest_path = manifest_path.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = _load_manifest(manifest_path)
    results = []
    category_results: dict[str, list[dict[str, Any]]] = defaultdict(list)
    devices = set()

    for index, item in enumerate(manifest["items"], start=1):
        input_path = (manifest_path.parent / item["input"]).resolve()
        reference_path = (manifest_path.parent / item["reference"]).resolve()
        source = _read_rgb(input_path)
        reference = _read_rgb(reference_path)
        start = time.perf_counter()
        restored = ImageEnhancementEngine.restore(source, item["target_height"])
        elapsed_seconds = time.perf_counter() - start
        if restored.shape != reference.shape:
            raise ValueError(
                f"Restored output for {item['id']} has dimensions {restored.shape[:2]}, "
                f"but its reference is {reference.shape[:2]}"
            )

        baseline = cv2.resize(
            source,
            (reference.shape[1], reference.shape[0]),
            interpolation=cv2.INTER_LANCZOS4,
        )
        result_metrics = {
            "restored": _metrics(restored, reference),
            "lanczos_baseline": _metrics(baseline, reference),
        }
        result_metrics["delta_vs_lanczos"] = {
            metric: (
                float(result_metrics["restored"][metric] - result_metrics["lanczos_baseline"][metric])
                if result_metrics["restored"][metric] is not None
                and result_metrics["lanczos_baseline"][metric] is not None
                else None
            )
            for metric in ("psnr_db", "ssim")
        }
        device = ImageEnhancementEngine.compute_device_label()
        devices.add(device)
        output_path = output_dir / f"restored_{index:03d}_{Path(item['input']).stem}.png"
        output_bgr = cv2.cvtColor(
            np.round(np.clip(restored, 0.0, 1.0) * 255).astype(np.uint8),
            cv2.COLOR_RGB2BGR,
        )
        if not cv2.imwrite(str(output_path), output_bgr):
            raise OSError(f"Could not write restored evaluation image: {output_path}")

        entry = {
            "id": item["id"],
            "category": item["category"],
            "input": str(input_path),
            "reference": str(reference_path),
            "restored_output": str(output_path.resolve()),
            "device": device,
            "elapsed_seconds": elapsed_seconds,
            "metrics": result_metrics,
        }
        results.append(entry)
        category_results[item["category"]].append(entry)

    categories = {}
    for category, entries in sorted(category_results.items()):
        categories[category] = {
            "count": len(entries),
            "mean_elapsed_seconds": _mean([entry["elapsed_seconds"] for entry in entries]),
            "mean_restored_psnr_db": _mean(
                [entry["metrics"]["restored"]["psnr_db"] for entry in entries]
            ),
            "mean_restored_ssim": _mean(
                [entry["metrics"]["restored"]["ssim"] for entry in entries]
            ),
            "mean_psnr_delta_vs_lanczos_db": _mean(
                [entry["metrics"]["delta_vs_lanczos"]["psnr_db"] for entry in entries]
            ),
            "mean_ssim_delta_vs_lanczos": _mean(
                [entry["metrics"]["delta_vs_lanczos"]["ssim"] for entry in entries]
            ),
        }

    report = {
        "dataset_license": manifest["dataset_license"],
        "dataset_provenance": manifest["dataset_provenance"],
        "devices": sorted(devices),
        "categories": categories,
        "items": results,
    }
    report_path = output_dir / "enhancement-evaluation.json"
    temporary_report = report_path.with_suffix(".json.tmp")
    temporary_report.write_text(json.dumps(report, indent=2), encoding="utf-8")
    temporary_report.replace(report_path)
    logger.info("Wrote restoration evaluation report to %s", report_path)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="JSON manifest for paired test images")
    parser.add_argument("output_dir", type=Path, help="Directory for restored images and report")
    args = parser.parse_args()
    report = evaluate_manifest(args.manifest, args.output_dir)
    print(json.dumps(report["categories"], indent=2))


if __name__ == "__main__":
    main()
