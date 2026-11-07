"""Export Service managing full-resolution rendering, encoding, and batch output."""

import os
import re
import tempfile
import time
from functools import lru_cache
from pathlib import Path
from typing import Callable, List, Literal, Optional

import cv2
import numpy as np
import io
from PIL import Image, ImageCms, ImageOps

@lru_cache(maxsize=1)
def get_srgb_profile_bytes() -> bytes:
    p = ImageCms.createProfile("sRGB")
    return ImageCms.ImageCmsProfile(p).tobytes()

from kurolight.config.defaults import get_app_icon_path, get_app_wordmark_path
from kurolight.domain.export import (
    ColorSpace,
    ExportFormat,
    ExportJob,
    ExportResult,
    ExportSettings,
    ResizeMode,
)
from kurolight.infrastructure.logging import get_logger
from kurolight.processing.buffer import ImageBuffer
from kurolight.processing.pipeline import DefaultImageProcessor
from kurolight.processing.raw.decoder import DefaultRawDecoder

logger = get_logger("services.export")


@lru_cache(maxsize=8)
def _load_watermark_image(
    watermark_type: Literal["app_icon", "wordmark"], width: int, height: int
) -> np.ndarray:
    if watermark_type == "app_icon":
        image_path = get_app_icon_path()
        if not image_path.is_file():
            raise FileNotFoundError(f"KuroLight watermark icon not found: {image_path}")
        with Image.open(image_path) as source:
            resized = source.convert("RGBA").resize(
                (width, height), Image.Resampling.LANCZOS
            )
        return np.asarray(resized, dtype=np.float32) / 255.0

    wordmark_path = get_app_wordmark_path()
    if not wordmark_path.is_file():
        raise FileNotFoundError(f"KuroLight watermark wordmark not found: {wordmark_path}")

    if wordmark_path.suffix.lower() == ".png":
        with Image.open(wordmark_path) as source:
            resized = source.convert("RGBA").resize(
                (width, height), Image.Resampling.LANCZOS
            )
        return np.asarray(resized, dtype=np.float32) / 255.0
    from PySide6.QtCore import Qt
    from PySide6.QtGui import QImage, QPainter
    from PySide6.QtSvg import QSvgRenderer

    render_width, render_height = 1060, 270
    image = QImage(render_width, render_height, QImage.Format.Format_RGBA8888)
    image.fill(Qt.GlobalColor.transparent)
    renderer = QSvgRenderer(str(wordmark_path))
    if not renderer.isValid():
        raise ValueError(f"Could not render KuroLight watermark wordmark: {wordmark_path}")
    painter = QPainter(image)
    renderer.render(painter)
    painter.end()
    pixels = image.constBits()
    rendered = np.frombuffer(
        pixels, dtype=np.uint8, count=render_width * render_height * 4
    ).reshape((render_height, render_width, 4))
    resized = Image.fromarray(rendered).resize((width, height), Image.Resampling.LANCZOS)
    return np.asarray(resized, dtype=np.float32) / 255.0


