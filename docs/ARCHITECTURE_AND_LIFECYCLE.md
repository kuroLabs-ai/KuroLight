# System Architecture & Application Lifecycle

KuroLight combines high-performance Python image processing with a modern, GPU-accelerated React frontend via a native desktop container.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    KuroLight Desktop Shell                      │
├────────────────────────────────┬────────────────────────────────┤
│      PySide6 / Qt Core         │      pywebview Runtime         │
│  - Application Initialization  │  - Microsoft Edge WebView2     │
│  - Obsidian Palette System     │  - WebKit (macOS / Linux)      │
│  - Animated Splash Screen      │  - React 19 Frontend Shell     │
│  - Background Bootstrap Thread │  - Lucide Icons / Tailwind CSS │
├────────────────────────────────┴────────────────────────────────┤
│                 IPC Layer: PyBridge (JSON-RPC)                  │
│   JavaScript (window.pywebview.api) <=====> Python (PyBridge)   │
├─────────────────────────────────────────────────────────────────┤
│                     Backend Services Layer                      │
│   EditingService  •  LibraryService  •  ExportService           │
│   PresetService   •  ProjectService  •  KuroAIService           │
├─────────────────────────────────────────────────────────────────┤
│                   Core Processing & Storage                     │
│  - 32-bit Float Processing DAG Pipeline (NumPy / Pillow)        │
│  - SQLite 3 Catalog Database (WAL Mode + Thread-Local Conns)    │
│  - Disk Cache & LRU Thumbnail Store                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Application Lifecycle & Startup Sequence

The lifecycle starts at `kurolight.run_gui:run()`:

### Phase 1: Native Shell Initialisation
1. **QApplication Creation**: Instantiates `QApplication(sys.argv)`.
2. **Obsidian Dark Palette**: Applies the custom Obsidian Dark palette to Qt to prevent white window flash on startup.
3. **Application Icon**: Resolves the desktop icon (`assets/icons/logo.png`) and registers it with `app.setWindowIcon()`.

### Phase 2: Animated Splash Screen
1. `SplashScreen` is instantiated and displayed (`splash.show()`).
2. Renders dynamic branding with gradient text, logo icon, version tag, and a 6-stage segmented progress indicator.

### Phase 3: Background Bootstrap Worker
1. `BootstrapWorker` starts on a dedicated `QThread` to keep the UI smooth and responsive.
2. Coordinates the 6 bootstrap stages:
   * **Stage 1**: Database schema verification and migration (`sqlite3` WAL mode).
   * **Stage 2**: Project / catalog verification (`ProjectService`).
   * **Stage 3**: Cache directories and thumbnail store setup (`ThumbnailCache`).
   * **Stage 4**: Preset catalog initialization (loading 54 built-in recipes).
   * **Stage 5**: Command dispatcher and AI tool registry setup (`AIToolRegistry`).
   * **Stage 6**: Pywebview web window and IPC bridge setup.
3. As each stage advances, `worker.stage_changed` signals update the splash screen progress bar.

### Phase 4: Main Window Transition
1. Upon `worker.services_ready`, `WebWindow` is created.
2. The splash screen executes a fade transition and closes.
3. The main window loads `web/dist/index.html` (or `http://localhost:5173` if `--dev` is specified).

---

## 2. Hybrid IPC: PyBridge

Communication between the React web UI and Python backend occurs via `PyBridge`:

* **No HTTP Overhead**: Commands are executed directly via pywebview's in-process JS-to-Python bridge (`window.pywebview.api.<method>()`).
* **Serialization Protocol**: Complex objects, filters, and edit states are exchanged as JSON strings (`pydantic` and `dataclasses`).
* **Reverse Event Dispatch**: Backend asynchronous events (import progress, export progress, edit previews) are sent to the frontend via `window.evaluate_js()` executing custom DOM events:
  ```javascript
  window.dispatchEvent(new CustomEvent('kurolight:<event_name>', { detail: data }));
  ```
* **Frontend Bridge Client**: [`web/src/bridge.ts`](file:///d:/vscode/Kuro.worktrees/kurolight/web/src/bridge.ts) wraps all calls with strict TypeScript types, promises, and error handling.

---

## 3. Concurrency & Thread Safety

To guarantee a non-blocking 60 FPS user experience:
1. **Database Access**: Uses `DatabaseConnectionManager` with thread-local connections (`threading.local`) and SQLite Write-Ahead Logging (`PRAGMA journal_mode=WAL`), preventing locking between reads and background writes.
2. **Batch Import & Thumbnailing**: Imports run inside cancellable worker threads (`threading.Event`), pushing batch results to the catalog.
3. **Image Pipeline Execution**: Live preview generation executes in background thread pools; previous in-flight renders are debounced or cancelled when rapid slider adjustments occur.
4. **Export Jobs**: Managed by `ExportJobManager`, processing queued jobs sequentially or concurrently across available CPU threads without freezing the UI.
