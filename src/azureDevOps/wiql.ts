import type { WorkItem } from '../types';

const BASE_QUERY = 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project';
const ORDER_BY = 'ORDER BY [System.ChangedDate] DESC';

export function buildSearchQuery(searchText: string, assignedToMe = false): string {
  const trimmed = searchText.trim();
  const assignedToClause = assignedToMe ? ' AND [System.AssignedTo] = @Me' : '';

  if (!trimmed) {
    return `${BASE_QUERY}${assignedToClause} ${ORDER_BY}`;
  }

  if (/^\d+$/.test(trimmed)) {
    return `${BASE_QUERY} AND [System.Id] = ${trimmed}${assignedToClause}`;
  }

  const escaped = trimmed.replace(/'/g, "''");
  return `${BASE_QUERY} AND [System.Title] CONTAINS '${escaped}'${assignedToClause} ${ORDER_BY}`;
}

export function buildTypeCountQuery(types: string[]): string {
  const escapedTypes = types.map(t => `'${t.replace(/'/g, "''")}'`).join(', ');
  return `${BASE_QUERY} AND [System.WorkItemType] IN (${escapedTypes})`;
}

export function filterWorkItemsByText(items: WorkItem[], searchText: string): WorkItem[] {
  const trimmed = searchText.trim();
  if (!trimmed) {
    return items;
  }
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return items.filter(item => item.id === id);
  }
  const needle = trimmed.toLowerCase();
  return items.filter(item => item.title.toLowerCase().includes(needle));
}

export function filterByAssignedTo(items: WorkItem[], userId: string): WorkItem[] {
  return items.filter(item => item.assignedTo?.id === userId);
}

export function countItemsByType(items: WorkItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}
