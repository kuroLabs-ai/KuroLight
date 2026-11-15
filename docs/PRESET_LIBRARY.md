# Preset library

KuroLight ships with **54 built-in editing recipes** in
`web/src/constants/editingPresets.json`. Presets merge values into the current
edit state; they do not modify the source image.

## Built-in presets

### Cinematic

- Teal & Orange
- Faded Cinematic
- Moonlight
- Golden Hour Film
- Neon Noir
- Epic Blockbuster
- Cyberpunk Neon City
- Nordic Slate Winter
- Moody Coffeehouse

### Film Emulation

- Matte Film
- Kodak Portra 400
- Fuji Velvia
- Kodak Ektar
- Ilford Delta B&W
- Cross Process
- Kodak Gold 200
- Kodak Tri-X 400
- Fuji Superia 400
- Fuji Pro 400H
- CineStill 800T
- Polaroid Vintage 600
- Agfa Vista 200

### Monochrome

- B&W High Contrast
- Soft Silver
- Deep Shadow
- Selenium Tone
- Warm Sepia
- Platinotype Fine Art
- High-Key Silver Portrait

### Landscape

- Vivid Landscape
- Misty Mountain
- Golden Fields
- Ocean Blue
- Lush Pine Forest
- Sunset Crimson Flare
- Desert Ochre & Sand
- Moody Autumn Foliage

### Portrait

- Warm Editorial
- Clean Studio
- Moody Portrait
- Pastel Fade
- Vogue Clean Minimal
- Boho Wedding Warmth
- Golden Sun Kissed
- Porcelain Studio

### Urban / Street

- Gritty Street
- Tokyo Nights
- Concrete Jungle
- Rainy Asphalt

### Lifestyle / Social

- Instagram Warm
- Faded Summer
- Dark & Moody

### Creative / FX

- Infrared
- Duotone Blue-Gold

The source preset data remains the authoritative catalog if the list changes.
The UI provides search/category filtering, application, and user-created
recipes.

## Custom presets

Custom presets are saved in browser storage. A user-created preset captures
editable parameters from the current image state and can be applied to another
asset. Presets do not include source files or make an export.

The Python catalog also has a `presets` table and `PresetService`; current
frontend preset storage and catalog presets are separate persistence
mechanisms.
