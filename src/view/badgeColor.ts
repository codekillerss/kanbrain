const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;

export function isValidHexColor(color: string): boolean {
  return HEX_COLOR.test(color);
}

export function normalizeHex(color: string): string {
  return color.startsWith('#') ? color : `#${color}`;
}

export function pickReadableTextColor(hexColor: string): string {
  const hex = hexColor.replace(/^#/, '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#ffffff';
}
