# Settings and shortcuts

Settings are stored in the application configuration and saved through the
Python bridge. A setting is described below as active only when it affects
current behavior.

## Appearance

- **Accent color:** changes the application accent color.
- **UI scale:** applies a bounded interface scale (80–120%).
- **Startup workspace:** choose a workspace or remember the last workspace.
- **Confirm permanent deletion:** controls the prompt when removing assets from
  Recently Deleted. Normal removal to Recently Deleted remains confirmable.
- **Warn before discarding crop:** controls the warning for an unfinished crop
  adjustment.

## Performance

- **GPU backend:** choose Auto, DirectML, CUDA, or CPU for local AI enhancement,
  subject to available runtime support.
- **Preview quality and maximum edge:** control the browser preview's resolution
  and quality path.
- **Cache budget:** limits the managed in-memory thumbnail/cache use where the
  cache implementation supports it.

The GPU preference does not switch the WebGL preview to a Python renderer and
does not accelerate every UI operation.

## Storage

- **Custom cache directory:** changes the managed cache location for new cache
  activity after saving; existing cache files are not migrated automatically.
- **Backup schedule:** Never, on exit, daily, or weekly.
- **Backup retention:** limits the number of retained catalog backups.
- **Backup action:** creates a verified SQLite backup of the active project
  catalog.

Backups do not include original image files. Preserve the source-photo folders
separately.

## Import

- Default creator, copyright, and usage terms can be applied as catalog
  metadata overrides during import.
- Duplicate detection can use the source path or a content hash.
- Image metadata overrides do not rewrite EXIF in the original file.
- RAW preview priority is not currently an active configurable control.

## Privacy and color

- **Strict Offline:** blocks supported bridge-initiated network and external
  URL operations. See [AI and privacy](AI_AND_PRIVACY.md).
- **Color path:** current processing/export is sRGB. Monitor ICC selection,
  soft proofing, and gamut warning overlays are not implemented. Settings
  retained for compatibility do not change rendered pixels.

## Default keyboard shortcuts

Shortcuts are available from the top-bar **Shortcuts** menu. Open **Customize**
to edit a binding. Press a key combination, resolve any duplicate binding, and
save changes. Use an individual reset button or **Restore defaults** to return
to defaults.

| Action | Default |
|---|---|
| Gallery / Lightbox / Color Studio / Visual Flow / Deliver | `Alt+1` / `Alt+2` / `Alt+3` / `Alt+4` / `Alt+5` |
| Import images | `Ctrl+O` |
| Save current edits | `Ctrl+S` |
| Open Settings | `Ctrl+Comma` |
| Toggle Kuro AI panel | `Ctrl+K` |
| Close active panel or dialog | `Ctrl+Shift+Escape` |
| Undo / Redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Toggle filmstrip / right panel / crop tool | `Ctrl+Shift+F` / `Ctrl+Shift+P` / `Ctrl+Shift+C` |
| Gallery: rate 1–5 stars | `Ctrl+Alt+1` through `Ctrl+Alt+5` |
| Gallery: pick / unflag / reject | `Ctrl+Alt+P` / `Ctrl+Alt+U` / `Ctrl+Alt+X` |
| Open selected photo / select all visible / delete selection | `Ctrl+Enter` / `Ctrl+A` / `Ctrl+Shift+Backspace` |

Gallery-only shortcuts are ignored outside Gallery. Shortcuts are ignored while
typing in text inputs, except the actions designated to save or close.
