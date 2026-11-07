"""Default implementation of non-destructive image processing pipeline."""

import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from kurolight.domain.editing import EditState
from kurolight.infrastructure.logging import get_logger
from kurolight.processing.buffer import ImageBuffer
from kurolight.processing.color.curves import ToneCurveEvaluator
from kurolight.processing.color.hsl import HSLEngine
from kurolight.processing.color.lut import LUT3DEngine
from kurolight.processing.enhancement import ImageEnhancementEngine
from kurolight.processing.graph import ProcessingGraph, ProcessingNode
from kurolight.processing.interfaces import ImageProcessor
from kurolight.processing.lens_correction import LensCorrectionEngine
from kurolight.processing.masking import MaskEngine
from kurolight.processing.retouch import RetouchEngine

logger = get_logger("processing.pipeline")

# Increment when a rendering algorithm changes in a way that should invalidate cached nodes.
RENDER_PROCESS_VERSION = 4


class DefaultImageProcessor(ImageProcessor):
    """Processes ImageBuffers according to non-destructive EditState instructions."""

    def __init__(self, graph: ProcessingGraph | None = None) -> None:
        self.graph = graph or ProcessingGraph()

    def decode(self, source_path: Path) -> ImageBuffer:
        """Decode raster or RAW image from disk into float32 ImageBuffer [0..1]."""
        p = Path(source_path).resolve()
        raw_exts = {".cr2", ".cr3", ".nef", ".arw", ".dng", ".orf", ".rw2", ".pef", ".raf", ".srw"}
        if p.suffix.lower() in raw_exts:
            try:
                from kurolight.processing.raw.decoder import DefaultRawDecoder
                decoder = DefaultRawDecoder()
                if decoder.can_decode(p):
                    return decoder.decode_raw(p)
            except Exception as e:
                logger.warning("RAW decoding failed for %s, falling back to raster: %s", p, e)

        # Standard raster loading with ICC profile color space normalization
        try:
            import io
            from PIL import Image, ImageCms, ImageOps

            with Image.open(p) as img:
                img = ImageOps.exif_transpose(img)
                icc = img.info.get("icc_profile")
                if icc:
                    try:
                        input_profile = ImageCms.ImageCmsProfile(io.BytesIO(icc))
                        srgb_profile = ImageCms.createProfile("sRGB")
                        img = ImageCms.profileToProfile(
                            img, input_profile, srgb_profile, outputMode="RGB"
                        )
                    except Exception:
                        img = img.convert("RGB")
                else:
                    img = img.convert("RGB")
                f_rgb = np.array(img, dtype=np.float32) / 255.0
                return ImageBuffer.from_numpy(f_rgb)
        except Exception:
            arr = cv2.imread(str(p), cv2.IMREAD_COLOR)
            if arr is not None:
                f_bgr = arr.astype(np.float32) / 255.0
                f_rgb = cv2.cvtColor(f_bgr, cv2.COLOR_BGR2RGB)
                return ImageBuffer.from_numpy(f_rgb)
            raise

    def create_preview(
        self, buffer: ImageBuffer, max_edge: int = 1920
    ) -> ImageBuffer:
        """Generate scaled proxy ImageBuffer preserving aspect ratio."""
        return self.create_preview_buffer(buffer, max_edge=max_edge)

    def create_preview_buffer(
        self, buffer: ImageBuffer, max_edge: int = 1920
    ) -> ImageBuffer:
        """Generate scaled proxy ImageBuffer preserving aspect ratio."""
        h, w = buffer.height, buffer.width
        if max(h, w) <= max_edge:
            return buffer.copy()

        if w >= h:
            new_w = max_edge
            new_h = int(round(h * (max_edge / w)))
        else:
            new_h = max_edge
            new_w = int(round(w * (max_edge / h)))

        # High quality downsampling
        resized_data = cv2.resize(
            buffer.data, (new_w, new_h), interpolation=cv2.INTER_AREA
        )

        return ImageBuffer(
            data=resized_data,
            width=new_w,
            height=new_h,
            channels=buffer.channels,
            dtype=buffer.dtype,
            color_space=buffer.color_space,
            has_alpha=buffer.has_alpha,
        )

    def process(
        self,
        buffer: ImageBuffer,
        edit_state: EditState,
        progress_callback: Callable[[int], None] | None = None,
        cancel_event: threading.Event | None = None,
    ) -> ImageBuffer:
        """Execute complete editing chain without mutating original buffer."""
        flow_nodes = (edit_state.custom_metadata or {}).get("flow_nodes", {})
        if not isinstance(flow_nodes, dict):
            flow_nodes = {}

        def node_enabled(node_id: str) -> bool:
            return flow_nodes.get(node_id, True) is not False

        flow_settings = edit_state.custom_metadata or {}
        background_removal = flow_settings.get("background_removal", {})
        nodes = []
        latest = "$source"

        def append_node(
            node_id: str, parameters: Any, processor: Any, enabled: bool = True,
            dependencies: tuple[str, ...] | None = None,
        ) -> None:
            nonlocal latest
            node_dependencies = dependencies or (latest,)
            nodes.append(ProcessingNode(
                node_id=node_id,
                dependencies=node_dependencies,
                parameters=parameters,
                processor=processor,
                enabled=enabled,
            ))
            latest = node_id

        if (
            node_enabled("background_removal")
            and isinstance(background_removal, dict)
            and background_removal.get("enabled")
        ):
            matte_id = "background_matte"
            matte_parameters = {
                "color": background_removal.get("color", "#00ff00"),
                "tolerance": background_removal.get("tolerance", 0.18),
                "feather": background_removal.get("feather", 0.08),
            }
            append_node(
                matte_id,
                matte_parameters,
                lambda inputs: self._apply_chroma_key(
                    inputs[0],
                    str(matte_parameters["color"]),
                    float(matte_parameters["tolerance"]),
                    float(matte_parameters["feather"]),
                )[..., 3],
                enabled=node_enabled("background_removal"),
                dependencies=("$source",),
            )
            matte_latest = matte_id
            latest = "$source"
        else:
            matte_latest = None

        append_node(
            "tone", edit_state.exposure.model_dump(mode="json"),
            lambda inputs: self._apply_exposure_and_tonality(inputs[0], edit_state.exposure),
            node_enabled("tone"),
        )
        append_node(
            "color", edit_state.white_balance.model_dump(mode="json"),
            lambda inputs: self._apply_white_balance_and_saturation(inputs[0], edit_state.white_balance),
            node_enabled("color"),
        )
        append_node(
            "hsl", edit_state.hsl.model_dump(mode="json") if edit_state.hsl else {},
            lambda inputs: HSLEngine.apply_hsl(inputs[0], edit_state.hsl),
            node_enabled("hsl") and bool(edit_state.hsl),
        )
        append_node(
            "curves", edit_state.tone_curves.model_dump(mode="json"),
            lambda inputs: ToneCurveEvaluator.apply_tone_curves(inputs[0], edit_state.tone_curves),
            node_enabled("curves"),
        )
        append_node(
            "grading", edit_state.color_grading.model_dump(mode="json"),
            lambda inputs: self._apply_color_grading(inputs[0], edit_state.color_grading),
            node_enabled("grading"),
        )
        active_masks = [mask for mask in edit_state.masks if mask.enabled]
        append_node(
            "local_adjustments",
            [mask.model_dump(mode="json") for mask in active_masks],
            lambda inputs: MaskEngine.apply_masks(inputs[0], active_masks),
            node_enabled("masks") and bool(active_masks),
        )
        active_spots = [spot for spot in edit_state.retouch_spots if spot.enabled]
        append_node(
            "retouch",
            [spot.model_dump(mode="json") for spot in active_spots],
            lambda inputs: RetouchEngine.apply_retouch(inputs[0], active_spots).data,
            node_enabled("retouch") and bool(active_spots),
        )
        append_node(
            "detail", edit_state.detail.model_dump(mode="json"),
            lambda inputs: self._apply_detail(inputs[0], edit_state.detail),
            node_enabled("detail"),
        )
        append_node(
            "dehaze", {"amount": edit_state.detail.dehaze},
            lambda inputs: self._apply_dehaze(inputs[0], edit_state.detail.dehaze),
            node_enabled("dehaze"),
        )
        vignette = flow_settings.get("vignette", {})
        has_vignette = isinstance(vignette, dict) and vignette.get("enabled")
        append_node(
            "vignette", vignette if has_vignette else {},
            lambda inputs: self._apply_vignette(
                inputs[0],
                float(vignette.get("amount", 0.0)),
                float(vignette.get("midpoint", 0.5)),
                float(vignette.get("feather", 0.5)),
            ),
            node_enabled("vignette") and bool(has_vignette),
        )
        lens_correction = edit_state.lens_correction
        append_node(
            "lens_correction",
            lens_correction.model_dump(mode="json"),
            lambda inputs: LensCorrectionEngine.apply(
                inputs[0],
                distortion=lens_correction.distortion,
                chromatic_aberration=lens_correction.chromatic_aberration,
                vignette=lens_correction.vignette,
            ),
            node_enabled("lens_correction")
            and any(
                value != 0
                for value in (
                    lens_correction.distortion,
                    lens_correction.chromatic_aberration,
                    lens_correction.vignette,
                )
            ),
        )
        append_node(
            "geometry", edit_state.geometry.model_dump(mode="json"),
            lambda inputs: self._apply_geometry(inputs[0], edit_state.geometry),
            node_enabled("geometry"),
        )
        if matte_latest:
            image_latest = latest
            append_node(
                "background_matte_geometry", edit_state.geometry.model_dump(mode="json"),
                lambda inputs: self._apply_geometry(inputs[0], edit_state.geometry),
                node_enabled("geometry"),
                dependencies=(matte_latest,),
            )
            append_node(
                "alpha_composite", {"has_source_alpha": buffer.has_alpha},
                lambda inputs: np.concatenate(
                    (inputs[0][..., :3], inputs[1][..., np.newaxis]), axis=-1
                ),
                dependencies=(image_latest, "background_matte_geometry"),
            )
        append_node(
            "resolution_enhancement",
            {"target_height": edit_state.detail.enhancement_resolution},
            lambda inputs: ImageEnhancementEngine.restore(
                inputs[0],
                edit_state.detail.enhancement_resolution,
                progress_callback=progress_callback,
                cancel_event=cancel_event,
            ),
            node_enabled("resolution_enhancement")
            and node_enabled("detail")
            and edit_state.detail.enhancement_resolution != 0,
        )
        img = self.graph.run(
            buffer.data, nodes, process_version=RENDER_PROCESS_VERSION
        )

        h, w, c = img.shape
        return ImageBuffer(
            data=img,
            width=w,
            height=h,
            channels=c,
            dtype=np.dtype(np.float32),
            color_space=buffer.color_space,
            has_alpha=buffer.has_alpha or c == 4,
        )

    def _apply_exposure_and_tonality(self, img: np.ndarray, exp) -> np.ndarray:
        if exp.exposure != 0.0:
            multiplier = float(2.0 ** exp.exposure)
            img = img * multiplier

        if exp.brightness != 0.0:
            img = img + (exp.brightness / 100.0) * 0.5

        if exp.contrast != 0.0:
            factor = float((exp.contrast + 100.0) / 100.0)
            img = (img - 0.5) * factor + 0.5

        if exp.highlights != 0.0 or exp.shadows != 0.0:
            lum = 0.2126 * img[..., 0] + 0.7152 * img[..., 1] + 0.0722 * img[..., 2]
            lum = np.clip(lum, 0.0, 1.0)
            if exp.highlights != 0.0:
                high_mask = np.clip((lum - 0.5) * 2.0, 0.0, 1.0)
                high_delta = (exp.highlights / 100.0) * 0.4
                img = img + (high_delta * np.expand_dims(high_mask, axis=-1))
            if exp.shadows != 0.0:
                shadow_mask = np.clip((0.5 - lum) * 2.0, 0.0, 1.0)
                shadow_delta = (exp.shadows / 100.0) * 0.4
                img = img + (shadow_delta * np.expand_dims(shadow_mask, axis=-1))

        if exp.whites != 0.0:
            img = img + (exp.whites / 100.0) * 0.2
        if exp.blacks != 0.0:
            img = img + (exp.blacks / 100.0) * 0.2

        return np.clip(img, 0.0, 1.0)

    def _apply_white_balance_and_saturation(self, img: np.ndarray, wb) -> np.ndarray:
        if wb.temperature != 0.0:
            temp_shift = (wb.temperature / 100.0) * 0.15
            img[..., 0] += temp_shift   # Red up
            img[..., 2] -= temp_shift   # Blue down

        if wb.tint != 0.0:
            tint_shift = (wb.tint / 100.0) * 0.10
            img[..., 1] -= tint_shift   # Green down
            img[..., 0] += tint_shift * 0.5
            img[..., 2] += tint_shift * 0.5

        img = np.clip(img, 0.0, 1.0)

        if wb.saturation != 0.0 or wb.vibrance != 0.0:
            hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
            if wb.saturation != 0.0:
                sat_factor = max(0.0, 1.0 + (wb.saturation / 100.0))
                hsv[..., 1] = np.clip(hsv[..., 1] * sat_factor, 0.0, 1.0)

            if wb.vibrance != 0.0:
                vibrance_factor = wb.vibrance / 100.0
                sat_mask = 1.0 - hsv[..., 1]
                hsv[..., 1] = np.clip(
                    hsv[..., 1] + (hsv[..., 1] * sat_mask * vibrance_factor),
                    0.0,
                    1.0,
                )
            img = cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)

        return np.clip(img, 0.0, 1.0)

    def _apply_color_grading(self, img: np.ndarray, cg) -> np.ndarray:
        has_wheel_changes = not (
            cg.lift.luminance == 0.0
            and cg.gamma.luminance == 0.0
            and cg.gain.luminance == 0.0
            and cg.offset.luminance == 0.0
            and cg.lift.saturation == 0.0
            and cg.gamma.saturation == 0.0
            and cg.gain.saturation == 0.0
            and cg.offset.saturation == 0.0
        )

        if has_wheel_changes:
            lum = 0.2126 * img[..., 0] + 0.7152 * img[..., 1] + 0.0722 * img[..., 2]
            lum = np.clip(lum, 0.0, 1.0)

            shadow_weight = np.clip((1.0 - lum) ** 2, 0.0, 1.0)
            highlight_weight = np.clip(lum ** 2, 0.0, 1.0)
            mid_weight = np.clip(1.0 - shadow_weight - highlight_weight, 0.0, 1.0)

            # Luma adjustments
            delta_luma = (
                shadow_weight * cg.lift.luminance * 0.3
                + mid_weight * cg.gamma.luminance * 0.3
                + highlight_weight * cg.gain.luminance * 0.3
                + cg.offset.luminance * 0.2
            )
            img = img + np.expand_dims(delta_luma, axis=-1)

            # Vector chromatic shifts
            def hue_to_rgb_vector(hue_deg: float, sat: float) -> np.ndarray:
                if sat <= 0.0:
                    return np.zeros(3, dtype=np.float32)
                angle_rad = np.deg2rad(hue_deg)
                u = sat * np.cos(angle_rad) * 0.25
                v = sat * np.sin(angle_rad) * 0.25
                r = 1.0 * u
                g = -0.5 * u - 0.866 * v
                b = -0.5 * u + 0.866 * v
                return np.array([r, g, b], dtype=np.float32)

            lift_vec = hue_to_rgb_vector(cg.lift.hue, cg.lift.saturation)
            gamma_vec = hue_to_rgb_vector(cg.gamma.hue, cg.gamma.saturation)
            gain_vec = hue_to_rgb_vector(cg.gain.hue, cg.gain.saturation)

            chroma_delta = (
                np.expand_dims(shadow_weight, axis=-1) * lift_vec
                + np.expand_dims(mid_weight, axis=-1) * gamma_vec
                + np.expand_dims(highlight_weight, axis=-1) * gain_vec
            )
            img = img + chroma_delta
            img = np.clip(img, 0.0, 1.0)

        # Apply 3D Look-Up Table if specified
        if hasattr(cg, "lut_name") and cg.lut_name:
            lut_cube = LUT3DEngine.create_builtin_lut(cg.lut_name)
            img = LUT3DEngine.apply_lut(img, lut_cube, intensity=getattr(cg, "lut_intensity", 1.0))

        return np.clip(img, 0.0, 1.0)

    def _apply_detail(self, img: np.ndarray, detail) -> np.ndarray:
        return ImageEnhancementEngine.apply_detail(
            img,
            noise_reduction=detail.noise_reduction,
            sharpening=detail.sharpening,
            clarity=detail.clarity,
            texture=detail.texture,
        )

    def _apply_dehaze(self, img: np.ndarray, amount: float) -> np.ndarray:
        if amount == 0.0:
            return img

        rgb = img[..., :3]
        alpha = img[..., 3:4] if img.shape[-1] == 4 else None
        strength = float(np.clip(amount / 100.0, -1.0, 1.0))
        if strength > 0:
            luminance = np.max(rgb, axis=2)
            dark_channel = cv2.erode(luminance, np.ones((15, 15), np.uint8))
            transmission = np.clip(1.0 - strength * (1.0 - dark_channel), 0.35, 1.0)
            rgb = (rgb - (1.0 - transmission[..., None]) * 0.85) / transmission[..., None]
        else:
            blurred = cv2.GaussianBlur(rgb, (0, 0), 5.0)
            rgb = rgb * (1.0 + strength * 0.25) - blurred * strength * 0.25

        result = np.clip(rgb, 0.0, 1.0)
        return np.concatenate((result, alpha), axis=-1) if alpha is not None else result

    def _apply_vignette(
        self, img: np.ndarray, amount: float, midpoint: float, feather: float
    ) -> np.ndarray:
        if amount == 0.0:
            return img

        h, w = img.shape[:2]
        yy, xx = np.ogrid[-1.0:1.0:complex(h), -1.0:1.0:complex(w)]
        distance = np.sqrt(xx * xx + yy * yy) / np.sqrt(2.0)
        midpoint = float(np.clip(midpoint, 0.0, 1.0))
        feather = max(float(np.clip(feather, 0.01, 1.0)), 1e-3)
        falloff = np.clip((distance - midpoint) / feather, 0.0, 1.0)
        falloff = falloff * falloff * (3.0 - 2.0 * falloff)
        factor = 1.0 - (amount / 100.0) * falloff
        result = img.copy()
        result[..., :3] *= factor[..., None]
        return np.clip(result, 0.0, 1.0)

    def _apply_chroma_key(
        self, img: np.ndarray, color: str, tolerance: float, feather: float
    ) -> np.ndarray:
        if len(color) != 7 or not color.startswith("#"):
            raise ValueError(f"Invalid chroma-key color: {color}")
        try:
            key_rgb = np.array(
                [int(color[i : i + 2], 16) for i in (1, 3, 5)], dtype=np.float32
            ) / 255.0
        except ValueError as exc:
            raise ValueError(f"Invalid chroma-key color: {color}") from exc

        rgb = np.clip(img[..., :3], 0.0, 1.0)
        distance = np.sqrt(np.mean((rgb - key_rgb) ** 2, axis=2))
        tolerance = float(np.clip(tolerance, 0.0, 1.0))
        feather = max(float(np.clip(feather, 0.0, 0.5)), 1e-6)
        alpha = np.clip((distance - tolerance) / feather, 0.0, 1.0)
        alpha = alpha * alpha * (3.0 - 2.0 * alpha)

        rgba = np.empty((*rgb.shape[:2], 4), dtype=np.float32)
        rgba[..., :3] = rgb
        rgba[..., 3] = alpha
        if img.shape[-1] == 4:
            rgba[..., 3] *= img[..., 3]
        return rgba

    def _apply_geometry(self, img: np.ndarray, geom) -> np.ndarray:
        if geom.horizontal_flip:
            img = np.fliplr(img)
        if geom.vertical_flip:
            img = np.flipud(img)

        angle = geom.rotation + geom.straighten
        if angle != 0.0:
            h, w = img.shape[:2]
            center = ((w - 1) / 2.0, (h - 1) / 2.0)
            mat = cv2.getRotationMatrix2D(center, angle, 1.0)
            cosine = abs(mat[0, 0])
            sine = abs(mat[0, 1])
            rotated_w = max(1, int(np.ceil(h * sine + w * cosine - 1e-9)))
            rotated_h = max(1, int(np.ceil(h * cosine + w * sine - 1e-9)))
            mat[0, 2] += (rotated_w - w) / 2.0
            mat[1, 2] += (rotated_h - h) / 2.0
            img = cv2.warpAffine(
                img,
                mat,
                (rotated_w, rotated_h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_CONSTANT,
                borderValue=0,
            )

        if geom.crop_x > 0.0 or geom.crop_y > 0.0 or geom.crop_width < 1.0 or geom.crop_height < 1.0:
            h, w = img.shape[:2]
            x1 = max(0, min(int(round(geom.crop_x * w)), w - 1))
            y1 = max(0, min(int(round(geom.crop_y * h)), h - 1))
            x2 = max(x1 + 1, min(int(round((geom.crop_x + geom.crop_width) * w)), w))
            y2 = max(y1 + 1, min(int(round((geom.crop_y + geom.crop_height) * h)), h))

            img = img[y1:y2, x1:x2]

        return np.ascontiguousarray(img)
