import type { KanbrainConfig, WorkflowStepConfig, CardFieldSettings, RepositoryPathEntry } from '../types';
import { DEFAULT_REPO_SCAN_DEPTH } from './config';

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
  const workflowSteps: Record<string, Record<string, WorkflowStepConfig | null>> = {};

  for (const [type, statuses] of Object.entries(discoveredStatusesByType)) {
    const existingType = config.workflowSteps[type] ?? {};
    const merged: Record<string, WorkflowStepConfig | null> = {};
    for (const status of Object.keys(statuses)) {
      merged[status] = status in existingType ? existingType[status] : null;
    }
    workflowSteps[type] = merged;
  }

  for (const [type, statuses] of Object.entries(config.workflowSteps)) {
    if (!(type in workflowSteps)) {
      workflowSteps[type] = { ...statuses };
      continue;
    }
    for (const [status, step] of Object.entries(statuses)) {
      if (!(status in workflowSteps[type])) {
        workflowSteps[type][status] = step;
      }
    }
  }

  return {
    organization: config.organization,
    project: config.project,
    defaultTeam: freshDefaultTeam,
    skills: config.skills,
    workflowSteps,
    statusColors: freshStatusColors,
    statusCategoriesByType: discoveredStatusesByType,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
    cardSettingsByTeam: freshCardSettingsByTeam,
    taskBacklogTypesByTeam: freshTaskBacklogTypesByTeam,
    showAssignedTo: config.showAssignedTo,
    searchAssignedToMe: config.searchAssignedToMe,
    repositories: mergeRepositories(config.repositories, freshRepositories),
    profiles: config.profiles,
    selectedProfileId: config.selectedProfileId,
    repoScanDepth: config.repoScanDepth ?? DEFAULT_REPO_SCAN_DEPTH,
  };
}
