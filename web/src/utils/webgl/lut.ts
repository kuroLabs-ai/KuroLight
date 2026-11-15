import { get, set } from 'idb-keyval';

export interface LUTCube {
  size: number;
  data: Float32Array;
}

const LUT_STORAGE_PREFIX = 'kuro_lut:';
const LUT_CACHE = new Map<string, LUTCube>();
const BUILTIN_LUT_NAMES = new Set([
  'Teal & Orange',
  'Film Bleach Bypass',
  'Vintage Warmth',
]);

export function isBuiltinLUT(name: string): boolean {
  return BUILTIN_LUT_NAMES.has(name);
}

export function encodeLUTCube(cube: LUTCube): string {
  const bytes = new Uint8Array(cube.data.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < cube.data.length; index += 1) {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, cube.data[index], true);
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function parseCubeText(text: string): LUTCube {
  let size = 33;
  const entries: number[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('TITLE')) continue;
    if (line.startsWith('LUT_3D_SIZE')) {
      size = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (line.startsWith('DOMAIN_MIN') || line.startsWith('DOMAIN_MAX')) {
      const [directive, ...domainValues] = line.split(/\s+/);
      const expected = directive === 'DOMAIN_MIN' ? 0 : 1;
      const domain = domainValues.map(Number);
      if (domain.length !== 3 || domain.some((value) => value !== expected)) {
        throw new Error('Custom .cube input domains are not supported.');
      }
      continue;
    }

    const values = line.split(/\s+/).map(Number);
    if (values.length === 3 && values.every(Number.isFinite)) {
      entries.push(...values);
    }
  }

  if (!Number.isInteger(size) || size < 2 || size > 64) {
    throw new Error('The LUT cube size must be an integer between 2 and 64.');
  }
  if (entries.length !== size * size * size * 3) {
    throw new Error(`Invalid .cube file: expected ${size ** 3} color entries.`);
  }

  const data = new Float32Array(entries.length);
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const fileOffset = ((b * size + g) * size + r) * 3;
        const cubeOffset = ((r * size + g) * size + b) * 3;
        data[cubeOffset] = entries[fileOffset];
        data[cubeOffset + 1] = entries[fileOffset + 1];
        data[cubeOffset + 2] = entries[fileOffset + 2];
      }
    }
  }
  return { size, data };
}

export function registerCustomLUT(name: string, cube: LUTCube): void {
  LUT_CACHE.set(name, cube);
  void set(`${LUT_STORAGE_PREFIX}${name}`, {
    size: cube.size,
    data: Array.from(cube.data),
  }).catch((error: unknown) => {
    console.warn('[KuroLight] Failed to cache custom LUT:', error);
  });
}

function createBuiltinLUT(name: string, size = 17): LUTCube {
  const data = new Float32Array(size * size * size * 3);
  const index = (r: number, g: number, b: number) => ((r * size + g) * size + b) * 3;

  for (let r = 0; r < size; r++) {
    for (let g = 0; g < size; g++) {
      for (let b = 0; b < size; b++) {
        const color = [r / (size - 1), g / (size - 1), b / (size - 1)];
        const luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];

        if (name === 'Teal & Orange') {
          const shadowWeight = (1 - luminance) ** 1.5;
          const highlightWeight = luminance ** 1.5;
          color[0] += shadowWeight * -0.08 + highlightWeight * 0.15;
          color[1] += shadowWeight * 0.04 + highlightWeight * 0.08;
          color[2] += shadowWeight * 0.18 - highlightWeight * 0.05;
        } else if (name === 'Film Bleach Bypass') {
          const curve =
            luminance < 0.5
              ? 2 * luminance ** 2
              : 1 - 2 * (1 - luminance) ** 2;
          for (let channel = 0; channel < 3; channel++) {
            color[channel] = 0.65 * curve + 0.35 * color[channel];
          }
        } else {
          color[0] = color[0] * 1.08 + 0.04;
          color[1] = color[1] * 1.02 + 0.02;
          color[2] = color[2] * 0.9 + 0.05;
        }

        const out = index(r, g, b);
        data[out] = Math.max(0, Math.min(1, color[0]));
        data[out + 1] = Math.max(0, Math.min(1, color[1]));
        data[out + 2] = Math.max(0, Math.min(1, color[2]));
      }
    }
  }

  return { size, data };
}

export async function loadLUT(name: string): Promise<LUTCube | null> {
  if (BUILTIN_LUT_NAMES.has(name)) return createBuiltinLUT(name);
  const cached = LUT_CACHE.get(name);
  if (cached) return cached;

  try {
    const stored = await get<{ size: number; data: number[] }>(`${LUT_STORAGE_PREFIX}${name}`);
    if (
      !stored ||
      !Number.isInteger(stored.size) ||
      stored.size < 2 ||
      stored.size > 64 ||
      stored.data.length !== stored.size ** 3 * 3
    ) {
      return null;
    }
    const cube = { size: stored.size, data: Float32Array.from(stored.data) };
    LUT_CACHE.set(name, cube);
    return cube;
  } catch {
    return null;
  }
}
