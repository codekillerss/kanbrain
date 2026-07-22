import { describe, it, expect } from 'vitest';
import { renderParentRow } from './renderParent';
import type { WorkItem } from '../types';

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
    ...overrides,
  };
}

describe('renderParentRow', () => {
  it('returns an empty string when show is false', () => {
    expect(renderParentRow(parent(), false)).toBe('');
  });

  it('returns an empty string when parent is null', () => {
    expect(renderParentRow(null, true)).toBe('');
  });

  it('renders the parent id, escaped title, and a clickable data-id when shown', () => {
    const html = renderParentRow(parent(), true);
    expect(html).toContain('kb-parent-row');
    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('data-id="55"');
    expect(html).toContain('#55');
    expect(html).toContain('Parent &lt;title&gt;');
  });
});
