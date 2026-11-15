"""Local detail controls and AI-powered image restoration."""

import hashlib
import logging
import os
import threading
import urllib.request
from collections.abc import Callable
from pathlib import Path

import cv2
import numpy as np

from kurolight.config.app_config import AppConfig

try:
    import onnxruntime as ort
except ImportError:
    ort = None

_MODEL_URL = (
    "https://huggingface.co/imgdesignart/realesrgan-x4-onnx/resolve/"
    "138909edd364e7da67b5803c3918281e0428d19b/onnx/model.onnx?download=true"
)
_MODEL_SHA256 = "fa18ce70de3a55f3149d0cc898d335d2d69fca29edc0692cb362c856b2942c3f"
_MODEL_SIZE = 67_051_787
_TILE_SIZE = 64
_TILE_OVERLAP = 8
_model_lock = threading.Lock()
_inference_lock = threading.Lock()
_model_path: Path | None = None
_model_net: cv2.dnn_Net | None = None
_model_session = None
_model_backend = "CPU"
_model_backend_preference = (True, "auto")
_loaded_backend_preference: tuple[bool, str] | None = None
_ort_errors = (
    (
        ort.capi.onnxruntime_pybind11_state.Fail,
        ort.capi.onnxruntime_pybind11_state.RuntimeException,
        ort.capi.onnxruntime_pybind11_state.InvalidArgument,
        ort.capi.onnxruntime_pybind11_state.NotImplemented,
        ort.capi.onnxruntime_pybind11_state.EPFail,
    )
    if ort is not None
    else ()
)
logger = logging.getLogger(__name__)


class ProcessingCancelled(Exception):
    """Raised when a user cancels a long-running image operation."""


