import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderTypeAccent } from './renderTypeAccent';
import { sortChildren } from './sortChildren';
import { isCompleted } from '../azureDevOps/filterRemovedWorkItems';

function renderRelatedItem(item: WorkItem, config: KanbrainConfig, muted = false): string {
  const { iconHtml } = renderTypeAccent(item.type, config);
  const commandArgs = encodeURIComponent(JSON.stringify([item.id]));
  return `
    <a class="kb-related-item${muted ? ' kb-related-item-completed' : ''}" href="command:kanbrain.openWorkItemDetail?${commandArgs}">
      ${iconHtml}<span class="kb-related-id">#${item.id}</span> ${escapeHtml(item.title)}
    </a>
  `;
}

export function renderRelatedWorkSection(parent: WorkItem | null, children: WorkItem[], config: KanbrainConfig): string {
  if (!parent && children.length === 0) {
    return '';
  }
  const parentHtml = parent ? `<div class="kb-related-subgroup-label">Parent</div>${renderRelatedItem(parent, config)}` : '';
  // The detail panel has no team selector, so the children use the default team's backlog levels.
  const childrenHtml = children.length
    ? `<div class="kb-related-subgroup-label">Child</div>${sortChildren(children, config, undefined)
        .map(c => renderRelatedItem(c, config, isCompleted(c, config)))
        .join('')}`
    : '';
  return `
    <div class="kb-detail-group">
      <div class="kb-detail-group-label">Related Work</div>
      ${parentHtml}
      ${childrenHtml}
    </div>
  `;
}
