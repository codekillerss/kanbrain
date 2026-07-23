import type { KanbrainConfig, CardFieldSettings } from '../types';

function resolveCardField(
  config: KanbrainConfig,
  workItemType: string,
  selectedTeam: string | undefined,
  field: keyof CardFieldSettings,
): boolean {
  const teams = config.cardSettingsByTeam ?? {};
  const teamNames = Object.keys(teams);
  if (teamNames.length === 0) {
    return false;
  }
  const teamName = selectedTeam && teamNames.includes(selectedTeam) ? selectedTeam : teamNames.includes(config.defaultTeam) ? config.defaultTeam : teamNames[0];
  const boards = teams[teamName];

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
  return resolveCardField(config, workItemType, selectedTeam, 'assignedTo');
}
