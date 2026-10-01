import type { WorkItem } from '../types';

const BASE_QUERY = 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project';
const ORDER_BY = 'ORDER BY [System.ChangedDate] DESC';

function escapeWiqlString(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildSearchQuery(searchText: string, assignedToMe = false, workItemType?: string): string {
  const trimmed = searchText.trim();
  const assignedToClause = assignedToMe ? ' AND [System.AssignedTo] = @Me' : '';
  const typeClause = workItemType ? ` AND [System.WorkItemType] = '${escapeWiqlString(workItemType)}'` : '';
  const filters = `${assignedToClause}${typeClause}`;

  if (!trimmed) {
    return `${BASE_QUERY}${filters} ${ORDER_BY}`;
  }

  if (/^\d+$/.test(trimmed)) {
    return `${BASE_QUERY} AND [System.Id] = ${trimmed}${filters}`;
  }

  return `${BASE_QUERY} AND [System.Title] CONTAINS '${escapeWiqlString(trimmed)}'${filters} ${ORDER_BY}`;
}

export function buildTypeCountQuery(types: string[]): string {
  const escapedTypes = types.map(t => `'${escapeWiqlString(t)}'`).join(', ');
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

export function filterByWorkItemType(items: WorkItem[], workItemType: string): WorkItem[] {
  return items.filter(item => item.type === workItemType);
}
