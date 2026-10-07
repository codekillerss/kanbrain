import type { IdentitySearchResult } from '../azureDevOps/client';
import { escapeHtml } from './escapeHtml';
import { renderAvatarOrInitial } from './renderAssignee';

export function renderIdentityOptions(
  results: IdentitySearchResult[],
  workItemId: number,
  avatars: Record<string, string>,
  current?: { id?: string | null; uniqueName?: string | null } | null,
): string {
  if (results.length === 0) {
    return '<div class="kb-empty">No matches.</div>';
  }
  return results
    .map(r => {
      const avatar = renderAvatarOrInitial(r.displayName, r.imageUrl, avatars);
      // Matched on the address, which is what gets written to the board and what deduplication
      // already keys on. The identity id is only a fallback: the id a work item's assignee field
      // carries does not always agree with the one the team members endpoint returns.
      const assignedAddress = current?.uniqueName?.toLowerCase();
      const isActive = assignedAddress
        ? r.uniqueName.toLowerCase() === assignedAddress
        : !!current?.id && r.id === current.id;
      const activeClass = isActive ? ' kb-assignee-picker-option-active' : '';
      const check = isActive ? '<span class="kb-assignee-picker-option-check">✓</span>' : '';
      return `<button type="button" class="kb-assignee-picker-option${activeClass}" data-action="select-assignee" data-id="${workItemId}" data-unique-name="${escapeHtml(r.uniqueName)}" data-display-name="${escapeHtml(r.displayName)}">${avatar}${escapeHtml(r.displayName)}${check}</button>`;
    })
    .join('');
}
