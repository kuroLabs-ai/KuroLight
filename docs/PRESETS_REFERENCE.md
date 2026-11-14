# Presets Catalog & Parameter Reference

KuroLight includes **54 built-in photographic presets** spanning 6 curated categories, designed by colorists and photographers for instant professional looks.
The browser UI loads the built-in recipes from
[`web/src/constants/editingPresets.json`](../web/src/constants/editingPresets.json).
Applying a preset merges its supported parameters into the active browser edit
state; it does not invoke the Python preset API.

---

## 1. Built-in Categories

```
┌─────────────────────────────────────────────────────────────┐
│                   54 Built-in Style Recipes                 │
├─────────────────┬─────────────────────────┬─────────────────┤
│ Film Emulation  │ 10 Analog Film Stocks   │ Portra, Fuji... │
│ Portrait        │ 9 Skin & Studio Recipes │ Editorial...    │
│ Cinematic       │ 9 Film Grade Looks      │ Teal & Orange.. │
│ Landscape       │ 9 Nature & Atmosphere   │ Vivid, Forest.. │
│ Urban & Street  │ 9 Architectural Looks   │ Tokyo Night...  │
│ Monochrome      │ 8 B&W Silver Gelatin    │ High Contrast.. │
└─────────────────┴─────────────────────────┴─────────────────┘
```

---

## 2. Complete Catalog

### Film Emulation (10 Presets)
1. **Kodak Portra 400**: Natural warm skin tones, gentle highlight rolloff, and fine organic grain.
2. **Fuji Pro 400H**: Cool pastel highlights with soft cyan/green tones, popular for weddings and outdoor fashion.
3. **Ilford HP5 Plus**: Classic monochrome film with deep blacks, distinct midtone grain, and rich contrast.
4. **Kodachrome 64**: Iconic 1970s National Geographic look with punchy primary reds, deep sky blues, and warm earth tones.
5. **CineStill 800T**: Tungsten-balanced cinema film emulation with characteristic warm highlights and cyan shadow shifts.
6. **Fuji Velvia 50**: High-saturation transparency film with vibrant greens and vivid skies for landscape photography.
7. **Agfa Vista 200**: Warm everyday consumer film stock with rich golden hues and punchy red saturation.
8. **Kodak Tri-X 400**: Gritty street photography classic with aggressive contrast, deep blacks, and pronounced grain.
9. **Fuji Classic Chrome**: Muted, editorial documentary look with reduced saturation and rich shadow gradation.
10. **Polaroid SX-70**: Instant film look with washed-out highlights, faded blacks, and vintage color shift.

### Portrait & Studio (9 Presets)
1. **Warm Editorial**: Soft highlight compression, golden undertones, and gentle clarity for fashion portraits.
2. **Studio Soft**: Low micro-contrast, gentle skin smoothing, and balanced neutral white balance.
3. **Golden Hour Glow**: Rich amber highlights and warm bronze shadows for sunset portraits.
4. **High Key Beauty**: Bright, clean, airy skin tones with minimal shadows and luminous highlights.
5. **Moody Dramatic**: Deep directional contrast, focused subject lighting, and controlled shadows.
6. **Porcelain Skin**: Smooth skin tones with subtle desaturation of magenta and red color channels.
7. **Earthy Bohemian**: Muted greens and warm terracotta shadows for lifestyle portraiture.
8. **Cinematic Portrait**: 3-way color grade with teal undertones and warm skin highlight separation.
9. **Dark & Moody**: Heavy shadow vignetting with rich, desaturated midtones.

### Cinematic & Color Grade (9 Presets)
1. **Teal & Orange**: Classic Hollywood block-buster look balancing cyan shadows with amber highlights.
2. **Film Bleach Bypass**: High tonal contrast with desaturated colors, inspired by silver retention processes.
3. **Cyberpunk Neon**: Vivid magenta and electric cyan color grading tailored for nocturnal street scenes.
4. **Vintage Warmth**: Nostalgic 1960s Kodacolor grading with faded blacks and rich sepia warmth.
5. **Moody Nordic**: Cool desaturated blues, muted foliage, and clean neutral whites.
6. **Technicolor 2-Strip**: Vintage early-cinema look with vibrant cyan-green and orange-red duotone rendering.
7. **Matte Film**: Crushed highlights and lifted shadows with low contrast for a dreamy print aesthetic.
8. **Anamorphic Dusk**: Deep blue shadows with warm horizon glow and horizontal glare characteristics.
9. **Golden Blockbuster**: Rich amber grade across highlights and midtones with saturated skin tones.

