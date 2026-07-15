# Board Configuration Check & Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when `.kanbrain/config.json` no longer matches the real Azure DevOps board (renamed/added/removed types, backlog levels, or statuses), and let the user sync it without ever losing a skill mapping they configured — plus fix a latent crash on malformed `config.json`.

**Architecture:** A shared `discoverBoardState` helper (extracted from the existing `Kanbrain: Setup` command) fetches the board's current shape. A pure `diffBoardConfig` function compares that against the saved config to produce a structured `BoardConfigDiff`. A pure `syncConfig` function merges fresh derived data (colors/icons/type mapping) into the saved config while preserving every existing `backlogLevels` entry — new entries default to `null`, orphaned entries (no longer on the board) are kept as-is, never deleted. Two new commands (`Kanbrain: Check Board Configuration`, read-only; `Kanbrain: Sync Board Configuration`, writes) expose this, and the webview panel runs the same check silently once per VS Code session when it first opens.

**Tech Stack:** TypeScript, Vitest (`npm run test:unit`), `tsc` (`npm run compile`), VS Code Extension API.

## Global Constraints

- `readConfig()` must never throw — malformed JSON returns `null`, exactly like a missing file (existing callers already treat `null` as "no valid config").
- Sync never deletes a `backlogLevels` entry. An entry whose level/status no longer exists on the board is copied into the result unchanged.
- Sync never prompts to generate placeholder skill files (that's a first-time-Setup-only behavior) — brand new level/status entries always default to `null`.
- `organization`/`project`/every `backlogLevels[level][status]` skill-path value that still applies are the only fields sync must not silently overwrite; every other field (`typeToBacklogLevel`, `statusColors`, `typeColors`, `typeIcons`) is always replaced with fresh data.
- The automatic on-open check runs at most once per `KanbrainViewProvider` instance (i.e., once per VS Code session for that window), and stays silent unless there's an actual problem to report (invalid JSON always surfaces; "missing config" and "up to date" stay silent automatically, but always report when run via the manual command).

---

### Task 1: Fix `readConfig` and add `readConfigWithDiagnostics`

**Files:**
- Modify: `src/config/config.ts`
- Modify: `src/config/config.test.ts`

**Interfaces:**
- Produces: `readConfig(workspaceRoot: string): KanbrainConfig | null` (unchanged signature, now catches parse errors). `readConfigWithDiagnostics(workspaceRoot: string): ConfigReadResult` where `ConfigReadResult = { status: 'ok'; config: KanbrainConfig } | { status: 'missing' } | { status: 'invalid'; error: string }`. Later tasks consume `readConfigWithDiagnostics`.

- [ ] **Step 1: Write the failing tests**

Add to `src/config/config.test.ts`, inside the `describe('readConfig', ...)` block (after the existing `'returns the parsed config when the file exists'` test):

```ts
  it('returns null when the config file is malformed JSON', () => {
    fs.mkdirSync(path.dirname(getConfigPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(getConfigPath(workspaceRoot), '{ not valid json', 'utf-8');
    expect(readConfig(workspaceRoot)).toBeNull();
  });
```

Then add a new `describe` block at the end of the file (after the `ensureGitignoreEntry` block):

```ts
describe('readConfigWithDiagnostics', () => {
  it('returns status "missing" when no config file exists', () => {
    expect(readConfigWithDiagnostics(workspaceRoot)).toEqual({ status: 'missing' });
  });

  it('returns status "ok" with the parsed config when the file is valid', () => {
    const config = {
      organization: 'my-org',
      project: 'MyProject',
      typeToBacklogLevel: {},
      backlogLevels: {},
      statusColors: {},
      typeColors: {},
      typeIcons: {},
    };
    writeConfig(workspaceRoot, config);
    expect(readConfigWithDiagnostics(workspaceRoot)).toEqual({ status: 'ok', config });
  });

  it('returns status "invalid" with the parse error message when the file is malformed JSON', () => {
    fs.mkdirSync(path.dirname(getConfigPath(workspaceRoot)), { recursive: true });
    fs.writeFileSync(getConfigPath(workspaceRoot), '{ not valid json', 'utf-8');
    const result = readConfigWithDiagnostics(workspaceRoot);
    expect(result.status).toBe('invalid');
    expect((result as { status: 'invalid'; error: string }).error.length).toBeGreaterThan(0);
  });
});
```

Update the import line at the top of the file:

```ts
import { getConfigPath, readConfig, writeConfig, ensureGitignoreEntry } from './config';
```

to:

```ts
import { getConfigPath, readConfig, writeConfig, ensureGitignoreEntry, readConfigWithDiagnostics } from './config';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- config`
Expected: FAIL — `readConfigWithDiagnostics` is not exported from `./config`; the malformed-JSON `readConfig` test fails because the current implementation throws instead of returning `null`.

- [ ] **Step 3: Write the minimal implementation**

In `src/config/config.ts`, replace `readConfig`:

```ts
export function readConfig(workspaceRoot: string): KanbrainConfig | null {
  const configPath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as KanbrainConfig;
}
```

with:

```ts
export function readConfig(workspaceRoot: string): KanbrainConfig | null {
  const configPath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  try {
    return JSON.parse(raw) as KanbrainConfig;
  } catch {
    return null;
  }
}

export type ConfigReadResult = { status: 'ok'; config: KanbrainConfig } | { status: 'missing' } | { status: 'invalid'; error: string };

export function readConfigWithDiagnostics(workspaceRoot: string): ConfigReadResult {
  const configPath = getConfigPath(workspaceRoot);
  if (!fs.existsSync(configPath)) {
    return { status: 'missing' };
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  try {
    return { status: 'ok', config: JSON.parse(raw) as KanbrainConfig };
  } catch (error) {
    return { status: 'invalid', error: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- config`
Expected: PASS (13 tests: 10 existing + 3 new)

- [ ] **Step 5: Commit**

```bash
git add src/config/config.ts src/config/config.test.ts
git commit -m "fix: never throw on malformed config.json, add diagnostics variant"
```

---

### Task 2: Extract `discoverBoardState` and refactor Setup to use it

**Files:**
- Create: `src/azureDevOps/discoverBoardState.ts`
- Create: `src/azureDevOps/discoverBoardState.test.ts`
- Modify: `src/commands/setup.ts`

**Interfaces:**
- Produces: `discoverBoardState(client: AzureDevOpsClient, organization: string, project: string): Promise<BoardState>` where `BoardState = { levels: BacklogLevel[]; statesByType: Record<string, WorkItemTypeState[]>; typeColors: Record<string, string>; typeIcons: Record<string, string> }`. Tasks 5 and 6 consume this.

- [ ] **Step 1: Write the failing tests**

Create `src/azureDevOps/discoverBoardState.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { discoverBoardState } from './discoverBoardState';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  getDefaultTeamName: () => Promise<string>;
  listBacklogLevels: () => Promise<{ name: string; workItemTypes: string[] }[]>;
  listWorkItemTypeStates: () => Promise<{ name: string; category: string; color: string }[]>;
  getWorkItemTypeIcon: () => Promise<{ color: string; iconSvg: string } | null>;
}> = {}): AzureDevOpsClient {
  return {
    getDefaultTeamName: vi.fn().mockResolvedValue('MyProject Team'),
    listBacklogLevels: vi.fn().mockResolvedValue([{ name: 'Tasks', workItemTypes: ['Task'] }]),
    listWorkItemTypeStates: vi.fn().mockResolvedValue([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]),
    getWorkItemTypeIcon: vi.fn().mockResolvedValue({ color: 'f2cb1d', iconSvg: '<svg></svg>' }),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverBoardState', () => {
  it('fetches team, backlog levels, states, and icons for every discovered type', async () => {
    const client = stubClient();
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.levels).toEqual([{ name: 'Tasks', workItemTypes: ['Task'] }]);
    expect(result.statesByType.Task).toEqual([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]);
    expect(result.typeColors.Task).toBe('f2cb1d');
    expect(result.typeIcons.Task).toBe('<svg></svg>');
  });

  it('continues without a type when fetching its states fails', async () => {
    const client = stubClient({ listWorkItemTypeStates: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.statesByType.Task).toBeUndefined();
  });

  it('continues without a type when fetching its icon fails', async () => {
    const client = stubClient({ getWorkItemTypeIcon: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.typeColors.Task).toBeUndefined();
    expect(result.typeIcons.Task).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- discoverBoardState`
Expected: FAIL — `Cannot find module './discoverBoardState'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/azureDevOps/discoverBoardState.ts`:

```ts
import type { AzureDevOpsClient } from './client';
import type { BacklogLevel, WorkItemTypeState } from './backlogLevels';
import { sanitizeSvg } from '../view/sanitizeSvg';

export interface BoardState {
  levels: BacklogLevel[];
  statesByType: Record<string, WorkItemTypeState[]>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
}

export async function discoverBoardState(client: AzureDevOpsClient, organization: string, project: string): Promise<BoardState> {
  const team = await client.getDefaultTeamName(organization, project);
  const levels = await client.listBacklogLevels(organization, project, team);

  const statesByType: Record<string, WorkItemTypeState[]> = {};
  const uniqueTypes = Array.from(new Set(levels.flatMap(level => level.workItemTypes)));
  for (const type of uniqueTypes) {
    try {
      statesByType[type] = await client.listWorkItemTypeStates(organization, project, type);
    } catch {
      // One-off failure for a type: continue without it instead of aborting the whole discovery.
    }
  }

  const typeColors: Record<string, string> = {};
  const typeIcons: Record<string, string> = {};
  for (const type of uniqueTypes) {
    try {
      const icon = await client.getWorkItemTypeIcon(organization, project, type);
      if (icon) {
        typeColors[type] = icon.color;
        typeIcons[type] = sanitizeSvg(icon.iconSvg);
      }
    } catch {
      // One-off failure for a type: continue without its icon/color instead of aborting the whole discovery.
    }
  }

  return { levels, statesByType, typeColors, typeIcons };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- discoverBoardState`
Expected: PASS (3 tests)

- [ ] **Step 5: Refactor `setup.ts` to use `discoverBoardState`**

In `src/commands/setup.ts`, replace the imports:

```ts
import type { WorkItemTypeState } from '../azureDevOps/backlogLevels';
import { discoverBacklogLevelStates, discoverStatusColors, buildTypeToBacklogLevel } from '../azureDevOps/backlogLevels';
import { buildPresetPlan } from '../skills/presetSkillFiles';
import { writeConfig, ensureGitignoreEntry } from '../config/config';
import { sanitizeSvg } from '../view/sanitizeSvg';
```

with:

```ts
import { discoverBacklogLevelStates, discoverStatusColors, buildTypeToBacklogLevel } from '../azureDevOps/backlogLevels';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { buildPresetPlan } from '../skills/presetSkillFiles';
import { writeConfig, ensureGitignoreEntry } from '../config/config';
```

Replace the discovery block:

```ts
    let levels;
    try {
      const team = await client.getDefaultTeamName(orgPick.org.name, projectPick.project.name);
      levels = await client.listBacklogLevels(orgPick.org.name, projectPick.project.name, team);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not read the process's backlog levels: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    const statesByType: Record<string, WorkItemTypeState[]> = {};
    const uniqueTypes = Array.from(new Set(levels.flatMap(level => level.workItemTypes)));
    for (const type of uniqueTypes) {
      try {
        statesByType[type] = await client.listWorkItemTypeStates(orgPick.org.name, projectPick.project.name, type);
      } catch {
        // One-off failure for a type: continue without it instead of aborting the whole Setup.
      }
    }

    const discovered = discoverBacklogLevelStates(levels, statesByType);
    const typeToBacklogLevel = buildTypeToBacklogLevel(levels, new Set(Object.keys(statesByType)));
    const statusColors = discoverStatusColors(levels, statesByType);

    const typeColors: Record<string, string> = {};
    const typeIcons: Record<string, string> = {};
    for (const type of uniqueTypes) {
      try {
        const icon = await client.getWorkItemTypeIcon(orgPick.org.name, projectPick.project.name, type);
        if (icon) {
          typeColors[type] = icon.color;
          typeIcons[type] = sanitizeSvg(icon.iconSvg);
        }
      } catch {
        // One-off failure for a type: continue without its icon/color instead of aborting the whole Setup.
      }
    }
```

with:

```ts
    let boardState;
    try {
      boardState = await discoverBoardState(client, orgPick.org.name, projectPick.project.name);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not read the process's backlog levels: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const { levels, statesByType, typeColors, typeIcons } = boardState;

    const discovered = discoverBacklogLevelStates(levels, statesByType);
    const typeToBacklogLevel = buildTypeToBacklogLevel(levels, new Set(Object.keys(statesByType)));
    const statusColors = discoverStatusColors(levels, statesByType);
```

- [ ] **Step 6: Compile and run the full unit test suite**

Run: `npm run compile`
Expected: succeeds with no errors.

Run: `npm run test:unit`
Expected: PASS — all tests, including the 3 new ones. `setup.ts` has no dedicated unit test file (its only automated coverage is the command-registration check in `test/suite/extension.test.ts`, extended in Task 7), so this refactor's correctness rests on the compile passing and the extracted function's own tests from Step 4.

- [ ] **Step 7: Commit**

```bash
git add src/azureDevOps/discoverBoardState.ts src/azureDevOps/discoverBoardState.test.ts src/commands/setup.ts
git commit -m "refactor: extract discoverBoardState from the Setup command"
```

---

### Task 3: `diffBoardConfig`

**Files:**
- Create: `src/azureDevOps/checkBoardConfig.ts`
- Create: `src/azureDevOps/checkBoardConfig.test.ts`

**Interfaces:**
- Consumes: `DiscoveredBacklogLevels` (from `src/azureDevOps/backlogLevels.ts`, already exists), `KanbrainConfig` (from `src/types.ts`).
- Produces: `diffBoardConfig(config: KanbrainConfig, discovered: DiscoveredBacklogLevels, freshTypeToBacklogLevel: Record<string, string>): BoardConfigDiff`, `isDiffEmpty(diff: BoardConfigDiff): boolean`, `summarizeDiff(diff: BoardConfigDiff): string`, and the `BoardConfigDiff` interface. Tasks 5 and 6 consume all three functions.

- [ ] **Step 1: Write the failing tests**

Create `src/azureDevOps/checkBoardConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffBoardConfig, isDiffEmpty } from './checkBoardConfig';
import type { KanbrainConfig } from '../types';
import type { DiscoveredBacklogLevels } from './backlogLevels';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    typeToBacklogLevel: { Task: 'Tasks' },
    backlogLevels: { Tasks: { 'To Do': null, Done: null } },
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

const discovered: DiscoveredBacklogLevels = { Tasks: { 'To Do': 'Proposed', Done: 'Completed' } };
const freshTypeToBacklogLevel = { Task: 'Tasks' };

describe('diffBoardConfig', () => {
  it('returns an empty diff when config matches the board exactly', () => {
    const diff = diffBoardConfig(config(), discovered, freshTypeToBacklogLevel);
    expect(isDiffEmpty(diff)).toBe(true);
  });

  it('reports a type removed from the board', () => {
    const diff = diffBoardConfig(config({ typeToBacklogLevel: { Task: 'Tasks', Bug: 'Stories' } }), discovered, freshTypeToBacklogLevel);
    expect(diff.typesRemoved).toEqual(['Bug']);
  });

  it('reports a type added on the board', () => {
    const diff = diffBoardConfig(config(), discovered, { Task: 'Tasks', Bug: 'Stories' });
    expect(diff.typesAdded).toEqual(['Bug']);
  });

  it('reports a type moved to a different backlog level', () => {
    const diff = diffBoardConfig(config({ typeToBacklogLevel: { Task: 'Stories' } }), discovered, freshTypeToBacklogLevel);
    expect(diff.typesMoved).toEqual([{ type: 'Task', from: 'Stories', to: 'Tasks' }]);
  });

  it('reports a backlog level added on the board', () => {
    const diff = diffBoardConfig(config(), { ...discovered, Stories: { New: 'Proposed' } }, freshTypeToBacklogLevel);
    expect(diff.levelsAdded).toEqual(['Stories']);
  });

  it('reports a backlog level removed from the board', () => {
    const diff = diffBoardConfig(
      config({ backlogLevels: { Tasks: { 'To Do': null }, Stories: { New: '.kanbrain/skills/x.md' } } }),
      discovered,
      freshTypeToBacklogLevel,
    );
    expect(diff.levelsRemoved).toEqual(['Stories']);
  });

  it('reports a status added within an existing backlog level', () => {
    const diff = diffBoardConfig(config({ backlogLevels: { Tasks: { 'To Do': null } } }), discovered, freshTypeToBacklogLevel);
    expect(diff.statusesAdded).toEqual([{ level: 'Tasks', status: 'Done' }]);
  });

  it('reports a status removed within an existing backlog level, including its skill path', () => {
    const diff = diffBoardConfig(
      config({ backlogLevels: { Tasks: { 'To Do': null, Done: null, Cancelled: '.kanbrain/skills/tasks-cancelled.md' } } }),
      discovered,
      freshTypeToBacklogLevel,
    );
    expect(diff.statusesRemoved).toEqual([{ level: 'Tasks', status: 'Cancelled', skillPath: '.kanbrain/skills/tasks-cancelled.md' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- checkBoardConfig`
Expected: FAIL — `Cannot find module './checkBoardConfig'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/azureDevOps/checkBoardConfig.ts`:

```ts
import type { KanbrainConfig } from '../types';
import type { DiscoveredBacklogLevels } from './backlogLevels';

export interface BoardConfigDiff {
  typesRemoved: string[];
  typesAdded: string[];
  typesMoved: { type: string; from: string; to: string }[];
  levelsAdded: string[];
  levelsRemoved: string[];
  statusesAdded: { level: string; status: string }[];
  statusesRemoved: { level: string; status: string; skillPath: string | null }[];
}

export function diffBoardConfig(
  config: KanbrainConfig,
  discovered: DiscoveredBacklogLevels,
  freshTypeToBacklogLevel: Record<string, string>,
): BoardConfigDiff {
  const typesRemoved: string[] = [];
  const typesAdded: string[] = [];
  const typesMoved: { type: string; from: string; to: string }[] = [];

  for (const [type, level] of Object.entries(config.typeToBacklogLevel)) {
    const freshLevel = freshTypeToBacklogLevel[type];
    if (!freshLevel) {
      typesRemoved.push(type);
    } else if (freshLevel !== level) {
      typesMoved.push({ type, from: level, to: freshLevel });
    }
  }
  for (const type of Object.keys(freshTypeToBacklogLevel)) {
    if (!(type in config.typeToBacklogLevel)) {
      typesAdded.push(type);
    }
  }

  const levelsAdded: string[] = [];
  const levelsRemoved: string[] = [];
  const statusesAdded: { level: string; status: string }[] = [];
  const statusesRemoved: { level: string; status: string; skillPath: string | null }[] = [];

  for (const level of Object.keys(config.backlogLevels)) {
    if (!(level in discovered)) {
      levelsRemoved.push(level);
      continue;
    }
    for (const status of Object.keys(config.backlogLevels[level])) {
      if (!(status in discovered[level])) {
        statusesRemoved.push({ level, status, skillPath: config.backlogLevels[level][status] });
      }
    }
  }
  for (const [level, statuses] of Object.entries(discovered)) {
    if (!(level in config.backlogLevels)) {
      levelsAdded.push(level);
      continue;
    }
    for (const status of Object.keys(statuses)) {
      if (!(status in config.backlogLevels[level])) {
        statusesAdded.push({ level, status });
      }
    }
  }

  return { typesRemoved, typesAdded, typesMoved, levelsAdded, levelsRemoved, statusesAdded, statusesRemoved };
}

export function isDiffEmpty(diff: BoardConfigDiff): boolean {
  return (
    diff.typesRemoved.length === 0 &&
    diff.typesAdded.length === 0 &&
    diff.typesMoved.length === 0 &&
    diff.levelsAdded.length === 0 &&
    diff.levelsRemoved.length === 0 &&
    diff.statusesAdded.length === 0 &&
    diff.statusesRemoved.length === 0
  );
}

export function summarizeDiff(diff: BoardConfigDiff): string {
  const parts: string[] = [];
  if (diff.typesAdded.length) parts.push(`${diff.typesAdded.length} new work item type(s)`);
  if (diff.typesRemoved.length) parts.push(`${diff.typesRemoved.length} work item type(s) no longer found`);
  if (diff.typesMoved.length) parts.push(`${diff.typesMoved.length} work item type(s) moved to a different backlog level`);
  if (diff.levelsAdded.length) parts.push(`${diff.levelsAdded.length} new backlog level(s)`);
  if (diff.levelsRemoved.length) parts.push(`${diff.levelsRemoved.length} backlog level(s) no longer found`);
  if (diff.statusesAdded.length) parts.push(`${diff.statusesAdded.length} new status(es)`);
  if (diff.statusesRemoved.length) parts.push(`${diff.statusesRemoved.length} status(es) no longer found (skill mappings preserved)`);
  return parts.join(', ');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- checkBoardConfig`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/checkBoardConfig.ts src/azureDevOps/checkBoardConfig.test.ts
git commit -m "feat: add diffBoardConfig to detect board/config drift"
```

---

### Task 4: `syncConfig`

**Files:**
- Create: `src/config/syncConfig.ts`
- Create: `src/config/syncConfig.test.ts`

**Interfaces:**
- Consumes: `DiscoveredBacklogLevels`, `KanbrainConfig`.
- Produces: `syncConfig(config: KanbrainConfig, discovered: DiscoveredBacklogLevels, freshTypeToBacklogLevel: Record<string, string>, freshStatusColors: Record<string, string>, freshTypeColors: Record<string, string>, freshTypeIcons: Record<string, string>): KanbrainConfig`. Task 6 consumes this.

- [ ] **Step 1: Write the failing tests**

Create `src/config/syncConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { syncConfig } from './syncConfig';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    typeToBacklogLevel: { Task: 'Tasks' },
    backlogLevels: { Tasks: { 'To Do': '.kanbrain/skills/tasks-todo.md', Done: null } },
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
    expect(result.backlogLevels.Tasks['To Do']).toBe('.kanbrain/skills/tasks-todo.md');
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
      backlogLevels: { Tasks: { 'To Do': '.kanbrain/skills/tasks-todo.md', Legacy: '.kanbrain/skills/legacy.md' } },
    });
    const result = syncConfig(withOrphan, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {});

    expect(result.backlogLevels.Tasks.Legacy).toBe('.kanbrain/skills/legacy.md');
    expect(result.backlogLevels.Tasks['To Do']).toBe('.kanbrain/skills/tasks-todo.md');
  });

  it('preserves an orphaned backlog level entirely instead of deleting it', () => {
    const withOrphanLevel = config({
      backlogLevels: { Tasks: { 'To Do': null }, Stories: { New: '.kanbrain/skills/stories-new.md' } },
    });
    const result = syncConfig(withOrphanLevel, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {});

    expect(result.backlogLevels.Stories).toEqual({ New: '.kanbrain/skills/stories-new.md' });
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- syncConfig`
Expected: FAIL — `Cannot find module './syncConfig'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/config/syncConfig.ts`:

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- syncConfig`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config/syncConfig.ts src/config/syncConfig.test.ts
git commit -m "feat: add syncConfig to merge fresh board data without deleting skills"
```

---

### Task 5: `Kanbrain: Check Board Configuration` command

**Files:**
- Create: `src/commands/checkBoardConfig.ts`

**Interfaces:**
- Consumes: `readConfigWithDiagnostics` (Task 1), `discoverBoardState` (Task 2), `discoverBacklogLevelStates`/`buildTypeToBacklogLevel` (existing, `src/azureDevOps/backlogLevels.ts`), `diffBoardConfig`/`isDiffEmpty`/`summarizeDiff`/`BoardConfigDiff` (Task 3).
- Produces: `checkBoardConfig(client: AzureDevOpsClient, workspaceRoot: string): Promise<CheckResult>` where `CheckResult = { status: 'missing' } | { status: 'invalid'; error: string } | { status: 'discovery-failed'; error: string } | { status: 'ok'; diff: BoardConfigDiff; config: KanbrainConfig }`, `presentBoardConfigCheck(client: AzureDevOpsClient, workspaceRoot: string, options: { quietWhenNothingToReport: boolean }): Promise<void>`, `registerCheckBoardConfigCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable`. Task 6 relies on the `'Sync Now'` action executing the `kanbrain.syncBoardConfig` command (registered in Task 6). Task 7 consumes `presentBoardConfigCheck` and `registerCheckBoardConfigCommand`.

No dedicated test file — this module is VS Code command glue (uses `vscode.window.show*Message`), matching the existing pattern for `src/commands/setup.ts` and `src/commands/selectWorkItem.ts` (neither has a unit test file; coverage is the command-registration check in `test/suite/extension.test.ts`, extended in Task 7, plus manual verification). Its only non-trivial logic (`checkBoardConfig`'s status branching) is a thin composition of already-tested pieces from Tasks 1-3. The `discoverBoardState` call is wrapped in `try/catch`, matching the existing error-handling pattern in `src/commands/setup.ts` (network/auth failures must never throw unhandled out of a command callback).

- [ ] **Step 1: Write the implementation**

Create `src/commands/checkBoardConfig.ts`:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { discoverBacklogLevelStates, buildTypeToBacklogLevel } from '../azureDevOps/backlogLevels';
import { diffBoardConfig, isDiffEmpty, summarizeDiff, type BoardConfigDiff } from '../azureDevOps/checkBoardConfig';
import { readConfigWithDiagnostics } from '../config/config';
import type { KanbrainConfig } from '../types';

export type CheckResult =
  | { status: 'missing' }
  | { status: 'invalid'; error: string }
  | { status: 'discovery-failed'; error: string }
  | { status: 'ok'; diff: BoardConfigDiff; config: KanbrainConfig };

export async function checkBoardConfig(client: AzureDevOpsClient, workspaceRoot: string): Promise<CheckResult> {
  const result = readConfigWithDiagnostics(workspaceRoot);
  if (result.status !== 'ok') {
    return result;
  }

  let boardState;
  try {
    boardState = await discoverBoardState(client, result.config.organization, result.config.project);
  } catch (error) {
    return { status: 'discovery-failed', error: error instanceof Error ? error.message : String(error) };
  }

  const discovered = discoverBacklogLevelStates(boardState.levels, boardState.statesByType);
  const freshTypeToBacklogLevel = buildTypeToBacklogLevel(boardState.levels, new Set(Object.keys(boardState.statesByType)));
  const diff = diffBoardConfig(result.config, discovered, freshTypeToBacklogLevel);

  return { status: 'ok', diff, config: result.config };
}

export async function presentBoardConfigCheck(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  options: { quietWhenNothingToReport: boolean },
): Promise<void> {
  const result = await checkBoardConfig(client, workspaceRoot);

  if (result.status === 'missing') {
    if (!options.quietWhenNothingToReport) {
      vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    }
    return;
  }
  if (result.status === 'invalid') {
    vscode.window.showErrorMessage(`.kanbrain/config.json is not valid JSON: ${result.error}`);
    return;
  }
  if (result.status === 'discovery-failed') {
    vscode.window.showErrorMessage(`Could not check the board configuration: ${result.error}`);
    return;
  }
  if (isDiffEmpty(result.diff)) {
    if (!options.quietWhenNothingToReport) {
      vscode.window.showInformationMessage('Kanbrain board configuration is up to date.');
    }
    return;
  }

  const action = await vscode.window.showWarningMessage(
    `Kanbrain board configuration is out of date: ${summarizeDiff(result.diff)}.`,
    'Sync Now',
  );
  if (action === 'Sync Now') {
    await vscode.commands.executeCommand('kanbrain.syncBoardConfig');
  }
}

export function registerCheckBoardConfigCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.checkBoardConfig', () =>
    presentBoardConfigCheck(client, workspaceRoot, { quietWhenNothingToReport: false }),
  );
}
```

- [ ] **Step 2: Compile**

Run: `npm run compile`
Expected: succeeds — note this will only fully succeed once Task 6 registers `kanbrain.syncBoardConfig`; `vscode.commands.executeCommand` takes a string command ID and is not statically checked against registered commands, so this compiles fine even before Task 6 exists.

- [ ] **Step 3: Commit**

```bash
git add src/commands/checkBoardConfig.ts
git commit -m "feat: add Kanbrain: Check Board Configuration command"
```

---

### Task 6: `Kanbrain: Sync Board Configuration` command

**Files:**
- Create: `src/commands/syncBoardConfig.ts`

**Interfaces:**
- Consumes: `readConfigWithDiagnostics`, `writeConfig` (`src/config/config.ts`), `discoverBoardState` (Task 2), `discoverBacklogLevelStates`/`discoverStatusColors`/`buildTypeToBacklogLevel` (existing), `diffBoardConfig`/`isDiffEmpty`/`summarizeDiff` (Task 3), `syncConfig` (Task 4).
- Produces: `registerSyncBoardConfigCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable`, registering `kanbrain.syncBoardConfig` — the command Task 5's "Sync Now" action executes.

No dedicated test file, same rationale as Task 5 — thin VS Code glue over already-tested pieces. The `discoverBoardState` call is wrapped in `try/catch`, same as Task 5.

- [ ] **Step 1: Write the implementation**

Create `src/commands/syncBoardConfig.ts`:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { discoverBacklogLevelStates, discoverStatusColors, buildTypeToBacklogLevel } from '../azureDevOps/backlogLevels';
import { diffBoardConfig, isDiffEmpty, summarizeDiff } from '../azureDevOps/checkBoardConfig';
import { syncConfig } from '../config/syncConfig';
import { readConfigWithDiagnostics, writeConfig } from '../config/config';

export function registerSyncBoardConfigCommand(client: AzureDevOpsClient, workspaceRoot: string): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.syncBoardConfig', async () => {
    const result = readConfigWithDiagnostics(workspaceRoot);
    if (result.status === 'missing') {
      vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
      return;
    }
    if (result.status === 'invalid') {
      vscode.window.showErrorMessage(`.kanbrain/config.json is not valid JSON: ${result.error}`);
      return;
    }

    let boardState;
    try {
      boardState = await discoverBoardState(client, result.config.organization, result.config.project);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not sync the board configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const discovered = discoverBacklogLevelStates(boardState.levels, boardState.statesByType);
    const freshTypeToBacklogLevel = buildTypeToBacklogLevel(boardState.levels, new Set(Object.keys(boardState.statesByType)));
    const freshStatusColors = discoverStatusColors(boardState.levels, boardState.statesByType);
    const diff = diffBoardConfig(result.config, discovered, freshTypeToBacklogLevel);

    const updated = syncConfig(
      result.config,
      discovered,
      freshTypeToBacklogLevel,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
    );
    writeConfig(workspaceRoot, updated);

    if (isDiffEmpty(diff)) {
      vscode.window.showInformationMessage('Kanbrain board configuration was already up to date.');
    } else {
      vscode.window.showInformationMessage(`Kanbrain board configuration synced: ${summarizeDiff(diff)}.`);
    }
  });
}
```

- [ ] **Step 2: Compile**

Run: `npm run compile`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/commands/syncBoardConfig.ts
git commit -m "feat: add Kanbrain: Sync Board Configuration command"
```

