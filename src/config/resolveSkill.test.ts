import { describe, it, expect } from 'vitest';
import { resolveSkill } from './resolveSkill';
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
  skills: {
    proposed: { path: '.kanbrain/skills/stories-proposed.md' },
    inprogress: { path: '.kanbrain/skills/stories-inprogress.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' },
  },
  workflowSteps: {
    'User Story': {
      New: { skillId: 'proposed' },
      Committed: { skillId: 'inprogress' },
      Done: null,
    },
  },
  statusColors: {},
  typeColors: {},
  typeIcons: {},
};

describe('resolveSkill', () => {
  it("resolves the full skill entry via the work item's type and status", () => {
    expect(resolveSkill(config, workItem({ status: 'New' }))).toEqual({ path: '.kanbrain/skills/stories-proposed.md' });
  });

  it('includes label and color overrides when present', () => {
    expect(resolveSkill(config, workItem({ status: 'Committed' }))).toEqual({
      path: '.kanbrain/skills/stories-inprogress.md',
      label: 'Refine',
      textColor: 'ffffff',
      buttonColor: '007acc',
    });
  });

  it('returns null when the work item type has no workflow step mapping at all', () => {
    expect(resolveSkill(config, workItem({ type: 'Impediment' }))).toBeNull();
  });

  it('returns null when the status has no step mapped for that type', () => {
    expect(resolveSkill(config, workItem({ status: 'Unknown Status' }))).toBeNull();
  });

  it('returns null when the type explicitly maps the status to null', () => {
    expect(resolveSkill(config, workItem({ status: 'Done' }))).toBeNull();
  });

  it('returns null when the step has no skillId set', () => {
    const withEmptyStep: KanbrainConfig = {
      ...config,
      workflowSteps: { 'User Story': { New: { skillId: null } } },
    };
    expect(resolveSkill(withEmptyStep, workItem({ status: 'New' }))).toBeNull();
  });

  it('returns null when the step references a skillId missing from the registry', () => {
    const withDanglingSkillId: KanbrainConfig = {
      ...config,
      workflowSteps: { 'User Story': { New: { skillId: 'ghost' } } },
    };
    expect(resolveSkill(withDanglingSkillId, workItem({ status: 'New' }))).toBeNull();
  });
});
