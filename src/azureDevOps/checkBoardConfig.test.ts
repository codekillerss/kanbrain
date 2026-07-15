import { describe, it, expect } from 'vitest';
import { diffBoardConfig, isDiffEmpty } from './checkBoardConfig';
import type { KanbrainConfig } from '../types';
import type { DiscoveredBacklogLevels } from './backlogLevels';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    typeToBacklogLevel: { Task: 'Tasks' },
    backlogLevels: { Tasks: { 'To Do': null, Done: null } },
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

const discovered: DiscoveredBacklogLevels = { Tasks: { 'To Do': 'Proposed', Done: 'Completed' } };
const freshTypeToBacklogLevel = { Task: 'Tasks' };

describe('diffBoardConfig', () => {
  it('returns an empty diff when config matches the board exactly', () => {
    const diff = diffBoardConfig(config(), discovered, freshTypeToBacklogLevel);
    expect(isDiffEmpty(diff)).toBe(true);
  });

  it('reports a type removed from the board', () => {
    const diff = diffBoardConfig(config({ typeToBacklogLevel: { Task: 'Tasks', Bug: 'Stories' } }), discovered, freshTypeToBacklogLevel);
    expect(diff.typesRemoved).toEqual(['Bug']);
  });

  it('reports a type added on the board', () => {
    const diff = diffBoardConfig(config(), discovered, { Task: 'Tasks', Bug: 'Stories' });
    expect(diff.typesAdded).toEqual(['Bug']);
  });

  it('reports a type moved to a different backlog level', () => {
    const diff = diffBoardConfig(config({ typeToBacklogLevel: { Task: 'Stories' } }), discovered, freshTypeToBacklogLevel);
    expect(diff.typesMoved).toEqual([{ type: 'Task', from: 'Stories', to: 'Tasks' }]);
  });

  it('reports a backlog level added on the board', () => {
    const diff = diffBoardConfig(config(), { ...discovered, Stories: { New: 'Proposed' } }, freshTypeToBacklogLevel);
    expect(diff.levelsAdded).toEqual(['Stories']);
  });

  it('reports a backlog level removed from the board', () => {
    const diff = diffBoardConfig(
      config({ backlogLevels: { Tasks: { 'To Do': null }, Stories: { New: { path: '.kanbrain/skills/x.md' } } } }),
      discovered,
      freshTypeToBacklogLevel,
    );
    expect(diff.levelsRemoved).toEqual(['Stories']);
  });

  it('reports a status added within an existing backlog level', () => {
    const diff = diffBoardConfig(config({ backlogLevels: { Tasks: { 'To Do': null } } }), discovered, freshTypeToBacklogLevel);
    expect(diff.statusesAdded).toEqual([{ level: 'Tasks', status: 'Done' }]);
  });

  it('reports a status removed within an existing backlog level, including its skill path', () => {
    const diff = diffBoardConfig(
      config({
        backlogLevels: { Tasks: { 'To Do': null, Done: null, Cancelled: { path: '.kanbrain/skills/tasks-cancelled.md' } } },
      }),
      discovered,
      freshTypeToBacklogLevel,
    );
    expect(diff.statusesRemoved).toEqual([{ level: 'Tasks', status: 'Cancelled', skillPath: '.kanbrain/skills/tasks-cancelled.md' }]);
  });
});
