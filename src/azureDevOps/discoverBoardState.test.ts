import { describe, it, expect, vi } from 'vitest';
import { discoverBoardState } from './discoverBoardState';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  getDefaultTeamName: () => Promise<string>;
  listBacklogLevels: () => Promise<{ name: string; workItemTypes: string[] }[]>;
  listWorkItemTypeStates: () => Promise<{ name: string; category: string; color: string }[]>;
  getWorkItemTypeIcon: () => Promise<{ color: string; iconSvg: string } | null>;
}> = {}): AzureDevOpsClient {
  return {
    getDefaultTeamName: vi.fn().mockResolvedValue('MyProject Team'),
    listBacklogLevels: vi.fn().mockResolvedValue([{ name: 'Tasks', workItemTypes: ['Task'] }]),
    listWorkItemTypeStates: vi.fn().mockResolvedValue([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]),
    getWorkItemTypeIcon: vi.fn().mockResolvedValue({ color: 'f2cb1d', iconSvg: '<svg></svg>' }),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverBoardState', () => {
  it('fetches team, backlog levels, states, and icons for every discovered type', async () => {
    const client = stubClient();
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.levels).toEqual([{ name: 'Tasks', workItemTypes: ['Task'] }]);
    expect(result.statesByType.Task).toEqual([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]);
    expect(result.typeColors.Task).toBe('f2cb1d');
    expect(result.typeIcons.Task).toBe('<svg></svg>');
  });

  it('continues without a type when fetching its states fails', async () => {
    const client = stubClient({ listWorkItemTypeStates: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.statesByType.Task).toBeUndefined();
  });

  it('continues without a type when fetching its icon fails', async () => {
    const client = stubClient({ getWorkItemTypeIcon: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.typeColors.Task).toBeUndefined();
    expect(result.typeIcons.Task).toBeUndefined();
  });
});
