# Backlog-Level Status Skill Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Kanbrain: Setup` discovers the real backlog levels and state categories of the user's Azure DevOps project and uses them to pre-populate `.kanbrain/config.json`'s status→skill mapping, optionally generating placeholder skill files per backlog level + category.

**Architecture:** Two new pure/testable modules (`src/azureDevOps/backlogLevels.ts` for discovery, `src/skills/presetSkillFiles.ts` for turning discovery into a write plan) feed into `src/commands/setup.ts`. The config schema (`KanbrainConfig`) moves from a flat `statusSkills` map to `backlogLevels` (per-level status map) + `typeToBacklogLevel` (work item type → level). A new pure lookup, `src/config/resolveSkillPath.ts`, replaces every direct `config.statusSkills[...]` read at runtime.

**Tech Stack:** TypeScript, vitest (unit tests), VS Code Extension API, Azure DevOps REST API (`api-version=7.1`).

## Global Constraints

- All new Azure DevOps REST calls use `api-version=7.1`, matching every existing call in `src/azureDevOps/client.ts`.
- Skill file paths stored in `config.json` are workspace-root-relative and include the `.kanbrain/` prefix (e.g. `.kanbrain/skills/stories-proposed.md`), matching the convention `generateContextFile` and the README already use — not level-relative paths.
- No backwards-compatibility shim for the old `statusSkills` schema — this is a pre-1.0 project with no config files to migrate.
- Follow existing code style: no comments except where a non-obvious constraint justifies one (see existing files for tone).

---

### Task 1: Backlog level discovery (pure module)

**Files:**
- Create: `src/azureDevOps/backlogLevels.ts`
- Test: `src/azureDevOps/backlogLevels.test.ts`

**Interfaces:**
- Produces: `BacklogLevel { name: string; workItemTypes: string[] }`, `WorkItemTypeState { name: string; category: string }`, `DiscoveredBacklogLevels = Record<string, Record<string, string>>` (level name → status name → category), `discoverBacklogLevelStates(levels: BacklogLevel[], statesByType: Record<string, WorkItemTypeState[]>): DiscoveredBacklogLevels`, `buildTypeToBacklogLevel(levels: BacklogLevel[], knownTypes: Set<string>): Record<string, string>`.

- [ ] **Step 1: Write the failing test**

Create `src/azureDevOps/backlogLevels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { discoverBacklogLevelStates, buildTypeToBacklogLevel, type BacklogLevel, type WorkItemTypeState } from './backlogLevels';

const levels: BacklogLevel[] = [
  { name: 'Stories', workItemTypes: ['User Story', 'Bug'] },
  { name: 'Tasks', workItemTypes: ['Task'] },
];

const statesByType: Record<string, WorkItemTypeState[]> = {
  'User Story': [
    { name: 'New', category: 'Proposed' },
    { name: 'Committed', category: 'InProgress' },
    { name: 'Done', category: 'Completed' },
  ],
  Bug: [
    { name: 'New', category: 'Proposed' },
    { name: 'Active', category: 'InProgress' },
    { name: 'Resolved', category: 'Resolved' },
    { name: 'Closed', category: 'Completed' },
  ],
  Task: [
    { name: 'To Do', category: 'Proposed' },
    { name: 'In Progress', category: 'InProgress' },
    { name: 'Done', category: 'Completed' },
  ],
};

describe('discoverBacklogLevelStates', () => {
  it('merges states from every work item type into their backlog level', () => {
    const discovered = discoverBacklogLevelStates(levels, statesByType);

    expect(discovered.Stories).toEqual({
      New: 'Proposed',
      Committed: 'InProgress',
      Done: 'Completed',
      Active: 'InProgress',
      Resolved: 'Resolved',
      Closed: 'Completed',
    });
    expect(discovered.Tasks).toEqual({
      'To Do': 'Proposed',
      'In Progress': 'InProgress',
      Done: 'Completed',
    });
  });

  it('omits a backlog level when none of its work item types have known states', () => {
    const discovered = discoverBacklogLevelStates([{ name: 'Epics', workItemTypes: ['Epic'] }], {});

    expect(discovered.Epics).toBeUndefined();
  });

  it('skips a work item type with no known states but keeps the rest of the level', () => {
    const discovered = discoverBacklogLevelStates(
      [{ name: 'Stories', workItemTypes: ['User Story', 'Bug'] }],
      { 'User Story': statesByType['User Story'] },
    );

    expect(discovered.Stories).toEqual({ New: 'Proposed', Committed: 'InProgress', Done: 'Completed' });
  });
});

describe('buildTypeToBacklogLevel', () => {
  it('maps each known work item type to its backlog level name', () => {
    const result = buildTypeToBacklogLevel(levels, new Set(['User Story', 'Bug', 'Task']));

    expect(result).toEqual({ 'User Story': 'Stories', Bug: 'Stories', Task: 'Tasks' });
  });

  it('excludes work item types that are not in knownTypes', () => {
    const result = buildTypeToBacklogLevel(levels, new Set(['User Story']));

    expect(result).toEqual({ 'User Story': 'Stories' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/azureDevOps/backlogLevels.test.ts`
