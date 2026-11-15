# Configuration reference

Preferences are represented by `AppConfig` in
`src/kurolight/config/app_config.py`. Pydantic validates values; the bridge
loads and saves the configuration. The table distinguishes active settings
from fields retained in the config schema but not currently connected to
runtime behavior.

## Appearance

| Field | Default | Runtime effect |
|---|---|---|
| `theme` | `dark` | Dark UI is the current design; no alternate theme selector is exposed. |
| `accent_color` | `#C0C4CA` | Applied to the UI accent variables. |
| `ui_scale` | `1.0` | Applied as a UI scale, bounded to 0.8–1.2. |
| `font_family` | `Inter, Segoe UI, sans-serif` | Stored; not currently applied by the settings UI. |
| `startup_workspace` | `remember` | Selects a named workspace or restores `last_workspace`. |
| `confirm_disk_deletion` | `true` | Controls confirmation before permanent removal from Recently Deleted; deletion is catalog-only. |
| `warn_discard_crop_edits` | `true` | Controls the unfinished-crop confirmation. |

`last_workspace` defaults to `library` and is updated when the active
workspace changes.

## Performance

| Field | Default | Runtime effect |
|---|---|---|
| `enable_gpu` | `true` | Allows GPU providers for local AI restoration. |
| `gpu_engine` | `auto` | Selects Auto, DirectML, CUDA, or CPU for local restoration. |
| `selected_gpu_device` | `Auto-detect High Performance` | Stored; a specific device selector is not currently connected. |
| `preview_max_edge` | `2048` | Maximum browser source-preview edge; valid range 512–8192. |
| `preview_quality` | `balanced` | Selects draft/balanced/high-quality browser preview behavior. |
| `max_cache_mb` | `4096` | Applied to the managed thumbnail memory-cache limit; valid range 128–65536. |
| `vram_cache_mb` | `2048` | Stored; not currently used by the local AI renderer. |

GPU acceleration does not enable a GPU renderer for every feature.

## Storage

| Field | Default | Runtime effect |
|---|---|---|
| `custom_cache_dir` | unset | Redirects managed cache activity to a custom folder after saving; existing cache files are not moved. |
| `backup_schedule` | `on_exit` | `never`, `on_exit`, `daily`, or `weekly` catalog backup policy. |
| `backup_retention_count` | `5` | Maximum retained automatic backups; valid range 1–50. |
| `last_backup_at` | unset | Read-only record of the last scheduled backup time. |

Manual backups use the active project catalog and are integrity-checked.

## Import

| Field | Default | Runtime effect |
|---|---|---|
| `default_creator` | empty | Applied as an import-time catalog metadata override. |
| `default_copyright` | `© 2026 KuroLabs. All rights reserved.` | Applied as an import-time catalog metadata override. |
| `default_usage_terms` | `All rights reserved` | Applied as an import-time catalog metadata override. |
| `duplicate_detection` | `path` | Active choices: source path or SHA-256 content hash. |
| `auto_apply_preset` | `None` | Stored; automatic preset application during import is not implemented. |
| `raw_preview_priority` | `embedded_jpeg` | Stored; embedded-versus-full RAW priority is not implemented. |

## Color management

| Field | Default | Runtime effect |
|---|---|---|
| `working_space` | `sRGB` | Current processing/export remains sRGB regardless of the stored value. |
| `monitor_icc_profile` | `System Default` | Stored; monitor-profile selection is not implemented. |
| `soft_proofing_enabled` | `false` | Stored; soft proofing is not implemented. |
| `gamut_warning_color` | `#FF00FF` | Stored; no gamut clipping overlay is rendered. |

## Local AI

| Field | Default | Runtime effect |
|---|---|---|
| `strict_offline` | `false` | Active: blocks supported network requests, local-model downloads, and external URL opens. |

The Strict Offline setting does not remove a downloaded model or stored
provider credential.

## Kuro AI

| Field | Default | Runtime effect |
|---|---|---|
| `provider` | `gemini` | Active provider selection: Gemini, OpenAI, or Anthropic. |
| `model` | `gemini-2.5-flash` | Active model selection; provider model list is validated when possible. |
| `shortcut` | `Ctrl+K` | The application shortcut is controlled by editable shortcut bindings; this legacy field is not the active source. |
| `auto_routing` | `true` | Stored; automatic provider/model routing is not implemented. |
| `send_image_context` | `true` | Active consent control for including the current image in provider requests. |
| `privacy_disclosure_accepted` | `false` | Active consent gate for provider-backed image requests. |
| `privacy_disclosure_version` | `2026-11` | Version of the accepted disclosure. |
| `allow_local_model_downloads` | `false` | Stored; download gating is currently governed by Strict Offline and the explicit download action. |

API keys are not stored in these preferences; they are stored using `keyring`.

## External editor and editing

| Field | Default | Runtime effect |
|---|---|---|
| `external_editor.editor_path` | empty | Stored; external-editor round-trip is not implemented. |
| `external_editor.editor_name` | `Photoshop` | Stored; external-editor round-trip is not implemented. |
| `external_editor.roundtrip_format` | `TIFF (16-bit)` | Stored; external-editor round-trip is not implemented. |
| `editing.default_color_space` | `sRGB` | The current image pipeline is sRGB; this is not a switch for other working spaces. |
| `editing.autosave_interval` | `60` | Stored; edit saving currently uses explicit save and browser cache behavior rather than this interval. |
| `editing.undo_limit` | `100` | Active limit for command history. |

## Paths

Config, data, and cache roots are generated with `platformdirs` using the
application name `KuroLight` and publisher `KuroLabs`. Use the app's custom
cache setting rather than manually relocating managed cache files. The active
project path is stored in `last_project_path`.
