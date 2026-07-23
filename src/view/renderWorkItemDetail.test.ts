import { describe, it, expect } from 'vitest';
import { renderWorkItemDetail, formatFieldValue, type WorkItemDetailInput } from './renderWorkItemDetail';
import type { WorkItem, KanbrainConfig } from '../types';
import type { WorkItemComment } from '../azureDevOps/workItemDetail';

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

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  defaultTeam: 'MyProject Team',
  skills: {},
  statusColors: { Active: 'b2b2b2' },
  typeColors: { Task: 'f2cb1d' },
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};

function input(overrides: Partial<WorkItemDetailInput> = {}): WorkItemDetailInput {
  return {
    workItem: workItem(),
    config,
    description: null,
    groups: [],
    htmlSections: [],
    comments: [],
    avatars: {},
    prDetails: {},
    parent: null,
    children: [],
    ...overrides,
  };
}

describe('renderWorkItemDetail', () => {
  it('shows the id, title, status, and type icon in the header', () => {
    const html = renderWorkItemDetail(input());

    expect(html).toContain('#482');
    expect(html).toContain('Fix bug');
    expect(html).toContain('Active');
    expect(html).toContain('kb-type-icon');
  });

  it('shows the icon and id on the same line as the title', () => {
    const html = renderWorkItemDetail(input());

    const rowStart = html.indexOf('kb-detail-title-row');
    const rowEnd = html.indexOf('</div>', html.indexOf('kb-detail-title', rowStart));
    const row = html.slice(rowStart, rowEnd);

    expect(row).toContain('kb-type-icon');
    expect(row).toContain('#482');
    expect(row).toContain('Fix bug');
  });

  it('shows the status row after the assignee', () => {
    const html = renderWorkItemDetail(input());

    const assigneeIndex = html.indexOf('kb-detail-assignee');
    const statusIndex = html.indexOf('kb-detail-status-row');

    expect(assigneeIndex).toBeGreaterThanOrEqual(0);
    expect(statusIndex).toBeGreaterThan(assigneeIndex);
  });

  it('colors the header border with the type color on the right and the status color on the bottom', () => {
    const html = renderWorkItemDetail(input());

    const headerStart = html.indexOf('kb-detail-header"');
    const headerEnd = html.indexOf('>', headerStart);
    const headerTag = html.slice(headerStart, headerEnd);

    expect(headerTag).toContain('border-right: 4px solid #f2cb1d;');
    expect(headerTag).toContain('border-bottom: 4px solid #b2b2b2;');
  });

  it('omits the border declaration for a color that is missing or invalid, without breaking the other one', () => {
    const html = renderWorkItemDetail(
      input({ config: { ...config, statusColors: {}, typeColors: { Task: 'not-a-color' } } }),
    );

    const headerStart = html.indexOf('kb-detail-header');
    const headerEnd = html.indexOf('>', headerStart);
    const headerTag = html.slice(headerStart, headerEnd);

    expect(headerTag).not.toContain('border-right');
    expect(headerTag).not.toContain('border-bottom: 4px');
  });

  it('shows Unassigned when there is no assignee', () => {
    const html = renderWorkItemDetail(input());
    expect(html).toContain('Unassigned');
  });

  it('shows the assignee name when assigned', () => {
    const html = renderWorkItemDetail(input({ workItem: workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }) }));
    expect(html).toContain('Jane Doe');
  });

  it('renders the description as HTML, stripping script tags', () => {
    const html = renderWorkItemDetail(input({ description: '<p>Hello</p><script>alert(1)</script>' }));

    expect(html).toContain('<p>Hello</p>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Description');
  });

  it('omits the description block when there is no description', () => {
    const html = renderWorkItemDetail(input({ description: null }));
    expect(html).not.toContain('kb-detail-section-label">Description');
  });

  it('renders extra HTML sections with their label', () => {
    const html = renderWorkItemDetail(
      input({ htmlSections: [{ refName: 'Microsoft.VSTS.TCM.ReproSteps', label: 'Repro Steps', value: '<p>Steps</p>' }] }),
    );

    expect(html).toContain('Repro Steps');
    expect(html).toContain('<p>Steps</p>');
  });

  it('renders grouped fields in the details grid', () => {
    const html = renderWorkItemDetail(
      input({ groups: [{ label: 'Planning', fields: [{ refName: 'System.AreaPath', label: 'Area Path', value: 'Proj\\Area' }] }] }),
    );

    expect(html).toContain('Planning');
    expect(html).toContain('Area Path');
    expect(html).toContain('Proj\\Area');
  });

  it('shows the Related Work section in the side column when there is a parent or children', () => {
    const html = renderWorkItemDetail(input({ parent: workItem({ id: 900, title: 'Epic parent' }) }));
    expect(html).toContain('Related Work');
    expect(html).toContain('Epic parent');
  });

  it('omits the Related Work section when there is no parent and no children', () => {
    const html = renderWorkItemDetail(input());
    expect(html).not.toContain('Related Work');
  });

  it('shows "No comments." when there are no comments', () => {
    const html = renderWorkItemDetail(input());
    expect(html).toContain('No comments.');
  });

  it('renders each comment with author, date, and body', () => {
    const comments: WorkItemComment[] = [
      { id: 1, text: '<p>Looks good</p>', createdBy: { displayName: 'Jane Doe', imageUrl: null }, createdDate: '2026-01-01T00:00:00Z' },
    ];
    const html = renderWorkItemDetail(input({ comments }));

    expect(html).toContain('Jane Doe');
    expect(html).toContain('<p>Looks good</p>');
    expect(html).toContain('kb-comment');
  });

  it('resolves a comment author avatar when a data URI is provided', () => {
    const comments: WorkItemComment[] = [
      { id: 1, text: '', createdBy: { displayName: 'Jane', imageUrl: 'https://example.com/jane.png' }, createdDate: '2026-01-01T00:00:00Z' },
    ];
    const html = renderWorkItemDetail(input({ comments, avatars: { 'https://example.com/jane.png': 'data:image/png;base64,X' } }));

    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,X"');
  });

  it('strips script tags from comment bodies', () => {
    const comments: WorkItemComment[] = [
      { id: 1, text: '<script>alert(1)</script>ok', createdBy: { displayName: 'Jane', imageUrl: null }, createdDate: '2026-01-01T00:00:00Z' },
    ];
    const html = renderWorkItemDetail(input({ comments }));

    expect(html).not.toContain('<script>');
    expect(html).toContain('ok');
  });

  it('does not show a Development section when the work item has no development links', () => {
    const html = renderWorkItemDetail(input());
    expect(html).not.toContain('kb-dev-label');
  });

  it('shows the Development section with resolved pull request details when the work item has development links', () => {
    const html = renderWorkItemDetail(
      input({
        workItem: workItem({ development: [{ kind: 'pullRequest', repositoryId: 'repo-1', pullRequestId: 57 }] }),
        prDetails: { 'repo-1:57': { title: 'Fix login bug', status: 'active' } },
      }),
    );
    expect(html).toContain('kb-dev-label');
    expect(html).toContain('#57 Fix login bug (Active)');
  });
});

describe('formatFieldValue', () => {
  it('shows an em dash for null, undefined, or empty values', () => {
    expect(formatFieldValue('System.Foo', null)).toBe('—');
    expect(formatFieldValue('System.Foo', undefined)).toBe('—');
    expect(formatFieldValue('System.Foo', '')).toBe('—');
  });

  it('shows the display name for an identity ref value', () => {
    expect(formatFieldValue('System.CreatedBy', { displayName: 'Jane Doe' })).toBe('Jane Doe');
  });

  it('formats fields whose reference name ends in "Date" as a locale date string', () => {
    const result = formatFieldValue('System.CreatedDate', '2026-01-01T00:00:00Z');
    expect(result).not.toBe('—');
    expect(result).not.toBe('2026-01-01T00:00:00Z');
  });

  it('splits System.Tags into chip spans', () => {
    const result = formatFieldValue('System.Tags', 'bug; needs-review');
    expect(result).toContain('kb-detail-tag');
    expect(result).toContain('bug');
    expect(result).toContain('needs-review');
  });

  it('escapes and stringifies plain values', () => {
    expect(formatFieldValue('Microsoft.VSTS.Common.Priority', 2)).toBe('2');
  });
});
