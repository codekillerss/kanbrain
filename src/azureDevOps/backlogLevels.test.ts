import { describe, it, expect } from 'vitest';
import { discoverBacklogLevelStates, buildTypeToBacklogLevel, type BacklogLevel, type WorkItemTypeState } from './backlogLevels';

const levels: BacklogLevel[] = [
  { name: 'Stories', workItemTypes: ['User Story', 'Bug'] },
  { name: 'Tasks', workItemTypes: ['Task'] },
];

const statesByType: Record<string, WorkItemTypeState[]> = {
  'User Story': [
    { name: 'New', category: 'Proposed' },
    { name: 'Committed', category: 'InProgress' },
    { name: 'Done', category: 'Completed' },
  ],
  Bug: [
    { name: 'New', category: 'Proposed' },
    { name: 'Active', category: 'InProgress' },
    { name: 'Resolved', category: 'Resolved' },
    { name: 'Closed', category: 'Completed' },
  ],
  Task: [
    { name: 'To Do', category: 'Proposed' },
    { name: 'In Progress', category: 'InProgress' },
    { name: 'Done', category: 'Completed' },
  ],
};

describe('discoverBacklogLevelStates', () => {
  it('merges states from every work item type into their backlog level', () => {
    const discovered = discoverBacklogLevelStates(levels, statesByType);

    expect(discovered.Stories).toEqual({
      New: 'Proposed',
      Committed: 'InProgress',
      Done: 'Completed',
      Active: 'InProgress',
      Resolved: 'Resolved',
      Closed: 'Completed',
    });
    expect(discovered.Tasks).toEqual({
      'To Do': 'Proposed',
      'In Progress': 'InProgress',
      Done: 'Completed',
    });
  });

  it('omits a backlog level when none of its work item types have known states', () => {
    const discovered = discoverBacklogLevelStates([{ name: 'Epics', workItemTypes: ['Epic'] }], {});

    expect(discovered.Epics).toBeUndefined();
  });

  it('skips a work item type with no known states but keeps the rest of the level', () => {
    const discovered = discoverBacklogLevelStates(
      [{ name: 'Stories', workItemTypes: ['User Story', 'Bug'] }],
      { 'User Story': statesByType['User Story'] },
    );

    expect(discovered.Stories).toEqual({ New: 'Proposed', Committed: 'InProgress', Done: 'Completed' });
  });
});

describe('buildTypeToBacklogLevel', () => {
  it('maps each known work item type to its backlog level name', () => {
    const result = buildTypeToBacklogLevel(levels, new Set(['User Story', 'Bug', 'Task']));

    expect(result).toEqual({ 'User Story': 'Stories', Bug: 'Stories', Task: 'Tasks' });
  });

  it('excludes work item types that are not in knownTypes', () => {
    const result = buildTypeToBacklogLevel(levels, new Set(['User Story']));

    expect(result).toEqual({ 'User Story': 'Stories' });
  });
});
