# Frontend Workspaces & UI Components

The KuroLight frontend is built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**, designed specifically for color-critical desktop photo editing.

---

## 1. Application Workspaces

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TopBar: [Logo KuroLight]  [Gallery | Lightbox | Color Studio | Flow | Deliver]│
├──────────────────────────────────────────────────────┬──────────────────────┤
│                                                      │                      │
│                                                      │  Inspector / Sidebar │
│                      Viewport                        │  - Histograms        │
│    - GPU-Accelerated Photo Canvas                    │  - Tone Adjustments  │
│    - Smooth Zoom / Pan (Mouse Wheel & Drag)          │  - Color Wheels      │
│    - Composition Overlay Guides (Thirds, Golden)     │  - Presets (54)      │
│    - Split Before / After Compare View               │  - Undo History      │
│                                                      │                      │
├──────────────────────────────────────────────────────┴──────────────────────┤
│ Filmstrip: Thumbnail pagination, ratings (1-5 stars), flags (Pick/Reject)   │
└─────────────────────────────────────────────────────────────────────────────┘
```

KuroLight provides 5 dedicated workspaces:

### 1. Gallery Workspace
* **Grid & Table Views**: High-density responsive grid with lazy-loaded thumbnails.
* **Smart Collections & Folders**: Organize by ratings, camera model, lens, or custom search rules.
* **Batch Curation**: Star ratings (1–5), color flags (Pick, Reject, Unflagged), and multi-select drag actions.
* **Open a Selection in Lightbox**: Select multiple photos and open them together in the filmstrip. The selection is ordered by the current Gallery sort, and the active photo is retained when it is among the selected items.

### 2. Lightbox (Develop) Workspace
* **Main Canvas**: Real-time WebGL preview rendered from the browser edit state.
  The cached thumbnail appears immediately while full-resolution previews load.
* **Basic Tone Controls**: Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temp, Tint, Vibrance, Saturation.
* **Detail & Lens**: Sharpness, Noise Reduction, Distortion correction, and Vignette slider.
* **Geometry**: Crop with aspect constraints, straighten/rotation, horizontal and vertical flips, and composition guides. Guides start hidden (`none`).
* **Local Masks**: Linear and radial gradients, paintable brush masks, luminance ranges, and color ranges with replace/add/subtract/intersect, inversion, feather, opacity, and local adjustments. Color and luminance ranges can be seeded by clicking a pixel in the rendered preview; press Escape to cancel. Brush strokes can be cleared from the selected mask.
* **Spot Retouch**: Heal/clone spots expose draggable source and target pins on the viewport.
* **Presets Tab**: Searchable list of all 54 built-in presets with category pills and instant "Applied" feedback.
* **History Tab**: Per-asset undo/redo and named edit snapshots.

### 3. Color Studio Workspace
* **3-Way Color Wheels**: Circular Lift (Shadows), Gamma (Midtones), and Gain (Highlights) controls with hue, normalized saturation, and luminance. Double-click a wheel or luminance control to reset it.
* **Live Scopes**: RGB/luminance histogram, waveform, and vectorscope are calculated from the rendered WebGL preview and refreshed as edits render.
* **3D LUT Card**: Apply and blend built-in or custom `.cube` 3D Look-Up Tables.

The WebGL renderer applies tone, white balance, 8-band HSL, master/channel
curves, color grading, LUTs, detail controls, geometry rotation/flips/crop,
creative vignette, and lens corrections to the preview. Custom `.cube` LUT
data is cached in IndexedDB. Neighborhood detail filters and lens remapping
are single-pass GPU approximations; they do not yet reproduce the Python
renderer's bilateral/cubic filtering exactly.

The WebGL renderer owns interactive preview edits; the Python image pipeline
continues to provide full-resolution processing for export. The browser
auto-caches the current edit state per asset in IndexedDB. In the native app,
**Save** or **Ctrl+S** also writes the edit state to the Python catalog, where
it is restored when that asset is opened again.

Undo/redo stacks are maintained per asset during the current browser session.
Changes within 180 ms are coalesced into one history step, with a maximum of
100 undo steps per asset. Named snapshots are part of the edit state and are
included when that state is saved. Built-in presets are bundled with the web
app; custom user presets are stored in browser IndexedDB and apply directly to
the browser edit state.

### 4. Deliver (Export) Workspace
* **Job Queue Manager**: Monitor background rendering progress for single or batch exports.
* **Format & Quality Profiles**: Presets for Social Media (JPEG sRGB 2048px), Print (TIFF 16-bit 300 DPI), and Web (Lossless WebP).
* **Live Watermark Preview**: Position text or logo watermarks interactively.

### 5. Visual Flow Workspace
* **Live Output Preview**: The output node renders the active image and edit state through the WebGL renderer.
* **Stage Bypass**: Enable or bypass processing stages, including tone, color, HSL, curves, grading, detail, dehaze, geometry, vignette, and chroma key.
* **Chroma Key**: The background-removal node updates the WebGL preview alpha using its color, tolerance, and feather settings.
* **Scope**: Nodes are presented in the fixed processing order; this workspace does not provide arbitrary port rewiring. Node layout is a presentation of the pipeline, not a separately executable graph.

---

## 2. Dynamic Accent Color System

Defined in: [`web/src/utils/theme.ts`](file:///d:/vscode/Kuro.worktrees/kurolight/web/src/utils/theme.ts) and [`web/tailwind.config.js`](file:///d:/vscode/Kuro.worktrees/kurolight/web/tailwind.config.js)

KuroLight features a customizable accent color system:

* **Live CSS Variables**: Accent colors are driven by `--obsidian-accent` and `--obsidian-accent-hover`.
* **Instant Application**: In **Settings → Appearance**, users can choose from 6 curated studio swatches (Sapphire Blue, Emerald Green, Amber Gold, Crimson Red, Amethyst Purple, Monochromatic Silver) or select any custom hex color via the native color picker.
* **Zero Restart Required**: Changes update across buttons, sliders, selection outlines, and active indicators immediately.

---

## 3. Composition Guides & Viewport Overlays

Defined in: [`web/src/utils/compositionGuides.ts`](file:///d:/vscode/Kuro.worktrees/kurolight/web/src/utils/compositionGuides.ts)

Press **`O`** in the viewport to cycle through composition overlays:
1. **Rule of Thirds**: $3 \times 3$ grid with intersecting power points.
2. **Golden Ratio (Phi Grid)**: $1 : 0.618 : 1$ classical harmonic proportioning.
3. **Golden Spiral (Fibonacci)**: Dynamic logarithmic spiral guide.
4. **Diagonal Method**: 45-degree corner lines for dynamic motion alignment.
5. **Golden Triangles**: Harmonic diagonal and perpendicular guides.
6. **Crosshair & Center Mark**: Precision centering and horizon leveling.
7. **Alignment Grid**: Uniform grid for leveling and architectural alignment.

Guides are drawn over the viewport and crop frame. They default to **None** for
new photos; use the viewport menu or crop toolbar to choose a guide and change
its orientation where supported.

---

## 4. Keyboard Shortcuts Reference

| Shortcut | Action | Workspace |
|:---|:---|:---|
| `Space` | Toggle 100% 1:1 Pixel Zoom / Fit to Screen | Lightbox / Color Studio |
| `Z` | Toggle Zoom Mode | Viewport |
| `C` | Activate Crop & Straighten Tool | Lightbox |
| `O` | Cycle Composition Overlay Guides | Viewport |
| `\` | Toggle Before / After Split Comparison | Lightbox / Color Studio |
| `Ctrl + S` | Save edits (to the catalog in the native app) | Lightbox |
| `Ctrl + Z` | Undo last adjustment | Global |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo adjustment | Global |
| `1` – `5` | Assign Star Rating (1 to 5 stars) | Global |
| `0` | Clear Star Rating | Global |
| `P` | Flag as "Pick" | Global |
| `X` | Flag as "Reject" | Global |
| `U` | Unflag / Clear Flag | Global |
| `Ctrl + E` | Open Deliver / Export Dialog | Global |
| `Ctrl + ,` | Open Settings Preferences Dialog | Global |
| `Tab` | Toggle Fullscreen / Hide Panels | Global |
