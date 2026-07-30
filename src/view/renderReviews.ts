import type { RenderState } from './render';
import type { PullRequestSummary } from '../types';
import { escapeHtml } from './escapeHtml';
import { resolvePrStatusColor } from './renderPrStatus';
import { capitalize } from './renderDevelopment';

const STATUS_FILTER_OPTIONS: { value: 'active' | 'completed' | 'abandoned'; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

function renderReviewsStatusTabs(selected: 'active' | 'completed' | 'abandoned'): string {
  return `
    <div class="kb-search-tabs">
      ${STATUS_FILTER_OPTIONS.map(
        o =>
          `<button type="button" class="kb-search-tab${o.value === selected ? ' kb-search-tab-active' : ''}" data-action="set-reviews-status-filter" data-status="${o.value}">${o.label}</button>`,
      ).join('')}
    </div>
  `;
}

function renderReviewRow(pr: PullRequestSummary): string {
  const statusColor = resolvePrStatusColor(pr.status, pr.isDraft);
  const statusLabel = pr.isDraft ? 'Draft' : capitalize(pr.status);
  const commandArgs = encodeURIComponent(JSON.stringify([pr.repositoryId, pr.id]));

  return `
    <a class="kb-review-row" style="border-left-color: ${statusColor}" href="command:kanbrain.openPullRequestDetail?${commandArgs}" title="${escapeHtml(statusLabel)}">
      <span class="kb-review-row-title">#${pr.id} ${escapeHtml(pr.title)}</span>
      <span class="kb-review-row-author">${escapeHtml(pr.createdBy.displayName)}</span>
      <span class="kb-review-row-branch">${escapeHtml(pr.sourceBranch)}</span>
    </a>
  `;
}

function renderRepoGroup(repoLabel: string, prs: PullRequestSummary[]): string {
  return `
    <div class="kb-result-group">
      <button type="button" class="kb-section-label kb-group-toggle" data-action="toggle-group">${escapeHtml(repoLabel)} (${prs.length})</button>
      <div class="kb-group-items">
        ${prs.map(renderReviewRow).join('')}
      </div>
    </div>
  `;
}

function groupByRepo(prs: PullRequestSummary[]): { label: string; items: PullRequestSummary[] }[] {
  const groups = new Map<string, { label: string; items: PullRequestSummary[] }>();
  for (const pr of prs) {
    const existing = groups.get(pr.repositoryId);
    if (existing) {
      existing.items.push(pr);
    } else {
      groups.set(pr.repositoryId, { label: pr.repositoryName, items: [pr] });
    }
  }
  return [...groups.values()];
}

export function renderReviews(state: RenderState): string {
  const statusFilter = state.reviewsStatusFilter ?? 'active';
  const pullRequests = state.reviewsPullRequests ?? [];
  const sorted = [...pullRequests].sort((a, b) => new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());

  return `
    ${renderReviewsStatusTabs(statusFilter)}
    ${
      sorted.length
        ? groupByRepo(sorted)
            .map(group => renderRepoGroup(group.label, group.items))
            .join('')
        : `<div class="kb-empty">No ${statusFilter} pull requests.</div>`
    }
  `;
}
