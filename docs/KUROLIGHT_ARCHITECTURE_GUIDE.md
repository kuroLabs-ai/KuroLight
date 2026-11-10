# KuroLight Core Architecture & Engineering Guide

This guide provides the complete architectural blueprint, workflow model, and image-editing
engineering specifications for KuroLight's Python, React, and pywebview desktop stack.
It defines the core principles, data structures, and implementation standards of the platform.

## How to read this guide

- **Reference behavior** describes the feature and engineering pattern documented by KuroLight.
- **KuroLight evidence** describes the current implementation found in KuroLight source. An
  existing model, module, or UI label alone does not prove a complete user workflow.
- **KuroLight direction** is the recommended translation to the current stack.
- **Status** must be updated only after the end-to-end acceptance checks in
  [ENGINEERING_PLAYBOOK.md](./ENGINEERING_PLAYBOOK.md) pass.

KuroLight's feature matrix is comprehensive (library, editing, import, export, metadata, automation,
and desktop interactions), but its own documentation also marks many areas partial or incomplete.
Do not treat a README feature list or an aggregate percentage as evidence that every workflow is
finished. The reference docs have some stale or conflicting headline figures; detailed behavior,
limitations, and evidence are more useful than summary percentages.

## Architectural Principles & Core Stack

KuroLight's engineering model is built on clean separation of concerns:

- **Presentation**: React 19 + TypeScript desktop UI hosted in Microsoft Edge WebView2.
- **IPC Boundary**: Strongly typed in-process JSON bridge (`window.pywebview.api` <-> `PyBridge`).
- **Application Services**: Domain controllers coordinating database transactions and processing.
- **Data Engine**: SQLite with Write-Ahead Logging (WAL) and thread-local connections.
- **Processing DAG**: 32-bit floating-point non-destructive image pipeline.

## The engineering model

KuroLight uses a unified single behavior model shared by the UI and automation:

```text
React intent
    ↓
typed pywebview bridge
    ↓
validated application command
    ↓
service + domain rules
    ├── SQLite/catalog and edit history
    └── processing pipeline → preview/export
```

Translate it without importing the Rust crate structure:

| Architectural Concept | KuroLight Implementation |
|---|---|
| Workspace layers/crates | Keep KuroLight's `domain/`, `processing/`, `services/`, `app/`, `infrastructure/`, `ui/` boundaries. |
| Shared engine command registry | Add a typed command/service boundary incrementally; route existing bridge actions through it instead of rewriting the app. |
| Versioned develop settings | Evolve the Pydantic `EditState` with explicit schema migrations and, when rendering semantics change, a distinct render/process version. |
| CPU reference renderer + GPU twin | Keep the NumPy/OpenCV implementation as the correctness reference. Add acceleration only with output tolerances and fallback tests. |
| Catalog journal/snapshot and library lock | Use SQLite transactions and migrations, with explicit backup/recovery and single-writer policy where needed; do not copy the journal format just for parity. |
| Activity stack | Extend the existing background-job/export patterns into a common progress, cancellation, and result reporting model. |
| UI, CLI, MCP, control channel over commands | First unify services and bridge actions; add CLI or MCP only after command schemas and failure semantics are stable. |
| Parity rows tied to command/control evidence | Keep each KuroLight feature row linked to tests, service/API IDs, and known limitations. |

### Non-destructive edits and render versions

An edit should be data, not a destructive pixel mutation. Preserve the source, persist settings,
render previews from those settings, and export through the same processing semantics. Changes to
the algorithm that alter the look of old edits should not silently reinterpret saved work. Add a
render/process version and migration/update path, or explicitly establish that a change is a bug fix
whose old output was incorrect. Test both old and new states.

Undo should represent user-visible operations. Coalesce slider drags into one useful history
entry; do not create an undo step for every pointer event. Mutations to library data (ratings,
metadata, imports, presets) also need deliberate undo/recovery behavior, not just edit sliders.

