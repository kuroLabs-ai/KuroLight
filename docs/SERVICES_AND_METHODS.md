# Backend Services & Methods Reference

This document provides a comprehensive API specification for all major backend services and the `PyBridge` interface in KuroLight.

---

## 1. EditingService
Defined in: [`src/kurolight/services/editing_service.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/services/editing_service.py)

Manages non-destructive photo adjustments, source buffer caching, history stack, and live preview rendering.

### Methods
* **`get_edit_state(asset_id: str) -> EditState`**  
  Retrieves the current edit state for the specified asset from the catalog. Returns a default `EditState` if none is saved.
* **`save_edit_state(state: EditState) -> None`**  
  Persists the edit state parameters to SQLite and registers the change in the undo history stack.
* **`get_or_load_source_buffer(asset_id: str, source_path: Path) -> ImageBuffer`**  
  Loads the source image into a 32-bit floating-point `ImageBuffer`. Caches buffers in memory using an LRU cache.
* **`render_preview(asset_id: str, source_path: Path, edit_state: EditState, progress_callback: Callable[[int], None] | None = None, cancel_event: Event | None = None) -> ImageBuffer`**  
  Executes the full DAG processing pipeline against the source buffer with the given edit parameters. Emits `preview_rendered` signal upon completion.
* **`clear_cache(asset_id: Optional[str] = None) -> None`**  
  Flushes the in-memory source buffer and intermediate render caches.

---

## 2. LibraryService
Defined in: [`src/kurolight/services/library_service.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/services/library_service.py)

Handles catalog asset ingestion, folder scanning, metadata extraction, collections, sorting, filtering, and trash management.

### Methods
* **`import_file(file_path: Path, project_id: Optional[str] = None) -> ImageAsset`**  
  Imports a single photo into the catalog, parses EXIF/IPTC metadata, and creates initial thumbnail caches.
* **`import_files(file_paths: Iterable[Path], project_id: Optional[str] = None, cancel_event: Optional[Event] = None) -> ImportBatchResult`**  
  Performs bulk import of multiple file paths.
* **`import_directory(dir_path: Path, project_id: Optional[str] = None, cancel_event: Optional[Event] = None) -> ImportBatchResult`**  
  Recursively traverses a directory and imports all supported RAW, JPEG, PNG, TIFF, and WebP images.
* **`get_assets(project_id: Optional[str] = None) -> List[ImageAsset]`**  
  Returns all active (non-trashed) assets in the given project.
* **`filter_assets(project_id: Optional[str] = None, query: str = "", min_rating: int = 0, flag_filter: str = "all", collection_id: Optional[str] = None, source_folder: Optional[str] = None, sort_by: str = "file_name", ascending: bool = True, trash_only: bool = False) -> List[ImageAsset]`**  
  Executes optimized indexed queries with multi-criteria filtering and sorting.
* **`get_thumbnail(asset: ImageAsset, size: int = 256) -> Optional[QPixmap]`**  
  Retrieves a Qt QPixmap representation of the cached thumbnail.
* **`get_thumbnail_bytes(asset: ImageAsset, size: int = 256) -> Optional[bytes]`**  
  Retrieves JPEG-compressed thumbnail bytes (used for base64 data URLs in the web UI).
* **`move_assets_to_trash(asset_ids: List[str], project_id: Optional[str] = None) -> None`**  
  Marks assets as trashed without deleting original files from disk.
* **`restore_assets(asset_ids: List[str], project_id: Optional[str] = None) -> None`**  
  Restores trashed assets back to active catalog views.
* **`permanently_delete_assets(asset_ids: List[str], project_id: Optional[str] = None) -> None`**  
  Deletes asset records, thumbnail caches, and edit histories permanently from the database.
* **`create_collection(project_id: str, name: str, parent_id: Optional[str] = None) -> Optional[Collection]`**  
  Creates a standard manual collection.
* **`create_smart_collection(project_id: str, name: str, rules: SmartCollectionRules, parent_id: Optional[str] = None) -> Optional[Collection]`**  
  Creates a dynamic smart collection evaluated by query rules.
* **`export_metadata_sidecar(asset_id: str, overrides: AssetMetadataOverrides | dict | None = None, *, conflict: str = "error") -> str`**  
  Writes industry-standard XMP sidecar files (`.xmp`) alongside the source photo.
* **`import_metadata_sidecar(asset_id: str) -> AssetMetadataOverrides`**  
  Reads XMP sidecar updates into the catalog.

---

