import { describe, it, expect } from 'vitest';
import { syncConfig } from './syncConfig';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    typeToBacklogLevel: { Task: 'Tasks' },
    backlogLevels: { Tasks: { 'To Do': { path: '.kanbrain/skills/tasks-todo.md' }, Done: null } },
    statusColors: { 'To Do': 'old-color' },
    typeColors: { Task: 'old-color' },
    typeIcons: { Task: '<svg>old</svg>' },
    ...overrides,
  };
}

describe('syncConfig', () => {
  it('always replaces derived fields with the fresh values', () => {
    const result = syncConfig(
      config(),
      { Tasks: { 'To Do': 'Proposed', Done: 'Completed' } },
      { Task: 'Tasks' },
      { 'To Do': 'new-color' },
      { Task: 'new-color' },
      { Task: '<svg>new</svg>' },
      { Tasks: { Task: true } },
    );

    expect(result.statusColors).toEqual({ 'To Do': 'new-color' });
    expect(result.typeColors).toEqual({ Task: 'new-color' });
    expect(result.typeIcons).toEqual({ Task: '<svg>new</svg>' });
    expect(result.typeToBacklogLevel).toEqual({ Task: 'Tasks' });
  });

  it('keeps organization and project unchanged', () => {
    const result = syncConfig(config(), { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});
    expect(result.organization).toBe('org');
    expect(result.project).toBe('proj');
  });

  it('preserves an existing skill mapping for a status that still exists on the board', () => {
    const result = syncConfig(config(), { Tasks: { 'To Do': 'Proposed', Done: 'Completed' } }, { Task: 'Tasks' }, {}, {}, {}, {});
    expect(result.backlogLevels.Tasks['To Do']).toEqual({ path: '.kanbrain/skills/tasks-todo.md' });
    expect(result.backlogLevels.Tasks.Done).toBeNull();
  });

  it('defaults a brand new status to null', () => {
    const result = syncConfig(
      config(),
      { Tasks: { 'To Do': 'Proposed', Done: 'Completed', Cancelled: 'Removed' } },
      { Task: 'Tasks' },
      {},
      {},
      {},
      {},
    );
    expect(result.backlogLevels.Tasks.Cancelled).toBeNull();
  });

  it('preserves an orphaned status mapping instead of deleting it', () => {
    const withOrphan = config({
      backlogLevels: {
        Tasks: { 'To Do': { path: '.kanbrain/skills/tasks-todo.md' }, Legacy: { path: '.kanbrain/skills/legacy.md' } },
      },
    });
    const result = syncConfig(withOrphan, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});

    expect(result.backlogLevels.Tasks.Legacy).toEqual({ path: '.kanbrain/skills/legacy.md' });
    expect(result.backlogLevels.Tasks['To Do']).toEqual({ path: '.kanbrain/skills/tasks-todo.md' });
  });

  it('preserves an orphaned backlog level entirely instead of deleting it', () => {
    const withOrphanLevel = config({
      backlogLevels: { Tasks: { 'To Do': null }, Stories: { New: { path: '.kanbrain/skills/stories-new.md' } } },
    });
    const result = syncConfig(withOrphanLevel, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});

    expect(result.backlogLevels.Stories).toEqual({ New: { path: '.kanbrain/skills/stories-new.md' } });
  });

  it('adds a brand new backlog level with all statuses defaulted to null', () => {
    const result = syncConfig(
      config(),
      { Tasks: { 'To Do': 'Proposed' }, Stories: { New: 'Proposed' } },
      { Task: 'Tasks' },
      {},
      {},
      {},
      {},
    );
    expect(result.backlogLevels.Stories).toEqual({ New: null });
  });

  it('preserves label and color customizations on a skill entry that still applies', () => {
    const withCustomization = config({
      backlogLevels: {
        Tasks: { 'To Do': { path: '.kanbrain/skills/tasks-todo.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' } },
      },
    });
    const result = syncConfig(withCustomization, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});

    expect(result.backlogLevels.Tasks['To Do']).toEqual({
      path: '.kanbrain/skills/tasks-todo.md',
      label: 'Refine',
      textColor: 'ffffff',
      buttonColor: '007acc',
    });
  });

  it('preserves showAssignedTo across a sync', () => {
    const result = syncConfig(config({ showAssignedTo: false }), { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});
    expect(result.showAssignedTo).toBe(false);
  });

  it('leaves showAssignedTo undefined when it was never set', () => {
    const result = syncConfig(config(), { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});
    expect(result.showAssignedTo).toBeUndefined();
  });

  it('replaces cardSettingsByBoard with the fresh value, discarding the previous one', () => {
    const withOldSettings = config({ cardSettingsByBoard: { OldBoard: { Task: false } } });
    const result = syncConfig(
      withOldSettings,
      { Tasks: { 'To Do': 'Proposed' } },
      { Task: 'Tasks' },
      {},
      {},
      {},
      { Tasks: { Task: true } },
    );

    expect(result.cardSettingsByBoard).toEqual({ Tasks: { Task: true } });
  });
});
