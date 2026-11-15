import threading
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

import kurolight.processing.enhancement as enhancement_module
import kurolight.processing.enhancement_evaluation as evaluation_module
from kurolight.domain.editing import EditState
from kurolight.processing.buffer import ImageBuffer
from kurolight.processing.enhancement import ImageEnhancementEngine, ProcessingCancelled
from kurolight.processing.pipeline import RENDER_PROCESS_VERSION, DefaultImageProcessor


def test_local_denoising_reduces_flat_noise_and_preserves_edge():
    rng = np.random.default_rng(42)
    image = np.full((48, 64, 3), 0.25, dtype=np.float32)
    image[:, 32:] = 0.75
    image += rng.normal(0.0, 0.035, image.shape).astype(np.float32)
    image = np.clip(image, 0.0, 1.0)

    enhanced = ImageEnhancementEngine.apply_detail(image, noise_reduction=75)

    before_noise = float(np.std(image[8:24, 8:24]))
    after_noise = float(np.std(enhanced[8:24, 8:24]))
    before_edge = float(image[24, 40, 0] - image[24, 23, 0])
    after_edge = float(enhanced[24, 40, 0] - enhanced[24, 23, 0])
    assert after_noise < before_noise * 0.8
    assert after_edge > before_edge * 0.75
    assert enhanced.dtype == np.float32


def test_local_sharpening_increases_edge_contrast_without_changing_alpha():
    image = np.zeros((32, 32, 4), dtype=np.float32)
    image[:, 16:, :3] = 0.6
    image[..., 3] = 0.4
    original_alpha = image[..., 3].copy()

    enhanced = ImageEnhancementEngine.apply_detail(image, sharpening=80)

    original_edge = image[16, 16, 0] - image[16, 15, 0]
    enhanced_edge = enhanced[16, 16, 0] - enhanced[16, 15, 0]
    assert enhanced_edge > original_edge
    np.testing.assert_array_equal(enhanced[..., 3], original_alpha)
    np.testing.assert_array_equal(image[..., 3], original_alpha)


def test_ai_backend_preference_limits_provider_fallbacks():
    assert ImageEnhancementEngine._provider_order(True, "auto") == (
        "DmlExecutionProvider",
        "CUDAExecutionProvider",
    )
    assert ImageEnhancementEngine._provider_order(True, "directml") == (
        "DmlExecutionProvider",
    )
    assert ImageEnhancementEngine._provider_order(False, "auto") == ()
    assert ImageEnhancementEngine._provider_order(True, "cpu") == ()


def test_ai_restoration_targets_720p_and_preserves_input(monkeypatch):
    image = np.random.default_rng(42).random((144, 256, 3), dtype=np.float32)
    original = image.copy()
    progress = []

    def fake_predict(cls, tile, model_path):
        height, width = tile.shape[:2]
        return cv2.resize(tile, (width * 4, height * 4), interpolation=cv2.INTER_CUBIC)

    monkeypatch.setattr(ImageEnhancementEngine, "_predict_tile", classmethod(fake_predict))
    result = ImageEnhancementEngine.restore(
        image,
        720,
        model_path=Path("test-model.onnx"),
        progress_callback=progress.append,
    )

    assert result.shape == (720, 1280, 3)
    assert progress[0] == 0
    assert progress[-1] == 100
    assert progress == sorted(set(progress))
    assert result.dtype == np.float32
    assert result.min() >= 0
    assert result.max() <= 1
    np.testing.assert_array_equal(image, original)


def test_ai_restoration_can_be_cancelled_between_tiles(monkeypatch):
    image = np.random.default_rng(42).random((144, 256, 3), dtype=np.float32)
    cancel_event = threading.Event()
    processed_tiles = []

    def fake_predict(cls, tile, model_path):
        processed_tiles.append(tile)
        height, width = tile.shape[:2]
        return cv2.resize(tile, (width * 4, height * 4), interpolation=cv2.INTER_CUBIC)

    def report_progress(percent):
        if percent > 0:
            cancel_event.set()

    monkeypatch.setattr(ImageEnhancementEngine, "_predict_tile", classmethod(fake_predict))
    with pytest.raises(ProcessingCancelled, match="cancelled"):
        ImageEnhancementEngine.restore(
            image,
            720,
            model_path=Path("test-model.onnx"),
            progress_callback=report_progress,
            cancel_event=cancel_event,
        )
    assert len(processed_tiles) == 1


