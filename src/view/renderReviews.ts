import type { RenderState } from './render';
import type { PullRequestSummary, RepositoryPathEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { resolvePrStatusColor } from './renderPrStatus';
import { capitalize } from './renderDevelopment';
import { renderBranchTag, renderRepoTag } from './renderRepoBranchTags';
import { renderAvatarOrInitial } from './renderAssignee';

const STATUS_FILTER_OPTIONS: { value: 'active' | 'completed' | 'abandoned'; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'abandoned', label: 'Abandoned' },
];

const OWNER_FILTER_OPTIONS: { value: 'mine' | 'assigned'; id: string; label: string }[] = [
  { value: 'mine', id: 'kb-reviews-filter-mine', label: 'My PRs' },
  { value: 'assigned', id: 'kb-reviews-filter-assigned', label: 'Assigned to me' },
];

const TAB_OPTIONS: { value: 'all' | 'fixed' | 'needsMyFix'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'needsMyFix', label: 'Needs my fix' },
];

function renderReviewsTopTabs(selected: 'all' | 'fixed' | 'needsMyFix'): string {
  return `
    <div class="kb-search-tabs">
      ${TAB_OPTIONS.map(
        o =>
          `<button type="button" class="kb-search-tab${o.value === selected ? ' kb-search-tab-active' : ''}" data-action="set-reviews-tab" data-tab="${o.value}">${o.label}</button>`,
      ).join('')}
    </div>
  `;
}

function renderReviewsStatusMultiSelect(selected: ('active' | 'completed' | 'abandoned')[]): string {
  return `
    <div class="kb-search-tabs">
      ${STATUS_FILTER_OPTIONS.map(
        o =>
          `<button type="button" class="kb-search-tab${selected.includes(o.value) ? ' kb-search-tab-active' : ''}" data-action="toggle-reviews-status-filter" data-status="${o.value}">${o.label}</button>`,
      ).join('')}
    </div>
  `;
}

function renderReviewsOwnerFilters(selected: 'all' | 'mine' | 'assigned'): string {
  return `
    <div class="kb-reviews-owner-filters">
      ${OWNER_FILTER_OPTIONS.map(
        o => `
          <label class="kb-checkbox-row">
            <input type="checkbox" id="${o.id}" ${selected === o.value ? 'checked' : ''}>
            ${o.label}
          </label>
        `,
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

function renderEmptyMessage(
  tab: 'all' | 'fixed' | 'needsMyFix',
  statusFilters: ('active' | 'completed' | 'abandoned')[],
  ownerFilter: 'all' | 'mine' | 'assigned',
): string {
  if (tab === 'fixed') {
    return '<div class="kb-empty">No pull requests fixed and ready for re-review.</div>';
  }
  if (tab === 'needsMyFix') {
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
  const tab = state.reviewsTab ?? 'all';
  const statusFilters = state.reviewsStatusFilters ?? ['active'];
  const ownerFilter = state.reviewsOwnerFilter ?? 'all';
  const pullRequests = state.reviewsPullRequests ?? [];
  const sorted = [...pullRequests].sort((a, b) => new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime());

  return `
    ${renderReviewsTopTabs(tab)}
    <div class="kb-reviews-filters">
      ${tab === 'all' ? `${renderReviewsStatusMultiSelect(statusFilters)}${renderReviewsOwnerFilters(ownerFilter)}` : ''}
    </div>
    <div class="kb-reviews-list">
      ${
        sorted.length
          ? groupByRepo(sorted)
              .map(group => renderRepoGroup(group, repositories))
              .join('')
          : renderEmptyMessage(tab, statusFilters, ownerFilter)
      }
    </div>
  `;
}
