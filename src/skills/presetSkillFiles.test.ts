import { describe, it, expect } from 'vitest';
import { buildPresetPlan } from './presetSkillFiles';
import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';

const discovered: DiscoveredBacklogLevels = {
  Stories: { New: 'Proposed', Approved: 'Proposed', Committed: 'InProgress', Done: 'Completed', Removed: 'Removed' },
  Tasks: { 'To Do': 'Proposed', 'In Progress': 'InProgress', Done: 'Completed' },
};

describe('buildPresetPlan', () => {
  it('maps Completed and Removed statuses to null regardless of generateFiles', () => {
    const plan = buildPresetPlan(discovered, true);

    expect(plan.backlogLevels.Stories.Done).toBeNull();
    expect(plan.backlogLevels.Stories.Removed).toBeNull();
  });

  it('generates one shared skill file per level+category when generateFiles is true', () => {
    const plan = buildPresetPlan(discovered, true);

    expect(plan.backlogLevels.Stories.New).toEqual({ path: '.kanbrain/skills/stories-proposed.md' });
    expect(plan.backlogLevels.Stories.Approved).toEqual({ path: '.kanbrain/skills/stories-proposed.md' });
    expect(plan.backlogLevels.Stories.Committed).toEqual({ path: '.kanbrain/skills/stories-inprogress.md' });
    expect(plan.filesToWrite.map(f => f.relativePath)).toEqual([
      '.kanbrain/skills/stories-proposed.md',
      '.kanbrain/skills/stories-inprogress.md',
      '.kanbrain/skills/tasks-proposed.md',
      '.kanbrain/skills/tasks-inprogress.md',
    ]);
  });

  it('maps every non-final status to null and writes no files when generateFiles is false', () => {
    const plan = buildPresetPlan(discovered, false);

    expect(plan.backlogLevels.Stories).toEqual({
      New: null,
      Approved: null,
      Committed: null,
      Done: null,
      Removed: null,
    });
    expect(plan.filesToWrite).toEqual([]);
  });

  it('keeps files from different backlog levels separate even for the same category', () => {
    const plan = buildPresetPlan(discovered, true);

    expect(plan.backlogLevels.Stories.New).not.toEqual(plan.backlogLevels.Tasks['To Do']);
  });
});
