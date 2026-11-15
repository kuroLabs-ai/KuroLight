# Data model and persistence

## Project catalog

The catalog is SQLite with foreign keys enabled, WAL journal mode, a
30-second busy timeout, and sequential migrations. The current schema version
is **7** (`CURRENT_SCHEMA_VERSION` in
`src/kurolight/infrastructure/database/migrations.py`).

| Table | Contents |
|---|---|
| `schema_migrations` | Applied migration version and timestamp. |
| `projects` | Project ID, name, timestamps, schema version, and project settings JSON. |
| `assets` | Source path, project ID, name/type, dimensions, size, metadata, capture date, rating, flag, metadata overrides, source folder, and deletion timestamp. |
| `collections` | Manual/smart collection identity, project, parent, rules, and type. |
| `collection_assets` | Asset membership in manual collections. |
| `edit_states` | Current validated edit-state JSON per asset. |
| `edit_history` | Serialized undo/redo history and active history index per asset. |
| `history` | Recorded asset operation/state entries. |
| `presets` | Preset name, category, schema version, and recipe parameters. |
| `settings` | Key/value JSON settings stored in a catalog. |
| `visual_graphs` | Serialized visual-graph records. Visual Flow is currently a fixed supported-stage UI, not arbitrary graph editing. |

Migrations added gallery indexes, metadata overrides, source-folder tracking,
collection hierarchy/smart rules, and the recoverable-deletion timestamp.
`ProjectService` applies migrations on open/create.

## Asset and edit-state model

Each asset has a stable ID and a reference to the original source path. Import
metadata is stored as catalog data; it is not written back to the source file.

`EditState` currently contains:

- `schema_version` and `asset_id`.
- `exposure`: exposure in EV (-5..5), brightness/contrast/highlights/shadows/
  whites/blacks (-100..100).
- `white_balance`: temperature, tint, saturation, and vibrance (-100..100).
- `geometry`: normalized crop rectangle, rotation, straighten, horizontal/
  vertical flips, and aspect ratio.
- `lens_correction`: distortion and chromatic aberration (-100..100), vignette
  (0..100).
- `detail`: sharpening/noise reduction (0..100), clarity/texture/dehaze
  (-100..100), and restoration target (0, 720, 1080, 1440, or 2160).
- `hsl`: hue, saturation, and luminance for red, orange, yellow, green, aqua,
  blue, purple, and magenta.
- `color_grading`: lift/gamma/gain/offset wheels and optional LUT name and
  intensity.
- `tone_curves`: master RGB and independent red, green, and blue point lists.
- `masks`, `retouch_spots`, `snapshots`, and `custom_metadata`.

Values are validated by Pydantic models before Python processing. Browser
interfaces mirror this schema in `web/src/interfaces/edit.ts`.

## Other storage locations

- Application preferences are JSON in the OS-specific config directory
  resolved by `platformdirs`.
- Thumbnail/cache data is placed in the OS cache directory or the configured
  custom cache folder.
- Provider API keys are held by the platform credential manager via
  `keyring`.
- Browser edit-state and image caches use IndexedDB. Keyboard shortcut
  bindings and custom preset recipes use browser storage.
- The Real-ESRGAN model is stored below the application data directory in
  `models/realesrgan-x4plus.onnx`.
- Catalog backups are separate SQLite files. They do not contain source
  photographs.

## File ownership and backups

Moving a source photo after import can break its path reference until the
library is relinked/re-imported. Keep original photo folders and catalog
backups safe independently. A verified catalog backup is not a full photo
archive.
