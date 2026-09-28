import type { WorkItem, KanbrainConfig } from '../types';

function isRemoved(item: WorkItem, config: KanbrainConfig): boolean {
  const category = config.statusCategoriesByType?.[item.type]?.[item.status];
  if (category) {
    return category === 'Removed';
  }
  return item.status === 'Removed';
}

// Unlike isRemoved, no fallback on the status name: which status means "done" varies per process,
// so without the category we'd rather not mute anything than mute the wrong items.
export function isCompleted(item: WorkItem, config: KanbrainConfig): boolean {
  return config.statusCategoriesByType?.[item.type]?.[item.status] === 'Completed';
}

export function filterOutRemoved(items: WorkItem[], config: KanbrainConfig): WorkItem[] {
  return items.filter(item => !isRemoved(item, config));
}
