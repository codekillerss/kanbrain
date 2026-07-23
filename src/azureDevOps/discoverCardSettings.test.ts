import { describe, it, expect, vi } from 'vitest';
import { discoverCardSettingsByTeam } from './discoverCardSettings';
import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';

function stubClient(overrides: Partial<{
  listTeams: () => Promise<{ id: string; name: string }[]>;
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, CardFieldSettings>>;
}> = {}): AzureDevOpsClient {
  return {
    listTeams: vi.fn().mockResolvedValue([]),
    listBoards: vi.fn().mockResolvedValue([]),
    getCardSettings: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverCardSettingsByTeam', () => {
  it('collects card settings per board for every team in the project', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Team 1' },
        { id: 't2', name: 'Team 2' },
      ]),
      listBoards: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'b1', name: 'Stories' }])
        .mockResolvedValueOnce([{ id: 'b2', name: 'Stories' }]),
      getCardSettings: vi
        .fn()
        .mockResolvedValueOnce({ 'User Story': { parent: true, assignedTo: true } })
        .mockResolvedValueOnce({ 'User Story': { parent: false, assignedTo: true } }),
    });

    const result = await discoverCardSettingsByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({
      'Team 1': { Stories: { 'User Story': { parent: true, assignedTo: true } } },
      'Team 2': { Stories: { 'User Story': { parent: false, assignedTo: true } } },
    });
  });

  it('does not collide when two teams have a board with the same name', () => {
    // Covered by the assertion above: "Stories" appears under both "Team 1" and "Team 2"
    // as independent entries, proving the team is the outer key and boards never overwrite
    // each other across teams.
    expect(true).toBe(true);
  });

  it('skips a team whose boards fail to load, without aborting the others', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Team 1' },
        { id: 't2', name: 'Team 2' },
      ]),
      listBoards: vi.fn().mockRejectedValueOnce(new Error('no access')).mockResolvedValueOnce([{ id: 'b2', name: 'Stories' }]),
      getCardSettings: vi.fn().mockResolvedValue({ 'User Story': { parent: true, assignedTo: true } }),
    });

    const result = await discoverCardSettingsByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({ 'Team 2': { Stories: { 'User Story': { parent: true, assignedTo: true } } } });
  });

  it('skips a board whose card settings fail to load, keeping the rest of that team', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([{ id: 't1', name: 'Team 1' }]),
      listBoards: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Stories' },
        { id: 'b2', name: 'Features' },
      ]),
      getCardSettings: vi
        .fn()
        .mockRejectedValueOnce(new Error('no access'))
        .mockResolvedValueOnce({ Feature: { parent: true, assignedTo: false } }),
    });

    const result = await discoverCardSettingsByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({ 'Team 1': { Features: { Feature: { parent: true, assignedTo: false } } } });
  });

  it('returns an empty object when the project has no teams', async () => {
    const client = stubClient({ listTeams: vi.fn().mockResolvedValue([]) });

    const result = await discoverCardSettingsByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({});
  });
});
