# Python bridge API reference

The desktop React application calls public methods on `PyBridge` through
pywebview's JavaScript API. `_SerializedAPI` exposes public callables and
serializes most operations with a re-entrant lock. Long-running AI, import,
and export operations are allowed to run concurrently so that cancellation
calls can be received.

This is the current desktop bridge surface, grouped by responsibility. Internal
methods beginning with `_` are not part of the JavaScript API.

## Startup and window

- `initial_sync()` — send the initial catalog, project, workspace, history,
  selection, and view state.
- `toggle_fullscreen()` — toggle the native window's fullscreen state.
- `show_devtools()` — open webview developer tools where supported.

## Library reads and selection

- `get_asset_page(...)` — fetch a filtered/sorted page of assets.
- `get_source_folders(offset, limit)` — return paginated source-folder entries.
- `get_asset_ids(filters_json)` — return asset identifiers matching filters.
- `is_asset_in_collection(asset_id, collection_id)` — test membership.
- `get_thumbnails(asset_ids_json)` — fetch thumbnail data for multiple assets.
- `select_asset(asset_id)` — select an asset and synchronize edit state.
- `open_in_develop(asset_id)` — select an asset and switch to Lightbox.

## Ratings, flags, deletion, and metadata

- `set_rating(asset_id, rating)` and `batch_set_rating(asset_ids_json, rating)`.
- `set_flag(asset_id, flag)` and `batch_set_flag(asset_ids_json, flag)`.
- `update_asset_metadata_overrides(asset_id, overrides_json)`.
- `delete_assets(asset_ids_json)` — move catalog assets to Recently Deleted.
- `restore_assets(asset_ids_json)` — restore catalog entries.
- `permanently_delete_assets(asset_ids_json)` — remove catalog entries
  permanently; this does not delete the source photo.

## Collections

- `create_collection(...)` — create a manual collection.
- `create_smart_collection(...)` and `update_smart_collection(...)`.
- `rename_collection(collection_id, new_name)`.
- `add_to_collection(collection_id, asset_ids_json)` and
  `remove_from_collection(collection_id, asset_ids_json)`.
- `delete_collection(collection_id)`.

## Import

- `import_files()` — open the image-file picker and start an import.
- `import_folder()` — open the folder picker and import supported contents.
- `import_dropped_file(file_name, data_url)` — import a file payload delivered
  by the web UI.
- `cancel_import()` — request cancellation of the active import.

Import operations report progress and outcomes through bridge events.

## Edit state, history, and workspace

- `save_edit_state(state_json)` — validate and save a complete edit state.
- `auto_tone()` and `analyze_auto_tone(asset_id, edit_state_json)`.
- `undo()`, `redo()`, and `jump_history(index)`.
- `set_workspace(workspace_id)`.
- `toggle_filmstrip()`.
- `set_crop_mode(active)`, `apply_crop(x, y, w, h)`, `reset_crop()`, and
  `cancel_crop()`.

The command dispatcher can also be accessed with
`dispatch_command(command_id, payload_json)`.
`python -m kurolight --list-commands` prints the registered command schemas.
Current built-ins are `undo`, `redo`, `edit_state_update`, and
`kuro_ai_apply_proposal`.

## Kuro AI and local restoration

- `get_ai_settings()` — return provider/model and credential-presence flags,
  never the secret key.
- `get_ai_models(provider, api_key)` and
  `test_ai_connection(provider, api_key)`.
- `save_ai_settings(settings_json)` and
  `accept_ai_privacy_disclosure(accepted, version)`.
- `prepare_ai_context(asset_id, edit_state_json, custom_luts_json)` — prepare
  current image context locally.
- `propose_ai_edits(prompt, history_json, asset_id, edit_state_json,
  custom_luts_json)` — request a provider-backed response and proposal.
- `apply_ai_proposal(candidate_json, asset_id, base_fingerprint, base_state_json)`
  — validate that the proposal applies to the expected base state.
- `get_local_ai_status()`, `has_local_enhancement_model()`,
  `download_local_enhancement_model()`, and `delete_local_ai_model(model_id)`.
- `preview_ai_restoration(asset_id, edit_state_json, custom_luts_json)` and
  `cancel_processing()`.

Strict Offline mode is checked on network-bearing bridge operations. See
[AI and privacy](AI_AND_PRIVACY.md) before enabling provider requests.

## Preferences, system, and storage

- `get_app_info()` and `open_external_url(url)`.
- `get_preferences()` and `save_preferences(prefs_json)`.
- `get_storage_stats()`, `clear_cache()`, `optimize_database()`, and
  `backup_catalog_now()`.
- `get_processing_cache_info()` and `clear_processing_cache()`.
- `get_export_presets()`.

`save_preferences` returns the normalized saved preferences. It does not make
unsupported fields operational; see [Configuration reference](CONFIGURATION_REFERENCE.md).

## Export

- `choose_export_folder()` — ask the native dialog for a destination.
- `export_assets(settings_json)` — start a batch export.
- `get_export_job(job_id)` — read job/batch status.
- `control_export_job(job_id, action)` — pause, resume, or cancel according to
  the job manager's supported transitions.

## Events

The Python bridge emits:

| Event | Purpose |
|---|---|
| `image_updated` | New browser preview/source image URL. |
| `before_image_updated` | Original/before image URL. |
| `assets_updated` | Catalog asset data changed. |
| `asset_count_updated` | Visible/project asset count changed. |
| `trash_count_updated` | Recently Deleted count changed. |
| `library_loading` | Import/library loading status and progress. |
| `collections_updated` | Collection data changed. |
| `history_updated` | Edit history and active history index changed. |
| `asset_selected` | Active asset and edit-state selection changed. |
| `filmstrip_toggled` | Filmstrip visibility changed. |
| `workspace_changed` | Active workspace changed. |
| `notification` | User-facing title, message, and severity. |
| `processing_progress` | Long-running local processing progress/cancellation state. |

JSON payloads are validated in the bridge before applying changes. Errors
should be shown to the user rather than converted to success-shaped responses.
