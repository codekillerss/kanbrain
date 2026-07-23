import { describe, it, expect } from 'vitest';
import { migrateConfig } from './migrateConfig';
import type { KanbrainConfig } from '../types';

describe('migrateConfig', () => {
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

    expect(migrateConfig(config)).toEqual(config);
  });

  it('converts a legacy backlogLevels/typeToBacklogLevel config into skills, keyed by type', () => {
    const legacy = {
      organization: 'org',
      project: 'proj',
      typeToBacklogLevel: { 'User Story': 'Stories', Bug: 'Stories' },
      backlogLevels: { Stories: { Active: { path: 'skills/fix.md', label: 'Fix it' }, Closed: null } },
      statusColors: { Active: 'b2b2b2' },
      typeColors: { 'User Story': 'f2cb1d' },
      typeIcons: { 'User Story': '<svg></svg>' },
    };

    const migrated = migrateConfig(legacy);

    expect(migrated.skills).toEqual({
      'User Story': { Active: { path: 'skills/fix.md', label: 'Fix it' }, Closed: null },
      Bug: { Active: { path: 'skills/fix.md', label: 'Fix it' }, Closed: null },
    });
    expect(migrated.defaultTeam).toBe('');
    expect(migrated.organization).toBe('org');
    expect(migrated.project).toBe('proj');
    expect(migrated.statusColors).toEqual({ Active: 'b2b2b2' });
    expect(migrated.typeColors).toEqual({ 'User Story': 'f2cb1d' });
    expect(migrated.typeIcons).toEqual({ 'User Story': '<svg></svg>' });
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

    const migrated = migrateConfig(legacy);
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

    expect(migrateConfig(legacy).showAssignedTo).toBe(false);
  });
});
