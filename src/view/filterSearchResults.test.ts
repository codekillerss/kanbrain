import { describe, it, expect } from 'vitest';
import { filterSearchResults } from './filterSearchResults';
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
    ...overrides,
  };
}

describe('filterSearchResults', () => {
  it('keeps items whose id contains the digits when the query is numeric', () => {
    const items = [workItem({ id: 88 }), workItem({ id: 880 }), workItem({ id: 199 })];

    expect(filterSearchResults(items, '88')).toEqual([items[0], items[1]]);
  });

  it('returns items unchanged when the query is not purely numeric', () => {
    const items = [workItem({ id: 88 }), workItem({ id: 880 })];

    expect(filterSearchResults(items, 'login bug')).toEqual(items);
  });

  it('returns items unchanged when the query is empty', () => {
    const items = [workItem({ id: 88 })];

    expect(filterSearchResults(items, '')).toEqual(items);
  });
});
