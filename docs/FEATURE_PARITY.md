# KuroLight feature parity tracker

This is a KuroLight roadmap inspired by the workflow areas of mature photo-library and raw
development applications. It is a target checklist, not a claim that KuroLight currently matches
another product. Implement each area in KuroLight's architecture and with original code, UI, and
assets.

Status definitions are in [ENGINEERING_PLAYBOOK.md](./ENGINEERING_PLAYBOOK.md). Initial status is
based on the KuroLight README and a source-layout inspection. **Present** means a code foundation
was found, not that the workflow is complete. **Partial** means a known end-to-end gap remains.
**Needs audit** means feature behavior was not verified. Do not treat any of these statuses as
parity claims without feature-level evidence.

## Current KuroLight baseline

| Area | Current evidence | Status |
|---|---|---|
| Desktop shell | Python startup, PySide6 splash, pywebview UI | Present |
| Workspaces | Gallery, Lightbox, Color Studio, Visual Flow, Deliver | Needs audit |
| Import and catalog | File/folder import registers source paths; recursive folder imports skip duplicate paths, reject unreadable images, isolate and report per-file failures, preserve partial success, and cancel between files. Integration tests exercise nested on-disk directories. Drag-and-drop copies to the KuroLight Imports folder. SQLite records, edit snapshots, and per-asset chronological undo/redo history survive reopen; verified online backups are supported. Recently Deleted retains catalog records indefinitely until explicit restore or permanent deletion; source images and sidecars are never modified | Partial |
| Library organization | Search/sort/collections, ratings, flags, metadata inspector, compare/survey, recoverable trash | Partial: Gallery Compare and Survey support 2–4 loaded assets with shared zoom and per-photo culling. Multiple selected photos can also be opened together in the Lightbox filmstrip in Gallery sort order. Collections can be nested and smart collections dynamically combine text search, minimum rating, flag, and exact source-folder rules; deleting a parent moves its direct children to the root. Smart membership is catalog-driven and read-only. Recently Deleted supports restore and confirmed permanent catalog deletion, preserving edit state and collection links while trashed. Folder trees, synchronized pan, and higher-resolution compare previews remain unimplemented |
| Non-destructive edit model | Versioned Pydantic `EditState` with tone, WB, geometry, detail, HSL, grading, curves, masks and retouch spots | Present |
| Preview pipeline | Browser WebGL renders interactive edit state; Python retains the full-resolution processing/export path. The browser also caches edit state in IndexedDB; native Save/Ctrl+S persists it to the Python catalog and asset selection restores it | Partial: preview uses approximations for some detail and lens operations; preview/export equivalence remains a separate validation requirement |
| Color and tone tools | Browser controls cover tone, white balance, 8-band HSL, circular color wheels, master/channel curves, and LUTs. Histogram, waveform, and vectorscope derive from rendered preview pixels. Python processing uses float32 sRGB and exports embed canonical sRGB ICC profiles via ImageCms | Partial: color controls and rendered scopes are implemented, but browser/Python rendering is not guaranteed pixel-identical and real-photo coverage remains open |
| Crop and geometry | Crop, flips, rotation and straighten are processed; rotation expands the output bounds and is covered by dimension/edge-case tests. Manual radial distortion, chromatic-aberration and optical-vignetting corrections are persisted and processed; distortion is included in viewport overlay mapping. Lens profiles and perspective correction are not implemented | Partial |
| Masking and retouch | Linear/radial/brush/luminance-range/color-range masks, image sampling for color/luminance seeds, local adjustments, ordered combination, and draggable heal/clone pins are available in the browser editor | Partial: real-image sampling, transformed brush overlay, save/reopen, and preview/export parity still need broader validation |
| Presets and snapshots | 54 built-in presets are bundled with the web app; user presets are stored in browser IndexedDB. Named snapshots are part of the edit state, which can be cached locally and explicitly saved to the native catalog | Partial: browser user presets are not catalog-synchronized; cross-profile migration is not provided |
| Undo/redo | Browser edit changes are coalesced into per-asset undo/redo stacks (up to 100 undo entries); named snapshots are separate edit-state entries | Partial: current browser undo stacks are session-local; only explicitly saved edit state is persisted in the native catalog |
| Export | Multi-format settings, batch jobs, progress and pause/resume/cancel support | Partial |
| Kuro AI | Provider-backed analysis and proposed edits requiring approval; credentials use keyring | Present: explicit privacy-consent gating, provider error redaction, keyring credential storage, and stale proposal rejection tied to edit-state fingerprints are implemented and tested. Full disclosure, consent flow, and credential handling contract documented in AI_AUDIT_AND_SETTINGS_CONTRACT.md |
| Visual Flow | Fixed-order processing stages can be bypassed through `flow_nodes`; output is previewed with WebGL, including chroma-key alpha | Partial: arbitrary node rewiring is not supported; rendered behavior needs image-based validation |
| Automation | Typed pywebview bridge and Kuro AI function schemas; no shared discoverable app-command API confirmed | Partial |

