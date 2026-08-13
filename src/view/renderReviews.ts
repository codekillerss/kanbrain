import type { RenderState } from './render';
import type { PullRequestSummary, RepositoryPathEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { resolvePrStatusColor } from './renderPrStatus';
import { capitalize } from './renderDevelopment';
import { renderBranchTag, renderRepoTag } from './renderRepoBranchTags';
import { renderAvatarOrInitial } from './renderAssignee';

type ReviewsOwnerFilter = 'all' | 'mine' | 'assigned' | 'fixed' | 'needsMyFix';

const STATUS_FILTER_OPTIONS: { value: 'active' | 'completed' | 'abandoned'; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

const OWNER_FILTER_OPTIONS: { value: ReviewsOwnerFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'My PRs' },
  { value: 'assigned', label: 'Assigned to me' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'needsMyFix', label: 'Needs my fix' },
];

function renderReviewsStatusMultiSelect(selected: ('active' | 'completed' | 'abandoned')[]): string {
  const triggerLabel = STATUS_FILTER_OPTIONS.filter(o => selected.includes(o.value))
    .map(o => o.label)
    .join(', ');
  return `
    <div class="kb-status-select">
      <div id="kb-reviews-status-trigger" class="kb-status-select-trigger">
        <span id="kb-reviews-status-trigger-label" class="kb-status-select-trigger-label">${escapeHtml(triggerLabel)}</span>
      </div>
      <span id="kb-reviews-status-icon" class="kb-status-select-icon" aria-hidden="true">▼</span>
      <div id="kb-reviews-status-options" class="kb-status-select-dropdown kb-hidden">
        ${STATUS_FILTER_OPTIONS.map(
          o => `
            <label class="kb-checkbox-row">
              <input type="checkbox" data-action="toggle-reviews-status-filter" data-status="${o.value}" data-label="${escapeHtml(o.label)}" ${selected.includes(o.value) ? 'checked' : ''}>
              ${o.label}
            </label>
          `,
        ).join('')}
      </div>
    </div>
  `;
}

function renderReviewsOwnerSelect(selected: ReviewsOwnerFilter): string {
  const selectedLabel = OWNER_FILTER_OPTIONS.find(o => o.value === selected)?.label ?? 'All';
  return `
    <div class="kb-status-select">
      <div id="kb-reviews-owner-trigger" class="kb-status-select-trigger">
        <span id="kb-reviews-owner-trigger-label" class="kb-status-select-trigger-label">${escapeHtml(selectedLabel)}</span>
      </div>
      <span id="kb-reviews-owner-icon" class="kb-status-select-icon" aria-hidden="true">▼</span>
      <div id="kb-reviews-owner-options" class="kb-status-select-dropdown kb-hidden">
        ${OWNER_FILTER_OPTIONS.map(
          o =>
            `<button type="button" class="kb-status-select-option${o.value === selected ? ' kb-status-select-option-active' : ''}" data-action="set-reviews-owner-filter" data-value="${o.value}">${o.label}</button>`,
        ).join('')}
      </div>
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
  const repoTagHtml = renderRepoTag(group.repositoryId, repositories[group.repositoryId] ?? { name: group.label, path: '' });

  return `
    <div class="kb-section-card kb-review-repo-group">
      <div class="kb-section-label" data-action="toggle-group">
        <span><span class="kb-chevron">▾</span>${repoTagHtml}</span>
        <span class="kb-review-group-count">(${group.items.length})</span>
      </div>
      <div class="kb-collapsible-body">
        ${group.items.map(pr => renderReviewRow(pr, repositories)).join('')}
      </div>
    </div>
  `;
}

function renderFetchFailureNotice(ownerFilter: ReviewsOwnerFilter, failedCount: number): string {
  if ((ownerFilter !== 'fixed' && ownerFilter !== 'needsMyFix') || !failedCount) {
    return '';
  }
  const plural = failedCount === 1 ? '' : 's';
  return `<div class="kb-empty">⚠ ${failedCount} pull request${plural} could not be checked and may be missing from this list.</div>`;
}

function renderEmptyMessage(ownerFilter: ReviewsOwnerFilter, statusFilters: ('active' | 'completed' | 'abandoned')[]): string {
  if (ownerFilter === 'fixed') {
    return '<div class="kb-empty">No pull requests fixed and ready for re-review.</div>';
  }
  if (ownerFilter === 'needsMyFix') {
    return '<div class="kb-empty">No pull requests need your fix.</div>';
  }
  const ownerSuffix = ownerFilter === 'mine' ? ' created by you' : ownerFilter === 'assigned' ? ' assigned to you' : '';
  if (statusFilters.length === 1) {
    return `<div class="kb-empty">No ${statusFilters[0]} pull requests${ownerSuffix}.</div>`;
  }
  return `<div class="kb-empty">No pull requests${ownerSuffix} match the selected status filters.</div>`;
}

export function renderReviews(state: RenderState): string {
  const config = state.config!;
  const repositories = config.repositories ?? {};
  const ownerFilter = state.reviewsOwnerFilter ?? 'all';
  const statusFilters = state.reviewsStatusFilters ?? ['active'];
  const pullRequests = state.reviewsPullRequests ?? [];
  const sorted = [...pullRequests].sort((a, b) => new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());
  const showStatusFilter = ownerFilter !== 'fixed' && ownerFilter !== 'needsMyFix';
  const failureNoticeHtml = renderFetchFailureNotice(ownerFilter, state.reviewsFetchFailedCount ?? 0);

  return `
    <div class="kb-reviews-filters">
      ${showStatusFilter ? renderReviewsStatusMultiSelect(statusFilters) : ''}
      ${renderReviewsOwnerSelect(ownerFilter)}
    </div>
    <div class="kb-reviews-list">
      ${failureNoticeHtml}
      ${
        sorted.length
          ? groupByRepo(sorted)
              .map(group => renderRepoGroup(group, repositories))
              .join('')
          : renderEmptyMessage(ownerFilter, statusFilters)
      }
    </div>
  `;
}
