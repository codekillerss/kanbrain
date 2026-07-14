import type { WorkItem } from '../types';
import { buildSearchQuery } from './wiql';
import { mapWorkItem } from './mapWorkItem';
import type { BacklogLevel, WorkItemTypeState } from './backlogLevels';

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

  async getDefaultTeamName(organization: string, project: string): Promise<string> {
    const data = await this.request<{ defaultTeam?: { name: string } }>(
      `https://dev.azure.com/${organization}/_apis/projects/${project}?api-version=7.1`,
    );
    if (!data.defaultTeam) {
      throw new Error(`O projeto ${project} não tem um time padrão configurado.`);
    }
    return data.defaultTeam.name;
  }

  async listBacklogLevels(organization: string, project: string, team: string): Promise<BacklogLevel[]> {
    const data = await this.request<{
      value: { name: string; isHidden?: boolean; workItemTypes?: { name: string }[] }[];
    }>(`https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/backlogs?api-version=7.1`);
    return data.value
      .filter(level => !level.isHidden && (level.workItemTypes?.length ?? 0) > 0)
      .map(level => ({ name: level.name, workItemTypes: (level.workItemTypes ?? []).map(t => t.name) }));
  }

  async listWorkItemTypeStates(organization: string, project: string, type: string): Promise<WorkItemTypeState[]> {
    const data = await this.request<{ value: { name: string; category: string }[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?api-version=7.1`,
    );
    return data.value.map(s => ({ name: s.name, category: s.category }));
  }
}
