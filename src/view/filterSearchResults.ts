import type { WorkItem } from '../types';

export function filterSearchResults(items: WorkItem[], query: string): WorkItem[] {
  const trimmed = query.trim();
  if (!/^\d+$/.test(trimmed)) {
    return items;
  }
  return items.filter(item => String(item.id).includes(trimmed));
}
