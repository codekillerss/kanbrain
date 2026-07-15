import type { AzureDevOpsClient } from './client';
import type { BacklogLevel, WorkItemTypeState } from './backlogLevels';
import { sanitizeSvg } from '../view/sanitizeSvg';

export interface BoardState {
  levels: BacklogLevel[];
  statesByType: Record<string, WorkItemTypeState[]>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
}

export async function discoverBoardState(client: AzureDevOpsClient, organization: string, project: string): Promise<BoardState> {
  const team = await client.getDefaultTeamName(organization, project);
  const levels = await client.listBacklogLevels(organization, project, team);

  const statesByType: Record<string, WorkItemTypeState[]> = {};
  const uniqueTypes = Array.from(new Set(levels.flatMap(level => level.workItemTypes)));
  for (const type of uniqueTypes) {
    try {
      statesByType[type] = await client.listWorkItemTypeStates(organization, project, type);
    } catch {
      // One-off failure for a type: continue without it instead of aborting the whole discovery.
    }
  }

  const typeColors: Record<string, string> = {};
  const typeIcons: Record<string, string> = {};
  for (const type of uniqueTypes) {
    try {
      const icon = await client.getWorkItemTypeIcon(organization, project, type);
      if (icon) {
        typeColors[type] = icon.color;
        typeIcons[type] = sanitizeSvg(icon.iconSvg);
      }
    } catch {
      // One-off failure for a type: continue without its icon/color instead of aborting the whole discovery.
    }
  }

  return { levels, statesByType, typeColors, typeIcons };
}
