import type { KanbrainConfig, SkillEntry, WorkItem } from '../types';

export function resolveSkill(config: KanbrainConfig, workItem: WorkItem): SkillEntry | null {
  return config.skills[workItem.type]?.[workItem.status] ?? null;
}
