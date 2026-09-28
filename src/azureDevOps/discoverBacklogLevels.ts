import type { AzureDevOpsClient } from './client';

export async function discoverBacklogLevelsByTeam(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
): Promise<Record<string, Record<string, number>>> {
  const teams = await client.listTeams(organization, project);

  const result: Record<string, Record<string, number>> = {};
  for (const team of teams) {
    try {
      result[team.name] = await client.getBacklogLevels(organization, project, team.name);
    } catch {
      // One-off failure for a team (e.g. no access): continue without it instead of aborting the whole discovery.
    }
  }
  return result;
}
