# Skill preset per status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `buildPresetPlan` generates one skill file, one `config.json` entry, and one button label per individual work item status — instead of grouping statuses by their shared Azure DevOps state category.

**Architecture:** Single pure function (`src/skills/presetSkillFiles.ts`) changes its grouping key from `level::category` to `level::status`. `category` remains used only to detect final states (`Completed`/`Removed` → no skill). No other module changes — `resolveSkill.ts`, `syncConfig.ts`, and the runtime already key everything by literal status.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- No retrocompatibility/migration needed for existing `config.json` files — spec explicitly scopes this out (see `docs/superpowers/specs/2026-07-21-skill-preset-per-status-design.md`, "Fora do escopo").
- Button label format is exactly `` `Execute ${statusName} skill` `` — no backlog level or category name in the label.
- File path format is exactly `` `.kanbrain/skills/${slugify(levelName)}-${slugify(statusName)}.md` `` using the existing `slugify` (lowercase, strip whitespace — no hyphenation change).
- Skeleton header is exactly `` `# Skill: ${levelName} — ${statusName}` ``.
- `Completed`/`Removed` categories still map every status in them to `null` regardless of `generateFiles` — unchanged from today.

---

### Task 1: Group `buildPresetPlan` by status instead of category

**Files:**
- Modify: `src/skills/presetSkillFiles.ts`
- Test: `src/skills/presetSkillFiles.test.ts`

**Interfaces:**
- Consumes: `DiscoveredBacklogLevels = Record<string, Record<string, string>>` (level → status name → category) from `src/azureDevOps/backlogLevels.ts` (unchanged).
- Produces: `PresetPlan { backlogLevels: Record<string, Record<string, SkillEntry | null>>; filesToWrite: { relativePath: string; content: string }[] }` (unchanged shape) — consumed by `src/commands/setup.ts` and `src/commands/syncBoardConfig.ts` (neither needs changes; they only read `plan.backlogLevels` and `plan.filesToWrite`).

- [ ] **Step 1: Replace the test file with the updated expectations (RED)**

Overwrite `src/skills/presetSkillFiles.test.ts` with:

```ts
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

  it('generates one skill file per individual status when generateFiles is true', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.backlogLevels.Stories.New?.path).toBe('.kanbrain/skills/stories-new.md');
    expect(plan.backlogLevels.Stories.Approved?.path).toBe('.kanbrain/skills/stories-approved.md');
    expect(plan.backlogLevels.Stories.Committed?.path).toBe('.kanbrain/skills/stories-committed.md');
    expect(plan.filesToWrite.map(f => f.relativePath)).toEqual([
      '.kanbrain/skills/stories-new.md',
      '.kanbrain/skills/stories-approved.md',
      '.kanbrain/skills/stories-committed.md',
      '.kanbrain/skills/tasks-todo.md',
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

  it('keeps files from different backlog levels separate even for the same status name', () => {
    const discoveredWithSharedStatusName: DiscoveredBacklogLevels = {
      Stories: { New: 'Proposed' },
      Tasks: { New: 'Proposed' },
    };

    const plan = buildPresetPlan(discoveredWithSharedStatusName, true, statusColors);

    expect(plan.backlogLevels.Stories.New?.path).toBe('.kanbrain/skills/stories-new.md');
    expect(plan.backlogLevels.Tasks.New?.path).toBe('.kanbrain/skills/tasks-new.md');
  });

  it('sets a label in the form "Execute {status} skill"', () => {
    const plan = buildPresetPlan(discovered, true, statusColors);

    expect(plan.backlogLevels.Stories.New?.label).toBe('Execute New skill');
    expect(plan.backlogLevels.Tasks['In Progress']?.label).toBe('Execute In Progress skill');
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
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `npx vitest run src/skills/presetSkillFiles.test.ts`

Expected: FAIL — specifically the "generates one skill file per individual status" test (path assertions like `.kanbrain/skills/stories-new.md` don't match the current category-grouped output `.kanbrain/skills/stories-proposed.md`) and the "sets a label" test (expects `'Execute New skill'`, gets `'Stories — Proposed'`). The other tests (Completed/Removed null, generateFiles false, buttonColor/textColor) should still pass unchanged — confirm they do, since they're unaffected by the grouping key.

- [ ] **Step 3: Rewrite `src/skills/presetSkillFiles.ts` (GREEN)**

Overwrite `src/skills/presetSkillFiles.ts` with:

```ts
import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';
import type { SkillEntry } from '../types';
import { isValidHexColor, normalizeHex, pickReadableTextColor } from '../view/badgeColor';

export interface PresetPlan {
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  filesToWrite: { relativePath: string; content: string }[];
}

const FINAL_CATEGORIES = new Set(['Completed', 'Removed']);
const NEUTRAL_BUTTON_COLOR = 'b2b2b2';

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function skillSkeleton(levelName: string, statusName: string): string {
  return `# Skill: ${levelName} — ${statusName}

Work item: {{title}} (#{{id}})
Status: {{status}}
Description: {{description}}

Subtasks:
{{subtasks}}

## Instructions
Describe here what the agent should do when the work item is in this status.
`;
}

