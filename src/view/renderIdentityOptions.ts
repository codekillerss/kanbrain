import type { IdentitySearchResult } from '../azureDevOps/client';
import { escapeHtml } from './escapeHtml';

export function renderIdentityOptions(results: IdentitySearchResult[], workItemId: number): string {
  if (results.length === 0) {
    return '<div class="kb-empty">No matches.</div>';
  }
  return results
    .map(
      r =>
        `<button type="button" class="kb-assignee-picker-option" data-action="select-assignee" data-id="${workItemId}" data-unique-name="${escapeHtml(r.uniqueName)}" data-display-name="${escapeHtml(r.displayName)}">${escapeHtml(r.displayName)}</button>`,
    )
    .join('');
}
