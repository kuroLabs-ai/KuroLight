/**
 * LiveFilterRenderer — WebGL GPU photo filter engine.
 *
 * Implements the browser-side tone, color, curve, grading, LUT, and lens stages.
 * Spatial clarity/dehaze remain single-pass approximations; lens remapping is
 * bilinear while the Python reference uses cubic interpolation.
 */

import type { EditState } from '@/interfaces/edit';
import type { AdjustmentMask, MaskStroke, RetouchSpot } from '@/interfaces/edit';
import { getGeometryRotation, getRotatedImageDimensions } from '@/utils/imageGeometry';
import type { LUTCube } from './lut';

const CURVE_CHANNELS = ['rgb_points', 'red_points', 'green_points', 'blue_points'] as const;
const HSL_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const;
const MAX_MASKS = 8;
const MAX_RETOUCH_SPOTS = 16;
const MASK_TEXTURE_SIZE = 256;

function curveSamples(points: Array<{ x: number; y: number }> | undefined): Uint8Array {
  const sorted = [...(points ?? [])].sort((a, b) => a.x - b.x);
  if (sorted.length === 0) sorted.push({ x: 0, y: 0 }, { x: 1, y: 1 });
  if (sorted[0].x > 0) sorted.unshift({ x: 0, y: 0 });
  if (sorted[sorted.length - 1].x < 1) sorted.push({ x: 1, y: 1 });

  const result = new Uint8Array(256);
  let segment = 0;
  for (let i = 0; i < result.length; i++) {
    const x = i / 255;
    while (segment < sorted.length - 2 && x > sorted[segment + 1].x) segment++;
    const left = sorted[segment];
    const right = sorted[segment + 1];
    const span = right.x - left.x;
    const t = span > 0 ? Math.max(0, Math.min(1, (x - left.x) / span)) : 1;
    const y = Math.max(0, Math.min(1, left.y + (right.y - left.y) * t));
    result[i] = Math.round(y * 255);
  }
  return result;
}

function buildCurveTexture(curves: EditState['tone_curves']): Uint8Array {
  const output = new Uint8Array(256 * 4);
  CURVE_CHANNELS.forEach((channel, index) => {
    const samples = curveSamples(curves?.[channel]);
    for (let i = 0; i < samples.length; i++) output[i * 4 + index] = samples[i];
  });
  return output;
}

function buildLUTAtlas(cube: LUTCube): { size: number; slices: number; data: Uint8Array } {
  const { size } = cube;
  const slices = Math.ceil(Math.sqrt(size));
  const atlasSize = size * slices;
  const data = new Uint8Array(atlasSize * atlasSize * 4);

  for (let b = 0; b < size; b++) {
    const tileX = b % slices;
    const tileY = Math.floor(b / slices);
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const source = ((r * size + g) * size + b) * 3;
        const target = (((tileY * size + g) * atlasSize + tileX * size + r) * 4);
        data[target] = Math.round(Math.max(0, Math.min(1, cube.data[source])) * 255);
        data[target + 1] = Math.round(Math.max(0, Math.min(1, cube.data[source + 1])) * 255);
        data[target + 2] = Math.round(Math.max(0, Math.min(1, cube.data[source + 2])) * 255);
        data[target + 3] = 255;
      }
    }
  }

  return { size, slices, data };
}

function createIdentityLUT(): LUTCube {
  return {
    size: 2,
    data: new Float32Array([
      0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1,
      1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1,
    ]),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function workflowNodeEnabled(editState: EditState | null, nodeId: string): boolean {
  const flowNodes = editState?.custom_metadata?.flow_nodes;
  if (!flowNodes || typeof flowNodes !== 'object' || Array.isArray(flowNodes)) return true;
  return (flowNodes as Record<string, unknown>)[nodeId] !== false;
}

function parseHexColor(value: unknown): [number, number, number] {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) return [0, 1, 0];
  return [
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  ];
}

function packUnit(value: number, min: number, max: number): number {
  return Math.round(clamp((value - min) / (max - min), 0, 1) * 255);
}

function maskTypeCode(type: AdjustmentMask['mask_type']): number {
  return {
    radial: 0,
    linear: 1,
    brush: 2,
    luminance_range: 3,
    color_range: 4,
  }[type];
}

function buildMaskParameterTexture(masks: AdjustmentMask[]): Uint8Array {
  const data = new Uint8Array(5 * MAX_MASKS * 4);
  const put = (maskIndex: number, texelIndex: number, values: number[]) => {
    const offset = (maskIndex * 5 + texelIndex) * 4;
    values.forEach((value, channel) => {
      data[offset + channel] = Math.round(clamp(value, 0, 1) * 255);
    });
  };
  const putPrecision = (maskIndex: number, values: number[]) => {
    const offset = maskIndex * 5 * 4;
    values.forEach((value, channel) => {
      const encoded = Math.round(clamp(value, 0, 1) * 65535);
      data[offset + channel] = encoded >> 8;
      data[offset + 4 + channel] = encoded & 255;
    });
  };

  masks.filter((mask) => mask.enabled).slice(0, MAX_MASKS).forEach((mask, index) => {
    const geometry = mask.geometry;
    const number = (key: string, fallback: number) =>
      typeof geometry[key] === 'number' ? geometry[key] as number : fallback;
    let shape = [0, 0, 0, 0];

    switch (mask.mask_type) {
      case 'radial':
        shape = [
          number('cx', 0.5),
          number('cy', 0.5),
          number('rx', 0.3),
          number('ry', 0.3),
        ];
        break;
      case 'linear':
        shape = [
          number('x1', 0.5),
          number('y1', 0),
          number('x2', 0.5),
          number('y2', 1),
        ];
        break;
      case 'luminance_range':
        shape = [
          number('luminance_min', 0.25),
          number('luminance_max', 0.8),
          number('range_softness', 0.05) * 2,
          0,
        ];
        break;
      case 'color_range':
        shape = [
          number('hue_center', 210) / 360,
          number('hue_width', 45) / 180,
          number('saturation_min', 0.1),
          number('saturation_max', 1),
        ];
        break;
    }

    putPrecision(index, shape);
    put(index, 2, [
      maskTypeCode(mask.mask_type) / 4,
      mask.inverted ? 1 : 0,
      mask.mask_type === 'luminance_range' || mask.mask_type === 'color_range'
        ? clamp(number('range_softness', 0.05), 0, 0.5)
        : clamp(mask.feather, 0, 1),
      clamp(mask.opacity, 0, 1),
    ]);
    put(index, 3, [
      (clamp(mask.exposure, -5, 5) + 5) / 10,
      (clamp(mask.contrast, -100, 100) + 100) / 200,
      (clamp(mask.temperature, -100, 100) + 100) / 200,
      (clamp(mask.saturation, -100, 100) + 100) / 200,
    ]);
    put(index, 4, [
      (clamp(mask.clarity, -100, 100) + 100) / 200,
      { replace: 0, add: 1 / 3, subtract: 2 / 3, intersect: 1 }[mask.combine_mode] ?? 0,
      0,
      0,
    ]);
  });

  return data;
}

function buildBrushMaskTexture(masks: AdjustmentMask[]): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = MASK_TEXTURE_SIZE;
  canvas.height = MASK_TEXTURE_SIZE * MAX_MASKS;
  const context = canvas.getContext('2d');
  if (!context) return new Uint8Array(canvas.width * canvas.height * 4);

  masks.slice(0, MAX_MASKS).forEach((mask, index) => {
      if (!mask.enabled || mask.mask_type !== 'brush') return;
      const strokes = mask.geometry.strokes;
      if (!Array.isArray(strokes)) return;
      const yOffset = index * MASK_TEXTURE_SIZE;
      const brushSize = typeof mask.geometry.brush_size === 'number'
        ? mask.geometry.brush_size
        : 0.04;
      const hardness = typeof mask.geometry.brush_hardness === 'number'
        ? clamp(mask.geometry.brush_hardness, 0, 1)
        : 0.7;
      context.save();
      context.translate(0, yOffset);
      context.lineCap = 'round';
      context.lineJoin = 'round';

      const drawDot = (stroke: MaskStroke) => {
        const radius = Math.max(0.5, (stroke.r ?? brushSize / 2) * MASK_TEXTURE_SIZE);
        const x = clamp(stroke.x, 0, 1) * MASK_TEXTURE_SIZE;
        const y = clamp(stroke.y, 0, 1) * MASK_TEXTURE_SIZE;
        const innerRadius = Math.min(radius * hardness, Math.max(0, radius - 0.01));
        const gradient = context.createRadialGradient(x, y, innerRadius, x, y, radius);
        gradient.addColorStop(0, `rgba(255,255,255,${clamp(stroke.o ?? 1, 0, 1)})`);
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      };

      strokes.forEach(drawDot);
      context.restore();
    });

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return new Uint8Array(image.data);
}

