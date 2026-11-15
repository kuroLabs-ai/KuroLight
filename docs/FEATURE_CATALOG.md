# Feature catalog

This catalog describes what a user can do in the current application. It
separates implemented features from saved preferences or ideas that are not
connected to runtime behavior.

## Application shell

- PySide6 native application startup and splash screen.
- Embedded pywebview desktop surface hosting the React application.
- Five workspaces: Gallery, Lightbox, Color Studio, Visual Flow, and Deliver.
- Native file and folder dialogs for import and export.
- User preferences and a remembered project/workspace.
- Notifications and progress events from Python services.

## Gallery and library

- Import individual image files, drag/drop image payloads, and folders.
- Extract available image dimensions, capture date, camera/lens and other
  metadata into the catalog.
- Paginated asset display with sorting, filtering, search, folder navigation,
  ratings, pick/reject flags, and collections.
- Manual and rule-based smart collections.
- Multi-selection and opening a selection in the Lightbox filmstrip.
- Catalog-only metadata overrides and explicit KuroLight sidecar
  import/export.
- Recoverable Recently Deleted state, restoration, and explicit permanent
  catalog removal.
- Thumbnail caching, catalog statistics, cache cleanup, optimization, and
  verified catalog backup.

See [Library and project data](LIBRARY_AND_METADATA.md).

## Editing

- Non-destructive `EditState` per asset with named snapshots and edit history.
- Exposure/tone, white balance, color, HSL, curves, LUT grading, geometry,
  lens, detail, vignette, local masks, retouching, and resolution restoration.
- Browser WebGL rendering for interactive controls, scopes, and visual-flow
  previews.
- Local AI restoration preview with progress and cancellation.
- Auto Tone analysis and approval-gated Kuro AI edit proposals.
- Saved preset recipes and editable keyboard shortcuts.

See [Editing and export](EDITING_AND_EXPORT.md) and
[Preset library](PRESET_LIBRARY.md).

## Export

- Batch export job queue with per-job state/progress and batch controls.
- JPEG, PNG, TIFF, WebP, BMP, GIF, and PPM encoders.
- Resizing and filename tokens.
- Optional text, app-icon, or wordmark watermarks.
- Collision protection and source-overwrite protection.
- sRGB output; metadata preservation and wide-gamut export are not supported.

See [Editing and export](EDITING_AND_EXPORT.md).

## AI

- Provider-backed Kuro AI for image analysis and proposed edit recipes through
  Google Gemini, OpenAI, or Anthropic.
- OS credential-store integration for provider keys.
- Privacy disclosure and optional image context, proposal comparison, and
  stale-state validation before applying changes.
- On-device Real-ESRGAN x4 Plus restoration with optional DirectML/CUDA
  execution and CPU fallback.
- Strict Offline controls for supported bridge-initiated network actions.

Some model entries shown in legacy preference data are informational only;
only Real-ESRGAN x4 Plus currently has an implemented local model pipeline.
See [AI and privacy](AI_AND_PRIVACY.md).

## Settings: behavior status

Working settings and settings retained only for compatibility are documented
field-by-field in [Configuration reference](CONFIGURATION_REFERENCE.md). In
particular, monitor ICC/soft proofing, auto-import presets, external-editor
round-tripping, and several legacy performance fields do not currently alter
image processing.
