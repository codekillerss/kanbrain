import type { KanbrainConfig, SkillEntry, CardFieldSettings, RepositoryPathEntry } from '../types';

function mergeRepositories(
  existing: Record<string, RepositoryPathEntry> | undefined,
  fresh: Record<string, RepositoryPathEntry>,
): Record<string, RepositoryPathEntry> {
  const merged: Record<string, RepositoryPathEntry> = {};
  for (const [id, freshEntry] of Object.entries(fresh)) {
    const existingEntry = existing?.[id];
    merged[id] = { name: freshEntry.name, path: existingEntry?.path || freshEntry.path };
  }
  for (const [id, existingEntry] of Object.entries(existing ?? {})) {
    if (!(id in merged)) {
      merged[id] = existingEntry;
    }
  }
  return merged;
}

export function syncConfig(
  config: KanbrainConfig,
  discoveredStatusesByType: Record<string, Record<string, string>>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshDefaultTeam: string,
  freshCardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>,
  freshTaskBacklogTypesByTeam: Record<string, string[]>,
  freshRepositories: Record<string, RepositoryPathEntry>,
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
    taskBacklogTypesByTeam: freshTaskBacklogTypesByTeam,
    showAssignedTo: config.showAssignedTo,
    repositories: mergeRepositories(config.repositories, freshRepositories),
  };
}