---

### Task 7: Wire both commands into the extension and the automatic on-open check

**Files:**
- Modify: `package.json`
- Modify: `src/extension.ts`
- Modify: `src/view/KanbrainViewProvider.ts`
- Modify: `test/suite/extension.test.ts`

**Interfaces:**
- Consumes: `registerCheckBoardConfigCommand` (Task 5), `registerSyncBoardConfigCommand` (Task 6), `presentBoardConfigCheck` (Task 5).

- [ ] **Step 1: Register the commands in `package.json`**

In `package.json`, replace:

```json
    "commands": [
      { "command": "kanbrain.setup", "title": "Kanbrain: Setup" },
      { "command": "kanbrain.selectWorkItem", "title": "Kanbrain: Select Work Item" }
    ],
```

with:

```json
    "commands": [
      { "command": "kanbrain.setup", "title": "Kanbrain: Setup" },
      { "command": "kanbrain.selectWorkItem", "title": "Kanbrain: Select Work Item" },
      { "command": "kanbrain.checkBoardConfig", "title": "Kanbrain: Check Board Configuration" },
      { "command": "kanbrain.syncBoardConfig", "title": "Kanbrain: Sync Board Configuration" }
    ],
```

- [ ] **Step 2: Register the commands in `src/extension.ts`**

