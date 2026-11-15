# User guide

KuroLight has five workspaces. Use the top navigation or the default
`Alt+1`–`Alt+5` shortcuts to move between them.

## Gallery

Gallery is the catalog and culling workspace.

- Import individual supported image files or folders.
- Search metadata and organize assets with ratings, flags, folders, and
  collections.
- Select several photos and open them together in Lightbox; the filmstrip
  allows editing each selected photo in turn.
- Use the inspector for capture metadata and catalog-only metadata overrides.
- Delete moves catalog entries to Recently Deleted. Permanent removal from the
  catalog requires confirmation by default; source files are not deleted by
  this action.
- Restore an item from Recently Deleted when it is still in the catalog.

## Lightbox

Lightbox is the primary editing workspace. The browser renders interactive
changes as you adjust controls. Save edits to persist them in the project
catalog. A source photograph remains unchanged.

Editing includes tonal and color controls, curves, HSL, color grading and LUTs,
geometry, manual lens adjustments, detail, masks, and healing/cloning retouch
spots. Local masks can use brush strokes, gradients, or sampled color and
luminance ranges. Mask composition supports the operations exposed by the UI.

Use the **Before** view to compare against the original. Crop changes can be
cancelled; the unfinished-crop warning is configurable in Settings.

### Local AI restoration

Select a restoration target and use **Preview AI restoration** in the Lightbox.
The operation reports progress and can be cancelled. A preview is only retained
while the active photo and its edit state still match the request. The chosen
restoration target is processed during export; previewing does not replace the
original or silently overwrite the edit state.

## Color Studio

Color Studio provides the color-wheel, curve, HSL, histogram, waveform, and
vectorscope controls supported by the current browser renderer. Scopes are
derived from the browser preview, not from a calibrated monitor profile.

## Visual Flow

Visual Flow displays the current browser rendering stages and allows supported
stages to be bypassed. It is not a general node editor: users cannot freely
rewire processing nodes or add arbitrary third-party nodes.

## Deliver

Deliver exports one or more selected catalog assets through a background job
queue. Configure the output format, quality where applicable, filename pattern,
resize target, and optional text or image watermark. The UI displays batch
progress and supports the available pause, resume, and cancel actions.

Exports are written to a new path. If the destination already exists, that
asset fails rather than overwriting the existing file. Export currently strips
metadata and only supports sRGB output; see
[Editing and export](EDITING_AND_EXPORT.md).

## Keyboard shortcuts

Shortcuts can be viewed from the top-bar menu and changed in **Settings →
Shortcuts**. Changes are saved explicitly. The current binding list is in
[Settings and shortcuts](SETTINGS_AND_SHORTCUTS.md).