“Present” means source for the named foundation exists; it does not assert feature parity, a
complete user flow, universal format support, or production quality for every edge case.

## Target capability map

| Capability | KuroLight target | Baseline / next evidence |
|---|---|---|
| Library browsing | Virtualized grid/table, filmstrip, folders, nested albums, smart collections, recently added/deleted, local-folder browsing | Startup and refreshes send at most 200 lightweight asset summaries; Gallery and Deliver use filtered SQLite pages, and the collection filmstrip pages on scroll. Search covers filenames, camera/lens, and catalog-only editable metadata. Gallery offers bounded, paged browsing of directories represented in the catalog and filters to the selected exact directory without filesystem writes. Manual and smart collections can be nested; smart rules dynamically combine text search, minimum rating, flag, and exact source folder using catalog data. Recently Deleted is indefinite, catalog-only, and supports restore or explicit permanent deletion without changing source files or sidecars. Grid/table rows are virtualized and thumbnails are lazy/batched (max 32). Folder-tree navigation remains absent; trash UI interaction coverage and scaling benchmarks remain open. See [LIBRARY_SCALING_AUDIT.md](LIBRARY_SCALING_AUDIT.md) |
| Culling | Compare and survey views, synchronized zoom, quick picks/rejects/ratings, configurable filters | Partial: Compare shows two selected loaded photos; Survey shows 2–4 together, with shared zoom and per-photo rating/pick/reject/unflag controls. It displays lazy cached thumbnails; synchronized pan and higher-resolution compare previews remain open |
| Metadata | EXIF/IPTC/XMP reading, editable metadata, sidecar interoperability and conflict policy | Limited EXIF snapshots plus catalog-only editable title, description, keywords, and copyright are supported; user fields remain separate from EXIF. XMP/IPTC and sidecar I/O are not implemented. Exports strip metadata and never modify source files; preservation requests fail explicitly. See [METADATA_POLICY.md](METADATA_POLICY.md); sidecar round trips remain open |
| Import | Recursive scan, duplicate handling, add/copy/move, organization/rename templates, cancellation and per-file outcomes | File/folder import exists; establish safe transaction and reporting semantics |
| Develop | Scene-aware tone and color, WB, profiles, curves, mixer, grading, B&W, texture/clarity/dehaze/grain/vignette, detail and noise reduction | Core settings/control areas exist; validate processing, ranges, color management, and UI mapping |
| Image enhancement | Non-destructive denoise, detail recovery, sharpening, and resolution upscaling, with local CPU and optional local AI choices | Local detail controls and tiled Real-ESRGAN x4 restoration use DirectML/CUDA GPU inference when the model and device are compatible, with CPU fallback; users explicitly download a SHA-256-verified model, choose 720p–4K targets, and keep image data local. A local paired-image evaluator reports PSNR/SSIM, Lanczos-baseline deltas, runtime, and device; licensed real-photo evaluation and visual review remain open |
| Crop and optics | Aspect constraints, straighten, overlays, lens distortion, vignetting, chromatic aberration, perspective geometry | Manual distortion, vignetting and chromatic-aberration controls are implemented and covered by synthetic tests; lens profiles and perspective correction still need implementation and real-photo validation |
| Local adjustments | Brush, linear/radial, luminance/color range, add/subtract/intersect, subject/sky/object selections | Brush and tonal/color range masks plus ordered replace/add/subtract/intersect composition are implemented and tested; broad undo/persistence coverage and subject/sky/object selection remain open |
| Retouch | Healing/clone/spot removal with editable pins and deterministic output | Heal/clone target/source pins can be selected and dragged on canvas; tests cover heal/clone output, source preservation, movement, and undo/redo |
| Presets and history | Save/import/manage presets, favorites, apply amount, versions, copy/paste/sync selected edit groups, full undo/redo | 54 built-in style recipes across 6 categories (Film, Portrait, Cinematic, Landscape, Urban, Monochrome) with live category filtering, search bar, and Applied feedback badges are implemented and tested; custom preset persistence and per-photo history reopen are verified |
| RAW and codecs | Broad camera RAW decode, embedded preview fallback, metadata/color profiles, tested per-format behavior | Optional rawpy/LibRaw handles a limited RAW extension allowlist; Pillow fallback attempts raster decoding but does not guarantee embedded JPEG extraction. Synthetic dispatch/fallback tests exist; camera-specific support and real fixtures are unverified. See [RAW_SUPPORT.md](RAW_SUPPORT.md) |
| Export | Batch output, naming, sizing, metadata policy, color profile/space, bit depth, sharpening, watermark, conflict policy | Seven 8-bit RGB encoders, orientation, sizing, naming, and watermark types/positions across aspect ratios are tested. Canonical sRGB ICC profile embedding is implemented and verified by test_export_embeds_srgb_icc_profile; batch cancellation/failures are covered; output publication refuses collisions and source overwrite. See [EXPORT_AUDIT.md](EXPORT_AUDIT.md) |
| AI | Optional models with consent/download lifecycle; explainable masks/tools; approval and stale-result checks | Scoped and tested: Real-ESRGAN x4 ONNX model licensing (BSD-3-Clause), opt-in consent, streaming SHA-256 download integrity, chunk cancellation, and offline behavior scoped in LOCAL_AI_MODEL_SCOPE.md and covered by tests |
| Print and presentation | Print layouts/PDF, contact sheets, templates, slideshow playback/export | Evaluated and tested: Print/PDF layouts (DPI-to-pixel math, aspect ratio fit/fill), contact sheets (auto-pagination, cell geometry, metadata captions), and slideshows (state machine, navigation, loop/timing) evaluated in PRINT_AND_PRESENTATION_EVALUATION.md and verified by 11 acceptance tests in test_print_slideshow_evaluation.py |
| Catalog durability | Atomic/journaled persistence, snapshots/compaction, recovery, migration tests, single-writer protection | SQLite schema/migrations exist; crash recovery, concurrency, and backup behavior need audit |
| Performance | Background decode/render/export, bounded caches, cancellation, measured large-library behavior | Startup asset summaries and Gallery/Deliver/filmstrip pages are bounded; thumbnail batches and cache are capped, and Gallery rows are virtualized. Explicit select-all/export requests still materialize matching IDs. Large-library performance is not benchmarked; add repeatable benchmarks |
| GPU | Optional accelerated render path with CPU fallback and documented numerical tolerance | Evaluated and tested: Hardware acceleration policy documented in GPU_ACCELERATION_POLICY.md. GPU considered only after benchmarks (scripts/benchmark_gpu.py), with guaranteed CPU fallback and strict output tolerance (PSNR >= 42 dB, SSIM >= 0.995, max delta <= 2/255) verified in test_gpu_benchmark_and_tolerance.py |
| Automation | Shared typed command registry; CLI; MCP tools/resources; optional live-UI control and screenshots | Bridge and AI tool schemas exist; command registry and transports are roadmap work |
| Platforms | Reliable Windows/macOS/Linux desktop behavior; optional browser deployment only if separately supported | Tested: Cross-platform compatibility runtime (PlatformCompatibility) and test suite in test_platform_compatibility.py verify path normalization, directory traversal safety, keyring diagnostics, and data directories across Windows, macOS, and Linux. Documented in PLATFORM_SUPPORT.md |
| Privacy | Local-first library; explicit disclosure and consent for remote AI; secure credential storage | Keyring and approval workflow exist; review logs, telemetry, cache, and exports |

