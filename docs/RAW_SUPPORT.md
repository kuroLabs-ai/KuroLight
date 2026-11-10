# RAW and codec support inventory

KuroLight routes files with these RAW suffixes to `DefaultRawDecoder`:

| Suffixes | Primary path | Fallback path |
|---|---|---|
| `.dng`, `.cr2`, `.cr3`, `.nef`, `.arw`, `.orf`, `.rw2`, `.pef`, `.raf`, `.srw` | Optional `rawpy`/LibRaw demosaic to 16-bit sRGB with camera white balance, then normalized to float32 | Pillow attempts to decode the raster representation it recognizes, including readable TIFF/DNG-like files; this is not guaranteed to be an embedded JPEG preview |

`rawpy` is an optional dependency installed with the `raw` extra. Without it, KuroLight still
attempts Pillow decoding. If rawpy fails on a file, Pillow is also tried; if both fail, decoding
raises an error with the source path. `extract_preview` returns Pillow's default image/frame when
decodable; it does not explicitly extract or identify a camera's embedded JPEG preview. Camera
make/model support cannot be inferred from these extensions.

The general import allowlist additionally accepts common raster suffixes: `.jpg`, `.jpeg`, `.png`,
`.tiff`, `.tif`, `.webp`, `.bmp`, `.gif`, `.ico`, `.ppm`, `.pgm`, `.pbm`, and `.pnm`. Actual
container/codec decodability is still checked when Pillow/OpenCV reads the file. Import success does
not guarantee full sensor-data RAW decoding.

The automated tests use generated TIFF data with RAW suffixes and a fake rawpy interface to verify
dispatch, the requested rawpy processing options, fallback, and readable decode errors. They do
not validate actual camera models, firmware variants, proprietary codec edge cases, embedded
preview extraction, or color accuracy. A real licensed camera sample matrix remains necessary
before claiming camera-specific support.