function buildRetouchParameterTexture(spots: RetouchSpot[]): Uint8Array {
  const data = new Uint8Array(3 * MAX_RETOUCH_SPOTS * 4);
  spots.filter((spot) => spot.enabled).slice(0, MAX_RETOUCH_SPOTS).forEach((spot, index) => {
    const target = index * 12;
    [spot.target_x, spot.target_y, spot.source_x, spot.source_y].forEach((value, channel) => {
      const encoded = Math.round(clamp(value, 0, 1) * 65535);
      data[target + channel] = encoded >> 8;
      data[target + 4 + channel] = encoded & 255;
    });
    data[target + 8] = packUnit(spot.radius, 0, 0.5);
    data[target + 9] = packUnit(spot.feather, 0, 1);
    data[target + 10] = packUnit(spot.opacity, 0, 1);
    data[target + 11] = spot.mode === 'heal' ? 255 : 0;
  });
  return data;
}

// ─────────────────────────────────────────────
// Vertex shader — simple full-screen quad
// ─────────────────────────────────────────────
const VERTEX_SRC = /* glsl */ `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying   vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord  = a_texCoord;
}
`;

// ─────────────────────────────────────────────
// Fragment shader — browser implementation calibrated against pipeline.py
// ─────────────────────────────────────────────
const FRAGMENT_SRC = /* glsl */ `
precision highp float;

varying vec2 v_texCoord;
uniform sampler2D u_image;
uniform sampler2D u_curves;
uniform sampler2D u_lut;
uniform sampler2D u_mask_params;
uniform sampler2D u_brush_mask;
uniform sampler2D u_retouch_params;
uniform float u_lut_size;
uniform float u_lut_slices;
uniform float u_lut_intensity;
uniform vec2 u_image_scale;
uniform vec2 u_rotated_image_scale;
uniform vec4 u_crop_rect;
uniform float u_geometry_rotation;
uniform vec2 u_geometry_flip;
uniform float u_mask_count;
uniform float u_retouch_count;
uniform float u_vignette_enabled;
uniform float u_vignette_amount;
uniform float u_vignette_midpoint;
uniform float u_vignette_feather;
uniform float u_chroma_key_enabled;
uniform vec3 u_chroma_key_color;
uniform float u_chroma_key_tolerance;
uniform float u_chroma_key_feather;

// ── Tone & Exposure ──────────────────────────
uniform float u_exposure;     // -5 … +5   EV
uniform float u_contrast;     // -100 … +100
uniform float u_highlights;   // -100 … +100
uniform float u_shadows;      // -100 … +100
uniform float u_whites;       // -100 … +100
uniform float u_blacks;       // -100 … +100

// ── White Balance ────────────────────────────
uniform float u_temperature;  // -100 … +100
uniform float u_tint;         // -100 … +100

// ── Color ────────────────────────────────────
uniform float u_saturation;   // -100 … +100
uniform float u_vibrance;     // -100 … +100
uniform vec3 u_hsl_bands[8];  // hue, saturation, luminance per color band
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
uniform vec3 u_offset;

// ── Presence ─────────────────────────────────
uniform float u_clarity;      // -100 … +100
uniform float u_texture;       // -100 … +100
uniform float u_sharpening;    // 0 … 100
uniform float u_noise_reduction; // 0 … 100
uniform float u_dehaze;       // -100 … +100
uniform vec2 u_texel;

// ── Lens Correction ───────────────────────────
uniform float u_distortion;             // -100 … +100
uniform float u_chromatic_aberration;   // -100 … +100
uniform float u_lens_vignette;          // 0 … 100

// Rec. 709 luminance
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float PI = 3.141592653589793;

vec3 rgbToHsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float delta = q.x - min(q.w, q.y);
  float epsilon = 1.0e-10;
  return vec3(
    abs(q.z + (q.w - q.y) / (6.0 * delta + epsilon)),
    delta / (q.x + epsilon),
    q.x
  );
}

vec3 hsvToRgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

// ── Helpers ──────────────────────────────────

// Python: multiplier = 2.0 ** exp.exposure; img *= multiplier
vec3 applyExposure(vec3 c, float ev) {
  return c * pow(2.0, ev);
}

// Python: factor = (contrast + 100) / 100; img = (img - 0.5) * factor + 0.5
vec3 applyContrast(vec3 c, float contrast) {
  float f = (contrast + 100.0) / 100.0;
  return (c - 0.5) * f + 0.5;
}

// Python:
//   high_mask  = clamp((lum - 0.5) * 2, 0, 1)
//   delta      = (highlights / 100) * 0.4 * high_mask
//   shadow_mask= clamp((0.5 - lum) * 2, 0, 1)
//   delta      = (shadows / 100) * 0.4 * shadow_mask
vec3 applyHighlightsShadows(vec3 c, float hl, float sh) {
  float luma = clamp(dot(c, LUMA), 0.0, 1.0);
  if (hl != 0.0) {
    float m = clamp((luma - 0.5) * 2.0, 0.0, 1.0);
    c += (hl / 100.0) * 0.4 * m;
  }
  if (sh != 0.0) {
    float m = clamp((0.5 - luma) * 2.0, 0.0, 1.0);
    c += (sh / 100.0) * 0.4 * m;
  }
  return c;
}

// Python: img += (whites / 100) * 0.2  &  img += (blacks / 100) * 0.2
vec3 applyWhitesBlacks(vec3 c, float wh, float bl) {
  c += (wh / 100.0) * 0.2;
  c += (bl / 100.0) * 0.2;
  return c;
}

// Python:
//   temp_shift = (temperature / 100) * 0.15; R += shift, B -= shift
//   tint_shift = (tint / 100) * 0.10;        G -= shift, R += shift*0.5, B += shift*0.5
vec3 applyWhiteBalance(vec3 c, float temp, float tint) {
  float ts = (temp / 100.0) * 0.15;
  c.r += ts;
  c.b -= ts;

  float ti = (tint / 100.0) * 0.10;
  c.g -= ti;
  c.r += ti * 0.5;
  c.b += ti * 0.5;

  return clamp(c, 0.0, 1.0);
}

vec2 reflectedUv(vec2 uv) {
  return 1.0 - abs(mod(uv, 2.0) - 1.0);
}

// Python applies saturation in HSV, matching OpenCV's float RGB↔HSV conversion.
vec3 applySaturation(vec3 c, float sat) {
  vec3 hsv = rgbToHsv(c);
  hsv.y = clamp(hsv.y * max(0.0, 1.0 + sat / 100.0), 0.0, 1.0);
  return hsvToRgb(hsv);
}

vec3 applyVibrance(vec3 c, float vib) {
  if (vib == 0.0) return c;
  vec3 hsv = rgbToHsv(c);
  hsv.y = clamp(hsv.y + hsv.y * (1.0 - hsv.y) * (vib / 100.0), 0.0, 1.0);
  return hsvToRgb(hsv);
}

vec3 applyDetail(vec3 rgb, vec2 uv, vec3 sourceCenter) {
  float noiseStrength = clamp(u_noise_reduction / 100.0, 0.0, 1.0);
  vec3 north = texture2D(u_image, reflectedUv(uv + vec2(0.0, u_texel.y))).rgb;
  vec3 south = texture2D(u_image, reflectedUv(uv - vec2(0.0, u_texel.y))).rgb;
  vec3 east = texture2D(u_image, reflectedUv(uv + vec2(u_texel.x, 0.0))).rgb;
  vec3 west = texture2D(u_image, reflectedUv(uv - vec2(u_texel.x, 0.0))).rgb;

  if (noiseStrength > 0.0) {
    float sigma = 0.015 + 0.14 * noiseStrength;
    float spatialSigma = 1.0 + 4.0 * noiseStrength;
    float spatialWeight = exp(-0.5 / (spatialSigma * spatialSigma));
    float northWeight = exp(-dot(north - sourceCenter, north - sourceCenter) / (2.0 * sigma * sigma)) * spatialWeight;
    float southWeight = exp(-dot(south - sourceCenter, south - sourceCenter) / (2.0 * sigma * sigma)) * spatialWeight;
    float eastWeight = exp(-dot(east - sourceCenter, east - sourceCenter) / (2.0 * sigma * sigma)) * spatialWeight;
    float westWeight = exp(-dot(west - sourceCenter, west - sourceCenter) / (2.0 * sigma * sigma)) * spatialWeight;
    float totalWeight = 1.0 + northWeight + southWeight + eastWeight + westWeight;
    vec3 denoised =
      (sourceCenter + north * northWeight + south * southWeight +
       east * eastWeight + west * westWeight) / totalWeight;
    rgb += denoised - sourceCenter;
  }

  float centerLuma = dot(sourceCenter, LUMA);
  float blurredLuma = dot(
    sourceCenter * 0.4 + (north + south + east + west) * 0.15,
    LUMA
  );
  float sharpenDetail = centerLuma - blurredLuma;
  float threshold = 0.004 + noiseStrength * 0.025;
  sharpenDetail = sign(sharpenDetail) * max(abs(sharpenDetail) - threshold, 0.0);
  rgb += vec3(sharpenDetail * (u_sharpening / 100.0 * 1.75));

  if (u_clarity != 0.0 || u_texture != 0.0) {
    float blurRadius = u_clarity != 0.0 ? 3.0 : 1.0;
    vec2 blurOffset = u_texel * blurRadius;
    vec3 blurNorth = texture2D(u_image, reflectedUv(uv + vec2(0.0, blurOffset.y))).rgb;
    vec3 blurSouth = texture2D(u_image, reflectedUv(uv - vec2(0.0, blurOffset.y))).rgb;
    vec3 blurEast = texture2D(u_image, reflectedUv(uv + vec2(blurOffset.x, 0.0))).rgb;
    vec3 blurWest = texture2D(u_image, reflectedUv(uv - vec2(blurOffset.x, 0.0))).rgb;
    vec3 blurred = sourceCenter * 0.4 + (blurNorth + blurSouth + blurEast + blurWest) * 0.15;
    float amount = u_clarity / 100.0 * 1.5 + u_texture / 100.0 * 0.75;
    rgb += (sourceCenter - blurred) * amount;
  }
  return clamp(rgb, 0.0, 1.0);
}

// Dehaze — positive: lift dark channel; negative: add haze.
// Matches pipeline._apply_dehaze approximation.
vec3 applyDehaze(vec3 c, float dehaze) {
  if (dehaze == 0.0) return c;
  float strength = clamp(dehaze / 100.0, -1.0, 1.0);
  if (strength > 0.0) {
    // Positive: lift shadows and boost contrast (haze removal)
    float dark = min(c.r, min(c.g, c.b));
    float transmission = clamp(1.0 - strength * (1.0 - dark), 0.35, 1.0);
    c = (c - (1.0 - transmission) * 0.85) / transmission;
  } else {
    // Negative: flatten and tint towards white (add haze)
    c = mix(c, vec3(0.85), abs(strength) * 0.3);
  }
  return clamp(c, 0.0, 1.0);
}

float bandWeight(float hue, float center) {
  float delta = abs(hue - center);
  delta = min(delta, 360.0 - delta);
  float weight = clamp(1.0 - delta / 30.0, 0.0, 1.0);
  return 0.5 * (1.0 - cos(PI * weight));
}

vec3 applyHSL(vec3 rgb) {
  vec3 hsv = rgbToHsv(rgb);
  float hue = hsv.x * 360.0;
  float deltaHue = 0.0;
  float saturationScale = 1.0;
  float deltaValue = 0.0;

  float weight = bandWeight(hue, 0.0);
  deltaHue += weight * u_hsl_bands[0].x * 0.3;
  saturationScale = max(0.0, saturationScale + weight * u_hsl_bands[0].y / 100.0);
  deltaValue += weight * u_hsl_bands[0].z * 0.0035;
  weight = bandWeight(hue, 30.0);
  deltaHue += weight * u_hsl_bands[1].x * 0.3;
  saturationScale = max(0.0, saturationScale + weight * u_hsl_bands[1].y / 100.0);
  deltaValue += weight * u_hsl_bands[1].z * 0.0035;
  weight = bandWeight(hue, 60.0);
  deltaHue += weight * u_hsl_bands[2].x * 0.3;
  saturationScale = max(0.0, saturationScale + weight * u_hsl_bands[2].y / 100.0);
  deltaValue += weight * u_hsl_bands[2].z * 0.0035;
  weight = bandWeight(hue, 120.0);
  deltaHue += weight * u_hsl_bands[3].x * 0.3;
  saturationScale = max(0.0, saturationScale + weight * u_hsl_bands[3].y / 100.0);
  deltaValue += weight * u_hsl_bands[3].z * 0.0035;
  weight = bandWeight(hue, 180.0);
  deltaHue += weight * u_hsl_bands[4].x * 0.3;
  saturationScale = max(0.0, saturationScale + weight * u_hsl_bands[4].y / 100.0);
  deltaValue += weight * u_hsl_bands[4].z * 0.0035;
  weight = bandWeight(hue, 240.0);
  deltaHue += weight * u_hsl_bands[5].x * 0.3;
  saturationScale = max(0.0, saturationScale + weight * u_hsl_bands[5].y / 100.0);
  deltaValue += weight * u_hsl_bands[5].z * 0.0035;
  weight = bandWeight(hue, 280.0);
  deltaHue += weight * u_hsl_bands[6].x * 0.3;
  saturationScale = max(0.0, saturationScale + weight * u_hsl_bands[6].y / 100.0);
  deltaValue += weight * u_hsl_bands[6].z * 0.0035;
  weight = bandWeight(hue, 325.0);
  deltaHue += weight * u_hsl_bands[7].x * 0.3;
  saturationScale = max(0.0, saturationScale + weight * u_hsl_bands[7].y / 100.0);
  deltaValue += weight * u_hsl_bands[7].z * 0.0035;

  hsv.x = fract(hsv.x + deltaHue / 360.0);
  hsv.y = clamp(hsv.y * saturationScale, 0.0, 1.0);
  hsv.z = clamp(hsv.z + deltaValue, 0.0, 1.0);
  return clamp(hsvToRgb(hsv), 0.0, 1.0);
}

vec3 applyToneCurves(vec3 rgb) {
  vec3 master = texture2D(u_curves, vec2((rgb.r * 255.0 + 0.5) / 256.0, 0.5)).rgb;
  float masterGreen = texture2D(u_curves, vec2((rgb.g * 255.0 + 0.5) / 256.0, 0.5)).r;
  float masterBlue = texture2D(u_curves, vec2((rgb.b * 255.0 + 0.5) / 256.0, 0.5)).r;
  rgb = vec3(master.r, masterGreen, masterBlue);
  rgb.r = texture2D(u_curves, vec2((rgb.r * 255.0 + 0.5) / 256.0, 0.5)).g;
  rgb.g = texture2D(u_curves, vec2((rgb.g * 255.0 + 0.5) / 256.0, 0.5)).b;
  rgb.b = texture2D(u_curves, vec2((rgb.b * 255.0 + 0.5) / 256.0, 0.5)).a;
  return clamp(rgb, 0.0, 1.0);
}

vec3 wheelColor(vec3 wheel) {
  float angle = radians(wheel.x);
  float saturation = clamp(wheel.y, 0.0, 1.0);
  float u = saturation * cos(angle) * 0.25;
  float v = saturation * sin(angle) * 0.25;
  return vec3(u, -0.5 * u - 0.866 * v, -0.5 * u + 0.866 * v);
}

vec3 sampleLUT(vec3 point) {
  vec2 tile = vec2(mod(point.b, u_lut_slices), floor(point.b / u_lut_slices));
  vec2 texel = vec2(point.r + tile.x * u_lut_size, point.g + tile.y * u_lut_size);
  float atlasSize = u_lut_size * u_lut_slices;
  return texture2D(u_lut, (texel + 0.5) / atlasSize).rgb;
}

vec3 applyColorGrading(vec3 rgb) {
  float luminance = clamp(dot(rgb, LUMA), 0.0, 1.0);
  float shadowWeight = pow(1.0 - luminance, 2.0);
  float highlightWeight = pow(luminance, 2.0);
  float midWeight = clamp(1.0 - shadowWeight - highlightWeight, 0.0, 1.0);
  float lumaDelta =
    shadowWeight * u_lift.z * 0.3 +
    midWeight * u_gamma.z * 0.3 +
    highlightWeight * u_gain.z * 0.3 +
    u_offset.z * 0.2;
  rgb += vec3(lumaDelta);
  rgb += shadowWeight * wheelColor(u_lift);
  rgb += midWeight * wheelColor(u_gamma);
  rgb += highlightWeight * wheelColor(u_gain);
  rgb = clamp(rgb, 0.0, 1.0);

  if (u_lut_intensity > 0.0 && u_lut_size >= 2.0) {
    vec3 coordinate = clamp(rgb, 0.0, 1.0) * (u_lut_size - 1.0);
    vec3 low = floor(coordinate);
    vec3 high = min(low + 1.0, vec3(u_lut_size - 1.0));
    vec3 fraction = fract(coordinate);
    vec3 c000 = sampleLUT(vec3(low.r, low.g, low.b));
    vec3 c100 = sampleLUT(vec3(high.r, low.g, low.b));
    vec3 c010 = sampleLUT(vec3(low.r, high.g, low.b));
    vec3 c110 = sampleLUT(vec3(high.r, high.g, low.b));
    vec3 c001 = sampleLUT(vec3(low.r, low.g, high.b));
    vec3 c101 = sampleLUT(vec3(high.r, low.g, high.b));
    vec3 c011 = sampleLUT(vec3(low.r, high.g, high.b));
    vec3 c111 = sampleLUT(vec3(high.r, high.g, high.b));

    vec3 c00 = mix(c000, c100, fraction.r);
    vec3 c10 = mix(c010, c110, fraction.r);
    vec3 c01 = mix(c001, c101, fraction.r);
    vec3 c11 = mix(c011, c111, fraction.r);
    vec3 c0 = mix(c00, c10, fraction.g);
    vec3 c1 = mix(c01, c11, fraction.g);
    vec3 graded = mix(c0, c1, fraction.b);
    rgb = mix(rgb, graded, clamp(u_lut_intensity, 0.0, 1.0));
  }
  return clamp(rgb, 0.0, 1.0);
}

vec4 sampleLensCorrected(vec2 uv) {
  vec2 centered = uv - 0.5;
  vec2 normalizedCenter = centered * u_image_scale;
  float radiusSquared = dot(normalizedCenter, normalizedCenter);
  float radialScale = 1.0 + (u_distortion / 100.0 * 0.5) * radiusSquared;
  vec2 baseUv = 0.5 + centered * radialScale;
  float channelShift = (u_chromatic_aberration / 100.0 * 0.01) * radiusSquared;
  vec2 redUv = reflectedUv(baseUv + centered * channelShift);
  vec2 greenBlueUv = reflectedUv(baseUv);
  vec2 blueUv = reflectedUv(baseUv - centered * channelShift);
  vec4 baseColor = texture2D(u_image, greenBlueUv);
  if (u_chromatic_aberration == 0.0) return baseColor;
  baseColor.r = texture2D(u_image, redUv).r;
  baseColor.b = texture2D(u_image, blueUv).b;
  baseColor.a = texture2D(u_image, uv).a;
  return baseColor;
}

vec3 applyLensVignette(vec3 rgb, vec2 uv) {
  if (u_lens_vignette <= 0.0) return rgb;
  vec2 normalizedCenter = (uv - 0.5) * u_image_scale;
  float radiusSquared = clamp(dot(normalizedCenter, normalizedCenter) / 0.5, 0.0, 1.0);
  float gain = exp((u_lens_vignette / 100.0) * log(2.0) * radiusSquared);
  return clamp(rgb * gain, 0.0, 1.0);
}

vec3 applyCreativeVignette(vec3 rgb, vec2 uv) {
  if (u_vignette_enabled < 0.5 || u_vignette_amount == 0.0) return rgb;
  vec2 centered = (uv - 0.5) * u_image_scale;
  float radius = length(centered) / max(length(u_image_scale * 0.5), 0.0001);
  float start = min(u_vignette_midpoint, 0.99);
  float edge = smoothstep(
    start,
    min(start + max(u_vignette_feather, 0.01), 1.0),
    radius
  );
  float gain = 1.0 - (u_vignette_amount / 100.0) * edge;
  return clamp(rgb * max(gain, 0.0), 0.0, 1.0);
}

vec4 maskParameter(float index, float texel) {
  return texture2D(u_mask_params, vec2((texel + 0.5) / 5.0, (index + 0.5) / 8.0));
}

vec4 preciseMaskShape(float index) {
  vec4 highBytes = maskParameter(index, 0.0);
  vec4 lowBytes = maskParameter(index, 1.0);
  return (highBytes * 65280.0 + lowBytes * 255.0) / 65535.0;
}

float rangeWeight(float value, float minimum, float maximum, float softness) {
  float edge = max(softness, 0.001);
  float lower = smoothstep(minimum - edge, minimum + edge, value);
  float upper = 1.0 - smoothstep(maximum - edge, maximum + edge, value);
  return clamp(lower * upper, 0.0, 1.0);
}

float maskShapeWeight(float index, vec2 imageUv, vec3 rgb) {
  vec4 shape = preciseMaskShape(index);
  vec4 settings = maskParameter(index, 2.0);
  int type = int(settings.x * 4.0 + 0.5);
  float feather = max(settings.z, 0.001);
  float weight = 0.0;

  if (type == 0) {
    vec2 radii = max(shape.zw, vec2(0.001));
    float distanceFromCenter = length((imageUv - shape.xy) / radii);
    weight = 1.0 - smoothstep(1.0 - feather, 1.0, distanceFromCenter);
  } else if (type == 1) {
    vec2 direction = shape.zw - shape.xy;
    float lengthSquared = max(dot(direction, direction), 0.0001);
    float position = dot(imageUv - shape.xy, direction) / lengthSquared;
    weight = 1.0 - smoothstep(0.0, feather, position);
  } else if (type == 2) {
    float brushY = (index + imageUv.y) / 8.0;
    weight = texture2D(u_brush_mask, vec2(imageUv.x, brushY)).r;
  } else if (type == 3) {
    float luminance = dot(rgb, LUMA);
    weight = rangeWeight(luminance, shape.x, shape.y, shape.z);
  } else {
    vec3 hsv = rgbToHsv(rgb);
    float hueDistance = abs(hsv.x * 360.0 - shape.x * 360.0);
    hueDistance = min(hueDistance, 360.0 - hueDistance);
    float hueWidth = max(shape.y * 180.0, 0.001);
    weight = (1.0 - smoothstep(hueWidth, hueWidth + max(feather * 30.0, 0.001), hueDistance))
      * rangeWeight(hsv.y, shape.z, shape.w, feather * 0.1);
  }

  if (settings.y > 0.5) weight = 1.0 - weight;
  return clamp(weight * settings.w, 0.0, 1.0);
}

vec3 applyLocalMasks(vec3 rgb, vec2 imageUv) {
  float selection = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= u_mask_count) break;
    vec4 settings = maskParameter(float(i), 2.0);
    vec4 adjustment = maskParameter(float(i), 3.0);
    vec4 extra = maskParameter(float(i), 4.0);
    float weight = maskShapeWeight(float(i), imageUv, rgb);
    int combineMode = int(extra.y * 3.0 + 0.5);
    if (combineMode == 0 || i == 0) selection = weight;
    else if (combineMode == 1) selection = max(selection, weight);
    else if (combineMode == 2) selection *= 1.0 - weight;
    else selection *= weight;

    if (selection <= 0.0) continue;
    vec3 adjusted = applyExposure(rgb, adjustment.x * 10.0 - 5.0);
    adjusted = applyContrast(adjusted, adjustment.y * 200.0 - 100.0);
    adjusted = applyWhiteBalance(adjusted, adjustment.z * 200.0 - 100.0, 0.0);
    adjusted = applySaturation(adjusted, adjustment.w * 200.0 - 100.0);
    adjusted = applyContrast(adjusted, (extra.x * 200.0 - 100.0) * 0.5);
    rgb = mix(rgb, adjusted, clamp(selection, 0.0, 1.0));
  }
  return clamp(rgb, 0.0, 1.0);
}

vec4 retouchParameter(float index, float texel) {
  return texture2D(u_retouch_params, vec2((texel + 0.5) / 3.0, (index + 0.5) / 16.0));
}

vec3 applyRetouch(vec3 rgb, vec2 imageUv) {
  for (int i = 0; i < 16; i++) {
    if (float(i) >= u_retouch_count) break;
    vec4 targetHigh = retouchParameter(float(i), 0.0);
    vec4 targetLow = retouchParameter(float(i), 1.0);
    vec4 targetSource = (targetHigh * 65280.0 + targetLow * 255.0) / 65535.0;
    vec4 settings = retouchParameter(float(i), 2.0);
    vec2 scaledDelta = (imageUv - targetSource.xy) * u_image_scale;
    float distanceFromTarget = length(scaledDelta);
    float radius = max(settings.x * 0.5 * min(u_image_scale.x, u_image_scale.y), 0.0001);
    float feather = clamp(settings.y, 0.0, 1.0);
    float weight = (1.0 - smoothstep(radius * (1.0 - feather), radius, distanceFromTarget))
      * settings.z;
    if (weight <= 0.0) continue;

    vec2 sourceUv = clamp(targetSource.zw + imageUv - targetSource.xy, 0.0, 1.0);
    vec3 source = sampleLensCorrected(sourceUv).rgb;
    if (settings.w > 0.5) {
      vec2 texel = u_texel;
      vec3 sourceAverage = (
        source +
        sampleLensCorrected(clamp(sourceUv + vec2(texel.x, 0.0), 0.0, 1.0)).rgb +
        sampleLensCorrected(clamp(sourceUv - vec2(texel.x, 0.0), 0.0, 1.0)).rgb +
        sampleLensCorrected(clamp(sourceUv + vec2(0.0, texel.y), 0.0, 1.0)).rgb +
        sampleLensCorrected(clamp(sourceUv - vec2(0.0, texel.y), 0.0, 1.0)).rgb
      ) / 5.0;
      vec3 targetAverage = (
        sampleLensCorrected(imageUv).rgb +
        sampleLensCorrected(clamp(imageUv + vec2(texel.x, 0.0), 0.0, 1.0)).rgb +
        sampleLensCorrected(clamp(imageUv - vec2(texel.x, 0.0), 0.0, 1.0)).rgb +
        sampleLensCorrected(clamp(imageUv + vec2(0.0, texel.y), 0.0, 1.0)).rgb +
        sampleLensCorrected(clamp(imageUv - vec2(0.0, texel.y), 0.0, 1.0)).rgb
      ) / 5.0;
      source += targetAverage - sourceAverage;
    }
    rgb = mix(rgb, source, clamp(weight, 0.0, 1.0));
  }
  return clamp(rgb, 0.0, 1.0);
}

// ── Main ─────────────────────────────────────
void main() {
  vec2 outputUv = u_crop_rect.xy + v_texCoord * u_crop_rect.zw;
  float cosine = cos(u_geometry_rotation);
  float sine = sin(u_geometry_rotation);
  vec2 rotatedScale = u_rotated_image_scale;
  vec2 rotatedOffset = (outputUv - 0.5) * rotatedScale;
  vec2 sourceOffset = vec2(
    cosine * rotatedOffset.x - sine * rotatedOffset.y,
    sine * rotatedOffset.x + cosine * rotatedOffset.y
  );
  vec2 sourceUv = 0.5 + sourceOffset / u_image_scale;
  sourceUv = mix(sourceUv, 1.0 - sourceUv, u_geometry_flip);
  float geometryValid =
    step(0.0, sourceUv.x) * step(sourceUv.x, 1.0) *
    step(0.0, sourceUv.y) * step(sourceUv.y, 1.0);
  vec2 imageUv = clamp(sourceUv, 0.0, 1.0);
  vec4 tex = sampleLensCorrected(imageUv);
  vec3 rgb = tex.rgb;
  rgb = applyRetouch(rgb, imageUv);

  // 1. Exposure  (2^EV scale)
  rgb = applyExposure(rgb, u_exposure);

  // 2. Contrast  ((c - 0.5) * factor + 0.5)
  rgb = applyContrast(rgb, u_contrast);

  // 3. Highlights & Shadows  (zonal masks)
  rgb = applyHighlightsShadows(rgb, u_highlights, u_shadows);

  // 4. Whites & Blacks  (global offset)
  rgb = applyWhitesBlacks(rgb, u_whites, u_blacks);
  rgb = clamp(rgb, 0.0, 1.0);

  // 5. White Balance  (Temperature / Tint channel shifts)
  rgb = applyWhiteBalance(rgb, u_temperature, u_tint);

  // 6. Saturation  (HSV.S linear scale)
  rgb = applySaturation(rgb, u_saturation);

  // 7. Vibrance  (selective saturation boost for muted colours)
  rgb = applyVibrance(rgb, u_vibrance);

  // 8. Selective color adjustments
  rgb = applyHSL(rgb);

  // 9. Master and per-channel tone curves
  rgb = applyToneCurves(rgb);

  // 10. Lift, gamma, gain, offset and 3D LUT
  rgb = applyColorGrading(rgb);

  // 11. Noise reduction, sharpening, clarity and texture
  rgb = applyDetail(rgb, imageUv, texture2D(u_image, imageUv).rgb);

  // 12. Dehaze  (dark-channel transmission)
  rgb = applyDehaze(rgb, u_dehaze);

  // 13. Lens vignette correction, matching LensCorrectionEngine.
  rgb = applyLensVignette(rgb, imageUv);
  rgb = applyLocalMasks(rgb, imageUv);
  rgb = applyCreativeVignette(rgb, imageUv);

  float alpha = tex.a * geometryValid;
  if (u_chroma_key_enabled > 0.5) {
    float chromaDistance = length(tex.rgb - u_chroma_key_color) / 1.7320508;
    alpha *= smoothstep(
      u_chroma_key_tolerance,
      u_chroma_key_tolerance + max(u_chroma_key_feather, 0.0001),
      chromaDistance
    );
  }
  gl_FragColor = vec4(rgb * geometryValid, alpha);
}
`;

