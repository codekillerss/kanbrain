import type { WorkItemComment } from '../azureDevOps/workItemDetail';
import { escapeHtml } from './escapeHtml';
import { renderAvatarOrInitial } from './renderAssignee';

function stripScriptTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

export function renderComment(comment: WorkItemComment, avatars: Record<string, string>): string {
  const avatarHtml = renderAvatarOrInitial(comment.createdBy.displayName, comment.createdBy.imageUrl, avatars);
  const date = new Date(comment.createdDate);
  const dateLabel = Number.isNaN(date.getTime()) ? comment.createdDate : date.toLocaleString();
  return `
    <div class="kb-comment">
      <div class="kb-comment-header">
        ${avatarHtml}
        <span class="kb-comment-author">${escapeHtml(comment.createdBy.displayName)}</span>
        <span class="kb-comment-date">${escapeHtml(dateLabel)}</span>
      </div>
      <div class="kb-comment-body">${stripScriptTags(comment.text)}</div>
    </div>
  `;
}