Replace the imports:

```ts
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';
```

with:

```ts
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';
import { registerCheckBoardConfigCommand } from './commands/checkBoardConfig';
import { registerSyncBoardConfigCommand } from './commands/syncBoardConfig';
```

Replace:

```ts
  context.subscriptions.push(
    registerSetupCommand(client, workspaceRoot, () => provider.setActiveWorkItem(undefined)),
    registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id)),
  );
```

with:

```ts
  context.subscriptions.push(
    registerSetupCommand(client, workspaceRoot, () => provider.setActiveWorkItem(undefined)),
    registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id)),
    registerCheckBoardConfigCommand(client, workspaceRoot),
    registerSyncBoardConfigCommand(client, workspaceRoot),
  );
```

- [ ] **Step 3: Run the automatic check once per session in `KanbrainViewProvider`**

In `src/view/KanbrainViewProvider.ts`, add the import:

```ts
import { presentBoardConfigCheck } from '../commands/checkBoardConfig';
```

Add a new field next to `backlogLevelCounts`:

```ts
  private backlogLevelCounts: Record<string, number> = {};
  private hasCheckedBoardConfig = false;
```

In `resolveWebviewView`, after the existing `webviewView.onDidDispose(...)` block, add:

```ts
    void this.runInitialBoardConfigCheck();
```