// ─────────────────────────────────────────────
// Shader helpers
// ─────────────────────────────────────────────
function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('[KuroLight WebGL] Shader error:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

// ─────────────────────────────────────────────
// LiveFilterRenderer
// ─────────────────────────────────────────────
export class LiveFilterRenderer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private curveTexture: WebGLTexture | null = null;
  private lutTexture: WebGLTexture | null = null;
  private maskTexture: WebGLTexture | null = null;
  private brushMaskTexture: WebGLTexture | null = null;
  private retouchTexture: WebGLTexture | null = null;
  private posBuffer: WebGLBuffer | null = null;
  private texBuffer: WebGLBuffer | null = null;
  private uloc: Record<string, WebGLUniformLocation | null> = {};
  private currentImage: HTMLImageElement | null = null;
  private lutSize = 2;
  private lutSlices = 2;
  private curveSignature: string | null = null;
  private maskSignature: string | null = null;
  private retouchSignature: string | null = null;
  private overflowSignature: string | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.initGL();
  }

  private initGL(): void {
    const gl = this.canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
    });
    if (!gl) {
      console.warn('[KuroLight] WebGL unavailable — live filters disabled');
      return;
    }
    this.gl = gl;

    const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vert || !frag) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[KuroLight WebGL] Link error:', gl.getProgramInfoLog(prog));
      return;
    }
    this.program = prog;
    gl.useProgram(prog);

    // Full-screen quad positions (clip space)
    this.posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    // UV coords (flipped Y: WebGL origin = bottom-left, image origin = top-left)
    this.texBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
      gl.STATIC_DRAW,
    );

    // Cache all uniform locations
    const names = [
      'u_image', 'u_curves', 'u_lut', 'u_lut_size', 'u_lut_slices',
      'u_lut_intensity', 'u_image_scale', 'u_rotated_image_scale',
      'u_crop_rect', 'u_geometry_rotation', 'u_geometry_flip',
      'u_mask_params', 'u_brush_mask', 'u_retouch_params',
      'u_mask_count', 'u_retouch_count',
      'u_vignette_enabled', 'u_vignette_amount', 'u_vignette_midpoint', 'u_vignette_feather',
      'u_chroma_key_enabled', 'u_chroma_key_color', 'u_chroma_key_tolerance', 'u_chroma_key_feather',
      'u_exposure', 'u_contrast',
      'u_highlights', 'u_shadows', 'u_whites', 'u_blacks',
      'u_temperature', 'u_tint',
      'u_saturation', 'u_vibrance',
      'u_clarity', 'u_texture', 'u_sharpening', 'u_noise_reduction', 'u_dehaze', 'u_texel',
      'u_distortion', 'u_chromatic_aberration', 'u_lens_vignette',
      'u_lift', 'u_gamma', 'u_gain', 'u_offset',
    ];
    for (const n of names) {
      this.uloc[n] = gl.getUniformLocation(prog, n);
    }
    this.uloc['u_hsl_bands[0]'] = gl.getUniformLocation(prog, 'u_hsl_bands[0]');

    this.texture = gl.createTexture();
    this.curveTexture = gl.createTexture();
    this.lutTexture = gl.createTexture();
    this.maskTexture = gl.createTexture();
    this.brushMaskTexture = gl.createTexture();
    this.retouchTexture = gl.createTexture();
    this.setLUT(createIdentityLUT());
  }

  get isReady(): boolean {
    return !!(
      this.gl && this.program && this.texture && this.curveTexture && this.lutTexture &&
      this.maskTexture && this.brushMaskTexture && this.retouchTexture
    );
  }

  public setImage(img: HTMLImageElement): void {
    if (!this.gl || !this.texture) return;
    const gl = this.gl;
    this.currentImage = img;

    this.canvas.width = img.naturalWidth || img.width;
    this.canvas.height = img.naturalHeight || img.height;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  public setLUT(cube: LUTCube | null): void {
    const gl = this.gl;
    if (!gl || !this.lutTexture) return;

    const atlas = buildLUTAtlas(cube ?? createIdentityLUT());
    this.lutSize = atlas.size;
    this.lutSlices = Math.ceil(Math.sqrt(atlas.size));
    const atlasSize = atlas.size * this.lutSlices;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      atlasSize,
      atlasSize,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      atlas.data,
    );
    gl.activeTexture(gl.TEXTURE0);
  }

  public render(editState: EditState | null): void {
    const gl = this.gl;
    if (
      !gl || !this.program || !this.currentImage || !this.curveTexture || !this.lutTexture ||
      !this.maskTexture || !this.brushMaskTexture || !this.retouchTexture
    ) return;

    const imageWidth = this.currentImage.naturalWidth || this.currentImage.width;
    const imageHeight = this.currentImage.naturalHeight || this.currentImage.height;
    const geometry = workflowNodeEnabled(editState, 'geometry') ? editState?.geometry : undefined;
    const cropX = clamp(geometry?.crop_x ?? 0, 0, 0.999);
    const cropY = clamp(geometry?.crop_y ?? 0, 0, 0.999);
    const cropWidth = clamp(geometry?.crop_width ?? 1, 0.001, 1 - cropX);
    const cropHeight = clamp(geometry?.crop_height ?? 1, 0.001, 1 - cropY);
    const rotation = geometry ? getGeometryRotation(geometry) : 0;
    const rotatedDimensions = getRotatedImageDimensions(imageWidth, imageHeight, rotation);
    const outputWidth = Math.max(1, Math.round(rotatedDimensions.width * cropWidth));
    const outputHeight = Math.max(1, Math.round(rotatedDimensions.height * cropHeight));
    if (this.canvas.width !== outputWidth || this.canvas.height !== outputHeight) {
      this.canvas.width = outputWidth;
      this.canvas.height = outputHeight;
    }
    gl.viewport(0, 0, outputWidth, outputHeight);
    gl.useProgram(this.program);

    // ── Bind vertex attributes ──
    const aPos = gl.getAttribLocation(this.program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const aTex = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texBuffer);
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 0, 0);

    // ── Bind texture ──
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uloc['u_image'], 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.uniform1i(this.uloc['u_lut'], 1);
    gl.uniform1f(this.uloc['u_lut_size'], this.lutSize);
    gl.uniform1f(this.uloc['u_lut_slices'], this.lutSlices);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const toneCurves = workflowNodeEnabled(editState, 'curves') ? editState?.tone_curves : undefined;
    const curveSignature = JSON.stringify(toneCurves ?? null);
    if (curveSignature !== this.curveSignature) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        256,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        buildCurveTexture(toneCurves),
      );
      this.curveSignature = curveSignature;
    }
    gl.uniform1i(this.uloc['u_curves'], 2);

    const enabledMasks = (editState?.masks ?? []).filter((mask) => mask.enabled);
    const enabledRetouchSpots = (editState?.retouch_spots ?? []).filter((spot) => spot.enabled);
    const overflowSignature = `${enabledMasks.length}:${enabledRetouchSpots.length}`;
    if (
      overflowSignature !== this.overflowSignature &&
      (enabledMasks.length > MAX_MASKS || enabledRetouchSpots.length > MAX_RETOUCH_SPOTS)
    ) {
      console.warn(
        `[KuroLight WebGL] Preview supports up to ${MAX_MASKS} enabled masks and ${MAX_RETOUCH_SPOTS} enabled retouch spots; excess items are not rendered.`,
      );
    }
    this.overflowSignature = overflowSignature;
    const masks = enabledMasks.slice(0, MAX_MASKS);
    const maskSignature = JSON.stringify(masks);
    if (maskSignature !== this.maskSignature) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 5, MAX_MASKS, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        buildMaskParameterTexture(masks),
      );

      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.brushMaskTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, MASK_TEXTURE_SIZE, MASK_TEXTURE_SIZE * MAX_MASKS,
        0, gl.RGBA, gl.UNSIGNED_BYTE, buildBrushMaskTexture(masks),
      );
      this.maskSignature = maskSignature;
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(this.uloc['u_mask_params'], 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.brushMaskTexture);
    gl.uniform1i(this.uloc['u_brush_mask'], 4);
    gl.uniform1f(this.uloc['u_mask_count'], masks.length);

    const retouchSpots = enabledRetouchSpots.slice(0, MAX_RETOUCH_SPOTS);
    const retouchSignature = JSON.stringify(retouchSpots);
    if (retouchSignature !== this.retouchSignature) {
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this.retouchTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, 3, MAX_RETOUCH_SPOTS, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        buildRetouchParameterTexture(retouchSpots),
      );
      this.retouchSignature = retouchSignature;
    }
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.retouchTexture);
    gl.uniform1i(this.uloc['u_retouch_params'], 5);
    gl.uniform1f(this.uloc['u_retouch_count'], retouchSpots.length);

    // ── Upload uniforms from editState ──
    const exp = workflowNodeEnabled(editState, 'tone') ? editState?.exposure : undefined;
    const wb = workflowNodeEnabled(editState, 'color') ? editState?.white_balance : undefined;
    const detail = editState?.detail;
    const det = workflowNodeEnabled(editState, 'detail') ? detail : undefined;
    const lens = editState?.lens_correction;

    const u = (name: string, val: number) =>
      gl.uniform1f(this.uloc[name], val);

    u('u_exposure',    exp?.exposure    ?? 0);
    u('u_contrast',    exp?.contrast    ?? 0);
    u('u_highlights',  exp?.highlights  ?? 0);
    u('u_shadows',     exp?.shadows     ?? 0);
    u('u_whites',      exp?.whites      ?? 0);
    u('u_blacks',      exp?.blacks      ?? 0);

    u('u_temperature', wb?.temperature  ?? 0);
    u('u_tint',        wb?.tint         ?? 0);
    u('u_saturation',  wb?.saturation   ?? 0);
    u('u_vibrance',    wb?.vibrance     ?? 0);

    u('u_clarity',     det?.clarity     ?? 0);
    u('u_texture', det?.texture ?? 0);
    u('u_sharpening', det?.sharpening ?? 0);
    u('u_noise_reduction', det?.noise_reduction ?? 0);
    u('u_dehaze', workflowNodeEnabled(editState, 'dehaze') ? detail?.dehaze ?? 0 : 0);
    u('u_distortion', lens?.distortion ?? 0);
    u('u_chromatic_aberration', lens?.chromatic_aberration ?? 0);
    u('u_lens_vignette', lens?.vignette ?? 0);
    const gradingEnabled = workflowNodeEnabled(editState, 'grading');
    const colorGrading = gradingEnabled ? editState?.color_grading : undefined;
    u('u_lut_intensity', colorGrading?.lut_name
      ? colorGrading.lut_intensity ?? 1
      : 0);
    const vignetteSettings = editState?.custom_metadata?.vignette;
    const vignette =
      typeof vignetteSettings === 'object' && vignetteSettings !== null
        ? vignetteSettings as Record<string, unknown>
        : {};
    u('u_vignette_enabled',
      workflowNodeEnabled(editState, 'vignette') && vignette.enabled === true ? 1 : 0);
    u(
      'u_vignette_amount',
      typeof vignette.amount === 'number' && Number.isFinite(vignette.amount)
        ? clamp(vignette.amount, -100, 100)
        : 0,
    );
    u(
      'u_vignette_midpoint',
      typeof vignette.midpoint === 'number' && Number.isFinite(vignette.midpoint)
        ? clamp(vignette.midpoint, 0, 1)
        : 0.5,
    );
    u(
      'u_vignette_feather',
      typeof vignette.feather === 'number' && Number.isFinite(vignette.feather)
        ? clamp(vignette.feather, 0.01, 1)
        : 0.5,
    );
    const backgroundRemovalValue = editState?.custom_metadata?.background_removal;
    const backgroundRemoval =
        typeof backgroundRemovalValue === 'object' && backgroundRemovalValue !== null
          ? backgroundRemovalValue as Record<string, unknown>
          : {};
    const keyColor = parseHexColor(backgroundRemoval.color);
    u(
        'u_chroma_key_enabled',
        workflowNodeEnabled(editState, 'background_removal') &&
          backgroundRemoval.enabled === true
          ? 1
          : 0,
    );
    gl.uniform3f(this.uloc['u_chroma_key_color'], keyColor[0], keyColor[1], keyColor[2]);
    u(
        'u_chroma_key_tolerance',
        typeof backgroundRemoval.tolerance === 'number' && Number.isFinite(backgroundRemoval.tolerance)
          ? clamp(backgroundRemoval.tolerance, 0, 1)
          : 0.18,
    );
    u(
        'u_chroma_key_feather',
        typeof backgroundRemoval.feather === 'number' && Number.isFinite(backgroundRemoval.feather)
          ? clamp(backgroundRemoval.feather, 0.001, 0.5)
          : 0.08,
    );

    const dimensionScale = Math.max(imageWidth, imageHeight);
    gl.uniform2f(
      this.uloc['u_image_scale'],
      imageWidth / dimensionScale,
      imageHeight / dimensionScale,
    );
    gl.uniform2f(
      this.uloc['u_rotated_image_scale'],
      rotatedDimensions.width / dimensionScale,
      rotatedDimensions.height / dimensionScale,
    );
    gl.uniform1f(this.uloc['u_geometry_rotation'], (rotation * Math.PI) / 180);
    gl.uniform2f(
      this.uloc['u_geometry_flip'],
      geometry?.horizontal_flip ? 1 : 0,
      geometry?.vertical_flip ? 1 : 0,
    );
    gl.uniform2f(this.uloc['u_texel'], 1 / imageWidth, 1 / imageHeight);
    gl.uniform4f(this.uloc['u_crop_rect'], cropX, cropY, cropWidth, cropHeight);

    const hsl = workflowNodeEnabled(editState, 'hsl') ? editState?.hsl : undefined;
    const hslValues = new Float32Array(24);
    HSL_BANDS.forEach((band, index) => {
      const value = hsl?.[band];
      hslValues[index * 3] = value?.hue ?? 0;
      hslValues[index * 3 + 1] = value?.saturation ?? 0;
      hslValues[index * 3 + 2] = value?.luminance ?? 0;
    });
    gl.uniform3fv(this.uloc['u_hsl_bands[0]'], hslValues);

    const wheel = (name: 'lift' | 'gamma' | 'gain' | 'offset') =>
      colorGrading?.[name] ?? { hue: 0, saturation: 0, luminance: 0 };
    for (const name of ['lift', 'gamma', 'gain', 'offset'] as const) {
      const value = wheel(name);
      gl.uniform3f(
        this.uloc[`u_${name}`],
        value.hue,
        value.saturation,
        value.luminance,
      );
    }

    // ── Draw ──
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  public destroy(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.texture)   gl.deleteTexture(this.texture);
    if (this.curveTexture) gl.deleteTexture(this.curveTexture);
    if (this.lutTexture) gl.deleteTexture(this.lutTexture);
    if (this.maskTexture) gl.deleteTexture(this.maskTexture);
    if (this.brushMaskTexture) gl.deleteTexture(this.brushMaskTexture);
    if (this.retouchTexture) gl.deleteTexture(this.retouchTexture);
    if (this.posBuffer) gl.deleteBuffer(this.posBuffer);
    if (this.texBuffer) gl.deleteBuffer(this.texBuffer);
    if (this.program)   gl.deleteProgram(this.program);
    this.gl = null;
    this.currentImage = null;
  }
}
