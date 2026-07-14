import { describe, it, expect } from 'vitest';
import {
  discoverBacklogLevelStates,
  discoverStatusColors,
  buildTypeToBacklogLevel,
  type BacklogLevel,
  type WorkItemTypeState,
} from './backlogLevels';

const levels: BacklogLevel[] = [
  { name: 'Stories', workItemTypes: ['User Story', 'Bug'] },
  { name: 'Tasks', workItemTypes: ['Task'] },
];

const statesByType: Record<string, WorkItemTypeState[]> = {
  'User Story': [
    { name: 'New', category: 'Proposed', color: 'b2b2b2' },
    { name: 'Committed', category: 'InProgress', color: '007acc' },
    { name: 'Done', category: 'Completed', color: '339933' },
  ],
  Bug: [
    { name: 'New', category: 'Proposed', color: 'cc293d' },
    { name: 'Active', category: 'InProgress', color: 'cc293d' },
    { name: 'Resolved', category: 'Resolved', color: 'ff9d00' },
    { name: 'Closed', category: 'Completed', color: '339933' },
  ],
  Task: [
    { name: 'To Do', category: 'Proposed', color: 'b2b2b2' },
    { name: 'In Progress', category: 'InProgress', color: '007acc' },
    { name: 'Done', category: 'Completed', color: '339933' },
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

describe('discoverStatusColors', () => {
  it('maps each status name to its color, merging across work item types', () => {
    const colors = discoverStatusColors(levels, statesByType);

    expect(colors).toEqual({
      New: 'b2b2b2',
      Committed: '007acc',
      Done: '339933',
      Active: 'cc293d',
      Resolved: 'ff9d00',
      Closed: '339933',
      'To Do': 'b2b2b2',
      'In Progress': '007acc',
    });
  });

  it('keeps the first-seen color when two types disagree on the same status name', () => {
    const colors = discoverStatusColors(
      [{ name: 'Stories', workItemTypes: ['User Story', 'Bug'] }],
      {
        'User Story': [{ name: 'New', category: 'Proposed', color: '111111' }],
        Bug: [{ name: 'New', category: 'Proposed', color: '222222' }],
      },
    );

    expect(colors.New).toBe('111111');
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
