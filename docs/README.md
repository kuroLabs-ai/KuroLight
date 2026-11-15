# KuroLight documentation

This documentation describes the behavior implemented in the repository. The
source code and automated tests are authoritative when behavior changes.

## User documentation

- [Getting started](GETTING_STARTED.md): requirements, setup, launch, and first
  project.
- [User guide](USER_GUIDE.md): Gallery, Lightbox, Color Studio, Visual Flow,
  and Deliver workflows.
- [Feature catalog](FEATURE_CATALOG.md): a complete inventory of implemented
  workspaces and capabilities, with unsupported settings called out.
- [Library and project data](LIBRARY_AND_METADATA.md): imports, supported file
  types, catalogs, metadata, trash, and backups.
- [Editing and export](EDITING_AND_EXPORT.md): edit state, rendering, local
  adjustments, color handling, and export behavior.
- [Preset library](PRESET_LIBRARY.md): built-in looks and custom preset
  behavior.
- [AI and privacy](AI_AND_PRIVACY.md): Kuro AI, local restoration, credentials,
  consent, and Strict Offline mode.
- [Settings and shortcuts](SETTINGS_AND_SHORTCUTS.md): working settings,
  defaults, and keyboard customization.
- [Troubleshooting](TROUBLESHOOTING.md): common setup, import, editing, AI, and
  export problems.

## Developer and release documentation

- [Architecture](ARCHITECTURE.md): startup, major modules, IPC, and persistence
  boundaries.
- [Configuration reference](CONFIGURATION_REFERENCE.md): every persisted
  preference and its current runtime effect.
- [Data model](DATA_MODEL.md): SQLite schema, edit-state structure, and local
  persistence locations.
- [Bridge API](API_REFERENCE.md): public Python/webview calls and events.
- [Development](DEVELOPMENT.md): environment setup, tests, linting, and
  troubleshooting.
- [Windows release packaging](WINDOWS_RELEASE.md): PyInstaller, Inno Setup,
  installer options, and release checks.
- [Support and limitations](SUPPORT_AND_LIMITATIONS.md): platform scope,
  current constraints, and areas that should not be advertised as implemented.

## Documentation maintenance

When a user-visible behavior changes, update the relevant guide and the root
[README](../README.md). Keep limitations explicit, use commands that exist in
the current manifests, and avoid documenting a preference as functional unless
the application applies it.
