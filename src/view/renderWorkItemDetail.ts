import type { WorkItem, KanbrainConfig, PullRequestDetails } from '../types';
import type { DetailGroup, DetailField, WorkItemComment } from '../azureDevOps/workItemDetail';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow } from './renderAssignee';
import { renderDevelopmentSection } from './renderDevelopment';
import { renderRelatedWorkSection } from './renderRelatedWork';
import { isValidHexColor, normalizeHex } from './badgeColor';
import { renderComment } from './renderComment';

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

export interface WorkItemDetailInput {
  workItem: WorkItem;
  config: KanbrainConfig;
  description: string | null;
  groups: DetailGroup[];
  htmlSections: DetailField[];
  comments: WorkItemComment[];
  avatars: Record<string, string>;
  prDetails: Record<string, PullRequestDetails>;
  parent: WorkItem | null;
  children: WorkItem[];
}

export function renderWorkItemDetail(input: WorkItemDetailInput): string {
  const { workItem, config, description, groups, htmlSections, comments, avatars, prDetails, parent, children } = input;
  const { iconHtml } = renderTypeAccent(workItem.type, config);
  const assigneeHtml = renderAssigneeRow(workItem.assignedTo, avatars, 'kb-detail-assignee');

  const typeColor = config.typeColors?.[workItem.type];
  const statusColor = config.statusColors?.[workItem.status];
  const borderDeclarations = [
    typeColor && isValidHexColor(typeColor) ? `border-right: 4px solid ${normalizeHex(typeColor)};` : '',
    statusColor && isValidHexColor(statusColor) ? `border-bottom: 4px solid ${normalizeHex(statusColor)};` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const headerStyle = borderDeclarations ? ` style="${borderDeclarations}"` : '';

  const descriptionHtml = description
    ? `<div class="kb-detail-html-section"><div class="kb-detail-section-label">Description</div><div class="kb-detail-html-body">${stripScriptTags(description)}</div></div>`
    : '';

  const commentsHtml = comments.length ? comments.map(c => renderComment(c, avatars)).join('') : '<div class="kb-empty">No comments.</div>';

  return `
    <div class="kb-detail-header"${headerStyle}>
      <div class="kb-detail-title-row">
        ${iconHtml}
        <span class="kb-detail-id">#${workItem.id}</span>
        <h1 class="kb-detail-title">${escapeHtml(workItem.title)}</h1>
      </div>
      ${assigneeHtml}
      <div class="kb-detail-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
    </div>
    <div class="kb-detail-body">
      <div class="kb-detail-main">
        ${descriptionHtml}
        ${htmlSections.map(renderHtmlSection).join('')}
      </div>
      <div class="kb-detail-side">
        ${groups.map(renderDetailGroup).join('')}
        ${renderRelatedWorkSection(parent, children, config)}
        ${renderDevelopmentSection(workItem.development, prDetails)}
      </div>
    </div>
    <div class="kb-detail-section-label">Discussion</div>
    <div class="kb-comments">
      ${commentsHtml}
    </div>
  `;
}