Expected: FAIL — `Cannot find module './backlogLevels'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/azureDevOps/backlogLevels.ts`:

```ts
export interface BacklogLevel {
  name: string;
  workItemTypes: string[];
}

export interface WorkItemTypeState {
  name: string;
  category: string;
}

export type DiscoveredBacklogLevels = Record<string, Record<string, string>>;

export function discoverBacklogLevelStates(
  levels: BacklogLevel[],
  statesByType: Record<string, WorkItemTypeState[]>,
): DiscoveredBacklogLevels {
  const result: DiscoveredBacklogLevels = {};

  for (const level of levels) {
    const statuses: Record<string, string> = {};
    for (const type of level.workItemTypes) {
      const states = statesByType[type];
      if (!states) {
        continue;
      }
      for (const state of states) {
        statuses[state.name] = state.category;
      }
    }
    if (Object.keys(statuses).length > 0) {
      result[level.name] = statuses;
    }
  }

  return result;
}

export function buildTypeToBacklogLevel(levels: BacklogLevel[], knownTypes: Set<string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const level of levels) {
    for (const type of level.workItemTypes) {
      if (knownTypes.has(type)) {
        result[type] = level.name;
      }
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/azureDevOps/backlogLevels.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/backlogLevels.ts src/azureDevOps/backlogLevels.test.ts
git commit -m "feat: add backlog level and state category discovery"
```

---

### Task 2: Azure DevOps client — backlog levels & work item type states

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: `BacklogLevel`, `WorkItemTypeState` from Task 1 (`./backlogLevels`).
- Produces: `AzureDevOpsClient.listBacklogLevels(organization: string, project: string): Promise<BacklogLevel[]>`, `AzureDevOpsClient.listWorkItemTypeStates(organization: string, project: string, type: string): Promise<WorkItemTypeState[]>`.

- [ ] **Step 1: Write the failing tests**

Add to `src/azureDevOps/client.test.ts` (inside the existing `describe('AzureDevOpsClient', ...)` block, after the `getChildren` test):

