import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';
import { discoverWorkItemTypes, discoverStatusesByType } from './discoverWorkItemTypes';
import { discoverCardSettingsByTeam } from './discoverCardSettings';

export interface BoardState {
  discoveredStatusesByType: Record<string, Record<string, string>>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  defaultTeam: string;
  cardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>;
}

export async function discoverBoardState(client: AzureDevOpsClient, organization: string, project: string): Promise<BoardState> {
  const defaultTeam = await client.getDefaultTeamName(organization, project);
  const types = await discoverWorkItemTypes(client, organization, project);

  const discoveredStatusesByType = discoverStatusesByType(types);
  const typeColors: Record<string, string> = {};
  const typeIcons: Record<string, string> = {};
  for (const type of types) {
    typeColors[type.name] = type.color;
    typeIcons[type.name] = type.iconSvg;
  }

  const cardSettingsByTeam = await discoverCardSettingsByTeam(client, organization, project);

  return { discoveredStatusesByType, typeColors, typeIcons, defaultTeam, cardSettingsByTeam };
}
