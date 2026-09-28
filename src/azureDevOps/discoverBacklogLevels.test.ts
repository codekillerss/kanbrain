import { describe, it, expect, vi } from 'vitest';
import { discoverBacklogLevelsByTeam } from './discoverBacklogLevels';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  listTeams: () => Promise<{ id: string; name: string }[]>;
  getBacklogLevels: () => Promise<Record<string, number>>;
}> = {}): AzureDevOpsClient {
  return {
    listTeams: vi.fn().mockResolvedValue([]),
    getBacklogLevels: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverBacklogLevelsByTeam', () => {
  it('collects backlog levels for every team in the project', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Team 1' },
        { id: 't2', name: 'Team 2' },
      ]),
      getBacklogLevels: vi.fn().mockResolvedValueOnce({ Task: 0, Bug: 1 }).mockResolvedValueOnce({ Task: 0, Bug: 0 }),
    });

    const result = await discoverBacklogLevelsByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({ 'Team 1': { Task: 0, Bug: 1 }, 'Team 2': { Task: 0, Bug: 0 } });
  });

  it('skips a team whose backlog levels fail to load, without aborting the others', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Team 1' },
        { id: 't2', name: 'Team 2' },
      ]),
      getBacklogLevels: vi.fn().mockRejectedValueOnce(new Error('no access')).mockResolvedValueOnce({ Task: 0 }),
    });

    const result = await discoverBacklogLevelsByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({ 'Team 2': { Task: 0 } });
  });
});
