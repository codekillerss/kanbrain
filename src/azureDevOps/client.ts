import type { WorkItem } from '../types';
import { buildSearchQuery } from './wiql';
import { mapWorkItem } from './mapWorkItem';

export interface AzureDevOpsClientDeps {
  fetchImpl: typeof fetch;
  getToken: () => Promise<string>;
}

export interface AzureDevOpsOrg {
  id: string;
  name: string;
}

export interface AzureDevOpsProject {
  id: string;
  name: string;
}

export class AzureDevOpsClient {
  constructor(private readonly deps: AzureDevOpsClientDeps) {}

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const token = await this.deps.getToken();
    const response = await this.deps.fetchImpl(url, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Azure DevOps request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  async listOrganizations(): Promise<AzureDevOpsOrg[]> {
    const profile = await this.request<{ id: string }>(
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1',
    );
    const accounts = await this.request<{ value: { accountId: string; accountName: string }[] }>(
      `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${profile.id}&api-version=7.1`,
    );
    return accounts.value.map(a => ({ id: a.accountId, name: a.accountName }));
  }

  async listProjects(organization: string): Promise<AzureDevOpsProject[]> {
    const data = await this.request<{ value: { id: string; name: string }[] }>(
      `https://dev.azure.com/${organization}/_apis/projects?api-version=7.1`,
    );
    return data.value.map(p => ({ id: p.id, name: p.name }));
  }

  async searchWorkItems(organization: string, project: string, searchText: string): Promise<number[]> {
    const query = buildSearchQuery(searchText);
    const data = await this.request<{ workItems: { id: number }[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/wiql?api-version=7.1`,
      { method: 'POST', body: JSON.stringify({ query }) },
    );
    return data.workItems.map(w => w.id);
  }

  async getWorkItems(organization: string, project: string, ids: number[]): Promise<WorkItem[]> {
    if (ids.length === 0) {
      return [];
    }
    const data = await this.request<{ value: Parameters<typeof mapWorkItem>[0][] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=relations&api-version=7.1`,
    );
    return data.value.map(raw => mapWorkItem(raw, organization, project));
  }

  async getChildren(organization: string, project: string, workItem: WorkItem): Promise<WorkItem[]> {
    return this.getWorkItems(organization, project, workItem.childIds);
  }
}
