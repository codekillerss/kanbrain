import { describe, it, expect, vi } from 'vitest';
import { discoverBoardState } from './discoverBoardState';
import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';

function stubClient(overrides: Partial<{
  getDefaultTeamName: () => Promise<string>;
  listWorkItemTypes: () => Promise<{ name: string; color: string; iconUrl: string }[]>;
  listWorkItemTypeStates: () => Promise<{ name: string; category: string; color: string }[]>;
  getIconSvg: () => Promise<string>;
  listTeams: () => Promise<{ id: string; name: string }[]>;
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, CardFieldSettings>>;
}> = {}): AzureDevOpsClient {
  return {
    getDefaultTeamName: vi.fn().mockResolvedValue('MyProject Team'),
    listWorkItemTypes: vi.fn().mockResolvedValue([{ name: 'Task', color: 'f2cb1d', iconUrl: 'https://example.com/icon' }]),
    listWorkItemTypeStates: vi.fn().mockResolvedValue([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]),
    getIconSvg: vi.fn().mockResolvedValue('<svg></svg>'),
    listTeams: vi.fn().mockResolvedValue([{ id: 't1', name: 'MyProject Team' }]),
    listBoards: vi.fn().mockResolvedValue([{ id: 'b1', name: 'Tasks' }]),
    getCardSettings: vi.fn().mockResolvedValue({ Task: { parent: true, assignedTo: true } }),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverBoardState', () => {
  it('fetches the default team, statuses by type, and type colors/icons', async () => {
    const client = stubClient();
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.defaultTeam).toBe('MyProject Team');
    expect(result.discoveredStatusesByType.Task).toEqual({ New: 'Proposed' });
    expect(result.typeColors.Task).toBe('f2cb1d');
    expect(result.typeIcons.Task).toBe('<svg></svg>');
  });

  it('continues without a type when discovery fails for it', async () => {
    const client = stubClient({ listWorkItemTypeStates: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.discoveredStatusesByType.Task).toBeUndefined();
    expect(result.typeColors.Task).toBeUndefined();
  });

  it('fetches card settings for every team, keyed by team then board', async () => {
    const client = stubClient();
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.cardSettingsByTeam).toEqual({ 'MyProject Team': { Tasks: { Task: { parent: true, assignedTo: true } } } });
  });

  it('continues with an empty cardSettingsByTeam when the project has no teams', async () => {
    const client = stubClient({ listTeams: vi.fn().mockResolvedValue([]) });
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.cardSettingsByTeam).toEqual({});
  });

  it('excludes work item types that are not on any team board from discoveredStatusesByType, typeColors, and typeIcons', async () => {
    const client = stubClient({
      listWorkItemTypes: vi.fn().mockResolvedValue([
        { name: 'Task', color: 'f2cb1d', iconUrl: 'https://example.com/task-icon' },
        { name: 'Impediment', color: 'cc0000', iconUrl: 'https://example.com/impediment-icon' },
      ]),
      listWorkItemTypeStates: vi
        .fn()
        .mockImplementation(async (_org: string, _proj: string, type: string) =>
          type === 'Task' ? [{ name: 'New', category: 'Proposed', color: 'b2b2b2' }] : [{ name: 'Open', category: 'Proposed', color: 'b2b2b2' }],
        ),
      // getCardSettings only ever reports "Task" as a field on the one real board, never "Impediment".
      getCardSettings: vi.fn().mockResolvedValue({ Task: { parent: true, assignedTo: true } }),
    });

    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.discoveredStatusesByType.Task).toEqual({ New: 'Proposed' });
    expect(result.discoveredStatusesByType.Impediment).toBeUndefined();
    expect(result.typeColors.Impediment).toBeUndefined();
    expect(result.typeIcons.Impediment).toBeUndefined();
  });
});
