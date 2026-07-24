import { describe, it, expect } from 'vitest';
import { renderPullRequestDetail, type PullRequestDetailInput } from './renderPullRequestDetail';
import type { WorkItem, KanbrainConfig, PullRequestDetail, PullRequestThread } from '../types';

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
    repositoryId: 'repo-1',
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

function thread(overrides: Partial<PullRequestThread> = {}): PullRequestThread {
  return {
    id: 1,
    status: 'active',
    filePath: null,
    line: null,
    comments: [{ id: 1, parentCommentId: 0, text: 'Looks good', createdBy: { displayName: 'Bob', imageUrl: null }, createdDate: '2026-01-01T00:00:00Z' }],
    ...overrides,
  };
}

function input(overrides: Partial<PullRequestDetailInput> = {}): PullRequestDetailInput {
  return {
    pr: pullRequest(),
    workItems: [],
    config,
    threads: [],
    avatars: {},
    gitLensIconDataUri: null,
    repositoryName: null,
    ...overrides,
  };
}

describe('renderPullRequestDetail', () => {
  it('shows the escaped title, status, and branches', () => {
    const html = renderPullRequestDetail(input());

    expect(html).toContain('Fix &lt;login&gt; bug');
    expect(html).toContain('Active');
    expect(html).toContain('feature/login-fix');
    expect(html).toContain('main');
  });

  it('shows the repository name, escaped, when known', () => {
    const html = renderPullRequestDetail(input({ repositoryName: 'Fix <me>' }));
    expect(html).toContain('Fix &lt;me&gt;');
  });

  it('omits the repository name tag when unknown', () => {
    const html = renderPullRequestDetail(input({ repositoryName: null }));
    expect(html).not.toContain('kb-pr-repo-name');
  });

  it('shows "Draft" instead of the status when the PR is a draft', () => {
    const html = renderPullRequestDetail(input({ pr: pullRequest({ isDraft: true, status: 'active' }) }));
    expect(html).toContain('Draft');
  });

  it.each([
    ['active', 'var(--vscode-charts-blue)'],
    ['completed', 'var(--vscode-charts-green)'],
    ['abandoned', 'var(--vscode-charts-red)'],
  ])('colors the status dot for status %s', (status, color) => {
    const html = renderPullRequestDetail(input({ pr: pullRequest({ status, isDraft: false }) }));
    expect(html).toContain(`background-color: ${color}`);
  });

  it('colors the status dot yellow for a draft PR regardless of status', () => {
    const html = renderPullRequestDetail(input({ pr: pullRequest({ status: 'active', isDraft: true }) }));
    expect(html).toContain('background-color: var(--vscode-charts-yellow)');
  });

  it('links both branches to a checkoutBranch command URI', () => {
    const html = renderPullRequestDetail(input());

    const matches = [...html.matchAll(/href="(command:kanbrain\.checkoutBranch\?[^"]+)"/g)];
    expect(matches).toHaveLength(2);

    const decoded = matches.map(m => JSON.parse(decodeURIComponent(m[1].split('?')[1])));
    expect(decoded).toEqual([
      ['repo-1', 'feature/login-fix'],
      ['repo-1', 'main'],
    ]);
  });

  it('shows the description, escaped', () => {
    const html = renderPullRequestDetail(input({ pr: pullRequest({ description: '<script>alert(1)</script>' }) }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('links to the PR web URL', () => {
    const html = renderPullRequestDetail(input());
    expect(html).toContain('href="https://dev.azure.com/my-org/MyProject/_git/kanbrain/pullrequest/57"');
  });

  it.each([
    [10, 'Approved'],
    [5, 'Approved with suggestions'],
    [0, 'No vote'],
    [-5, 'Waiting for author'],
    [-10, 'Rejected'],
  ])('shows the label for vote code %d', (vote, label) => {
    const html = renderPullRequestDetail(input({ pr: pullRequest({ reviewers: [{ displayName: 'Bob', imageUrl: null, vote, isRequired: false }] }) }));
    expect(html).toContain(label);
  });

  it('shows a Required tag for required reviewers', () => {
    const html = renderPullRequestDetail(
      input({ pr: pullRequest({ reviewers: [{ displayName: 'Bob', imageUrl: null, vote: 0, isRequired: true }] }) }),
    );
    expect(html).toContain('Required');
  });

  it('shows an explicit Optional tag for non-required reviewers', () => {
    const html = renderPullRequestDetail(
      input({ pr: pullRequest({ reviewers: [{ displayName: 'Bob', imageUrl: null, vote: 0, isRequired: false }] }) }),
    );
    expect(html).toContain('Optional');
  });

  it('shows a message when there are no reviewers', () => {
    const html = renderPullRequestDetail(input({ pr: pullRequest({ reviewers: [] }) }));
    expect(html).toContain('No reviewers.');
  });

  it('shows linked work items with a link to their own detail panel and a pick-work-item link', () => {
    const html = renderPullRequestDetail(input({ workItems: [workItem({ id: 482, title: 'Linked item' })] }));

    expect(html).toContain('Linked Work Items');
    expect(html).toContain('#482');
    expect(html).toContain('Linked item');
    expect(html).toContain('command:kanbrain.openWorkItemDetail?');

    const pickMatch = html.match(/href="(command:kanbrain\.pickWorkItem\?[^"]+)"/);
    expect(pickMatch).not.toBeNull();
    const [, href] = pickMatch!;
    expect(JSON.parse(decodeURIComponent(href.split('?')[1]))).toEqual([482]);
  });

  it('omits the Linked Work Items group when there are none', () => {
    const html = renderPullRequestDetail(input());
    expect(html).not.toContain('Linked Work Items');
  });

  it('shows a message when there are no comments', () => {
    const html = renderPullRequestDetail(input());
    expect(html).toContain('Discussion');
    expect(html).toContain('No comments.');
  });

  it('shows real comments, escaped, with author and date', () => {
    const threads = [
      thread({
        comments: [{ id: 1, parentCommentId: 0, text: '<b>Looks good!</b>', createdBy: { displayName: 'Bob', imageUrl: null }, createdDate: '2026-01-01T00:00:00Z' }],
      }),
    ];
    const html = renderPullRequestDetail(input({ threads }));

    expect(html).not.toContain('No comments.');
    expect(html).toContain('Bob');
    expect(html).toContain('&lt;b&gt;Looks good!&lt;/b&gt;');
  });

  it('shows a file/line badge for a code review thread', () => {
    const threads = [thread({ filePath: 'src/foo.ts', line: 42 })];
    const html = renderPullRequestDetail(input({ threads }));
    expect(html).toContain('src/foo.ts:42');
  });

  it('omits the file badge for a general (non-file) thread', () => {
    const threads = [thread({ filePath: null, line: null })];
    const html = renderPullRequestDetail(input({ threads }));
    expect(html).not.toContain('kb-pr-thread-file');
  });

  it.each([
    ['fixed', 'Fixed'],
    ['wontFix', "Won't Fix"],
    ['closed', 'Closed'],
    ['byDesign', 'By Design'],
    ['pending', 'Pending'],
    ['active', 'Active'],
  ])('shows the status label for thread status %s', (status, label) => {
    const html = renderPullRequestDetail(input({ threads: [thread({ status })] }));
    expect(html).toContain(label);
  });

  it('omits the status tag for an unknown thread status', () => {
    const html = renderPullRequestDetail(input({ threads: [thread({ status: 'unknown' })] }));
    expect(html).not.toContain('kb-pr-thread-status');
  });

  it('shows a reply indented below the root comment', () => {
    const threads = [
      thread({
        comments: [
          { id: 1, parentCommentId: 0, text: 'Root comment', createdBy: { displayName: 'Bob', imageUrl: null }, createdDate: '2026-01-01T00:00:00Z' },
          { id: 2, parentCommentId: 1, text: 'A reply', createdBy: { displayName: 'Jane', imageUrl: null }, createdDate: '2026-01-01T01:00:00Z' },
        ],
      }),
    ];
    const html = renderPullRequestDetail(input({ threads }));

    const replyStart = html.indexOf('kb-pr-reply');
    const rootIndex = html.indexOf('Root comment');
    const replyIndex = html.indexOf('A reply');

    expect(replyStart).toBeGreaterThan(-1);
    expect(rootIndex).toBeGreaterThan(-1);
    expect(replyIndex).toBeGreaterThan(rootIndex);
  });

  it('renders multiple threads as separate cards', () => {
    const threads = [thread({ id: 1 }), thread({ id: 2 })];
    const html = renderPullRequestDetail(input({ threads }));
    expect(html.split('kb-pr-thread"').length - 1).toBe(2);
  });

  it('shows a View Diff button with the GitLens icon when GitLens is installed', () => {
    const html = renderPullRequestDetail(input({ gitLensIconDataUri: 'data:image/png;base64,ABC' }));

    expect(html).toContain('View Diff');
    expect(html).toContain('src="data:image/png;base64,ABC"');
    expect(html).not.toContain('Install GitLens');

    const match = html.match(/href="(command:kanbrain\.viewPullRequestDiff\?[^"]+)"/);
    expect(match).not.toBeNull();
    const [, href] = match!;
    expect(JSON.parse(decodeURIComponent(href.split('?')[1]))).toEqual(['repo-1', 'feature/login-fix', 'main']);
  });

  it('shows an Install GitLens suggestion when GitLens is not installed, and no View Diff button', () => {
    const html = renderPullRequestDetail(input({ gitLensIconDataUri: null }));

    expect(html).toContain('Install GitLens to view diffs inline');
    expect(html).not.toContain('View Diff');

    const match = html.match(/href="(command:workbench\.extensions\.search\?[^"]+)"/);
    expect(match).not.toBeNull();
    const [, href] = match!;
    expect(JSON.parse(decodeURIComponent(href.split('?')[1]))).toEqual(['GitLens']);
  });
});
