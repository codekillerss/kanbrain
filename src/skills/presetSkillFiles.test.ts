import { describe, it, expect } from 'vitest';
import { buildPresetPlan } from './presetSkillFiles';
import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';

const discovered: DiscoveredBacklogLevels = {
  Stories: { New: 'Proposed', Approved: 'Proposed', Committed: 'InProgress', Done: 'Completed', Removed: 'Removed' },
  Tasks: { 'To Do': 'Proposed', 'In Progress': 'InProgress', Done: 'Completed' },
};

const statusColors = { New: 'b2b2b2', Approved: 'b2b2b2', Committed: 'ffffff', 'To Do': 'b2b2b2', 'In Progress': '007acc' };

describe('buildPresetPlan', () => {
  it('maps Completed and Removed statuses to null regardless of generateFiles', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.backlogLevels.Stories.Done).toBeNull();
    expect(plan.backlogLevels.Stories.Removed).toBeNull();
  });

  it('generates one shared skill file per level+category when generateFiles is true', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.backlogLevels.Stories.New?.path).toBe('.kanbrain/skills/stories-proposed.md');
    expect(plan.backlogLevels.Stories.Approved?.path).toBe('.kanbrain/skills/stories-proposed.md');
    expect(plan.backlogLevels.Stories.Committed?.path).toBe('.kanbrain/skills/stories-inprogress.md');
    expect(plan.filesToWrite.map(f => f.relativePath)).toEqual([
      '.kanbrain/skills/stories-proposed.md',
      '.kanbrain/skills/stories-inprogress.md',
      '.kanbrain/skills/tasks-proposed.md',
      '.kanbrain/skills/tasks-inprogress.md',
    ]);
  });

  it('maps every non-final status to null and writes no files when generateFiles is false', () => {
    const plan = buildPresetPlan(discovered, false, statusColors);

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
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.backlogLevels.Stories.New).not.toEqual(plan.backlogLevels.Tasks['To Do']);
  });

  it('sets a label combining the backlog level and category', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.backlogLevels.Stories.New?.label).toBe('Stories — Proposed');
    expect(plan.backlogLevels.Tasks['In Progress']?.label).toBe('Tasks — InProgress');
  });

  it('sets buttonColor from the status color, without a leading #', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.backlogLevels.Stories.New?.buttonColor).toBe('b2b2b2');
    expect(plan.backlogLevels.Tasks['In Progress']?.buttonColor).toBe('007acc');
  });

  it('falls back to a neutral buttonColor when the status has no known color', () => {
    const plan = buildPresetPlan(discovered, true, {});

    expect(plan.backlogLevels.Stories.New?.buttonColor).toBe('b2b2b2');
  });

  it('sets textColor for readable contrast against buttonColor', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.backlogLevels.Stories.New?.textColor).toBe('000000');
    expect(plan.backlogLevels.Tasks['In Progress']?.textColor).toBe('ffffff');
  });
});
