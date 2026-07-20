import type { AssignedTo } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderAssigneeRow(assignedTo: AssignedTo | null, avatars: Record<string, string>, rowClass: string): string {
  if (!assignedTo) {
    return `<div class="${rowClass}"><span class="kb-avatar-initial">?</span>Unassigned</div>`;
  }

  const dataUri = assignedTo.imageUrl ? avatars[assignedTo.imageUrl] : undefined;
  const avatarHtml = dataUri
    ? `<img class="kb-avatar" src="${dataUri}" alt="">`
    : `<span class="kb-avatar-initial">${escapeHtml(assignedTo.displayName.charAt(0).toUpperCase())}</span>`;

  return `<div class="${rowClass}">${avatarHtml}${escapeHtml(assignedTo.displayName)}</div>`;
}
