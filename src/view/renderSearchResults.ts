import type { WorkItem } from '../types';
import { escapeHtml } from './escapeHtml';
import { groupByStatus } from './groupByStatus';

export function renderSearchResults(items: WorkItem[]): string {
  if (items.length === 0) {
    return '<div class="kb-empty">Nenhum work item encontrado.</div>';
  }

  return groupByStatus(items)
    .map(
      group => `
        <div class="kb-section-label">${escapeHtml(group.status)} (${group.items.length})</div>
        ${group.items
          .map(
            item => `
              <button class="kb-result-item" data-action="pick-work-item" data-id="${item.id}">#${item.id} ${escapeHtml(item.title)}</button>
            `,
          )
          .join('')}
      `,
    )
    .join('');
}