so the method reads:

```ts
    void this.refresh();
    this.pollHandle = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    webviewView.onDidDispose(() => {
      if (this.pollHandle) {
        clearInterval(this.pollHandle);
      }
    });
    void this.runInitialBoardConfigCheck();
  }
```

Add a new private method (near `searchWorkItems`/`runSkill`):

```ts
  private async runInitialBoardConfigCheck(): Promise<void> {
    if (this.hasCheckedBoardConfig || !this.workspaceRoot || !this.client) {
      return;
    }
    this.hasCheckedBoardConfig = true;
    await presentBoardConfigCheck(this.client, this.workspaceRoot, { quietWhenNothingToReport: true });
  }
```

- [ ] **Step 4: Extend the command-registration integration test**

In `test/suite/extension.test.ts`, replace:

```ts
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('kanbrain.setup'), 'kanbrain.setup not registered');
    assert.ok(commands.includes('kanbrain.selectWorkItem'), 'kanbrain.selectWorkItem not registered');
```

with:

```ts
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('kanbrain.setup'), 'kanbrain.setup not registered');
    assert.ok(commands.includes('kanbrain.selectWorkItem'), 'kanbrain.selectWorkItem not registered');
    assert.ok(commands.includes('kanbrain.checkBoardConfig'), 'kanbrain.checkBoardConfig not registered');
    assert.ok(commands.includes('kanbrain.syncBoardConfig'), 'kanbrain.syncBoardConfig not registered');
```