## Implementation sequence

Keep each milestone narrow enough to review and test. Reorder based on user evidence, but do not
skip data integrity and rendering correctness to add surface features.

### 0. Establish the KuroLight baseline

- Maintain KuroLight docs focused on native architecture, verified tests, and product standards.
- Add measurable acceptance criteria to each parity row.
- Audit existing user flows and mark unsupported/unknown behavior accurately.
- Add representative, legally usable image fixtures and document their provenance.

### 1. Harden the library and edit persistence

- Define import behavior for duplicates, missing files, partial failures, copy/move, and cancellation.
- Test SQLite migrations, reopen behavior, consistency, and backup/recovery expectations.
- Ensure saved edit state, history, and previews remain associated with the right asset after restart.
- Add clear errors for a missing source or failed save.

### 2. Unify operations behind typed commands

- Define command IDs, typed schemas, preconditions, return values, and query/mutation behavior.
- Route existing bridge actions through services/commands while preserving current UI behavior.
- Reuse commands for keyboard shortcuts and Kuro AI tools where safe.
- Add command discovery and tests before introducing an external protocol.

### 3. Complete the photo-library workflow

- Add robust recursive import, duplicate policy, organized copy/move, and per-file results.
- Complete folder/album hierarchy, filters, search syntax, sorting, and large-library virtualization.
- Add culling/compare/survey behavior and metadata/XMP interoperability.

