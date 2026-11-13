import type { EditState } from '@/interfaces/edit';

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision highp float;

varying vec2 v_texCoord;
uniform sampler2D u_image;

// Exposure & Tone
uniform float u_exposure;    // -5.0 to +5.0
uniform float u_contrast;    // -100 to +100
uniform float u_highlights;  // -100 to +100
uniform float u_shadows;     // -100 to +100
uniform float u_whites;      // -100 to +100
uniform float u_blacks;      // -100 to +100

// White Balance & Color
uniform float u_temperature; // -100 to +100
uniform float u_tint;        // -100 to +100
uniform float u_saturation;  // -100 to +100
uniform float u_vibrance;    // -100 to +100

// Vignette
uniform float u_vignette;    // -100 to +100

// RGB Luminance coefficients (Rec. 709)
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

vec3 applyExposure(vec3 color, float ev) {
  return color * pow(2.0, ev);
}

vec3 applyContrast(vec3 color, float contrast) {
  float factor = (1.0 + contrast / 100.0);
  return clamp((color - 0.5) * factor + 0.5, 0.0, 1.0);
}

vec3 applyTones(vec3 color, float hl, float sh, float wh, float bl) {
  float luma = dot(color, LUMA);

  // Shadows lift (affects luma < 0.5)
  if (sh != 0.0) {
    float shadowMask = clamp(1.0 - (luma * 2.0), 0.0, 1.0);
    color += (sh / 200.0) * shadowMask * (1.0 - color);
  }

  // Highlights compression (affects luma > 0.5)
  if (hl != 0.0) {
    float highlightMask = clamp((luma - 0.5) * 2.0, 0.0, 1.0);
    color += (hl / 200.0) * highlightMask * color;
  }

  // Whites and Blacks fine-tuning
  if (wh != 0.0) {
    color += (wh / 300.0) * clamp((luma - 0.75) * 4.0, 0.0, 1.0);
  }
  if (bl != 0.0) {
    color += (bl / 300.0) * clamp(1.0 - (luma * 4.0), 0.0, 1.0);
  }

  return clamp(color, 0.0, 1.0);
}

vec3 applyWhiteBalance(vec3 color, float temp, float tint) {
  // Temperature: warm (boost red, drop blue) / cool (drop red, boost blue)
  float tFactor = temp / 200.0;
  color.r += tFactor * 0.4;
  color.b -= tFactor * 0.4;

  // Tint: green vs magenta
  float tintFactor = tint / 200.0;
  color.g -= tintFactor * 0.4;
  color.r += tintFactor * 0.2;
  color.b += tintFactor * 0.2;

  return clamp(color, 0.0, 1.0);
}

vec3 applySaturationAndVibrance(vec3 color, float sat, float vib) {
  float luma = dot(color, LUMA);

  // Saturation
  if (sat != 0.0) {
    float satFactor = 1.0 + (sat / 100.0);
    color = mix(vec3(luma), color, satFactor);
  }

  // Vibrance: affects less-saturated colors more strongly
  if (vib != 0.0) {
    float maxC = max(color.r, max(color.g, color.b));
    float minC = min(color.r, min(color.g, color.b));
    float currentSat = (maxC - minC) / (maxC + 0.001);
    float vibFactor = (1.0 - currentSat) * (vib / 100.0);
    color = mix(vec3(luma), color, 1.0 + vibFactor);
  }

  return clamp(color, 0.0, 1.0);
}

vec3 applyVignette(vec3 color, vec2 uv, float vignette) {
  if (vignette == 0.0) return color;
  vec2 center = uv - vec2(0.5);
  float dist = length(center) * 1.4142; // Normalized corner = 1.0
  float vigAmount = vignette / 100.0;
  float vigMask = smoothstep(0.4, 0.95, dist);
  if (vigAmount < 0.0) {
    // Darken outer edges
    color *= (1.0 + vigAmount * vigMask);
  } else {
    // Lighten outer edges
    color = mix(color, vec3(1.0), vigAmount * vigMask * 0.5);
  }
  return clamp(color, 0.0, 1.0);
}

