import type { RenderState } from './render';
import type { PullRequestSummary, RepositoryPathEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderRepoTag, renderBranchTag } from './renderRepoBranchTags';
import { resolvePrStatusColor } from './renderPrStatus';
import { renderPullRequestIcon, capitalize } from './renderDevelopment';
import { renderAvatarOrInitial } from './renderAssignee';
import { formatRelativeTime } from './renderRelativeTime';

const PULL_REQUEST_ICON = renderPullRequestIcon();

const STATUS_FILTER_OPTIONS: { value: 'active' | 'completed' | 'abandoned'; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

function renderReviewsToolbar(selected: 'active' | 'completed' | 'abandoned'): string {
  return `
    <div class="kb-reviews-toolbar">
      <label class="kb-field-label" for="kb-reviews-status-filter">Status</label>
      <select id="kb-reviews-status-filter">
        ${STATUS_FILTER_OPTIONS.map(
          o => `<option value="${o.value}"${o.value === selected ? ' selected' : ''}>${o.label}</option>`,
        ).join('')}
      </select>
    </div>
  `;
}

function renderReviewCard(pr: PullRequestSummary, repositories: Record<string, RepositoryPathEntry>): string {
  const statusLabel = pr.isDraft ? 'Draft' : capitalize(pr.status);
  const statusColor = resolvePrStatusColor(pr.status, pr.isDraft);
  const repoTagHtml = renderRepoTag(pr.repositoryId, repositories[pr.repositoryId]);
  const isMapped = !!repositories[pr.repositoryId]?.path;
  const branchTagHtml = renderBranchTag(pr.sourceBranch, isMapped ? [pr.repositoryId, pr.sourceBranch] : null);
  const commandArgs = encodeURIComponent(JSON.stringify([pr.repositoryId, pr.id]));
  const avatarHtml = renderAvatarOrInitial(pr.createdBy.displayName, pr.createdBy.imageUrl, {});

  return `
    <a class="kb-review-card" style="border-left-color: ${statusColor}" href="command:kanbrain.openPullRequestDetail?${commandArgs}">
      <div class="kb-review-card-header">
        <span
          class="kb-review-status-badge"
          style="color: ${statusColor}; background: color-mix(in srgb, ${statusColor} 16%, transparent); border-color: color-mix(in srgb, ${statusColor} 45%, transparent);"
        >${escapeHtml(statusLabel)}</span>
        <div class="kb-review-card-tags">${repoTagHtml}${branchTagHtml}</div>
      </div>
      <div class="kb-review-card-title">${PULL_REQUEST_ICON}<span class="kb-review-card-title-text">#${pr.id} ${escapeHtml(pr.title)}</span></div>
      <div class="kb-review-card-meta">${avatarHtml}<span>${escapeHtml(pr.createdBy.displayName)}</span><span class="kb-review-card-meta-dot">&middot;</span><span>${formatRelativeTime(pr.creationDate)}</span></div>
    </a>
  `;
}

export function renderReviews(state: RenderState): string {
  const config = state.config!;
  const statusFilter = state.reviewsStatusFilter ?? 'active';
  const pullRequests = state.reviewsPullRequests ?? [];
  const sorted = [...pullRequests].sort((a, b) => new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());

  return `
    ${renderReviewsToolbar(statusFilter)}
    ${
      sorted.length
        ? sorted.map(pr => renderReviewCard(pr, config.repositories ?? {})).join('')
        : `<div class="kb-empty">No ${statusFilter} pull requests.</div>`
    }
  `;
}
