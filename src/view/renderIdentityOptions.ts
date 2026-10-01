import type { IdentitySearchResult } from '../azureDevOps/client';
import { escapeHtml } from './escapeHtml';
import { renderAvatarOrInitial } from './renderAssignee';

export function renderIdentityOptions(
  results: IdentitySearchResult[],
  workItemId: number,
  avatars: Record<string, string>,
): string {
  if (results.length === 0) {
    return '<div class="kb-empty">No matches.</div>';
  }
  return results
    .map(r => {
      const avatar = renderAvatarOrInitial(r.displayName, r.imageUrl, avatars);
      return `<button type="button" class="kb-assignee-picker-option" data-action="select-assignee" data-id="${workItemId}" data-unique-name="${escapeHtml(r.uniqueName)}" data-display-name="${escapeHtml(r.displayName)}">${avatar}${escapeHtml(r.displayName)}</button>`;
    })
    .join('');
}
