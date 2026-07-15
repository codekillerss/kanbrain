import type { KanbrainConfig, SkillEntry, WorkItem } from '../types';

export function resolveSkill(config: KanbrainConfig, workItem: WorkItem): SkillEntry | null {
  const level = config.typeToBacklogLevel[workItem.type];
  if (!level) {
    return null;
  }
  return config.backlogLevels[level]?.[workItem.status] ?? null;
}
