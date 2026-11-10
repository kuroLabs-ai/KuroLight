# Developer Guide & CLI Reference

This guide covers developer environment setup, running in development mode, database architecture, testing, and production packaging.

---

## 1. System Requirements

* **Python**: 3.11, 3.12, or 3.13 (64-bit recommended).
* **Node.js**: 18+ and `npm`.
* **OS**:
  * **Windows 10/11**: Microsoft Edge WebView2 Runtime (pre-installed on Windows 11).
  * **macOS 12+**: WebKit (built-in).
  * **Linux (Ubuntu 22.04+, Fedora 38+)**: `libwebkit2gtk-4.0` or `libwebkit2gtk-4.1`.

---

## 2. Installation & Setup

Clone the repository and install dependencies:

```bash
# 1. Install Python package in editable mode with development dependencies
pip install -e .
pip install -r requirements/image-processing.txt
pip install -r requirements/testing.txt

# 2. Install web frontend dependencies
npm --prefix web install
```

---

## 3. Running KuroLight

### Production Mode
Runs the compiled React bundle served from `web/dist`:
```bash
python -m kurolight.run_gui
# or via registered console script:
kurolight-gui
```

### Development Mode (with Live Hot Reload)
Runs Vite with live Hot Module Replacement (HMR) for frontend development:

**Terminal 1 (Vite Dev Server):**
```bash
npm --prefix web run dev
```

**Terminal 2 (KuroLight Desktop Shell):**
```bash
python -m kurolight.run_gui --dev
```

### Headless CLI Engine
For batch processing, catalog queries, and automated exports without launching the GUI:
```bash
# Print CLI options
python -m kurolight.main --help

# Import a folder headlessly
python -m kurolight.main import --source "D:/Photos/2026-Session"

# Batch export an asset collection
python -m kurolight.main export --collection "Favorites" --output "D:/Exports" --format jpeg --quality 90
```

---

## 4. Running the Test Suite

KuroLight uses `pytest` with `pytest-qt` and `pytest-asyncio`:

```bash
# Run all tests
pytest

# Run tests with short progress
pytest -v --tb=short

# Run specific domain test
pytest tests/test_export_watermark.py
pytest tests/test_lens_correction.py
pytest tests/test_catalog_persistence.py
```

---

## 5. Catalog Database Architecture

Defined in: [`src/kurolight/infrastructure/database/`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/infrastructure/database/)

KuroLight stores photo metadata, ratings, flags, and edit states in a SQLite3 database located at:
* **Windows**: `%LOCALAPPDATA%\KuroLight\catalog.db`
* **macOS**: `~/Library/Application Support/KuroLight/catalog.db`
* **Linux**: `~/.local/share/kurolight/catalog.db`

### SQLite Configuration
* **WAL Mode**: `PRAGMA journal_mode = WAL;` allows simultaneous readers and background writers without locking.
* **Foreign Keys**: `PRAGMA foreign_keys = ON;` guarantees relational integrity across collections and assets.
* **Synchronous**: `PRAGMA synchronous = NORMAL;` provides optimal write throughput while protecting against data corruption.

### Key Database Tables
* **`assets`**: File paths, creation timestamps, format, width, height, star ratings, and pick/reject flags.
* **`metadata`**: Extracted EXIF/IPTC camera make, lens model, focal length, ISO, aperture, and shutter speed.
* **`edits`**: JSON-serialized non-destructive parameters (`exposure`, `white_balance`, `color_grading`, `curves`, `lens_correction`, `crop`).
* **`collections` & `collection_assets`**: Hierarchical manual and smart query collections.
* **`presets`**: Custom and imported user recipes.

---

## 6. Building for Distribution

To build the complete standalone web frontend:
```bash
npm.cmd --prefix web run build
```
This runs TypeScript type checking (`tsc -b`) and generates optimized production bundles in `web/dist/`.