class ImageEnhancementEngine:
    """Apply conventional detail controls and locally run Real-ESRGAN restoration."""

    @classmethod
    def set_backend_preference(cls, enable_gpu: bool, gpu_engine: str) -> None:
        """Set the preferred backend for subsequent local AI restoration runs."""
        global _model_backend_preference, _model_path
        preference = (bool(enable_gpu), gpu_engine)
        if preference[1] not in {"auto", "directml", "cuda", "cpu"}:
            raise ValueError(f"Unsupported AI restoration backend: {gpu_engine}")
        with _model_lock:
            if preference != _model_backend_preference:
                _model_backend_preference = preference
                _model_path = None

    @staticmethod
    def _provider_order(enable_gpu: bool, gpu_engine: str) -> tuple[str, ...]:
        if not enable_gpu or gpu_engine == "cpu":
            return ()
        providers = {
            "auto": ("DmlExecutionProvider", "CUDAExecutionProvider"),
            "directml": ("DmlExecutionProvider",),
            "cuda": ("CUDAExecutionProvider",),
        }
        try:
            return providers[gpu_engine]
        except KeyError as exc:
            raise ValueError(f"Unsupported AI restoration backend: {gpu_engine}") from exc

    @staticmethod
    def apply_detail(
        image: np.ndarray,
        *,
        noise_reduction: float = 0.0,
        sharpening: float = 0.0,
        clarity: float = 0.0,
        texture: float = 0.0,
    ) -> np.ndarray:
        values = (noise_reduction, sharpening, clarity, texture)
        if not all(np.isfinite(value) for value in values):
            raise ValueError("Enhancement values must be finite")
        if not 0 <= noise_reduction <= 100 or not 0 <= sharpening <= 100:
            raise ValueError("Noise reduction and sharpening must be between 0 and 100")
        if not -100 <= clarity <= 100 or not -100 <= texture <= 100:
            raise ValueError("Clarity and texture must be between -100 and 100")
        if image.ndim != 3 or image.shape[2] not in (3, 4):
            raise ValueError("Detail enhancement requires an RGB or RGBA image")

        rgb = image[..., :3].astype(np.float32, copy=True)
        alpha = image[..., 3:4].copy() if image.shape[2] == 4 else None

        if noise_reduction > 0:
            strength = noise_reduction / 100.0
            rgb = cv2.bilateralFilter(
                rgb,
                d=5,
                sigmaColor=0.015 + 0.14 * strength,
                sigmaSpace=1.0 + 4.0 * strength,
                borderType=cv2.BORDER_REFLECT_101,
            )

        if sharpening > 0:
            luminance = (
                rgb[..., 0] * 0.2126
                + rgb[..., 1] * 0.7152
                + rgb[..., 2] * 0.0722
            )
            blurred = cv2.GaussianBlur(
                luminance, (0, 0), sigmaX=1.0, borderType=cv2.BORDER_REFLECT_101
            )
            detail = luminance - blurred
            threshold = 0.004 + (noise_reduction / 100.0) * 0.025
            detail = np.sign(detail) * np.maximum(np.abs(detail) - threshold, 0.0)
            rgb += detail[..., np.newaxis] * (sharpening / 100.0 * 1.75)

        if clarity != 0 or texture != 0:
            sigma = 3.0 if clarity != 0 else 1.0
            blurred = cv2.GaussianBlur(
                rgb, (0, 0), sigmaX=sigma, borderType=cv2.BORDER_REFLECT_101
            )
            amount = clarity / 100.0 * 1.5 + texture / 100.0 * 0.75
            rgb += (rgb - blurred) * amount

        result = np.clip(rgb, 0.0, 1.0)
        if alpha is not None:
            result = np.concatenate((result, alpha), axis=-1)
        return np.ascontiguousarray(result, dtype=np.float32)

    @staticmethod
    def model_path() -> Path:
        return AppConfig.get_data_dir() / "models" / "realesrgan-x4plus.onnx"

    @classmethod
    def has_model(cls) -> bool:
        path = cls.model_path()
        return path.is_file() and path.stat().st_size == _MODEL_SIZE

    @classmethod
    def download_model(
        cls,
        progress_callback: Callable[[int], None] | None = None,
        cancel_event: threading.Event | None = None,
    ) -> Path:
        path = cls.model_path()
        if cls.has_model() and cls._file_sha256(path) == _MODEL_SHA256:
            return path

        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = path.with_suffix(".onnx.download")
        try:
            request = urllib.request.Request(
                _MODEL_URL,
                headers={"User-Agent": "KuroLight image enhancement"},
            )
            with urllib.request.urlopen(request, timeout=60) as response:
                digest = hashlib.sha256()
                size = 0
                last_progress = -1
                if progress_callback:
                    progress_callback(0)
                with temporary_path.open("wb") as target:
                    while True:
                        cls._raise_if_cancelled(cancel_event)
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > _MODEL_SIZE:
                            raise ValueError("Downloaded enhancement model is larger than expected")
                        digest.update(chunk)
                        target.write(chunk)
                        if progress_callback:
                            progress = min(99, int(size * 100 / _MODEL_SIZE))
                            if progress != last_progress:
                                progress_callback(progress)
                                last_progress = progress
            if size != _MODEL_SIZE or digest.hexdigest() != _MODEL_SHA256:
                raise ValueError("Downloaded enhancement model failed its integrity check")
            cls._raise_if_cancelled(cancel_event)
            os.replace(temporary_path, path)
            if progress_callback:
                progress_callback(100)
        finally:
            temporary_path.unlink(missing_ok=True)
        return path

    @staticmethod
    def _file_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as model_file:
            for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @classmethod
    def _get_model(cls, path: Path) -> None:
        global _model_backend, _model_net, _model_path, _model_session
        global _loaded_backend_preference
        with _model_lock:
            if (
                _model_path == path
                and _loaded_backend_preference == _model_backend_preference
                and (_model_net is not None or _model_session is not None)
            ):
                return
            if not path.is_file() or path.stat().st_size != _MODEL_SIZE:
                raise FileNotFoundError(
                    "The local AI enhancement model is not installed. "
                    "Download it from the Detail panel first."
                )
            if cls._file_sha256(path) != _MODEL_SHA256:
                raise ValueError("The installed enhancement model failed its integrity check")

            _model_net = None
            _model_session = None
            _model_backend = "CPU"
            available_providers = []
            enable_gpu, gpu_engine = _model_backend_preference
            if ort is not None:
                available_providers = ort.get_available_providers()
                provider_labels = {
                    "DmlExecutionProvider": "GPU: DirectML",
                    "CUDAExecutionProvider": "GPU: CUDA",
                }
                for provider in cls._provider_order(enable_gpu, gpu_engine):
                    if provider not in available_providers:
                        continue
                    label = provider_labels[provider]
                    options = ort.SessionOptions()
                    if provider == "DmlExecutionProvider":
                        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                        options.enable_mem_pattern = False
                    try:
                        _model_session = ort.InferenceSession(
                            str(path),
                            sess_options=options,
                            providers=[provider, "CPUExecutionProvider"],
                        )
                        _model_backend = label
                        break
                    except (
                        ort.capi.onnxruntime_pybind11_state.Fail,
                        ort.capi.onnxruntime_pybind11_state.RuntimeException,
                        ort.capi.onnxruntime_pybind11_state.InvalidArgument,
                        ort.capi.onnxruntime_pybind11_state.NotImplemented,
                        ort.capi.onnxruntime_pybind11_state.EPFail,
                    ) as error:
                        logger.warning(
                            "%s could not load the AI model; trying another backend: %s",
                            provider,
                            error,
                        )

            if (
                _model_session is None
                and enable_gpu
                and gpu_engine in {"auto", "cuda"}
                and cv2.cuda.getCudaEnabledDeviceCount() > 0
            ):
                try:
                    model = cv2.dnn.readNetFromONNX(str(path))
                    model.setPreferableBackend(cv2.dnn.DNN_BACKEND_CUDA)
                    model.setPreferableTarget(cv2.dnn.DNN_TARGET_CUDA)
                    _model_net = model
                    _model_backend = "GPU: CUDA"
                except cv2.error:
                    logger.warning("OpenCV CUDA could not load the AI model", exc_info=True)

            if _model_session is None and _model_net is None:
                if ort is not None and "CPUExecutionProvider" in available_providers:
                    _model_session = ort.InferenceSession(
                        str(path), providers=["CPUExecutionProvider"]
                    )
                else:
                    model = cv2.dnn.readNetFromONNX(str(path))
                    model.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
                    model.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
                    _model_net = model
            _model_path = path
            _loaded_backend_preference = _model_backend_preference

    @classmethod
    def compute_device_label(cls) -> str:
        return _model_backend

    @classmethod
    def _fallback_to_cpu(cls, path: Path) -> None:
        global _model_backend, _model_net, _model_session
        if ort is not None and "CPUExecutionProvider" in ort.get_available_providers():
            _model_session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            _model_net = None
        else:
            _model_net = cv2.dnn.readNetFromONNX(str(path))
            _model_net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            _model_net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
            _model_session = None
        _model_backend = "CPU"

    @classmethod
    def _predict_tile(cls, tile: np.ndarray, model_path: Path) -> np.ndarray:
        cls._get_model(model_path)
        blob = np.ascontiguousarray(tile.transpose(2, 0, 1)[np.newaxis], dtype=np.float32)
        with _inference_lock:
            try:
                if _model_session is not None:
                    session = _model_session
                    input_name = session.get_inputs()[0].name
                    prediction = session.run(None, {input_name: blob})[0]
                else:
                    model = _model_net
                    model.setInput(blob)
                    prediction = model.forward()
            except cv2.error:
                if _model_backend != "GPU: CUDA":
                    raise
                logger.warning("CUDA inference failed; retrying AI restoration on CPU", exc_info=True)
                cls._fallback_to_cpu(model_path)
                if _model_session is not None:
                    input_name = _model_session.get_inputs()[0].name
                    prediction = _model_session.run(None, {input_name: blob})[0]
                else:
                    _model_net.setInput(blob)
                    prediction = _model_net.forward()
            except _ort_errors:
                if _model_backend not in ("GPU: DirectML", "GPU: CUDA"):
                    raise
                logger.warning(
                    "%s inference failed; retrying AI restoration on CPU",
                    _model_backend,
                    exc_info=True,
                )
                cls._fallback_to_cpu(model_path)
                if _model_session is not None:
                    input_name = _model_session.get_inputs()[0].name
                    prediction = _model_session.run(None, {input_name: blob})[0]
                else:
                    _model_net.setInput(blob)
                    prediction = _model_net.forward()
            prediction = prediction[0].transpose(1, 2, 0)
        return np.ascontiguousarray(np.clip(prediction, 0.0, 1.0), dtype=np.float32)

    @staticmethod
    def _raise_if_cancelled(cancel_event: threading.Event | None) -> None:
        if cancel_event is not None and cancel_event.is_set():
            raise ProcessingCancelled("Operation cancelled by user")

    @staticmethod
    def _tile_starts(length: int) -> list[int]:
        step = _TILE_SIZE - 2 * _TILE_OVERLAP
        if length <= _TILE_SIZE:
            return [0]
        starts = list(range(0, length - _TILE_SIZE + 1, step))
        final_start = length - _TILE_SIZE
        if starts[-1] != final_start:
            starts.append(final_start)
        return starts

    @classmethod
    def restore(
        cls,
        image: np.ndarray,
        target_height: int,
        *,
        model_path: Path | None = None,
        progress_callback: Callable[[int], None] | None = None,
        cancel_event: threading.Event | None = None,
    ) -> np.ndarray:
        cls._raise_if_cancelled(cancel_event)
        if target_height not in (720, 1080, 1440, 2160):
            raise ValueError("AI restoration target must be 720p, 1080p, 1440p, or 2160p")
        if image.ndim != 3 or image.shape[2] not in (3, 4):
            raise ValueError("AI restoration requires an RGB or RGBA image")
        if not np.isfinite(image).all():
            raise ValueError("AI restoration input must contain only finite pixel values")
        if image.size == 0:
            raise ValueError("AI restoration requires a non-empty image")

        height, width = image.shape[:2]
        target_scale = max(1.0, target_height / min(height, width))
        output_height = max(height, round(height * target_scale))
        output_width = max(width, round(width * target_scale))
        scale_x = output_width / width
        scale_y = output_height / height

        rgb = np.asarray(image[..., :3], dtype=np.float32)
        if not np.isfinite(rgb).all() or rgb.min() < 0.0 or rgb.max() > 1.0:
            raise ValueError("AI restoration input pixels must be normalized to [0, 1]")
        margin = _TILE_OVERLAP
        border_type = cv2.BORDER_REFLECT_101 if min(height, width) > 1 else cv2.BORDER_REPLICATE
        padded = cv2.copyMakeBorder(
            rgb,
            margin,
            margin,
            margin,
            margin,
            border_type,
        )
        padded_height, padded_width = padded.shape[:2]
        extra_bottom = max(0, _TILE_SIZE - padded_height)
        extra_right = max(0, _TILE_SIZE - padded_width)
        if extra_bottom or extra_right:
            padded = cv2.copyMakeBorder(
                padded, 0, extra_bottom, 0, extra_right, cv2.BORDER_REPLICATE
            )
            padded_height, padded_width = padded.shape[:2]

        output_padded_height = round(padded_height * scale_y)
        output_padded_width = round(padded_width * scale_x)
        accumulated = np.zeros(
            (output_padded_height, output_padded_width, 3), dtype=np.float32
        )
        weights = np.zeros((output_padded_height, output_padded_width, 1), dtype=np.float32)

        path = model_path or cls.model_path()
        tile_starts_y = cls._tile_starts(padded_height)
        tile_starts_x = cls._tile_starts(padded_width)
        total_tiles = len(tile_starts_y) * len(tile_starts_x)
        completed_tiles = 0
        last_progress = -1
        if progress_callback:
            progress_callback(0)
        for top in tile_starts_y:
            for left in tile_starts_x:
                cls._raise_if_cancelled(cancel_event)
                tile = padded[top : top + _TILE_SIZE, left : left + _TILE_SIZE]
                prediction = cls._predict_tile(tile, path)
                destination_width = max(1, round(tile.shape[1] * scale_x))
                destination_height = max(1, round(tile.shape[0] * scale_y))
                resized = cv2.resize(
                    prediction,
                    (destination_width, destination_height),
                    interpolation=cv2.INTER_LANCZOS4,
                )
                y0 = round(top * scale_y)
                x0 = round(left * scale_x)
                y1 = min(y0 + destination_height, output_padded_height)
                x1 = min(x0 + destination_width, output_padded_width)
                resized = resized[: y1 - y0, : x1 - x0]

                overlap_y = min(
                    round(2 * _TILE_OVERLAP * scale_y), resized.shape[0] // 2
                )
                overlap_x = min(
                    round(2 * _TILE_OVERLAP * scale_x), resized.shape[1] // 2
                )
                weight_y = np.ones(resized.shape[0], dtype=np.float32)
                weight_x = np.ones(resized.shape[1], dtype=np.float32)
                if top > 0 and overlap_y:
                    weight_y[:overlap_y] = np.linspace(0, 1, overlap_y, endpoint=False)
                if top + _TILE_SIZE < padded_height and overlap_y:
                    weight_y[-overlap_y:] = np.linspace(1, 0, overlap_y, endpoint=False)
                if left > 0 and overlap_x:
                    weight_x[:overlap_x] = np.linspace(0, 1, overlap_x, endpoint=False)
                if left + _TILE_SIZE < padded_width and overlap_x:
                    weight_x[-overlap_x:] = np.linspace(1, 0, overlap_x, endpoint=False)
                tile_weights = (weight_y[:, None] * weight_x[None, :])[..., None]
                accumulated[y0:y1, x0:x1] += resized * tile_weights
                weights[y0:y1, x0:x1] += tile_weights
                completed_tiles += 1
                if progress_callback:
                    progress = int(completed_tiles * 100 / total_tiles)
                    if progress != last_progress:
                        progress_callback(progress)
                        last_progress = progress
        cls._raise_if_cancelled(cancel_event)

        restored = accumulated / np.maximum(weights, np.finfo(np.float32).eps)
        start_y = round(margin * scale_y)
        start_x = round(margin * scale_x)
        restored = restored[
            start_y : start_y + output_height,
            start_x : start_x + output_width,
        ]
        if restored.shape[:2] != (output_height, output_width):
            raise RuntimeError("AI restoration produced unexpected output dimensions")

        if image.shape[2] == 4:
            alpha = cv2.resize(
                image[..., 3],
                (output_width, output_height),
                interpolation=cv2.INTER_LANCZOS4,
            )
            restored = np.concatenate((restored, alpha[..., None]), axis=-1)
        return np.ascontiguousarray(np.clip(restored, 0.0, 1.0), dtype=np.float32)
