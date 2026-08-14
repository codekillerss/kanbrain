import { describe, it, expect } from 'vitest';
import { buildSearchQuery, buildTypeCountQuery, filterWorkItemsByText, filterByAssignedTo, countItemsByType } from './wiql';
import type { WorkItem } from '../types';

describe('buildSearchQuery', () => {
  it('returns a title-ordered query with no filter when search text is empty', () => {
    const query = buildSearchQuery('');
    expect(query).toContain('SELECT [System.Id] FROM WorkItems');
    expect(query).toContain('ORDER BY [System.ChangedDate] DESC');
    expect(query).not.toContain('CONTAINS');
  });

  it('filters by exact id when the search text is numeric', () => {
    const query = buildSearchQuery('482');
    expect(query).toContain('[System.Id] = 482');
    expect(query).not.toContain('CONTAINS');
  });

  it('filters by title CONTAINS when the search text is not numeric', () => {
    const query = buildSearchQuery('login bug');
    expect(query).toContain("[System.Title] CONTAINS 'login bug'");
  });

  it('escapes single quotes in the search text', () => {
    const query = buildSearchQuery("user's login");
    expect(query).toContain("CONTAINS 'user''s login'");
  });

  it('does not add an assigned-to clause by default', () => {
    expect(buildSearchQuery('')).not.toContain('AssignedTo');
    expect(buildSearchQuery('482')).not.toContain('AssignedTo');
    expect(buildSearchQuery('login bug')).not.toContain('AssignedTo');
  });

  it('adds an [System.AssignedTo] = @Me clause when assignedToMe is true', () => {
    expect(buildSearchQuery('', true)).toContain('[System.AssignedTo] = @Me');
    expect(buildSearchQuery('482', true)).toContain('[System.AssignedTo] = @Me');
    expect(buildSearchQuery('login bug', true)).toContain('[System.AssignedTo] = @Me');
  });
});

describe('buildTypeCountQuery', () => {
  it('filters by a single work item type', () => {
    const query = buildTypeCountQuery(['Epic']);
    expect(query).toContain('SELECT [System.Id] FROM WorkItems');
    expect(query).toContain("[System.WorkItemType] IN ('Epic')");
    expect(query).not.toContain('CONTAINS');
    expect(query).not.toContain('ORDER BY');
  });

  it('filters by multiple work item types', () => {
    const query = buildTypeCountQuery(['User Story', 'Bug']);
    expect(query).toContain("[System.WorkItemType] IN ('User Story', 'Bug')");
  });

  it('escapes single quotes in type names', () => {
    const query = buildTypeCountQuery(["Tester's Task"]);
    expect(query).toContain("IN ('Tester''s Task')");
  });
});

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'Fix login bug',
    description: '',
    status: 'Active',
    type: 'Bug',
    url: '',
    parentId: null,
    childIds: [],
    assignedTo: null,
    development: [],
    ...overrides,
  };
}

describe('filterWorkItemsByText', () => {
  it('returns all items unchanged when search text is empty', () => {
    const items = [workItem({ id: 1 }), workItem({ id: 2 })];
    expect(filterWorkItemsByText(items, '')).toEqual(items);
    expect(filterWorkItemsByText(items, '   ')).toEqual(items);
  });

  it('filters by exact id when the search text is numeric', () => {
    const items = [workItem({ id: 1, title: 'Fix login bug' }), workItem({ id: 2, title: 'Add logout button' })];
    expect(filterWorkItemsByText(items, '2')).toEqual([items[1]]);
  });

  it('filters by title substring, case-insensitively, when not numeric', () => {
    const items = [workItem({ id: 1, title: 'Fix Login Bug' }), workItem({ id: 2, title: 'Add logout button' })];
    expect(filterWorkItemsByText(items, 'login')).toEqual([items[0]]);
  });

  it('returns an empty array when nothing matches', () => {
    const items = [workItem({ id: 1, title: 'Fix login bug' })];
    expect(filterWorkItemsByText(items, 'nonexistent')).toEqual([]);
  });
});

describe('filterByAssignedTo', () => {
  it('keeps only items assigned to the given user id', () => {
    const items = [
      workItem({ id: 1, assignedTo: { id: 'user-1', displayName: 'A', imageUrl: null } }),
      workItem({ id: 2, assignedTo: { id: 'user-2', displayName: 'B', imageUrl: null } }),
    ];
    expect(filterByAssignedTo(items, 'user-1')).toEqual([items[0]]);
  });

  it('excludes unassigned items', () => {
    const items = [workItem({ id: 1, assignedTo: null })];
    expect(filterByAssignedTo(items, 'user-1')).toEqual([]);
  });
});

describe('countItemsByType', () => {
  it('groups items by their type', () => {
    const items = [
      workItem({ id: 1, type: 'Bug' }),
      workItem({ id: 2, type: 'Bug' }),
      workItem({ id: 3, type: 'Task' }),
    ];
    expect(countItemsByType(items)).toEqual({ Bug: 2, Task: 1 });
  });

  it('returns an empty object for an empty list', () => {
    expect(countItemsByType([])).toEqual({});
  });
});