### Command behavior and automation

The target command description should carry a stable ID, typed input, validation, preconditions,
read-vs-mutation classification, result/error shape, and undo/history semantics. UI controls,
shortcuts, Kuro AI tools, and future CLI/MCP calls should use one implementation.

Never equate Kuro AI function-calling with an MCP server. Before exposing commands externally:

1. Make schemas strict and discoverable; reject malformed/unknown inputs explicitly.
2. Make selection defaults visible and safe. A destructive command should not accidentally target
   the current selection because a caller omitted an ID.
3. Distinguish a definite refusal from an unknown outcome after a lost connection. Do not retry
   uncertain writes automatically.
4. Bound payload size, concurrency, execution time, and file operations. A loopback-only listener
   still needs safety controls; loopback is not authentication.
5. Test file overwrite/rename behavior and prevent exports from replacing source originals or
   sidecars unintentionally.

## KuroLight baseline: important verified gaps

These are architectural findings, not feature parity scores:

| Area | Current evidence | Consequence |
|---|---|---|
| Develop graph | `processing/pipeline.py` builds global tone, color, HSL, curves, grading, detail, dehaze, vignette, geometry, and chroma-key stages. | Keep this graph as the shared preview/export foundation and ensure every new operation joins it with explicit cache dependencies. |
| Masks | Linear/radial masks are applied in the shared processing graph and can be selected and positioned/resized with on-image handles; the editor maps handle coordinates through crop, flips, rotation, zoom, and pan. | Keep masking Partial until transformed-coordinate interaction tests and preview/export alignment are verified; brush painting, range masks, and mask combinations remain open. |
| Retouch | Heal/clone spots now enter the render graph and have Lightbox controls for normalized source/target positions, radius, feather, and opacity. | Direct canvas pins, placement ergonomics, and broader quality/edge-case validation remain open. |
| Color scopes | Backend calculators exist for histogram, waveform, and vectorscope. The reviewed UI synthesizes waveform/vectorscope displays from histogram bins, and bridge delivery was not found to use the real calculators. | Wire real scope matrices from the rendered buffer and compare UI output to direct calculator tests. |
| Auto tone | The bridge now analyzes the cached source buffer with `AutoToneAnalyzer` and applies its measured tone/white-balance proposal. | Validate with diverse real scenes and make the proposed values inspectable before applying if the workflow requires a review step. |
| RAW | RAW decoding is optional (`rawpy` path) and may fall back to Pillow/raster decoding. | Do not promise native sensor decode, camera coverage, or RAW parity. Report unsupported/failed RAW decoding clearly rather than disguising it as a valid raster result. |
| Application commands | `CommandDispatcher` is edit-history/undo focused, not a discoverable registry of all app operations. Bridge methods and AI tool schemas are separate surfaces. | Introduce a shared command/service layer incrementally; do not replace the current bridge wholesale. |
| Processing precision | The current decode path creates float32 image buffers from 8-bit raster reads. | Specify color space, transfer function, bit depth, clipping/headroom, and precision before claiming HDR or color-managed RAW behavior. |

Recheck these findings against the current source/tests before implementation; code may have changed
since this audit. Relevant KuroLight paths include `../src/kurolight/processing/pipeline.py`,
`masking.py`, `color/scopes.py`, `analysis/auto_tone.py`, `raw/decoder.py`,
`../src/kurolight/ui/web_bridge.py`, and `../src/kurolight/app/command_dispatcher.py`.

## Feature-by-feature translation

### 1. Library, import, and culling

**Reference behavior:** A photo workspace is more than a folder picker. KuroLight specifies
recursive scanning and review, duplicate handling, add/copy/move import modes, metadata/sidecars,
albums/folders/stacks, smart filters, ratings/flags/labels, compare/survey, synchronized zoom,
selection-aware commands, and background tasks with per-file outcomes.

**KuroLight direction:**

