export interface ColorScopeData {
  width: number;
  height: number;
  data: number[];
}

export interface ColorScopes {
  waveform: ColorScopeData;
  vectorscope: ColorScopeData;
}
