import { describe, it, expect } from 'vitest';
import { renderPullRequestDetail } from './renderPullRequestDetail';
import type { WorkItem, KanbrainConfig, PullRequestDetail } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Fix bug',
    description: '',
    status: 'Active',
    type: 'Task',
    url: '',
    parentId: null,
    childIds: [],
    assignedTo: null,
    development: [],
    ...overrides,
  };
}

function pullRequest(overrides: Partial<PullRequestDetail> = {}): PullRequestDetail {
  return {
    id: 57,
    title: 'Fix <login> bug',
    description: 'Fixes the thing.',
    status: 'active',
    isDraft: false,
    sourceBranch: 'feature/login-fix',
    targetBranch: 'main',
    createdBy: { displayName: 'Jane Doe', imageUrl: null },
    reviewers: [],
    workItemIds: [],
    webUrl: 'https://dev.azure.com/my-org/MyProject/_git/kanbrain/pullrequest/57',
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  defaultTeam: 'MyProject Team',
  skills: {},
  statusColors: {},
  typeColors: {},
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};

describe('renderPullRequestDetail', () => {
  it('shows the escaped title, status, and branches', () => {
    const html = renderPullRequestDetail({ pr: pullRequest(), workItems: [], config });

    expect(html).toContain('Fix &lt;login&gt; bug');
    expect(html).toContain('Active');
    expect(html).toContain('feature/login-fix');
    expect(html).toContain('main');
  });

  it('shows "Draft" instead of the status when the PR is a draft', () => {
    const html = renderPullRequestDetail({ pr: pullRequest({ isDraft: true, status: 'active' }), workItems: [], config });
    expect(html).toContain('Draft');
  });

  it('shows the description, escaped', () => {
    const html = renderPullRequestDetail({ pr: pullRequest({ description: '<script>alert(1)</script>' }), workItems: [], config });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('links to the PR web URL', () => {
    const html = renderPullRequestDetail({ pr: pullRequest(), workItems: [], config });
    expect(html).toContain('href="https://dev.azure.com/my-org/MyProject/_git/kanbrain/pullrequest/57"');
  });

  it.each([
    [10, 'Approved'],
    [5, 'Approved with suggestions'],
    [0, 'No vote'],
    [-5, 'Waiting for author'],
    [-10, 'Rejected'],
  ])('shows the label for vote code %d', (vote, label) => {
    const html = renderPullRequestDetail({
      pr: pullRequest({ reviewers: [{ displayName: 'Bob', imageUrl: null, vote, isRequired: false }] }),
      workItems: [],
      config,
    });
    expect(html).toContain(label);
  });

  it('shows a Required tag for required reviewers', () => {
    const html = renderPullRequestDetail({
      pr: pullRequest({ reviewers: [{ displayName: 'Bob', imageUrl: null, vote: 0, isRequired: true }] }),
      workItems: [],
      config,
    });
    expect(html).toContain('Required');
  });

  it('shows a message when there are no reviewers', () => {
    const html = renderPullRequestDetail({ pr: pullRequest({ reviewers: [] }), workItems: [], config });
    expect(html).toContain('No reviewers.');
  });

  it('shows linked work items with a link to their own detail panel', () => {
    const html = renderPullRequestDetail({ pr: pullRequest(), workItems: [workItem({ id: 482, title: 'Linked item' })], config });

    expect(html).toContain('Linked Work Items');
    expect(html).toContain('#482');
    expect(html).toContain('Linked item');
    expect(html).toContain('command:kanbrain.openWorkItemDetail?');
  });

  it('omits the Linked Work Items group when there are none', () => {
    const html = renderPullRequestDetail({ pr: pullRequest(), workItems: [], config });
    expect(html).not.toContain('Linked Work Items');
  });
});
