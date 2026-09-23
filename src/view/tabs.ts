export interface WorkItemTab {
  id: string;
  workItemId: number;
  /** Work item type, resolved at render time for the tab's icon — never persisted or set by the functions below. */
  type?: string;
  /** Custom tab name set by the user; falls back to `#${workItemId}` when unset. */
  label?: string;
  /** Group this tab belongs to; falls back to the default group when unset. Read via tabGroupId(). */
  groupId?: string;
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
}

export interface TabsUpdate {
  tabs: WorkItemTab[];
  activeTabId: string | undefined;
}

export interface TabsGroupUpdate extends TabsUpdate {
  activeGroupId: string;
}

export const MAX_TABS = 8;
export const DEFAULT_GROUP_ID = 'default';
export const GROUP_COLORS = [
  'var(--vscode-charts-blue)',
  'var(--vscode-charts-green)',
  'var(--vscode-charts-orange)',
  'var(--vscode-charts-purple)',
  'var(--vscode-charts-red)',
  'var(--vscode-charts-yellow)',
];

export function tabGroupId(tab: WorkItemTab): string {
  return tab.groupId ?? DEFAULT_GROUP_ID;
}

export function tabsInGroup(tabs: WorkItemTab[], groupId: string): WorkItemTab[] {
  return tabs.filter(t => tabGroupId(t) === groupId);
}

export function createDefaultGroup(): TabGroup {
  return { id: DEFAULT_GROUP_ID, name: 'General', color: GROUP_COLORS[0] };
}

export function ensureDefaultGroup(groups: TabGroup[]): TabGroup[] {
  if (groups.some(g => g.id === DEFAULT_GROUP_ID)) {
    return groups;
  }
  return [createDefaultGroup(), ...groups];
}

export function addGroup(groups: TabGroup[], newGroupId: string, name: string): { groups: TabGroup[]; activeGroupId: string } {
  const color = GROUP_COLORS[groups.length % GROUP_COLORS.length];
  const group: TabGroup = { id: newGroupId, name, color };
  return { groups: [...groups, group], activeGroupId: group.id };
}

function findTabByWorkItemId(tabs: WorkItemTab[], workItemId: number): WorkItemTab | undefined {
  return tabs.find(t => t.workItemId === workItemId);
}

export function replaceActiveWorkItem(
  tabs: WorkItemTab[],
  activeTabId: string | undefined,
  workItemId: number,
  newTabId: string,
  groupId: string,
): TabsGroupUpdate {
  const existing = findTabByWorkItemId(tabs, workItemId);
  if (existing) {
    return { tabs, activeTabId: existing.id, activeGroupId: tabGroupId(existing) };
  }
  const activeIndex = tabs.findIndex(t => t.id === activeTabId);
  if (activeIndex === -1) {
    const tab: WorkItemTab = { id: newTabId, workItemId, groupId };
    return { tabs: [...tabs, tab], activeTabId: tab.id, activeGroupId: groupId };
  }
  const updated = tabs.slice();
  updated[activeIndex] = { ...tabs[activeIndex], workItemId };
  return { tabs: updated, activeTabId, activeGroupId: tabGroupId(updated[activeIndex]) };
}

export function addTab(tabs: WorkItemTab[], workItemId: number, newTabId: string, groupId: string): TabsGroupUpdate | null {
  const existing = findTabByWorkItemId(tabs, workItemId);
  if (existing) {
    return { tabs, activeTabId: existing.id, activeGroupId: tabGroupId(existing) };
  }
  if (tabsInGroup(tabs, groupId).length >= MAX_TABS) {
    return null;
  }
  const tab: WorkItemTab = { id: newTabId, workItemId, groupId };
  return { tabs: [...tabs, tab], activeTabId: tab.id, activeGroupId: groupId };
}

export function renameTab(tabs: WorkItemTab[], tabId: string, label: string): WorkItemTab[] {
  const trimmed = label.trim();
  // No minimum length here — the tab bar guarantees a minimum clickable width via CSS instead.
  return tabs.map(t => (t.id === tabId ? { ...t, label: trimmed === '' ? undefined : trimmed } : t));
}

export const MAX_GROUP_NAME_LENGTH = 30;

export function renameGroup(groups: TabGroup[], groupId: string, name: string): TabGroup[] {
  const trimmed = name.trim();
  if (trimmed === '') {
    // Unlike a tab (which falls back to displaying #id), a group has nothing sensible to show
    // for an empty name — reject and keep the group as-is instead.
    return groups;
  }
  return groups.map(g => (g.id === groupId ? { ...g, name: trimmed.slice(0, MAX_GROUP_NAME_LENGTH) } : g));
}

export function removeGroup(groups: TabGroup[], tabs: WorkItemTab[], groupId: string): { groups: TabGroup[]; tabs: WorkItemTab[] } {
  if (groupId === DEFAULT_GROUP_ID) {
    return { groups, tabs };
  }
  return {
    groups: groups.filter(g => g.id !== groupId),
    tabs: tabs.map(t => (tabGroupId(t) === groupId ? { ...t, groupId: DEFAULT_GROUP_ID } : t)),
  };
}

export function reorderTabs(tabs: WorkItemTab[], orderedTabIds: string[]): WorkItemTab[] {
  const byId = new Map(tabs.map(t => [t.id, t]));
  const reordered = orderedTabIds.map(id => byId.get(id)).filter((t): t is WorkItemTab => t !== undefined);
  const includedIds = new Set(reordered.map(t => t.id));
  const missing = tabs.filter(t => !includedIds.has(t.id));
  return [...reordered, ...missing];
}

export function reorderGroups(groups: TabGroup[], orderedGroupIds: string[]): TabGroup[] {
  // The default group is never repositioned — it's always first, and it's dropped from the
  // requested order below even if a caller tried to move it.
  const byId = new Map(groups.map(g => [g.id, g]));
  const requestedIds = orderedGroupIds.filter(id => id !== DEFAULT_GROUP_ID);
  const reordered = requestedIds.map(id => byId.get(id)).filter((g): g is TabGroup => g !== undefined);
  const includedIds = new Set(reordered.map(g => g.id));
  const missing = groups.filter(g => g.id !== DEFAULT_GROUP_ID && !includedIds.has(g.id));
  const defaultGroup = groups.find(g => g.id === DEFAULT_GROUP_ID);
  const rest = [...reordered, ...missing];
  return defaultGroup ? [defaultGroup, ...rest] : rest;
}

export function closeTab(tabs: WorkItemTab[], activeTabId: string | undefined, tabIdToClose: string): TabsUpdate {
  const tabToClose = tabs.find(t => t.id === tabIdToClose);
  if (!tabToClose) {
    return { tabs, activeTabId };
  }
  const remaining = tabs.filter(t => t.id !== tabIdToClose);
  if (activeTabId !== tabIdToClose) {
    return { tabs: remaining, activeTabId };
  }
  // Closing the active tab activates a sibling from the SAME group — never a tab from another
  // group, even if one exists earlier in the flat list (grouping would otherwise leak).
  const groupId = tabGroupId(tabToClose);
  const siblingsBefore = tabsInGroup(tabs, groupId);
  const closedIndexInGroup = siblingsBefore.findIndex(t => t.id === tabIdToClose);
  const siblingsAfter = tabsInGroup(remaining, groupId);
  if (siblingsAfter.length === 0) {
    return { tabs: remaining, activeTabId: undefined };
  }
  const nextIndex = Math.min(closedIndexInGroup, siblingsAfter.length - 1);
  return { tabs: remaining, activeTabId: siblingsAfter[nextIndex].id };
}