- Keep asset/catalog state in the database and library services, never in React-only state.
- Represent a scan result separately from committed import. The review should show supported,
  skipped, duplicate, and unreadable files before applying copy/move operations.
- Define duplicate identity (canonical path, file identity, and/or content hash) and make the
  selected policy explicit. Do not silently overwrite.
- Return per-file outcomes for partial batches. Cancellation must leave completed transfers
  accounted for and the catalog consistent.
- Nested manual albums and dynamic smart collections are implemented as catalog-only capabilities;
  smart rules combine existing Gallery filters, and deleting a parent promotes its direct children.
  Source-folder browsing uses cataloged paths without filesystem writes. Recently Deleted is also
  catalog-only: records persist indefinitely until explicit restore or permanent deletion, and
  source images and sidecars are never moved, changed, or removed. Folder-tree navigation, browser
  interaction coverage for trash, and large-library acceptance thresholds remain separate work.
- Build compare/survey from stable selection IDs and synchronized view state, not ad hoc image
  component state.
- The current Gallery compare/survey view is an initial partial implementation: Compare shows two
  selected, loaded assets; Survey shows two to four. Both use cached thumbnails, shared zoom, and
  per-photo rating/flag controls. Synchronized pan and high-resolution compare previews remain open.

****Acceptance:** import a mixed folder with duplicates, unsupported files, unreadable items, and
sidecars; verify the review counts, copy/move results, restart persistence, cancellation, and
undo/recovery. For compare/survey, verify two-photo comparison, 2–4-photo survey, shared zoom,
per-photo culling, and return-to-Gallery flow. Add synchronized pan and high-resolution previews as
separate follow-up acceptance tests.

### 2. Light, exposure, and tone

**Reference behavior:** Exposure, highlights, shadows, whites, blacks, contrast, tone curves,
clipping indicators, and HDR-related controls are distinct tools. KuroLight specifies measured
control calibration and render-process versions because changing slider response alters saved
looks.

**KuroLight direction:**

- Keep each control in typed `EditState`, with range/default/step and semantics defined once.
- Specify whether operations run in linear-light or display-referred values and define clipping,
highlight roll-off, and numerical precision.
- Use the same processing implementation and settings for preview and export. A UI slider that
does not affect rendered pixels is not an implemented control.
- Auto Tone now uses image analysis; improve its reviewability and validate it against representative scenes.
- Validate exposure by stop increments on synthetic ramps and highlight/shadow gradients. Test
neutral input remains neutral and detect channel clipping, not only luminance clipping.
- Treat true HDR as a project-wide precision/display/export feature, not just additional slider
values. Document SDR monitor behavior and output formats before adding HDR claims.

**Acceptance:** for every tone slider, test zero identity, positive/negative direction, bounds,
finite output, persisted settings, undo/redo, and preview/export agreement. Record tolerance and
fixtures. Changes that alter old output require a version/migration decision.

### 3. Histograms, waveform, and vectorscope

These are different measurements and must not be approximated by drawing one plot in the shape
of another:

- **Histogram:** distribution of pixel values by channel and/or luminance; clipping indicators
  should reflect actual samples at the ends.
- **Waveform:** luminance or RGB value plotted against horizontal image position, with density
  showing how many pixels occupy each level.
- **Vectorscope:** chroma distribution in a color-difference plane, with defined matrix/primaries
  and neutral center.
- **RGB parade** (if added): separate channel waveforms, not three recolored histogram curves.

KuroLight's `color/scopes.py` has implementations, but current UI wiring is not evidence that the
calculators feed the corresponding displays. Send a well-defined scope payload from the processed
preview (include dimensions, color-space, and sampling details). Compute scopes on the image state
the UI claims to inspect; indicate whether it is before/after edits. Use bounded sampling for
interactive performance and clearly identify approximated/downsampled displays.

**Acceptance:** deterministic synthetic black/white ramps, grayscale gradients, pure primaries,
and a single vertical color edge should produce predictable scope locations. Confirm all scope
views update when edits change and never render from stale histogram data.

