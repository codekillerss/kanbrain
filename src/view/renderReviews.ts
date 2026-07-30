import type { RenderState } from './render';
import type { PullRequestSummary, RepositoryPathEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { resolvePrStatusColor } from './renderPrStatus';
import { capitalize } from './renderDevelopment';
import { renderBranchTag, REPO_ICON } from './renderRepoBranchTags';
import { renderAvatarOrInitial } from './renderAssignee';

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

function renderReviewRow(pr: PullRequestSummary, repositories: Record<string, RepositoryPathEntry>): string {
  const statusColor = resolvePrStatusColor(pr.status, pr.isDraft);
  const statusLabel = pr.isDraft ? 'Draft' : capitalize(pr.status);
  const commandArgs = encodeURIComponent(JSON.stringify([pr.repositoryId, pr.id]));
  const isMapped = !!repositories[pr.repositoryId]?.path;
  const branchTagHtml = renderBranchTag(pr.sourceBranch, isMapped ? [pr.repositoryId, pr.sourceBranch] : null);
  const avatarHtml = renderAvatarOrInitial(pr.createdBy.displayName, pr.createdBy.imageUrl, {});

  return `
    <div class="kb-review-row" style="border-left-color: ${statusColor}" title="${escapeHtml(statusLabel)}">
      <a class="kb-review-row-title" href="command:kanbrain.openPullRequestDetail?${commandArgs}">#${pr.id} ${escapeHtml(pr.title)}</a>
      <div class="kb-review-row-meta">
        ${avatarHtml}<span class="kb-review-row-author">${escapeHtml(pr.createdBy.displayName)}</span>
        ${branchTagHtml}
      </div>
    </div>
  `;
}

interface RepoGroup {
  repositoryId: string;
  label: string;
  items: PullRequestSummary[];
}

function groupByRepo(prs: PullRequestSummary[]): RepoGroup[] {
  const groups = new Map<string, RepoGroup>();
  for (const pr of prs) {
    const existing = groups.get(pr.repositoryId);
    if (existing) {
      existing.items.push(pr);
    } else {
      groups.set(pr.repositoryId, { repositoryId: pr.repositoryId, label: pr.repositoryName, items: [pr] });
    }
  }
  return [...groups.values()];
}

function renderRepoGroup(group: RepoGroup, repositories: Record<string, RepositoryPathEntry>): string {
  const isMapped = !!repositories[group.repositoryId]?.path;
  const repoTagHtml = `<span class="kb-repo-tag${isMapped ? '' : ' kb-repo-tag-unmapped'}">${REPO_ICON}<span class="kb-tag-text">${escapeHtml(group.label)}</span></span>`;

  return `
    <div class="kb-section-card kb-review-repo-group">
      <button type="button" class="kb-section-label" data-action="toggle-group">
        <span><span class="kb-chevron">▾</span>${repoTagHtml}</span>
        <span class="kb-review-group-count">(${group.items.length})</span>
      </button>
      <div class="kb-collapsible-body">
        ${group.items.map(pr => renderReviewRow(pr, repositories)).join('')}
      </div>
    </div>
  `;
}

export function renderReviews(state: RenderState): string {
  const config = state.config!;
  const repositories = config.repositories ?? {};
  const statusFilter = state.reviewsStatusFilter ?? 'active';
  const pullRequests = state.reviewsPullRequests ?? [];
  const sorted = [...pullRequests].sort((a, b) => new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());

  return `
    ${renderReviewsStatusTabs(statusFilter)}
    ${
      sorted.length
        ? groupByRepo(sorted)
            .map(group => renderRepoGroup(group, repositories))
            .join('')
        : `<div class="kb-empty">No ${statusFilter} pull requests.</div>`
    }
  `;
}
