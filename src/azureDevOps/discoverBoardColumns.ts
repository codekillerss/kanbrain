import type { AzureDevOpsClient, BoardColumn } from './client';

export interface DiscoveredBoard {
  name: string;
  columns: BoardColumn[];
}

export async function discoverBoardColumns(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
  team: string,
): Promise<DiscoveredBoard[]> {
  const boards = await client.listBoards(organization, project, team);

  const result: DiscoveredBoard[] = [];
  for (const board of boards) {
    try {
      const columns = await client.listBoardColumns(organization, project, team, board.id);
      result.push({ name: board.name, columns });
    } catch {
      // One-off failure for a board: continue without it instead of aborting the whole discovery.
    }
  }

  return result;
}
