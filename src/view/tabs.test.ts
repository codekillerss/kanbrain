import { describe, it, expect } from 'vitest';
import { MAX_TABS, addTab, replaceActiveWorkItem, closeTab } from './tabs';
import type { WorkItemTab } from './tabs';

describe('replaceActiveWorkItem', () => {
  it('creates the first tab when there is no active tab', () => {
    const result = replaceActiveWorkItem([], undefined, 123, 'tab-1');

    expect(result).toEqual({ tabs: [{ id: 'tab-1', workItemId: 123 }], activeTabId: 'tab-1' });
  });

  it('focuses the existing tab instead of duplicating when the work item is already open in another tab', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
    ];

    const result = replaceActiveWorkItem(tabs, 'tab-1', 2, 'tab-new');

    expect(result).toEqual({ tabs, activeTabId: 'tab-2' });
  });

  it('replaces the work item shown in the active tab, keeping its id and position', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
    ];

    const result = replaceActiveWorkItem(tabs, 'tab-2', 999, 'tab-3');

    expect(result).toEqual({
      tabs: [
        { id: 'tab-1', workItemId: 1 },
        { id: 'tab-2', workItemId: 999 },
      ],
      activeTabId: 'tab-2',
    });
  });
});

describe('addTab', () => {
  it('appends a new tab and makes it active', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1 }];

    const result = addTab(tabs, 2, 'tab-2');

    expect(result).toEqual({
      tabs: [
        { id: 'tab-1', workItemId: 1 },
        { id: 'tab-2', workItemId: 2 },
      ],
      activeTabId: 'tab-2',
    });
  });

  it('focuses the existing tab instead of creating a duplicate when the work item is already open', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
    ];

    const result = addTab(tabs, 2, 'tab-new');

    expect(result).toEqual({ tabs, activeTabId: 'tab-2' });
  });

  it('refuses to add a tab past the max limit', () => {
    const tabs: WorkItemTab[] = Array.from({ length: MAX_TABS }, (_, i) => ({ id: `tab-${i}`, workItemId: i }));

    const result = addTab(tabs, 999, 'tab-new');

    expect(result).toBeNull();
  });
});

describe('closeTab', () => {
  it('removes a non-active tab without changing which tab is active', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
    ];

    const result = closeTab(tabs, 'tab-1', 'tab-2');

    expect(result).toEqual({ tabs: [{ id: 'tab-1', workItemId: 1 }], activeTabId: 'tab-1' });
  });

  it('activates the tab that slides into the closed active tab\'s position', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
      { id: 'tab-3', workItemId: 3 },
    ];

    const result = closeTab(tabs, 'tab-2', 'tab-2');

    expect(result).toEqual({
      tabs: [
        { id: 'tab-1', workItemId: 1 },
        { id: 'tab-3', workItemId: 3 },
      ],
      activeTabId: 'tab-3',
    });
  });

  it('activates the previous tab when closing the last active tab', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
    ];

    const result = closeTab(tabs, 'tab-2', 'tab-2');

    expect(result).toEqual({ tabs: [{ id: 'tab-1', workItemId: 1 }], activeTabId: 'tab-1' });
  });

  it('sets activeTabId to undefined when closing the only remaining tab', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1 }];

    const result = closeTab(tabs, 'tab-1', 'tab-1');

    expect(result).toEqual({ tabs: [], activeTabId: undefined });
  });

  it('is a no-op when closing a tab id that does not exist', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1 }];

    const result = closeTab(tabs, 'tab-1', 'does-not-exist');

    expect(result).toEqual({ tabs, activeTabId: 'tab-1' });
  });
});
