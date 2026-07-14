import type { WorkItem } from '../types';
import { escapeHtml } from './escapeHtml';
import { groupByStatus } from './groupByStatus';
import { renderStatusDot } from './renderStatusDot';

export function renderSearchResults(items: WorkItem[], statusColors: Record<string, string>): string {
  if (items.length === 0) {
    return '<div class="kb-empty">Nenhum work item encontrado.</div>';
  }

  return groupByStatus(items)
    .map(
      group => `
        <div class="kb-result-group">
          <button class="kb-section-label kb-group-toggle" data-action="toggle-group">${renderStatusDot(group.status, statusColors)}${escapeHtml(group.status)} (${group.items.length})</button>
          <div class="kb-group-items">
            ${group.items
              .map(
                item => `
                  <button class="kb-result-item" data-action="pick-work-item" data-id="${item.id}">#${item.id} ${escapeHtml(item.title)}</button>
                `,
              )
              .join('')}
          </div>
        </div>
      `,
    )
    .join('');
}
