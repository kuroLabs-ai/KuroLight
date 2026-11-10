# Export behavior audit

The export path was traced through Deliver settings, `PyBridge.export_assets`,
`ExportSettings`, resize/render processing, and Pillow encoders. Current verified behavior:

| Format | Encoder | Quality setting | Color Management & Notes |
|---|---|---|---|
| JPEG | Pillow JPEG | Used; UI exposes quality | Encoded as RGB, 4:4:4 (`subsampling=0`); embeds canonical sRGB ICC profile |
| PNG | Pillow PNG | Not used | `optimize=True`; output is RGB; embeds canonical sRGB ICC profile |
| TIFF | Pillow TIFF | Not used | Output is RGB; embeds canonical sRGB ICC profile |
| WebP | Pillow WebP | Used; UI exposes quality | Output is RGB; embeds canonical sRGB ICC profile |
| BMP | Pillow BMP | Not used | Encoded as RGB |
| GIF | Pillow GIF | Not used | RGB is quantized to GIF's indexed-color palette |
| PPM | Pillow PPM | Not used | Encoded as RGB |

## Color Space & ICC Profile Management

KuroLight enforces canonical **sRGB color space standardization** on all photo exports:
* **Embedded ICC Profile**: Exports in JPEG, PNG, TIFF, and WebP embed the canonical sRGB ICC profile via `get_srgb_profile_bytes()` using `PIL.ImageCms`.
* **Cross-Device Fidelity**: Mobile screens, WhatsApp, web browsers, and desktop color-managed photo viewers accurately map the embedded profile, preventing color shifts, washed-out highlights, or oversaturated skin tones.
* Source EXIF/XMP/IPTC metadata is stripped per default privacy policy; original source files and adjacent sidecars remain untouched. See [METADATA_POLICY.md](METADATA_POLICY.md).

## Sizing & Resizing Policies

Resize modes preserve aspect ratio and never upscale:

- `original`: retain rendered dimensions.
- `fit`: fit within optional maximum width and height; a missing bound uses that source dimension.
- `longest_edge`: constrain the longest edge using the larger configured bound.
- Downscaling uses area interpolation if either dimension shrinks; other resizing uses cubic.
- Non-positive explicit width/height bounds are rejected by settings validation.

The UI maps width, height, shortest-edge, and longest-edge choices to those modes. Percentage sizing
uses imported, EXIF-oriented source dimensions and is capped at 100%, so it cannot upscale. EXIF
orientation is applied by the raster preview/export decoders and exposed dimensions are display
oriented. JPEG's quality slider affects JPEG and WebP only.

## Filename Templates & File Safety

Filename templates recognize `{name}`, `{date}`, `{camera}`, `{iso}`, and `{focal_length}`.
Unsupported tokens expand to empty text; characters illegal in filenames are replaced with `_`,
and the extension is selected from the chosen format. Export refuses a destination that already
exists and refuses a target resolving to the source file. Encoded output is staged in a temporary
file in the destination directory and published without replacing an existing file. Batch
cancellation is checked between assets; an in-progress asset is allowed to finish, and a failed
asset does not prevent later assets from running. Source images and adjacent sidecars remain
unchanged.

## Automated Verification

Automated coverage in `tests/test_export_watermark.py` verifies:
* All seven format encoders produce the requested dimensions.
* Source metadata is omitted without changing source bytes.
* EXIF orientation is applied consistently.
* Canonical sRGB ICC profiles are embedded in exported files (`test_export_embeds_srgb_icc_profile`).
* Resize modes preserve aspect/no-upscale behavior, template sanitization, and extensions.
* Invalid profile/resize settings fail gracefully without creating orphan output files.
* Batch cancellation between images, per-file failures, and continuation after error.
* Watermarks cover text, icon, and wordmark placement in all four positions across landscape, portrait, and square images.
