import { describe, it, expect } from 'vitest';
import { renderSearchResults } from './renderSearchResults';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'T',
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

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    workflowSteps: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('renderSearchResults scroll area', () => {
  const SCROLL_OPEN = '<div class="kb-search-results-scroll">';
  const withTypes = config({ workflowSteps: { Task: {}, Bug: {} } });

  it('keeps the type filter outside the scrolling area, before it', () => {
    const html = renderSearchResults([workItem({ id: 1 })], withTypes);
    const filterIndex = html.indexOf('class="kb-search-type-filter"');
    const scrollIndex = html.indexOf(SCROLL_OPEN);

    expect(filterIndex).toBeGreaterThanOrEqual(0);
    expect(scrollIndex).toBeGreaterThan(filterIndex);
    expect(html.slice(scrollIndex)).not.toContain('kb-search-type-filter-trigger');
  });

  it('puts the result groups inside the scrolling area', () => {
    const html = renderSearchResults([workItem({ id: 1 })], withTypes);

    expect(html.indexOf('kb-result-group')).toBeGreaterThan(html.indexOf(SCROLL_OPEN));
  });

  it('wraps the status groups in the scrolling area when there are no configured types', () => {
    const html = renderSearchResults([workItem({ id: 1 })], config());

    expect(html.trimStart().startsWith(SCROLL_OPEN)).toBe(true);
    expect(html.indexOf('kb-result-group')).toBeGreaterThan(html.indexOf(SCROLL_OPEN));
  });

  it('wraps the empty message in the scrolling area too', () => {
    const html = renderSearchResults([], config());

    expect(html.trimStart().startsWith(SCROLL_OPEN)).toBe(true);
    expect(html).toContain('No work items found.');
  });

  it('keeps the type filter when there are no results, so another type can still be picked', () => {
    const html = renderSearchResults([], withTypes, {}, { activeType: 'Bug' });

    expect(html).toContain('kb-search-type-filter-trigger');
    expect(html.indexOf('No work items found.')).toBeGreaterThan(html.indexOf(SCROLL_OPEN));
  });
});

const SCROLL_OPEN_MARK = 'kb-search-results-scroll';

