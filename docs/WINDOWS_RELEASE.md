# Windows release packaging

## Build prerequisites

- Windows 10 or later, Python 3.10 or later, and Node.js 20 or later.
- Microsoft Edge WebView2 Runtime for the installed desktop application.
- Inno Setup 6 or 7 with `ISCC.exe` on `PATH` or in a standard installation
  directory checked by the build script.
- Repository build dependencies installed with:

  ```powershell
  python -m pip install -r requirements/build.txt
  npm.cmd --prefix web ci
  ```

## Build the installer

From the repository root:

```powershell
python scripts/build_installer.py --rebuild
```

The script:

1. Builds the production React bundle.
2. Runs PyInstaller in both single-file and one-folder modes.
3. Verifies the normalized executable paths exist.
4. Generates branded Inno Setup wizard bitmaps from the repository's KuroLight
   logo assets.
5. Invokes Inno Setup with the version read from `pyproject.toml`.
6. Verifies the expected installer exists.

Expected output:

```text
dist/installer/KuroLight-Setup-v1.0.0-x64.exe
```

Application artifacts are written under `dist/onefile/` and `dist/onefolder/`.
The generated wizard art is placed under `dist/installer-assets/`.

To compile only, first ensure both normalized executables exist, then run:

```powershell
python scripts/build_installer.py --skip-build
```

This mode does not rebuild or validate the React/Python source against those
existing artifacts; use it only when the binaries are known to match the
current source.

## Installer behavior

- The setup wizard offers a standard folder installation and a single-file
  executable option. The folder build is the recommended option for startup
  performance.
- The installer adds Start Menu shortcuts and offers a Desktop shortcut.
- Optional `.kurolight` and `.klproj` associations are registered for the
  current Windows user.
- Installation defaults to per-user privileges, with the Inno Setup elevation
  choice available.
- The uninstall entry includes the KuroLight application icon.
- Branded wizard art is generated at build time; it is not maintained as a
  separate opaque binary source asset.

## Release verification

Before distributing a build:

1. Run the Python tests, Ruff, frontend build, and frontend lint.
2. Build the installer from a clean checkout and confirm the version and
   expected output name.
3. Install and uninstall both installer modes in a clean Windows environment.
4. Verify startup with WebView2 present and verify the missing-runtime error is
   understandable when it is absent.
5. Exercise import, save/reopen, AI privacy controls, restoration progress,
   batch export, cancellation, project associations, and backup/restore.
6. Review third-party and AI model licensing and include required notices.

The repository does not currently configure Authenticode signing, automatic
updates, a WebView2 bootstrapper, or a release-notes generator. A successful
local installer build alone is not a substitute for signing and clean-machine
release testing.
