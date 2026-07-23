import type { KanbrainConfig, CardFieldSettings } from '../types';

function resolveTeamName(config: KanbrainConfig, selectedTeam: string | undefined): string | undefined {
  const teamNames = Object.keys(config.cardSettingsByTeam ?? {});
  if (teamNames.length === 0) {
    return undefined;
  }
  return selectedTeam && teamNames.includes(selectedTeam) ? selectedTeam : teamNames.includes(config.defaultTeam) ? config.defaultTeam : teamNames[0];
}

function resolveCardField(
  config: KanbrainConfig,
  workItemType: string,
  selectedTeam: string | undefined,
  field: keyof CardFieldSettings,
): boolean {
  const teamName = resolveTeamName(config, selectedTeam);
  if (!teamName) {
    return false;
  }
  const boards = (config.cardSettingsByTeam ?? {})[teamName];

  const matches = Object.values(boards).filter(byType => workItemType in byType);
  if (matches.length === 0) {
    return false;
  }
  return matches[0][workItemType][field];
}

export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  return resolveCardField(config, workItemType, selectedTeam, 'parent');
}

export function resolveShowAssignedTo(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  const teamName = resolveTeamName(config, selectedTeam);
  const taskBacklogTypes = (teamName && config.taskBacklogTypesByTeam?.[teamName]) ?? [];
  if (taskBacklogTypes.includes(workItemType)) {
    return true;
  }
  return resolveCardField(config, workItemType, selectedTeam, 'assignedTo');
}
