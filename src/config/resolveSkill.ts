import type { KanbrainConfig, SkillEntry, WorkItem } from '../types';

export function resolveSkill(config: KanbrainConfig, workItem: WorkItem): SkillEntry | null {
  const skillId = config.workflowSteps[workItem.type]?.[workItem.status]?.skillId;
  return skillId ? (config.skills[skillId] ?? null) : null;
}
