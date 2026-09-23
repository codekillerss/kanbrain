import { describe, it, expect } from 'vitest';
import {
  MAX_TABS,
  MAX_GROUP_NAME_LENGTH,
  DEFAULT_GROUP_ID,
  GROUP_COLORS,
  addTab,
  replaceActiveWorkItem,
  closeTab,
  renameTab,
  reorderTabs,
  tabGroupId,
  createDefaultGroup,
  ensureDefaultGroup,
  addGroup,
  renameGroup,
  removeGroup,
  reorderGroups,
} from './tabs';
import type { WorkItemTab, TabGroup } from './tabs';

describe('replaceActiveWorkItem', () => {
  it('creates the first tab in the given group when there is no active tab', () => {
    const result = replaceActiveWorkItem([], undefined, 123, 'tab-1', 'g1');

    expect(result).toEqual({ tabs: [{ id: 'tab-1', workItemId: 123, groupId: 'g1' }], activeTabId: 'tab-1', activeGroupId: 'g1' });
  });

  it('focuses the existing tab and switches to its group instead of duplicating when the work item is already open in another tab', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1, groupId: 'g1' },
      { id: 'tab-2', workItemId: 2, groupId: 'g2' },
    ];

    const result = replaceActiveWorkItem(tabs, 'tab-1', 2, 'tab-new', 'g1');

    expect(result).toEqual({ tabs, activeTabId: 'tab-2', activeGroupId: 'g2' });
  });

  it('replaces the work item shown in the active tab, keeping its id, position, and group', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1, groupId: 'g1' },
      { id: 'tab-2', workItemId: 2, groupId: 'g1' },
    ];

    const result = replaceActiveWorkItem(tabs, 'tab-2', 999, 'tab-3', 'g1');

    expect(result).toEqual({
      tabs: [
        { id: 'tab-1', workItemId: 1, groupId: 'g1' },
        { id: 'tab-2', workItemId: 999, groupId: 'g1' },
      ],
      activeTabId: 'tab-2',
      activeGroupId: 'g1',
    });
  });

  it('keeps a custom label on the active tab when its work item is replaced', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1, label: 'My Bug Fix', groupId: 'g1' }];

    const result = replaceActiveWorkItem(tabs, 'tab-1', 999, 'tab-2', 'g1');

    expect(result).toEqual({
      tabs: [{ id: 'tab-1', workItemId: 999, label: 'My Bug Fix', groupId: 'g1' }],
      activeTabId: 'tab-1',
      activeGroupId: 'g1',
    });
  });
});

describe('addTab', () => {
  it('appends a new tab to the given group and makes it active', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1, groupId: 'g1' }];

    const result = addTab(tabs, 2, 'tab-2', 'g1');

    expect(result).toEqual({
      tabs: [
        { id: 'tab-1', workItemId: 1, groupId: 'g1' },
        { id: 'tab-2', workItemId: 2, groupId: 'g1' },
      ],
      activeTabId: 'tab-2',
      activeGroupId: 'g1',
    });
  });

  it('focuses the existing tab and switches to its group instead of creating a duplicate when the work item is already open elsewhere', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1, groupId: 'g1' },
      { id: 'tab-2', workItemId: 2, groupId: 'g2' },
    ];

    const result = addTab(tabs, 2, 'tab-new', 'g1');

    expect(result).toEqual({ tabs, activeTabId: 'tab-2', activeGroupId: 'g2' });
  });

  it('refuses to add a tab past the max limit within the target group', () => {
    const tabs: WorkItemTab[] = Array.from({ length: MAX_TABS }, (_, i) => ({ id: `tab-${i}`, workItemId: i, groupId: 'g1' }));

    const result = addTab(tabs, 999, 'tab-new', 'g1');

    expect(result).toBeNull();
  });

  it('allows adding a tab to a different group even when another group is already at the max limit', () => {
    const tabs: WorkItemTab[] = Array.from({ length: MAX_TABS }, (_, i) => ({ id: `tab-${i}`, workItemId: i, groupId: 'g1' }));

    const result = addTab(tabs, 999, 'tab-new', 'g2');

    expect(result).toEqual({
      tabs: [...tabs, { id: 'tab-new', workItemId: 999, groupId: 'g2' }],
      activeTabId: 'tab-new',
      activeGroupId: 'g2',
    });
  });
});

