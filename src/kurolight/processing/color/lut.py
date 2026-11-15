"""3D Look-Up Table (LUT) parser and trilinear interpolation engine."""

import base64
import binascii
from pathlib import Path
from typing import Dict, Tuple

import numpy as np


class LUT3DEngine:
    """3D Color Cube LUT parser, generator, and trilinear evaluation engine."""

    BUILTIN_LUT_NAMES = frozenset({
        "Teal & Orange",
        "Film Bleach Bypass",
        "Vintage Warmth",
    })
    _CACHE: Dict[str, np.ndarray] = {}

    @classmethod
    def create_builtin_lut(cls, name: str, size: int = 17) -> np.ndarray:
        """Generate mathematical cinematic 3D LUT tables dynamically."""
        if name in cls._CACHE:
            return cls._CACHE[name]

        # Construct base identity lattice
        r = np.linspace(0.0, 1.0, size, dtype=np.float32)
        g = np.linspace(0.0, 1.0, size, dtype=np.float32)
        b = np.linspace(0.0, 1.0, size, dtype=np.float32)
        grid_r, grid_g, grid_b = np.meshgrid(r, g, b, indexing="ij")
        cube = np.stack([grid_r, grid_g, grid_b], axis=-1)  # (size, size, size, 3)

        if name == "Teal & Orange":
            # Shadows towards cool cyan/teal, highlights towards warm amber
            lum = 0.2126 * cube[..., 0] + 0.7152 * cube[..., 1] + 0.0722 * cube[..., 2]
            lum_3d = np.expand_dims(lum, axis=-1)

            # Warm amber boost in highlights
            warm_hl = np.array([0.15, 0.08, -0.05], dtype=np.float32)
            cool_sh = np.array([-0.08, 0.04, 0.18], dtype=np.float32)

            sh_weight = (1.0 - lum_3d) ** 1.5
            hl_weight = lum_3d ** 1.5
            cube = cube + sh_weight * cool_sh + hl_weight * warm_hl

        elif name == "Film Bleach Bypass":
            # Desaturated high-contrast silvery look
            lum = 0.2126 * cube[..., 0] + 0.7152 * cube[..., 1] + 0.0722 * cube[..., 2]
            lum_3d = np.expand_dims(lum, axis=-1)
            # High-contrast S-curve
            s_curve = np.where(lum_3d < 0.5, 2.0 * (lum_3d ** 2), 1.0 - 2.0 * ((1.0 - lum_3d) ** 2))
            cube = 0.65 * s_curve + 0.35 * cube

        elif name == "Vintage Warmth":
            # Warm fade with lifted blacks and golden midtones
            cube[..., 0] = cube[..., 0] * 1.08 + 0.04  # Red lift
            cube[..., 1] = cube[..., 1] * 1.02 + 0.02  # Green
            cube[..., 2] = cube[..., 2] * 0.90 + 0.05  # Blue fade

        cube = np.clip(cube, 0.0, 1.0).astype(np.float32)
        cls._CACHE[name] = cube
        return cube

    @staticmethod
    def decode_custom_lut(size: int, data_base64: str) -> np.ndarray:
        """Decode and validate a packed float32 LUT received from the browser."""
        expected_bytes = size**3 * 3 * np.dtype("<f4").itemsize
        max_base64_length = ((expected_bytes + 2) // 3) * 4
        if not 2 <= size <= 64 or len(data_base64) != max_base64_length:
            raise ValueError("Invalid custom LUT dimensions or payload length")
        try:
            packed = base64.b64decode(data_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Custom LUT data is not valid base64") from exc
        if len(packed) != expected_bytes:
            raise ValueError("Custom LUT data length does not match its dimensions")
        cube = np.frombuffer(packed, dtype="<f4").reshape((size, size, size, 3)).copy()
        if not np.isfinite(cube).all():
            raise ValueError("Custom LUT data must contain only finite values")
        return cube

    @classmethod
    def parse_cube_file(cls, path: Path) -> Tuple[np.ndarray, int]:
        """Parse standard .cube 3D LUT ASCII specification file."""
        lines = Path(path).read_text(encoding="utf-8").splitlines()
        size = 33
        data_points = []

        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("LUT_3D_SIZE"):
                size = int(line.split()[1])
            elif line.startswith("DOMAIN_MIN") or line.startswith("DOMAIN_MAX"):
                parts = line.split()
                expected = 0.0 if parts[0] == "DOMAIN_MIN" else 1.0
                try:
                    domain = [float(value) for value in parts[1:]]
                except ValueError as exc:
                    raise ValueError(f"Invalid .cube directive: {line}") from exc
                if len(domain) != 3 or any(value != expected for value in domain):
                    raise ValueError(
                        "Custom .cube input domains are not supported"
                    )
            elif not line.startswith("TITLE"):
                parts = line.split()
                if len(parts) == 3:
                    try:
                        data_points.append([float(parts[0]), float(parts[1]), float(parts[2])])
                    except ValueError:
                        pass

        if len(data_points) != size * size * size:
            raise ValueError(f"Invalid .cube file: expected {size**3} entries, found {len(data_points)}")

        # .cube files list red as the fastest-changing coordinate.
        file_order = np.array(data_points, dtype=np.float32).reshape(
            (size, size, size, 3)
        )
        cube = np.transpose(file_order, (2, 1, 0, 3)).copy()
        return cube, size

    @classmethod
    def apply_lut(
        cls,
        img_rgb: np.ndarray,
        lut_data: np.ndarray,
        intensity: float = 1.0,
    ) -> np.ndarray:
        """
        Apply 3D Look-Up Table to float32 [0.0, 1.0] image with trilinear interpolation.
        """
        if intensity <= 0.0:
            return img_rgb

        size = lut_data.shape[0]
        scale = size - 1

        # Reshape for bulk coordinate sampling
        orig_shape = img_rgb.shape
        flat_rgb = img_rgb.reshape(-1, 3)

        coords = np.clip(flat_rgb * scale, 0.0, scale)
        x = coords[:, 0]
        y = coords[:, 1]
        z = coords[:, 2]

        x0 = np.floor(x).astype(np.int32)
        y0 = np.floor(y).astype(np.int32)
        z0 = np.floor(z).astype(np.int32)

        x1 = np.minimum(x0 + 1, scale)
        y1 = np.minimum(y0 + 1, scale)
        z1 = np.minimum(z0 + 1, scale)

        xd = (x - x0)[:, None]
        yd = (y - y0)[:, None]
        zd = (z - z0)[:, None]

        # 8 cube corners
        c000 = lut_data[x0, y0, z0]
        c100 = lut_data[x1, y0, z0]
        c010 = lut_data[x0, y1, z0]
        c110 = lut_data[x1, y1, z0]
        c001 = lut_data[x0, y0, z1]
        c101 = lut_data[x1, y0, z1]
        c011 = lut_data[x0, y1, z1]
        c111 = lut_data[x1, y1, z1]

        # Trilinear interpolation
        c00 = c000 * (1.0 - xd) + c100 * xd
        c01 = c001 * (1.0 - xd) + c101 * xd
        c10 = c010 * (1.0 - xd) + c110 * xd
        c11 = c011 * (1.0 - xd) + c111 * xd

        c0 = c00 * (1.0 - yd) + c10 * yd
        c1 = c01 * (1.0 - yd) + c11 * yd

        out_flat = c0 * (1.0 - zd) + c1 * zd
        out_rgb = out_flat.reshape(orig_shape)

        if intensity < 1.0:
            out_rgb = img_rgb * (1.0 - intensity) + out_rgb * intensity

        return np.clip(out_rgb, 0.0, 1.0).astype(np.float32)
