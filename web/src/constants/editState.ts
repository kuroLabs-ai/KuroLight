import { EditState } from '../interfaces/edit';

export const DEFAULT_EDIT_STATE: EditState = {
  asset_id: 'default',
  exposure: { exposure: 0.0, brightness: 0.0, contrast: 0.0, highlights: 0.0, shadows: 0.0, whites: 0.0, blacks: 0.0 },
  white_balance: { temperature: 0.0, tint: 0.0, saturation: 0.0, vibrance: 0.0 },
  detail: {
    sharpening: 0.0,
    noise_reduction: 0.0,
    clarity: 0.0,
    texture: 0.0,
    dehaze: 0.0,
    enhancement_resolution: 0,
  },
  geometry: {
    rotation: 0.0, straighten: 0.0, aspect_ratio: 'Original',
    horizontal_flip: false, vertical_flip: false,
    crop_x: 0.0, crop_y: 0.0, crop_width: 1.0, crop_height: 1.0,
  },
  lens_correction: { distortion: 0, chromatic_aberration: 0, vignette: 0 },
  color_grading: {
    lift: { hue: 0, saturation: 0, luminance: 0 },
    gamma: { hue: 0, saturation: 0, luminance: 0 },
    gain: { hue: 0, saturation: 0, luminance: 0 },
    offset: { hue: 0, saturation: 0, luminance: 0 },
    lut_name: null,
    lut_intensity: 1.0,
  },
  tone_curves: {
    rgb_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    red_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    green_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    blue_points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  },
};