void main() {
  vec4 texColor = texture2D(u_image, v_texCoord);
  vec3 rgb = texColor.rgb;

  // 1. Exposure
  rgb = applyExposure(rgb, u_exposure);

  // 2. Contrast
  rgb = applyContrast(rgb, u_contrast);

  // 3. Tonal adjustments (Highlights, Shadows, Whites, Blacks)
  rgb = applyTones(rgb, u_highlights, u_shadows, u_whites, u_blacks);

  // 4. White Balance (Temperature, Tint)
  rgb = applyWhiteBalance(rgb, u_temperature, u_tint);

  // 5. Saturation & Vibrance
  rgb = applySaturationAndVibrance(rgb, u_saturation, u_vibrance);

  // 6. Vignette
  rgb = applyVignette(rgb, v_texCoord, u_vignette);

  gl_FragColor = vec4(rgb, texColor.a);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export class LiveFilterRenderer {
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private uniformLocations: Record<string, WebGLUniformLocation | null> = {};
  private currentImage: HTMLImageElement | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.initGL();
  }

  private initGL(): void {
    const gl = this.canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    if (!gl) {
      console.warn('WebGL not supported for live photo filters, falling back to 2D context');
      return;
    }
    this.gl = gl;

    const vertShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vertShader || !fragShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    this.program = program;
    gl.useProgram(program);

    // Buffers for full-screen quad
    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
      gl.STATIC_DRAW
    );

    // Cache uniform locations
    const uniforms = [
      'u_image',
      'u_exposure',
      'u_contrast',
      'u_highlights',
      'u_shadows',
      'u_whites',
      'u_blacks',
      'u_temperature',
      'u_tint',
      'u_saturation',
      'u_vibrance',
      'u_vignette',
    ];
    uniforms.forEach((name) => {
      this.uniformLocations[name] = gl.getUniformLocation(program, name);
    });

    this.texture = gl.createTexture();
  }

  public setImage(image: HTMLImageElement): void {
    if (!this.gl || !this.texture) return;
    this.currentImage = image;
    const gl = this.gl;

    this.canvas.width = image.naturalWidth || image.width;
    this.canvas.height = image.naturalHeight || image.height;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  public render(editState: EditState | null): void {
    const gl = this.gl;
    if (!gl || !this.program || !this.currentImage) return;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    // Bind Attributes
    const aPos = gl.getAttribLocation(this.program, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const aTex = gl.getAttribLocation(this.program, 'a_texCoord');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 0, 0);

    // Set Uniforms from EditState
    const exp = editState?.exposure;
    const wb = editState?.white_balance;
    const lens = editState?.lens_correction;

    gl.uniform1f(this.uniformLocations['u_exposure'], exp?.exposure ?? 0);
    gl.uniform1f(this.uniformLocations['u_contrast'], exp?.contrast ?? 0);
    gl.uniform1f(this.uniformLocations['u_highlights'], exp?.highlights ?? 0);
    gl.uniform1f(this.uniformLocations['u_shadows'], exp?.shadows ?? 0);
    gl.uniform1f(this.uniformLocations['u_whites'], exp?.whites ?? 0);
    gl.uniform1f(this.uniformLocations['u_blacks'], exp?.blacks ?? 0);

    gl.uniform1f(this.uniformLocations['u_temperature'], wb?.temperature ?? 0);
    gl.uniform1f(this.uniformLocations['u_tint'], wb?.tint ?? 0);
    gl.uniform1f(this.uniformLocations['u_saturation'], wb?.saturation ?? 0);
    gl.uniform1f(this.uniformLocations['u_vibrance'], wb?.vibrance ?? 0);

    gl.uniform1f(this.uniformLocations['u_vignette'], lens?.vignette ?? 0);

    // Texture Unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniformLocations['u_image'], 0);

    // Draw full-screen quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  public destroy(): void {
    if (!this.gl) return;
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.texCoordBuffer) gl.deleteBuffer(this.texCoordBuffer);
    if (this.program) gl.deleteProgram(this.program);
    this.gl = null;
    this.currentImage = null;
  }
}