describe('renderSearchResults', () => {
  it('shows an empty message when there are no results', () => {
    expect(renderSearchResults([], config())).toContain('No work items found.');
  });

  it('groups results into collapsible status sections with counts', () => {
    const items = [workItem({ id: 1, status: 'Active' }), workItem({ id: 2, status: 'New' })];

    const html = renderSearchResults(items, config());

    expect(html).toContain('Active (1)');
    expect(html).toContain('New (1)');
    expect(html).toContain('data-action="toggle-group"');
    expect(html).toContain('kb-group-items');
  });

  it('renders each item as a pickable button with its id, escaping the title', () => {
    const html = renderSearchResults([workItem({ id: 482, title: 'Fix <bug>' })], config());

    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('Fix &lt;bug&gt;');
    expect(html).not.toContain('Fix <bug>');
  });

  it('shows a status dot on the group header when a color is known for the status', () => {
    const html = renderSearchResults([workItem({ status: 'Active' })], config({ statusColors: { Active: 'b2b2b2' } }));

    expect(html).toContain('kb-status-dot');
    expect(html).toContain('#b2b2b2');
  });

  it('shows a colored left border on the group of items when a color is known for the status', () => {
    const html = renderSearchResults([workItem({ status: 'Active' })], config({ statusColors: { Active: 'b2b2b2' } }));

    expect(html).toContain('kb-group-items');
    expect(html).toContain('border-left: 3px solid #b2b2b2');
  });

  it('omits the group left border when the status has no configured color', () => {
    const html = renderSearchResults([workItem({ status: 'Active' })], config());

    expect(html).not.toContain('border-left');
  });

  it('shows the type icon and a colored right border on each item', () => {
    const html = renderSearchResults(
      [workItem({ type: 'Task' })],
      config({ typeColors: { Task: 'f2cb1d' }, typeIcons: { Task: '<svg><path d="M0 0"/></svg>' } }),
      {},
    );

    expect(html).toContain('kb-type-icon');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
    expect(html).toContain('border-right: 4px solid #f2cb1d');
  });

  it('omits the icon and border when the type has no configured color or icon', () => {
    const html = renderSearchResults([workItem({ type: 'Task' })], config());

    expect(html).not.toContain('kb-type-icon');
    expect(html).not.toContain('border-right');
  });

  it('does not show an action button on search result items', () => {
    const html = renderSearchResults([workItem({ id: 482 })], config());

    expect(html).not.toContain('data-action="run-skill"');
  });

  it('renders no type filter when there are no configured work item types', () => {
    const html = renderSearchResults([workItem()], config());

    expect(html).not.toContain('kb-search-type-filter');
  });

  it('renders a filter option per work item type, in config order, plus an "all" option first', () => {
    const items = [workItem({ id: 1, type: 'Epic' }), workItem({ id: 2, type: 'Task' })];
    const html = renderSearchResults(items, config({ workflowSteps: { Epic: {}, Task: {} } }));

    const allIndex = html.indexOf('data-type="all"');
    const epicIndex = html.indexOf('data-type="Epic"');
    const taskIndex = html.indexOf('data-type="Task"');

    expect(allIndex).toBeGreaterThanOrEqual(0);
    expect(epicIndex).toBeGreaterThan(allIndex);
    expect(taskIndex).toBeGreaterThan(epicIndex);
  });

  it('shows no counts on the type filter options or its trigger', () => {
    const items = [workItem({ id: 1, type: 'Epic' }), workItem({ id: 2, type: 'Task' })];
    const html = renderSearchResults(items, config({ workflowSteps: { Epic: {}, Task: {} } }));

    const filter = html.slice(html.indexOf('kb-search-type-filter'), html.indexOf(SCROLL_OPEN_MARK));
    expect(filter).toContain('All');
    expect(filter).not.toMatch(/\(\d+\)/);
  });

  it('shows the type icon on each filter option, but not on the "all" option', () => {
    const items = [workItem({ id: 1, type: 'Epic' })];
    const html = renderSearchResults(
      items,
      config({ workflowSteps: { Epic: {} }, typeIcons: { Epic: '<svg><path d="M0 0"/></svg>' } }),
    );

    const allOptionStart = html.indexOf('data-type="all"');
    const allOptionEnd = html.indexOf('</button>', allOptionStart);
    const epicOptionStart = html.indexOf('data-type="Epic"');
    const epicOptionEnd = html.indexOf('</button>', epicOptionStart);

    expect(html.slice(epicOptionStart, epicOptionEnd)).toContain('<svg><path d="M0 0"/></svg>');
    expect(html.slice(allOptionStart, allOptionEnd)).not.toContain('<svg>');
  });

  it('renders every result in a single list, since the type is filtered by the query itself', () => {
    const items = [workItem({ id: 1, type: 'Epic' }), workItem({ id: 2, type: 'Task' })];
    const html = renderSearchResults(items, config({ workflowSteps: { Epic: {}, Task: {} } }));

    expect(html).not.toContain('kb-search-type-panel');
    expect(html.match(/data-action="pick-work-item"/g)).toHaveLength(2);
  });

  it('shows the active type on the trigger and exposes it to the webview', () => {
    const html = renderSearchResults(
      [workItem({ type: 'Epic' })],
      config({ workflowSteps: { Epic: {}, Task: {} }, typeIcons: { Epic: '<svg><path d="M0 0"/></svg>' } }),
      {},
      { activeType: 'Epic' },
    );

    const label = html.slice(html.indexOf('kb-search-type-filter-trigger-label'), html.indexOf('kb-search-type-filter-icon'));
    expect(label).toContain('Epic');
    expect(label).toContain('<svg><path d="M0 0"/></svg>');
    expect(html).toContain('data-active-type="Epic"');
  });

  it('falls back to "all" when the active type is not a configured type', () => {
    const html = renderSearchResults([workItem()], config({ workflowSteps: { Epic: {} } }), {}, { activeType: 'Gone' });

    expect(html).toContain('data-active-type="all"');
  });

  it('marks no filter option as empty, since only one type is ever loaded', () => {
    const html = renderSearchResults([workItem({ type: 'Epic' })], config({ workflowSteps: { Epic: {}, Task: {} } }));

    expect(html).not.toContain('kb-search-type-filter-option-empty');
  });

  it('offers a Load more button carrying the search token when more results remain', () => {
    const html = renderSearchResults([workItem({ id: 1 })], config(), {}, { hasMore: true, total: 120, token: 7 });

    expect(html).toContain('data-action="load-more-search-results"');
    expect(html).toContain('data-token="7"');
    expect(html).toContain('1 of 120');
  });

  it('puts the Load more button inside the scrolling area, after the results', () => {
    const html = renderSearchResults([workItem({ id: 1 })], config(), {}, { hasMore: true, total: 2, token: 1 });

    expect(html.indexOf('load-more-search-results')).toBeGreaterThan(html.indexOf('kb-result-group'));
  });

  it('omits the total when it is unknown (results filtered after fetching)', () => {
    const html = renderSearchResults([workItem({ id: 1 })], config(), {}, { hasMore: true, token: 1 });

    expect(html).toContain('load-more-search-results');
    expect(html).not.toContain(' of ');
  });

  it('shows no Load more button when everything is loaded', () => {
    const html = renderSearchResults([workItem({ id: 1 })], config(), {}, { hasMore: false, total: 1, token: 1 });

    expect(html).not.toContain('load-more-search-results');
  });

  it('offers Load more even when the scanned batch had no matches yet', () => {
    const html = renderSearchResults([], config(), {}, { hasMore: true, token: 1 });

    expect(html).toContain('load-more-search-results');
  });

  it('tags each status group with its status so the webview can keep it collapsed across pages', () => {
    const html = renderSearchResults([workItem({ status: 'In "Review"' })], config());

    expect(html).toContain('data-status="In &quot;Review&quot;"');
  });

  it('shows "Unassigned" on a result item when the item has no assignee', () => {
    const html = renderSearchResults([workItem({ assignedTo: null })], config());
    expect(html).toContain('kb-result-item-assignee');
    expect(html).toContain('Unassigned');
  });

  it('shows the assignee name on a result item when assigned', () => {
    const html = renderSearchResults([workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } })], config());
    expect(html).toContain('Jane Doe');
  });

  it('shows the resolved avatar image on a result item when provided', () => {
    const item = workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' } });
    const html = renderSearchResults([item], config(), { 'https://example.com/avatar.png': 'data:image/png;base64,X' });
    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,X"');
  });

  it('hides the assignee row on result items when config.showAssignedTo is false', () => {
    const html = renderSearchResults([workItem()], config({ showAssignedTo: false }));
    expect(html).not.toContain('kb-result-item-assignee');
  });

  it('wraps the id+title in a single-line ellipsis span', () => {
    const html = renderSearchResults([workItem({ id: 482, title: 'A very long title that should be truncated' })], config());

    expect(html).toContain('<span class="kb-result-item-title">#482 A very long title that should be truncated</span>');
  });

  it('shows a View details button for each item, separate from the pick-work-item button', () => {
    const html = renderSearchResults([workItem({ id: 482 })], config());

    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('kb-view-details-link');
  });

  it('scopes the View details button to the correct item id', () => {
    const items = [workItem({ id: 1 }), workItem({ id: 2 })];
    const html = renderSearchResults(items, config());

    expect(html).toContain('data-action="open-work-item-detail" data-id="1"');
    expect(html).toContain('data-action="open-work-item-detail" data-id="2"');
  });
});
