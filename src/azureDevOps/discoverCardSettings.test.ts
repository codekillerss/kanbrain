import { describe, it, expect, vi } from 'vitest';
import { discoverCardSettingsByBoard } from './discoverCardSettings';
import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';

function stubClient(overrides: Partial<{
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, CardFieldSettings>>;
}> = {}): AzureDevOpsClient {
  return {
    listBoards: vi.fn().mockResolvedValue([]),
    getCardSettings: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverCardSettingsByBoard', () => {
  it('collects card settings for every board, keyed by board name', async () => {
    const client = stubClient({
      listBoards: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Stories' },
        { id: 'b2', name: 'Features' },
      ]),
      getCardSettings: vi
        .fn()
        .mockResolvedValueOnce({ 'User Story': { parent: true, assignedTo: true } })
        .mockResolvedValueOnce({ Feature: { parent: false, assignedTo: true } }),
    });

    const result = await discoverCardSettingsByBoard(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(result).toEqual({
      Stories: { 'User Story': { parent: true, assignedTo: true } },
      Features: { Feature: { parent: false, assignedTo: true } },
    });
  });

  it('skips a board whose card settings fail to load, without aborting the others', async () => {
    const client = stubClient({
      listBoards: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Stories' },
        { id: 'b2', name: 'Features' },
      ]),
      getCardSettings: vi
        .fn()
        .mockRejectedValueOnce(new Error('no access'))
        .mockResolvedValueOnce({ Feature: { parent: true, assignedTo: false } }),
    });

    const result = await discoverCardSettingsByBoard(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(result).toEqual({ Features: { Feature: { parent: true, assignedTo: false } } });
  });

  it('returns an empty object when the team has no boards', async () => {
    const client = stubClient({ listBoards: vi.fn().mockResolvedValue([]) });

    const result = await discoverCardSettingsByBoard(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(result).toEqual({});
  });
});
