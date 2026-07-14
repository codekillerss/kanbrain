const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;

export function isValidHexColor(color: string): boolean {
  return HEX_COLOR.test(color);
}

export function normalizeHex(color: string): string {
  return color.startsWith('#') ? color : `#${color}`;
}
