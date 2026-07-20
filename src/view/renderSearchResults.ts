import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { groupByStatus } from './groupByStatus';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow } from './renderAssignee';

function renderStatusGroups(items: WorkItem[], config: KanbrainConfig, avatars: Record<string, string>): string {
  if (items.length === 0) {
    return '<div class="kb-empty">No work items found.</div>';
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
                const assigneeHtml =
                  config.showAssignedTo === false ? '' : renderAssigneeRow(item.assignedTo, avatars, 'kb-result-item-assignee');
                return `
                  <button class="kb-result-item" data-action="pick-work-item" data-id="${item.id}"${borderStyle}>
                    <div class="kb-result-item-main">${iconHtml}#${item.id} ${escapeHtml(item.title)}</div>
                    ${assigneeHtml}
                  </button>
                `;
              })
              .join('')}
          </div>
        </div>
      `,
    )
    .join('');
}

export function renderSearchResults(
  items: WorkItem[],
  config: KanbrainConfig,
  backlogLevelCounts: Record<string, number>,
  avatars: Record<string, string> = {},
): string {
  if (items.length === 0) {
    return '<div class="kb-empty">No work items found.</div>';
  }

  const levels = Object.keys(config.backlogLevels);
  if (levels.length === 0) {
    return renderStatusGroups(items, config, avatars);
  }

  const tabs = [
    { id: 'all', label: 'All', count: items.length, items },
    ...levels.map(level => ({
      id: level,
      label: level,
      count: backlogLevelCounts[level] ?? 0,
      items: items.filter(item => config.typeToBacklogLevel[item.type] === level),
    })),
  ];

  const tabBar = tabs
    .map(
      tab =>
        `<button class="kb-search-tab${tab.count === 0 ? ' kb-search-tab-empty' : ''}" data-action="select-tab" data-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)} (${tab.count})</button>`,
    )
    .join('');

  const panels = tabs
    .map(tab => `<div class="kb-search-tab-panel" data-tab-panel="${escapeHtml(tab.id)}">${renderStatusGroups(tab.items, config, avatars)}</div>`)
    .join('');

  return `<div class="kb-search-tabs">${tabBar}</div>${panels}`;
}