function buildStatusSkillEntry(
  relativePath: string,
  statusName: string,
  statusColors: Record<string, string>,
): SkillEntry {
  const rawColor = statusColors[statusName];
  const buttonColor = rawColor && isValidHexColor(rawColor) ? rawColor.replace(/^#/, '') : NEUTRAL_BUTTON_COLOR;
  const textColor = pickReadableTextColor(normalizeHex(buttonColor)).replace(/^#/, '');
  return {
    path: relativePath,
    label: `Execute ${statusName} skill`,
    textColor,
    buttonColor,
  };
}

export function buildPresetPlan(
  discovered: DiscoveredBacklogLevels,
  generateFiles: boolean,
  statusColors: Record<string, string>,
): PresetPlan {
  const backlogLevels: Record<string, Record<string, SkillEntry | null>> = {};
  const filesToWrite: { relativePath: string; content: string }[] = [];
  const pathByKey = new Map<string, string>();

  for (const [levelName, statuses] of Object.entries(discovered)) {
    const statusSkills: Record<string, SkillEntry | null> = {};

    for (const [statusName, category] of Object.entries(statuses)) {
      if (FINAL_CATEGORIES.has(category) || !generateFiles) {
        statusSkills[statusName] = null;
        continue;
      }

      const key = `${levelName}::${statusName}`;
      let relativePath = pathByKey.get(key);
      if (!relativePath) {
        relativePath = `.kanbrain/skills/${slugify(levelName)}-${slugify(statusName)}.md`;
        pathByKey.set(key, relativePath);
        filesToWrite.push({ relativePath, content: skillSkeleton(levelName, statusName) });
      }
      statusSkills[statusName] = buildStatusSkillEntry(relativePath, statusName, statusColors);
    }

    backlogLevels[levelName] = statusSkills;
  }

  return { backlogLevels, filesToWrite };
}
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/skills/presetSkillFiles.test.ts`

Expected: PASS, all 8 tests green.

- [ ] **Step 5: Run the full test suite and typecheck to check for regressions**

Run: `npx vitest run && npx tsc --noEmit`

Expected: All existing tests still pass (no other file imports `buildStatusSkillEntry`/`skillSkeleton` directly — they're private to this module), and `tsc` reports no errors. In particular confirm `src/commands/setup.ts` and `src/commands/syncBoardConfig.ts` still typecheck, since they consume `PresetPlan` (its shape didn't change).

- [ ] **Step 6: Commit**

```bash
git add src/skills/presetSkillFiles.ts src/skills/presetSkillFiles.test.ts
git commit -m "feat: generate one preset skill file per status instead of per category"
```

---

### Task 2: Update README documentation to match the new preset behavior

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only, no code interfaces.

- [ ] **Step 1: Update the Setup flow description**

Find the line describing what Setup asks (around the Setup numbered flow, currently reads roughly):

```
3. Setup reads the project's real backlog levels (Epics/Features/Stories/Tasks, or whatever your process defines) and state categories from Azure DevOps, then asks whether to generate placeholder skill files automatically for each category (Proposed/InProgress/Resolved). This creates `.kanbrain/config.json` (commit it — it's shared team config) and, if you said yes, one skill file per backlog level + category under `.kanbrain/skills/`.
```

Replace with:

```
3. Setup reads the project's real backlog levels (Epics/Features/Stories/Tasks, or whatever your process defines) and states from Azure DevOps, then asks whether to generate placeholder skill files automatically for each individual status. This creates `.kanbrain/config.json` (commit it — it's shared team config) and, if you said yes, one skill file per backlog level + status under `.kanbrain/skills/`.
```

- [ ] **Step 2: Update the manual verification checklist entries**

Find (in the manual checklist section):

```
- [ ] `Kanbrain: Setup`, after picking a project, asks whether to generate placeholder skill files per backlog level/category, and writes `backlogLevels`/`typeToBacklogLevel` reflecting the project's real process either way.
- [ ] Answering "Yes" creates one skill file per backlog level + category (Proposed/InProgress/Resolved) under `.kanbrain/skills/`, and `Done`/`Removed`-category statuses map to `null`.
```

Replace with:

```
- [ ] `Kanbrain: Setup`, after picking a project, asks whether to generate placeholder skill files per backlog level/status, and writes `backlogLevels`/`typeToBacklogLevel` reflecting the project's real process either way.
- [ ] Answering "Yes" creates one skill file per backlog level + status under `.kanbrain/skills/`, and `Done`/`Removed`-category statuses map to `null`.
```

Find (in the Config screen checklist entry):

```
- [ ] After running `Kanbrain: Setup` with placeholder skill file generation enabled, the Config screen shows each generated entry already filled in with a label (`"{backlog level} — {category}"`), a `buttonColor` matching that status's real color from Azure DevOps, and a `textColor` that reads clearly against it (not the same color as the background).
```

Replace with:

```
- [ ] After running `Kanbrain: Setup` with placeholder skill file generation enabled, the Config screen shows each generated entry already filled in with a label (`"Execute {status} skill"`), a `buttonColor` matching that status's real color from Azure DevOps, and a `textColor` that reads clearly against it (not the same color as the background).
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe per-status skill preset generation"
```