### 4. Color and look development

Implement and validate these as separate, composable operations:

- White balance (temperature/tint), with a defined unit and neutral reference.
- Tone curve (points/spline, endpoint constraints, and reset semantics).
- HSL mixer and targeted color selection.
- Color grading across shadows/midtones/highlights with balance/blending behavior.
- Point-color sampling and local hue/saturation/luminance adjustments.
- Black-and-white conversion and channel mix.
- Profiles/LUTs with declared color-space, size/interpolation, and license/provenance.
- Calibration/primaries only after a color-management contract is established.

Do not use slider presence as evidence of correct color. Test hue wraparound, neutral grays,
out-of-gamut handling, LUT identity, and the order in which transforms are applied. Keep profile
and camera calibration status separate: a creative look is not a camera input profile.

### 5. Local adjustments and masks (priority)

**Reference mask concepts:** Brush, linear and radial gradients; luminance/color range selection;
mask combination (add, subtract, intersect); inversion; feather/edge refinement; local light/color
settings; optional semantic object/describe selection. A selection is data that can be inspected,
combined, persisted, and rendered later; an AI model is not required to render a saved mask.

**KuroLight implementation plan:**

1. Define a typed, versioned mask model: stable ID, type, normalized geometry/strokes, opacity,
   invert, feather/edge controls, combination operators, enabled state, and local adjustment
   settings. Validate all coordinates and resource bounds.
2. Specify combination semantics mathematically and test the first component as well as every
   later component. Do not leave `intersect` behavior ambiguous when no prior mask exists.
3. Integrate masks into the render graph. Make mask generation depend on source dimensions and
   transform state; make adjustment layers depend on mask and edit settings. Apply geometry/crop
   consistently so masks align in preview and export.
4. Continue mask visualization/direct editing in the React editor. Linear/radial handles are
   implemented; add transformed-coordinate interaction tests and confirm coordinate mapping under
   zoom, crop, orientation, and preview/export dimensions.
5. Add mask creation, rename, duplicate, reorder, disable, invert, combine, and delete operations
   with one sensible undo step each. Save and reload masks with the photo's edit state.
6. First deliver reliable brush/linear/radial masks. Then luminance/color range masks. Add semantic
   selection only after model distribution, licensing, privacy, cancellation, and no-model fallback
   are specified.
7. If a local segmentation model is used, make it optional and consent-based; download to a
   temporary file, verify size/hash, and atomically promote it. Store the resulting mask so
   existing edits render offline without re-running inference.
8. Test preview and full-resolution export on high-contrast subject edges. A coarse AI mask should
   not create bright/dark halos; edge refinement must follow image detail consistently at each
   resolution.

**Current implementation after the integration slices:** linear/radial masks and heal/clone spots
enter the processing graph before geometry, and the Lightbox panel exposes their settings. Masks
can be created, selected, renamed, toggled, inverted, tuned, and deleted; linear endpoints/axis
and radial center/ellipse handles can also be dragged on the image. Selection is shared between
the canvas and panel. Spot retouch exposes normalized source/target coordinates and its
radius/feather/opacity, but does not yet have on-image pins. Brush painting, color/luminance
ranges, and mask combinations are also open. Keep the tracker at Partial until direct interaction
has feature-level coverage and preview/export alignment is verified.

### 6. Retouch and red-eye

Define spot/heal/clone operations as stable edit data: source/target geometry, radius, feather,
blend/opacity, and ordering. Use a deterministic sampler with explicit edge handling. Keep
retouch edits separate from global color stages where practical, and decide whether spots transform
with crop/rotation.

Test a spot on a synthetic pattern (including image edges), serialize/reload, move/resize it, undo
it, and compare preview/full-resolution output. Do not report retouch support from a data model or
standalone engine before the bridge, editor interaction, persistence, and output all work.

