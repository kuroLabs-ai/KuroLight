# Support and limitations

## Platform

Windows 10 or later is the supported desktop target. It uses the pywebview
Edge/WebView2 backend and the Windows packaging path described in
[Windows release packaging](WINDOWS_RELEASE.md). Other desktop operating
systems may work with compatible dependencies, but are not currently covered
by the installer or release verification described here.

## Image formats

Import extensions and RAW decoder requirements are listed in
[Library and project data](LIBRARY_AND_METADATA.md). File extensions indicate
that a format is accepted for import; they do not guarantee that every codec,
camera variant, or damaged file can be decoded.

## Known product constraints

- WebGL preview and Python full-resolution export are separate renderers and
  may differ slightly.
- The active color pipeline is sRGB. Monitor ICC selection, soft proofing,
  gamut-warning overlays, and wide-gamut export are not implemented.
- Export strips metadata; preserving embedded metadata is not supported.
- JPEG, PNG, TIFF, and WebP receive an embedded sRGB profile. Other output
  formats do not receive the profile through the current encoder path.
- RAW preview priority is not an active configurable feature.
- Visual Flow is a fixed supported-stage bypass UI, not an arbitrary node
  graph editor.
- Local AI output may synthesize detail. Always inspect the image and compare
  the final export.
- Cloud AI may transmit the submitted prompt and image context to the selected
  provider. Strict Offline and the user consent flow are important safeguards.
- Project backups do not include original source files.
- The Windows installer is not currently Authenticode-signed and does not
  install WebView2 or update the application automatically.

Treat these as current product boundaries, not promises about planned
functionality. Update this document when a limitation has been verified as
implemented and tested.
