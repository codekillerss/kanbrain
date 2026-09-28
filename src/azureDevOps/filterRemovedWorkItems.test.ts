import { describe, it, expect } from 'vitest';
import { filterOutRemoved, isCompleted } from './filterRemovedWorkItems';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'Some item',
    description: '',
    status: 'To Do',
    type: 'Task',
    url: '',
    parentId: null,
    childIds: [],
    assignedTo: null,
    development: [],
    ...overrides,
  };
}

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('filterOutRemoved', () => {
  it('drops a work item whose status category is Removed', () => {
    const items = [workItem({ id: 1, status: 'Cancelled' }), workItem({ id: 2, status: 'To Do' })];
    const cfg = config({ statusCategoriesByType: { Task: { Cancelled: 'Removed', 'To Do': 'Proposed' } } });

    expect(filterOutRemoved(items, cfg).map(i => i.id)).toEqual([2]);
  });

  it('keeps a work item whose status category is not Removed', () => {
    const items = [workItem({ id: 1, status: 'Done' })];
    const cfg = config({ statusCategoriesByType: { Task: { Done: 'Completed' } } });

    expect(filterOutRemoved(items, cfg).map(i => i.id)).toEqual([1]);
  });

  it('falls back to matching the status name "Removed" when no category data exists for that type/status', () => {
    const items = [workItem({ id: 1, status: 'Removed' }), workItem({ id: 2, status: 'To Do' })];
    const cfg = config({ statusCategoriesByType: {} });

    expect(filterOutRemoved(items, cfg).map(i => i.id)).toEqual([2]);
  });

  it('falls back safely when statusCategoriesByType is entirely absent from the config', () => {
    const items = [workItem({ id: 1, status: 'Removed' }), workItem({ id: 2, status: 'To Do' })];
    const cfg = config();

    expect(filterOutRemoved(items, cfg).map(i => i.id)).toEqual([2]);
  });
});

describe('isCompleted', () => {
  it('is true when the status category is Completed, whatever the status is called', () => {
    const cfg = config({ statusCategoriesByType: { Task: { Shipped: 'Completed' } } });
    expect(isCompleted(workItem({ status: 'Shipped' }), cfg)).toBe(true);
  });

  it('is false for any other category, including Resolved', () => {
    const cfg = config({ statusCategoriesByType: { Task: { Resolved: 'Resolved', Doing: 'InProgress' } } });
    expect(isCompleted(workItem({ status: 'Resolved' }), cfg)).toBe(false);
    expect(isCompleted(workItem({ status: 'Doing' }), cfg)).toBe(false);
  });

  it('is false when the category is unknown, without guessing from the status name', () => {
    expect(isCompleted(workItem({ status: 'Done' }), config())).toBe(false);
  });
});
