const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;

export function renderStatusDot(status: string, statusColors: Record<string, string>): string {
  const color = statusColors[status];
  if (!color || !HEX_COLOR.test(color)) {
    return '';
  }
  const hex = color.startsWith('#') ? color : `#${color}`;
  return `<span class="kb-status-dot" style="background-color: ${hex}"></span>`;
}
