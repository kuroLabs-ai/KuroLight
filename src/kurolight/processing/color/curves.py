"""Monotonic tone curve interpolation and LUT generation."""

from typing import List
import numpy as np

from kurolight.domain.editing import CurvePoint, ToneCurvesSettings


class ToneCurveEvaluator:
    """Evaluates arbitrary curve control points into 256-value Look-Up Tables."""

    @staticmethod
    def points_to_lut(points: List[CurvePoint]) -> np.ndarray:
        """Convert sorted list of CurvePoints to a 256-element float32 LUT in [0.0, 1.0]."""
        if not points:
            return np.linspace(0.0, 1.0, 256, dtype=np.float32)

        # Ensure endpoints exist and sort by x
        pts = sorted(points, key=lambda p: p.x)
        if pts[0].x > 0.0:
            pts.insert(0, CurvePoint(x=0.0, y=0.0))
        if pts[-1].x < 1.0:
            pts.append(CurvePoint(x=1.0, y=1.0))

        xs = np.array([p.x for p in pts], dtype=np.float32)
        ys = np.array([p.y for p in pts], dtype=np.float32)

        x_eval = np.linspace(0.0, 1.0, 256, dtype=np.float32)

        # Monotonic linear/spline interpolation clamped to [0.0, 1.0]
        y_eval = np.interp(x_eval, xs, ys)
        return np.clip(y_eval, 0.0, 1.0).astype(np.float32)

    @classmethod
    def apply_tone_curves(cls, img: np.ndarray, curves: ToneCurvesSettings) -> np.ndarray:
        """Apply RGB Master and per-channel Tone Curves using fast LUT interpolation."""
        # 1. Master RGB Curve
        if len(curves.rgb_points) > 2 or any(p.x != p.y for p in curves.rgb_points):
            master_lut = cls.points_to_lut(curves.rgb_points)
            img[..., 0] = np.interp(img[..., 0], np.linspace(0.0, 1.0, 256), master_lut)
            img[..., 1] = np.interp(img[..., 1], np.linspace(0.0, 1.0, 256), master_lut)
            img[..., 2] = np.interp(img[..., 2], np.linspace(0.0, 1.0, 256), master_lut)

        # 2. Red Channel
        if len(curves.red_points) > 2 or any(p.x != p.y for p in curves.red_points):
            r_lut = cls.points_to_lut(curves.red_points)
            img[..., 0] = np.interp(img[..., 0], np.linspace(0.0, 1.0, 256), r_lut)

        # 3. Green Channel
        if len(curves.green_points) > 2 or any(p.x != p.y for p in curves.green_points):
            g_lut = cls.points_to_lut(curves.green_points)
            img[..., 1] = np.interp(img[..., 1], np.linspace(0.0, 1.0, 256), g_lut)

        # 4. Blue Channel
        if len(curves.blue_points) > 2 or any(p.x != p.y for p in curves.blue_points):
            b_lut = cls.points_to_lut(curves.blue_points)
            img[..., 2] = np.interp(img[..., 2], np.linspace(0.0, 1.0, 256), b_lut)

        return np.clip(img, 0.0, 1.0)
