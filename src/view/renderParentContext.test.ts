import { describe, it, expect } from 'vitest';
import { renderParentBanner, renderSiblingNavigator } from './renderParentContext';
import type { WorkItem, KanbrainConfig } from '../types';

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
  statusColors: {},
  typeColors: { Epic: 'ff9900' },
  typeIcons: { Epic: '<svg><path d="M0 0"/></svg>' },
};

describe('renderParentBanner', () => {
  it('returns an empty string when there is no parent', () => {
    expect(renderParentBanner(null, config)).toBe('');
  });

  it('renders the parent icon, id, and escaped title, clickable to open its detail panel', () => {
    const parent = workItem({ id: 900, title: 'Epic <parent>', type: 'Epic' });
    const html = renderParentBanner(parent, config);

    expect(html).toContain('kb-parent-banner');
    expect(html).toContain('<svg');
    expect(html).toContain('#900');
    expect(html).toContain('Epic &lt;parent&gt;');
    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('data-id="900"');
  });

  it('includes a pick button targeting the parent id', () => {
    const parent = workItem({ id: 900, title: 'Epic parent', type: 'Epic' });
    const html = renderParentBanner(parent, config);

    expect(html).toContain('kb-pick-btn');
    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="900"');
  });
});

describe('renderSiblingNavigator', () => {
  it('returns an empty string when there is no parent', () => {
    expect(renderSiblingNavigator(workItem(), null)).toBe('');
  });

  it('returns an empty string when the work item is not among the parent\'s childIds', () => {
    const parent = workItem({ id: 900, childIds: [101, 102] });
    expect(renderSiblingNavigator(workItem({ id: 482 }), parent)).toBe('');
  });

  it('shows a single active dot with both arrows disabled when the item has no siblings', () => {
    const parent = workItem({ id: 900, childIds: [482] });
    const html = renderSiblingNavigator(workItem({ id: 482 }), parent);

    // Exactly 1 active dot, 0 non-active dots (the literal `class="kb-sibling-dot"` with an
    // immediate closing quote never matches the active dot's `kb-sibling-dot kb-sibling-dot-active`).
    expect(html.split('kb-sibling-dot-active').length - 1).toBe(1);
    expect(html.split('class="kb-sibling-dot"').length - 1).toBe(0);
    expect(html).toContain('kb-sibling-arrow-prev" disabled');
    expect(html).toContain('kb-sibling-arrow-next" disabled');
  });

  it('points the prev/next arrows at the correct sibling ids', () => {
    const parent = workItem({ id: 900, childIds: [101, 482, 103] });
    const html = renderSiblingNavigator(workItem({ id: 482 }), parent);

    expect(html).toContain('kb-sibling-arrow-prev" data-action="pick-work-item" data-id="101"');
    expect(html).toContain('kb-sibling-arrow-next" data-action="pick-work-item" data-id="103"');
  });

  it('disables the prev arrow at the start of the list and the next arrow at the end', () => {
    const parent = workItem({ id: 900, childIds: [482, 103, 104] });

    const atStart = renderSiblingNavigator(workItem({ id: 482 }), parent);
    expect(atStart).toContain('kb-sibling-arrow-prev" disabled');
    expect(atStart).toContain('kb-sibling-arrow-next" data-action="pick-work-item" data-id="103"');

    const atEnd = renderSiblingNavigator(workItem({ id: 104 }), parent);
    expect(atEnd).toContain('kb-sibling-arrow-next" disabled');
    expect(atEnd).toContain('kb-sibling-arrow-prev" data-action="pick-work-item" data-id="103"');
  });

  it('shows a centered sliding window of at most 5 dots when there are more than 5 siblings', () => {
    const childIds = Array.from({ length: 12 }, (_, i) => i + 1); // [1..12]
    const parent = workItem({ id: 900, childIds });

    // Current item in the middle (id 6, index 5): window = indices [3..7] = ids [4,5,6,7,8].
    // prevId/nextId are the immediate neighbors in the full list (5 and 7), both inside the window.
    const middle = renderSiblingNavigator(workItem({ id: 6 }), parent);
    const middleDotCount = (middle.split('kb-sibling-dot-active').length - 1) + (middle.split('class="kb-sibling-dot"').length - 1);
    expect(middleDotCount).toBe(5);
    expect(middle).toContain('kb-sibling-arrow-prev" data-action="pick-work-item" data-id="5"');
    expect(middle).toContain('kb-sibling-arrow-next" data-action="pick-work-item" data-id="7"');

    // Current item at the very start (id 1, index 0): window clamps to ids [1..5].
    const start = renderSiblingNavigator(workItem({ id: 1 }), parent);
    expect(start).toContain('kb-sibling-arrow-prev" disabled');
    expect(start).toContain('kb-sibling-arrow-next" data-action="pick-work-item" data-id="2"');

    // Current item at the very end (id 12, index 11): window clamps to ids [8..12].
    const end = renderSiblingNavigator(workItem({ id: 12 }), parent);
    expect(end).toContain('kb-sibling-arrow-next" disabled');
    expect(end).toContain('kb-sibling-arrow-prev" data-action="pick-work-item" data-id="11"');
  });
});
