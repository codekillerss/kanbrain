import { describe, it, expect, vi } from 'vitest';
import { AzureDevOpsClient } from './client';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => body } as Response;
}

describe('AzureDevOpsClient', () => {
  it('lists organizations for the current user', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'user-1' }))
      .mockResolvedValueOnce(jsonResponse({ value: [{ accountId: 'a1', accountName: 'my-org' }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const orgs = await client.listOrganizations();

    expect(orgs).toEqual([{ id: 'a1', name: 'my-org' }]);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://app.vssps.visualstudio.com/_apis/accounts?memberId=user-1&api-version=7.1',
      expect.anything(),
    );
  });

  it('lists projects for an organization', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ value: [{ id: 'p1', name: 'MyProject' }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const projects = await client.listProjects('my-org');

    expect(projects).toEqual([{ id: 'p1', name: 'MyProject' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/projects?api-version=7.1',
      expect.anything(),
    );
  });

  it('searches work items and returns matched IDs', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ workItems: [{ id: 1 }, { id: 2 }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const ids = await client.searchWorkItems('my-org', 'MyProject', 'login');

    expect(ids).toEqual([1, 2]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/wiql?api-version=7.1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns an empty array from getWorkItems without calling fetch when ids is empty', async () => {
    const fetchImpl = vi.fn();
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const items = await client.getWorkItems('my-org', 'MyProject', []);

    expect(items).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches and maps work items by id', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: 482, fields: { 'System.Title': 'Bug', 'System.State': 'Active', 'System.WorkItemType': 'Task' }, relations: [] },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const items = await client.getWorkItems('my-org', 'MyProject', [482]);

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(482);
    expect(items[0].title).toBe('Bug');
  });

  it('throws when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}, false, 401));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    await expect(client.listProjects('my-org')).rejects.toThrow(/401/);
  });

  it('getChildren fetches work items for a parent childIds', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [{ id: 101, fields: { 'System.Title': 'Sub', 'System.State': 'New', 'System.WorkItemType': 'Task' }, relations: [] }],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });
    const parent = { id: 90, title: 'P', description: '', status: 'Active', type: 'Story', url: '', parentId: null, childIds: [101] };

    const children = await client.getChildren('my-org', 'MyProject', parent);

    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(101);
  });

  it('lists backlog levels for a team, skipping hidden ones and ones without work item types', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { name: 'Epics', isHidden: false, workItemTypes: [{ name: 'Epic' }] },
          { name: 'Stories', isHidden: false, workItemTypes: [{ name: 'User Story' }, { name: 'Bug' }] },
          { name: 'Hidden Level', isHidden: true, workItemTypes: [{ name: 'Ghost' }] },
          { name: 'Empty Level', isHidden: false, workItemTypes: [] },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const levels = await client.listBacklogLevels('my-org', 'MyProject', 'MyProject Team');

    expect(levels).toEqual([
      { name: 'Epics', workItemTypes: ['Epic'] },
      { name: 'Stories', workItemTypes: ['User Story', 'Bug'] },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/MyProject%20Team/_apis/work/backlogs?api-version=7.1',
      expect.anything(),
    );
  });

  it("gets the project's default team name", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ id: 'p1', name: 'MyProject', defaultTeam: { id: 't1', name: 'MyProject Team' } }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const team = await client.getDefaultTeamName('my-org', 'MyProject');

    expect(team).toBe('MyProject Team');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/projects/MyProject?api-version=7.1',
      expect.anything(),
    );
  });

  it('lists states for a work item type', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ value: [{ name: 'New', category: 'Proposed' }, { name: 'Done', category: 'Completed' }] }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const states = await client.listWorkItemTypeStates('my-org', 'MyProject', 'User Story');

    expect(states).toEqual([
      { name: 'New', category: 'Proposed' },
      { name: 'Done', category: 'Completed' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workitemtypes/User%20Story/states?api-version=7.1',
      expect.anything(),
    );
  });
});
