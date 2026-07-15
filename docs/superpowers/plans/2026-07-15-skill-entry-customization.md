# Skill Entry Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each `backlogLevels[level][status]` entry in `.kanbrain/config.json` optionally define a custom button label, text color, and button color — not just a file path.

**Architecture:** `backlogLevels[level][status]` changes from `string | null` to a new `SkillEntry | null` type (`{ path: string; label?: string; textColor?: string; buttonColor?: string }`). This is a single shared type used by six files (`resolveSkillPath.ts`/`render.ts`/`KanbrainViewProvider.ts`/`presetSkillFiles.ts`/`syncConfig.ts`/`checkBoardConfig.ts`), so the type change and every consumer update land together in one task — splitting them further would leave `npm run compile` broken between commits, which is worse for review than one larger, internally-staged task. No migration is needed: the extension is unpublished, so there are no existing users' config files to preserve compatibility with.

**Tech Stack:** TypeScript, Vitest (`npm run test:unit`), `tsc` (`npm run compile`).

## Global Constraints

- `path` is the only required field on `SkillEntry`; `label`, `textColor`, `buttonColor` are all optional.
- Missing or invalid-hex `textColor`/`buttonColor` silently falls back to the VS Code theme's default button colors — same tolerance already used for `typeColors`.
- Missing `label` falls back to the filename derived from `path` — identical to today's only behavior.
- `Kanbrain: Setup` and `Kanbrain: Sync Board Configuration` keep generating `{ path }`-only entries (no label/colors) for new statuses — no new interactive prompts.
- No backward-compatibility code for the old bare-string format — the type is simply `SkillEntry | null`, never `string | null`.

---

### Task 1: Change the skill entry type and update every consumer

**Files:**
- Modify: `src/types.ts`
- Create: `src/config/resolveSkill.ts` (replaces `src/config/resolveSkillPath.ts`)
- Create: `src/config/resolveSkill.test.ts` (replaces `src/config/resolveSkillPath.test.ts`)
- Delete: `src/config/resolveSkillPath.ts`, `src/config/resolveSkillPath.test.ts`
- Modify: `src/view/render.ts`
- Modify: `src/view/render.test.ts`
- Modify: `src/view/KanbrainViewProvider.ts`
- Modify: `src/skills/presetSkillFiles.ts`
- Modify: `src/skills/presetSkillFiles.test.ts`
- Modify: `src/config/syncConfig.ts`
- Modify: `src/config/syncConfig.test.ts`
- Modify: `src/azureDevOps/checkBoardConfig.ts`
- Modify: `src/azureDevOps/checkBoardConfig.test.ts`
- Modify: `src/config/config.test.ts`

**Interfaces:**
- Produces: `SkillEntry` (`src/types.ts`): `{ path: string; label?: string; textColor?: string; buttonColor?: string }`. `KanbrainConfig.backlogLevels: Record<string, Record<string, SkillEntry | null>>`.
- Produces: `resolveSkill(config: KanbrainConfig, workItem: WorkItem): SkillEntry | null` (`src/config/resolveSkill.ts`), replacing `resolveSkillPath`.
- Consumes: `isValidHexColor`/`normalizeHex` (`src/view/badgeColor.ts`, already exists) for the button color/text color handling in `render.ts`.

- [ ] **Step 1: Update the shared type**

Replace the full contents of `src/types.ts`:

```ts
export interface WorkItem {
  id: number;
  title: string;
  description: string;
  status: string;
  type: string;
  url: string;
  parentId: number | null;
  childIds: number[];
}

export interface SkillEntry {
  path: string;
  label?: string;
  textColor?: string;
  buttonColor?: string;
}

export interface KanbrainConfig {
  organization: string;
  project: string;
  typeToBacklogLevel: Record<string, string>;
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
}
```

- [ ] **Step 2: Write the failing test for `resolveSkill`**

Create `src/config/resolveSkill.test.ts`:

