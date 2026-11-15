# Getting started

## Requirements

The supported desktop target is Windows 10 or later. Building and running from
source requires:

- Python 3.10 or later.
- Node.js 20 or later with npm for the React/Vite frontend.
- Microsoft Edge WebView2 Runtime for the pywebview desktop surface.
- Git to clone the repository.

The optional `raw` Python extra installs RAW decoding support where the current
Python/platform combination has a compatible `rawpy` wheel. RAW support can
vary by camera format and decoder availability.

## Install from source

Run these commands from the repository root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev,raw]"
npm.cmd --prefix web ci
npm.cmd --prefix web run build
```

If PowerShell script execution policy prevents activating the virtual
environment, use its interpreter directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[dev,raw]"
```

`npm.cmd` avoids PowerShell's `npm.ps1` execution-policy restriction.

## Launch

Start the desktop application after building `web/dist`:

```powershell
python -m kurolight.run_gui
```

The package entry point also launches the GUI:

```powershell
python -m kurolight
```

For frontend development, start Vite in one terminal:

```powershell
npm.cmd --prefix web run dev
```

Then launch the shell against the Vite server from another terminal:

```powershell
python -m kurolight.run_gui --dev
```

The development server uses the local Vite URL configured by `run_gui`.

## First use

1. Import a folder or select individual photos in Gallery.
2. Select one or more photos. Open the selection in Lightbox to edit and move
   between the selected assets in the filmstrip.
3. Use **Save** (`Ctrl+S`) to persist the current edit state to the active
   project catalog. Browser-cached edits are also used by the local workflow.
4. Configure an export batch in Deliver, choose an output folder, and start the
   job. Existing output files are not overwritten.
5. Configure a Kuro AI provider only if you intend to use cloud AI. Local AI
   restoration is a separate feature and requires an installed/downloaded model.

## Headless entry points

The package entry point provides diagnostic and command-discovery options:

```powershell
python -m kurolight --headless
python -m kurolight --list-commands
```

`python -m kurolight --help` lists the available command-line options. The
headless command initializes the configured project services; it is not a
separate image-editing GUI.
