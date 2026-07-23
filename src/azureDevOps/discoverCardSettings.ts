import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';

export async function discoverCardSettingsByTeam(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
): Promise<Record<string, Record<string, Record<string, CardFieldSettings>>>> {
  const teams = await client.listTeams(organization, project);

  const result: Record<string, Record<string, Record<string, CardFieldSettings>>> = {};
  for (const team of teams) {
    try {
      const boards = await client.listBoards(organization, project, team.name);
      const byBoard: Record<string, Record<string, CardFieldSettings>> = {};
      for (const board of boards) {
        try {
          byBoard[board.name] = await client.getCardSettings(organization, project, team.name, board.id);
        } catch {
          // One-off failure for a board: continue without it instead of aborting the whole team.
        }
      }
      result[team.name] = byBoard;
    } catch {
      // One-off failure for a team (e.g. no board access): continue without it instead of aborting the whole discovery.
    }
  }
  return result;
}