```ts
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
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  typeToBacklogLevel: { 'User Story': 'Stories' },
  backlogLevels: {
    Stories: {
      New: { path: '.kanbrain/skills/stories-proposed.md' },
      Committed: { path: '.kanbrain/skills/stories-inprogress.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' },
      Done: null,
    },
  },
  statusColors: {},
  typeColors: {},
  typeIcons: {},
};

describe('resolveSkill', () => {
  it("resolves the full skill entry via the work item type's backlog level and status", () => {
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

  it('returns null when the work item type has no backlog level', () => {
    expect(resolveSkill(config, workItem({ type: 'Impediment' }))).toBeNull();
  });

  it('returns null when the status has no skill mapped for that level', () => {
    expect(resolveSkill(config, workItem({ status: 'Unknown Status' }))).toBeNull();
  });

  it('returns null when the level explicitly maps the status to null', () => {
    expect(resolveSkill(config, workItem({ status: 'Done' }))).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/config/resolveSkill.test.ts`
Expected: FAIL — `Cannot find module './resolveSkill'`.

- [ ] **Step 4: Create `resolveSkill.ts` and remove the old file**

Create `src/config/resolveSkill.ts`:

```ts
import type { KanbrainConfig, SkillEntry, WorkItem } from '../types';

export function resolveSkill(config: KanbrainConfig, workItem: WorkItem): SkillEntry | null {
  const level = config.typeToBacklogLevel[workItem.type];
  if (!level) {
    return null;
  }
  return config.backlogLevels[level]?.[workItem.status] ?? null;
}
```

Run: `rm src/config/resolveSkillPath.ts src/config/resolveSkillPath.test.ts`

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/config/resolveSkill.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Update `render.ts`'s action button**

Replace the import block at the top of `src/view/render.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { resolveSkillPath } from '../config/resolveSkillPath';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
```

with:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { resolveSkill } from '../config/resolveSkill';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { isValidHexColor, normalizeHex } from './badgeColor';
```

Replace `renderActionButton`:

```ts
function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skillPath = resolveSkillPath(config, workItem);
  if (!skillPath) {
    return '';
  }
  const label = skillPath.split('/').pop() ?? skillPath;
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${workItem.id}">▶ ${escapeHtml(label)}</button>`;
}
```

with:

```ts
function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skill = resolveSkill(config, workItem);
  if (!skill) {
    return '';
  }
  const label = skill.label ?? skill.path.split('/').pop() ?? skill.path;
  const textColor = skill.textColor && isValidHexColor(skill.textColor) ? normalizeHex(skill.textColor) : null;
  const buttonColor = skill.buttonColor && isValidHexColor(skill.buttonColor) ? normalizeHex(skill.buttonColor) : null;
  const style =
    buttonColor || textColor
      ? ` style="${buttonColor ? `background: ${buttonColor};` : ''}${textColor ? ` color: ${textColor};` : ''}"`
      : '';
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${workItem.id}"${style}>▶ ${escapeHtml(label)}</button>`;
}
```

- [ ] **Step 7: Update `render.test.ts`'s fixture and add new tests**

In `src/view/render.test.ts`, replace the `config` fixture:

```ts
const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  typeToBacklogLevel: { Task: 'Tasks' },
  backlogLevels: { Tasks: { Active: 'skills/fix.md', Closed: null } },
  statusColors: { Active: 'b2b2b2' },
  typeColors: { Task: 'f2cb1d' },
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};
```

with:

```ts
const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  typeToBacklogLevel: { Task: 'Tasks' },
  backlogLevels: { Tasks: { Active: { path: 'skills/fix.md' }, Closed: null } },
  statusColors: { Active: 'b2b2b2' },
  typeColors: { Task: 'f2cb1d' },
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};
```

Add these tests right before the closing `});` of the `describe('render', ...)` block:

```ts
  it('uses a custom label when the skill entry defines one', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      backlogLevels: { Tasks: { Active: { path: 'skills/fix.md', label: 'Fix it now' }, Closed: null } },
    };
    const html = render({ hasWorkspace: true, config: customConfig, workItem: workItem({ status: 'Active' }), parent: null, subtasks: [] });
    expect(html).toContain('Fix it now');
    expect(html).not.toContain('fix.md');
  });

  it('applies textColor and buttonColor as inline style when valid hex', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      backlogLevels: { Tasks: { Active: { path: 'skills/fix.md', textColor: 'ffffff', buttonColor: '007acc' }, Closed: null } },
    };
    const html = render({ hasWorkspace: true, config: customConfig, workItem: workItem({ status: 'Active' }), parent: null, subtasks: [] });
    expect(html).toContain('background: #007acc;');
    expect(html).toContain('color: #ffffff;');
  });

  it('ignores an invalid hex color and falls back to the theme default', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      backlogLevels: { Tasks: { Active: { path: 'skills/fix.md', buttonColor: 'not-a-color' }, Closed: null } },
    };
    const html = render({ hasWorkspace: true, config: customConfig, workItem: workItem({ status: 'Active' }), parent: null, subtasks: [] });
    const buttonIndex = html.indexOf('data-action="run-skill"');
    const buttonMarkup = html.slice(buttonIndex - 40, buttonIndex + 40);
    expect(buttonMarkup).not.toContain('background:');
  });
