import { describe, it, expect } from 'vitest';
import { buildPresetPlan } from './presetSkillFiles';

const discovered: Record<string, Record<string, string>> = {
  'User Story': { New: 'Proposed', Approved: 'Proposed', Committed: 'InProgress', Done: 'Completed', Removed: 'Removed' },
  Task: { 'To Do': 'Proposed', 'In Progress': 'InProgress', Done: 'Completed' },
};

const statusColors = { New: 'b2b2b2', Approved: 'b2b2b2', Committed: 'ffffff', 'To Do': 'b2b2b2', 'In Progress': '007acc' };

describe('buildPresetPlan', () => {
  it('maps Completed and Removed statuses to null regardless of generateFiles', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.skills['User Story'].Done).toBeNull();
    expect(plan.skills['User Story'].Removed).toBeNull();
  });

  it('generates one skill file per individual status when generateFiles is true', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.skills['User Story'].New?.path).toBe('.kanbrain/skills/userstory-new.md');
    expect(plan.skills['User Story'].Approved?.path).toBe('.kanbrain/skills/userstory-approved.md');
    expect(plan.skills['User Story'].Committed?.path).toBe('.kanbrain/skills/userstory-committed.md');
    expect(plan.filesToWrite.map(f => f.relativePath)).toEqual([
      '.kanbrain/skills/userstory-new.md',
      '.kanbrain/skills/userstory-approved.md',
      '.kanbrain/skills/userstory-committed.md',
      '.kanbrain/skills/task-todo.md',
      '.kanbrain/skills/task-inprogress.md',
    ]);
  });

  it('maps every non-final status to null and writes no files when generateFiles is false', () => {
    const plan = buildPresetPlan(discovered, false, statusColors);

    expect(plan.skills['User Story']).toEqual({
      New: null,
      Approved: null,
      Committed: null,
      Done: null,
      Removed: null,
    });
    expect(plan.filesToWrite).toEqual([]);
  });

  it('keeps files from different types separate even for the same status name', () => {
    const discoveredWithSharedStatusName: Record<string, Record<string, string>> = {
      'User Story': { New: 'Proposed' },
      Task: { New: 'Proposed' },
    };

    const plan = buildPresetPlan(discoveredWithSharedStatusName, true, statusColors);

    expect(plan.skills['User Story'].New?.path).toBe('.kanbrain/skills/userstory-new.md');
    expect(plan.skills.Task.New?.path).toBe('.kanbrain/skills/task-new.md');
  });

  it('sets a label in the form "Execute {status} skill"', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.skills['User Story'].New?.label).toBe('Execute New skill');
    expect(plan.skills.Task['In Progress']?.label).toBe('Execute In Progress skill');
  });

  it('sets buttonColor from the status color, without a leading #', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.skills['User Story'].New?.buttonColor).toBe('b2b2b2');
    expect(plan.skills.Task['In Progress']?.buttonColor).toBe('007acc');
  });

  it('falls back to a neutral buttonColor when the status has no known color', () => {
    const plan = buildPresetPlan(discovered, true, {});

    expect(plan.skills['User Story'].New?.buttonColor).toBe('b2b2b2');
  });

  it('sets textColor for readable contrast against buttonColor', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.skills['User Story'].New?.textColor).toBe('000000');
    expect(plan.skills.Task['In Progress']?.textColor).toBe('ffffff');
  });
});
