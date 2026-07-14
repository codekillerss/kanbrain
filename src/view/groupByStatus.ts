import type { WorkItem } from '../types';

export function groupByStatus(items: WorkItem[]): { status: string; items: WorkItem[] }[] {
  const order: string[] = [];
  const byStatus = new Map<string, WorkItem[]>();

  for (const item of items) {
    if (!byStatus.has(item.status)) {
      order.push(item.status);
      byStatus.set(item.status, []);
    }
    byStatus.get(item.status)!.push(item);
  }

  return order.map(status => ({ status, items: byStatus.get(status)! }));
}