describe('tabGroupId', () => {
  it("returns the tab's groupId when set", () => {
    expect(tabGroupId({ id: 't', workItemId: 1, groupId: 'g1' })).toBe('g1');
  });

  it('falls back to the default group when unset', () => {
    expect(tabGroupId({ id: 't', workItemId: 1 })).toBe(DEFAULT_GROUP_ID);
  });
});

describe('createDefaultGroup', () => {
  it('creates a group with the default id and the first palette color', () => {
    expect(createDefaultGroup()).toEqual({ id: DEFAULT_GROUP_ID, name: 'General', color: GROUP_COLORS[0] });
  });
});

describe('ensureDefaultGroup', () => {
  it('prepends the default group when missing', () => {
    const custom: TabGroup = { id: 'g1', name: 'Custom', color: GROUP_COLORS[1] };

    const result = ensureDefaultGroup([custom]);

    expect(result).toEqual([createDefaultGroup(), custom]);
  });

  it('leaves groups untouched when the default group already exists', () => {
    const groups: TabGroup[] = [createDefaultGroup(), { id: 'g1', name: 'Custom', color: GROUP_COLORS[1] }];

    const result = ensureDefaultGroup(groups);

    expect(result).toEqual(groups);
  });
});

describe('addGroup', () => {
  it('appends a new group with the next palette color and makes it active', () => {
    const groups: TabGroup[] = [createDefaultGroup()];

    const result = addGroup(groups, 'g2', 'Code Review');

    expect(result).toEqual({
      groups: [createDefaultGroup(), { id: 'g2', name: 'Code Review', color: GROUP_COLORS[1] }],
      activeGroupId: 'g2',
    });
  });

  it('cycles back to the first color once the palette is exhausted', () => {
    const groups: TabGroup[] = GROUP_COLORS.map((color, i) => ({ id: `g${i}`, name: `Group ${i}`, color }));

    const result = addGroup(groups, 'g-extra', 'Extra');

    expect(result.groups[result.groups.length - 1]).toEqual({ id: 'g-extra', name: 'Extra', color: GROUP_COLORS[0] });
  });
});

describe('renameGroup', () => {
  it('sets a trimmed name on the matching group', () => {
    const groups: TabGroup[] = [{ id: 'g1', name: 'Old', color: GROUP_COLORS[0] }];

    const result = renameGroup(groups, 'g1', '  New name  ');

    expect(result).toEqual([{ id: 'g1', name: 'New name', color: GROUP_COLORS[0] }]);
  });

  it('is a no-op when given an empty or whitespace-only name', () => {
    const groups: TabGroup[] = [{ id: 'g1', name: 'Old', color: GROUP_COLORS[0] }];

    const result = renameGroup(groups, 'g1', '   ');

    expect(result).toEqual(groups);
  });

  it('accepts a single-character name', () => {
    const groups: TabGroup[] = [{ id: 'g1', name: 'Old', color: GROUP_COLORS[0] }];

    const result = renameGroup(groups, 'g1', 'a');

    expect(result).toEqual([{ id: 'g1', name: 'a', color: GROUP_COLORS[0] }]);
  });

  it('truncates a name longer than the max length', () => {
    const groups: TabGroup[] = [{ id: 'g1', name: 'Old', color: GROUP_COLORS[0] }];
    const tooLong = 'a'.repeat(MAX_GROUP_NAME_LENGTH + 10);

    const result = renameGroup(groups, 'g1', tooLong);

    expect(result).toEqual([{ id: 'g1', name: 'a'.repeat(MAX_GROUP_NAME_LENGTH), color: GROUP_COLORS[0] }]);
  });
});

describe('removeGroup', () => {
  it('removes the group and reassigns its tabs to the default group', () => {
    const groups: TabGroup[] = [createDefaultGroup(), { id: 'g1', name: 'Code Review', color: GROUP_COLORS[1] }];
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1, groupId: 'g1' },
      { id: 'tab-2', workItemId: 2, groupId: DEFAULT_GROUP_ID },
    ];

    const result = removeGroup(groups, tabs, 'g1');

    expect(result).toEqual({
      groups: [createDefaultGroup()],
      tabs: [
        { id: 'tab-1', workItemId: 1, groupId: DEFAULT_GROUP_ID },
        { id: 'tab-2', workItemId: 2, groupId: DEFAULT_GROUP_ID },
      ],
    });
  });

  it('refuses to remove the default group', () => {
    const groups: TabGroup[] = [createDefaultGroup()];
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1, groupId: DEFAULT_GROUP_ID }];

    const result = removeGroup(groups, tabs, DEFAULT_GROUP_ID);

    expect(result).toEqual({ groups, tabs });
  });
});

