import type { AssignedTo, WorkItem } from '../types';
import { buildSearchQuery, buildTypeCountQuery } from './wiql';
import { mapWorkItem } from './mapWorkItem';
import type { BacklogLevel, WorkItemTypeState, WorkItemTypeIcon } from './backlogLevels';
import type { WorkItemTypeLayout, WorkItemComment } from './workItemDetail';

export interface AzureDevOpsClientDeps {
  fetchImpl: typeof fetch;
  getToken: () => Promise<string>;
}

export class AzureDevOpsHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AzureDevOpsHttpError';
  }
}

export interface AzureDevOpsOrg {
  id: string;
  name: string;
}

export interface AzureDevOpsProject {
  id: string;
  name: string;
}

export interface AzureDevOpsBoard {
  id: string;
  name: string;
}

export interface BoardColumn {
  name: string;
  columnType: string;
  stateMappings: Record<string, string>;
}

interface RawIdentityRef {
  displayName?: string;
  imageUrl?: string;
  _links?: { avatar?: { href?: string } };
}

function mapIdentityRef(raw: unknown): AssignedTo {
  const identity = raw as RawIdentityRef | undefined;
  const imageUrl = identity?.imageUrl ?? identity?._links?.avatar?.href ?? null;
  return { displayName: identity?.displayName ?? 'Unknown', imageUrl };
}

const PARENT_FIELD_IDENTIFIERS = new Set(['System.Parent', 'Parent']);

export class AzureDevOpsClient {
  constructor(private readonly deps: AzureDevOpsClientDeps) {}

  private async fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
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
      let body = '';
      try {
        body = await response.text();
      } catch {
        body = '';
      }
      throw new AzureDevOpsHttpError(
        response.status,
        `Azure DevOps request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
      );
    }
    return response;
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchWithAuth(url, init);
    return (await response.json()) as T;
  }

  private async requestText(url: string, init?: RequestInit): Promise<string> {
    const response = await this.fetchWithAuth(url, init);
    return response.text();
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
      `https://dev.azure.com/${organization}/${project}/_apis/wit/wiql?api-version=7.1&$top=50`,
      { method: 'POST', body: JSON.stringify({ query }) },
    );
    return data.workItems.map(w => w.id);
  }

  async countWorkItemsByType(organization: string, project: string, types: string[]): Promise<number> {
    if (types.length === 0) {
      return 0;
    }
    const query = buildTypeCountQuery(types);
    const data = await this.request<{ workItems: { id: number }[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/wiql?api-version=7.1`,
      { method: 'POST', body: JSON.stringify({ query }) },
    );
    return data.workItems.length;
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

  async getAvatarDataUri(url: string): Promise<string | null> {
    try {
      const response = await this.fetchWithAuth(url);
      const contentType = response.headers.get('content-type') ?? 'image/png';
      const buffer = Buffer.from(await response.arrayBuffer());
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }

  async getWorkItemTypeLayout(organization: string, project: string, type: string): Promise<WorkItemTypeLayout | null> {
    try {
      return await this.request<WorkItemTypeLayout>(
        `https://dev.azure.com/${organization}/${project}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/layout?api-version=7.1-preview.1`,
      );
    } catch {
      return null;
    }
  }

  async getWorkItemRawFields(organization: string, project: string, id: number): Promise<Record<string, unknown>> {
    const data = await this.request<{ fields: Record<string, unknown> }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${id}?api-version=7.1`,
    );
    return data.fields ?? {};
  }

  async getComments(organization: string, project: string, id: number): Promise<WorkItemComment[]> {
    interface RawComment {
      id: number;
      text?: string;
      createdBy?: unknown;
      createdDate: string;
    }
    const data = await this.request<{ comments?: RawComment[]; value?: RawComment[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workItems/${id}/comments?api-version=7.1-preview.3`,
    );
    const list = data.comments ?? data.value ?? [];
    return list
      .map(c => ({ id: c.id, text: c.text ?? '', createdBy: mapIdentityRef(c.createdBy), createdDate: c.createdDate }))
      .sort((a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime());
  }

  async getDefaultTeamName(organization: string, project: string): Promise<string> {
    const data = await this.request<{ defaultTeam?: { name: string } }>(
      `https://dev.azure.com/${organization}/_apis/projects/${project}?api-version=7.1`,
    );
    if (!data.defaultTeam) {
      throw new Error(`The ${project} project has no default team configured.`);
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
    const data = await this.request<{ value: { name: string; category: string; color: string }[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?api-version=7.1`,
    );
    return data.value.map(s => ({ name: s.name, category: s.category, color: s.color }));
  }

  async getWorkItemTypeIcon(organization: string, project: string, type: string): Promise<WorkItemTypeIcon | null> {
    const typeInfo = await this.request<{ color?: string; icon?: { url: string } }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitemtypes/${encodeURIComponent(type)}?api-version=7.1`,
    );
    if (!typeInfo.icon?.url) {
      return null;
    }
    const iconSvg = await this.requestText(typeInfo.icon.url);
    return { color: typeInfo.color ?? '', iconSvg };
  }

  async listBoards(organization: string, project: string, team: string): Promise<AzureDevOpsBoard[]> {
    const data = await this.request<{ value: { id: string; name: string }[] }>(
      `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/boards?api-version=7.1`,
    );
    return data.value.map(b => ({ id: b.id, name: b.name }));
  }

  async listBoardColumns(organization: string, project: string, team: string, boardId: string): Promise<BoardColumn[]> {
    const data = await this.request<{ value: { name: string; columnType: string; stateMappings: Record<string, string> }[] }>(
      `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/boards/${encodeURIComponent(boardId)}/columns?api-version=7.1`,
    );
    return data.value.map(c => ({ name: c.name, columnType: c.columnType, stateMappings: c.stateMappings }));
  }

  async getCardSettings(organization: string, project: string, team: string, boardId: string): Promise<Record<string, boolean>> {
    const data = await this.request<{ cards?: Record<string, { fieldIdentifier?: string }[]> }>(
      `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/boards/${encodeURIComponent(boardId)}/cardsettings?api-version=7.1`,
    );
    const cards = data.cards ?? {};
    const result: Record<string, boolean> = {};
    for (const [type, fields] of Object.entries(cards)) {
      result[type] = (fields ?? []).some(f => !!f.fieldIdentifier && PARENT_FIELD_IDENTIFIERS.has(f.fieldIdentifier));
    }
    return result;
  }
}
