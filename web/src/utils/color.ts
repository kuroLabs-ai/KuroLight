export interface HsvColor {
  hue: number;
  saturation: number;
  value: number;
}

export const normalizeHex = (value: string) => {
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[\da-f]{3}$/i.test(hex)) {
    return `#${hex.split('').map((digit) => `${digit}${digit}`).join('')}`.toLowerCase();
  }
  return /^[\da-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
};

export const colorToHsv = (color: string): HsvColor => {
  const hex = normalizeHex(color) ?? '#00ff00';
  const red = parseInt(hex.slice(1, 3), 16) / 255;
  const green = parseInt(hex.slice(3, 5), 16) / 255;
  const blue = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }

  return {
    hue: (hue * 60 + 360) % 360,
    saturation: max === 0 ? 0 : delta / max,
    value: max,
  };
};

export const hsvToHex = ({ hue, saturation, value }: HsvColor) => {
  const chroma = value * saturation;
  const second = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const offset = value - chroma;
  const [red, green, blue] = hue < 60 ? [chroma, second, 0]
    : hue < 120 ? [second, chroma, 0]
      : hue < 180 ? [0, chroma, second]
        : hue < 240 ? [0, second, chroma]
          : hue < 300 ? [second, 0, chroma]
            : [chroma, 0, second];
  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
};
