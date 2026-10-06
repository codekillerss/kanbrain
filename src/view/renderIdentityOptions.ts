import type { IdentitySearchResult } from '../azureDevOps/client';
import { escapeHtml } from './escapeHtml';
import { renderAvatarOrInitial } from './renderAssignee';

export function renderIdentityOptions(
  results: IdentitySearchResult[],
  workItemId: number,
  avatars: Record<string, string>,
  currentId?: string | null,
): string {
  if (results.length === 0) {
    return '<div class="kb-empty">No matches.</div>';
  }
  return results
    .map(r => {
      const avatar = renderAvatarOrInitial(r.displayName, r.imageUrl, avatars);
      // Matched on the identity id: a work item's assignee carries one, and no unique name.
      const isActive = !!currentId && r.id === currentId;
      const activeClass = isActive ? ' kb-assignee-picker-option-active' : '';
      const check = isActive ? '<span class="kb-assignee-picker-option-check">✓</span>' : '';
      return `<button type="button" class="kb-assignee-picker-option${activeClass}" data-action="select-assignee" data-id="${workItemId}" data-unique-name="${escapeHtml(r.uniqueName)}" data-display-name="${escapeHtml(r.displayName)}">${avatar}${escapeHtml(r.displayName)}${check}</button>`;
    })
    .join('');
}
