import { describe, it, expect } from 'vitest';
import { diffBoardConfig, isDiffEmpty } from './checkBoardConfig';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: { Task: { 'To Do': null, Done: null } },
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

const discovered: Record<string, Record<string, string>> = { Task: { 'To Do': 'Proposed', Done: 'Completed' } };

describe('diffBoardConfig', () => {
  it('returns an empty diff when config matches the discovered types exactly', () => {
    const diff = diffBoardConfig(config(), discovered);
    expect(isDiffEmpty(diff)).toBe(true);
  });

  it('reports a type removed (no longer discovered)', () => {
    const diff = diffBoardConfig(config({ skills: { Task: { 'To Do': null, Done: null }, Bug: { New: null } } }), discovered);
    expect(diff.typesRemoved).toEqual(['Bug']);
  });

  it('reports a type added (discovered but not yet in config)', () => {
    const diff = diffBoardConfig(config(), { ...discovered, Bug: { New: 'Proposed' } });
    expect(diff.typesAdded).toEqual(['Bug']);
  });

  it('reports a status added within an existing type', () => {
    const diff = diffBoardConfig(config({ skills: { Task: { 'To Do': null } } }), discovered);
    expect(diff.statusesAdded).toEqual([{ type: 'Task', status: 'Done' }]);
  });

  it('reports a status removed within an existing type, including its skill path', () => {
    const diff = diffBoardConfig(
      config({ skills: { Task: { 'To Do': null, Done: null, Cancelled: { path: '.kanbrain/skills/task-cancelled.md' } } } }),
      discovered,
    );
    expect(diff.statusesRemoved).toEqual([{ type: 'Task', status: 'Cancelled', skillPath: '.kanbrain/skills/task-cancelled.md' }]);
  });
});
