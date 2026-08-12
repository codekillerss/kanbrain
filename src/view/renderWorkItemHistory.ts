import type { KanbrainConfig, WorkItem } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderAssigneeRow } from './renderAssignee';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';

export function renderWorkItemHistory(
  items: WorkItem[],
  config: KanbrainConfig,
  avatars: Record<string, string> = {},
  currentWorkItemId?: number,
): string {
  if (items.length === 0) {
    return '<div class="kb-empty">No work item history yet.</div>';
  }
  return items.map(item => {
    const { borderStyle, iconHtml } = renderTypeAccent(item.type, config);
    const assignee = config.showAssignedTo === false ? '' : renderAssigneeRow(item.assignedTo, avatars, 'kb-result-item-assignee');
    const isCurrent = item.id === currentWorkItemId;
    const currentBadge = isCurrent ? '<span class="kb-current-badge">Current</span>' : '';
    return `<div class="kb-result-item kb-history-item"${borderStyle}>
      <button type="button" class="kb-result-item-main" data-action="pick-work-item" data-id="${item.id}"${isCurrent ? ' disabled' : ''}>
        ${iconHtml}<span class="kb-result-item-title">#${item.id} ${escapeHtml(item.title)}</span>${currentBadge}
      </button>
      <div class="kb-history-item-status">${renderStatusDot(item.status, config.statusColors ?? {})}${escapeHtml(item.status)}</div>
      <div class="kb-result-item-footer kb-history-item-footer">
        ${assignee}
        <button type="button" class="kb-view-details-link" data-action="open-work-item-detail" data-id="${item.id}">View details</button>
      </div>
    </div>`;
  }).join('');
}
