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

  // Not every process-defined work item type is actually used by this project — many teams never
  // touch defaults like Impediment/Risk/Test Case. Only keep types that have at least one real
  // work item, rather than every type the process happens to define.
  const typesWithItems = new Set<string>();
  await Promise.all(
    Object.keys(discoveredStatusesByType).map(async type => {
      const count = await client.countWorkItemsByType(organization, project, [type]);
      if (count > 0) {
        typesWithItems.add(type);
      }
    }),
  );

  return {
    discoveredStatusesByType: filterToTypes(discoveredStatusesByType, typesWithItems),
    typeColors: filterToTypes(typeColors, typesWithItems),
    typeIcons: filterToTypes(typeIcons, typesWithItems),
    defaultTeam,
    cardSettingsByTeam,
  };
}
