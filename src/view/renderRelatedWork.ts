import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderTypeAccent } from './renderTypeAccent';

function renderRelatedItem(item: WorkItem, config: KanbrainConfig): string {
  const { iconHtml } = renderTypeAccent(item.type, config);
  const commandArgs = encodeURIComponent(JSON.stringify([item.id]));
  return `
    <a class="kb-related-item" href="command:kanbrain.openWorkItemDetail?${commandArgs}">
      ${iconHtml}<span class="kb-related-id">#${item.id}</span> ${escapeHtml(item.title)}
    </a>
  `;
}

export function renderRelatedWorkSection(parent: WorkItem | null, children: WorkItem[], config: KanbrainConfig): string {
  if (!parent && children.length === 0) {
    return '';
  }
  const parentHtml = parent ? `<div class="kb-related-subgroup-label">Parent</div>${renderRelatedItem(parent, config)}` : '';
  const childrenHtml = children.length
    ? `<div class="kb-related-subgroup-label">Child</div>${children.map(c => renderRelatedItem(c, config)).join('')}`
    : '';
  return `
    <div class="kb-detail-group">
      <div class="kb-detail-group-label">Related Work</div>
      ${parentHtml}
      ${childrenHtml}
    </div>
  `;
}
