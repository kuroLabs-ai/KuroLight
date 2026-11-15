# Development

## Environment

Use the source setup in [Getting started](GETTING_STARTED.md). For a clean
Python development environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev,raw]"
npm.cmd --prefix web ci
```

## Run and debug

Build the frontend and launch the desktop shell:

```powershell
npm.cmd --prefix web run build
python -m kurolight.run_gui
```

For hot reload, run Vite with `npm.cmd --prefix web run dev`, then launch
`python -m kurolight.run_gui --dev`. The shell expects the local Vite server to
be available.

The engine can be initialized without the GUI:

```powershell
python -m kurolight --headless
python -m kurolight --list-commands
python -m kurolight --help
```

## Tests and checks

```powershell
python -m pytest
python -m ruff check src tests scripts
npm.cmd --prefix web run build
npm.cmd --prefix web run lint
```

Run a focused test while iterating, then run the full relevant checks before
merging. Tests use synthetic images and temporary project catalogs; do not
point destructive experiments at a user's real photo library.

## Change guidelines

- Preserve original source files and make edit-state changes non-destructive.
- Keep the WebGL preview and Python export contract aligned; test both sides
  when changing shared edit-state fields.
- Validate bridge input and report operational failures visibly.
- Update focused tests and the matching user/developer documentation.
- Avoid claiming support for settings that do not alter application behavior.
- Keep build artifacts, caches, credentials, downloaded models, and user
  catalogs out of source control.

## Packaging dependencies

The production build requirements are in `requirements/build.txt`.
`requirements/testing.txt` contains test and lint tools. Inno Setup is an
external Windows tool and is not installed by pip.
