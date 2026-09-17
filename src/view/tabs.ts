export interface WorkItemTab {
  id: string;
  workItemId: number;
  /** Work item type, resolved at render time for the tab's icon — never persisted or set by the functions below. */
  type?: string;
}

export interface TabsUpdate {
  tabs: WorkItemTab[];
  activeTabId: string | undefined;
}

export const MAX_TABS = 8;

function findTabByWorkItemId(tabs: WorkItemTab[], workItemId: number): WorkItemTab | undefined {
  return tabs.find(t => t.workItemId === workItemId);
}

export function replaceActiveWorkItem(
  tabs: WorkItemTab[],
  activeTabId: string | undefined,
  workItemId: number,
  newTabId: string,
): TabsUpdate {
  const existing = findTabByWorkItemId(tabs, workItemId);
  if (existing) {
    return { tabs, activeTabId: existing.id };
  }
  const activeIndex = tabs.findIndex(t => t.id === activeTabId);
  if (activeIndex === -1) {
    const tab: WorkItemTab = { id: newTabId, workItemId };
    return { tabs: [...tabs, tab], activeTabId: tab.id };
  }
  const updated = tabs.slice();
  updated[activeIndex] = { id: tabs[activeIndex].id, workItemId };
  return { tabs: updated, activeTabId };
}

export function addTab(tabs: WorkItemTab[], workItemId: number, newTabId: string): TabsUpdate | null {
  const existing = findTabByWorkItemId(tabs, workItemId);
  if (existing) {
    return { tabs, activeTabId: existing.id };
  }
  if (tabs.length >= MAX_TABS) {
    return null;
  }
  const tab: WorkItemTab = { id: newTabId, workItemId };
  return { tabs: [...tabs, tab], activeTabId: tab.id };
}

export function closeTab(tabs: WorkItemTab[], activeTabId: string | undefined, tabIdToClose: string): TabsUpdate {
  const index = tabs.findIndex(t => t.id === tabIdToClose);
  if (index === -1) {
    return { tabs, activeTabId };
  }
  const remaining = tabs.filter(t => t.id !== tabIdToClose);
  if (activeTabId !== tabIdToClose) {
    return { tabs: remaining, activeTabId };
  }
  if (remaining.length === 0) {
    return { tabs: remaining, activeTabId: undefined };
  }
  const nextIndex = Math.min(index, remaining.length - 1);
  return { tabs: remaining, activeTabId: remaining[nextIndex].id };
}
