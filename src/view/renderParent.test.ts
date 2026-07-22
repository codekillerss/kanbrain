import { describe, it, expect } from 'vitest';
import { renderParentRow } from './renderParent';
import type { WorkItem, KanbrainConfig } from '../types';

function parent(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 55,
    title: 'Parent <title>',
    description: '',
    status: 'Active',
    type: 'Feature',
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
  statusColors: {},
  typeColors: { Feature: 'f2cb1d' },
  typeIcons: { Feature: '<svg><path d="M0 0"/></svg>' },
};

describe('renderParentRow', () => {
  it('returns an empty string when show is false', () => {
    expect(renderParentRow(parent(), false, config)).toBe('');
  });

  it('returns an empty string when parent is null', () => {
    expect(renderParentRow(null, true, config)).toBe('');
  });

  it('renders a "Parent" label above the value', () => {
    const html = renderParentRow(parent(), true, config);
    expect(html).toContain('kb-field-label');
    expect(html).toContain('Parent</div>');
  });

  it('renders the parent type icon and "#id: escaped title" as a clickable link', () => {
    const html = renderParentRow(parent(), true, config);
    expect(html).toContain('kb-parent-link');
    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('data-id="55"');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
    expect(html).toContain('#55: Parent &lt;title&gt;');
  });
});
