import { isValidHexColor, normalizeHex } from './badgeColor';

export function renderStatusDot(status: string, statusColors: Record<string, string>): string {
  const color = statusColors[status];
  if (!color || !isValidHexColor(color)) {
    return '';
  }
  return `<span class="kb-status-dot" style="background-color: ${normalizeHex(color)}"></span>`;
}
