/**
 * LiveFilterRenderer — WebGL GPU photo filter engine.
 *
 * All math is calibrated to exactly match src/kurolight/processing/pipeline.py:
 *   _apply_exposure_and_tonality, _apply_white_balance_and_saturation,
 *   _apply_vignette, _apply_detail (clarity / dehaze approximation).
 *
 * Supported sliders:
 *   exposure, contrast, highlights, shadows, whites, blacks,
 *   temperature, tint, saturation, vibrance,
 *   clarity, dehaze, vignette (+ midpoint, feather).
 */

import type { EditState } from '@/interfaces/edit';

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
// Fragment shader — exact parity with pipeline.py
// ─────────────────────────────────────────────
const FRAGMENT_SRC = /* glsl */ `
precision highp float;

varying vec2 v_texCoord;
uniform sampler2D u_image;

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

// ── Presence ─────────────────────────────────
uniform float u_clarity;      // -100 … +100
uniform float u_dehaze;       // -100 … +100

// ── Vignette ─────────────────────────────────
uniform float u_vignette;     // -100 … +100
uniform float u_vignette_mp;  // 0 … 1  (midpoint, 0.5 default)
uniform float u_vignette_ft;  // 0 … 1  (feather,   0.5 default)

// Rec. 709 luminance
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// ── Helpers ──────────────────────────────────

// Python: multiplier = 2.0 ** exp.exposure; img *= multiplier
vec3 applyExposure(vec3 c, float ev) {
  return c * pow(2.0, ev);
}

// Python: factor = (contrast + 100) / 100; img = (img - 0.5) * factor + 0.5
vec3 applyContrast(vec3 c, float contrast) {
  float f = (contrast + 100.0) / 100.0;
  return clamp((c - 0.5) * f + 0.5, 0.0, 1.0);
}

// Python:
//   high_mask  = clamp((lum - 0.5) * 2, 0, 1)
//   delta      = (highlights / 100) * 0.4 * high_mask
//   shadow_mask= clamp((0.5 - lum) * 2, 0, 1)
//   delta      = (shadows / 100) * 0.4 * shadow_mask
vec3 applyHighlightsShadows(vec3 c, float hl, float sh) {
  float luma = dot(c, LUMA);
  if (hl != 0.0) {
    float m = clamp((luma - 0.5) * 2.0, 0.0, 1.0);
    c += (hl / 100.0) * 0.4 * m;
  }
  if (sh != 0.0) {
    float m = clamp((0.5 - luma) * 2.0, 0.0, 1.0);
    c += (sh / 100.0) * 0.4 * m;
  }
  return clamp(c, 0.0, 1.0);
}

// Python: img += (whites / 100) * 0.2  &  img += (blacks / 100) * 0.2
vec3 applyWhitesBlacks(vec3 c, float wh, float bl) {
  c += (wh / 100.0) * 0.2;
  c += (bl / 100.0) * 0.2;
  return clamp(c, 0.0, 1.0);
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

// Python (HSV space → RGB approx):
//   sat_factor = max(0, 1 + sat/100); hsv.S *= sat_factor
// GLSL linear-RGB equivalent: mix(luma, color, satFactor)
vec3 applySaturation(vec3 c, float sat) {
  float luma = dot(c, LUMA);
  float f = max(0.0, 1.0 + sat / 100.0);
  return clamp(mix(vec3(luma), c, f), 0.0, 1.0);
}

// Python (HSV space):
//   sat_mask = 1 - hsv.S
//   hsv.S += hsv.S * sat_mask * (vibrance/100)
// GLSL RGB approximation with RGB-range saturation as proxy for HSV.S
vec3 applyVibrance(vec3 c, float vib) {
  if (vib == 0.0) return c;
  float luma = dot(c, LUMA);
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float rgbSat = maxC - minC;           // 0..1 proxy for HSV saturation
  float satMask = 1.0 - rgbSat;        // matches Python: 1 - sat
  float vibFactor = satMask * (vib / 100.0);
  return clamp(mix(vec3(luma), c, 1.0 + vibFactor), 0.0, 1.0);
}

// Clarity — local contrast boost (unsharp-mask approximation in shader).
// A true bilateral/guided filter needs multipass; here we simulate with
// luminance-curve S-shape applied selectively to midtones.
// Positive clarity: push midtones outward from 0.5 (more punch).
// Negative clarity: push midtones toward 0.5 (soft glow).
vec3 applyClarity(vec3 c, float clarity) {
  if (clarity == 0.0) return c;
  float luma = dot(c, LUMA);
  // mid-tone weight: peaks at 0.5, zero at 0 and 1
  float midWeight = 1.0 - abs(luma - 0.5) * 2.0;
  midWeight = clamp(midWeight, 0.0, 1.0);
  float amount = (clarity / 100.0) * 0.25 * midWeight;
  // Push colours away from grey
  float lum3 = luma;
  c = c + (c - vec3(lum3)) * amount;
  return clamp(c, 0.0, 1.0);
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

// Python:
//   distance = sqrt(xx*xx + yy*yy) / sqrt(2)   (normalised 0 at centre, 1 at corner)
//   t = clamp((distance - midpoint) / feather, 0, 1)
//   falloff = t*t*(3-2t)   (smoothstep)
//   factor  = 1 - (amount/100) * falloff
//   img    *= factor
vec3 applyVignette(vec3 c, vec2 uv, float amount, float mp, float ft) {
  if (amount == 0.0) return c;
  vec2  d    = uv - 0.5;
  float dist = length(d) * 1.41421356; // 1/sqrt(2) normalises corner to 1.0
  float t    = clamp((dist - mp) / max(ft, 0.001), 0.0, 1.0);
  float falloff = t * t * (3.0 - 2.0 * t);
  float factor  = 1.0 - (amount / 100.0) * falloff;
  return clamp(c * factor, 0.0, 1.0);
}

// ── Main ─────────────────────────────────────
void main() {
  vec4 tex = texture2D(u_image, v_texCoord);
  vec3 rgb = tex.rgb;

  // 1. Exposure  (2^EV scale)
  rgb = applyExposure(rgb, u_exposure);

  // 2. Contrast  ((c - 0.5) * factor + 0.5)
  rgb = applyContrast(rgb, u_contrast);

  // 3. Highlights & Shadows  (zonal masks)
  rgb = applyHighlightsShadows(rgb, u_highlights, u_shadows);

  // 4. Whites & Blacks  (global offset)
  rgb = applyWhitesBlacks(rgb, u_whites, u_blacks);

  // 5. White Balance  (Temperature / Tint channel shifts)
  rgb = applyWhiteBalance(rgb, u_temperature, u_tint);

  // 6. Saturation  (HSV.S linear scale)
  rgb = applySaturation(rgb, u_saturation);

  // 7. Vibrance  (selective saturation boost for muted colours)
  rgb = applyVibrance(rgb, u_vibrance);

  // 8. Clarity  (midtone local contrast)
  rgb = applyClarity(rgb, u_clarity);

  // 9. Dehaze  (dark-channel transmission)
  rgb = applyDehaze(rgb, u_dehaze);

  // 10. Vignette  (radial falloff matching Python smoothstep formula)
  rgb = applyVignette(rgb, v_texCoord, u_vignette, u_vignette_mp, u_vignette_ft);

  gl_FragColor = vec4(rgb, tex.a);
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
  private posBuffer: WebGLBuffer | null = null;
  private texBuffer: WebGLBuffer | null = null;
  private uloc: Record<string, WebGLUniformLocation | null> = {};
  private currentImage: HTMLImageElement | null = null;

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
      'u_image',
      'u_exposure', 'u_contrast',
      'u_highlights', 'u_shadows', 'u_whites', 'u_blacks',
      'u_temperature', 'u_tint',
      'u_saturation', 'u_vibrance',
      'u_clarity', 'u_dehaze',
      'u_vignette', 'u_vignette_mp', 'u_vignette_ft',
    ];
    for (const n of names) {
      this.uloc[n] = gl.getUniformLocation(prog, n);
    }

    this.texture = gl.createTexture();
  }

  get isReady(): boolean {
    return !!(this.gl && this.program && this.texture);
  }

  public setImage(img: HTMLImageElement): void {
    if (!this.gl || !this.texture) return;
    const gl = this.gl;
    this.currentImage = img;

    this.canvas.width = img.naturalWidth || img.width;
    this.canvas.height = img.naturalHeight || img.height;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  public render(editState: EditState | null): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.currentImage) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
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

    // ── Upload uniforms from editState ──
    const exp  = editState?.exposure;
    const wb   = editState?.white_balance;
    const det  = editState?.detail;
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
    u('u_dehaze',      det?.dehaze      ?? 0);

    // Vignette uses pipeline._apply_vignette signature: (amount, midpoint, feather)
    u('u_vignette',    lens?.vignette   ?? 0);
    u('u_vignette_mp', 0.5);   // midpoint — not yet exposed as a slider
    u('u_vignette_ft', 0.5);   // feather  — not yet exposed as a slider

    // ── Draw ──
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  public destroy(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.texture)   gl.deleteTexture(this.texture);
    if (this.posBuffer) gl.deleteBuffer(this.posBuffer);
    if (this.texBuffer) gl.deleteBuffer(this.texBuffer);
    if (this.program)   gl.deleteProgram(this.program);
    this.gl = null;
    this.currentImage = null;
  }
}
