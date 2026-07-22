import { describe, it, expect } from 'vitest';
import { resolveShowParent } from './resolveShowParent';
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
    const result = resolveShowParent(config({ cardSettingsByBoard: { Stories: { Bug: true } } }), 'Task', undefined);
    expect(result).toBe(false);
  });

  it('returns false when cardSettingsByBoard is undefined', () => {
    expect(resolveShowParent(config(), 'Task', undefined)).toBe(false);
  });

  it('uses the single board that has the type', () => {
    const result = resolveShowParent(config({ cardSettingsByBoard: { Stories: { 'User Story': true } } }), 'User Story', undefined);
    expect(result).toBe(true);
  });

  it('uses the selected board when the type appears in more than one board with different values', () => {
    const cfg = config({
      cardSettingsByBoard: {
        Stories: { Bug: true },
        Sprints: { Bug: false },
      },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Sprints')).toBe(false);
    expect(resolveShowParent(cfg, 'Bug', 'Stories')).toBe(true);
  });

  it('falls back to the first matching board when the selected board does not have the type', () => {
    const cfg = config({
      cardSettingsByBoard: {
        Stories: { Bug: true },
        Sprints: { Bug: false },
      },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Features')).toBe(true);
  });
});
