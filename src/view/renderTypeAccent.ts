import type { KanbrainConfig } from '../types';
import { isValidHexColor, normalizeHex } from './badgeColor';

export interface TypeAccent {
  borderStyle: string;
  iconHtml: string;
}

export function renderTypeAccent(type: string, config: KanbrainConfig): TypeAccent {
  const typeColor = config.typeColors?.[type];
  const typeIcon = config.typeIcons?.[type];
  const borderStyle = typeColor && isValidHexColor(typeColor) ? ` style="border-right: 4px solid ${normalizeHex(typeColor)};"` : '';
  const iconHtml = typeIcon ? `<span class="kb-type-icon">${typeIcon}</span>` : '';
  return { borderStyle, iconHtml };
}
