import { describe, it, expect, vi } from 'vitest';
import { discoverWorkItemTypes, discoverStatusesByType, discoverStatusColors, type DiscoveredWorkItemType } from './discoverWorkItemTypes';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  listWorkItemTypes: () => Promise<{ name: string; color: string; iconUrl: string }[]>;
  listWorkItemTypeStates: () => Promise<{ name: string; category: string; color: string }[]>;
  getIconSvg: () => Promise<string>;
}> = {}): AzureDevOpsClient {
  return {
    listWorkItemTypes: vi.fn().mockResolvedValue([{ name: 'Task', color: 'f2cb1d', iconUrl: 'https://example.com/icon' }]),
    listWorkItemTypeStates: vi.fn().mockResolvedValue([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]),
    getIconSvg: vi.fn().mockResolvedValue('<svg></svg>'),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverWorkItemTypes', () => {
  it('fetches states and the icon svg for every discovered type', async () => {
    const client = stubClient();
    const result = await discoverWorkItemTypes(client, 'my-org', 'MyProject');

    expect(result).toEqual([
      { name: 'Task', color: 'f2cb1d', iconSvg: '<svg></svg>', states: [{ name: 'New', category: 'Proposed', color: 'b2b2b2' }] },
    ]);
  });

  it('continues without a type when fetching its states fails', async () => {
    const client = stubClient({ listWorkItemTypeStates: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverWorkItemTypes(client, 'my-org', 'MyProject');

    expect(result).toEqual([]);
  });

  it('continues without a type when fetching its icon svg fails', async () => {
    const client = stubClient({ getIconSvg: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverWorkItemTypes(client, 'my-org', 'MyProject');

    expect(result).toEqual([]);
  });
});

describe('discoverStatusesByType', () => {
  const types: DiscoveredWorkItemType[] = [
    {
      name: 'Task',
      color: 'f2cb1d',
      iconSvg: '<svg></svg>',
      states: [
        { name: 'To Do', category: 'Proposed', color: 'b2b2b2' },
        { name: 'Done', category: 'Completed', color: '339933' },
      ],
    },
    { name: 'Epic', color: 'ff7b00', iconSvg: '<svg></svg>', states: [] },
  ];

  it('maps each type to its status → category record', () => {
    expect(discoverStatusesByType(types)).toEqual({
      Task: { 'To Do': 'Proposed', Done: 'Completed' },
    });
  });

  it('omits a type with no states at all', () => {
    expect(discoverStatusesByType(types).Epic).toBeUndefined();
  });
});

describe('discoverStatusColors', () => {
  it('maps each status name to its color, merging across types and keeping the first-seen color on conflict', () => {
    const types: DiscoveredWorkItemType[] = [
      { name: 'Task', color: 'f2cb1d', iconSvg: '', states: [{ name: 'New', category: 'Proposed', color: '111111' }] },
      { name: 'Bug', color: 'cc293d', iconSvg: '', states: [{ name: 'New', category: 'Proposed', color: '222222' }] },
    ];

    expect(discoverStatusColors(types)).toEqual({ New: '111111' });
  });
});
