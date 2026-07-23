import { describe, it, expect, vi } from 'vitest';
import { discoverTaskBacklogTypesByTeam } from './discoverTaskBacklogTypes';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  listTeams: () => Promise<{ id: string; name: string }[]>;
  getTaskBacklogWorkItemTypes: () => Promise<string[]>;
}> = {}): AzureDevOpsClient {
  return {
    listTeams: vi.fn().mockResolvedValue([]),
    getTaskBacklogWorkItemTypes: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverTaskBacklogTypesByTeam', () => {
  it('collects task backlog types for every team in the project', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Team 1' },
        { id: 't2', name: 'Team 2' },
      ]),
      getTaskBacklogWorkItemTypes: vi.fn().mockResolvedValueOnce(['Task']).mockResolvedValueOnce(['Task', 'Bug']),
    });

    const result = await discoverTaskBacklogTypesByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({ 'Team 1': ['Task'], 'Team 2': ['Task', 'Bug'] });
  });

  it('skips a team whose task backlog fails to load, without aborting the others', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Team 1' },
        { id: 't2', name: 'Team 2' },
      ]),
      getTaskBacklogWorkItemTypes: vi.fn().mockRejectedValueOnce(new Error('no access')).mockResolvedValueOnce(['Task']),
    });

    const result = await discoverTaskBacklogTypesByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({ 'Team 2': ['Task'] });
  });

  it('returns an empty object when the project has no teams', async () => {
    const client = stubClient({ listTeams: vi.fn().mockResolvedValue([]) });

    const result = await discoverTaskBacklogTypesByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({});
  });
});
