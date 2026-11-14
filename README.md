<div align="center">

<img src="assets/icons/KuroLight_combined_logo_horizontal.png" alt="KuroLight Logo" width="560" />

### Intelligent Visual Creation & Non-Destructive Photographic Studio

A modern desktop photo library and raw development workstation.<br/>
Original master files remain pristine while the browser renders interactive edits with WebGL and Python handles catalog persistence and full-resolution processing.

[![Version](https://img.shields.io/badge/version-1.0.0-25C7FF?style=for-the-badge&logo=semver&logoColor=white)](pyproject.toml)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](pyproject.toml)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](web/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](web/package.json)
[![DirectML](https://img.shields.io/badge/DirectML-Accelerated-0078D4?style=for-the-badge&logo=windows&logoColor=white)](src/kurolight/processing/enhancement.py)
[![Tests](https://img.shields.io/badge/Tests-310%20Passing-10B981?style=for-the-badge&logo=pytest&logoColor=white)](tests/)
[![License](https://img.shields.io/badge/License-Proprietary-64748B?style=for-the-badge)](pyproject.toml)

<p align="center">
  <a href="#-quickstart">Quickstart</a> •
  <a href="#-why-kurolight">Why KuroLight?</a> •
  <a href="#-workspaces">Workspaces</a> •
  <a href="#-color-fidelity--icc-profiles">Color Science</a> •
  <a href="#-presets-catalog">54 Presets</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-packaging--installer">Packaging</a> •
  <a href="#-keyboard-shortcuts">Shortcuts</a> •
  <a href="#-documentation-hub">Docs</a>
</p>

</div>

---

## 📸 Overview

**KuroLight** is a desktop photo management and editing environment built around one rule: **your source photographs are never modified**.

Interactive edits—from exposure and white balance to color wheels, tone curves, LUTs, masks, and retouching—are rendered by the browser's WebGL engine. The browser caches edit state locally; in the native app, Save/Ctrl+S also persists it to the Python catalog. Python's image-processing pipeline remains responsible for full-resolution exports, so some WebGL preview operations are approximations rather than pixel-identical replicas of Python processing.

---

## ✨ Why KuroLight?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            KUROLIGHT ADVANTAGES                             │
├───────────────────────┬─────────────────────────────┬───────────────────────┤
│ 🛡️ Non-Destructive    │ ⚡ 32-bit Float Pipeline    │ 🧠 Kuro AI Assistant  │
│ Master files remain   │ Precision NumPy & Pillow    │ Vision LLM-powered    │
│ untouched. Adjustments│ processing graph; zero UI   │ photographic critique │
│ serialize to atomic   │ thread rendering blocking.  │ & candidate recipes;  │
│ SQLite edit states.   │                             │ approval-gated.       │
├───────────────────────┼─────────────────────────────┼───────────────────────┤
│ 🎯 Cross-Device Color │ 🎨 54 Built-in Presets      │ 📦 Deliver Queue      │
│ Embedded sRGB ICC     │ Film emulation, portraits,  │ Multi-format batch    │
│ profiles guarantee    │ cinematic grades, landscape │ exporting with token  │
│ exact mobile/WhatsApp │ & monochrome recipes with   │ templates, watermarks,│
│ color consistency.    │ instant search & filtering. │ and pause/resume.     │
├───────────────────────┼─────────────────────────────┼───────────────────────┤
│ ⚡ Zero-Lag Culling   │ ✨ Skeleton Shimmer UI      │ 🚀 Standalone Deploy  │
│ Decoupled selection   │ Modern skeleton placeholders│ Single-file portable  │
│ and instant thumbnail │ across gallery grid, tree,  │ .exe & Inno Setup     │
│ preview caching.      │ inspector, and viewport.    │ full Windows installer│
└───────────────────────┴─────────────────────────────┴───────────────────────┘
```

- **Non-Destructive Edit State**: Source photographs are not overwritten. Browser edit state is cached locally; saved edits are persisted in the native catalog. Undo/redo stacks are session-local, while named snapshots are included in saved edit state.
- **Privacy-First Design**: Photos stay local on your machine. Cloud AI connections are strictly opt-in and gated by explicit disclosure; credentials live solely in your operating system's secure keychain.
- **Ultra-Fast Zero-Lag Workflow**: Photo selection is decoupled from heavy rendering pipelines; selecting a photo in the library updates metadata instantly, while the Lightbox utilizes instant thumbnail pre-caching for 0ms transitions.
- **Cross-Platform Ready**: Architected with strict path normalization, directory traversal defense, native Windows file dialog integration, and hardware execution provider abstraction.

---

## 🎨 Color Fidelity & Cross-Device Display

KuroLight solves the common issue of exported photos shifting colors when shared on WhatsApp, mobile devices, or external browsers:
* **Canonical sRGB ICC Embedding**: All JPEG, PNG, TIFF, and WebP exports automatically embed the standardized sRGB color profile via `PIL.ImageCms`.
* **Zero Color Shifting**: Ensures mobile operating systems and messaging apps correctly interpret tonal balance without washing out skin tones or over-saturating highlights.
* **3D LUT Engine**: Dynamic mathematical evaluation and trilinear interpolation supporting standard `.cube` Look-Up Tables.

---

## 🎞️ 54 Built-in Presets Catalog

KuroLight includes **54 curated style recipes** categorized for instant darkroom workflows:
- **Film Emulation (13)**: Kodak Portra 400, Fuji Pro 400H, Ilford HP5 Plus, Kodachrome 64, CineStill 800T, Fuji Velvia 50, Agfa Vista 200, Kodak Tri-X 400, Classic Chrome, Polaroid SX-70, and more.
- **Portrait & Studio (8)**: Warm Editorial, Studio Soft, Golden Hour Glow, High Key Beauty, Moody Dramatic, Porcelain Skin, Earthy Bohemian, Cinematic Portrait.
- **Cinematic & Color Grade (9)**: Teal & Orange, Film Bleach Bypass, Cyberpunk Neon, Vintage Warmth, Moody Nordic, Technicolor 2-Strip, Matte Film, Anamorphic Dusk, Golden Blockbuster.
- **Landscape & Nature (8)**: Vivid Landscape, Golden Sunset, Dramatic Forest, Desert Warmth, Arctic Glacier, Deep Ocean, Autumn Equinox, Misty Mountain.
- **Urban & Street (4)**: Tokyo Night, Street Classic, Muted Concrete, Neon Alley.
- **Monochrome & Fine Art (7)**: B&W High Contrast, Fine Art Monochrome, Silver Gelatin, Sepia Warmth, Noir Dramatic, Low Key Dark, Infrared B&W.
- **Creative & Lifestyle (5)**: Retro Pop, Pastel Dream, Warm Hearth, Soft Glow, Clean Minimalist.

*All presets feature non-destructive merging, live category pills, instant search filtering, and custom user preset saving.*

---

## 🖥️ Workspaces

KuroLight provides five dedicated, task-focused workspaces accessible via the top navigation bar or `Alt+1` through `Alt+5`:

### 1. 🖼️ Gallery (`Alt+1`)
*The photographic library, organization, and culling hub.*
- **Skeleton Shimmer Placeholders**: Fluid animated card skeletons during initial loading and pagination.
- **Decoupled Fast Selection**: Single-clicking photos selects them instantly for EXIF inspection without blocking the engine; double-clicking or switching tabs seamlessly loads full development.
- **Folder & Album Navigation**: Filter catalog by filesystem directory representation or custom nested collections with shimmering folder placeholders.
- **Smart Collections**: Dynamically aggregate assets matching text search queries, star ratings (0–5), pick/reject flags, and source folders.
- **Multi-Photo Lightbox**: Select multiple photos and open them together in the Lightbox filmstrip, then switch between them while editing.
- **Compare & Survey**: Inspect 2 loaded images side-by-side or survey 2–4 candidates simultaneously with shared zoom and per-photo culling hotkeys.
- **Metadata Inspector**: View EXIF capture data (camera, lens, shutter, aperture, ISO, exposure compensation) with centered aspect-fit preview and metadata editor.
- **Indefinite Recoverable Trash**: Soft-delete catalog records without touching original files on disk; restore anytime or confirm permanent removal.

### 2. 💡 Lightbox (`Alt+2`)
*The primary photographic development and adjustment darkroom.*
- **Zero-Lag Viewport Transitions**: Instant thumbnail fast-path cache displays new photos immediately (0ms) while high-res 2048px renders enhance seamlessly in the background.
- **Global Tone & Exposure**: Exposure ($\pm 5\text{ EV}$), Contrast, Highlights, Shadows, Whites, and Blacks.
- **White Balance & Color**: Color Temperature, Tint, Vibrance, and Saturation.
- **Detail & Texture**: Unsharp masking, bilateral noise reduction, texture, high-pass clarity, and atmospheric dehaze.
- **Optics & Geometry**: Manual lens radial distortion correction, optical vignetting, transverse chromatic aberration, straighten, crop aspect constraints, and flips.
- **Local Adjustment Masks**: Paintable brush masks, linear gradients, radial gradients, luminance ranges, and color ranges combined via replace, add, subtract, or intersect operations.
  Color and luminance ranges can be seeded by sampling a pixel from the rendered image; Escape cancels sampling.
- **Spot Retouching**: Non-destructive healing and cloning with draggable source/target pins on canvas.
- **Presets & History**: Searchable 54 built-in presets, custom recipes, snapshot checkpoints, and per-asset undo/redo timeline scrubbing.

### 3. 🌈 Color Studio (`Alt+3`)
*Precision color grading and broadcast-grade scopes.*
- **3-Way Color Wheels**: Circular Lift (shadows), Gamma (midtones), Gain (highlights), and Offset controls with hue, saturation, and luminance adjustments.
- **Parametric Curves**: Master RGB curve plus independent Red, Green, and Blue tonal splines with curve anchor points.
- **HSL Channel Mixer**: 8 distinct color bands with dedicated Hue, Saturation, and Luminance offsets.
- **Real-Time Scopes**: RGB/luminance histogram, waveform, and vectorscope calculated from the rendered WebGL preview.

### 4. 🔀 Visual Flow (`Alt+4`)
*Interactive view of the browser processing pipeline.*
- **Live Output Preview**: View the current image and edits through the WebGL renderer.
- **Toggle Node Passes**: Bypass supported stages, including tone, color, HSL, curves, grading, detail, dehaze, geometry, vignette, and chroma key.
- **Fixed Processing Order**: Nodes represent the defined pipeline; arbitrary port rewiring is not supported.

### 5. 📦 Deliver (`Alt+5`)
*Batch export queue, watermarking, and production publishing.*
- **Multi-Format Encoders**: Export to JPEG, PNG, WebP, TIFF, BMP, GIF, and PPM with custom quality compression and embedded sRGB ICC color profiles.
- **Dynamic Naming Tokens**: Format filenames using `{name}`, `{date}`, `{camera}`, `{lens}`, `{iso}`, `{shutter}`, `{focal_length}`, and sequence counters.
- **Watermark Engine**: Apply text stamps or PNG graphic logos with adjustable opacity, scale, margin offsets, and 9 anchor positions.
- **Resilient Background Queue**: Queue multi-image jobs with real-time progress indicators; pause safely between photos, resume, or cancel without hanging.
- **Collision Protection**: Automatically refuses output collisions to prevent accidental source file overwrites.

---

## 🎨 Dynamic Personalization & Theming

KuroLight features a dynamic design system powered by CSS custom properties (`--obsidian-accent`):
* **Live Studio Swatches**: Instantly toggle between Sapphire Blue, Emerald Green, Amber Gold, Crimson Red, Amethyst Purple, and Silver.
* **Custom Hex Picker**: Choose any custom brand color in **Settings (`Ctrl+,`) → Appearance**; changes apply immediately without reloading.
* **Unified Iconography & Branding**:
  * Multi-resolution `.exe` & installer icon compiled from `assets/icons/KuroLight-combined_vertical.png`.
  * In-app window icon set to `assets/icons/logo.png`.
  * Watermark export logo set to `assets/icons/KuroLight-combined_vertical.png`.
* **Drag-Resizable Panels**: Interactive resize handles with double-click reset on AI Sidebar (300px–640px), Gallery Sidebar (180px–460px), and Metadata Inspector (220px–520px).

---

## 🧠 Kuro AI & Local Models

KuroLight blends cloud-based generative intelligence with 100% private, on-device neural processing:

```mermaid
flowchart TD
    subgraph Cloud["Kuro AI (Cloud Vision Assistant)"]
        A1[User Prompt + Photo Preview] --> A2{Consent Accepted?}
        A2 -- No --> A3[Block Request]
        A2 -- Yes --> A4[Provider: Gemini / OpenAI / Claude]
        A4 --> A5[Structured Candidate Proposal]
        A5 --> A6[Side-by-Side Review]
        A6 --> A7{Fingerprint Matches?}
        A7 -- Changed in Flight --> A8[Safely Reject Stale Edit]
        A7 -- Valid --> A9[Approve & Apply Non-Destructively]
    end

    subgraph Local["Local AI Enhancement (On-Device)"]
        B1[Real-ESRGAN x4 ONNX] --> B2[Explicit Download with SHA-256 Check]
        B2 --> B3[DirectML / CUDA GPU Acceleration]
        B3 --> B4{GPU Available?}
        B4 -- Error / No GPU --> B5[Automatic CPU Fallback]
        B4 -- Yes --> B6[Accelerated Tile Inference]
        B5 --> B7[Visually Lossless Output PSNR >= 42 dB]
        B6 --> B7
    end
```

### 1. Kuro AI Assistant (Cloud Vision)
- **Modern Minimalist UI**: Sleek pill-style auto-expanding textarea, circular action button, and suggestion chips.
- **Supported Providers**: Google Gemini (Gemini 2.5 Flash), OpenAI (GPT-4o / GPT-4o mini), Anthropic (Claude 3.7 Sonnet), Ollama (Local), and OpenRouter.
- **OS Keychain Security**: API keys are saved exclusively in the operating system credential store (Windows Credential Locker, macOS Keychain, Linux Secret Service).
- **Strict User Approval**: Kuro AI cannot apply edits directly. Every proposal must be approved after side-by-side visual review.

### 2. Local AI Super-Resolution (Real-ESRGAN x4)
- **100% On-Device & Offline**: Neural super-resolution runs entirely on your local hardware with zero network calls and zero telemetry.
- **Verified Download Integrity**: Verified against SHA-256 hash `fa18ce70de3a55f3149d0cc898d335d2d69fca29edc0692cb362c856b2942c3f`.
- **Hardware Acceleration with CPU Fallback**: Utilizes DirectML (DirectX 12) or CUDA when compatible hardware is present, with seamless fallback to CPU execution.

---

## 📐 Architecture & Technology Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DESKTOP SHELL (PySide6)                         │
├────────────────────────────────────────────────────────────────────────┤
│                       WEBVIEW UI (React 19 + TS)                       │
│  Gallery  │  Lightbox  │  Color Studio  │  Visual Flow  │  Deliver     │
├────────────────────────────────────────────────────────────────────────┤
│                     TYPED IPC BRIDGE (pywebview)                       │
│  Command Dispatcher  │  Event Streaming  │  Keyring Credential Manager │
├────────────────────────────────────────────────────────────────────────┤
│                     PYTHON COMPUTATIONAL CORE                          │
│  • SQLite Catalog Persistence & Migrations (WAL Mode)                  │
│  • LRU Working Buffer & Thumbnail Cache                                │
│  • 32-bit Float Python Processing & Full-Resolution Export             │
│  • ONNX Runtime DirectML / CUDA Inference Engine                       │
│  • Background ThreadPool Batch Export Manager                          │
└────────────────────────────────────────────────────────────────────────┘
```

The browser also runs the interactive WebGL preview and stores custom presets
and cached edit states in IndexedDB. Undo/redo stacks are session-local. The
native catalog is updated when the user explicitly saves an edit state.

---

## 📦 Packaging & Installer

KuroLight provides automated packaging tooling for producing standalone executables and Windows setup installers:

### 1. Build Executable (`build_exe.py`)
Generates standalone distributions using PyInstaller with stripped unused Qt modules, NumPy 2.x C-extension dynamic collection, and native file dialog hooks:
```bash
# Build both OneFile executable and OneFolder directory package
python scripts/build_exe.py

# Or target a specific packaging mode
python scripts/build_exe.py --mode onefile
python scripts/build_exe.py --mode onefolder
```
Outputs are organized into:
* `dist/onefile/KuroLight.exe` (Standalone portable single executable)
* `dist/onefolder/` (Fast startup unpacked directory distribution)

### 2. Compile Windows Installer (`build_installer.py`)
Generates a professional Inno Setup 7 installer (`KuroLight_Professional_Setup_v1.0.0.exe`) with LZMA2 ultra compression:
```bash
python scripts/build_installer.py
```
* Integrates desktop shortcuts, start menu entries, uninstaller, and `.kurolight` / `.klproj` file associations.

---

## ⌨️ Keyboard Shortcuts

All application hotkeys require modifier keys (`Ctrl`, `Shift`, or `Alt`) to prevent accidental photo edits while typing:

### Workspace Navigation
| Shortcut | Action |
|---|---|
| `Alt+1` | Open **Gallery** Workspace |
| `Alt+2` | Open **Lightbox** Workspace |
| `Alt+3` | Open **Color Studio** Workspace |
| `Alt+4` | Open **Visual Flow** Workspace |
| `Alt+5` | Open **Deliver** Workspace |
| `Ctrl+,` | Open **Settings** Modal |

### Library & Culling (Gallery)
| Shortcut | Action |
|---|---|
| `Ctrl+O` | Import images from disk |
| `Ctrl+Enter` | Open selected image in Lightbox |
| `Ctrl+A` | Select all visible images in grid |
| `Ctrl+Alt+1` … `Ctrl+Alt+5` | Set Star Rating (1 to 5 stars) |
| `Ctrl+Alt+0` | Clear Star Rating |
| `Ctrl+Alt+P` | Flag image as **Pick** |
| `Ctrl+Alt+U` | Set image as **Unflagged** |
| `Ctrl+Alt+X` | Flag image as **Reject** |
| `Ctrl+Shift+Backspace` | Move image to Recently Deleted Trash |

### Development & Viewport (Lightbox)
| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save current edit adjustments |
| `Ctrl+Z` | Undo last adjustment |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo adjustment |
| `Ctrl+K` | Toggle **Kuro AI** Assistant Panel |
| `Ctrl+Shift+C` | Toggle Crop Tool |
| `Ctrl+Shift+F` | Toggle Filmstrip |
| `Ctrl+Shift+P` | Toggle Right Adjustments Panel |
| `Ctrl+Shift+Escape` | Close active dialog or dismiss crop mode |

---

## 🚀 Quickstart

### Prerequisites
- **Python**: Version 3.10 or higher
- **Node.js**: Version 18 or higher (with npm)
- **Operating System**: Windows 10/11 (with Microsoft Edge WebView2), macOS 12+, or Linux (Ubuntu 22.04+, Fedora 38+)

### 1. Set Up Python Environment
```bash
# Clone the repository
git clone https://github.com/kuroLabs-ai/KuroLight.git
cd KuroLight

# Create and activate virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Install requirements
pip install -r requirements.txt
pip install -r requirements/testing.txt
pip install -e .
```

### 2. Build Frontend Assets
```bash
# Install npm dependencies and build production bundle
npm --prefix web install
npm --prefix web run build
```

### 3. Launch KuroLight
```bash
# Launch desktop application
python -m kurolight.run_gui

# Or via console entrypoint script
kurolight-gui
```

### 4. Development Mode (with Live Hot Reload)
```bash
# Terminal 1: Run Vite dev server
npm --prefix web run dev

# Terminal 2: Launch KuroLight in dev mode
python -m kurolight.run_gui --dev
```

---

## 🧪 Testing & Quality Assurance

KuroLight maintains an automated testing suite with **100% test pass status**:

```bash
# Run all 310 unit and integration tests
pytest

# Run tests with short progress summary
pytest -q
```

---

## 📚 Documentation Hub

Explore in-depth technical guides and specifications in the [`docs/`](docs/) directory:

| Document | Description |
|---|---|
| [**Architecture & Lifecycle**](docs/ARCHITECTURE_AND_LIFECYCLE.md) | Startup sequence, splash screen, Qt lifecycle, and PyBridge IPC. |
| [**Services & Methods Reference**](docs/SERVICES_AND_METHODS.md) | Exhaustive API specification for all backend services and bridge endpoints. |
| [**Image Processing Pipeline**](docs/IMAGE_PROCESSING_PIPELINE.md) | 32-bit float buffer, DAG node execution, color science, and sRGB ICC profiles. |
| [**Presets Reference Catalog**](docs/PRESETS_REFERENCE.md) | Complete guide to all 54 built-in photographic style presets and parameter schemas. |
| [**Kuro AI Assistant**](docs/AI_SYSTEM.md) | Dual-engine architecture, tool declarations, and human-in-the-loop review workflow. |
| [**Frontend & Workspaces**](docs/FRONTEND_AND_WORKSPACES.md) | UI components, dynamic accent theming, composition overlays, and shortcuts. |
| [**Developer & CLI Guide**](docs/DEVELOPER_AND_CLI_GUIDE.md) | Installation, CLI commands, SQLite WAL database architecture, and building. |
| [**Core Architecture Guide**](docs/KUROLIGHT_ARCHITECTURE_GUIDE.md) | Foundational architectural blueprint and engineering patterns. |
| [**Engineering Playbook**](docs/ENGINEERING_PLAYBOOK.md) | Development workflows, coding conventions, and verification standards. |
| [**Feature Parity Tracker**](docs/FEATURE_PARITY.md) | Roadmap capability map and implementation status matrix. |

---

<div align="center">

**KuroLight** — Built for thoughtful, deliberate photographic workflows.<br/>
Crafted by KuroLabs.

</div>
