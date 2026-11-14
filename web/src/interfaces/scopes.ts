export interface HistogramData {
  r: number[];
  g: number[];
  b: number[];
  lum: number[];
  sample_count?: number;
}

export interface ColorScopeData {
  width: number;
  height: number;
  data: number[];
}

export interface ColorScopes {
  waveform: ColorScopeData;
  vectorscope: ColorScopeData;
}
