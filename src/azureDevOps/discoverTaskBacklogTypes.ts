import type { AzureDevOpsClient } from './client';

export async function discoverTaskBacklogTypesByTeam(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
): Promise<Record<string, string[]>> {
  const teams = await client.listTeams(organization, project);

  const result: Record<string, string[]> = {};
  for (const team of teams) {
    try {
      result[team.name] = await client.getTaskBacklogWorkItemTypes(organization, project, team.name);
    } catch {
      // One-off failure for a team (e.g. no access): continue without it instead of aborting the whole discovery.
    }
  }
  return result;
}
