import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { groupByStatus } from './groupByStatus';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';

export function renderSearchResults(items: WorkItem[], config: KanbrainConfig): string {
  if (items.length === 0) {
    return '<div class="kb-empty">Nenhum work item encontrado.</div>';
  }

  return groupByStatus(items)
    .map(
      group => `
        <div class="kb-result-group">
          <button class="kb-section-label kb-group-toggle" data-action="toggle-group">${renderStatusDot(group.status, config.statusColors ?? {})}${escapeHtml(group.status)} (${group.items.length})</button>
          <div class="kb-group-items">
            ${group.items
              .map(item => {
                const { borderStyle, iconHtml } = renderTypeAccent(item.type, config);
                return `
                  <button class="kb-result-item" data-action="pick-work-item" data-id="${item.id}"${borderStyle}>${iconHtml}#${item.id} ${escapeHtml(item.title)}</button>
                `;
              })
              .join('')}
          </div>
        </div>
      `,
    )
    .join('');
}
