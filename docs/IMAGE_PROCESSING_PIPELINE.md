# Image Processing Pipeline & Color Science

KuroLight uses a non-destructive, node-based Directed Acyclic Graph (DAG) image processing engine operating in **32-bit floating-point precision** (`np.float32`).

---

## 1. 32-Bit Float ImageBuffer

Defined in: [`src/kurolight/processing/buffer.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/processing/buffer.py)

Traditional 8-bit integer editing pipelines cause quantization artifacts, color banding, and blown-out highlights when pushing exposure or applying aggressive curves. KuroLight uses `ImageBuffer`:

* **Precision**: 32-bit float per channel (`float32`).
* **Dynamic Range**: Values are maintained linearly between `[0.0, 1.0]`, with headroom beyond `1.0` during intermediate exposure computations.
* **Channels**: Interleaved `RGB` or `RGBA`.
* **Zero Clipping**: Highlight recovery and shadow lift algorithms operate before any tonemapping or display compression occurs.

---

## 2. DAG Processing Graph Sequence

Defined in: [`src/kurolight/processing/pipeline.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/processing/pipeline.py) and [`src/kurolight/processing/graph.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/processing/graph.py)

```
[RAW / Raster Source]
         │
         ▼
[1. RAW / Raster Decode] ─── Normalized to 32-bit float sRGB
         │
         ▼
[2. Lens Correction] ────── Distortion polynomial, Chromatic aberration, Vignette
         │
         ▼
[3. White Balance] ──────── Correlated Color Temperature & Tint matrix
         │
         ▼
[4. Exposure & Tone] ────── EV stops, Contrast S-curve, Highlights/Shadows recovery
         │
         ▼
[5. Tone Curves] ────────── Parametric cubic spline interpolation (Master RGB & R/G/B)
         │
         ▼
[6. Color Grading] ──────── Lift / Gamma / Gain (3-Way Color Wheels)
         │
         ▼
[7. 3D LUT Interpolation] ── Trilinear tetrahedral interpolation in RGB space
         │
         ▼
[8. Retouch / Healing] ──── Texture-preserving clone/heal algorithms
         │
         ▼
[9. Detail & Clarity] ───── High-pass sharpening & localized contrast
         │
         ▼
[10. Geometry & Crop] ───── Rotation, Keystoning, Aspect ratio constraint
         │
         ▼
[Display Viewport / Render Output]
```

---

## 3. Node Specifications

### Node 1: RAW & Raster Decoder
* Supports `.dng`, `.cr2`, `.cr3`, `.nef`, `.arw`, `.orf`, `.rw2`, `.pef`, `.raf`, `.srw` via `rawpy` (LibRaw).
* Graceful fallback to Pillow raster extraction when `rawpy` is not installed.
* Converts embedded camera color profiles to sRGB space.

### Node 2: Lens Correction Engine
Defined in: [`src/kurolight/processing/lens_correction.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/processing/lens_correction.py)
* **Distortion**: Corrects barrel and pincushion optical distortion using a radial polynomial warp model:
  $$r' = r \cdot (1 + k_1 \cdot r^2)$$
* **Chromatic Aberration**: Compensates for lateral chromatic fringing by scaling red and blue color channels radially relative to the green channel.
* **Vignetting**: Corrects optical corner light falloff using radial cosine decay compensation.

### Node 3: Tone & Dynamic Range
* **Exposure**: Logarithmic EV compensation ($2^{\Delta EV}$).
* **Highlights / Shadows**: Dual-knee curve compression allowing recovery of specular highlights and deep shadow details without clipping midtones.

### Node 4: 3-Way Color Grading (Lift, Gamma, Gain)
* **Lift (Shadows)**: Offset adjustment targeting the darkest tones.
* **Gamma (Midtones)**: Power-law adjustment targeting exposure midpoint (18% gray).
* **Gain (Highlights)**: Slope multiplier targeting brightest tones.

### Node 5: 3D Look-Up Table (LUT) Engine
Defined in: [`src/kurolight/processing/color/lut.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/processing/color/lut.py)
* Supports `.cube` files (standard 17x17x17, 33x33x33, and 65x65x65 lattices).
* **Trilinear Interpolation**: Samples the nearest 8 lattice points per pixel, blending seamlessly with native NumPy vectorization.
* **Built-in LUTs**: Generates algorithmic cinematic LUTs on demand (Teal & Orange, Film Bleach Bypass, Vintage Warmth).

---

## 4. Cross-Device Color Management (ICC Profiles)

To guarantee that exported photos look identical across all screens (desktop monitors, mobile phones, WhatsApp, web browsers):

1. **Ingestion Normalization**: During asset decoding, input color spaces (e.g. Display P3, Adobe RGB) are detected and transformed to standard sRGB via `PIL.ImageCms.profileToProfile`.
2. **Export Embedding**: When saving JPEG, PNG, TIFF, or WebP files in `ExportService`, the canonical sRGB ICC profile bytes are embedded directly into the file metadata (`icc_profile=get_srgb_profile_bytes()`).
3. **Result**: Platforms such as WhatsApp and mobile operating systems automatically honor the embedded profile, preventing washed-out or oversaturated colors.
