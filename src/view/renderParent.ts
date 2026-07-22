import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderTypeAccent } from './renderTypeAccent';

export function renderParentRow(parent: WorkItem | null, show: boolean, config: KanbrainConfig): string {
  if (!show || !parent) {
    return '';
  }
  const { iconHtml } = renderTypeAccent(parent.type, config);
  return `
    <div class="kb-field-row">
      <div class="kb-field-label">Parent</div>
      <div class="kb-parent-link" data-action="open-work-item-detail" data-id="${parent.id}">${iconHtml}<span class="kb-link-text">${escapeHtml(parent.title)}</span></div>
    </div>
  `;
}
