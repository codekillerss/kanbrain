import type { KanbrainConfig, SkillEntry, CardFieldSettings } from '../types';

export function syncConfig(
  config: KanbrainConfig,
  discoveredStatusesByType: Record<string, Record<string, string>>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshDefaultTeam: string,
  freshCardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>,
): KanbrainConfig {
  const skills: Record<string, Record<string, SkillEntry | null>> = {};

  for (const [type, statuses] of Object.entries(discoveredStatusesByType)) {
    const existingType = config.skills[type] ?? {};
    const merged: Record<string, SkillEntry | null> = {};
    for (const status of Object.keys(statuses)) {
      merged[status] = status in existingType ? existingType[status] : null;
    }
    skills[type] = merged;
  }

  for (const [type, statuses] of Object.entries(config.skills)) {
    if (!(type in skills)) {
      skills[type] = { ...statuses };
      continue;
    }
    for (const [status, skill] of Object.entries(statuses)) {
      if (!(status in skills[type])) {
        skills[type][status] = skill;
      }
    }
  }

  return {
    organization: config.organization,
    project: config.project,
    defaultTeam: freshDefaultTeam,
    skills,
    statusColors: freshStatusColors,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
    cardSettingsByTeam: freshCardSettingsByTeam,
    showAssignedTo: config.showAssignedTo,
  };
}
