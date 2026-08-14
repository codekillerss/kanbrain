import { describe, it, expect } from 'vitest';
import { renderReviews } from './renderReviews';
import type { RenderState } from './render';
import type { KanbrainConfig, PullRequestSummary } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

function pr(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    id: 57,
    repositoryId: 'repo-1',
    repositoryName: 'kanbrain',
    title: 'Fix <login> bug',
    status: 'active',
    isDraft: false,
    sourceBranch: 'feature/login-fix',
    targetBranch: 'main',
    createdBy: { displayName: 'Jane Doe', imageUrl: null },
    creationDate: '2026-07-30T11:00:00Z',
    webUrl: 'https://dev.azure.com/org/proj/_git/kanbrain/pullrequest/57',
    ...overrides,
  };
}

function state(overrides: Partial<RenderState> = {}): RenderState {
  return {
    hasWorkspace: true,
    config: config(),
    workItem: null,
    parent: null,
    subtasks: [],
    screen: 'reviews',
    ...overrides,
  };
}

describe('renderReviews', () => {
  it('shows an empty message for the active filter when there are no pull requests', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'] }));
    expect(html).toContain('No active pull requests.');
  });

  it('shows an empty message reflecting a non-default filter', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['completed'] }));
    expect(html).toContain('No completed pull requests.');
  });

  it('shows a generic empty message when multiple statuses are selected', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active', 'completed'] }));
    expect(html).toContain('No pull requests match the selected status filters.');
  });

  it('shows the status filter as a select-style dropdown, not tabs', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'] }));
    expect(html).not.toContain('<select');
    expect(html).toContain('kb-status-select');
    expect(html).toContain('id="kb-reviews-status-trigger"');
    expect(html).toContain('id="kb-reviews-status-options"');
    expect(html).toContain('data-action="toggle-reviews-status-filter"');
  });

  it('shows the joined labels of selected statuses in the closed trigger', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active', 'completed'] }));
    const labelStart = html.indexOf('id="kb-reviews-status-trigger-label"');
    const content = html.slice(html.indexOf('>', labelStart) + 1, html.indexOf('</span>', labelStart));
    expect(content.trim()).toBe('Active, Completed');
  });

  it('checks the selected status in the dropdown', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['completed'] }));
    const start = html.indexOf('data-status="completed"');
    const tag = html.slice(html.lastIndexOf('<input', start), html.indexOf('>', start));
    expect(tag).toContain('checked');
  });

  it('does not check non-selected statuses in the dropdown', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['completed'] }));
    const start = html.indexOf('data-status="active"');
    const tag = html.slice(html.lastIndexOf('<input', start), html.indexOf('>', start));
    expect(tag).not.toContain('checked');
  });

  it('checks multiple statuses at once when multiple are selected', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active', 'abandoned'] }));
    const activeStart = html.indexOf('data-status="active"');
    const activeTag = html.slice(html.lastIndexOf('<input', activeStart), html.indexOf('>', activeStart));
    expect(activeTag).toContain('checked');
    const abandonedStart = html.indexOf('data-status="abandoned"');
    const abandonedTag = html.slice(html.lastIndexOf('<input', abandonedStart), html.indexOf('>', abandonedStart));
    expect(abandonedTag).toContain('checked');
    const completedStart = html.indexOf('data-status="completed"');
    const completedTag = html.slice(html.lastIndexOf('<input', completedStart), html.indexOf('>', completedStart));
    expect(completedTag).not.toContain('checked');
  });

  it('wraps the pull request groups in a scrollable list separate from the filters header', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    const filtersIndex = html.indexOf('kb-reviews-filters');
    const listIndex = html.indexOf('kb-reviews-list');
    const groupIndex = html.indexOf('kb-review-repo-group');
    expect(listIndex).toBeGreaterThan(filtersIndex);
    expect(groupIndex).toBeGreaterThan(listIndex);
  });

  it('shows all 5 owner-filter options as a single select', () => {
    const html = renderReviews(state({ reviewsPullRequests: [] }));
    expect(html).not.toContain('<select');
    expect(html).toContain('kb-status-select');
    expect(html).toContain('data-action="set-reviews-owner-filter" data-value="all"');
    expect(html).toContain('data-action="set-reviews-owner-filter" data-value="mine"');
    expect(html).toContain('data-action="set-reviews-owner-filter" data-value="assigned"');
    expect(html).toContain('data-action="set-reviews-owner-filter" data-value="fixed"');
    expect(html).toContain('data-action="set-reviews-owner-filter" data-value="needsMyFix"');
    expect(html).toContain('>My PRs<');
    expect(html).toContain('>Assigned to me<');
    expect(html).toContain('>Fixed (Me as reviewer)<');
    expect(html).toContain('>Needs my fix (Me as author)<');
  });

  it('shows "All" as the closed trigger label by default', () => {
    const html = renderReviews(state({ reviewsPullRequests: [] }));
    const labelStart = html.indexOf('id="kb-reviews-owner-trigger-label"');
    const content = html.slice(html.indexOf('>', labelStart) + 1, html.indexOf('</span>', labelStart));
    expect(content.trim()).toBe('All');
  });

  it('shows the selected owner filter\'s label as the closed trigger label', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'needsMyFix' }));
    const labelStart = html.indexOf('id="kb-reviews-owner-trigger-label"');
    const content = html.slice(html.indexOf('>', labelStart) + 1, html.indexOf('</span>', labelStart));
    expect(content.trim()).toBe('Needs my fix (Me as author)');
  });

  it('marks only the selected owner option as active', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'fixed' }));
    const fixedStart = html.indexOf('data-value="fixed"');
    const fixedTag = html.slice(html.lastIndexOf('<button', fixedStart), html.indexOf('>', fixedStart));
    expect(fixedTag).toContain('kb-status-select-option-active');

    const allStart = html.indexOf('data-value="all"');
    const allTag = html.slice(html.lastIndexOf('<button', allStart), html.indexOf('>', allStart));
    expect(allTag).not.toContain('kb-status-select-option-active');
  });

  it('appends "created by you" to the empty message when reviewsOwnerFilter is "mine"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'], reviewsOwnerFilter: 'mine' }));
    expect(html).toContain('No active pull requests created by you.');
  });

  it('appends "assigned to you" to the empty message when reviewsOwnerFilter is "assigned"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'], reviewsOwnerFilter: 'assigned' }));
    expect(html).toContain('No active pull requests assigned to you.');
  });

  it('shows the status select when reviewsOwnerFilter is "all", "mine", or "assigned"', () => {
    for (const ownerFilter of ['all', 'mine', 'assigned'] as const) {
      const html = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: ownerFilter }));
      expect(html).toContain('data-action="toggle-reviews-status-filter"');
    }
  });

  it('locks the status select to "Active" and disables it when reviewsOwnerFilter is "fixed" or "needsMyFix"', () => {
    const onFixed = renderReviews(
      state({ reviewsPullRequests: [], reviewsOwnerFilter: 'fixed', reviewsStatusFilters: ['completed', 'abandoned'] }),
    );
    expect(onFixed).toContain('kb-status-select-disabled');
    const fixedLabelStart = onFixed.indexOf('id="kb-reviews-status-trigger-label"');
    expect(onFixed.slice(fixedLabelStart, fixedLabelStart + 200)).toContain('>Active<');
    const fixedCheckboxes = onFixed.match(/data-action="toggle-reviews-status-filter"[^>]*/g) ?? [];
    expect(fixedCheckboxes).toHaveLength(3);
    fixedCheckboxes.forEach(tag => expect(tag).toContain('disabled'));

    const onNeedsMyFix = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'needsMyFix' }));
    expect(onNeedsMyFix).toContain('kb-status-select-disabled');
    expect(onNeedsMyFix).toContain('disabled');
  });

  it('shows a dedicated empty message when reviewsOwnerFilter is "fixed"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'fixed' }));
    expect(html).toContain('No pull requests fixed and ready for re-review.');
  });

  it('shows a dedicated empty message when reviewsOwnerFilter is "needsMyFix"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'needsMyFix' }));
    expect(html).toContain('No pull requests need your fix.');
  });

  it('still renders the pull request list normally when reviewsOwnerFilter is "fixed"/"needsMyFix"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsOwnerFilter: 'fixed' }));
    expect(html).toContain('kb-review-repo-group');
    expect(html).toContain('#57');
  });

  it('shows a failure warning when reviewsOwnerFilter is "fixed"/"needsMyFix" and some per-PR thread fetches failed', () => {
    const fixedHtml = renderReviews(state({ reviewsPullRequests: [pr()], reviewsOwnerFilter: 'fixed', reviewsFetchFailedCount: 2 }));
    expect(fixedHtml).toContain('2 pull requests could not be checked');

    const needsMyFixHtml = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'needsMyFix', reviewsFetchFailedCount: 1 }));
    expect(needsMyFixHtml).toContain('1 pull request could not be checked');
  });

  it('does not show the failure warning on "all"/"mine"/"assigned" or when there are no failures', () => {
    const onAllWithFailures = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'all', reviewsFetchFailedCount: 3 }));
    expect(onAllWithFailures).not.toContain('could not be checked');

    const onFixedNoFailures = renderReviews(state({ reviewsPullRequests: [pr()], reviewsOwnerFilter: 'fixed', reviewsFetchFailedCount: 0 }));
    expect(onFixedNoFailures).not.toContain('could not be checked');

    const onFixedUndefined = renderReviews(state({ reviewsPullRequests: [pr()], reviewsOwnerFilter: 'fixed' }));
    expect(onFixedUndefined).not.toContain('could not be checked');
  });

  it('groups pull requests into a section card per repository, with the repo shown as a tag plus a count in the header', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [pr({ id: 1, repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('kb-section-card');
    expect(html).toContain('kb-chevron');
    expect(html).toContain('kb-collapsible-body');
    expect(html).toContain('kb-repo-tag');
    expect(html).toContain('kanbrain');
    expect(html).toContain('(1)');
  });

  it('renders the count as its own trailing element so it lands opposite the repo tag (kb-section-label justifies space-between)', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('<span class="kb-review-group-count">(1)</span>');
  });

  it('marks the repo tag as unmapped when there is no local path configured for it', () => {
    const html = renderReviews(
      state({
        config: config({ repositories: {} }),
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('kb-repo-tag-unmapped');
  });

  it('does not mark the repo tag as unmapped when a local path is configured for it', () => {
    const html = renderReviews(
      state({
        config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '/local/kanbrain' } } }),
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).not.toContain('kb-repo-tag-unmapped');
  });

  it('puts pull requests from different repos into separate groups', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [
          pr({ id: 1, repositoryId: 'repo-1', repositoryName: 'kanbrain' }),
          pr({ id: 2, repositoryId: 'repo-2', repositoryName: 'ado-shared-libs' }),
        ],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('kanbrain');
    expect(html).toContain('ado-shared-libs');
    expect(html.split('kb-review-repo-group').length - 1).toBe(2);
  });

  it('keeps pull requests from the same repo under one group', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [
          pr({ id: 1, repositoryId: 'repo-1', repositoryName: 'kanbrain' }),
          pr({ id: 2, repositoryId: 'repo-1', repositoryName: 'kanbrain' }),
        ],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('(2)');
    expect(html.split('kb-review-repo-group').length - 1).toBe(1);
  });

  it('renders the title as its own link on the first line', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsStatusFilters: ['active'] }));
    expect(html).toContain('class="kb-review-row-title"');
    expect(html).toContain('#57');
    expect(html).toContain('Fix &lt;login&gt; bug');
  });

  it('escapes the title instead of injecting raw HTML', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsStatusFilters: ['active'] }));
    expect(html).not.toContain('Fix <login> bug');
  });

  it('links the title to the openPullRequestDetail command with repositoryId and id', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ repositoryId: 'repo-1', id: 57 })], reviewsStatusFilters: ['active'] }));
    const commandArgs = encodeURIComponent(JSON.stringify(['repo-1', 57]));
    expect(html).toContain(`command:kanbrain.openPullRequestDetail?${commandArgs}`);
  });

  it('shows the assignee as an avatar-initial plus name on the second line', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ createdBy: { displayName: 'Jane Doe', imageUrl: null } })], reviewsStatusFilters: ['active'] }));
    expect(html).toContain('kb-avatar-initial');
    expect(html).toContain('>J<');
    expect(html).toContain('kb-review-row-author');
    expect(html).toContain('Jane Doe');
  });

  it('shows the branch as a real branch tag, not plain text', () => {
    const html = renderReviews(
      state({
        config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '/local/kanbrain' } } }),
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', sourceBranch: 'feature/login-fix' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('kb-branch-tag');
    expect(html).toContain('feature/login-fix');
  });

  it('renders the branch tag as disabled (not a checkout link) when the repo has no local path configured', () => {
    const html = renderReviews(
      state({
        config: config({ repositories: {} }),
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', sourceBranch: 'feature/login-fix' })],
        reviewsStatusFilters: ['active'],
      }),
    );
    expect(html).toContain('kb-branch-tag-disabled');
  });

  it('colors the row border for the status instead of showing a status badge', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ status: 'active', isDraft: false })], reviewsStatusFilters: ['active'] }));
    expect(html).toContain('border-left-color: var(--vscode-charts-blue)');
    expect(html).not.toContain('kb-review-status-badge');
  });

  it('colors the row border yellow and titles it Draft for draft PRs', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ status: 'completed', isDraft: true })], reviewsStatusFilters: ['active'] }));
    expect(html).toContain('border-left-color: var(--vscode-charts-yellow)');
    expect(html).toContain('title="Draft"');
  });

  it('sorts pull requests newest first within a group', () => {
    const older = pr({ id: 1, creationDate: '2026-07-20T00:00:00Z', title: 'Older' });
    const newer = pr({ id: 2, creationDate: '2026-07-29T00:00:00Z', title: 'Newer' });
    const html = renderReviews(state({ reviewsPullRequests: [older, newer], reviewsStatusFilters: ['active'] }));
    expect(html.indexOf('Newer')).toBeLessThan(html.indexOf('Older'));
  });
});