### Landscape & Nature (9 Presets)
1. **Vivid Landscape**: Boosted dynamic range, enhanced blue skies, and lush green foliage.
2. **Golden Sunset**: Saturated warm oranges, lifted shadows, and gentle atmospheric haze.
3. **Dramatic Forest**: Deep emerald greens with reduced yellow luminance for dense woodland scenes.
4. **Desert Warmth**: Sun-baked terracotta tones, warm whites, and crisp clarity.
5. **Arctic Glacier**: Clean crisp blues, bright whites, and reduced yellow warmth.
6. **Deep Ocean**: Rich aquatic cyans and deep navy tones for seascapes and aerial photography.
7. **Autumn Equinox**: Saturated fiery oranges, burnt reds, and golden yellows.
8. **Misty Mountain**: Lifted low-end shadows with gentle dehaze reduction for atmospheric depth.
9. **Stormy Skies**: Aggressive highlight recovery, boosted clarity, and dramatic cloud contrast.

### Urban & Street (9 Presets)
1. **Tokyo Night**: Electric blues and vibrant neon accents against deep urban shadows.
2. **Street Classic**: Punchy contrast, moderate sharpening, and timeless neutral color fidelity.
3. **Muted Concrete**: Low saturation architecture look emphasizing geometric lines and concrete textures.
4. **Neon Alley**: Night city look emphasizing magenta, blue, and yellow reflections on dark streets.
5. **Rainy Asphalt**: Wet pavement reflections with cool undertones and boosted specular highlights.
6. **Subway Grain**: High ISO textured black and white with deep crushed shadows.
7. **Brutalist Architecture**: High clarity, neutralized tint, and crisp geometric edge enhancement.
8. **Golden Hour Alley**: Warm light slicing through urban canyons against cool shadow walls.
9. **Cyber Street**: High contrast modern street look with turquoise shadows and orange highlights.

### Monochrome & Silver Gelatin (8 Presets)
1. **B&W High Contrast**: Deep velvety blacks and bright whites for graphic, dramatic compositions.
2. **Fine Art Monochrome**: Smooth tonal gradation across all 256 gray levels with lifted highlights.
3. **Silver Gelatin**: Warm-toned darkroom print look with subtle sepia toning in the highlights.
4. **Sepia Warmth**: Classic Victorian-era brown duotone toning with faded contrast.
5. **Noir Dramatic**: Heavy vignette, low midtones, and high micro-contrast for mystery and tension.
6. **Low Key Dark**: Crushed shadows and minimal exposure for silhouettes and accent lighting.
7. **Infrared B&W**: Glowing foliage and dark skies emulating Wood Effect infrared film.
8. **Matte B&W**: Lifted blacks and soft highlights for a vintage newsprint quality.

---

## 3. Preset Parameter Schema

Presets are saved and merged using the standard `EditState` structure:

```json
{
  "exposure": {
    "exposure": 0.25,
    "contrast": 15.0,
    "highlights": -20.0,
    "shadows": 15.0,
    "whites": 10.0,
    "blacks": -8.0
  },
  "white_balance": {
    "temperature": 12.0,
    "tint": 2.0,
    "vibrance": 15.0,
    "saturation": 5.0
  },
  "color_grading": {
    "lift": { "hue": 210.0, "saturation": 0.20, "luminance": -0.04 },
    "gain": { "hue": 35.0, "saturation": 0.22, "luminance": 0.06 }
  },
  "detail": {
    "sharpening": 35.0,
    "clarity": 15.0,
    "dehaze": 5.0
  },
  "lens_correction": {
    "distortion": 0.0,
    "chromatic_aberration": 0.0,
    "vignette": -15.0
  }
}
```

---

## 4. Custom User Presets

Users can save their active photo edits as custom presets directly in the UI:
1. Click **Presets** tab in the Lightbox sidebar.
2. Click **Save Active as Preset**.
3. Provide a Name and Category.
4. Custom presets are stored in browser IndexedDB and can be searched, applied,
   or deleted in that browser profile. They are separate from the per-photo
   edit state saved to the native Python catalog.
