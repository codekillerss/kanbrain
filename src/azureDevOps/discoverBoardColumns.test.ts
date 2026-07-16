import { describe, it, expect, vi } from 'vitest';
import { discoverBoardColumns } from './discoverBoardColumns';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  listBoards: () => Promise<{ id: string; name: string }[]>;
  listBoardColumns: () => Promise<{ name: string; columnType: string; stateMappings: Record<string, string> }[]>;
}> = {}): AzureDevOpsClient {
  return {
    listBoards: vi.fn().mockResolvedValue([]),
    listBoardColumns: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverBoardColumns', () => {
  it('lists every board with its columns', async () => {
    const client = stubClient({
      listBoards: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Board One' },
        { id: 'b2', name: 'Board Two' },
      ]),
      listBoardColumns: vi
        .fn()
        .mockResolvedValueOnce([{ name: 'To Do', columnType: 'incoming', stateMappings: { Task: 'New' } }])
        .mockResolvedValueOnce([{ name: 'Done', columnType: 'outgoing', stateMappings: { Task: 'Closed' } }]),
    });

    const boards = await discoverBoardColumns(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(boards).toEqual([
      { name: 'Board One', columns: [{ name: 'To Do', columnType: 'incoming', stateMappings: { Task: 'New' } }] },
      { name: 'Board Two', columns: [{ name: 'Done', columnType: 'outgoing', stateMappings: { Task: 'Closed' } }] },
    ]);
  });

  it('skips a board whose columns fail to load, without aborting the others', async () => {
    const client = stubClient({
      listBoards: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Board One' },
        { id: 'b2', name: 'Board Two' },
      ]),
      listBoardColumns: vi
        .fn()
        .mockRejectedValueOnce(new Error('no access'))
        .mockResolvedValueOnce([{ name: 'Done', columnType: 'outgoing', stateMappings: {} }]),
    });

    const boards = await discoverBoardColumns(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(boards).toEqual([{ name: 'Board Two', columns: [{ name: 'Done', columnType: 'outgoing', stateMappings: {} }] }]);
  });

  it('returns an empty array when the team has no boards', async () => {
    const client = stubClient({ listBoards: vi.fn().mockResolvedValue([]) });

    const boards = await discoverBoardColumns(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(boards).toEqual([]);
  });
});