### 7. Geometry and optics

Translate crop/aspect, rotation, flip, straighten, perspective transform, lens distortion,
vignetting, and chromatic aberration into explicit geometry/optics settings. Define transform
ordering, coordinate mapping for masks/retouch, output dimensions, interpolation, and transparent
border policy. Lens profiles need provenance and camera/lens matching; never imply universal
coverage.

Acceptance should include identity transforms, right-angle rotation, crop boundaries, perspective
fixtures, output-size checks, and alignment of masks/retouch after transform.

### 8. Detail, noise reduction, and dehaze

Separate sharpening, texture/clarity, luminance noise reduction, chroma noise reduction, and
dehaze. Document whether detail processing occurs before or after resize, and whether values are
pixel-scale or image-scale. If adding a learned denoiser, distinguish model inference from
traditional filters, disclose model/license/compute requirements, and retain a CPU/reference path.

Measure quality on legally usable fixtures and synthetic noise levels using both fidelity metrics
and visual crops. A higher PSNR alone can mean oversmoothing. Test tile seams, edges, cache
invalidation, cancellation, and CPU/GPU agreement before enabling acceleration by default.

### 9. Presets, history, and synchronization

Presets should encode only chosen settings and declare what they modify. Applying a preset should
be an undoable transaction, and bulk sync should report the target count/results. Keep versions
(named alternate edit states) distinct from chronological history (operations). Copy/paste must
allow selecting setting groups and must not copy identity-specific state accidentally (e.g. crop
or masks unless selected).

Test import/export of preset data, schema evolution, applying to multiple photos, undo, and
partial failures. For edit schema changes, preserve old saved data through explicit migration.

### 10. RAW, metadata, and sidecars

Build a maintained format/camera matrix rather than claiming broad RAW support from extensions.
Distinguish sensor decode, embedded-preview fallback, metadata-only support, and unsupported
variants. Make decoder errors visible and preserve the original source.

KuroLight supports catalog-only edits for title, description, keywords, and copyright; these stay
separate from extracted EXIF. XMP/IPTC and sidecar interoperability are not implemented, and
exports strip metadata without modifying originals or sidecars. Any future sidecar write path needs
explicit field ownership and precedence, atomic saves, conflict behavior, and preservation of
unknown third-party fields. Check licenses and fixture provenance for RAW samples and profiles.

### 11. Export and long-running work

Use the same processing semantics as preview, then make export settings explicit: format, bit
depth, color space/profile, dimensions, metadata policy, naming, sharpening, watermark, conflict
policy, and destination. Return per-file outcomes for batch export; a failed item must not be
counted as successful.

Background tasks should expose stable kind, label, progress (including unknown totals), detail,
cancellability, and final result. Keep jobs off the UI thread, retain partial results accurately,
and ensure cancel/quitting behavior is deliberate. Do not build a second progress UI for each
feature.

### 12. AI, privacy, and semantic tools

Kuro AI currently uses provider-backed requests and approval for proposed edits. Preserve that
approval boundary. Remote analysis sends the selected image/preview and prompt to the configured
provider; state this at the point of use. Keep credentials in the OS credential store.

If adding local AI segmentation or enhancement, provide model status/download/cancel, license and
storage details, checksum verification, resource bounds, error reporting, and deterministic offline
rendering of already-computed results. AI must not silently change a photo while the user is
reviewing a proposal or after the underlying photo/edit state has changed.

### 13. Performance, GPU, and platform quality

Prioritize bounded memory, staged previews, cache keys, background decode/render, cancellation,
and measured large-library behavior. Establish benchmarks for decode, preview, full export, scopes,
mask generation, and catalog operations. Test on representative Windows hardware, not just
developer machines.

GPU acceleration is optional, not a prerequisite for correct behavior. Keep the CPU result as the
oracle, define numerical tolerances per operation, and fall back explicitly if device setup or
verification fails. Do not add a GPU path without tests for stage parity, cache invalidation, and
failure recovery.

