import { describe, it, expect } from 'vitest';
import { configForStateDiff } from './configForStateDiff';
import { hasStateChanged, serializeState } from './hasStateChanged';
import type { KanbrainConfig } from '../types';

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  defaultTeam: 'MyProject Team',
  skills: {},
  workflowSteps: {},
  statusColors: {},
  typeColors: {},
  typeIcons: {},
};

describe('configForStateDiff', () => {
  it('passes through null unchanged', () => {
    expect(configForStateDiff(null)).toBeNull();
  });

  it('drops searchAssignedToMe but keeps every other field', () => {
    const withFlag: KanbrainConfig = { ...config, searchAssignedToMe: true };
    const stripped = configForStateDiff(withFlag);
    expect(stripped).not.toHaveProperty('searchAssignedToMe');
    expect(stripped).toMatchObject(config);
  });

  it('does not register a state change when only searchAssignedToMe toggles', () => {
    const previous = serializeState(configForStateDiff({ ...config, searchAssignedToMe: false }), { id: 1 }, null, []);
    const changed = hasStateChanged(previous, configForStateDiff({ ...config, searchAssignedToMe: true }), { id: 1 }, null, []);
    expect(changed).toBe(false);
  });

  it('still registers a state change when another config field changes', () => {
    const previous = serializeState(configForStateDiff({ ...config, searchAssignedToMe: true }), { id: 1 }, null, []);
    const changed = hasStateChanged(previous, configForStateDiff({ ...config, searchAssignedToMe: true, defaultTeam: 'Other Team' }), { id: 1 }, null, []);
    expect(changed).toBe(true);
  });
});
