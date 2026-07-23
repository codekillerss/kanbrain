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
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('renderSearchResults', () => {
  it('shows an empty message when there are no results', () => {
    expect(renderSearchResults([], config(), {})).toContain('No work items found.');
  });

  it('groups results into collapsible status sections with counts', () => {
    const items = [workItem({ id: 1, status: 'Active' }), workItem({ id: 2, status: 'New' })];

    const html = renderSearchResults(items, config(), {});

    expect(html).toContain('Active (1)');
    expect(html).toContain('New (1)');
    expect(html).toContain('data-action="toggle-group"');
    expect(html).toContain('kb-group-items');
  });

  it('renders each item as a pickable button with its id, escaping the title', () => {
    const html = renderSearchResults([workItem({ id: 482, title: 'Fix <bug>' })], config(), {});

    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('Fix &lt;bug&gt;');
    expect(html).not.toContain('Fix <bug>');
  });

  it('shows a status dot on the group header when a color is known for the status', () => {
    const html = renderSearchResults([workItem({ status: 'Active' })], config({ statusColors: { Active: 'b2b2b2' } }), {});

    expect(html).toContain('kb-status-dot');
    expect(html).toContain('#b2b2b2');
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
    const html = renderSearchResults([workItem({ type: 'Task' })], config(), {});

    expect(html).not.toContain('kb-type-icon');
    expect(html).not.toContain('border-right');
  });

  it('does not show an action button on search result items', () => {
    const html = renderSearchResults([workItem({ id: 482 })], config(), {});

    expect(html).not.toContain('data-action="run-skill"');
  });

  it('renders no tab bar when there are no configured work item types', () => {
    const html = renderSearchResults([workItem()], config(), {});

    expect(html).not.toContain('kb-search-tabs');
  });

  it('renders a tab per work item type, in config order, plus an "all" tab first', () => {
    const items = [workItem({ id: 1, type: 'Epic' }), workItem({ id: 2, type: 'Task' })];
    const html = renderSearchResults(items, config({ skills: { Epic: {}, Task: {} } }), { Epic: 3, Task: 7 });

    const allIndex = html.indexOf('data-tab="all"');
    const epicIndex = html.indexOf('data-tab="Epic"');
    const taskIndex = html.indexOf('data-tab="Task"');

    expect(allIndex).toBeGreaterThanOrEqual(0);
    expect(epicIndex).toBeGreaterThan(allIndex);
    expect(taskIndex).toBeGreaterThan(epicIndex);
    expect(html).toContain('All (2)');
  });

  it('shows the type tab count from typeCounts, not from the filtered item list', () => {
    const items = [workItem({ id: 1, type: 'Epic' })];
    const html = renderSearchResults(items, config({ skills: { Epic: {} } }), { Epic: 12 });

    expect(html).toContain('Epic (12)');
  });

  it('marks a type tab as empty when its count is 0', () => {
    const html = renderSearchResults([workItem({ type: 'Epic' })], config({ skills: { Epic: {}, Task: {} } }), { Epic: 5, Task: 0 });

    expect(html).toContain('kb-search-tab-empty');
    expect(html).toContain('Task (0)');
  });

  it("scopes each type panel to only that type's items", () => {
    const items = [workItem({ id: 1, type: 'Epic', title: 'An epic' }), workItem({ id: 2, type: 'Task', title: 'A task' })];
    const html = renderSearchResults(items, config({ skills: { Epic: {}, Task: {} } }), { Epic: 1, Task: 1 });

    const epicPanelStart = html.indexOf('data-tab-panel="Epic"');
    const taskPanelStart = html.indexOf('data-tab-panel="Task"');
    const epicPanel = html.slice(epicPanelStart, taskPanelStart);

    expect(epicPanel).toContain('An epic');
    expect(epicPanel).not.toContain('A task');
  });

  it('shows "Unassigned" on a result item when the item has no assignee', () => {
    const html = renderSearchResults([workItem({ assignedTo: null })], config(), {});
    expect(html).toContain('kb-result-item-assignee');
    expect(html).toContain('Unassigned');
  });

  it('shows the assignee name on a result item when assigned', () => {
    const html = renderSearchResults([workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } })], config(), {});
    expect(html).toContain('Jane Doe');
  });

  it('shows the resolved avatar image on a result item when provided', () => {
    const item = workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' } });
    const html = renderSearchResults([item], config(), {}, { 'https://example.com/avatar.png': 'data:image/png;base64,X' });
    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,X"');
  });

  it('hides the assignee row on result items when config.showAssignedTo is false', () => {
    const html = renderSearchResults([workItem()], config({ showAssignedTo: false }), {});
    expect(html).not.toContain('kb-result-item-assignee');
  });

  it('wraps the id+title in a single-line ellipsis span', () => {
    const html = renderSearchResults([workItem({ id: 482, title: 'A very long title that should be truncated' })], config(), {});

    expect(html).toContain('<span class="kb-result-item-title">#482 A very long title that should be truncated</span>');
  });

  it('shows a View details button for each item, separate from the pick-work-item button', () => {
    const html = renderSearchResults([workItem({ id: 482 })], config(), {});

    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('kb-view-details-link');
  });

  it('scopes the View details button to the correct item id', () => {
    const items = [workItem({ id: 1 }), workItem({ id: 2 })];
    const html = renderSearchResults(items, config(), {});

    expect(html).toContain('data-action="open-work-item-detail" data-id="1"');
    expect(html).toContain('data-action="open-work-item-detail" data-id="2"');
  });
});