This suite requires `@vscode/test-electron` (`npm run test:integration`), which per the README has a known limitation on Windows when the repo path contains a space — do not rely on running it in this repo location; the manual verification checklist (Task 8) is the practical fallback, consistent with the project's existing convention.

- [ ] **Step 5: Compile and run the full unit test suite**

Run: `npm run compile`
Expected: succeeds with no errors.

Run: `npm run test:unit`
Expected: PASS — all tests across the project.

- [ ] **Step 6: Commit**

```bash
git add package.json src/extension.ts src/view/KanbrainViewProvider.ts test/suite/extension.test.ts
git commit -m "feat: wire board config check/sync commands and the on-open check"
```

---

### Task 8: Update the README

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Document the two new commands**

In `README.md`, after the existing numbered Setup steps (after the paragraph ending "...projects configured before these fields existed need to re-run **Kanbrain: Setup** to get colors/icons."), add a new paragraph:

```markdown
If the project's process changes later (a status is renamed, a work item type is added/removed, a type moves to a different backlog level), run **Kanbrain: Check Board Configuration** to see whether `.kanbrain/config.json` is still in sync — it never modifies anything by itself. If it finds a difference, it offers a **Sync Now** action (also available directly as **Kanbrain: Sync Board Configuration`) that refreshes colors/icons/type mappings and adds any new statuses, but never deletes a skill mapping you've configured — entries for statuses/levels no longer found on the board are kept as-is so you don't lose your work; the command's summary tells you which ones to review. Kanbrain also runs this check once, silently, each time the panel first opens in a VS Code session, and only shows a message if something needs your attention.
```

- [ ] **Step 2: Add manual verification checklist items**

After the existing line:

```
- [ ] Reopening the workspace restores the previously selected work item (via `workspaceState`).
```

insert:

```
- [ ] `Kanbrain: Check Board Configuration` reports "up to date" when the board hasn't changed since Setup, and never writes to `.kanbrain/config.json`.
- [ ] After renaming/adding/removing a status or work item type on the real Azure DevOps board, `Kanbrain: Check Board Configuration` reports the specific difference, and its "Sync Now" action (or running `Kanbrain: Sync Board Configuration` directly) updates `.kanbrain/config.json` without deleting any existing skill path mapping — including ones for statuses no longer found on the board.
- [ ] Manually editing `.kanbrain/config.json` into invalid JSON causes the panel, search, and skill actions to show a clear "not valid JSON" message (via `Kanbrain: Check Board Configuration`) instead of failing silently or crashing.
- [ ] The board configuration check runs once, silently, the first time the panel opens in a VS Code session — no visible message when everything is in sync.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document board configuration check and sync"
```
