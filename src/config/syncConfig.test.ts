import { describe, it, expect } from 'vitest';
import { syncConfig } from './syncConfig';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: { Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md' }, Done: null } },
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
      { Task: { 'To Do': 'Proposed', Done: 'Completed' } },
      { 'To Do': 'new-color' },
      { Task: 'new-color' },
      { Task: '<svg>new</svg>' },
      'MyProject Team',
      { 'MyProject Team': { Tasks: { Task: { parent: true, assignedTo: true } } } },
      {},
      {},
    );

    expect(result.statusColors).toEqual({ 'To Do': 'new-color' });
    expect(result.typeColors).toEqual({ Task: 'new-color' });
    expect(result.typeIcons).toEqual({ Task: '<svg>new</svg>' });
    expect(result.defaultTeam).toBe('MyProject Team');
  });

  it('keeps organization and project unchanged', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.organization).toBe('org');
    expect(result.project).toBe('proj');
  });

  it('preserves an existing skill mapping for a status that still exists for that type', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed', Done: 'Completed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.skills.Task['To Do']).toEqual({ path: '.kanbrain/skills/task-todo.md' });
    expect(result.skills.Task.Done).toBeNull();
  });

  it('defaults a brand new status to null', () => {
    const result = syncConfig(
      config(),
      { Task: { 'To Do': 'Proposed', Done: 'Completed', Cancelled: 'Removed' } },
      {},
      {},
      {},
      'MyProject Team',
      {},
      {},
      {},
    );
    expect(result.skills.Task.Cancelled).toBeNull();
  });

  it('preserves an orphaned status mapping instead of deleting it', () => {
    const withOrphan = config({
      skills: {
        Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md' }, Legacy: { path: '.kanbrain/skills/legacy.md' } },
      },
    });
    const result = syncConfig(withOrphan, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});

    expect(result.skills.Task.Legacy).toEqual({ path: '.kanbrain/skills/legacy.md' });
    expect(result.skills.Task['To Do']).toEqual({ path: '.kanbrain/skills/task-todo.md' });
  });

  it('preserves an orphaned type entirely instead of deleting it', () => {
    const withOrphanType = config({
      skills: { Task: { 'To Do': null }, Bug: { New: { path: '.kanbrain/skills/bug-new.md' } } },
    });
    const result = syncConfig(withOrphanType, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});

    expect(result.skills.Bug).toEqual({ New: { path: '.kanbrain/skills/bug-new.md' } });
  });

  it('adds a brand new type with all statuses defaulted to null', () => {
    const result = syncConfig(
      config(),
      { Task: { 'To Do': 'Proposed' }, Bug: { New: 'Proposed' } },
      {},
      {},
      {},
      'MyProject Team',
      {},
      {},
      {},
    );
    expect(result.skills.Bug).toEqual({ New: null });
  });

  it('preserves label and color customizations on a skill entry that still applies', () => {
    const withCustomization = config({
      skills: {
        Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' } },
      },
    });
    const result = syncConfig(withCustomization, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});

    expect(result.skills.Task['To Do']).toEqual({
      path: '.kanbrain/skills/task-todo.md',
      label: 'Refine',
      textColor: 'ffffff',
      buttonColor: '007acc',
    });
  });

  it('preserves showAssignedTo across a sync', () => {
    const result = syncConfig(config({ showAssignedTo: false }), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.showAssignedTo).toBe(false);
  });

  it('leaves showAssignedTo undefined when it was never set', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.showAssignedTo).toBeUndefined();
  });

  it('replaces cardSettingsByTeam with the fresh value, discarding the previous one', () => {
    const withOldSettings = config({ cardSettingsByTeam: { 'Old Team': { Tasks: { Task: { parent: false, assignedTo: false } } } } });
    const result = syncConfig(
      withOldSettings,
      { Task: { 'To Do': 'Proposed' } },
      {},
      {},
      {},
      'MyProject Team',
      { 'MyProject Team': { Tasks: { Task: { parent: true, assignedTo: true } } } },
      {},
      {},
    );

    expect(result.cardSettingsByTeam).toEqual({ 'MyProject Team': { Tasks: { Task: { parent: true, assignedTo: true } } } });
  });

  it('replaces taskBacklogTypesByTeam with the fresh value, discarding the previous one', () => {
    const withOldTypes = config({ taskBacklogTypesByTeam: { 'Old Team': ['Task'] } });
    const result = syncConfig(
      withOldTypes,
      { Task: { 'To Do': 'Proposed' } },
      {},
      {},
      {},
      'MyProject Team',
      {},
      { 'MyProject Team': ['Task', 'Bug'] },
      {},
    );

    expect(result.taskBacklogTypesByTeam).toEqual({ 'MyProject Team': ['Task', 'Bug'] });
  });
});

describe('syncConfig repositories', () => {
  it('adds a brand new repository with its auto-matched path', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {
      'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' },
    });
    expect(result.repositories).toEqual({ 'repo-1': { name: 'kanbrain', path: 'C:\\repos\\kanbrain' } });
  });

  it('preserves a manually-set path even when the fresh scan finds a different one', () => {
    const withPath = config({ repositories: { 'repo-1': { name: 'kanbrain', path: 'D:\\manual\\path' } } });
    const result = syncConfig(withPath, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {
      'repo-1': { name: 'kanbrain', path: 'C:\\auto\\found' },
    });
    expect(result.repositories!['repo-1'].path).toBe('D:\\manual\\path');
  });

  it('accepts a fresh auto-match when the existing path is empty', () => {
    const withEmptyPath = config({ repositories: { 'repo-1': { name: 'kanbrain', path: '' } } });
    const result = syncConfig(withEmptyPath, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {
      'repo-1': { name: 'kanbrain', path: 'C:\\auto\\found' },
    });
    expect(result.repositories!['repo-1'].path).toBe('C:\\auto\\found');
  });

  it('refreshes the name even when the path is preserved', () => {
    const withOldName = config({ repositories: { 'repo-1': { name: 'old-name', path: 'D:\\manual\\path' } } });
    const result = syncConfig(withOldName, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {
      'repo-1': { name: 'renamed-repo', path: '' },
    });
    expect(result.repositories!['repo-1']).toEqual({ name: 'renamed-repo', path: 'D:\\manual\\path' });
  });

  it('keeps a repository absent from the fresh scan instead of deleting it', () => {
    const withOrphan = config({ repositories: { 'repo-1': { name: 'gone-repo', path: 'D:\\still\\here' } } });
    const result = syncConfig(withOrphan, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.repositories).toEqual({ 'repo-1': { name: 'gone-repo', path: 'D:\\still\\here' } });
  });
});