## 3. ExportService & ExportJobManager
Defined in: [`src/kurolight/services/export_service.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/services/export_service.py)

Coordinates photo exports, watermarking, resize scaling, output format transcoding, and sRGB ICC profile tagging.

### Methods
* **`execute_export(job: ExportJob, progress_cb: Optional[Callable[[float], None]] = None) -> ExportResult`**  
  Renders the target asset with active edits, resizes per settings, applies text/image watermarks, embeds the canonical sRGB ICC profile, and writes to disk.
* **`batch_export(jobs: List[ExportJob], progress_cb: Optional[Callable[[int, int], None]] = None) -> List[ExportResult]`**  
  Processes multiple export jobs sequentially or in parallel.
* **`get_srgb_profile_bytes() -> bytes`**  
  Cached factory function providing the canonical sRGB color space profile bytes.

---

## 4. PresetService
Defined in: [`src/kurolight/services/preset_service.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/services/preset_service.py)

Manages built-in and user-authored editing presets.

### Methods
* **`get_presets() -> List[Preset]`**  
  Returns all registered presets (including all 54 built-in style recipes and user-created presets).
* **`get_preset(preset_id: str) -> Optional[Preset]`**  
  Fetches a specific preset by ID or name.
* **`apply_preset(preset_id: str, current_state: EditState) -> EditState`**  
  Merges preset parameters into the current edit state non-destructively.
* **`create_preset(name: str, category: str, parameters: Dict[str, Any]) -> Preset`**  
  Persists a new user custom preset into SQLite.
* **`delete_preset(preset_id: str) -> None`**  
  Removes a user preset.

---

## 5. ProjectService
Defined in: [`src/kurolight/services/project_service.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/services/project_service.py)

Manages SQLite catalog storage, project metadata, and automatic backups.

### Methods
* **`open_or_create_project(db_path: Path, name: str = "Untitled Project") -> ProjectService`**  
  Factory method that connects to an existing SQLite catalog or initializes database tables and indices.
* **`get_current_project() -> Optional[Project]`**  
  Returns the active project model.
* **`backup_catalog(destination: Path) -> Path`**  
  Performs an online, zero-downtime SQLite catalog backup using `sqlite3.Connection.backup()`.

---

## 6. KuroAIService & AIToolRegistry
Defined in: [`src/kurolight/ai/service.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/ai/service.py) and [`src/kurolight/ai/registry.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/ai/registry.py)

* **`analyze(...) -> dict[str, Any]`**  
  Processes user natural language commands (e.g. "make it warmer", "apply teal and orange", "increase contrast") and returns generated adjustment proposals.
* **`list_models(provider: str, api_key: str) -> list[dict[str, str]]`**  
  Enumerates available models for Gemini, OpenAI, or Anthropic.

---

## 7. PyBridge (IPC Interface)
Defined in: [`src/kurolight/ui/web_bridge.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/ui/web_bridge.py)

Exposes Python services to the React frontend through `window.pywebview.api`:

### Asset & Library Operations
* `get_asset_page(offset, limit, filters_json)` — Paginated catalog asset fetch.
* `get_thumbnails(asset_ids_json)` — Batch fetch of base64 thumbnail images.
* `import_files()` / `import_folder()` — Native OS file/folder picker and import.
* `import_dropped_file(file_name, data_url)` — Drag-and-drop import support.
* `set_rating(asset_id, rating)` / `set_flag(asset_id, flag)` — Asset curation.
* `batch_set_rating(asset_ids_json, rating)` / `batch_set_flag(...)` — Bulk curation.
* `delete_assets(asset_ids_json)` — Move selected assets to trash.
* `restore_assets(asset_ids_json)` — Restore from trash.
* `permanently_delete_assets(asset_ids_json)` — Hard delete assets.

### Editing & Preview Operations
* `select_asset(asset_id)` — Selects active asset for viewing and editing.
* `update_edit_state(state_json)` — Real-time slider update with live debounced preview.
* `save_edit_state(state_json)` — Permanent save of edit adjustments.
* `auto_tone()` — Generates intelligent automatic dynamic range adjustments.
* `apply_crop(x, y, w, h)` / `reset_crop()` / `cancel_crop()` — Crop & straighten.
* `undo()` / `redo()` / `jump_history(index)` — History timeline traversal.

### Collections & Presets
* `create_collection(name, parent_id)` / `delete_collection(id)`
* `create_smart_collection(name, rules_json, parent_id)` / `update_smart_collection(...)`
* `apply_preset(preset_id_or_name)` — Apply named preset recipe.
* `save_preset(name, category)` — Save active photo edits as a new preset.

### Export & System Settings
* `export_assets(settings_json)` — Queues export job for selected photos.
* `get_preferences()` / `save_preferences(prefs_json)` — App-wide preferences.
* `get_ai_settings()` / `save_ai_settings(settings_json)` — AI API keys & provider setup.
* `backup_catalog_now()` — Trigger immediate catalog snapshot backup.
* `optimize_database()` — Runs `VACUUM` and `ANALYZE` on the SQLite catalog.
