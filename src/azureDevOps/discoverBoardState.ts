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

function collectTypesOnAnyBoard(cardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>): Set<string> {
  const types = new Set<string>();
  for (const boards of Object.values(cardSettingsByTeam)) {
    for (const typesOnBoard of Object.values(boards)) {
      for (const type of Object.keys(typesOnBoard)) {
        types.add(type);
      }
    }
  }
  return types;
}

function filterToTypes<T>(record: Record<string, T>, allowedTypes: Set<string>): Record<string, T> {
  const filtered: Record<string, T> = {};
  for (const [type, value] of Object.entries(record)) {
    if (allowedTypes.has(type)) {
      filtered[type] = value;
    }
  }
  return filtered;
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

  // Not every process-defined work item type is actually used by this project — only keep the ones
  // that show up on at least one team's real board (e.g. drop unused defaults like Impediment/Risk).
  const typesOnAnyBoard = collectTypesOnAnyBoard(cardSettingsByTeam);

  return {
    discoveredStatusesByType: filterToTypes(discoveredStatusesByType, typesOnAnyBoard),
    typeColors: filterToTypes(typeColors, typesOnAnyBoard),
    typeIcons: filterToTypes(typeIcons, typesOnAnyBoard),
    defaultTeam,
    cardSettingsByTeam,
  };
}
