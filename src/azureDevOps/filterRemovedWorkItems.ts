import type { WorkItem, KanbrainConfig } from '../types';

function isRemoved(item: WorkItem, config: KanbrainConfig): boolean {
  const category = config.statusCategoriesByType?.[item.type]?.[item.status];
  if (category) {
    return category === 'Removed';
  }
  return item.status === 'Removed';
}

export function filterOutRemoved(items: WorkItem[], config: KanbrainConfig): WorkItem[] {
  return items.filter(item => !isRemoved(item, config));
}
