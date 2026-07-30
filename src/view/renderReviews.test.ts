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
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilter: 'active' }));
    expect(html).toContain('No active pull requests.');
  });

  it('shows an empty message reflecting a non-default filter', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilter: 'completed' }));
    expect(html).toContain('No completed pull requests.');
  });

  it('shows the status filter as tabs, not a select', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilter: 'active' }));
    expect(html).not.toContain('<select');
    expect(html).toContain('kb-search-tabs');
    expect(html).toContain('data-action="set-reviews-status-filter"');
  });

  it('marks the selected status tab as active', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilter: 'completed' }));
    const tabStart = html.indexOf('data-status="completed"');
    const tagStart = html.lastIndexOf('<button', tabStart);
    const tag = html.slice(tagStart, html.indexOf('>', tabStart));
    expect(tag).toContain('kb-search-tab-active');
  });

  it('does not mark non-selected tabs as active', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilter: 'completed' }));
    const tabStart = html.indexOf('data-status="active"');
    const tagStart = html.lastIndexOf('<button', tabStart);
    const tag = html.slice(tagStart, html.indexOf('>', tabStart));
    expect(tag).not.toContain('kb-search-tab-active');
  });

  it('groups pull requests into a section card per repository, with the repo shown as a tag plus a count in the header', () => {
    const html = renderReviews(
      state({
        reviewsPullRequests: [pr({ id: 1, repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilter: 'active',
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
        reviewsStatusFilter: 'active',
      }),
    );
    expect(html).toContain('<span class="kb-review-group-count">(1)</span>');
  });

  it('marks the repo tag as unmapped when there is no local path configured for it', () => {
    const html = renderReviews(
      state({
        config: config({ repositories: {} }),
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilter: 'active',
      }),
    );
    expect(html).toContain('kb-repo-tag-unmapped');
  });

  it('does not mark the repo tag as unmapped when a local path is configured for it', () => {
    const html = renderReviews(
      state({
        config: config({ repositories: { 'repo-1': { name: 'kanbrain', path: '/local/kanbrain' } } }),
        reviewsPullRequests: [pr({ repositoryId: 'repo-1', repositoryName: 'kanbrain' })],
        reviewsStatusFilter: 'active',
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
        reviewsStatusFilter: 'active',
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
        reviewsStatusFilter: 'active',
      }),
    );
    expect(html).toContain('(2)');
    expect(html.split('kb-review-repo-group').length - 1).toBe(1);
  });

  it('renders the title as its own link on the first line', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsStatusFilter: 'active' }));
    expect(html).toContain('class="kb-review-row-title"');
    expect(html).toContain('#57');
    expect(html).toContain('Fix &lt;login&gt; bug');
  });

  it('escapes the title instead of injecting raw HTML', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsStatusFilter: 'active' }));
    expect(html).not.toContain('Fix <login> bug');
  });

  it('links the title to the openPullRequestDetail command with repositoryId and id', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ repositoryId: 'repo-1', id: 57 })], reviewsStatusFilter: 'active' }));
    const commandArgs = encodeURIComponent(JSON.stringify(['repo-1', 57]));
    expect(html).toContain(`command:kanbrain.openPullRequestDetail?${commandArgs}`);
  });

  it('shows the assignee as an avatar-initial plus name on the second line', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ createdBy: { displayName: 'Jane Doe', imageUrl: null } })], reviewsStatusFilter: 'active' }));
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
        reviewsStatusFilter: 'active',
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
        reviewsStatusFilter: 'active',
      }),
    );
    expect(html).toContain('kb-branch-tag-disabled');
  });

  it('colors the row border for the status instead of showing a status badge', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ status: 'active', isDraft: false })], reviewsStatusFilter: 'active' }));
    expect(html).toContain('border-left-color: var(--vscode-charts-blue)');
    expect(html).not.toContain('kb-review-status-badge');
  });

  it('colors the row border yellow and titles it Draft for draft PRs', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ status: 'completed', isDraft: true })], reviewsStatusFilter: 'active' }));
    expect(html).toContain('border-left-color: var(--vscode-charts-yellow)');
    expect(html).toContain('title="Draft"');
  });

  it('sorts pull requests newest first within a group', () => {
    const older = pr({ id: 1, creationDate: '2026-07-20T00:00:00Z', title: 'Older' });
    const newer = pr({ id: 2, creationDate: '2026-07-29T00:00:00Z', title: 'Newer' });
    const html = renderReviews(state({ reviewsPullRequests: [older, newer], reviewsStatusFilter: 'active' }));
    expect(html.indexOf('Newer')).toBeLessThan(html.indexOf('Older'));
  });
});