```ts
  it('lists backlog levels, skipping hidden ones and ones without work item types', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { name: 'Epics', isHidden: false, workItemTypes: [{ name: 'Epic' }] },
          { name: 'Stories', isHidden: false, workItemTypes: [{ name: 'User Story' }, { name: 'Bug' }] },
          { name: 'Hidden Level', isHidden: true, workItemTypes: [{ name: 'Ghost' }] },
          { name: 'Empty Level', isHidden: false, workItemTypes: [] },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const levels = await client.listBacklogLevels('my-org', 'MyProject');

    expect(levels).toEqual([
      { name: 'Epics', workItemTypes: ['Epic'] },
      { name: 'Stories', workItemTypes: ['User Story', 'Bug'] },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/work/backlogs?api-version=7.1',
      expect.anything(),
    );
  });

  it('lists states for a work item type', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ value: [{ name: 'New', category: 'Proposed' }, { name: 'Done', category: 'Completed' }] }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const states = await client.listWorkItemTypeStates('my-org', 'MyProject', 'User Story');

    expect(states).toEqual([
      { name: 'New', category: 'Proposed' },
      { name: 'Done', category: 'Completed' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workitemtypes/User%20Story/states?api-version=7.1',
      expect.anything(),
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: FAIL — `client.listBacklogLevels is not a function` / `client.listWorkItemTypeStates is not a function`.

- [ ] **Step 3: Implement the two methods**

In `src/azureDevOps/client.ts`, add the import and the two methods (insert the methods after `getChildren`, before the closing `}` of the class):

```ts
import type { BacklogLevel, WorkItemTypeState } from './backlogLevels';
```

```ts
  async listBacklogLevels(organization: string, project: string): Promise<BacklogLevel[]> {
    const data = await this.request<{
      value: { name: string; isHidden?: boolean; workItemTypes?: { name: string }[] }[];
    }>(`https://dev.azure.com/${organization}/${project}/_apis/work/backlogs?api-version=7.1`);
    return data.value
      .filter(level => !level.isHidden && (level.workItemTypes?.length ?? 0) > 0)
      .map(level => ({ name: level.name, workItemTypes: (level.workItemTypes ?? []).map(t => t.name) }));
  }

  async listWorkItemTypeStates(organization: string, project: string, type: string): Promise<WorkItemTypeState[]> {
    const data = await this.request<{ value: { name: string; category: string }[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states?api-version=7.1`,
    );
    return data.value.map(s => ({ name: s.name, category: s.category }));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: fetch backlog levels and work item type states from Azure DevOps"
```

---

### Task 3: Skill preset planning (pure module)

**Files:**
- Create: `src/skills/presetSkillFiles.ts`
- Test: `src/skills/presetSkillFiles.test.ts`

**Interfaces:**
- Consumes: `DiscoveredBacklogLevels` from Task 1 (`../azureDevOps/backlogLevels`).
- Produces: `PresetPlan { backlogLevels: Record<string, Record<string, string | null>>; filesToWrite: { relativePath: string; content: string }[] }`, `buildPresetPlan(discovered: DiscoveredBacklogLevels, generateFiles: boolean): PresetPlan`.

- [ ] **Step 1: Write the failing test**

Create `src/skills/presetSkillFiles.test.ts`:

```ts
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

    expect(plan.backlogLevels.Stories.New).not.toBe(plan.backlogLevels.Tasks['To Do']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/skills/presetSkillFiles.test.ts`
Expected: FAIL — `Cannot find module './presetSkillFiles'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/skills/presetSkillFiles.ts`:

```ts
import type { DiscoveredBacklogLevels } from '../azureDevOps/backlogLevels';

export interface PresetPlan {
  backlogLevels: Record<string, Record<string, string | null>>;
  filesToWrite: { relativePath: string; content: string }[];
}

const FINAL_CATEGORIES = new Set(['Completed', 'Removed']);

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function skillSkeleton(levelName: string, category: string): string {
  return `# Skill: ${levelName} — ${category}

Work item: {{title}} (#{{id}})
Status: {{status}}
Descrição: {{description}}

Subtasks:
{{subtasks}}

## Instruções
Descreva aqui o que o agente deve fazer quando o work item estiver neste status.
`;
}

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/skills/presetSkillFiles.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/skills/presetSkillFiles.ts src/skills/presetSkillFiles.test.ts
git commit -m "feat: plan skill file generation from discovered backlog levels"
```

---

### Task 4: Config schema migration + runtime wiring + Setup command integration

This task changes `KanbrainConfig`'s shape, so every file that reads `config.statusSkills` must move to the new shape in the same commit — the project won't compile with the change half-applied. Do all steps below before running the final verification or committing.

**Files:**
- Modify: `src/types.ts`
- Create: `src/config/resolveSkillPath.ts`
- Test: `src/config/resolveSkillPath.test.ts`
- Modify: `src/view/render.ts`
- Modify: `src/view/render.test.ts`
- Modify: `src/view/KanbrainViewProvider.ts`
- Modify: `src/config/config.test.ts`
- Modify: `src/commands/setup.ts`

**Interfaces:**
- Consumes: `discoverBacklogLevelStates`, `buildTypeToBacklogLevel` (Task 1), `WorkItemTypeState` (Task 1), `buildPresetPlan` (Task 3), `AzureDevOpsClient.listBacklogLevels`/`listWorkItemTypeStates` (Task 2).
- Produces: `KanbrainConfig { organization: string; project: string; typeToBacklogLevel: Record<string, string>; backlogLevels: Record<string, Record<string, string | null>> }`, `resolveSkillPath(config: KanbrainConfig, workItem: WorkItem): string | null`.

- [ ] **Step 1: Update the config type**

In `src/types.ts`, replace the `KanbrainConfig` interface:

```ts
export interface KanbrainConfig {
  organization: string;
  project: string;
  typeToBacklogLevel: Record<string, string>;
  backlogLevels: Record<string, Record<string, string | null>>;
}
```

- [ ] **Step 2: Write the failing test for the new lookup function**

Create `src/config/resolveSkillPath.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/config/resolveSkillPath.test.ts`
Expected: FAIL — `Cannot find module './resolveSkillPath'`.

- [ ] **Step 4: Implement resolveSkillPath**

Create `src/config/resolveSkillPath.ts`:

```ts
import type { KanbrainConfig, WorkItem } from '../types';

export function resolveSkillPath(config: KanbrainConfig, workItem: WorkItem): string | null {
  const level = config.typeToBacklogLevel[workItem.type];
  if (!level) {
    return null;
  }
  return config.backlogLevels[level]?.[workItem.status] ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/config/resolveSkillPath.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Update render.ts to use resolveSkillPath**

In `src/view/render.ts`, add the import:

```ts
import { resolveSkillPath } from '../config/resolveSkillPath';
```

Replace the `renderActionButton` function body:

```ts
function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skillPath = resolveSkillPath(config, workItem);
  if (!skillPath) {
    return '';
  }
  const label = skillPath.split('/').pop() ?? skillPath;
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${workItem.id}">▶ ${esc(label)}</button>`;
}
```

- [ ] **Step 7: Update render.test.ts fixture to the new schema**

In `src/view/render.test.ts`, replace the `config` fixture:

```ts
const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  typeToBacklogLevel: { Task: 'Tasks' },
  backlogLevels: { Tasks: { Active: 'skills/fix.md', Closed: null } },
};
```

(The rest of `render.test.ts` is unchanged — all its `render({ ... config, ... })` calls already use this `config` variable.)

- [ ] **Step 8: Run render tests to verify they pass**

Run: `npx vitest run src/view/render.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 9: Update KanbrainViewProvider.ts to use resolveSkillPath**

In `src/view/KanbrainViewProvider.ts`, add the import:

```ts
import { resolveSkillPath } from '../config/resolveSkillPath';
```

In `runSkill`, replace:

```ts
    const skillPath = config.statusSkills[workItem.status];
```

with:

```ts
    const skillPath = resolveSkillPath(config, workItem);
```

- [ ] **Step 10: Update config.test.ts fixtures to the new schema**

In `src/config/config.test.ts`, replace:

```ts
  it('returns the parsed config when the file exists', () => {
    const config = { organization: 'my-org', project: 'MyProject', statusSkills: { New: 'skills/a.md' } };
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
      backlogLevels: { Tasks: { New: '.kanbrain/skills/a.md' } },
    };
    writeConfig(workspaceRoot, config);
    expect(readConfig(workspaceRoot)).toEqual(config);
  });
```

And replace:

```ts
  it('creates the .kanbrain directory if missing', () => {
    writeConfig(workspaceRoot, { organization: 'o', project: 'p', statusSkills: {} });
    expect(fs.existsSync(path.join(workspaceRoot, '.kanbrain'))).toBe(true);
  });
```

with:

```ts
  it('creates the .kanbrain directory if missing', () => {
    writeConfig(workspaceRoot, { organization: 'o', project: 'p', typeToBacklogLevel: {}, backlogLevels: {} });
    expect(fs.existsSync(path.join(workspaceRoot, '.kanbrain'))).toBe(true);
  });
```

- [ ] **Step 11: Rewrite setup.ts to discover and apply the preset**

Replace the full contents of `src/commands/setup.ts`:

```ts
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItemTypeState } from '../azureDevOps/backlogLevels';
import { discoverBacklogLevelStates, buildTypeToBacklogLevel } from '../azureDevOps/backlogLevels';
import { buildPresetPlan } from '../skills/presetSkillFiles';
import { writeConfig, ensureGitignoreEntry } from '../config/config';

const EXAMPLE_SKILL = `# Skill de exemplo

Work item: {{title}} (#{{id}})
Status: {{status}}
Descrição: {{description}}

Subtasks:
{{subtasks}}

## Instruções
Descreva aqui o que o agente deve fazer quando o work item estiver neste status.
`;

export function registerSetupCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.setup', async () => {
    const organizations = await client.listOrganizations();
    if (organizations.length === 0) {
      vscode.window.showErrorMessage('Nenhuma organização Azure DevOps encontrada para esta conta.');
      return;
    }
    const orgPick = await vscode.window.showQuickPick(
      organizations.map(o => ({ label: o.name, org: o })),
      { placeHolder: 'Selecione a organização Azure DevOps' },
    );
    if (!orgPick) {
      return;
    }

    const projects = await client.listProjects(orgPick.org.name);
    if (projects.length === 0) {
      vscode.window.showErrorMessage(`Nenhum projeto encontrado na organização ${orgPick.org.name}.`);
      return;
    }
    const projectPick = await vscode.window.showQuickPick(
      projects.map(p => ({ label: p.name, project: p })),
      { placeHolder: 'Selecione o projeto Azure DevOps' },
    );
    if (!projectPick) {
      return;
    }

    let levels;
    try {
      levels = await client.listBacklogLevels(orgPick.org.name, projectPick.project.name);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Não foi possível ler os backlog levels do processo: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const statesByType: Record<string, WorkItemTypeState[]> = {};
    const uniqueTypes = Array.from(new Set(levels.flatMap(level => level.workItemTypes)));
    for (const type of uniqueTypes) {
      try {
        statesByType[type] = await client.listWorkItemTypeStates(orgPick.org.name, projectPick.project.name, type);
      } catch {
        // Falha pontual num tipo: segue sem ele em vez de abortar o Setup inteiro.
      }
    }

    const discovered = discoverBacklogLevelStates(levels, statesByType);
    const typeToBacklogLevel = buildTypeToBacklogLevel(levels, new Set(Object.keys(statesByType)));

    const generateFilesPick = await vscode.window.showQuickPick(
      [
        { label: 'Sim', generate: true },
        { label: 'Não', generate: false },
      ],
      { placeHolder: 'Gerar arquivos de skill placeholder automaticamente por categoria (Proposed/InProgress/Resolved)?' },
    );
    if (!generateFilesPick) {
      return;
    }

    const preset = buildPresetPlan(discovered, generateFilesPick.generate);

    const skillsDir = path.join(workspaceRoot, '.kanbrain', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    for (const file of preset.filesToWrite) {
      const fullPath = path.join(workspaceRoot, file.relativePath);
      if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, file.content, 'utf-8');
      }
    }

    const exampleSkillPath = path.join(skillsDir, 'example.md');
    if (!fs.existsSync(exampleSkillPath)) {
      fs.writeFileSync(exampleSkillPath, EXAMPLE_SKILL, 'utf-8');
    }

    writeConfig(workspaceRoot, {
      organization: orgPick.org.name,
      project: projectPick.project.name,
      typeToBacklogLevel,
      backlogLevels: preset.backlogLevels,
    });

    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');

    vscode.window.showInformationMessage(
      `Kanbrain configurado: ${orgPick.org.name}/${projectPick.project.name}. Edite .kanbrain/config.json para mapear skills por status.`,
    );
  });
}
```

Note: this drops the old "preserve existing `statusSkills` on re-run" behavior — re-running `Kanbrain: Setup` now always regenerates `backlogLevels`/`typeToBacklogLevel` fresh from the current Azure DevOps process, consistent with the design's "Setup sempre descobre e grava" rule. Manual edits to `config.json` between runs are overwritten by re-running Setup; this is expected, not a regression to guard against.

- [ ] **Step 12: Run the full unit test suite**

Run: `npx vitest run`
Expected: PASS, all test files green (this now includes `backlogLevels.test.ts`, the updated `client.test.ts`, `presetSkillFiles.test.ts`, `resolveSkillPath.test.ts`, the updated `render.test.ts`, and the updated `config.test.ts`).

- [ ] **Step 13: Run the TypeScript compiler**

Run: `npm run compile`
Expected: exits with no errors (no leftover `config.statusSkills` references anywhere in `src/`).

- [ ] **Step 14: Commit**

```bash
git add src/types.ts src/config/resolveSkillPath.ts src/config/resolveSkillPath.test.ts src/view/render.ts src/view/render.test.ts src/view/KanbrainViewProvider.ts src/config/config.test.ts src/commands/setup.ts
git commit -m "feat: migrate config schema to backlog-level status presets and wire Setup"
```

---

### Task 5: Update README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).

- [ ] **Step 1: Replace the Setup section**

In `README.md`, replace steps 3-4 of the `## Setup` section:

```markdown
3. This creates `.kanbrain/config.json` (commit it — it's shared team config) and `.kanbrain/skills/example.md` (a starter skill template).
4. Edit `.kanbrain/config.json`'s `statusSkills` map to point each work item status at a skill file:

   ```json
   {
     "organization": "my-org",
     "project": "MyProject",
     "statusSkills": {
       "New": ".kanbrain/skills/brainstorm.md",
       "Active": null,
       "Resolved": ".kanbrain/skills/review.md"
     }
   }
   ```
```

with:

```markdown
3. Setup reads the project's real backlog levels (Epics/Features/Stories/Tasks, or whatever your process defines) and state categories from Azure DevOps, then asks whether to generate placeholder skill files automatically for each category (Proposed/InProgress/Resolved). This creates `.kanbrain/config.json` (commit it — it's shared team config) and, if you said yes, one skill file per backlog level + category under `.kanbrain/skills/`.
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
     }
   }
   ```
```

- [ ] **Step 2: Add manual verification checklist items**

In the `## Manual verification checklist` section, after the line `- [ ] \`.kanbrain/generated/\` is added to \`.gitignore\` after setup.`, add:

```markdown
- [ ] `Kanbrain: Setup`, after picking a project, asks whether to generate placeholder skill files per backlog level/category, and writes `backlogLevels`/`typeToBacklogLevel` reflecting the project's real process either way.
- [ ] Answering "Sim" creates one skill file per backlog level + category (Proposed/InProgress/Resolved) under `.kanbrain/skills/`, and `Done`/`Removed`-category statuses map to `null`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document backlog-level status skill presets"
```