describe('reorderGroups', () => {
  it('keeps the default group first regardless of the requested order', () => {
    const groups: TabGroup[] = [
      createDefaultGroup(),
      { id: 'g1', name: 'Code Review', color: GROUP_COLORS[1] },
      { id: 'g2', name: 'My Work', color: GROUP_COLORS[2] },
    ];

    const result = reorderGroups(groups, ['g2', DEFAULT_GROUP_ID, 'g1']);

    expect(result).toEqual([
      createDefaultGroup(),
      { id: 'g2', name: 'My Work', color: GROUP_COLORS[2] },
      { id: 'g1', name: 'Code Review', color: GROUP_COLORS[1] },
    ]);
  });

  it('reorders the non-default groups to match the given order', () => {
    const groups: TabGroup[] = [
      createDefaultGroup(),
      { id: 'g1', name: 'A', color: GROUP_COLORS[1] },
      { id: 'g2', name: 'B', color: GROUP_COLORS[2] },
      { id: 'g3', name: 'C', color: GROUP_COLORS[3] },
    ];

    const result = reorderGroups(groups, ['g3', 'g1', 'g2']);

    expect(result.map(g => g.id)).toEqual([DEFAULT_GROUP_ID, 'g3', 'g1', 'g2']);
  });

  it('ignores group ids that do not exist', () => {
    const groups: TabGroup[] = [createDefaultGroup(), { id: 'g1', name: 'A', color: GROUP_COLORS[1] }, { id: 'g2', name: 'B', color: GROUP_COLORS[2] }];

    const result = reorderGroups(groups, ['g2', 'does-not-exist', 'g1']);

    expect(result.map(g => g.id)).toEqual([DEFAULT_GROUP_ID, 'g2', 'g1']);
  });

  it('appends groups missing from the given order at the end, keeping their relative order', () => {
    const groups: TabGroup[] = [
      createDefaultGroup(),
      { id: 'g1', name: 'A', color: GROUP_COLORS[1] },
      { id: 'g2', name: 'B', color: GROUP_COLORS[2] },
      { id: 'g3', name: 'C', color: GROUP_COLORS[3] },
    ];

    const result = reorderGroups(groups, ['g3']);

    expect(result.map(g => g.id)).toEqual([DEFAULT_GROUP_ID, 'g3', 'g1', 'g2']);
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

  it('activates a sibling tab in the same group, never jumping to a tab in another group', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1, groupId: 'g1' },
      { id: 'tab-2', workItemId: 2, groupId: 'g1' },
      { id: 'tab-3', workItemId: 3, groupId: 'g2' },
    ];

    const result = closeTab(tabs, 'tab-1', 'tab-1');

    expect(result).toEqual({
      tabs: [
        { id: 'tab-2', workItemId: 2, groupId: 'g1' },
        { id: 'tab-3', workItemId: 3, groupId: 'g2' },
      ],
      activeTabId: 'tab-2',
    });
  });

  it('sets activeTabId to undefined when closing the last tab in a group, even though other groups still have tabs', () => {
    const tabs: WorkItemTab[] = [
      { id: 'tab-1', workItemId: 1, groupId: 'g1' },
      { id: 'tab-2', workItemId: 2, groupId: 'g2' },
    ];

    const result = closeTab(tabs, 'tab-1', 'tab-1');

    expect(result).toEqual({ tabs: [{ id: 'tab-2', workItemId: 2, groupId: 'g2' }], activeTabId: undefined });
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

  it('accepts a single-character name (the tab bar guarantees a minimum clickable width via CSS, not name length)', () => {
    const tabs: WorkItemTab[] = [{ id: 'tab-1', workItemId: 1 }];

    const result = renameTab(tabs, 'tab-1', '1');

    expect(result).toEqual([{ id: 'tab-1', workItemId: 1, label: '1' }]);
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
