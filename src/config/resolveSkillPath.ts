import type { KanbrainConfig, WorkItem } from '../types';

export function resolveSkillPath(config: KanbrainConfig, workItem: WorkItem): string | null {
  const level = config.typeToBacklogLevel[workItem.type];
  if (!level) {
    return null;
  }
  return config.backlogLevels[level]?.[workItem.status] ?? null;
}
