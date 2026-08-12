import type { WorkItem } from '../types';

const BASE_QUERY = 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project';
const ORDER_BY = 'ORDER BY [System.ChangedDate] DESC';

export function buildSearchQuery(searchText: string): string {
  const trimmed = searchText.trim();

  if (!trimmed) {
    return `${BASE_QUERY} ${ORDER_BY}`;
  }

  if (/^\d+$/.test(trimmed)) {
    return `${BASE_QUERY} AND [System.Id] = ${trimmed}`;
  }

  const escaped = trimmed.replace(/'/g, "''");
  return `${BASE_QUERY} AND [System.Title] CONTAINS '${escaped}' ${ORDER_BY}`;
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

export function countItemsByType(items: WorkItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}
