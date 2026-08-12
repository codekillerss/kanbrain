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

  it('shows the status filter as tabs, not a select', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'] }));
    expect(html).not.toContain('<select');
    expect(html).toContain('kb-search-tabs');
    expect(html).toContain('data-action="toggle-reviews-status-filter"');
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

  it('shows "My PRs" and "Assigned to me" checkboxes, both unchecked by default', () => {
    const html = renderReviews(state({ reviewsPullRequests: [] }));
    expect(html).toContain('id="kb-reviews-filter-mine"');
    expect(html).toContain('My PRs');
    expect(html).toContain('id="kb-reviews-filter-assigned"');
    expect(html).toContain('Assigned to me');

    const mineStart = html.indexOf('id="kb-reviews-filter-mine"');
    const mineTag = html.slice(html.lastIndexOf('<input', mineStart), html.indexOf('>', mineStart));
    expect(mineTag).not.toContain('checked');

    const assignedStart = html.indexOf('id="kb-reviews-filter-assigned"');
    const assignedTag = html.slice(html.lastIndexOf('<input', assignedStart), html.indexOf('>', assignedStart));
    expect(assignedTag).not.toContain('checked');
  });

  it('checks only "My PRs" when reviewsOwnerFilter is "mine"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'mine' }));

    const mineStart = html.indexOf('id="kb-reviews-filter-mine"');
    const mineTag = html.slice(html.lastIndexOf('<input', mineStart), html.indexOf('>', mineStart));
    expect(mineTag).toContain('checked');

    const assignedStart = html.indexOf('id="kb-reviews-filter-assigned"');
    const assignedTag = html.slice(html.lastIndexOf('<input', assignedStart), html.indexOf('>', assignedStart));
    expect(assignedTag).not.toContain('checked');
  });

  it('checks only "Assigned to me" when reviewsOwnerFilter is "assigned"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsOwnerFilter: 'assigned' }));

    const assignedStart = html.indexOf('id="kb-reviews-filter-assigned"');
    const assignedTag = html.slice(html.lastIndexOf('<input', assignedStart), html.indexOf('>', assignedStart));
    expect(assignedTag).toContain('checked');

    const mineStart = html.indexOf('id="kb-reviews-filter-mine"');
    const mineTag = html.slice(html.lastIndexOf('<input', mineStart), html.indexOf('>', mineStart));
    expect(mineTag).not.toContain('checked');
  });

  it('appends "created by you" to the empty message when reviewsOwnerFilter is "mine"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'], reviewsOwnerFilter: 'mine' }));
    expect(html).toContain('No active pull requests created by you.');
  });

  it('appends "assigned to you" to the empty message when reviewsOwnerFilter is "assigned"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active'], reviewsOwnerFilter: 'assigned' }));
    expect(html).toContain('No active pull requests assigned to you.');
  });

  it('marks the selected status tab as active', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['completed'] }));
    const tabStart = html.indexOf('data-status="completed"');
    const tagStart = html.lastIndexOf('<button', tabStart);
    const tag = html.slice(tagStart, html.indexOf('>', tabStart));
    expect(tag).toContain('kb-search-tab-active');
  });

  it('does not mark non-selected status tabs as active', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['completed'] }));
    const tabStart = html.indexOf('data-status="active"');
    const tagStart = html.lastIndexOf('<button', tabStart);
    const tag = html.slice(tagStart, html.indexOf('>', tabStart));
    expect(tag).not.toContain('kb-search-tab-active');
  });

  it('marks multiple status tabs as active at once when multiple are selected', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilters: ['active', 'abandoned'] }));
    const activeStart = html.indexOf('data-status="active"');
    const activeTag = html.slice(html.lastIndexOf('<button', activeStart), html.indexOf('>', activeStart));
    expect(activeTag).toContain('kb-search-tab-active');
    const abandonedStart = html.indexOf('data-status="abandoned"');
    const abandonedTag = html.slice(html.lastIndexOf('<button', abandonedStart), html.indexOf('>', abandonedStart));
    expect(abandonedTag).toContain('kb-search-tab-active');
    const completedStart = html.indexOf('data-status="completed"');
    const completedTag = html.slice(html.lastIndexOf('<button', completedStart), html.indexOf('>', completedStart));
    expect(completedTag).not.toContain('kb-search-tab-active');
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

  it('shows three top-level tabs: All, Fixed, Needs my fix', () => {
    const html = renderReviews(state({ reviewsPullRequests: [] }));
    expect(html).toContain('data-action="set-reviews-tab" data-tab="all"');
    expect(html).toContain('data-action="set-reviews-tab" data-tab="fixed"');
    expect(html).toContain('data-action="set-reviews-tab" data-tab="needsMyFix"');
    expect(html).toContain('>All<');
    expect(html).toContain('>Fixed<');
    expect(html).toContain('>Needs my fix<');
  });

  it('marks the "all" tab active by default', () => {
    const html = renderReviews(state({ reviewsPullRequests: [] }));
    const tabStart = html.indexOf('data-tab="all"');
    const tag = html.slice(html.lastIndexOf('<button', tabStart), html.indexOf('>', tabStart));
    expect(tag).toContain('kb-search-tab-active');
  });

  it('marks the "fixed" tab active when reviewsTab is "fixed"', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'fixed' }));
    const tabStart = html.indexOf('data-tab="fixed"');
    const tag = html.slice(html.lastIndexOf('<button', tabStart), html.indexOf('>', tabStart));
    expect(tag).toContain('kb-search-tab-active');
  });

  it('shows the status multi-select and owner checkboxes only on the "all" tab', () => {
    const onAll = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'all' }));
    expect(onAll).toContain('data-action="toggle-reviews-status-filter"');
    expect(onAll).toContain('id="kb-reviews-filter-mine"');

    const onFixed = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'fixed' }));
    expect(onFixed).not.toContain('data-action="toggle-reviews-status-filter"');
    expect(onFixed).not.toContain('id="kb-reviews-filter-mine"');

    const onNeedsMyFix = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'needsMyFix' }));
    expect(onNeedsMyFix).not.toContain('data-action="toggle-reviews-status-filter"');
    expect(onNeedsMyFix).not.toContain('id="kb-reviews-filter-mine"');
  });

  it('shows a dedicated empty message on the "fixed" tab', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'fixed' }));
    expect(html).toContain('No pull requests fixed and ready for re-review.');
  });

  it('shows a dedicated empty message on the "needsMyFix" tab', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'needsMyFix' }));
    expect(html).toContain('No pull requests need your fix.');
  });

  it('still renders the pull request list normally on the "fixed"/"needsMyFix" tabs', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsTab: 'fixed' }));
    expect(html).toContain('kb-review-repo-group');
    expect(html).toContain('#57');
  });

  it('shows a failure warning on the "fixed"/"needsMyFix" tabs when some per-PR thread fetches failed', () => {
    const fixedHtml = renderReviews(state({ reviewsPullRequests: [pr()], reviewsTab: 'fixed', reviewsFetchFailedCount: 2 }));
    expect(fixedHtml).toContain('2 pull requests could not be checked');

    const needsMyFixHtml = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'needsMyFix', reviewsFetchFailedCount: 1 }));
    expect(needsMyFixHtml).toContain('1 pull request could not be checked');
  });

  it('does not show the failure warning on the "all" tab or when there are no failures', () => {
    const onAllWithFailures = renderReviews(state({ reviewsPullRequests: [], reviewsTab: 'all', reviewsFetchFailedCount: 3 }));
    expect(onAllWithFailures).not.toContain('could not be checked');

    const onFixedNoFailures = renderReviews(state({ reviewsPullRequests: [pr()], reviewsTab: 'fixed', reviewsFetchFailedCount: 0 }));
    expect(onFixedNoFailures).not.toContain('could not be checked');

    const onFixedUndefined = renderReviews(state({ reviewsPullRequests: [pr()], reviewsTab: 'fixed' }));
    expect(onFixedUndefined).not.toContain('could not be checked');
  });
});
