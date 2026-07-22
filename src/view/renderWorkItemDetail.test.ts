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
  typeToBacklogLevel: {},
  backlogLevels: {},
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
