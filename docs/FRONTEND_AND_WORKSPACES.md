# Frontend Workspaces & UI Components

The KuroLight frontend is built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**, designed specifically for color-critical desktop photo editing.

---

## 1. Application Workspaces

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TopBar: [Logo KuroLight]  [Gallery | Lightbox | Color Studio | Deliver]     │
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

### 2. Lightbox (Develop) Workspace
* **Main Canvas**: Real-time 32-bit floating-point preview.
* **Basic Tone Controls**: Exposure, Contrast, Highlights, Shadows, Whites, Blacks, Temp, Tint, Vibrance, Saturation.
* **Detail & Lens**: Sharpness, Noise Reduction, Distortion correction, and Vignette slider.
* **Presets Tab**: Searchable list of all 54 built-in presets with category pills and instant "Applied" feedback.
* **History Tab**: Interactive step-by-step history list with jump-to-step support.

### 3. Color Studio Workspace
* **3-Way Color Wheels**: Professional Lift (Shadows), Gamma (Midtones), and Gain (Highlights) color wheels with hue angle and saturation controls.
* **Live Scopes**:
  * Real-time RGB Histogram.
  * RGB Parade / Luma Waveform.
  * Vectorscope chromatic distribution.
* **3D LUT Card**: Apply and blend built-in or custom `.cube` 3D Look-Up Tables.

### 4. Deliver (Export) Workspace
* **Job Queue Manager**: Monitor background rendering progress for single or batch exports.
* **Format & Quality Profiles**: Presets for Social Media (JPEG sRGB 2048px), Print (TIFF 16-bit 300 DPI), and Web (Lossless WebP).
* **Live Watermark Preview**: Position text or logo watermarks interactively.

### 5. Visual Flow Workspace
* Dynamic moodboard and presentation layout editor.

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
5. **Crosshair & Center Mark**: Precision centering and horizon leveling.

---

## 4. Keyboard Shortcuts Reference

| Shortcut | Action | Workspace |
|:---|:---|:---|
| `Space` | Toggle 100% 1:1 Pixel Zoom / Fit to Screen | Lightbox / Color Studio |
| `Z` | Toggle Zoom Mode | Viewport |
| `C` | Activate Crop & Straighten Tool | Lightbox |
| `O` | Cycle Composition Overlay Guides | Viewport |
| `\` | Toggle Before / After Split Comparison | Lightbox / Color Studio |
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