Desktop/WebView behavior, keyboard focus, file dialogs, drag-and-drop, high-DPI coordinates, and
screen-reader access need their own checks. A successful headless snapshot does not prove native
input, accessibility, or platform menu behavior.

### 14. Location, print, presentation, and video

These are separate product workflows, not side effects of having export:

- **Location:** parse/store GPS and capture time, show a map only with a deliberate map-provider
  and offline/privacy decision, and allow location edits only with an explicit persistence policy.
- **Print/contact sheets:** define page sizes, layout units, resolution, color handling, captions,
  and PDF/printer output. Test generated pages, not only the dialog.
- **Slideshow:** define playback/navigation and whether export to video is supported. Long
  rendering jobs should use the shared activity/progress model.
- **Video:** Video workflows are outside KuroLight's still-photography scope. Treat
  video as a separate scope decision for KuroLight; do not imply still-image parity includes video
  import or editing.

Defer these until the core catalog, develop, and export behavior is reliable. Add each only with
its own model, user flow, privacy/output rules, and acceptance tests.

## Recommended implementation order

### Phase 1 — Prove current behavior

- Re-audit current code and use the shared status vocabulary: **Complete**, **Present**,
  **Partial**, **Needs audit**, **Planned**, or **Not in scope**.
- Add acceptance checks to each tracker row and a small, legally usable image fixture set.
- Establish baseline render outputs, color/precision assumptions, and current test commands.

### Phase 2 — Correctness foundations

- Ensure one settings model flows through UI, bridge, persistence, preview, undo, and export.
- Add direct retouch pins, brush painting, and mask combinations; verify mask handle coordinate
  mapping and preview/export alignment with feature-level tests.
- Wire real histogram/waveform/vectorscope data; Auto Tone is now connected but still needs scene-quality validation.
- Define failure reporting for RAW decode, import, and export.

### Phase 3 — Library durability and commands

- Harden import/duplicate/cancellation/per-file reporting and SQLite transaction/reopen behavior.
- Incrementally route bridge operations through a typed discoverable application command layer.
- Add structured activity reporting for import, render, and export.

### Phase 4 — Expand editing breadth

- Finish culling, then add explicit metadata/XMP and sidecar interoperability workflows.
- Add refined masks, retouch, optics, presets/sync, format coverage, export controls, and local AI
  only with feature-specific quality tests.
- Introduce render process versions for intentional changes to existing edit appearance.

### Phase 5 — Automation and optimization

- Add a CLI over stable commands before MCP or a live control protocol.
- Define safety, read/write hints, user confirmation, and unknown-outcome behavior.
- Benchmark first; add acceleration only with a tested CPU fallback.

Do not skip persistence, rendering correctness, and error semantics to add surface-level controls.

## Feature acceptance template

For each KuroLight feature, record:

1. User-visible behavior and exact supported inputs.
2. Domain model/control schema and validation.
3. Owning service/command and bridge/UI route.
4. Processing order and cache dependencies (for image operations).
5. Persistence/migration and undo semantics.
6. Failure, cancellation, and partial-result behavior.
7. Focused test(s), fixture provenance, and measurable expected output.
8. Preview-versus-export tolerance and performance/memory limits.
9. Unsupported formats/platforms and known limitations.
10. Tracker status and links to the evidence.

## Implementation & Status Discipline

Every feature implementation must satisfy KuroLight's quality gates:

1. End-to-end acceptance tests verifying numerical precision and visual accuracy.
2. Non-destructive edit state persistence with forward-compatible migrations.
3. Zero UI freezing through worker threads and debounced preview rendering.
4. Graceful error reporting and comprehensive cancellation support.

Refer to [ENGINEERING_PLAYBOOK.md](./ENGINEERING_PLAYBOOK.md) for day-to-day practices and
[FEATURE_PARITY.md](./FEATURE_PARITY.md) for current implementation verification status.
