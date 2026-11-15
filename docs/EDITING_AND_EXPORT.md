# Editing and export

## Non-destructive edit state

`EditState` is the structured description of changes for one asset. It includes
exposure, white balance, geometry, lens adjustments, detail, HSL, color grading,
tone curves, local masks, retouch spots, snapshots, and custom metadata.
Persisted edit state is associated with a catalog asset; browser IndexedDB is
also used for local caching. Undo/redo is managed by the editing interface and
is not a substitute for saving a project.

The original source is decoded for rendering and is not modified in place.

## Preview and final render

- The browser's WebGL renderer provides interactive feedback while editing.
- Python's `DefaultImageProcessor` builds and evaluates a processing graph for
  previews and full-resolution export.
- The export service decodes the original at full resolution, applies the
  saved edit state, optionally resizes and watermarks, and encodes a new file.
- Preview quality and size settings affect the interactive preview path; they
  do not change the source photo.

The browser and Python engines are maintained to interpret the same edit
state, but they use different implementations. Small differences in color
math, interpolation, or image-library behavior can occur. Verify the exported
file before delivery.

## Editing tools

- **Tone and color:** exposure, brightness, contrast, highlights, shadows,
  whites, blacks, temperature, tint, saturation, vibrance, HSL, curves, and
  lift/gamma/gain/offset color grading.
- **LUTs:** built-in looks and imported `.cube` LUTs. Custom LUT data is kept in
  browser storage and transferred to Python for export when needed. The
  current transfer path accepts finite 3D LUT data with supported input domain
  values.
- **Geometry and optics:** crop, rotate, straighten, flip, manual distortion,
  chromatic-aberration, and vignette adjustments.
- **Detail:** sharpening, noise reduction, clarity, texture, and dehaze.
- **Local adjustments:** brush, linear/radial gradient, sampled luminance and
  sampled color masks, with the combination modes offered in the UI.
- **Retouching:** non-destructive healing/cloning spots.
- **Visual Flow:** bypass supported stages; arbitrary graph editing is not
  available.

The Python processing graph's implementation and render-version invalidation
are in `src/kurolight/processing/pipeline.py` and
`src/kurolight/processing/graph.py`.

## Export behavior

Supported containers are JPEG, PNG, TIFF, WebP, BMP, GIF, and PPM. Quality
applies to formats that support the quality setting. Export can resize images
and can apply text, app-icon, or wordmark watermarks.

Current constraints:

- Output color space is sRGB. A request for another color space fails.
- JPEG, PNG, TIFF, and WebP export with an embedded sRGB ICC profile.
- BMP, GIF, and PPM do not receive that ICC profile through the current
  encoder path.
- Metadata preservation is not available; export requires metadata stripping.
- Existing output files are not overwritten. Source and target paths must not
  resolve to the same file.
- Custom `.cube` LUTs are transmitted with the export request when used by an
  asset.
- Export jobs report progress, support cancellation, and write through a
  temporary file before publishing the output.

Filename patterns support `{name}`, `{date}`, `{camera}`, `{iso}`, and
`{focal_length}`. Unknown tokens are replaced with an empty value and unsafe
filename characters are sanitized.
