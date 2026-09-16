import { describe, it, expect } from 'vitest';
import { resolveWorkflowStep } from './resolveWorkflowStep';
import type { KanbrainConfig, WorkItem } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'T',
    description: '',
    status: 'Committed',
    type: 'User Story',
    url: '',
    parentId: null,
    childIds: [],
    assignedTo: null,
    development: [],
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  defaultTeam: 'MyProject Team',
  skills: {},
  workflowSteps: {
    'User Story': {
      Committed: { skillId: 'inprogress', definitionOfDone: ['PR opened', 'Tests passing'], artifacts: ['Pull request'] },
      Done: null,
    },
  },
  statusColors: {},
  typeColors: {},
  typeIcons: {},
};

describe('resolveWorkflowStep', () => {
  it('resolves the workflow step config for the type and status', () => {
    expect(resolveWorkflowStep(config, workItem({ status: 'Committed' }))).toEqual({
      skillId: 'inprogress',
      definitionOfDone: ['PR opened', 'Tests passing'],
      artifacts: ['Pull request'],
    });
  });

  it('returns null when the type has no workflow steps configured', () => {
    expect(resolveWorkflowStep(config, workItem({ type: 'Impediment' }))).toBeNull();
  });

  it('returns null when the status has no step mapped', () => {
    expect(resolveWorkflowStep(config, workItem({ status: 'Unknown Status' }))).toBeNull();
  });

  it('returns null when the type explicitly maps the status to null', () => {
    expect(resolveWorkflowStep(config, workItem({ status: 'Done' }))).toBeNull();
  });
});
