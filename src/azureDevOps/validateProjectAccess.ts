import { AzureDevOpsHttpError, type AzureDevOpsClient } from './client';

// Resolves false only on a definitive 401/403; other failures (network, 5xx, timeout) are rethrown.
export async function validateProjectAccess(client: AzureDevOpsClient, organization: string, project: string): Promise<boolean> {
  try {
    await client.getDefaultTeamName(organization, project);
    return true;
  } catch (error) {
    if (error instanceof AzureDevOpsHttpError && (error.status === 401 || error.status === 403)) {
      return false;
    }
    throw error;
  }
}