def test_model_download_cancellation_removes_partial_download(monkeypatch, tmp_path):
    model_path = tmp_path / "model.onnx"
    cancel_event = threading.Event()
    progress = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self, _size):
            return b"ab"

    monkeypatch.setattr(enhancement_module, "_MODEL_SIZE", 4)
    monkeypatch.setattr(
        ImageEnhancementEngine,
        "model_path",
        staticmethod(lambda: model_path),
    )
    monkeypatch.setattr(enhancement_module.urllib.request, "urlopen", lambda *_args, **_kwargs: FakeResponse())

    def report_progress(percent):
        progress.append(percent)
        if percent > 0:
            cancel_event.set()

    with pytest.raises(ProcessingCancelled, match="cancelled"):
        ImageEnhancementEngine.download_model(
            progress_callback=report_progress,
            cancel_event=cancel_event,
        )

    assert progress == [0, 50]
    assert not model_path.exists()
    assert not model_path.with_suffix(".onnx.download").exists()


def test_pipeline_restores_to_720p_and_preserves_alpha(monkeypatch):
    image = np.ones((144, 256, 4), dtype=np.float32) * 0.4
    alpha = np.linspace(0, 1, 144 * 256, dtype=np.float32).reshape(144, 256)
    image[..., 3] = alpha
    processor = DefaultImageProcessor()

    def fake_predict(cls, tile, model_path):
        height, width = tile.shape[:2]
        return cv2.resize(tile, (width * 4, height * 4), interpolation=cv2.INTER_CUBIC)

    monkeypatch.setattr(ImageEnhancementEngine, "_predict_tile", classmethod(fake_predict))
    disabled = EditState(
        asset_id="detail-disabled",
        detail={"enhancement_resolution": 720},
        custom_metadata={"flow_nodes": {"detail": False}},
    )
    unchanged_size = processor.process(ImageBuffer.from_numpy(image), disabled)
    assert (unchanged_size.width, unchanged_size.height) == (256, 144)

    enabled = EditState(
        asset_id="ai-restoration",
        detail={"enhancement_resolution": 720},
    )
    progress = []
    restored = processor.process(
        ImageBuffer.from_numpy(image), enabled, progress_callback=progress.append
    )
    assert (restored.width, restored.height) == (1280, 720)
    assert restored.has_alpha
    assert restored.data.shape[2] == 4
    assert progress[0] == 0
    assert progress[-1] == 100
    np.testing.assert_allclose(
        restored.data[..., 3],
        cv2.resize(alpha, (1280, 720), interpolation=cv2.INTER_LANCZOS4).clip(0, 1),
        atol=1e-6,
    )


def test_ai_restoration_requires_installed_model_and_valid_target(tmp_path):
    image = np.ones((144, 256, 3), dtype=np.float32) * 0.3
    with pytest.raises(FileNotFoundError, match="not installed"):
        ImageEnhancementEngine.restore(
            image, 720, model_path=tmp_path / "missing-model.onnx"
        )
    with pytest.raises(ValueError, match="target"):
        ImageEnhancementEngine.restore(image, 480)


def test_ai_inference_prefers_directml_when_available(monkeypatch, tmp_path):
    class FakeSession:
        pass

    model_path = tmp_path / "model.onnx"
    model_path.write_bytes(b"onnx")
    fake_session = FakeSession()
    session_options = SimpleNamespace()
    fake_runtime = SimpleNamespace(
        get_available_providers=lambda: ["DmlExecutionProvider", "CPUExecutionProvider"],
        SessionOptions=lambda: session_options,
        ExecutionMode=SimpleNamespace(ORT_SEQUENTIAL=1),
        InferenceSession=lambda *_args, **_kwargs: fake_session,
    )
    monkeypatch.setattr(enhancement_module, "_MODEL_SIZE", 4)
    monkeypatch.setattr(
        enhancement_module, "_MODEL_SHA256", ImageEnhancementEngine._file_sha256(model_path)
    )
    monkeypatch.setattr(enhancement_module, "_model_path", None)
    monkeypatch.setattr(enhancement_module, "_model_net", None)
    monkeypatch.setattr(enhancement_module, "_model_session", None)
    monkeypatch.setattr(enhancement_module, "_model_backend", None)
    monkeypatch.setattr(enhancement_module, "ort", fake_runtime)

    ImageEnhancementEngine._get_model(model_path)

    assert enhancement_module._model_session is fake_session
    assert enhancement_module._model_backend == "GPU: DirectML"
    assert session_options.execution_mode == fake_runtime.ExecutionMode.ORT_SEQUENTIAL
    assert session_options.enable_mem_pattern is False


