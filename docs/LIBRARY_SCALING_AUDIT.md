# Library scale and recovery audit

This audit describes the current implementation; it does not claim measured large-catalog
performance.

## Current behavior and evidence

- **Startup and refresh payloads are bounded.** `PyBridge._push_assets` reads and emits at most
  200 lightweight asset summaries, and emits the separate total count. Initial selection loads its
  selected asset directly rather than reading the complete catalog. Collection startup events carry
  names and counts, not every collection's membership IDs. Gallery and Deliver request bounded
  pages; the filmstrip loads collection pages as the user scrolls. Select-all and batch export fetch
  matching IDs without loading all asset objects. These changes bound startup asset-object and event
  payloads; operations that explicitly request all matching IDs still use O(N) ID memory, and other
  service utilities such as `LibraryService.filter_assets` remain full-catalog operations.
- **Thumbnails remain lazy.** Gallery, table, inspector, filmstrip, Visual Flow, and Deliver request
  thumbnails only when their thumbnail view approaches the viewport; requests are coalesced into
  batches of at most 32, and the frontend thumbnail URL cache is capped at 128 entries. Thumbnail
  cache misses still serialize on the bridge.
- **Gallery page requests are filtered and served from SQLite.** The repository and bridge support
  pages up to 200 assets, count matching results, and apply collection, minimum-rating, flag,
  filename/camera/lens search, and sort filters before slicing. Native Gallery requests use this
  path. Database and in-memory sort order use matching deterministic tie-breaks so
  Shift-range selection follows the displayed ordering; search wildcard characters are escaped.
- **Gallery pages and DOM work are bounded.** Native Gallery filters and sorts in SQLite, loads an
  initial batch of 200, and adds pages only when requested; standalone browser mode filters its
  in-memory assets. Grid and table virtualize mounted rows with viewport-based windows and overscan,
  so loading more records does not proportionally grow the DOM. Native select-all and range selection
  use ordered matching IDs; standalone mode uses the complete filtered array. Grid marquee selection
  now autoscrolls at the viewport edges, loads the next result page at the bottom, and computes
  intersections from virtualized row geometry for all currently loaded results. Previously intersected
  items are removed when they leave the moving marquee. Manual checks verified marquee selection at
  1920x1080 and 390x844 with a mocked 10,000-asset catalog; repeatable responsive paging/autoscroll
  tests are still needed.
- **Some catalog operations scan in Python.** `LibraryService.filter_assets` still loads all project
  assets, then applies collection, rating, flag, and text filters before sorting. The current native
  Gallery path does not use this utility.
- **Gallery ordering indexes are now present.** Schema migration v3 adds project-prefixed indexes
  for filename, capture date, rating, and file-size sort orders, including the Gallery's stable
  tie-break columns. The redundant standalone project index is removed because it is covered by
  these project-prefixed indexes. Query-plan tests verify SQLite selects the corresponding index
  for each supported sort. Storage and import/update write costs have not yet been benchmarked.
- **Folder and album navigation are limited.** Import supports recursive directory scanning and
  assets retain their source paths. The Gallery lists cataloged source folders in bounded pages but
  does not offer a navigable source-folder tree. User collections support nested manual albums and
  smart rules for text search, minimum rating, flag, and exact source folder. Smart membership is
  evaluated from catalog data; summary counts are recomputed when collection summaries are pushed.
- **Removal is recoverable and catalog-only.** `delete_assets` sets `assets.deleted_at`; ordinary
  pages, counts, folders, and collection membership exclude trashed assets. Recently Deleted pages
  those records and offers restore or confirmed permanent catalog deletion. Trashed records and
  their edit/history and manual collection links are retained indefinitely until explicit action.
  Neither trashing nor permanent catalog deletion changes source images or sidecars. Re-importing a
  source path already in trash resolves to the same catalog record instead of creating a duplicate.
