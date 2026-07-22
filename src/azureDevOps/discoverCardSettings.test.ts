import { describe, it, expect, vi } from 'vitest';
import { discoverCardSettingsByBoard } from './discoverCardSettings';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, boolean>>;
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
        .mockResolvedValueOnce({ 'User Story': true })
        .mockResolvedValueOnce({ Feature: false }),
    });

    const result = await discoverCardSettingsByBoard(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(result).toEqual({ Stories: { 'User Story': true }, Features: { Feature: false } });
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
        .mockResolvedValueOnce({ Feature: true }),
    });

    const result = await discoverCardSettingsByBoard(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(result).toEqual({ Features: { Feature: true } });
  });

  it('returns an empty object when the team has no boards', async () => {
    const client = stubClient({ listBoards: vi.fn().mockResolvedValue([]) });

    const result = await discoverCardSettingsByBoard(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(result).toEqual({});
  });
});