def test_ai_inference_falls_back_to_cpu_on_cuda_error(monkeypatch, tmp_path):
    class FakeNet:
        def __init__(self):
            self.targets = []
            self.fail_on_gpu = True

        def setPreferableBackend(self, _backend):
            self.backend = _backend

        def setPreferableTarget(self, target):
            self.targets.append(target)

        def setInput(self, _blob):
            pass

        def forward(self):
            if self.fail_on_gpu:
                self.fail_on_gpu = False
                raise cv2.error("", "", "CUDA unavailable", "", 0)
            return np.ones((1, 3, 256, 256), dtype=np.float32)

    model_path = tmp_path / "model.onnx"
    model_path.write_bytes(b"onnx")
    fake_net = FakeNet()
    monkeypatch.setattr(enhancement_module, "_MODEL_SIZE", 4)
    monkeypatch.setattr(
        enhancement_module, "_MODEL_SHA256", ImageEnhancementEngine._file_sha256(model_path)
    )
    monkeypatch.setattr(enhancement_module, "_model_path", None)
    monkeypatch.setattr(enhancement_module, "_model_net", None)
    monkeypatch.setattr(enhancement_module, "_model_session", None)
    monkeypatch.setattr(enhancement_module, "_model_backend", None)
    monkeypatch.setattr(enhancement_module, "ort", None)
    monkeypatch.setattr(enhancement_module, "_ort_errors", ())
    monkeypatch.setattr(cv2.dnn, "readNetFromONNX", lambda _path: fake_net)
    monkeypatch.setattr(cv2.cuda, "getCudaEnabledDeviceCount", lambda: 1)

    prediction = ImageEnhancementEngine._predict_tile(
        np.zeros((64, 64, 3), dtype=np.float32), model_path
    )

    assert prediction.shape == (256, 256, 3)
    assert fake_net.targets == [cv2.dnn.DNN_TARGET_CUDA, cv2.dnn.DNN_TARGET_CPU]
    assert ImageEnhancementEngine.compute_device_label() == "CPU"


def test_detail_enhancement_preserves_identity_at_zero_amounts():
    image = np.random.default_rng(12).random((11, 13, 3), dtype=np.float32)

    result = ImageEnhancementEngine.apply_detail(image)

    np.testing.assert_array_equal(result, image)
    assert result is not image
    assert RENDER_PROCESS_VERSION >= 4


def test_evaluation_metrics_identical_image_have_perfect_ssim_and_unbounded_psnr():
    image = np.random.default_rng(42).random((16, 16, 3), dtype=np.float32)

    metrics = evaluation_module._metrics(image, image.copy())

    assert metrics["psnr_db"] is None
    assert metrics["ssim"] == pytest.approx(1.0, abs=1e-6)


def test_evaluation_runner_reports_restoration_against_lanczos(tmp_path, monkeypatch):
    source = np.zeros((16, 16, 3), dtype=np.uint8)
    source[:, 8:] = 255
    reference = cv2.resize(source, (64, 64), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(str(tmp_path / "input.png"), source)
    cv2.imwrite(str(tmp_path / "reference.png"), reference)
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(
        (
            '{"dataset_license":"test-only generated fixture",'
            '"dataset_provenance":"generated by the test",'
            '"items":[{"id":"edge-01","category":"text","input":"input.png",'
            '"reference":"reference.png","target_height":720}]}'
        ),
        encoding="utf-8",
    )
    restored = reference.astype(np.float32) / 255
    monkeypatch.setattr(
        evaluation_module.ImageEnhancementEngine,
        "restore",
        lambda *_args, **_kwargs: restored,
    )
    monkeypatch.setattr(
        evaluation_module.ImageEnhancementEngine,
        "compute_device_label",
        staticmethod(lambda: "CPU"),
    )

    report = evaluation_module.evaluate_manifest(manifest_path, tmp_path / "results")

    assert report["devices"] == ["CPU"]
    assert report["categories"]["text"]["count"] == 1
    item_metrics = report["items"][0]["metrics"]
    assert item_metrics["restored"]["ssim"] > item_metrics["lanczos_baseline"]["ssim"]
    assert item_metrics["delta_vs_lanczos"]["ssim"] > 0
    assert (tmp_path / "results" / "enhancement-evaluation.json").is_file()
    assert (tmp_path / "results" / "restored_001_input.png").is_file()


def test_model_fails_integrity_on_sha256_mismatch(monkeypatch, tmp_path):
    model_path = tmp_path / "corrupted_model.onnx"
    model_path.write_bytes(b"corrupted_bytes")
    monkeypatch.setattr(enhancement_module, "_MODEL_SIZE", len(b"corrupted_bytes"))
    monkeypatch.setattr(enhancement_module, "_MODEL_SHA256", "expected_different_sha256")
    monkeypatch.setattr(enhancement_module, "_model_path", None)

    with pytest.raises(ValueError, match="integrity check"):
        ImageEnhancementEngine._get_model(model_path)
