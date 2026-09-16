import { describe, it, expect } from 'vitest';
import { runMigrations } from './migrations';
import type { KanbrainConfig } from '../types';

describe('runMigrations', () => {
  it('returns the config unchanged when it is already in the new shape', () => {
    const config: KanbrainConfig = {
      organization: 'org',
      project: 'proj',
      defaultTeam: 'MyProject Team',
      skills: { 'skill-1': { path: 'skills/a.md' } },
      workflowSteps: { Task: { Active: { skillId: 'skill-1' } } },
      statusColors: {},
      typeColors: {},
      typeIcons: {},
    };

    expect(runMigrations(config)).toEqual(config);
  });

  it('migrates a legacy backlogLevels/typeToBacklogLevel config with no lastSyncedVersion recorded', () => {
    const legacy = {
      organization: 'org',
      project: 'proj',
      typeToBacklogLevel: { 'User Story': 'Stories', Bug: 'Stories' },
      backlogLevels: { Stories: { Active: { path: 'skills/fix.md', label: 'Fix it' }, Closed: null } },
      statusColors: { Active: 'b2b2b2' },
      typeColors: { 'User Story': 'f2cb1d' },
      typeIcons: { 'User Story': '<svg></svg>' },
    };

    const migrated = runMigrations(legacy);

    expect(migrated.skills).toEqual({ 'skill-1': { path: 'skills/fix.md', label: 'Fix it' } });
    expect(migrated.workflowSteps).toEqual({
      'User Story': { Active: { skillId: 'skill-1' }, Closed: null },
      Bug: { Active: { skillId: 'skill-1' }, Closed: null },
    });
    expect(migrated.defaultTeam).toBe('');
    expect(migrated.organization).toBe('org');
    expect(migrated.statusColors).toEqual({ Active: 'b2b2b2' });
    expect(migrated.cardSettingsByTeam).toBeUndefined();
  });

  it('does not let edits to one migrated type leak into another type that shared the same backlog level', () => {
    const legacy = {
      organization: 'org',
      project: 'proj',
      typeToBacklogLevel: { 'User Story': 'Stories', Bug: 'Stories' },
      backlogLevels: { Stories: { Active: { path: 'skills/fix.md' } } },
      statusColors: {},
      typeColors: {},
      typeIcons: {},
    };

    const migrated = runMigrations(legacy);
    migrated.workflowSteps['User Story'].Active = null;

    expect(migrated.workflowSteps.Bug.Active).toEqual({ skillId: 'skill-1' });
  });

  it('carries over showAssignedTo when present on a legacy config', () => {
    const legacy = {
      organization: 'org',
      project: 'proj',
      typeToBacklogLevel: {},
      backlogLevels: {},
      statusColors: {},
      typeColors: {},
      typeIcons: {},
      showAssignedTo: false,
    };

    expect(runMigrations(legacy).showAssignedTo).toBe(false);
  });

  it('does not re-run the 0.2.3 migration on a legacy-shaped config whose lastSyncedVersion is already 0.2.3 or newer', () => {
    // Not a realistic file (a real 0.3.0+ config never has backlogLevels), but proves the version
    // gate itself works, independent of the structural shape check.
    const alreadyTagged = {
      organization: 'org',
      project: 'proj',
      typeToBacklogLevel: { Task: 'Tasks' },
      backlogLevels: { Tasks: { Active: { path: 'skills/fix.md' } } },
      statusColors: {},
      typeColors: {},
      typeIcons: {},
      lastSyncedVersion: '0.3.0',
    };

    const result = runMigrations(alreadyTagged) as unknown as typeof alreadyTagged;

    expect(result.backlogLevels).toEqual({ Tasks: { Active: { path: 'skills/fix.md' } } });
  });

  it('splits a pre-0.12.0 skills/globalSkills config into a skill registry plus workflowSteps', () => {
    const preWorkflowSteps = {
      organization: 'org',
      project: 'proj',
      defaultTeam: 'MyProject Team',
      skills: {
        'User Story': {
          New: { path: '.kanbrain/skills/stories-new.md' },
          Committed: { path: '.kanbrain/skills/stories-inprogress.md', label: 'Refine' },
          Done: null,
        },
      },
      globalSkills: { 'explain-card': { path: '.kanbrain/skills/explain-card.md', label: 'Explain Card' } },
      statusColors: {},
      typeColors: {},
      typeIcons: {},
      repositories: { 'repo-1': { name: 'kanbrain', path: '' } },
    };

    const migrated = runMigrations(preWorkflowSteps);

    expect(migrated.skills).toEqual({
      'explain-card': { path: '.kanbrain/skills/explain-card.md', label: 'Explain Card', isGlobal: true },
      'skill-1': { path: '.kanbrain/skills/stories-new.md' },
      'skill-2': { path: '.kanbrain/skills/stories-inprogress.md', label: 'Refine' },
    });
    expect(migrated.workflowSteps).toEqual({
      'User Story': { New: { skillId: 'skill-1' }, Committed: { skillId: 'skill-2' }, Done: null },
    });
    // Fields outside the skills/globalSkills split are preserved untouched.
    expect(migrated.repositories).toEqual({ 'repo-1': { name: 'kanbrain', path: '' } });
    expect('globalSkills' in migrated).toBe(false);
  });

  it('collapses identical skill entries reused across statuses into a single registry entry, but keeps distinct label/color overrides separate', () => {
    const preWorkflowSteps = {
      organization: 'org',
      project: 'proj',
      defaultTeam: 'MyProject Team',
      skills: {
        Task: {
          Active: { path: '.kanbrain/skills/shared.md' },
          Reopened: { path: '.kanbrain/skills/shared.md' },
          Blocked: { path: '.kanbrain/skills/shared.md', label: 'Unblock it' },
        },
      },
      statusColors: {},
      typeColors: {},
      typeIcons: {},
    };

    const migrated = runMigrations(preWorkflowSteps);

    expect(migrated.workflowSteps.Task.Active).toEqual(migrated.workflowSteps.Task.Reopened);
    expect(migrated.workflowSteps.Task.Blocked).not.toEqual(migrated.workflowSteps.Task.Active);
    expect(Object.keys(migrated.skills)).toHaveLength(2);
  });

  it('does not re-run the 0.12.0 migration on a config whose lastSyncedVersion is already 0.12.0 or newer', () => {
    const alreadyTagged = {
      organization: 'org',
      project: 'proj',
      defaultTeam: '',
      skills: { Task: { Active: { path: 'skills/fix.md' } } },
      statusColors: {},
      typeColors: {},
      typeIcons: {},
      lastSyncedVersion: '0.12.0',
    };

    const result = runMigrations(alreadyTagged) as unknown as typeof alreadyTagged;

    expect(result.skills).toEqual({ Task: { Active: { path: 'skills/fix.md' } } });
    expect('workflowSteps' in result).toBe(false);
  });
});
