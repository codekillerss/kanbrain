import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';

export async function discoverCardSettingsByBoard(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
  team: string,
): Promise<Record<string, Record<string, CardFieldSettings>>> {
  const boards = await client.listBoards(organization, project, team);

  const result: Record<string, Record<string, CardFieldSettings>> = {};
  for (const board of boards) {
    try {
      result[board.name] = await client.getCardSettings(organization, project, team, board.id);
    } catch {
      // One-off failure for a board: continue without it instead of aborting the whole discovery.
    }
  }
  return result;
}
