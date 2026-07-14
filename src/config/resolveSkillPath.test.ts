import { describe, it, expect } from 'vitest';
import { resolveSkillPath } from './resolveSkillPath';
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
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  typeToBacklogLevel: { 'User Story': 'Stories' },
  backlogLevels: {
    Stories: {
      New: '.kanbrain/skills/stories-proposed.md',
      Committed: '.kanbrain/skills/stories-inprogress.md',
      Done: null,
    },
  },
};

describe('resolveSkillPath', () => {
  it("resolves the skill path via the work item type's backlog level and status", () => {
    expect(resolveSkillPath(config, workItem({ status: 'Committed' }))).toBe('.kanbrain/skills/stories-inprogress.md');
  });

  it('returns null when the work item type has no backlog level', () => {
    expect(resolveSkillPath(config, workItem({ type: 'Impediment' }))).toBeNull();
  });

  it('returns null when the status has no skill mapped for that level', () => {
    expect(resolveSkillPath(config, workItem({ status: 'Unknown Status' }))).toBeNull();
  });

  it('returns null when the level explicitly maps the status to null', () => {
    expect(resolveSkillPath(config, workItem({ status: 'Done' }))).toBeNull();
  });
});
