import type { ColorScopes, HistogramData } from '@/interfaces/scopes';

export interface RenderedScopes {
  histogram: HistogramData;
  colorScopes: ColorScopes;
}

const HISTOGRAM_BINS = 256;
const MAX_SAMPLE_EDGE = 512;
const WAVEFORM_WIDTH = 320;
const WAVEFORM_HEIGHT = 150;
const VECTORSCOPE_SIZE = 192;

function normalizeDensity(values: Uint32Array): number[] {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, value);
  if (maximum === 0) return Array.from(values, () => 0);
  return Array.from(values, (value) => Math.round((value / maximum) * 255));
}

export function calculateRenderedScopes(source: HTMLCanvasElement): RenderedScopes {
  const scale = Math.min(1, MAX_SAMPLE_EDGE / Math.max(source.width, source.height));
  const sampleWidth = Math.max(1, Math.round(source.width * scale));
  const sampleHeight = Math.max(1, Math.round(source.height * scale));
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create a canvas for rendered scope analysis');

  context.drawImage(source, 0, 0, sampleWidth, sampleHeight);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const red = new Uint32Array(HISTOGRAM_BINS);
  const green = new Uint32Array(HISTOGRAM_BINS);
  const blue = new Uint32Array(HISTOGRAM_BINS);
  const luminance = new Uint32Array(HISTOGRAM_BINS);
  const waveform = new Uint32Array(WAVEFORM_WIDTH * WAVEFORM_HEIGHT);
  const vectorscope = new Uint32Array(VECTORSCOPE_SIZE * VECTORSCOPE_SIZE);
  const vectorCenter = (VECTORSCOPE_SIZE - 1) / 2;
  let sampleCount = 0;

  for (let y = 0; y < sampleHeight; y++) {
    for (let x = 0; x < sampleWidth; x++) {
      const offset = (y * sampleWidth + x) * 4;
      if (pixels[offset + 3] < 8) continue;

      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      red[r]++;
      green[g]++;
      blue[b]++;
      luminance[luma]++;
      sampleCount++;

      const waveformX = Math.min(WAVEFORM_WIDTH - 1, Math.floor((x / sampleWidth) * WAVEFORM_WIDTH));
      const waveformY = Math.min(
        WAVEFORM_HEIGHT - 1,
        Math.round((1 - luma / 255) * (WAVEFORM_HEIGHT - 1))
      );
      waveform[waveformY * WAVEFORM_WIDTH + waveformX]++;

      const cb = (b - luma) / 1.8556;
      const cr = (r - luma) / 1.5748;
      const vectorX = Math.max(
        0,
        Math.min(VECTORSCOPE_SIZE - 1, Math.round(vectorCenter + cb * VECTORSCOPE_SIZE))
      );
      const vectorY = Math.max(
        0,
        Math.min(VECTORSCOPE_SIZE - 1, Math.round(vectorCenter - cr * VECTORSCOPE_SIZE))
      );
      vectorscope[vectorY * VECTORSCOPE_SIZE + vectorX]++;
    }
  }

  return {
    histogram: {
      r: Array.from(red),
      g: Array.from(green),
      b: Array.from(blue),
      lum: Array.from(luminance),
      sample_count: sampleCount,
    },
    colorScopes: {
      waveform: {
        width: WAVEFORM_WIDTH,
        height: WAVEFORM_HEIGHT,
        data: normalizeDensity(waveform),
      },
      vectorscope: {
        width: VECTORSCOPE_SIZE,
        height: VECTORSCOPE_SIZE,
        data: normalizeDensity(vectorscope),
      },
    },
  };
}
