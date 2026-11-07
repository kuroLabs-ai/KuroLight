"""Service managing built-in and user editing presets."""

from typing import List

from kurolight.domain.editing import EditState
from kurolight.domain.presets import Preset
from kurolight.infrastructure.database.repository import PresetRepository


class PresetService:
    """Coordinates preset management and recipes application."""

    BUILTIN_PRESETS = [
        # ── Cinematic ────────────────────────────────────────────────────
        {
            "name": "Teal & Orange",
            "category": "Cinematic",
            "parameters": {
                "color_grading": {
                    "lift": {"hue": 210.0, "saturation": 0.25, "luminance": -0.05},
                    "gain": {"hue": 35.0, "saturation": 0.25, "luminance": 0.08},
                },
                "exposure": {"contrast": 15.0, "highlights": -10.0},
                "white_balance": {"vibrance": 15.0},
            },
        },
        {
            "name": "Faded Cinematic",
            "category": "Cinematic",
            "parameters": {
                "exposure": {"contrast": -18.0, "highlights": -30.0, "shadows": 20.0, "blacks": 18.0},
                "white_balance": {"temperature": -6.0, "saturation": -12.0, "vibrance": -8.0},
                "color_grading": {
                    "lift": {"hue": 215.0, "saturation": 0.15, "luminance": 0.08},
                    "gain": {"hue": 45.0, "saturation": 0.10, "luminance": -0.04},
                },
                "detail": {"clarity": -8.0},
            },
        },
        {
            "name": "Moonlight",
            "category": "Cinematic",
            "parameters": {
                "exposure": {"exposure": -0.3, "contrast": 20.0, "highlights": -20.0, "shadows": -10.0, "blacks": -15.0},
                "white_balance": {"temperature": -22.0, "tint": -5.0, "saturation": -15.0},
                "color_grading": {
                    "lift": {"hue": 225.0, "saturation": 0.30, "luminance": -0.08},
                    "gain": {"hue": 220.0, "saturation": 0.12, "luminance": -0.05},
                },
                "detail": {"clarity": 10.0},
            },
        },
        {
            "name": "Golden Hour Film",
            "category": "Cinematic",
            "parameters": {
                "exposure": {"exposure": 0.1, "contrast": 10.0, "highlights": -20.0, "shadows": 10.0, "blacks": -20.0},
                "white_balance": {"temperature": 28.0, "tint": 6.0, "vibrance": 18.0},
                "color_grading": {
                    "lift": {"hue": 30.0, "saturation": 0.20, "luminance": -0.04},
                    "gain": {"hue": 40.0, "saturation": 0.22, "luminance": 0.06},
                },
                "detail": {"clarity": 8.0},
            },
        },
        {
            "name": "Neon Noir",
            "category": "Cinematic",
            "parameters": {
                "exposure": {"contrast": 35.0, "highlights": -25.0, "shadows": -20.0, "blacks": -30.0},
                "white_balance": {"temperature": -10.0, "tint": 8.0, "saturation": -8.0, "vibrance": 20.0},
                "color_grading": {
                    "lift": {"hue": 270.0, "saturation": 0.35, "luminance": -0.10},
                    "gain": {"hue": 180.0, "saturation": 0.28, "luminance": 0.05},
                },
                "detail": {"clarity": 18.0, "sharpening": 25.0},
            },
        },
        {
            "name": "Epic Blockbuster",
            "category": "Cinematic",
            "parameters": {
                "exposure": {"contrast": 40.0, "highlights": -30.0, "shadows": -15.0, "whites": 20.0, "blacks": -35.0},
                "white_balance": {"vibrance": 22.0, "saturation": 10.0},
                "color_grading": {
                    "lift": {"hue": 200.0, "saturation": 0.20, "luminance": -0.08},
                    "gain": {"hue": 38.0, "saturation": 0.22, "luminance": 0.10},
                    "gamma": {"hue": 30.0, "saturation": 0.08, "luminance": 0.0},
                },
                "detail": {"clarity": 20.0, "sharpening": 30.0, "dehaze": 8.0},
            },
        },
        # ── Film Emulation ───────────────────────────────────────────────
        {
            "name": "Matte Film",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {"contrast": -10.0, "highlights": -20.0, "shadows": 25.0},
                "color_grading": {
                    "lift": {"hue": 0.0, "saturation": 0.0, "luminance": 0.12},
                    "gain": {"hue": 40.0, "saturation": 0.10, "luminance": -0.05},
                },
                "white_balance": {"temperature": 8.0, "vibrance": 10.0},
            },
        },
        {
            "name": "Kodak Portra 400",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {"exposure": 0.15, "contrast": -8.0, "highlights": -18.0, "shadows": 22.0, "whites": 10.0},
                "white_balance": {"temperature": 12.0, "tint": 5.0, "vibrance": 14.0, "saturation": -5.0},
                "color_grading": {
                    "lift": {"hue": 25.0, "saturation": 0.12, "luminance": 0.06},
                    "gain": {"hue": 42.0, "saturation": 0.10, "luminance": 0.04},
                },
                "detail": {"clarity": -6.0, "noise_reduction": 15.0},
            },
        },
        {
            "name": "Fuji Velvia",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {"contrast": 25.0, "highlights": -15.0, "shadows": -10.0, "blacks": -20.0},
                "white_balance": {"saturation": 20.0, "vibrance": 30.0, "temperature": -5.0},
                "hsl": {
                    "green": {"saturation": 30.0, "luminance": 5.0},
                    "blue": {"saturation": 25.0, "hue": -8.0},
                    "red": {"saturation": 20.0},
                },
                "detail": {"clarity": 12.0, "sharpening": 25.0},
            },
        },
        {
            "name": "Kodak Ektar",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {"contrast": 18.0, "highlights": -12.0, "shadows": -8.0, "blacks": -18.0},
                "white_balance": {"temperature": 8.0, "saturation": 15.0, "vibrance": 18.0},
                "hsl": {
                    "red": {"saturation": 25.0, "luminance": -5.0},
                    "orange": {"saturation": 20.0, "hue": 5.0},
                    "green": {"saturation": 15.0},
                },
                "detail": {"clarity": 10.0, "sharpening": 30.0},
            },
        },
        {
            "name": "Ilford Delta B&W",
            "category": "Film Emulation",
            "parameters": {
                "white_balance": {"saturation": -100.0},
                "exposure": {"contrast": 12.0, "highlights": -8.0, "shadows": 8.0, "whites": 10.0, "blacks": -10.0},
                "detail": {"sharpening": 20.0, "clarity": 8.0, "noise_reduction": 10.0},
            },
        },
        {
            "name": "Cross Process",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {"contrast": 30.0, "highlights": -10.0, "blacks": -20.0},
                "white_balance": {"temperature": -15.0, "tint": 20.0, "saturation": 25.0, "vibrance": 20.0},
                "color_grading": {
                    "lift": {"hue": 90.0, "saturation": 0.30, "luminance": -0.05},
                    "gain": {"hue": 320.0, "saturation": 0.25, "luminance": 0.05},
                },
                "hsl": {
                    "green": {"hue": -15.0, "saturation": 20.0},
                    "blue": {"hue": 15.0, "saturation": 30.0},
                },
            },
        },
        # ── Monochrome ───────────────────────────────────────────────────
        {
            "name": "B&W High Contrast",
            "category": "Monochrome",
            "parameters": {
                "white_balance": {"saturation": -100.0},
                "exposure": {"contrast": 35.0, "whites": 20.0, "blacks": -25.0, "highlights": -15.0},
                "detail": {"sharpening": 35.0, "clarity": 20.0},
            },
        },
        {
            "name": "Soft Silver",
            "category": "Monochrome",
            "parameters": {
                "white_balance": {"saturation": -100.0},
                "exposure": {"contrast": -15.0, "highlights": -10.0, "shadows": 20.0, "whites": -5.0, "blacks": 10.0},
                "detail": {"clarity": -10.0, "sharpening": 15.0},
            },
        },
        {
            "name": "Deep Shadow",
            "category": "Monochrome",
            "parameters": {
                "white_balance": {"saturation": -100.0},
                "exposure": {"contrast": 45.0, "highlights": -30.0, "shadows": -20.0, "blacks": -40.0, "whites": 25.0},
                "detail": {"clarity": 25.0, "sharpening": 40.0},
            },
        },
        {
            "name": "Selenium Tone",
            "category": "Monochrome",
            "parameters": {
                "white_balance": {"saturation": -85.0, "temperature": -18.0, "tint": -8.0},
                "exposure": {"contrast": 15.0, "highlights": -12.0, "shadows": 5.0, "blacks": -15.0},
                "color_grading": {
                    "lift": {"hue": 220.0, "saturation": 0.15, "luminance": -0.03},
                    "gain": {"hue": 215.0, "saturation": 0.08, "luminance": 0.0},
                },
                "detail": {"sharpening": 25.0, "clarity": 10.0},
            },
        },
        {
            "name": "Warm Sepia",
            "category": "Monochrome",
            "parameters": {
                "white_balance": {"saturation": -80.0, "temperature": 20.0, "tint": 5.0},
                "exposure": {"contrast": 10.0, "highlights": -10.0, "shadows": 10.0, "blacks": -10.0},
                "color_grading": {
                    "lift": {"hue": 30.0, "saturation": 0.22, "luminance": 0.04},
                    "gain": {"hue": 38.0, "saturation": 0.18, "luminance": 0.0},
                    "gamma": {"hue": 32.0, "saturation": 0.12, "luminance": 0.0},
                },
            },
        },
        # ── Landscape ────────────────────────────────────────────────────
        {
            "name": "Vivid Landscape",
            "category": "Landscape",
            "parameters": {
                "exposure": {"contrast": 20.0, "highlights": -25.0, "shadows": 20.0, "whites": 15.0},
                "white_balance": {"vibrance": 25.0, "saturation": 8.0},
                "detail": {"sharpening": 30.0, "clarity": 15.0, "dehaze": 10.0},
            },
        },
        {
            "name": "Misty Mountain",
            "category": "Landscape",
            "parameters": {
                "exposure": {"contrast": -5.0, "highlights": -20.0, "shadows": 25.0, "whites": -10.0},
                "white_balance": {"temperature": -12.0, "saturation": -10.0, "vibrance": 8.0},
                "color_grading": {
                    "lift": {"hue": 210.0, "saturation": 0.12, "luminance": 0.05},
                    "gain": {"hue": 205.0, "saturation": 0.08, "luminance": -0.03},
                },
                "detail": {"clarity": 5.0, "sharpening": 20.0},
            },
        },
        {
            "name": "Golden Fields",
            "category": "Landscape",
            "parameters": {
                "exposure": {"contrast": 15.0, "highlights": -20.0, "shadows": 15.0, "whites": 10.0},
                "white_balance": {"temperature": 20.0, "vibrance": 20.0, "saturation": 5.0},
                "hsl": {
                    "yellow": {"saturation": 25.0, "luminance": 8.0, "hue": 5.0},
                    "green": {"saturation": 20.0, "luminance": 5.0, "hue": 8.0},
                    "orange": {"saturation": 15.0, "luminance": 5.0},
                },
                "detail": {"clarity": 12.0, "sharpening": 25.0},
            },
        },
        {
            "name": "Ocean Blue",
            "category": "Landscape",
            "parameters": {
                "exposure": {"contrast": 18.0, "highlights": -22.0, "shadows": 10.0, "whites": -8.0},
                "white_balance": {"temperature": -10.0, "vibrance": 22.0},
                "hsl": {
                    "aqua": {"saturation": 30.0, "luminance": 5.0, "hue": -10.0},
                    "blue": {"saturation": 25.0, "luminance": -5.0, "hue": 8.0},
                    "green": {"saturation": 15.0, "hue": -10.0},
                },
                "detail": {"clarity": 10.0, "dehaze": 8.0, "sharpening": 20.0},
            },
        },
        # ── Portrait ─────────────────────────────────────────────────────
        {
            "name": "Warm Editorial",
            "category": "Portrait",
            "parameters": {
                "white_balance": {"temperature": 16.0, "tint": 4.0, "vibrance": 12.0},
                "exposure": {"exposure": 0.20, "highlights": -15.0, "shadows": 15.0},
                "detail": {"clarity": -5.0, "sharpening": 20.0},
            },
        },
        {
            "name": "Clean Studio",
            "category": "Portrait",
            "parameters": {
                "exposure": {"exposure": 0.25, "contrast": -5.0, "highlights": -10.0, "shadows": 20.0, "whites": 15.0},
                "white_balance": {"temperature": 5.0, "tint": 2.0, "vibrance": 8.0},
                "detail": {"clarity": -8.0, "sharpening": 18.0, "noise_reduction": 12.0},
            },
        },
        {
            "name": "Moody Portrait",
            "category": "Portrait",
            "parameters": {
                "exposure": {"contrast": 25.0, "highlights": -20.0, "shadows": -15.0, "blacks": -10.0},
                "white_balance": {"temperature": -8.0, "tint": 3.0, "vibrance": 10.0},
                "color_grading": {
                    "lift": {"hue": 215.0, "saturation": 0.18, "luminance": -0.05},
                    "gain": {"hue": 35.0, "saturation": 0.10, "luminance": 0.04},
                },
                "detail": {"clarity": 12.0, "sharpening": 22.0},
            },
        },
        {
            "name": "Pastel Fade",
            "category": "Portrait",
            "parameters": {
                "exposure": {"exposure": 0.35, "contrast": -20.0, "highlights": -15.0, "shadows": 30.0, "whites": -10.0, "blacks": 20.0},
                "white_balance": {"temperature": 8.0, "vibrance": -5.0, "saturation": -15.0},
                "detail": {"clarity": -15.0, "sharpening": 10.0},
            },
        },
        # ── Urban / Street ───────────────────────────────────────────────
        {
            "name": "Gritty Street",
            "category": "Urban / Street",
            "parameters": {
                "exposure": {"contrast": 30.0, "highlights": -20.0, "shadows": -10.0, "blacks": -25.0, "whites": 15.0},
                "white_balance": {"saturation": -10.0, "vibrance": 8.0},
                "detail": {"clarity": 30.0, "texture": 25.0, "sharpening": 40.0, "dehaze": 5.0},
            },
        },
        {
            "name": "Tokyo Nights",
            "category": "Urban / Street",
            "parameters": {
                "exposure": {"exposure": -0.2, "contrast": 25.0, "highlights": -15.0, "shadows": 10.0, "blacks": -20.0},
                "white_balance": {"temperature": 15.0, "tint": 5.0, "vibrance": 25.0, "saturation": 10.0},
                "color_grading": {
                    "lift": {"hue": 300.0, "saturation": 0.20, "luminance": -0.05},
                    "gain": {"hue": 40.0, "saturation": 0.22, "luminance": 0.08},
                },
                "detail": {"clarity": 15.0, "sharpening": 25.0},
            },
        },
        {
            "name": "Concrete Jungle",
            "category": "Urban / Street",
            "parameters": {
                "exposure": {"contrast": 15.0, "highlights": -18.0, "shadows": -8.0, "blacks": -12.0},
                "white_balance": {"temperature": -15.0, "saturation": -20.0, "vibrance": -5.0},
                "color_grading": {
                    "lift": {"hue": 210.0, "saturation": 0.10, "luminance": 0.0},
                    "gamma": {"hue": 205.0, "saturation": 0.05, "luminance": 0.0},
                },
                "detail": {"clarity": 20.0, "texture": 15.0, "sharpening": 30.0},
            },
        },
        # ── Lifestyle / Social ───────────────────────────────────────────
        {
            "name": "Instagram Warm",
            "category": "Lifestyle / Social",
            "parameters": {
                "exposure": {"exposure": 0.20, "contrast": 8.0, "highlights": -15.0, "shadows": 20.0, "whites": 10.0},
                "white_balance": {"temperature": 18.0, "tint": 3.0, "vibrance": 20.0, "saturation": 5.0},
                "detail": {"clarity": 5.0, "sharpening": 15.0},
            },
        },
        {
            "name": "Faded Summer",
            "category": "Lifestyle / Social",
            "parameters": {
                "exposure": {"exposure": 0.30, "contrast": -15.0, "highlights": -20.0, "shadows": 25.0, "whites": -5.0, "blacks": 15.0},
                "white_balance": {"temperature": 12.0, "vibrance": 15.0, "saturation": -8.0},
                "hsl": {
                    "yellow": {"saturation": 15.0, "luminance": 10.0},
                    "green": {"hue": 10.0, "saturation": -5.0},
                },
                "detail": {"clarity": -5.0},
            },
        },
        {
            "name": "Dark & Moody",
            "category": "Lifestyle / Social",
            "parameters": {
                "exposure": {"exposure": -0.4, "contrast": 30.0, "highlights": -35.0, "shadows": -15.0, "blacks": -30.0},
                "white_balance": {"temperature": -5.0, "vibrance": 15.0, "saturation": 5.0},
                "color_grading": {
                    "lift": {"hue": 225.0, "saturation": 0.20, "luminance": -0.08},
                    "gain": {"hue": 30.0, "saturation": 0.12, "luminance": -0.03},
                },
                "detail": {"clarity": 15.0, "sharpening": 20.0},
            },
        },
        # ── Creative / FX ────────────────────────────────────────────────
        {
            "name": "Infrared",
            "category": "Creative / FX",
            "parameters": {
                "white_balance": {"temperature": -20.0, "saturation": -40.0},
                "exposure": {"contrast": 25.0, "highlights": -20.0, "whites": 30.0, "shadows": 10.0},
                "hsl": {
                    "green": {"luminance": 60.0, "saturation": -30.0},
                    "yellow": {"luminance": 50.0, "saturation": -20.0},
                    "blue": {"luminance": -30.0, "saturation": 20.0},
                    "aqua": {"luminance": -20.0},
                },
                "detail": {"clarity": 20.0, "sharpening": 30.0},
            },
        },
        {
            "name": "Duotone Blue-Gold",
            "category": "Creative / FX",
            "parameters": {
                "white_balance": {"saturation": -60.0},
                "exposure": {"contrast": 20.0, "highlights": -10.0, "shadows": -5.0},
                "color_grading": {
                    "lift": {"hue": 220.0, "saturation": 0.55, "luminance": -0.05},
                    "gain": {"hue": 42.0, "saturation": 0.55, "luminance": 0.05},
                    "gamma": {"hue": 230.0, "saturation": 0.20, "luminance": 0.0},
                },
                "detail": {"clarity": 10.0},
            },
        },
        {
            "name": "Kodak Gold 200",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {
                                "exposure": 0.12,
                                "contrast": 14.0,
                                "highlights": -15.0,
                                "shadows": 18.0,
                                "blacks": -8.0
                },
                "white_balance": {
                                "temperature": 18.0,
                                "tint": 4.0,
                                "vibrance": 18.0,
                                "saturation": 6.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 195.0,
                                                "saturation": 0.12,
                                                "luminance": 0.04
                                },
                                "gain": {
                                                "hue": 42.0,
                                                "saturation": 0.22,
                                                "luminance": 0.06
                                }
                },
                "hsl": {
                                "yellow": {
                                                "saturation": 20.0,
                                                "luminance": 8.0,
                                                "hue": -4.0
                                },
                                "orange": {
                                                "saturation": 16.0,
                                                "luminance": 6.0
                                },
                                "blue": {
                                                "saturation": -10.0,
                                                "hue": 8.0
                                }
                },
                "detail": {
                                "clarity": 6.0,
                                "sharpening": 22.0
                }
},
        },
        {
            "name": "Kodak Tri-X 400",
            "category": "Film Emulation",
            "parameters": {
                "white_balance": {
                                "saturation": -100.0
                },
                "exposure": {
                                "contrast": 28.0,
                                "highlights": -18.0,
                                "shadows": 12.0,
                                "whites": 18.0,
                                "blacks": -28.0
                },
                "detail": {
                                "clarity": 22.0,
                                "texture": 18.0,
                                "sharpening": 35.0
                }
},
        },
        {
            "name": "Fuji Superia 400",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {
                                "contrast": 16.0,
                                "highlights": -14.0,
                                "shadows": 15.0,
                                "blacks": -12.0
                },
                "white_balance": {
                                "temperature": -6.0,
                                "tint": 12.0,
                                "vibrance": 22.0,
                                "saturation": 8.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 180.0,
                                                "saturation": 0.14,
                                                "luminance": 0.02
                                },
                                "gain": {
                                                "hue": 330.0,
                                                "saturation": 0.12,
                                                "luminance": 0.04
                                }
                },
                "hsl": {
                                "green": {
                                                "saturation": 25.0,
                                                "luminance": -4.0,
                                                "hue": -8.0
                                },
                                "red": {
                                                "saturation": 18.0,
                                                "hue": 6.0
                                }
                },
                "detail": {
                                "clarity": 8.0,
                                "sharpening": 24.0
                }
},
        },
        {
            "name": "Fuji Pro 400H",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {
                                "exposure": 0.25,
                                "contrast": -12.0,
                                "highlights": -22.0,
                                "shadows": 28.0,
                                "whites": 12.0
                },
                "white_balance": {
                                "temperature": -4.0,
                                "tint": 8.0,
                                "vibrance": 12.0,
                                "saturation": -6.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 160.0,
                                                "saturation": 0.1,
                                                "luminance": 0.06
                                },
                                "gain": {
                                                "hue": 40.0,
                                                "saturation": 0.1,
                                                "luminance": 0.02
                                }
                },
                "hsl": {
                                "green": {
                                                "hue": 15.0,
                                                "saturation": -10.0,
                                                "luminance": 12.0
                                },
                                "orange": {
                                                "luminance": 8.0,
                                                "saturation": -4.0
                                }
                },
                "detail": {
                                "clarity": -8.0,
                                "sharpening": 16.0,
                                "noise_reduction": 10.0
                }
},
        },
        {
            "name": "CineStill 800T",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {
                                "exposure": 0.1,
                                "contrast": 22.0,
                                "highlights": -16.0,
                                "shadows": 14.0,
                                "blacks": -18.0
                },
                "white_balance": {
                                "temperature": -18.0,
                                "tint": -6.0,
                                "vibrance": 24.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 205.0,
                                                "saturation": 0.24,
                                                "luminance": -0.04
                                },
                                "gain": {
                                                "hue": 28.0,
                                                "saturation": 0.3,
                                                "luminance": 0.08
                                },
                                "gamma": {
                                                "hue": 22.0,
                                                "saturation": 0.12,
                                                "luminance": 0.02
                                }
                },
                "hsl": {
                                "red": {
                                                "saturation": 30.0,
                                                "luminance": 10.0
                                },
                                "orange": {
                                                "saturation": 25.0,
                                                "hue": -4.0
                                },
                                "blue": {
                                                "saturation": 20.0,
                                                "hue": -10.0
                                }
                },
                "detail": {
                                "clarity": 14.0,
                                "sharpening": 26.0
                }
},
        },
        {
            "name": "Polaroid Vintage 600",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {
                                "exposure": 0.18,
                                "contrast": -14.0,
                                "highlights": -25.0,
                                "shadows": 24.0,
                                "blacks": 16.0
                },
                "white_balance": {
                                "temperature": 14.0,
                                "tint": 10.0,
                                "saturation": -10.0,
                                "vibrance": 8.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 140.0,
                                                "saturation": 0.14,
                                                "luminance": 0.1
                                },
                                "gain": {
                                                "hue": 44.0,
                                                "saturation": 0.16,
                                                "luminance": -0.02
                                }
                },
                "detail": {
                                "clarity": -12.0,
                                "texture": -6.0,
                                "sharpening": 12.0
                }
},
        },
        {
            "name": "Agfa Vista 200",
            "category": "Film Emulation",
            "parameters": {
                "exposure": {
                                "contrast": 20.0,
                                "highlights": -12.0,
                                "shadows": 10.0,
                                "blacks": -14.0
                },
                "white_balance": {
                                "temperature": 10.0,
                                "vibrance": 26.0,
                                "saturation": 12.0
                },
                "hsl": {
                                "red": {
                                                "saturation": 32.0,
                                                "luminance": 6.0
                                },
                                "blue": {
                                                "saturation": 24.0,
                                                "hue": -6.0
                                },
                                "yellow": {
                                                "saturation": 18.0
                                }
                },
                "detail": {
                                "clarity": 10.0,
                                "sharpening": 28.0
                }
},
        },
        {
            "name": "Vogue Clean Minimal",
            "category": "Portrait",
            "parameters": {
                "exposure": {
                                "exposure": 0.15,
                                "contrast": 6.0,
                                "highlights": -18.0,
                                "shadows": 16.0,
                                "whites": 8.0
                },
                "white_balance": {
                                "temperature": 4.0,
                                "tint": 2.0,
                                "vibrance": 10.0,
                                "saturation": -4.0
                },
                "hsl": {
                                "orange": {
                                                "luminance": 6.0,
                                                "saturation": -6.0
                                },
                                "red": {
                                                "saturation": -4.0
                                }
                },
                "detail": {
                                "clarity": -4.0,
                                "sharpening": 20.0,
                                "noise_reduction": 8.0
                }
},
        },
        {
            "name": "Boho Wedding Warmth",
            "category": "Portrait",
            "parameters": {
                "exposure": {
                                "exposure": 0.22,
                                "contrast": -6.0,
                                "highlights": -22.0,
                                "shadows": 24.0,
                                "whites": 10.0
                },
                "white_balance": {
                                "temperature": 16.0,
                                "tint": 6.0,
                                "vibrance": 14.0,
                                "saturation": -8.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 35.0,
                                                "saturation": 0.12,
                                                "luminance": 0.04
                                },
                                "gain": {
                                                "hue": 45.0,
                                                "saturation": 0.14,
                                                "luminance": 0.05
                                }
                },
                "hsl": {
                                "green": {
                                                "saturation": -24.0,
                                                "hue": 18.0,
                                                "luminance": 8.0
                                },
                                "yellow": {
                                                "saturation": -10.0,
                                                "hue": 10.0
                                },
                                "orange": {
                                                "luminance": 10.0,
                                                "saturation": -4.0
                                }
                },
                "detail": {
                                "clarity": -8.0,
                                "sharpening": 15.0
                }
},
        },
        {
            "name": "Golden Sun Kissed",
            "category": "Portrait",
            "parameters": {
                "exposure": {
                                "exposure": 0.28,
                                "contrast": 8.0,
                                "highlights": -20.0,
                                "shadows": 18.0
                },
                "white_balance": {
                                "temperature": 24.0,
                                "tint": 4.0,
                                "vibrance": 20.0,
                                "saturation": 6.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 28.0,
                                                "saturation": 0.16,
                                                "luminance": -0.02
                                },
                                "gain": {
                                                "hue": 38.0,
                                                "saturation": 0.2,
                                                "luminance": 0.08
                                }
                },
                "hsl": {
                                "orange": {
                                                "saturation": 14.0,
                                                "luminance": 8.0
                                },
                                "yellow": {
                                                "saturation": 22.0,
                                                "luminance": 6.0
                                }
                },
                "detail": {
                                "clarity": -6.0,
                                "sharpening": 18.0
                }
},
        },
        {
            "name": "Porcelain Studio",
            "category": "Portrait",
            "parameters": {
                "exposure": {
                                "exposure": 0.3,
                                "contrast": -10.0,
                                "highlights": -16.0,
                                "shadows": 22.0,
                                "whites": 14.0
                },
                "white_balance": {
                                "temperature": 2.0,
                                "tint": 4.0,
                                "vibrance": 8.0,
                                "saturation": -6.0
                },
                "hsl": {
                                "orange": {
                                                "luminance": 12.0,
                                                "saturation": -8.0
                                },
                                "red": {
                                                "luminance": 6.0,
                                                "saturation": 4.0
                                }
                },
                "detail": {
                                "clarity": -10.0,
                                "texture": -8.0,
                                "noise_reduction": 16.0,
                                "sharpening": 22.0
                }
},
        },
        {
            "name": "Cyberpunk Neon City",
            "category": "Cinematic",
            "parameters": {
                "exposure": {
                                "contrast": 38.0,
                                "highlights": -28.0,
                                "shadows": -18.0,
                                "blacks": -34.0,
                                "whites": 22.0
                },
                "white_balance": {
                                "temperature": -14.0,
                                "tint": 14.0,
                                "vibrance": 30.0,
                                "saturation": 12.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 215.0,
                                                "saturation": 0.32,
                                                "luminance": -0.1
                                },
                                "gain": {
                                                "hue": 315.0,
                                                "saturation": 0.35,
                                                "luminance": 0.06
                                },
                                "gamma": {
                                                "hue": 190.0,
                                                "saturation": 0.15,
                                                "luminance": 0.0
                                }
                },
                "hsl": {
                                "magenta": {
                                                "saturation": 40.0,
                                                "luminance": 10.0
                                },
                                "blue": {
                                                "saturation": 30.0,
                                                "hue": -10.0
                                },
                                "aqua": {
                                                "saturation": 35.0,
                                                "luminance": 6.0
                                }
                },
                "detail": {
                                "clarity": 22.0,
                                "sharpening": 32.0,
                                "dehaze": 8.0
                }
},
        },
        {
            "name": "Nordic Slate Winter",
            "category": "Cinematic",
            "parameters": {
                "exposure": {
                                "exposure": 0.08,
                                "contrast": 12.0,
                                "highlights": -24.0,
                                "shadows": 14.0,
                                "whites": -6.0
                },
                "white_balance": {
                                "temperature": -18.0,
                                "tint": -4.0,
                                "vibrance": -6.0,
                                "saturation": -18.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 215.0,
                                                "saturation": 0.16,
                                                "luminance": 0.02
                                },
                                "gain": {
                                                "hue": 200.0,
                                                "saturation": 0.08,
                                                "luminance": -0.02
                                }
                },
                "hsl": {
                                "blue": {
                                                "saturation": 16.0,
                                                "luminance": -8.0
                                },
                                "orange": {
                                                "saturation": -12.0
                                },
                                "green": {
                                                "saturation": -30.0
                                }
                },
                "detail": {
                                "clarity": 14.0,
                                "sharpening": 26.0,
                                "dehaze": 6.0
                }
},
        },
        {
            "name": "Moody Coffeehouse",
            "category": "Cinematic",
            "parameters": {
                "exposure": {
                                "exposure": -0.15,
                                "contrast": 22.0,
                                "highlights": -28.0,
                                "shadows": -8.0,
                                "blacks": -16.0
                },
                "white_balance": {
                                "temperature": 22.0,
                                "tint": 6.0,
                                "vibrance": 12.0,
                                "saturation": -8.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 32.0,
                                                "saturation": 0.24,
                                                "luminance": -0.06
                                },
                                "gain": {
                                                "hue": 40.0,
                                                "saturation": 0.2,
                                                "luminance": 0.04
                                }
                },
                "hsl": {
                                "green": {
                                                "saturation": -40.0,
                                                "luminance": -10.0
                                },
                                "yellow": {
                                                "hue": -6.0,
                                                "saturation": 12.0
                                },
                                "orange": {
                                                "saturation": 15.0,
                                                "luminance": -4.0
                                }
                },
                "detail": {
                                "clarity": 16.0,
                                "texture": 14.0,
                                "sharpening": 24.0
                }
},
        },
        {
            "name": "Rainy Asphalt",
            "category": "Urban / Street",
            "parameters": {
                "exposure": {
                                "contrast": 28.0,
                                "highlights": -22.0,
                                "shadows": 12.0,
                                "blacks": -22.0,
                                "whites": 18.0
                },
                "white_balance": {
                                "temperature": -12.0,
                                "tint": 4.0,
                                "vibrance": 18.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 210.0,
                                                "saturation": 0.18,
                                                "luminance": -0.06
                                },
                                "gain": {
                                                "hue": 35.0,
                                                "saturation": 0.18,
                                                "luminance": 0.06
                                }
                },
                "detail": {
                                "clarity": 26.0,
                                "texture": 20.0,
                                "sharpening": 34.0,
                                "dehaze": 10.0
                }
},
        },
        {
            "name": "Lush Pine Forest",
            "category": "Landscape",
            "parameters": {
                "exposure": {
                                "contrast": 16.0,
                                "highlights": -30.0,
                                "shadows": 18.0,
                                "whites": 6.0,
                                "blacks": -16.0
                },
                "white_balance": {
                                "temperature": -4.0,
                                "tint": -6.0,
                                "vibrance": 24.0
                },
                "hsl": {
                                "green": {
                                                "saturation": 30.0,
                                                "luminance": -8.0,
                                                "hue": -6.0
                                },
                                "yellow": {
                                                "saturation": 18.0,
                                                "hue": 8.0
                                },
                                "aqua": {
                                                "saturation": 15.0
                                }
                },
                "detail": {
                                "clarity": 16.0,
                                "sharpening": 28.0,
                                "dehaze": 8.0
                }
},
        },
        {
            "name": "Sunset Crimson Flare",
            "category": "Landscape",
            "parameters": {
                "exposure": {
                                "exposure": -0.1,
                                "contrast": 24.0,
                                "highlights": -32.0,
                                "shadows": 14.0,
                                "blacks": -20.0
                },
                "white_balance": {
                                "temperature": 32.0,
                                "tint": 12.0,
                                "vibrance": 28.0,
                                "saturation": 10.0
                },
                "color_grading": {
                                "lift": {
                                                "hue": 280.0,
                                                "saturation": 0.22,
                                                "luminance": -0.08
                                },
                                "gain": {
                                                "hue": 28.0,
                                                "saturation": 0.35,
                                                "luminance": 0.08
                                },
                                "gamma": {
                                                "hue": 10.0,
                                                "saturation": 0.15,
                                                "luminance": 0.0
                                }
                },
                "hsl": {
                                "red": {
                                                "saturation": 35.0,
                                                "luminance": 4.0
                                },
                                "orange": {
                                                "saturation": 30.0,
                                                "hue": -6.0
                                },
                                "yellow": {
                                                "saturation": 25.0,
                                                "hue": -10.0
                                }
                },
                "detail": {
                                "clarity": 14.0,
                                "sharpening": 25.0
                }
},
        },
        {
            "name": "Desert Ochre & Sand",
            "category": "Landscape",
            "parameters": {
                "exposure": {
                                "exposure": 0.18,
                                "contrast": 20.0,
                                "highlights": -20.0,
                                "shadows": 12.0,
                                "whites": 10.0
                },
                "white_balance": {
                                "temperature": 26.0,
                                "tint": 6.0,
                                "vibrance": 22.0
                },
                "hsl": {
                                "orange": {
                                                "saturation": 28.0,
                                                "luminance": 6.0
                                },
                                "yellow": {
                                                "saturation": 22.0,
                                                "luminance": 8.0
                                },
                                "blue": {
                                                "saturation": 16.0,
                                                "luminance": -10.0
                                }
                },
                "detail": {
                                "clarity": 18.0,
                                "texture": 12.0,
                                "sharpening": 28.0
                }
},
        },
        {
            "name": "Moody Autumn Foliage",
            "category": "Landscape",
            "parameters": {
                "exposure": {
                                "contrast": 22.0,
                                "highlights": -26.0,
                                "shadows": 10.0,
                                "blacks": -18.0
                },
                "white_balance": {
                                "temperature": 20.0,
                                "tint": 8.0,
                                "vibrance": 24.0,
                                "saturation": 6.0
                },
                "hsl": {
                                "orange": {
                                                "saturation": 32.0,
                                                "luminance": 2.0
                                },
                                "red": {
                                                "saturation": 28.0,
                                                "hue": 4.0
                                },
                                "yellow": {
                                                "hue": -8.0,
                                                "saturation": 20.0
                                },
                                "green": {
                                                "saturation": -35.0,
                                                "luminance": -10.0
                                }
                },
                "detail": {
                                "clarity": 16.0,
                                "sharpening": 28.0
                }
},
        },
        {
            "name": "Platinotype Fine Art",
            "category": "Monochrome",
            "parameters": {
                "white_balance": {
                                "saturation": -100.0
                },
                "exposure": {
                                "contrast": 8.0,
                                "highlights": -14.0,
                                "shadows": 16.0,
                                "whites": 6.0,
                                "blacks": -10.0
                },
                "detail": {
                                "clarity": 10.0,
                                "texture": 12.0,
                                "sharpening": 26.0
                }
},
        },
        {
            "name": "High-Key Silver Portrait",
            "category": "Monochrome",
            "parameters": {
                "white_balance": {
                                "saturation": -100.0
                },
                "exposure": {
                                "exposure": 0.35,
                                "contrast": -6.0,
                                "highlights": -12.0,
                                "shadows": 24.0,
                                "whites": 18.0,
                                "blacks": -6.0
                },
                "detail": {
                                "clarity": -4.0,
                                "sharpening": 22.0,
                                "noise_reduction": 10.0
                }
},
        },
    ]

    def __init__(self, preset_repo: PresetRepository):
        self.preset_repo = preset_repo
        self._ensure_builtins()

    def _ensure_builtins(self) -> None:
        """Seed built-in presets if catalog is empty."""
        existing = self.preset_repo.list_all()
        existing_names = {p.name for p in existing}
        for b in self.BUILTIN_PRESETS:
            if b["name"] not in existing_names:
                p = Preset.create(name=b["name"], category=b["category"], parameters=b["parameters"])
                self.preset_repo.save(p)

    def get_presets(self) -> List[Preset]:
        """Fetch all presets categorized."""
        return self.preset_repo.list_all()

    def create_preset_from_edit_state(
        self, name: str, category: str, edit_state: EditState
    ) -> Preset:
        """Capture active edit state settings into a new Preset."""
        dumped = edit_state.model_dump()
        # Keep non-destructive adjustments
        params = {
            "exposure": dumped.get("exposure", {}),
            "white_balance": dumped.get("white_balance", {}),
            "detail": dumped.get("detail", {}),
            "geometry": dumped.get("geometry", {}),
            "lens_correction": dumped.get("lens_correction", {}),
            "hsl": dumped.get("hsl", {}),
            "color_grading": dumped.get("color_grading", {}),
            "tone_curves": dumped.get("tone_curves", {}),
            "custom_metadata": {
                key: value
                for key, value in dumped.get("custom_metadata", {}).items()
                if key in {"vignette", "background_removal", "flow_nodes"}
            },
        }
        preset = Preset.create(name=name, category=category, parameters=params)
        self.preset_repo.save(preset)
        return preset

    def apply_preset(self, preset: Preset, target_state: EditState) -> EditState:
        """Apply preset parameters onto target EditState."""
        new_state = target_state.model_copy(deep=True)
        params = preset.parameters

        if "exposure" in params:
            for k, v in params["exposure"].items():
                if hasattr(new_state.exposure, k):
                    setattr(new_state.exposure, k, v)

        if "white_balance" in params:
            for k, v in params["white_balance"].items():
                if hasattr(new_state.white_balance, k):
                    setattr(new_state.white_balance, k, v)

        if "detail" in params:
            for k, v in params["detail"].items():
                if hasattr(new_state.detail, k):
                    setattr(new_state.detail, k, v)

        if "geometry" in params:
            geometry = new_state.geometry.model_dump()
            geometry.update(params["geometry"])
            new_state.geometry = type(new_state.geometry).model_validate(geometry)

        if "lens_correction" in params:
            lens_correction = new_state.lens_correction.model_dump()
            lens_correction.update(params["lens_correction"])
            new_state.lens_correction = type(new_state.lens_correction).model_validate(
                lens_correction
            )

        if "tone_curves" in params:
            curves = new_state.tone_curves.model_dump()
            curves.update(params["tone_curves"])
            new_state.tone_curves = type(new_state.tone_curves).model_validate(curves)

        if "custom_metadata" in params:
            metadata = new_state.custom_metadata.copy()
            for key, value in params["custom_metadata"].items():
                if key == "flow_nodes" and isinstance(value, dict):
                    metadata[key] = {**metadata.get(key, {}), **value}
                else:
                    metadata[key] = value
            new_state.custom_metadata = metadata

        if "hsl" in params:
            hsl_data = params["hsl"]
            for band_name, band_vals in hsl_data.items():
                band_obj = getattr(new_state.hsl, band_name, None)
                if band_obj is not None:
                    for bk, bv in band_vals.items():
                        if hasattr(band_obj, bk):
                            setattr(band_obj, bk, bv)

        if "color_grading" in params:
            cg_data = params["color_grading"]
            for wheel_name in ("lift", "gamma", "gain", "offset"):
                if wheel_name in cg_data:
                    wheel_obj = getattr(new_state.color_grading, wheel_name)
                    for wk, wv in cg_data[wheel_name].items():
                        if hasattr(wheel_obj, wk):
                            setattr(wheel_obj, wk, wv)

        return new_state

    def delete_preset(self, preset_id: str) -> None:
        """Remove user preset."""
        self.preset_repo.delete(preset_id)
