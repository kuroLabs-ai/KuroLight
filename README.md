<div align="center">

<img src="assets/icons/KuroLight_combined_logo_horizontal.png" alt="KuroLight neon cat emblem" width="176" />

# KuroLight

### A photo studio built around your originals.

Import, organize, shape the light, explore color, and deliver finished images —
all from one focused desktop workspace.

<p>
  <a href="#explore-the-studio">Explore the studio</a> ·
  <a href="#your-workflow-from-first-import-to-final-image">See the workflow</a> ·
  <a href="docs/README.md">Open the documentation</a> ·
  <a href="#run-from-source">Run from source</a>
</p>

![Version](https://img.shields.io/badge/version-1.1.1-38bdf8?style=flat-square)
![Windows](https://img.shields.io/badge/desktop-Windows-2563eb?style=flat-square)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776ab?style=flat-square)
![React](https://img.shields.io/badge/React-19-149eca?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6?style=flat-square)

</div>

---

> **Your photographs stay yours.** KuroLight keeps original files untouched
> and stores your edits as a separate, reversible recipe.

KuroLight is a local-first desktop photo library and editing studio. A
responsive WebGL canvas makes editing feel immediate; a Python engine manages
your catalog, local AI restoration, and full-resolution exports.

## Explore the studio

| Workspace | Make it yours |
|---|---|
| **01 · Gallery** | Bring in folders or individual images. Search, rate, flag, create collections, select a set, and open it as a Lightbox filmstrip. |
| **02 · Lightbox** | Work directly on the image: light, color, curves, geometry, detail, local masks, retouching, and a before/after view. |
| **03 · Color Studio** | Shape the grade with color wheels, curves, HSL controls, histogram, waveform, and vectorscope. |
| **04 · Visual Flow** | See the supported processing stages and bypass stages while exploring a look. |
| **05 · Deliver** | Queue a batch, choose format and size, name the files, add a watermark, and track export progress. |

### The tools behind the look

- **Light & tone:** exposure, brightness, contrast, highlights, shadows,
  whites, and blacks.
- **Color:** temperature, tint, saturation, vibrance, 8-band HSL, RGB tone
  curves, 3-way color grading, and built-in or imported 3D LUTs.
- **Local control:** brush strokes, linear/radial gradients, sampled color and
  luminance masks, and non-destructive healing/cloning spots.
- **Composition & optics:** crop, rotate, straighten, flip, and manual lens
  adjustments.
- **Finish:** noise reduction, sharpening, clarity, texture, dehaze, and
  optional creative vignetting.
- **Personal touch:** built-in looks, your own presets, named snapshots,
  undo/redo, and editable keyboard shortcuts.

## Your workflow, from first import to final image

```text
Import a folder  →  Cull and group  →  Edit in Lightbox  →  Review  →  Deliver
```

1. **Bring photos into Gallery.** KuroLight catalogs the files in place; it
   does not need to rewrite or move your originals.
2. **Choose your set.** Rate and flag images, filter the library, then open
   multiple selections together in the Lightbox filmstrip.
3. **Build the image.** Adjust globally or locally. Save your edit state to
   the active project and revisit it later.
4. **Review the result.** Compare against the original, inspect scopes, or
   preview local AI restoration when a model is installed.
5. **Deliver a new file.** Export one or many images to a new destination.
   Existing files are protected from accidental overwrite.

## AI, with a clear boundary

**Local restoration** uses a locally installed Real-ESRGAN x4 Plus ONNX model.
The Lightbox shows progress and supports cancellation; compatible DirectML or
CUDA acceleration can be used, with CPU fallback.

**Kuro AI** is an optional provider-backed photo assistant. It can analyze the
current image and propose an edit recipe, but you review and approve the
proposal before it is applied. Provider requests can send your prompt and image
context to Google Gemini, OpenAI, or Anthropic. Credentials are stored through
the operating system's credential manager. Strict Offline mode blocks supported
network requests and external links.

## Made for a considered workflow

| Keep control | Stay organized | Know what to expect |
|---|---|---|
| Original photos are not edited in place. | Ratings, flags, collections, metadata, recoverable deletion, and catalog backups live with the project. | The browser preview and Python export are separate renderers. The result is designed to follow the same edit state, but small rendering differences are possible. |

**Color and export, honestly:** the current pipeline is sRGB. JPEG, PNG, TIFF,
and WebP receive an embedded sRGB profile. Metadata preservation, wide-gamut
export, monitor soft proofing, and gamut-warning overlays are not implemented.
See [current limitations](docs/SUPPORT_AND_LIMITATIONS.md) for the full list.

## Run from source

KuroLight's supported desktop target is **Windows 10 or later**. You'll need
Python 3.10+, Node.js 20+ with npm, and Microsoft Edge WebView2 Runtime.

```powershell
git clone https://github.com/kuroLabs-ai/KuroLight.git
Set-Location KuroLight

python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev,raw]"
npm.cmd --prefix web ci
npm.cmd --prefix web run build
python -m kurolight.run_gui
```

For frontend hot reload, run `npm.cmd --prefix web run dev` in one terminal
and `python -m kurolight.run_gui --dev` in another. See the
[getting-started guide](docs/GETTING_STARTED.md) for setup details and the
[user guide](docs/USER_GUIDE.md) for the full workflow.

## Building a Windows installer

Install the requirements in `requirements/build.txt`, Node.js/npm, and Inno
Setup 6 or 7. From the repository root:

```powershell
npm.cmd --prefix web ci
python scripts/build_installer.py --rebuild
```

The script packages the application, creates branded setup-wizard artwork from
the KuroLight logo, and writes the installer to
`dist/installer/KuroLight-Setup-v1.1.1-x64.exe`. The installer offers a
standard folder install and a single-file option. Read the
[Windows release guide](docs/WINDOWS_RELEASE.md) before distributing a build.

## Documentation

The [documentation hub](docs/README.md) contains a complete user, developer,
and release reference:

| Guide | What you'll find |
|---|---|
| [User guide](docs/USER_GUIDE.md) | How each workspace and its photo workflow works. |
| [Feature catalog](docs/FEATURE_CATALOG.md) | What is available in Gallery, editing, AI, and Deliver. |
| [Editing & export](docs/EDITING_AND_EXPORT.md) | Edit controls, processing stages, output formats, and constraints. |
| [Library & metadata](docs/LIBRARY_AND_METADATA.md) | Import, supported file types, catalog data, sidecars, and backups. |
| [AI & privacy](docs/AI_AND_PRIVACY.md) | Local restoration, provider requests, credentials, consent, and offline behavior. |
| [Settings & shortcuts](docs/SETTINGS_AND_SHORTCUTS.md) | User-facing settings and default key bindings. |
| [Configuration reference](docs/CONFIGURATION_REFERENCE.md) | Every stored preference and whether it currently affects behavior. |
| [Architecture](docs/ARCHITECTURE.md) | Startup, modules, bridge, rendering, and persistence boundaries. |
| [Data model](docs/DATA_MODEL.md) | Edit state, project database schema, and local storage. |
| [Bridge API](docs/API_REFERENCE.md) | Public Python/webview methods and events. |
| [Preset library](docs/PRESET_LIBRARY.md) | The built-in looks and how custom presets work. |
| [Development](docs/DEVELOPMENT.md) | Environment setup, tests, and engineering workflow. |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Startup, WebView2, model, import, and build issues. |
| [Windows release](docs/WINDOWS_RELEASE.md) | Installer prerequisites, outputs, and release checklist. |
| [Support & limitations](docs/SUPPORT_AND_LIMITATIONS.md) | Supported scope and known product boundaries. |

## Development checks

```powershell
python -m pytest
python -m ruff check src tests scripts
npm.cmd --prefix web run build
npm.cmd --prefix web run lint
```

<div align="center">

**KuroLight · A more thoughtful way to work with your photographs.**

Built by KuroLabs.

</div>