```

- [ ] **Step 8: Run the render tests to verify they pass**

Run: `npx vitest run src/view/render.test.ts`
Expected: PASS (16 tests: 13 existing + 3 new)

- [ ] **Step 9: Update `KanbrainViewProvider.ts`'s `runSkill`**

Replace the import:

```ts
import { resolveSkillPath } from '../config/resolveSkillPath';
```

with:

```ts
import { resolveSkill } from '../config/resolveSkill';
```

In `runSkill`, replace:

```ts
    const skillPath = resolveSkillPath(config, workItem);
    if (!skillPath) {
      return;
    }

    const [parent] = workItem.parentId
      ? await this.client.getWorkItems(config.organization, config.project, [workItem.parentId])
      : [];
    const subtasks = await this.client.getChildren(config.organization, config.project, workItem);
    const branch = await this.getCurrentBranch();

    const relativePath = generateContextFile(this.workspaceRoot, skillPath, {
```

with:

```ts
    const skill = resolveSkill(config, workItem);
    if (!skill) {
      return;
    }

    const [parent] = workItem.parentId
      ? await this.client.getWorkItems(config.organization, config.project, [workItem.parentId])
      : [];
    const subtasks = await this.client.getChildren(config.organization, config.project, workItem);
    const branch = await this.getCurrentBranch();

    const relativePath = generateContextFile(this.workspaceRoot, skill.path, {
```

- [ ] **Step 10: Update `presetSkillFiles.ts` and its test**

Replace the top of `src/skills/presetSkillFiles.ts`:

```ts
import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';

export interface PresetPlan {
  backlogLevels: Record<string, Record<string, string | null>>;
  filesToWrite: { relativePath: string; content: string }[];
}
```

with:

```ts
import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';
import type { SkillEntry } from '../types';

export interface PresetPlan {
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  filesToWrite: { relativePath: string; content: string }[];
}
```

Replace `buildPresetPlan`'s body:

```ts
export function buildPresetPlan(discovered: DiscoveredBacklogLevels, generateFiles: boolean): PresetPlan {
  const backlogLevels: Record<string, Record<string, string | null>> = {};
  const filesToWrite: { relativePath: string; content: string }[] = [];
  const pathByKey = new Map<string, string>();

  for (const [levelName, statuses] of Object.entries(discovered)) {
    const statusSkills: Record<string, string | null> = {};

    for (const [statusName, category] of Object.entries(statuses)) {
      if (FINAL_CATEGORIES.has(category) || !generateFiles) {
        statusSkills[statusName] = null;
        continue;
      }

      const key = `${levelName}::${category}`;
      let relativePath = pathByKey.get(key);
      if (!relativePath) {
        relativePath = `.kanbrain/skills/${slugify(levelName)}-${slugify(category)}.md`;
        pathByKey.set(key, relativePath);
        filesToWrite.push({ relativePath, content: skillSkeleton(levelName, category) });
      }
      statusSkills[statusName] = relativePath;
    }

    backlogLevels[levelName] = statusSkills;
  }

  return { backlogLevels, filesToWrite };
}
```

with:

```ts
export function buildPresetPlan(discovered: DiscoveredBacklogLevels, generateFiles: boolean): PresetPlan {
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

      const key = `${levelName}::${category}`;
      let relativePath = pathByKey.get(key);
      if (!relativePath) {
        relativePath = `.kanbrain/skills/${slugify(levelName)}-${slugify(category)}.md`;
        pathByKey.set(key, relativePath);
        filesToWrite.push({ relativePath, content: skillSkeleton(levelName, category) });
      }
      statusSkills[statusName] = { path: relativePath };
    }

    backlogLevels[levelName] = statusSkills;
  }

  return { backlogLevels, filesToWrite };
}
```

In `src/skills/presetSkillFiles.test.ts`, replace:

```ts
  it('generates one shared skill file per level+category when generateFiles is true', () => {
    const plan = buildPresetPlan(discovered, true);

    expect(plan.backlogLevels.Stories.New).toBe('.kanbrain/skills/stories-proposed.md');
    expect(plan.backlogLevels.Stories.Approved).toBe('.kanbrain/skills/stories-proposed.md');
    expect(plan.backlogLevels.Stories.Committed).toBe('.kanbrain/skills/stories-inprogress.md');
    expect(plan.filesToWrite.map(f => f.relativePath)).toEqual([
      '.kanbrain/skills/stories-proposed.md',
      '.kanbrain/skills/stories-inprogress.md',
      '.kanbrain/skills/tasks-proposed.md',
      '.kanbrain/skills/tasks-inprogress.md',
    ]);
  });
```

with:

```ts
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
```

And replace:

```ts
  it('keeps files from different backlog levels separate even for the same category', () => {
    const plan = buildPresetPlan(discovered, true);

    expect(plan.backlogLevels.Stories.New).not.toBe(plan.backlogLevels.Tasks['To Do']);
  });
```

with:

```ts
  it('keeps files from different backlog levels separate even for the same category', () => {
    const plan = buildPresetPlan(discovered, true);

    expect(plan.backlogLevels.Stories.New).not.toEqual(plan.backlogLevels.Tasks['To Do']);
  });
```

(`.not.toBe` compared object references, which are always different — it would have passed even with identical content. `.not.toEqual` actually checks the path differs.)

- [ ] **Step 11: Run the presetSkillFiles tests to verify they pass**

Run: `npx vitest run src/skills/presetSkillFiles.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 12: Update `syncConfig.ts` and its test**

Replace the full contents of `src/config/syncConfig.ts`:

```ts
import type { KanbrainConfig } from '../types';
import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';

export function syncConfig(
  config: KanbrainConfig,
  discovered: DiscoveredBacklogLevels,
  freshTypeToBacklogLevel: Record<string, string>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
): KanbrainConfig {
  const backlogLevels: Record<string, Record<string, string | null>> = {};

  for (const [level, statuses] of Object.entries(discovered)) {
    const existingLevel = config.backlogLevels[level] ?? {};
    const merged: Record<string, string | null> = {};
    for (const status of Object.keys(statuses)) {
      merged[status] = status in existingLevel ? existingLevel[status] : null;
    }
    backlogLevels[level] = merged;
  }

  for (const [level, statuses] of Object.entries(config.backlogLevels)) {
    if (!(level in backlogLevels)) {
      backlogLevels[level] = { ...statuses };
      continue;
    }
    for (const [status, skillPath] of Object.entries(statuses)) {
      if (!(status in backlogLevels[level])) {
        backlogLevels[level][status] = skillPath;
      }
    }
  }

  return {
    organization: config.organization,
    project: config.project,
    typeToBacklogLevel: freshTypeToBacklogLevel,
    backlogLevels,
    statusColors: freshStatusColors,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
  };
}
```

with:

```ts
import type { KanbrainConfig, SkillEntry } from '../types';
import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';

export function syncConfig(
  config: KanbrainConfig,
  discovered: DiscoveredBacklogLevels,
  freshTypeToBacklogLevel: Record<string, string>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
): KanbrainConfig {
  const backlogLevels: Record<string, Record<string, SkillEntry | null>> = {};

  for (const [level, statuses] of Object.entries(discovered)) {
    const existingLevel = config.backlogLevels[level] ?? {};
    const merged: Record<string, SkillEntry | null> = {};
    for (const status of Object.keys(statuses)) {
      merged[status] = status in existingLevel ? existingLevel[status] : null;
    }
    backlogLevels[level] = merged;
  }

  for (const [level, statuses] of Object.entries(config.backlogLevels)) {
    if (!(level in backlogLevels)) {
      backlogLevels[level] = { ...statuses };
      continue;
    }
    for (const [status, skill] of Object.entries(statuses)) {
      if (!(status in backlogLevels[level])) {
        backlogLevels[level][status] = skill;
      }
    }
  }

  return {
    organization: config.organization,
    project: config.project,
    typeToBacklogLevel: freshTypeToBacklogLevel,
    backlogLevels,
    statusColors: freshStatusColors,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
  };
}
```

Replace the full contents of `src/config/syncConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { syncConfig } from './syncConfig';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    typeToBacklogLevel: { Task: 'Tasks' },
    backlogLevels: { Tasks: { 'To Do': { path: '.kanbrain/skills/tasks-todo.md' }, Done: null } },
    statusColors: { 'To Do': 'old-color' },
    typeColors: { Task: 'old-color' },
    typeIcons: { Task: '<svg>old</svg>' },
    ...overrides,
  };
}

describe('syncConfig', () => {
  it('always replaces derived fields with the fresh values', () => {
    const result = syncConfig(
      config(),
      { Tasks: { 'To Do': 'Proposed', Done: 'Completed' } },
      { Task: 'Tasks' },
      { 'To Do': 'new-color' },
      { Task: 'new-color' },
      { Task: '<svg>new</svg>' },
    );

    expect(result.statusColors).toEqual({ 'To Do': 'new-color' });
    expect(result.typeColors).toEqual({ Task: 'new-color' });
    expect(result.typeIcons).toEqual({ Task: '<svg>new</svg>' });
    expect(result.typeToBacklogLevel).toEqual({ Task: 'Tasks' });
  });

  it('keeps organization and project unchanged', () => {
    const result = syncConfig(config(), { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {});
    expect(result.organization).toBe('org');
    expect(result.project).toBe('proj');
  });

  it('preserves an existing skill mapping for a status that still exists on the board', () => {
    const result = syncConfig(config(), { Tasks: { 'To Do': 'Proposed', Done: 'Completed' } }, { Task: 'Tasks' }, {}, {}, {});
    expect(result.backlogLevels.Tasks['To Do']).toEqual({ path: '.kanbrain/skills/tasks-todo.md' });
    expect(result.backlogLevels.Tasks.Done).toBeNull();
  });

  it('defaults a brand new status to null', () => {
    const result = syncConfig(
      config(),
      { Tasks: { 'To Do': 'Proposed', Done: 'Completed', Cancelled: 'Removed' } },
      { Task: 'Tasks' },
      {},
      {},
      {},
    );
    expect(result.backlogLevels.Tasks.Cancelled).toBeNull();
  });

  it('preserves an orphaned status mapping instead of deleting it', () => {
    const withOrphan = config({
      backlogLevels: {
        Tasks: { 'To Do': { path: '.kanbrain/skills/tasks-todo.md' }, Legacy: { path: '.kanbrain/skills/legacy.md' } },
      },
    });
    const result = syncConfig(withOrphan, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {});

    expect(result.backlogLevels.Tasks.Legacy).toEqual({ path: '.kanbrain/skills/legacy.md' });
    expect(result.backlogLevels.Tasks['To Do']).toEqual({ path: '.kanbrain/skills/tasks-todo.md' });
  });

  it('preserves an orphaned backlog level entirely instead of deleting it', () => {
    const withOrphanLevel = config({
      backlogLevels: { Tasks: { 'To Do': null }, Stories: { New: { path: '.kanbrain/skills/stories-new.md' } } },
    });
    const result = syncConfig(withOrphanLevel, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {});

    expect(result.backlogLevels.Stories).toEqual({ New: { path: '.kanbrain/skills/stories-new.md' } });
  });

  it('adds a brand new backlog level with all statuses defaulted to null', () => {
    const result = syncConfig(
      config(),
      { Tasks: { 'To Do': 'Proposed' }, Stories: { New: 'Proposed' } },
      { Task: 'Tasks' },
      {},
      {},
      {},
    );
    expect(result.backlogLevels.Stories).toEqual({ New: null });
  });

  it('preserves label and color customizations on a skill entry that still applies', () => {
    const withCustomization = config({
      backlogLevels: {
        Tasks: { 'To Do': { path: '.kanbrain/skills/tasks-todo.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' } },
      },
    });
    const result = syncConfig(withCustomization, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {});

    expect(result.backlogLevels.Tasks['To Do']).toEqual({
      path: '.kanbrain/skills/tasks-todo.md',
      label: 'Refine',
      textColor: 'ffffff',
      buttonColor: '007acc',
    });
  });
});
```

- [ ] **Step 13: Run the syncConfig tests to verify they pass**

Run: `npx vitest run src/config/syncConfig.test.ts`
Expected: PASS (8 tests: 7 existing + 1 new)

- [ ] **Step 14: Update `checkBoardConfig.ts` and its test**

In `src/azureDevOps/checkBoardConfig.ts`, replace:

```ts
export interface BoardConfigDiff {
  typesRemoved: string[];
  typesAdded: string[];
  typesMoved: { type: string; from: string; to: string }[];
  levelsAdded: string[];
  levelsRemoved: string[];
  statusesAdded: { level: string; status: string }[];
  statusesRemoved: { level: string; status: string; skillPath: string | null }[];
}
```

Leave this interface exactly as-is — the diff report intentionally stays a plain `skillPath: string | null` (see the design spec's rationale: the report only needs to identify which file was mapped, not carry label/colors).

Replace:

```ts
    for (const status of Object.keys(config.backlogLevels[level])) {
      if (!(status in discovered[level])) {
        statusesRemoved.push({ level, status, skillPath: config.backlogLevels[level][status] });
      }
    }
```

with:

```ts
    for (const status of Object.keys(config.backlogLevels[level])) {
      if (!(status in discovered[level])) {
        statusesRemoved.push({ level, status, skillPath: config.backlogLevels[level][status]?.path ?? null });
      }
    }
```

In `src/azureDevOps/checkBoardConfig.test.ts`, replace:

```ts
  it('reports a backlog level removed from the board', () => {
    const diff = diffBoardConfig(
      config({ backlogLevels: { Tasks: { 'To Do': null }, Stories: { New: '.kanbrain/skills/x.md' } } }),
      discovered,
      freshTypeToBacklogLevel,
    );
    expect(diff.levelsRemoved).toEqual(['Stories']);
  });
```

with:

```ts
  it('reports a backlog level removed from the board', () => {
    const diff = diffBoardConfig(
      config({ backlogLevels: { Tasks: { 'To Do': null }, Stories: { New: { path: '.kanbrain/skills/x.md' } } } }),
      discovered,
      freshTypeToBacklogLevel,
    );
    expect(diff.levelsRemoved).toEqual(['Stories']);
  });
```

And replace:

```ts
  it('reports a status removed within an existing backlog level, including its skill path', () => {
    const diff = diffBoardConfig(
      config({ backlogLevels: { Tasks: { 'To Do': null, Done: null, Cancelled: '.kanbrain/skills/tasks-cancelled.md' } } }),
      discovered,
      freshTypeToBacklogLevel,
    );
    expect(diff.statusesRemoved).toEqual([{ level: 'Tasks', status: 'Cancelled', skillPath: '.kanbrain/skills/tasks-cancelled.md' }]);
  });
```

with:

```ts
  it('reports a status removed within an existing backlog level, including its skill path', () => {
    const diff = diffBoardConfig(
      config({
        backlogLevels: { Tasks: { 'To Do': null, Done: null, Cancelled: { path: '.kanbrain/skills/tasks-cancelled.md' } } },
      }),
      discovered,
      freshTypeToBacklogLevel,
    );
    expect(diff.statusesRemoved).toEqual([{ level: 'Tasks', status: 'Cancelled', skillPath: '.kanbrain/skills/tasks-cancelled.md' }]);
  });
```

- [ ] **Step 15: Run the checkBoardConfig tests to verify they pass**

Run: `npx vitest run src/azureDevOps/checkBoardConfig.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 16: Update the `config.test.ts` fixture**

In `src/config/config.test.ts`, replace:

```ts
  it('returns the parsed config when the file exists', () => {
    const config = {
      organization: 'my-org',
      project: 'MyProject',
      typeToBacklogLevel: { Task: 'Tasks' },
      backlogLevels: { Tasks: { New: '.kanbrain/skills/a.md' } },
      statusColors: { New: 'b2b2b2' },
      typeColors: { Task: 'f2cb1d' },
      typeIcons: { Task: '<svg></svg>' },
    };
    writeConfig(workspaceRoot, config);
    expect(readConfig(workspaceRoot)).toEqual(config);
  });
```

with:

```ts
  it('returns the parsed config when the file exists', () => {
    const config = {
      organization: 'my-org',
      project: 'MyProject',
      typeToBacklogLevel: { Task: 'Tasks' },
      backlogLevels: { Tasks: { New: { path: '.kanbrain/skills/a.md' } } },
      statusColors: { New: 'b2b2b2' },
      typeColors: { Task: 'f2cb1d' },
      typeIcons: { Task: '<svg></svg>' },
    };
    writeConfig(workspaceRoot, config);
    expect(readConfig(workspaceRoot)).toEqual(config);
  });
```

- [ ] **Step 17: Compile and run the full unit test suite**

Run: `npm run compile`
Expected: succeeds with no errors — this confirms every consumer of the old `string | null` shape and the old `resolveSkillPath` name has been updated.

Run: `npm run test:unit`
Expected: PASS — all tests across the project.

- [ ] **Step 18: Commit**

```bash
git add src/types.ts src/config/resolveSkill.ts src/config/resolveSkill.test.ts src/view/render.ts src/view/render.test.ts src/view/KanbrainViewProvider.ts src/skills/presetSkillFiles.ts src/skills/presetSkillFiles.test.ts src/config/syncConfig.ts src/config/syncConfig.test.ts src/azureDevOps/checkBoardConfig.ts src/azureDevOps/checkBoardConfig.test.ts src/config/config.test.ts
git add -u src/config/resolveSkillPath.ts src/config/resolveSkillPath.test.ts
git commit -m "feat: let skill entries customize their button label and colors"
```

(The second `git add -u` stages the deletion of the two renamed files — `git add -u` stages modifications/deletions of already-tracked paths.)

---

### Task 2: Update the README

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Update the example `config.json` and the surrounding prose**

Replace:

```
4. Edit the generated skill files and, if needed, `.kanbrain/config.json`'s `backlogLevels` map (`{ [backlogLevel]: { [status]: skillPathOrNull } }`) to fine-tune which skill runs for which status:

   ```json
   {
     "organization": "my-org",
     "project": "MyProject",
     "typeToBacklogLevel": {
       "Epic": "Epics",
       "User Story": "Stories",
       "Bug": "Stories",
       "Task": "Tasks"
     },
     "backlogLevels": {
       "Stories": {
         "New": ".kanbrain/skills/stories-proposed.md",
         "Committed": ".kanbrain/skills/stories-inprogress.md",
         "Done": null
       },
       "Tasks": {
         "To Do": ".kanbrain/skills/tasks-proposed.md",
         "In Progress": ".kanbrain/skills/tasks-inprogress.md",
         "Done": null
       }
     },
     "statusColors": {
       "New": "b2b2b2",
       "Committed": "007acc",
       "Done": "339933"
     },
     "typeColors": {
       "Task": "f2cb1d",
       "Bug": "cc293d"
     },
     "typeIcons": {
       "Task": "<svg>...</svg>",
       "Bug": "<svg>...</svg>"
     }
   }
   ```

   `statusColors` maps each status name to the hex color Azure DevOps assigns it (shown as a small dot next to the status text). `typeColors` colors the right border of each work item card, and `typeIcons` holds the real work item type icon as inline SVG markup shown next to the `#id` — both fetched and sanitized during Setup. All three are captured automatically during Setup — projects configured before these fields existed need to re-run **Kanbrain: Setup** to get colors/icons.
```

with:

```
4. Edit the generated skill files and, if needed, `.kanbrain/config.json`'s `backlogLevels` map (`{ [backlogLevel]: { [status]: skillEntryOrNull } }`) to fine-tune which skill runs for which status:

   ```json
   {
     "organization": "my-org",
     "project": "MyProject",
     "typeToBacklogLevel": {
       "Epic": "Epics",
       "User Story": "Stories",
       "Bug": "Stories",
       "Task": "Tasks"
     },
     "backlogLevels": {
       "Stories": {
         "New": { "path": ".kanbrain/skills/stories-proposed.md" },
         "Committed": {
           "path": ".kanbrain/skills/stories-inprogress.md",
           "label": "Refine",
           "textColor": "ffffff",
           "buttonColor": "007acc"
         },
         "Done": null
       },
       "Tasks": {
         "To Do": { "path": ".kanbrain/skills/tasks-proposed.md" },
         "In Progress": { "path": ".kanbrain/skills/tasks-inprogress.md" },
         "Done": null
       }
     },
     "statusColors": {
       "New": "b2b2b2",
       "Committed": "007acc",
       "Done": "339933"
     },
     "typeColors": {
       "Task": "f2cb1d",
       "Bug": "cc293d"
     },
     "typeIcons": {
       "Task": "<svg>...</svg>",
       "Bug": "<svg>...</svg>"
     }
   }
   ```

   Each `backlogLevels[level][status]` entry is either `null` (no action for that status) or an object with a required `path` (relative to the workspace root) and three optional fields: `label` (overrides the button text — defaults to the skill file's name), `textColor` and `buttonColor` (hex, no `#` needed — override the button's text/background color; an invalid or missing value falls back to the VS Code theme's default button colors). `Kanbrain: Setup` and `Kanbrain: Sync Board Configuration` only ever generate `{ "path": ... }` entries — add `label`/`textColor`/`buttonColor` by hand for the statuses you want to customize.

   `statusColors` maps each status name to the hex color Azure DevOps assigns it (shown as a small dot next to the status text). `typeColors` colors the right border of each work item card, and `typeIcons` holds the real work item type icon as inline SVG markup shown next to the `#id` — both fetched and sanitized during Setup. All three are captured automatically during Setup — projects configured before these fields existed need to re-run **Kanbrain: Setup** to get colors/icons.
```

- [ ] **Step 2: Add a manual verification checklist item**

After the existing line:

```
- [ ] A status with a configured skill shows an action button; a status without one does not.
```

insert:

```
- [ ] A skill entry with a custom `label` shows that text on the action button instead of the skill file's name; a valid `textColor`/`buttonColor` is applied to the button, and an invalid or missing one falls back to the theme's default button colors.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/plans/2026-07-15-skill-entry-customization.md
git commit -m "docs: document customizable skill entry label and colors"
```