class ExportService:
    """Coordinates high-fidelity non-destructive export pipeline execution."""

    def __init__(self, processor: Optional[DefaultImageProcessor] = None):
        self.processor = processor or DefaultImageProcessor()
        self.raw_decoder = DefaultRawDecoder()

    def load_full_resolution_buffer(self, file_path: Path) -> ImageBuffer:
        """Decode full resolution image buffer from RAW or standard raster file."""
        file_path = Path(file_path)
        if not file_path.exists():
            raise FileNotFoundError(f"Source file not found: {file_path}")

        # Check for RAW
        if self.raw_decoder.can_decode(file_path):
            return self.raw_decoder.decode_raw(file_path)

        # Standard raster image (JPEG, PNG, TIFF, WebP, BMP, GIF, PNM)
        with Image.open(file_path) as pil_img:
            pil_img = ImageOps.exif_transpose(pil_img)
            icc = pil_img.info.get("icc_profile")
            if icc:
                try:
                    input_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
                    srgb_profile = ImageCms.createProfile("sRGB")
                    pil_img = ImageCms.profileToProfile(
                        pil_img, input_profile, srgb_profile, outputMode="RGB"
                    )
                except Exception:
                    pil_img = pil_img.convert("RGB")
            else:
                pil_img = pil_img.convert("RGB")
            arr = np.array(pil_img, dtype=np.uint8)

        return ImageBuffer.from_numpy(arr)

    def apply_resize(self, buffer: ImageBuffer, settings: ExportSettings) -> ImageBuffer:
        """Resize image buffer according to export configuration."""
        if settings.resize_mode == ResizeMode.ORIGINAL:
            return buffer

        h, w = buffer.height, buffer.width
        target_w, target_h = w, h

        if settings.resize_mode == ResizeMode.FIT:
            max_w = settings.max_width or w
            max_h = settings.max_height or h
            scale = min(max_w / w, max_h / h, 1.0)
            target_w = max(1, int(round(w * scale)))
            target_h = max(1, int(round(h * scale)))

        elif settings.resize_mode == ResizeMode.LONGEST_EDGE:
            longest = max(settings.max_width or 0, settings.max_height or 0)
            if longest > 0:
                scale = min(longest / max(w, h), 1.0)
                target_w = max(1, int(round(w * scale)))
                target_h = max(1, int(round(h * scale)))

        if target_w == w and target_h == h:
            return buffer

        # High-quality bicubic interpolation
        interpolation = (
            cv2.INTER_AREA if target_w < w or target_h < h else cv2.INTER_CUBIC
        )
        resized_data = cv2.resize(
            buffer.data, (target_w, target_h), interpolation=interpolation
        )
        return ImageBuffer(
            data=resized_data,
            width=target_w,
            height=target_h,
            channels=buffer.channels,
            dtype=buffer.dtype,
            color_space=buffer.color_space,
            has_alpha=buffer.has_alpha,
        )

    def apply_watermark(self, buffer: ImageBuffer, settings: ExportSettings) -> ImageBuffer:
        """Render the configured logo or text watermark onto the image buffer."""
        if settings.watermark_type in {"app_icon", "wordmark"}:
            return self._apply_image_watermark(buffer, settings)
        if not settings.watermark_text:
            return buffer

        arr = buffer.data.copy()
        rgb = arr[..., :3]
        alpha = arr[..., 3:4] if arr.shape[-1] == 4 else None
        h, w = arr.shape[:2]

        font_scale = max(0.1, min(w, h) / 1000.0 * 1.2)
        font = cv2.FONT_HERSHEY_SIMPLEX
        available_width = max(1, w - 14)
        reference_width, reference_height = cv2.getTextSize(
            settings.watermark_text, font, 1.0, 2
        )[0]
        if reference_width:
            font_scale = min(font_scale, available_width / reference_width)
        available_height = max(1, h - 8)
        if reference_height:
            font_scale = min(font_scale, available_height / reference_height)
        thickness = max(1, int(round(font_scale * 2.0)))

        text_size, _ = cv2.getTextSize(settings.watermark_text, font, font_scale, thickness)
        text_w, text_h = text_size
        while (text_w + 4 > w or text_h + 4 > h) and font_scale > 0.01:
            font_scale *= 0.9
            thickness = max(1, int(round(font_scale * 2.0)))
            text_size, _ = cv2.getTextSize(
                settings.watermark_text, font, font_scale, thickness
            )
            text_w, text_h = text_size

        margin_x = int(w * 0.03)
        margin_y = int(h * 0.03)

        pos = settings.watermark_position
        if pos == "bottom_left":
            origin_x = margin_x
            origin_y = h - margin_y
        elif pos == "center":
            origin_x = (w - text_w) // 2
            origin_y = (h + text_h) // 2
        elif pos == "top_right":
            origin_x = w - text_w - margin_x
            origin_y = text_h + margin_y
        else:  # "bottom_right" default
            origin_x = w - text_w - margin_x
            origin_y = h - margin_y

        origin_x = max(0, min(origin_x, max(0, w - text_w - 2)))
        origin_y = max(min(text_h, h - 2), min(origin_y, h - 2))

        # OpenCV putText requires uint8 arrays
        overlay_u8 = np.zeros((h, w, 3), dtype=np.uint8)
        alpha_u8 = np.zeros((h, w), dtype=np.uint8)

        # Subtle dark shadow for readability
        cv2.putText(overlay_u8, settings.watermark_text, (origin_x + 2, origin_y + 2), font, font_scale, (0, 0, 0), thickness, cv2.LINE_AA)
        cv2.putText(alpha_u8, settings.watermark_text, (origin_x + 2, origin_y + 2), font, font_scale, 128, thickness, cv2.LINE_AA)

        # Crisp white text
        cv2.putText(overlay_u8, settings.watermark_text, (origin_x, origin_y), font, font_scale, (255, 255, 255), thickness, cv2.LINE_AA)
        cv2.putText(alpha_u8, settings.watermark_text, (origin_x, origin_y), font, font_scale, 255, thickness, cv2.LINE_AA)

        overlay_f = overlay_u8.astype(np.float32) / 255.0
        alpha_f = (alpha_u8.astype(np.float32) / 255.0 * settings.watermark_opacity)[:, :, np.newaxis]

        watermarked = (1.0 - alpha_f) * rgb + alpha_f * overlay_f
        watermarked = np.clip(watermarked, 0.0, 1.0)
        if alpha is not None:
            watermarked = np.concatenate((watermarked, alpha), axis=-1)

        return ImageBuffer(
            data=watermarked,
            width=w,
            height=h,
            channels=buffer.channels,
            dtype=buffer.dtype,
            color_space=buffer.color_space,
            has_alpha=buffer.has_alpha,
        )

    def _apply_image_watermark(
        self, buffer: ImageBuffer, settings: ExportSettings
    ) -> ImageBuffer:
        """Composite a transparent KuroLight icon or wordmark into the image."""
        h, w = buffer.data.shape[:2]
        if settings.watermark_type == "wordmark":
            wordmark_path = get_app_wordmark_path()
            try:
                with Image.open(wordmark_path) as src:
                    vw, vh = src.size
                    aspect = vh / vw
            except Exception:
                aspect = 1469 / 1230
            watermark_width = max(1, min(round(min(w, h) * 0.18), 1200))
            watermark_height = max(1, round(watermark_width * aspect))
        else:
            watermark_width = max(1, min(round(min(w, h) * 0.14), 512))
            watermark_height = watermark_width

        watermark = _load_watermark_image(
            settings.watermark_type, watermark_width, watermark_height
        )
        watermark_rgb = watermark[..., :3]
        watermark_alpha = watermark[..., 3:4] * settings.watermark_opacity

        margin = round(min(w, h) * 0.03)
        if settings.watermark_position == "bottom_left":
            x, y = margin, h - watermark_height - margin
        elif settings.watermark_position == "top_right":
            x, y = w - watermark_width - margin, margin
        elif settings.watermark_position == "center":
            x, y = (w - watermark_width) // 2, (h - watermark_height) // 2
        else:
            x, y = w - watermark_width - margin, h - watermark_height - margin
        x = max(0, min(x, w - watermark_width))
        y = max(0, min(y, h - watermark_height))

        result = buffer.data.copy()
        region = result[y:y + watermark_height, x:x + watermark_width, :3]
        region[:] = region * (1.0 - watermark_alpha) + watermark_rgb * watermark_alpha

        return ImageBuffer(
            data=result,
            width=w,
            height=h,
            channels=buffer.channels,
            dtype=buffer.dtype,
            color_space=buffer.color_space,
            has_alpha=buffer.has_alpha,
        )

    def compute_target_path(
        self, asset_name: str, settings: ExportSettings, metadata: Optional[dict] = None
    ) -> Path:
        """Resolve final output filepath from directory, pattern, and format extension."""
        stem = Path(asset_name).stem
        metadata = metadata or {}
        values = {
            "name": stem,
            "date": metadata.get("date_captured") or "",
            "camera": metadata.get("camera_model") or metadata.get("camera_make") or "",
            "iso": metadata.get("iso") or "",
            "focal_length": metadata.get("focal_length_mm") or "",
        }
        filename = re.sub(
            r"\{([a-z_]+)\}",
            lambda match: str(values.get(match.group(1), "")),
            settings.filename_pattern,
        )
        filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", filename).strip(" .")
        if not filename:
            filename = stem or "image"
        ext = settings.format.value
        if ext == "jpeg":
            ext = "jpg"
        return settings.output_dir / f"{filename}.{ext}"

    def export_job(
        self,
        job: ExportJob,
        progress_cb: Optional[Callable[[float], None]] = None,
    ) -> ExportResult:
        """Execute a single export job end-to-end."""
        start_time = time.perf_counter()
        job.status = "processing"
        if progress_cb:
            progress_cb(0.1)

        try:
            if not job.settings.strip_metadata:
                raise ValueError(
                    "Preserving metadata in exported images is not supported; "
                    "exports currently strip metadata."
                )
            if job.settings.color_space != ColorSpace.SRGB:
                raise ValueError(
                    "Only sRGB export is currently supported; wide-gamut color conversion "
                    "and profile embedding are not available."
                )

            # 1. Resolve output path
            output_path = job.target_path or self.compute_target_path(job.asset_name, job.settings)
            if output_path.resolve() == job.source_path.resolve():
                raise ValueError("Export target must not overwrite the source image")
            if output_path.exists():
                raise FileExistsError(f"Export target already exists: {output_path}")
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # 2. Decode source full resolution
            if progress_cb:
                progress_cb(0.3)
            src_buffer = self.load_full_resolution_buffer(job.source_path)

            # 3. Execute non-destructive pipeline
            if progress_cb:
                progress_cb(0.6)
            rendered = self.processor.process(src_buffer, job.edit_state)

            # 4. Resize if configured
            if progress_cb:
                progress_cb(0.75)
            rendered = self.apply_resize(rendered, job.settings)

            # 5. Apply Watermark if configured
            if job.settings.watermark_enabled and (
                job.settings.watermark_type in {"app_icon", "wordmark"}
                or job.settings.watermark_text
            ):
                if progress_cb:
                    progress_cb(0.85)
                rendered = self.apply_watermark(rendered, job.settings)

            # 6. Encode and save file
            uint8_data = rendered.to_uint8()
            pil_img = Image.fromarray(uint8_data)

            fmt = job.settings.format
            output_path.parent.mkdir(parents=True, exist_ok=True)
            temporary_file = tempfile.NamedTemporaryFile(
                prefix=f".{output_path.name}.",
                suffix=".tmp",
                dir=output_path.parent,
                delete=False,
            )
            temporary_path = Path(temporary_file.name)
            temporary_file.close()
            srgb_icc = get_srgb_profile_bytes()
            try:
                if fmt == ExportFormat.JPEG:
                    pil_img.convert("RGB").save(
                        temporary_path,
                        format="JPEG",
                        quality=job.settings.quality,
                        subsampling=0,
                        icc_profile=srgb_icc,
                    )
                elif fmt == ExportFormat.PNG:
                    pil_img.save(temporary_path, format="PNG", optimize=True, icc_profile=srgb_icc)
                elif fmt == ExportFormat.TIFF:
                    pil_img.save(temporary_path, format="TIFF", icc_profile=srgb_icc)
                elif fmt == ExportFormat.WEBP:
                    pil_img.save(
                        temporary_path, format="WEBP", quality=job.settings.quality, icc_profile=srgb_icc
                    )
                elif fmt == ExportFormat.BMP:
                    pil_img.convert("RGB").save(temporary_path, format="BMP")
                elif fmt == ExportFormat.GIF:
                    pil_img.convert("RGB").save(temporary_path, format="GIF")
                elif fmt == ExportFormat.PPM:
                    pil_img.convert("RGB").save(temporary_path, format="PPM")
                else:
                    pil_img.save(temporary_path)
                try:
                    os.link(temporary_path, output_path)
                except FileExistsError as error:
                    raise FileExistsError(
                        f"Export target already exists: {output_path}"
                    ) from error
            finally:
                temporary_path.unlink(missing_ok=True)

            file_size = output_path.stat().st_size
            duration = time.perf_counter() - start_time
            job.status = "completed"
            job.progress = 1.0

            if progress_cb:
                progress_cb(1.0)

            logger.info("Successfully exported %s in %.2fs (%d bytes)", output_path.name, duration, file_size)
            return ExportResult(
                job_id=job.id,
                asset_id=job.asset_id,
                output_path=output_path,
                success=True,
                file_size_bytes=file_size,
                duration_seconds=duration,
            )

        except Exception as exc:
            duration = time.perf_counter() - start_time
            job.status = "failed"
            job.error_message = str(exc)
            logger.error("Export failed for %s: %s", job.asset_name, exc, exc_info=True)
            return ExportResult(
                job_id=job.id,
                asset_id=job.asset_id,
                output_path=job.target_path or (job.settings.output_dir / job.asset_name),
                success=False,
                error_message=str(exc),
                duration_seconds=duration,
            )

    def export_batch(
        self,
        jobs: List[ExportJob],
        job_progress_cb: Optional[Callable[[int, int, float, str], None]] = None,
        job_completed_cb: Optional[Callable[[ExportResult], None]] = None,
    ) -> List[ExportResult]:
        """Execute a batch sequence of export jobs synchronously with index tracking."""
        results = []
        total = len(jobs)
        for idx, job in enumerate(jobs, start=1):
            def on_progress(p: float):
                if job_progress_cb:
                    job_progress_cb(idx, total, p, job.asset_name)

            res = self.export_job(job, progress_cb=on_progress)
            results.append(res)
            if job_completed_cb:
                job_completed_cb(res)

        return results

    # Alias for compatibility
    execute_batch = export_batch
