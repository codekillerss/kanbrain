import { describe, it, expect } from 'vitest';
import { resolveShowParent, resolveShowAssignedTo } from './resolveCardFieldVisibility';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'Team 1',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('resolveShowParent', () => {
  it('returns false when the type is not found in any board of any team', () => {
    const result = resolveShowParent(
      config({ cardSettingsByTeam: { 'Team 1': { Stories: { Bug: { parent: true, assignedTo: true } } } } }),
      'Task',
      undefined,
    );
    expect(result).toBe(false);
  });

  it('returns false when cardSettingsByTeam is undefined', () => {
    expect(resolveShowParent(config(), 'Task', undefined)).toBe(false);
  });

  it('falls back to defaultTeam when no team is explicitly selected', () => {
    const cfg = config({
      defaultTeam: 'Team 1',
      cardSettingsByTeam: {
        'Team 1': { Stories: { Bug: { parent: true, assignedTo: false } } },
        'Team 2': { Stories: { Bug: { parent: false, assignedTo: false } } },
      },
    });
    expect(resolveShowParent(cfg, 'Bug', undefined)).toBe(true);
  });

  it('uses the explicitly selected team over defaultTeam', () => {
    const cfg = config({
      defaultTeam: 'Team 1',
      cardSettingsByTeam: {
        'Team 1': { Stories: { Bug: { parent: true, assignedTo: false } } },
        'Team 2': { Stories: { Bug: { parent: false, assignedTo: false } } },
      },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Team 2')).toBe(false);
  });

  it('finds the type in whichever board of the selected team has it', () => {
    const cfg = config({
      cardSettingsByTeam: {
        'Team 1': { Epics: { Epic: { parent: true, assignedTo: true } }, Stories: { Bug: { parent: false, assignedTo: true } } },
      },
    });
    expect(resolveShowParent(cfg, 'Epic', 'Team 1')).toBe(true);
    expect(resolveShowParent(cfg, 'Bug', 'Team 1')).toBe(false);
  });

  it('falls back to the first team found when neither the selected team nor defaultTeam exist in cardSettingsByTeam', () => {
    const cfg = config({
      defaultTeam: 'Missing Team',
      cardSettingsByTeam: { 'Team 1': { Stories: { Bug: { parent: true, assignedTo: true } } } },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Also Missing')).toBe(true);
  });

  it("always shows parent when the type is in the resolved team's task backlog, even if cardSettingsByTeam says parent is off", () => {
    const cfg = config({
      cardSettingsByTeam: { 'Team 1': { Stories: { Task: { parent: false, assignedTo: true } } } },
      taskBacklogTypesByTeam: { 'Team 1': ['Task', 'Bug'] },
    });
    expect(resolveShowParent(cfg, 'Task', 'Team 1')).toBe(true);
  });

  it('falls back to cardSettingsByTeam when the type is not in the task backlog', () => {
    const cfg = config({
      cardSettingsByTeam: { 'Team 1': { Stories: { Bug: { parent: true, assignedTo: true } } } },
      taskBacklogTypesByTeam: { 'Team 1': ['Task'] },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Team 1')).toBe(true);
  });

  it('falls back to cardSettingsByTeam-only behavior when taskBacklogTypesByTeam is undefined', () => {
    const cfg = config({
      cardSettingsByTeam: { 'Team 1': { Stories: { Task: { parent: false, assignedTo: true } } } },
    });
    expect(resolveShowParent(cfg, 'Task', 'Team 1')).toBe(false);
  });

  it('resolves the task backlog for the same team (selected > default > first) as cardSettingsByTeam', () => {
    const cfg = config({
      defaultTeam: 'Team 1',
      cardSettingsByTeam: {
        'Team 1': { Stories: { Task: { parent: false, assignedTo: true } } },
        'Team 2': { Stories: { Task: { parent: false, assignedTo: true } } },
      },
      taskBacklogTypesByTeam: { 'Team 2': ['Task'] },
    });
    // No selectedTeam -> falls back to defaultTeam ('Team 1'), which has no Task in its task backlog.
    expect(resolveShowParent(cfg, 'Task', undefined)).toBe(false);
    // Explicitly selecting Team 2 -> its task backlog includes Task.
    expect(resolveShowParent(cfg, 'Task', 'Team 2')).toBe(true);
  });
});

describe('resolveShowAssignedTo', () => {
  it('returns false when the type is not found in any board of any team', () => {
    const result = resolveShowAssignedTo(
      config({ cardSettingsByTeam: { 'Team 1': { Stories: { Bug: { parent: true, assignedTo: true } } } } }),
      'Task',
      undefined,
    );
    expect(result).toBe(false);
  });

  it('falls back to defaultTeam when no team is explicitly selected', () => {
    const cfg = config({
      defaultTeam: 'Team 1',
      cardSettingsByTeam: {
        'Team 1': { Stories: { Bug: { parent: false, assignedTo: true } } },
        'Team 2': { Stories: { Bug: { parent: false, assignedTo: false } } },
      },
    });
    expect(resolveShowAssignedTo(cfg, 'Bug', undefined)).toBe(true);
  });

  it('uses the explicitly selected team over defaultTeam', () => {
    const cfg = config({
      defaultTeam: 'Team 1',
      cardSettingsByTeam: {
        'Team 1': { Stories: { Bug: { parent: false, assignedTo: true } } },
        'Team 2': { Stories: { Bug: { parent: false, assignedTo: false } } },
      },
    });
    expect(resolveShowAssignedTo(cfg, 'Bug', 'Team 2')).toBe(false);
  });
});
