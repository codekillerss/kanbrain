import { escapeHtml } from './escapeHtml';
import { pickReadableTextColor } from './badgeColor';

const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;

export function renderColoredBadge(text: string, hexColor: string | undefined, extraClass: string, iconSvg?: string): string {
  const icon = iconSvg ? `<span class="kb-badge-icon">${iconSvg}</span>` : '';

  if (!hexColor || !HEX_COLOR.test(hexColor)) {
    return `<span class="kb-badge ${extraClass}">${icon}${escapeHtml(text)}</span>`;
  }

  const hex = hexColor.startsWith('#') ? hexColor : `#${hexColor}`;
  const textColor = pickReadableTextColor(hex);
  return `<span class="kb-badge ${extraClass}" style="background-color: ${hex}; border-color: ${hex}; color: ${textColor};">${icon}${escapeHtml(text)}</span>`;
}
