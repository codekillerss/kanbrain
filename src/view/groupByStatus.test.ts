import { describe, it, expect } from 'vitest';
import { groupByStatus } from './groupByStatus';
import type { WorkItem } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'T',
    description: '',
    status: 'Active',
    type: 'Task',
    url: '',
    parentId: null,
    childIds: [],
    assignedTo: null,
    development: [],
    ...overrides,
  };
}

describe('groupByStatus', () => {
  it('groups items under their status, preserving first-seen status order', () => {
    const items = [
      workItem({ id: 1, status: 'Active' }),
      workItem({ id: 2, status: 'New' }),
      workItem({ id: 3, status: 'Active' }),
    ];

    expect(groupByStatus(items)).toEqual([
      { status: 'Active', items: [items[0], items[2]] },
      { status: 'New', items: [items[1]] },
    ]);
  });

  it('returns an empty array for an empty list', () => {
    expect(groupByStatus([])).toEqual([]);
  });
});
