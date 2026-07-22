import { describe, it, expect } from 'vitest';
import { resolveShowParent, resolveShowAssignedTo } from './resolveCardFieldVisibility';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    typeToBacklogLevel: {},
    backlogLevels: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('resolveShowParent', () => {
  it('returns false when the type is not found in any board', () => {
    const result = resolveShowParent(config({ cardSettingsByBoard: { Stories: { Bug: { parent: true, assignedTo: true } } } }), 'Task', undefined);
    expect(result).toBe(false);
  });

  it('returns false when cardSettingsByBoard is undefined', () => {
    expect(resolveShowParent(config(), 'Task', undefined)).toBe(false);
  });

  it('uses the single board that has the type', () => {
    const result = resolveShowParent(
      config({ cardSettingsByBoard: { Stories: { 'User Story': { parent: true, assignedTo: false } } } }),
      'User Story',
      undefined,
    );
    expect(result).toBe(true);
  });

  it('uses the selected board when the type appears in more than one board with different values', () => {
    const cfg = config({
      cardSettingsByBoard: {
        Stories: { Bug: { parent: true, assignedTo: true } },
        Sprints: { Bug: { parent: false, assignedTo: true } },
      },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Sprints')).toBe(false);
    expect(resolveShowParent(cfg, 'Bug', 'Stories')).toBe(true);
  });

  it('falls back to the first matching board when the selected board does not have the type', () => {
    const cfg = config({
      cardSettingsByBoard: {
        Stories: { Bug: { parent: true, assignedTo: true } },
        Sprints: { Bug: { parent: false, assignedTo: true } },
      },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Features')).toBe(true);
  });
});

describe('resolveShowAssignedTo', () => {
  it('returns false when the type is not found in any board', () => {
    const result = resolveShowAssignedTo(config({ cardSettingsByBoard: { Stories: { Bug: { parent: true, assignedTo: true } } } }), 'Task', undefined);
    expect(result).toBe(false);
  });

  it('returns false when cardSettingsByBoard is undefined', () => {
    expect(resolveShowAssignedTo(config(), 'Task', undefined)).toBe(false);
  });

  it('uses the single board that has the type', () => {
    const result = resolveShowAssignedTo(
      config({ cardSettingsByBoard: { Stories: { 'User Story': { parent: false, assignedTo: true } } } }),
      'User Story',
      undefined,
    );
    expect(result).toBe(true);
  });

  it('uses the selected board when the type appears in more than one board with different values', () => {
    const cfg = config({
      cardSettingsByBoard: {
        Stories: { Bug: { parent: true, assignedTo: false } },
        Sprints: { Bug: { parent: true, assignedTo: true } },
      },
    });
    expect(resolveShowAssignedTo(cfg, 'Bug', 'Sprints')).toBe(true);
    expect(resolveShowAssignedTo(cfg, 'Bug', 'Stories')).toBe(false);
  });

  it('falls back to the first matching board when the selected board does not have the type', () => {
    const cfg = config({
      cardSettingsByBoard: {
        Stories: { Bug: { parent: true, assignedTo: true } },
        Sprints: { Bug: { parent: true, assignedTo: false } },
      },
    });
    expect(resolveShowAssignedTo(cfg, 'Bug', 'Features')).toBe(true);
  });
});
