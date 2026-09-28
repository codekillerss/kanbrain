import { describe, it, expect } from 'vitest';
import { sortChildren, parseChildSortCriteria } from './sortChildren';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'Some item',
    description: '',
    status: 'New',
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
    defaultTeam: 'Team A',
    skills: {},
    workflowSteps: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

const categories = {
  Task: { New: 'Proposed', Active: 'InProgress', Resolved: 'Resolved', Closed: 'Completed' },
  'User Story': { New: 'Proposed', Active: 'InProgress', Resolved: 'Resolved', Closed: 'Completed' },
};

const ids = (items: WorkItem[]) => items.map(i => i.id);

describe('parseChildSortCriteria', () => {
  it('keeps known criteria in the given order', () => {
    expect(parseChildSortCriteria(['created', 'status'])).toEqual(['created', 'status']);
  });

  it('drops unknown values and duplicates', () => {
    expect(parseChildSortCriteria(['created', 'bogus', 42, 'created', 'status'])).toEqual(['created', 'status']);
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(parseChildSortCriteria('status')).toEqual([]);
    expect(parseChildSortCriteria(undefined)).toEqual([]);
  });
});

describe('sortChildren', () => {
  it('orders by state category along the lifecycle: Proposed, InProgress, Resolved, Completed', () => {
    const items = [
      workItem({ id: 1, status: 'Closed' }),
      workItem({ id: 2, status: 'Resolved' }),
      workItem({ id: 3, status: 'New' }),
      workItem({ id: 4, status: 'Active' }),
    ];

    expect(ids(sortChildren(items, config({ statusCategoriesByType: categories }), undefined))).toEqual([3, 4, 2, 1]);
  });

  it('within the same category, puts higher backlog levels first (e.g. User Story before Task)', () => {
    const items = [workItem({ id: 1, type: 'Task' }), workItem({ id: 2, type: 'User Story' })];
    const cfg = config({ statusCategoriesByType: categories, backlogLevelsByTeam: { 'Team A': { 'User Story': 1, Task: 0 } } });

    expect(ids(sortChildren(items, cfg, 'Team A'))).toEqual([2, 1]);
  });

  it('state category takes precedence over backlog level', () => {
    const items = [workItem({ id: 1, type: 'User Story', status: 'Closed' }), workItem({ id: 2, type: 'Task', status: 'New' })];
    const cfg = config({ statusCategoriesByType: categories, backlogLevelsByTeam: { 'Team A': { 'User Story': 1, Task: 0 } } });

    expect(ids(sortChildren(items, cfg, 'Team A'))).toEqual([2, 1]);
  });

  it('uses the selected team backlog levels, falling back to the default team', () => {
    const items = [workItem({ id: 1, type: 'Bug' }), workItem({ id: 2, type: 'Task' })];
    const cfg = config({
      backlogLevelsByTeam: { 'Team A': { Bug: 1, Task: 0 }, 'Team B': { Bug: 0, Task: 1 } },
    });

    expect(ids(sortChildren(items, cfg, 'Team B'))).toEqual([2, 1]);
    expect(ids(sortChildren(items, cfg, 'Unknown Team'))).toEqual([1, 2]);
    expect(ids(sortChildren(items, cfg, undefined))).toEqual([1, 2]);
  });

  it('within the same category and level, follows the backlog order ascending', () => {
    const items = [workItem({ id: 1, backlogOrder: 300 }), workItem({ id: 2, backlogOrder: 100 }), workItem({ id: 3, backlogOrder: 200 })];

    expect(ids(sortChildren(items, config(), undefined))).toEqual([2, 3, 1]);
  });

  it('puts items without a backlog order after the ranked ones', () => {
    const items = [workItem({ id: 1 }), workItem({ id: 2, backlogOrder: 500 })];

    expect(ids(sortChildren(items, config(), undefined))).toEqual([2, 1]);
  });

  it('breaks remaining ties by created date ascending, then keeps the API order', () => {
    const items = [
      workItem({ id: 3, createdDate: '2026-02-01T00:00:00Z' }),
      workItem({ id: 2, createdDate: '2026-01-01T00:00:00Z' }),
      workItem({ id: 1, createdDate: '2026-02-01T00:00:00Z' }),
    ];

    expect(ids(sortChildren(items, config(), undefined))).toEqual([2, 3, 1]);
  });

  it('ignores a criterion when its data is missing, instead of guessing', () => {
    // No categories/levels in the config: 'Closed' must not be pushed down by name, so only the
    // backlog order decides.
    const items = [workItem({ id: 1, status: 'Closed', backlogOrder: 1 }), workItem({ id: 2, status: 'New', backlogOrder: 2 })];

    expect(ids(sortChildren(items, config(), undefined))).toEqual([1, 2]);
  });

  it('keeps the API order when no criteria are selected', () => {
    const items = [workItem({ id: 3, backlogOrder: 1 }), workItem({ id: 1, backlogOrder: 3 }), workItem({ id: 2, backlogOrder: 2 })];

    expect(ids(sortChildren(items, config({ statusCategoriesByType: categories }), undefined, []))).toEqual([3, 1, 2]);
  });

  it('applies only the selected criteria, in the selected priority order', () => {
    const items = [
      workItem({ id: 1, status: 'New', createdDate: '2026-03-01T00:00:00Z' }),
      workItem({ id: 2, status: 'Closed', createdDate: '2026-01-01T00:00:00Z' }),
      workItem({ id: 3, status: 'New', createdDate: '2026-02-01T00:00:00Z' }),
    ];
    const cfg = config({ statusCategoriesByType: categories });

    expect(ids(sortChildren(items, cfg, undefined, ['created']))).toEqual([2, 3, 1]);
    expect(ids(sortChildren(items, cfg, undefined, ['status', 'created']))).toEqual([3, 1, 2]);
    expect(ids(sortChildren(items, cfg, undefined, ['created', 'status']))).toEqual([2, 3, 1]);
  });

  describe('status criterion, within the same state category', () => {
    // Keys are in process order, as the state discovery returns them.
    const processCategories = {
      Task: { New: 'Proposed', Active: 'InProgress', 'Code Review': 'InProgress', Testing: 'InProgress', Closed: 'Completed' },
      'User Story': { New: 'Proposed', Doing: 'InProgress', Reviewing: 'InProgress', Closed: 'Completed' },
    };
    const cfg = config({ statusCategoriesByType: processCategories });

    it('orders statuses by their position in the process', () => {
      const items = [
        workItem({ id: 1, status: 'Testing' }),
        workItem({ id: 2, status: 'Active' }),
        workItem({ id: 3, status: 'Code Review' }),
      ];

      expect(ids(sortChildren(items, cfg, undefined, ['status']))).toEqual([2, 3, 1]);
    });

    it('still puts the category before the status position', () => {
      const items = [workItem({ id: 1, status: 'Testing' }), workItem({ id: 2, status: 'New' })];

      expect(ids(sortChildren(items, cfg, undefined, ['status']))).toEqual([2, 1]);
    });

    it('compares each type by its own position within the category', () => {
      // 'Reviewing' is the 2nd InProgress state of a Story, 'Active' the 1st of a Task.
      const items = [workItem({ id: 1, type: 'User Story', status: 'Reviewing' }), workItem({ id: 2, status: 'Active' })];

      expect(ids(sortChildren(items, cfg, undefined, ['status']))).toEqual([2, 1]);
    });

    it('ties when both are at the same position in their own category', () => {
      const items = [workItem({ id: 1, type: 'User Story', status: 'Doing' }), workItem({ id: 2, status: 'Active' })];

      expect(ids(sortChildren(items, cfg, undefined, ['status']))).toEqual([1, 2]);
      expect(ids(sortChildren([...items].reverse(), cfg, undefined, ['status']))).toEqual([2, 1]);
    });
  });

  it('sorts by work item type name alphabetically', () => {
    const items = [workItem({ id: 1, type: 'Task' }), workItem({ id: 2, type: 'Bug' }), workItem({ id: 3, type: 'User Story' })];

    expect(ids(sortChildren(items, config(), undefined, ['workItemType']))).toEqual([2, 1, 3]);
  });

  it('does not mutate the input array', () => {
    const items = [workItem({ id: 2, backlogOrder: 2 }), workItem({ id: 1, backlogOrder: 1 })];
    sortChildren(items, config(), undefined);

    expect(ids(items)).toEqual([2, 1]);
  });
});
