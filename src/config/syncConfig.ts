import type { KanbrainConfig, SkillEntry, CardFieldSettings } from '../types';
import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';

export function syncConfig(
  config: KanbrainConfig,
  discovered: DiscoveredBacklogLevels,
  freshTypeToBacklogLevel: Record<string, string>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshCardSettingsByBoard: Record<string, Record<string, CardFieldSettings>>,
): KanbrainConfig {
  const backlogLevels: Record<string, Record<string, SkillEntry | null>> = {};

  for (const [level, statuses] of Object.entries(discovered)) {
    const existingLevel = config.backlogLevels[level] ?? {};
    const merged: Record<string, SkillEntry | null> = {};
    for (const status of Object.keys(statuses)) {
      merged[status] = status in existingLevel ? existingLevel[status] : null;
    }
    backlogLevels[level] = merged;
  }

  for (const [level, statuses] of Object.entries(config.backlogLevels)) {
    if (!(level in backlogLevels)) {
      backlogLevels[level] = { ...statuses };
      continue;
    }
    for (const [status, skill] of Object.entries(statuses)) {
      if (!(status in backlogLevels[level])) {
        backlogLevels[level][status] = skill;
      }
    }
  }

  return {
    organization: config.organization,
    project: config.project,
    typeToBacklogLevel: freshTypeToBacklogLevel,
    backlogLevels,
    statusColors: freshStatusColors,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
    cardSettingsByBoard: freshCardSettingsByBoard,
    showAssignedTo: config.showAssignedTo,
  };
}
