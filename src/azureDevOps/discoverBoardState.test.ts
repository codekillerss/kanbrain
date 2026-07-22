import { describe, it, expect, vi } from 'vitest';
import { discoverBoardState } from './discoverBoardState';
import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';

function stubClient(overrides: Partial<{
  getDefaultTeamName: () => Promise<string>;
  listBacklogLevels: () => Promise<{ name: string; workItemTypes: string[] }[]>;
  listWorkItemTypeStates: () => Promise<{ name: string; category: string; color: string }[]>;
  getWorkItemTypeIcon: () => Promise<{ color: string; iconSvg: string } | null>;
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, CardFieldSettings>>;
}> = {}): AzureDevOpsClient {
  return {
    getDefaultTeamName: vi.fn().mockResolvedValue('MyProject Team'),
    listBacklogLevels: vi.fn().mockResolvedValue([{ name: 'Tasks', workItemTypes: ['Task'] }]),
    listWorkItemTypeStates: vi.fn().mockResolvedValue([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]),
    getWorkItemTypeIcon: vi.fn().mockResolvedValue({ color: 'f2cb1d', iconSvg: '<svg></svg>' }),
    listBoards: vi.fn().mockResolvedValue([{ id: 'b1', name: 'Tasks' }]),
    getCardSettings: vi.fn().mockResolvedValue({ Task: { parent: true, assignedTo: true } }),
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

  it('fetches card settings per board, keyed by board name', async () => {
    const client = stubClient();
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.cardSettingsByBoard).toEqual({ Tasks: { Task: { parent: true, assignedTo: true } } });
  });

  it('continues with an empty cardSettingsByBoard when fetching it fails for every board', async () => {
    const client = stubClient({ getCardSettings: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.cardSettingsByBoard).toEqual({});
  });
});
