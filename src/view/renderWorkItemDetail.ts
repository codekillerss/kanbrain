import type { WorkItem, KanbrainConfig } from '../types';
import type { DetailGroup, DetailField, WorkItemComment } from '../azureDevOps/workItemDetail';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow, renderAvatarOrInitial } from './renderAssignee';

function stripScriptTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '');
}

export function formatFieldValue(refName: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'object' && value !== null && 'displayName' in value) {
    return escapeHtml(String((value as { displayName: unknown }).displayName));
  }
  if (refName.endsWith('Date')) {
    const date = new Date(value as string);
    if (!Number.isNaN(date.getTime())) {
      return escapeHtml(date.toLocaleString());
    }
  }
  if (refName === 'System.Tags' && typeof value === 'string') {
    const tags = value
      .split(';')
      .map(t => t.trim())
      .filter(Boolean);
    return tags.map(t => `<span class="kb-detail-tag">${escapeHtml(t)}</span>`).join('');
  }
  return escapeHtml(String(value));
}

function renderDetailGroup(group: DetailGroup): string {
  const rows = group.fields
    .map(
      f => `
        <div class="kb-detail-field">
          <div class="kb-detail-field-label">${escapeHtml(f.label)}</div>
          <div class="kb-detail-field-value">${formatFieldValue(f.refName, f.value)}</div>
        </div>
      `,
    )
    .join('');
  return `
    <div class="kb-detail-group">
      ${group.label ? `<div class="kb-detail-group-label">${escapeHtml(group.label)}</div>` : ''}
      ${rows}
    </div>
  `;
}

function renderHtmlSection(field: DetailField): string {
  const value = typeof field.value === 'string' ? stripScriptTags(field.value) : '';
  return `
    <div class="kb-detail-html-section">
      <div class="kb-detail-section-label">${escapeHtml(field.label)}</div>
      <div class="kb-detail-html-body">${value}</div>
    </div>
  `;
}

function renderComment(comment: WorkItemComment, avatars: Record<string, string>): string {
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

export interface WorkItemDetailInput {
  workItem: WorkItem;
  config: KanbrainConfig;
  description: string | null;
  groups: DetailGroup[];
  htmlSections: DetailField[];
  comments: WorkItemComment[];
  avatars: Record<string, string>;
}

export function renderWorkItemDetail(input: WorkItemDetailInput): string {
  const { workItem, config, description, groups, htmlSections, comments, avatars } = input;
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const assigneeHtml = renderAssigneeRow(workItem.assignedTo, avatars, 'kb-detail-assignee');

  const descriptionHtml = description
    ? `<div class="kb-detail-html-section"><div class="kb-detail-section-label">Description</div><div class="kb-detail-html-body">${stripScriptTags(description)}</div></div>`
    : '';

  const commentsHtml = comments.length ? comments.map(c => renderComment(c, avatars)).join('') : '<div class="kb-empty">No comments.</div>';

  return `
    <div class="kb-detail-header"${borderStyle}>
      <div class="kb-detail-header-top">
        ${iconHtml}
        <span class="kb-detail-id">#${workItem.id}</span>
        ${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}
      </div>
      <h1 class="kb-detail-title">${escapeHtml(workItem.title)}</h1>
      ${assigneeHtml}
    </div>
    <div class="kb-detail-body">
      <div class="kb-detail-main">
        ${descriptionHtml}
        ${htmlSections.map(renderHtmlSection).join('')}
      </div>
      <div class="kb-detail-side">
        ${groups.map(renderDetailGroup).join('')}
      </div>
    </div>
    <div class="kb-detail-section-label">Discussion</div>
    <div class="kb-comments">
      ${commentsHtml}
    </div>
  `;
}
