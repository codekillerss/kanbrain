import type { RenderState } from './render';
import type { PullRequestSummary, RepositoryPathEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderRepoTag, renderBranchTag } from './renderRepoBranchTags';
import { renderPrStatusDot } from './renderPrStatus';
import { renderPullRequestIcon, capitalize } from './renderDevelopment';
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
  const repoTagHtml = renderRepoTag(pr.repositoryId, repositories[pr.repositoryId]);
  const isMapped = !!repositories[pr.repositoryId]?.path;
  const branchTagHtml = renderBranchTag(pr.sourceBranch, isMapped ? [pr.repositoryId, pr.sourceBranch] : null);
  const commandArgs = encodeURIComponent(JSON.stringify([pr.repositoryId, pr.id]));

  return `
    <a class="kb-review-card" href="command:kanbrain.openPullRequestDetail?${commandArgs}">
      <div class="kb-review-card-header">${renderPrStatusDot(pr.status, pr.isDraft)}${escapeHtml(statusLabel)}${repoTagHtml}${branchTagHtml}</div>
      <div class="kb-review-card-title">${PULL_REQUEST_ICON}<span>#${pr.id} ${escapeHtml(pr.title)}</span></div>
      <div class="kb-review-card-meta">${escapeHtml(pr.createdBy.displayName)} &middot; ${formatRelativeTime(pr.creationDate)}</div>
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
