# Architecture

## Runtime shape

KuroLight is a desktop application with a native shell and an embedded web
interface:

```text
PySide6 startup and splash
        |
BootstrapWorker -> application services -> pywebview window
                                         |
                      React + TypeScript + WebGL
                                         |
                          serialized Python bridge
                                         |
             project/catalog, metadata, AI, export, settings
```

The React application owns interactive workspace state and WebGL preview
rendering. Python owns project persistence and full-resolution processing.
These renderers share edit-state data, but they are separate implementations
and are not guaranteed to produce pixel-identical output.

## Startup lifecycle

1. `src/kurolight/run_gui.py` creates the Qt application, applies the dark
   palette, and shows the splash screen.
2. `BootstrapWorker` calls `bootstrap_services()` off the UI path.
3. `bootstrap_services()` loads configuration, initializes the selected
   enhancement backend, opens or creates the project catalog, and constructs
   the library, editing, export, application-state, and command services.
4. `WebWindow` creates the pywebview host and `PyBridge`.
5. When the web page loads, the bridge performs the initial project/library
   synchronization. Closing the window triggers the app-close lifecycle.

## Main modules

| Area | Responsibility |
|---|---|
| `src/kurolight/app/` | Application state, command dispatch, bootstrap, and startup worker. |
| `src/kurolight/config/` | Pydantic configuration, defaults, and platform-specific paths. |
| `src/kurolight/domain/` | Edit state, assets, collections, metadata, projects, and export models. |
| `src/kurolight/infrastructure/database/` | SQLite connections, migrations, and repositories. |
| `src/kurolight/infrastructure/cache/` | Thumbnail and image cache behavior. |
| `src/kurolight/processing/` | Decoding, image buffers, processing graph, local masks, color, and enhancement. |
| `src/kurolight/services/` | Library, editing, export, project, and preset operations. |
| `src/kurolight/ui/web_bridge.py` | Python APIs and events exposed to the webview. |
| `web/src/` | React workspaces, UI state, settings, and WebGL rendering. |

## Persistence boundaries

- **Project catalog:** SQLite database selected by the user or opened as the
  current project. Migrations define its schema.
- **Application configuration:** JSON managed by `AppConfig` using
  `platformdirs`.
- **AI credentials:** stored through the operating system credential backend
  exposed by `keyring`; they are not written into the project catalog.
- **Browser storage:** IndexedDB stores local edit-state and image-cache data;
  shortcut bindings use browser local storage.
- **Source photos:** imported by reference. Editing and catalog metadata do not
  rewrite source image files.

## Web/Python bridge

`PyBridge` exposes methods and events through pywebview's JavaScript API.
`_SerializedAPI` serializes calls into the bridge to protect shared backend
state. The bridge handles library/catalog operations, project and preference
operations, edit persistence, AI requests, preview/restoration work, and export
job control.

Treat bridge values as untrusted input: validate paths, identifiers, serialized
models, and payload sizes at the API boundary. New bridge operations should
surface failures instead of returning success-shaped fallbacks.
