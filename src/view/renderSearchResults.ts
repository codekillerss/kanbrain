import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { groupByStatus } from './groupByStatus';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow } from './renderAssignee';
import { isValidHexColor, normalizeHex } from './badgeColor';

export interface SearchResultsOptions {
  // Work item type the results were queried with; 'all' (or unset) means no type filter.
  activeType?: string;
  // More ids remain in the search's snapshot beyond what's been loaded.
  hasMore?: boolean;
  // Size of the search's snapshot, when it equals the number of results (no post-fetch filter).
  total?: number;
  // Identifies the search the Load more button belongs to, so a stale click can't extend a newer search.
  token?: number;
}

function renderStatusGroups(items: WorkItem[], config: KanbrainConfig, avatars: Record<string, string>): string {
  if (items.length === 0) {
    return '<div class="kb-empty">No work items found.</div>';
  }

  return groupByStatus(items)
    .map(group => {
      const statusColor = config.statusColors?.[group.status];
      const groupBorderStyle = statusColor && isValidHexColor(statusColor) ? ` style="border-left: 3px solid ${normalizeHex(statusColor)};"` : '';
      return `
        <div class="kb-result-group" data-status="${escapeHtml(group.status)}">
          <button class="kb-section-label kb-group-toggle" data-action="toggle-group">${renderStatusDot(group.status, config.statusColors ?? {})}${escapeHtml(group.status)} (${group.items.length})</button>
          <div class="kb-group-items"${groupBorderStyle}>
            ${group.items
              .map(item => {
                const { borderStyle, iconHtml } = renderTypeAccent(item.type, config);
                const assigneeHtml =
                  config.showAssignedTo === false ? '' : renderAssigneeRow(item.assignedTo, avatars, 'kb-result-item-assignee');
                return `
                  <div class="kb-result-item"${borderStyle}>
                    <button type="button" class="kb-result-item-main" data-action="pick-work-item" data-id="${item.id}">
                      ${iconHtml}<span class="kb-result-item-title">#${item.id} ${escapeHtml(item.title)}</span>
                    </button>
                    <div class="kb-result-item-footer">
                      ${assigneeHtml}
                      <button type="button" class="kb-view-details-link" data-action="open-work-item-detail" data-id="${item.id}">View details</button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    })
    .join('');
}

function renderLoadMore(loaded: number, options: SearchResultsOptions): string {
  if (!options.hasMore) {
    return '';
  }
  const count = options.total !== undefined ? `<span class="kb-search-load-more-count">${loaded} of ${options.total}</span>` : '';
  return `
    <div class="kb-search-load-more">
      ${count}
      <button type="button" class="kb-secondary-btn" data-action="load-more-search-results" data-token="${options.token ?? ''}">Load more</button>
    </div>
  `;
}

// Only this area scrolls (#kb-search-results itself doesn't), so the type filter above it stays
// pinned at the top of the results.
function scrollArea(content: string): string {
  return `<div class="kb-search-results-scroll">${content}</div>`;
}

export function renderSearchResults(
  items: WorkItem[],
  config: KanbrainConfig,
  avatars: Record<string, string> = {},
  options: SearchResultsOptions = {},
): string {
  const results = scrollArea(`${renderStatusGroups(items, config, avatars)}${renderLoadMore(items.length, options)}`);

  const types = Object.keys(config.workflowSteps);
  if (types.length === 0) {
    return results;
  }

  const activeType = options.activeType && types.includes(options.activeType) ? options.activeType : 'all';
  const optionLabel = (id: string) => (id === 'all' ? 'All' : `${renderTypeAccent(id, config).iconHtml}${escapeHtml(id)}`);

  const optionButtons = ['all', ...types]
    .map(
      id =>
        `<button type="button" class="kb-search-type-filter-option" data-action="select-search-type" data-type="${escapeHtml(id)}">${optionLabel(id)}</button>`,
    )
    .join('');

  // The type is applied by the query, so the results below hold only that type: switching it asks
  // the extension for a new search rather than revealing already-loaded items.
  const filter = `
    <div class="kb-search-type-filter" data-active-type="${escapeHtml(activeType)}">
      <button type="button" class="kb-search-type-filter-trigger" data-action="toggle-search-type-filter">
        <span class="kb-search-type-filter-trigger-label">${optionLabel(activeType)}</span>
        <span class="kb-search-type-filter-icon">▾</span>
      </button>
      <div class="kb-search-type-filter-menu kb-hidden">${optionButtons}</div>
    </div>
  `;

  return `${filter}${results}`;
}
