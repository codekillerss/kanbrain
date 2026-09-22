import { describe, it, expect } from 'vitest';
import { MAX_TABS, addTab, replaceActiveWorkItem, closeTab, renameTab, reorderTabs } from './tabs';
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

  it('keeps a custom label on the active tab when its work item is replaced', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1, label: 'My Bug Fix' }];

    const result = replaceActiveWorkItem(tabs, 'tab-1', 999, 'tab-2');

    expect(result).toEqual({
      tabs: [{ id: 'tab-1', workItemId: 999, label: 'My Bug Fix' }],
      activeTabId: 'tab-1',
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

describe('renameTab', () => {
  it('sets a trimmed custom label on the matching tab, leaving other tabs untouched', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
    ];

    const result = renameTab(tabs, 'tab-1', '  My Bug Fix  ');

    expect(result).toEqual([
      { id: 'tab-1', workItemId: 1, label: 'My Bug Fix' },
      { id: 'tab-2', workItemId: 2 },
    ]);
  });

  it('clears the custom label (falling back to the default #id display) when given an empty or whitespace-only name', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1, label: 'Old name' }];

    const result = renameTab(tabs, 'tab-1', '   ');

    expect(result).toEqual([{ id: 'tab-1', workItemId: 1, label: undefined }]);
  });

  it('is a no-op when renaming a tab id that does not exist', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1 }];

    const result = renameTab(tabs, 'does-not-exist', 'New name');

    expect(result).toEqual(tabs);
  });

  it('rejects a name shorter than 3 characters, leaving the tab unchanged (too little text left to click to rename it again)', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1, label: 'Old name' }];

    const result = renameTab(tabs, 'tab-1', '1');

    expect(result).toEqual(tabs);
  });

  it('accepts a name exactly 3 characters long', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1 }];

    const result = renameTab(tabs, 'tab-1', 'abc');

    expect(result).toEqual([{ id: 'tab-1', workItemId: 1, label: 'abc' }]);
  });
});

describe('reorderTabs', () => {
  it('reorders tabs to match the given tab id order', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
      { id: 'tab-3', workItemId: 3 },
    ];

    const result = reorderTabs(tabs, ['tab-3', 'tab-1', 'tab-2']);

    expect(result).toEqual([
      { id: 'tab-3', workItemId: 3 },
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
    ]);
  });

  it('ignores tab ids that do not exist in tabs', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
    ];

    const result = reorderTabs(tabs, ['tab-2', 'does-not-exist', 'tab-1']);

    expect(result).toEqual([
      { id: 'tab-2', workItemId: 2 },
      { id: 'tab-1', workItemId: 1 },
    ]);
  });

  it('appends tabs missing from the given order at the end, keeping their relative order', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
      { id: 'tab-3', workItemId: 3 },
    ];

    const result = reorderTabs(tabs, ['tab-3']);

    expect(result).toEqual([
      { id: 'tab-3', workItemId: 3 },
      { id: 'tab-1', workItemId: 1 },
      { id: 'tab-2', workItemId: 2 },
    ]);
  });
});