### 4. Verify and deepen image development

- Establish a color-management and precision contract for preview and export.
- Verify every control's schema, UI range, processing effect, persistence, undo, and reset behavior.
- Complete local mask interactions and ensure masks serialize and render consistently.
- Audit crop, geometry, lens correction, and retouching from UI through full-size export.

### 5. Expand supported inputs and deliverables

- Build a supported-format/camera matrix with fixtures and an explicit fallback policy.
- Add missing profile, metadata, output-size, bit-depth, watermark, and conflict-handling behavior.
- Consider contact sheets, print layouts, and slideshows after core image/catalog correctness.

### 6. Add external automation

- Add a CLI that invokes the same command layer.
- Add MCP or another protocol only after schemas and error semantics are stable.
- Make read/write hints, path effects, resource bounds, and connection retry behavior explicit.
- Test headless and connected-app operation separately.

### 7. Optimize with evidence

- Benchmark real decode, preview, export, catalog query, and memory use.
- Add GPU acceleration only with a tested CPU fallback and defined output tolerance.
- Scope local AI models by task, license, model distribution, privacy, and supported hardware.

## Definition of done for a feature

A feature moves to **Complete** only when:

- Its domain model and input validation are defined.
- The UI and processing/service path use the same semantics.
- Persistence/reopen behavior is covered when the feature has state.
- Undo/redo behavior is intentional and tested for mutations.
- Success, invalid input, cancellation, and failure outcomes are observable.
- Preview and full-resolution export agree within the feature's documented tolerance.
- Focused tests pass; related build/lint checks pass when applicable.
- User docs and this tracker describe the actual behavior and known limitations.

## Not included in this tracker

This document does not promise a full clone of another application's behavior, proprietary
profiles/models/assets, identical UI, universal camera compatibility, or a delivery date. Each
capability must be designed and implemented for KuroLight and verified against public formats,
original test data, and user needs.
