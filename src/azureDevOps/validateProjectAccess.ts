import type { AzureDevOpsClient } from './client';

export async function validateProjectAccess(client: AzureDevOpsClient, organization: string, project: string): Promise<boolean> {
  try {
    await client.getDefaultTeamName(organization, project);
    return true;
  } catch {
    return false;
  }
}
