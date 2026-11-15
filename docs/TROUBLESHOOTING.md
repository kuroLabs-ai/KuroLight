# Troubleshooting

## The desktop window does not open

- Confirm Microsoft Edge WebView2 Runtime is installed.
- If startup reports that `web/dist/index.html` is missing, build the
  frontend with `npm.cmd --prefix web run build`.
- For development mode, start `npm.cmd --prefix web run dev` first, then run
  `python -m kurolight.run_gui --dev`.
- Check the application log in the OS-specific KuroLight log/config location
  and preserve the error text when reporting a bug.

## PowerShell blocks npm

Use the Windows command shim:

```powershell
npm.cmd --prefix web ci
npm.cmd --prefix web run build
```

This avoids loading `npm.ps1` under a restrictive PowerShell execution policy.

## A photo cannot be previewed or exported

- Confirm the source path still exists and is readable.
- Check the extension against [supported import types](LIBRARY_AND_METADATA.md).
- RAW support requires a working decoder and varies by camera/file. Installing
  the optional `raw` extra may help when a compatible wheel is available.
- A file with an accepted extension can still be malformed, unsupported by
  the decoder, or truncated.

## Preview and export look slightly different

The browser WebGL renderer and Python export processor are different
implementations. Compare the final export in an image viewer and report a
reproducible sample, edit settings, and output format. The original source
should remain unchanged.

## Local AI restoration is unavailable

- Confirm the Real-ESRGAN x4 Plus model is installed in Settings → Offline AI
  Models or the Lightbox Detail panel.
- Model download requires network access and is blocked by Strict Offline.
- Check disk space and model integrity; the application verifies the expected
  SHA-256 before inference.
- Try Auto or CPU if a selected GPU execution provider is unavailable.
- A canceled preview does not apply the output to the edit state.

## Kuro AI cannot connect

- Confirm a provider is selected, its API key is stored, and the account/model
  is allowed to use vision requests.
- Review the privacy disclosure and image-context preference.
- Strict Offline intentionally blocks model discovery and provider requests.
- Provider responses depend on provider availability and may be rejected if
  they do not return the required JSON edit proposal.

## Exports fail

- Choose a writable output directory and ensure the output path does not
  already exist.
- Current export color space is sRGB and metadata must be stripped.
- If a custom LUT is active, make sure it remains available in browser storage.
- Check job error details for decode, encoder, disk, or cancellation failures.

## Installer build fails

- Install build dependencies with `python -m pip install -r
  requirements/build.txt`.
- Install Node.js/npm and Inno Setup 6 or 7.
- Run from the repository root and use `python
  scripts/build_installer.py --rebuild`.
- The builder verifies the one-file and one-folder executables. If using
  `--skip-build`, both matching artifacts must already exist under `dist/`.
- The installed app requires WebView2; the installer does not install it.

See [Windows release packaging](WINDOWS_RELEASE.md) for clean-machine checks.