- **Benchmark coverage is still incomplete.** Run
  `python scripts\benchmark_catalog.py --assets 10000 --repeats 7 --import-assets 100` to create a
  synthetic catalog and images, then report startup payload/time/peak Python allocation, basic and
  filtered page-query timings, import timing, thumbnail-byte generation timing/output size, and
  full-resolution raster decode timing. The decode dimensions can be set with `--decode-width` and
  `--decode-height` (defaults: 2048x1536).
  Startup timings are warm in-process bridge calls, and page timings use a warmed SQLite
  connection/cache. The import benchmark uses 320x240 synthetic JPEGs and a no-op thumbnail cache,
  so it measures the real import service's metadata/database work but excludes thumbnail generation.
  Thumbnail bytes are measured separately with a fresh cache per repeat; this includes thumbnail
  generation and cache writes, not just image decoding. Full-resolution decode uses the production
  `ExportService.load_full_resolution_buffer` path with a synthetic JPEG, including decode and
  conversion to the float32 processing buffer; it does not measure RAW decoding. Preview uses
  `EditingService.render_preview` with a fresh service/processing cache each repeat. Export uses
  `ExportService.export_job` with a fresh service each repeat and includes decode, default edit
  processing, JPEG encoding, and file output, but no resize or watermark. These runs exercise the
  production paths with default edit settings, not representative edited photos. The DOM harness is
  also synthetic and omits the native bridge and real thumbnails; no acceptance thresholds have
  been measured on supported hardware.
  Windows 10 / Python 3.13.3 / SQLite 3.49.1 runs with five repetitions reported:
  at 10,000 catalog rows, 36.503 ms median startup (243.025 ms p95), 93,898-byte event,
  606,177-byte peak Python allocation, 5.064 ms basic page query, and 8.140 ms filtered page query;
  At 100,000 rows, a refreshed five-repeat run reported 160.129 ms median startup (197.878 ms p95),
  the same 93,898-byte event and 606,081-byte peak Python allocation, 4.730 ms basic page query,
  and 6.778 ms filtered page query. Both 10,000- and 100,000-row runs emitted exactly 200 summaries.
  In the earlier 10,000-row run, importing 100 synthetic images took 770.710 ms median
  (2,964.957 ms p95), with 302,085-byte peak Python allocation; generating/caching thumbnail bytes
  took 545.907 ms median (565.139 ms p95) and produced 139,682 bytes per repeat. The refreshed
  100,000-row run also imported 10 synthetic images in 136.856 ms median (282.981 ms p95), with
  123,417-byte peak Python allocation; separately generating/caching thumbnail bytes took 82.740 ms
  median (112.703 ms p95) and produced 13,966 bytes per repeat.
  In a separate five-repeat 2048x1536 raster decode run, the production export loader took
  93.893 ms median (99.186 ms p95); its float32 output buffer was 37,748,736 bytes and the synthetic
  JPEG was 270,061 bytes. This output-buffer size excludes temporary decoder allocations. In the
  refreshed 100,000-row run, the same decode took 115.420 ms median (125.316 ms p95); preview
  rendering took 781.883 ms median (881.449 ms p95), and full JPEG export took 860.935 ms median
  (1,367.575 ms p95), writing 490,783 bytes. The preview is not downscaled at these dimensions
  because the default maximum edge is 2048. These are synthetic warm-process measurements with
  substantial timing variability; they are not cold-start measurements, supported-hardware
  baselines, or acceptance targets.
  A repeatable development-only DOM harness is available at `web/benchmark-gallery.html`. Start
  Vite from `web` and open `/benchmark-gallery.html?assets=10000`; it renders the production
  `GalleryGrid` with synthetic assets and reports mounted-card count, harness DOM-element count,
  viewport, and render-settle time after three animation frames; synthetic asset generation is
  outside the timed interval. It does not load thumbnails or exercise the complete app shell and
  native bridge. Its optional “Page by 200” mode loads the first 200 assets, then requests another
  200 when the production grid's marquee autoscroll reaches the loaded-list bottom; the page and
  selection counts update after each synthetic request. A manual browser interaction check loaded
  all 400 assets across two pages while dragging to the bottom edge, reaching 400 loaded assets and
  two pages. One run in the integrated
  browser reported, at 1920x1080, 77 cards and 1,302
  harness elements for both 10,000 assets (193.3 ms settle) and 100,000 assets (109 ms settle).
  At 390x844, it reported 20 cards and 345 harness elements for both 10,000 assets (78.4 ms) and
  200 assets (30.7 ms). These are single-run results, not stable timing targets. A separate mocked
  app check with 10,000 catalog entries and the first 200 assets loaded showed 42 mounted cards at
  1920x1080 and 77 at 390x844; app-shell layout changes the mounted counts.

## Prioritized follow-up

1. Verify bounded startup, Gallery paging, Deliver scope selection, and collection filmstrip paging
   against representative catalogs; current automated coverage verifies bounded startup calls,
   filter ordering, collection summaries, and membership lookup.
2. Verify virtualized Gallery paging and marquee autoscroll across responsive sizes and long catalogs
   with browser-level interaction tests.
3. Run the catalog, import, thumbnail, decode, preview, export, and DOM harnesses at defined sizes
   on supported PCs and establish measured acceptance thresholds from actual supported PCs.
4. Continue evaluating folder-tree navigation and verify trash interaction behavior in the
   integrated desktop browser. Recoverable trash is implemented; its policy is indefinite retention
   until explicit restore or permanent deletion, with no source-file or sidecar modifications.

The lazy-thumbnail, paged-query, and bounded-startup changes reduce initial asset-object, event, and
DOM work, but the synthetic measurements are not representative performance guarantees. Avoid claims
that the library is responsive at large catalog sizes or supports folder navigation and deleted-photo
recovery until those workflows and supported-hardware performance are verified.
