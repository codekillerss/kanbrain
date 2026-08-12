import type { SavedQuery } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderSavedQueryOptions(queries: SavedQuery[]): string {
  if (queries.length === 0) {
    return '<div class="kb-empty">No saved queries found.</div>';
  }
  return queries
    .map(q => {
      const disabled = q.queryType !== 'flat';
      const badge = disabled ? `<span class="kb-query-type-badge">${escapeHtml(q.queryType)}</span>` : '';
      return `<button type="button" class="kb-query-option" data-action="select-query" data-id="${escapeHtml(q.id)}" data-path="${escapeHtml(q.path)}"${disabled ? ' disabled' : ''}>${escapeHtml(q.path)}${badge}</button>`;
    })
    .join('');
}
