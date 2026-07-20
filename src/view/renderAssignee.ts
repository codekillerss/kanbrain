import type { AssignedTo } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderAvatarOrInitial(displayName: string, imageUrl: string | null, avatars: Record<string, string>): string {
  const dataUri = imageUrl ? avatars[imageUrl] : undefined;
  return dataUri
    ? `<img class="kb-avatar" src="${dataUri}" alt="">`
    : `<span class="kb-avatar-initial">${escapeHtml(displayName.charAt(0).toUpperCase())}</span>`;
}

export function renderAssigneeRow(assignedTo: AssignedTo | null, avatars: Record<string, string>, rowClass: string): string {
  if (!assignedTo) {
    return `<div class="${rowClass}"><span class="kb-avatar-initial">?</span>Unassigned</div>`;
  }

  return `<div class="${rowClass}">${renderAvatarOrInitial(assignedTo.displayName, assignedTo.imageUrl, avatars)}${escapeHtml(assignedTo.displayName)}</div>`;
}
