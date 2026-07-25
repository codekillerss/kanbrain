import { describe, it, expect } from 'vitest';
import { diffBoardConfig, isDiffEmpty, summarizeDiff } from './checkBoardConfig';
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
  it('returns an empty diff when config matches the discovered types exactly and bootstrap content is present', () => {
    const diff = diffBoardConfig(config(), discovered, false);
    expect(isDiffEmpty(diff)).toBe(true);
  });

  it('reports a type removed (no longer discovered)', () => {
    const diff = diffBoardConfig(config({ skills: { Task: { 'To Do': null, Done: null }, Bug: { New: null } } }), discovered, false);
    expect(diff.typesRemoved).toEqual(['Bug']);
  });

  it('reports a type added (discovered but not yet in config)', () => {
    const diff = diffBoardConfig(config(), { ...discovered, Bug: { New: 'Proposed' } }, false);
    expect(diff.typesAdded).toEqual(['Bug']);
  });

  it('reports a status added within an existing type', () => {
    const diff = diffBoardConfig(config({ skills: { Task: { 'To Do': null } } }), discovered, false);
    expect(diff.statusesAdded).toEqual([{ type: 'Task', status: 'Done' }]);
  });

  it('reports a status removed within an existing type, including its skill path', () => {
    const diff = diffBoardConfig(
      config({ skills: { Task: { 'To Do': null, Done: null, Cancelled: { path: '.kanbrain/skills/task-cancelled.md' } } } }),
      discovered,
      false,
    );
    expect(diff.statusesRemoved).toEqual([{ type: 'Task', status: 'Cancelled', skillPath: '.kanbrain/skills/task-cancelled.md' }]);
  });

  it('is not empty when missingBootstrapContent is true even if nothing else changed', () => {
    const diff = diffBoardConfig(config(), discovered, true);
    expect(isDiffEmpty(diff)).toBe(false);
    expect(diff.missingBootstrapContent).toBe(true);
  });

  it('mentions the missing bootstrap content in the summary', () => {
    const diff = diffBoardConfig(config(), discovered, true);
    expect(summarizeDiff(diff)).toContain('global skill setup');
  });
});
