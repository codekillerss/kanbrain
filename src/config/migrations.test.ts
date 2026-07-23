import { describe, it, expect } from 'vitest';
import { runMigrations } from './migrations';
import type { KanbrainConfig } from '../types';

describe('runMigrations', () => {
  it('returns the config unchanged when it is already in the new shape', () => {
    const config: KanbrainConfig = {
      organization: 'org',
      project: 'proj',
      defaultTeam: 'MyProject Team',
      skills: { Task: { Active: { path: 'skills/a.md' } } },
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

    expect(migrated.skills).toEqual({
      'User Story': { Active: { path: 'skills/fix.md', label: 'Fix it' }, Closed: null },
      Bug: { Active: { path: 'skills/fix.md', label: 'Fix it' }, Closed: null },
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
    migrated.skills['User Story'].Active = null;

    expect(migrated.skills.Bug.Active).toEqual({ path: 'skills/fix.md' });
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
});
