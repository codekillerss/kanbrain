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

  it('renders a card with id, title, author, repo, and branch', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsStatusFilter: 'active' }));
    expect(html).toContain('#57');
    expect(html).toContain('Fix &lt;login&gt; bug');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('feature/login-fix');
  });

  it('escapes the title instead of injecting raw HTML', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr()], reviewsStatusFilter: 'active' }));
    expect(html).not.toContain('Fix <login> bug');
  });

  it('links each card to the openPullRequestDetail command with repositoryId and id', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ repositoryId: 'repo-1', id: 57 })], reviewsStatusFilter: 'active' }));
    const commandArgs = encodeURIComponent(JSON.stringify(['repo-1', 57]));
    expect(html).toContain(`command:kanbrain.openPullRequestDetail?${commandArgs}`);
  });

  it('shows a status dot colored for the status', () => {
    const html = renderReviews(state({ reviewsPullRequests: [pr({ status: 'active', isDraft: false })], reviewsStatusFilter: 'active' }));
    expect(html).toContain('kb-status-dot');
    expect(html).toContain('background-color: var(--vscode-charts-blue)');
  });

  it('shows the status filter select with the active option selected', () => {
    const html = renderReviews(state({ reviewsPullRequests: [], reviewsStatusFilter: 'completed' }));
    expect(html).toContain('id="kb-reviews-status-filter"');
    const optionStart = html.indexOf('value="completed"');
    const optionTag = html.slice(optionStart - 40, optionStart + 60);
    expect(optionTag).toContain('selected');
  });

  it('defaults the filter to active when reviewsStatusFilter is omitted', () => {
    const html = renderReviews(state({ reviewsPullRequests: [] }));
    const optionStart = html.indexOf('value="active"');
    const optionTag = html.slice(optionStart - 40, optionStart + 60);
    expect(optionTag).toContain('selected');
  });

  it('sorts pull requests newest first', () => {
    const older = pr({ id: 1, creationDate: '2026-07-20T00:00:00Z', title: 'Older' });
    const newer = pr({ id: 2, creationDate: '2026-07-29T00:00:00Z', title: 'Newer' });
    const html = renderReviews(state({ reviewsPullRequests: [older, newer], reviewsStatusFilter: 'active' }));
    expect(html.indexOf('Newer')).toBeLessThan(html.indexOf('Older'));
  });
});
