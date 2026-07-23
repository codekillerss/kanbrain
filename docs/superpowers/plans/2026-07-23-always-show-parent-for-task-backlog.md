# Always Show Parent for Task-Backlog Work Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards for work items whose type belongs to a team's Task/iteration backlog (e.g. Task, and Bug when configured "as tasks") always show the parent, regardless of the mirrored board "Parent" field toggle — matching how the real Sprint Taskboard groups items into lanes by parent.

**Architecture:** A new Azure DevOps client method + discovery module fetches each team's actual Task-backlog work item types via `GET .../{team}/_apis/work/backlogconfiguration` (`taskBacklog.workItemTypes[]`) — this works identically across Agile/Scrum/CMMI/Basic without hardcoding "Task", since it reads whatever the real backlog configuration says. The result is threaded through `discoverBoardState` into `KanbrainConfig` (new `taskBacklogTypesByTeam` field, mirroring `cardSettingsByTeam`'s existing wiring through `setup.ts`/`syncConfig.ts`/`syncBoardConfig.ts`). `resolveShowParent` checks this new field first and short-circuits to `true` before falling back to the existing board-mirrored logic.

**Tech Stack:** TypeScript, Vitest, Azure DevOps REST API.

## Global Constraints

- Only `resolveShowParent` changes behavior — `resolveShowAssignedTo` is untouched.
- No hardcoded "Task" string anywhere in the new logic — always read from `taskBacklogTypesByTeam`.
- `taskBacklogTypesByTeam` is optional (`?`) on `KanbrainConfig` — an old config without it must fall back to today's behavior, not throw.
- Team resolution (selected team → default team → first known team) must stay identical to the existing chain already used by `resolveCardField`, extracted into one shared helper rather than duplicated.

---

### Task 1: Client method `getTaskBacklogWorkItemTypes`

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Produces: `AzureDevOpsClient.getTaskBacklogWorkItemTypes(organization: string, project: string, team: string): Promise<string[]>` — consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Add to `src/azureDevOps/client.test.ts`, right after the `describe('AzureDevOpsClient.getPullRequest', ...)` block (which currently ends at line 451 with `});`):

```ts
describe('AzureDevOpsClient.getTaskBacklogWorkItemTypes', () => {
  it('extracts the work item type names from taskBacklog.workItemTypes', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        taskBacklog: {
          id: 'Microsoft.TaskCategory',
          name: 'Tasks',
          workItemTypes: [{ name: 'Task', url: 'https://dev.azure.com/my-org/proj/_apis/wit/workItemTypes/Task' }],
        },
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const types = await client.getTaskBacklogWorkItemTypes('my-org', 'MyProject', 'MyProject Team');

    expect(types).toEqual(['Task']);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/MyProject%20Team/_apis/work/backlogconfiguration?api-version=7.1',
      expect.anything(),
    );
  });

  it('supports multiple work item types in the task backlog (e.g. Task and Bug)', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        taskBacklog: {
          workItemTypes: [{ name: 'Task' }, { name: 'Bug' }],
        },
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const types = await client.getTaskBacklogWorkItemTypes('my-org', 'MyProject', 'MyProject Team');

    expect(types).toEqual(['Task', 'Bug']);
  });

  it('returns an empty array when taskBacklog is missing from the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const types = await client.getTaskBacklogWorkItemTypes('my-org', 'MyProject', 'MyProject Team');

    expect(types).toEqual([]);
  });

  it('returns an empty array when taskBacklog.workItemTypes is missing', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ taskBacklog: {} }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const types = await client.getTaskBacklogWorkItemTypes('my-org', 'MyProject', 'MyProject Team');

    expect(types).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: FAIL — `client.getTaskBacklogWorkItemTypes is not a function`.

- [ ] **Step 3: Implement the client method**

In `src/azureDevOps/client.ts`, add this method right after `getPullRequest` (which currently ends the class body just before the final closing `}`):

```ts
  async getTaskBacklogWorkItemTypes(organization: string, project: string, team: string): Promise<string[]> {
    const data = await this.request<{ taskBacklog?: { workItemTypes?: { name: string }[] } }>(
      `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/backlogconfiguration?api-version=7.1`,
    );
    return (data.taskBacklog?.workItemTypes ?? []).map(t => t.name);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: add getTaskBacklogWorkItemTypes to fetch a team's Task-backlog types"
```

---

### Task 2: Discovery module `discoverTaskBacklogTypes.ts`

**Files:**
- Create: `src/azureDevOps/discoverTaskBacklogTypes.ts`
- Test: `src/azureDevOps/discoverTaskBacklogTypes.test.ts`

**Interfaces:**
- Consumes: `AzureDevOpsClient.getTaskBacklogWorkItemTypes` from Task 1; `AzureDevOpsClient.listTeams` (existing).
- Produces: `discoverTaskBacklogTypesByTeam(client: AzureDevOpsClient, organization: string, project: string): Promise<Record<string, string[]>>` — consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/azureDevOps/discoverTaskBacklogTypes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { discoverTaskBacklogTypesByTeam } from './discoverTaskBacklogTypes';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  listTeams: () => Promise<{ id: string; name: string }[]>;
  getTaskBacklogWorkItemTypes: () => Promise<string[]>;
}> = {}): AzureDevOpsClient {
  return {
    listTeams: vi.fn().mockResolvedValue([]),
    getTaskBacklogWorkItemTypes: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverTaskBacklogTypesByTeam', () => {
  it('collects task backlog types for every team in the project', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Team 1' },
        { id: 't2', name: 'Team 2' },
      ]),
      getTaskBacklogWorkItemTypes: vi.fn().mockResolvedValueOnce(['Task']).mockResolvedValueOnce(['Task', 'Bug']),
    });

    const result = await discoverTaskBacklogTypesByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({ 'Team 1': ['Task'], 'Team 2': ['Task', 'Bug'] });
  });

  it('skips a team whose task backlog fails to load, without aborting the others', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Team 1' },
        { id: 't2', name: 'Team 2' },
      ]),
      getTaskBacklogWorkItemTypes: vi.fn().mockRejectedValueOnce(new Error('no access')).mockResolvedValueOnce(['Task']),
    });

    const result = await discoverTaskBacklogTypesByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({ 'Team 2': ['Task'] });
  });

  it('returns an empty object when the project has no teams', async () => {
    const client = stubClient({ listTeams: vi.fn().mockResolvedValue([]) });

    const result = await discoverTaskBacklogTypesByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/azureDevOps/discoverTaskBacklogTypes.test.ts`
Expected: FAIL — cannot find module `./discoverTaskBacklogTypes`.

- [ ] **Step 3: Implement the discovery module**

Create `src/azureDevOps/discoverTaskBacklogTypes.ts`:

```ts
import type { AzureDevOpsClient } from './client';

export async function discoverTaskBacklogTypesByTeam(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
): Promise<Record<string, string[]>> {
  const teams = await client.listTeams(organization, project);

  const result: Record<string, string[]> = {};
  for (const team of teams) {
    try {
      result[team.name] = await client.getTaskBacklogWorkItemTypes(organization, project, team.name);
    } catch {
      // One-off failure for a team (e.g. no access): continue without it instead of aborting the whole discovery.
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/azureDevOps/discoverTaskBacklogTypes.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/discoverTaskBacklogTypes.ts src/azureDevOps/discoverTaskBacklogTypes.test.ts
git commit -m "feat: add discoverTaskBacklogTypesByTeam"
```

---

### Task 3: Wire into `discoverBoardState.ts`

**Files:**
- Modify: `src/azureDevOps/discoverBoardState.ts`
- Test: `src/azureDevOps/discoverBoardState.test.ts`

**Interfaces:**
- Consumes: `discoverTaskBacklogTypesByTeam` from Task 2.
- Produces: `BoardState.taskBacklogTypesByTeam: Record<string, string[]>` — consumed by Task 4.

- [ ] **Step 1: Write the failing test**

In `src/azureDevOps/discoverBoardState.test.ts`, update the `stubClient` helper's type and defaults (currently lines 6–27) — replace:

```ts
function stubClient(overrides: Partial<{
  getDefaultTeamName: () => Promise<string>;
  listWorkItemTypes: () => Promise<{ name: string; color: string; iconUrl: string }[]>;
  listWorkItemTypeStates: () => Promise<{ name: string; category: string; color: string }[]>;
  getIconSvg: () => Promise<string>;
  listTeams: () => Promise<{ id: string; name: string }[]>;
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, CardFieldSettings>>;
  countWorkItemsByType: (organization: string, project: string, types: string[]) => Promise<number>;
}> = {}): AzureDevOpsClient {
  return {
    getDefaultTeamName: vi.fn().mockResolvedValue('MyProject Team'),
    listWorkItemTypes: vi.fn().mockResolvedValue([{ name: 'Task', color: 'f2cb1d', iconUrl: 'https://example.com/icon' }]),
    listWorkItemTypeStates: vi.fn().mockResolvedValue([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]),
    getIconSvg: vi.fn().mockResolvedValue('<svg></svg>'),
    listTeams: vi.fn().mockResolvedValue([{ id: 't1', name: 'MyProject Team' }]),
    listBoards: vi.fn().mockResolvedValue([{ id: 'b1', name: 'Tasks' }]),
    getCardSettings: vi.fn().mockResolvedValue({ Task: { parent: true, assignedTo: true } }),
    countWorkItemsByType: vi.fn().mockResolvedValue(1),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}
```

with:

```ts
function stubClient(overrides: Partial<{
  getDefaultTeamName: () => Promise<string>;
  listWorkItemTypes: () => Promise<{ name: string; color: string; iconUrl: string }[]>;
  listWorkItemTypeStates: () => Promise<{ name: string; category: string; color: string }[]>;
  getIconSvg: () => Promise<string>;
  listTeams: () => Promise<{ id: string; name: string }[]>;
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, CardFieldSettings>>;
  getTaskBacklogWorkItemTypes: () => Promise<string[]>;
  countWorkItemsByType: (organization: string, project: string, types: string[]) => Promise<number>;
}> = {}): AzureDevOpsClient {
  return {
    getDefaultTeamName: vi.fn().mockResolvedValue('MyProject Team'),
    listWorkItemTypes: vi.fn().mockResolvedValue([{ name: 'Task', color: 'f2cb1d', iconUrl: 'https://example.com/icon' }]),
    listWorkItemTypeStates: vi.fn().mockResolvedValue([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]),
    getIconSvg: vi.fn().mockResolvedValue('<svg></svg>'),
    listTeams: vi.fn().mockResolvedValue([{ id: 't1', name: 'MyProject Team' }]),
    listBoards: vi.fn().mockResolvedValue([{ id: 'b1', name: 'Tasks' }]),
    getCardSettings: vi.fn().mockResolvedValue({ Task: { parent: true, assignedTo: true } }),
    getTaskBacklogWorkItemTypes: vi.fn().mockResolvedValue(['Task']),
    countWorkItemsByType: vi.fn().mockResolvedValue(1),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}
```

Then add a new test right after the existing `'continues with an empty cardSettingsByTeam when the project has no teams'` test (which ends with `});` before the `'excludes work item types...'` test):

```ts
  it('fetches task backlog work item types for every team', async () => {
    const client = stubClient();
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.taskBacklogTypesByTeam).toEqual({ 'MyProject Team': ['Task'] });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/azureDevOps/discoverBoardState.test.ts`
Expected: FAIL — `result.taskBacklogTypesByTeam` is `undefined`.

- [ ] **Step 3: Wire it into `discoverBoardState.ts`**

Replace:

```ts
import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';
import { discoverWorkItemTypes, discoverStatusesByType } from './discoverWorkItemTypes';
import { discoverCardSettingsByTeam } from './discoverCardSettings';

export interface BoardState {
  discoveredStatusesByType: Record<string, Record<string, string>>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  defaultTeam: string;
  cardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>;
}
```

with:

```ts
import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';
import { discoverWorkItemTypes, discoverStatusesByType } from './discoverWorkItemTypes';
import { discoverCardSettingsByTeam } from './discoverCardSettings';
import { discoverTaskBacklogTypesByTeam } from './discoverTaskBacklogTypes';

export interface BoardState {
  discoveredStatusesByType: Record<string, Record<string, string>>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  defaultTeam: string;
  cardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>;
  taskBacklogTypesByTeam: Record<string, string[]>;
}
```

Replace:

```ts
  const cardSettingsByTeam = await discoverCardSettingsByTeam(client, organization, project);
```

with:

```ts
  const cardSettingsByTeam = await discoverCardSettingsByTeam(client, organization, project);
  const taskBacklogTypesByTeam = await discoverTaskBacklogTypesByTeam(client, organization, project);
```

Replace:

```ts
  return {
    discoveredStatusesByType: filterToTypes(discoveredStatusesByType, typesWithItems),
    typeColors: filterToTypes(typeColors, typesWithItems),
    typeIcons: filterToTypes(typeIcons, typesWithItems),
    defaultTeam,
    cardSettingsByTeam,
  };
```

with:

```ts
  return {
    discoveredStatusesByType: filterToTypes(discoveredStatusesByType, typesWithItems),
    typeColors: filterToTypes(typeColors, typesWithItems),
    typeIcons: filterToTypes(typeIcons, typesWithItems),
    defaultTeam,
    cardSettingsByTeam,
    taskBacklogTypesByTeam,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/azureDevOps/discoverBoardState.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Type-check**

Run: `npm run compile`
Expected: errors in `setup.ts`/`syncBoardConfig.ts`/`syncConfig.ts` are expected at this point (they destructure/pass `BoardState` fields and haven't been updated yet) — Task 4 fixes them. Confirm the *only* errors are in those files, not in `discoverBoardState.ts` or its test.

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/discoverBoardState.ts src/azureDevOps/discoverBoardState.test.ts
git commit -m "feat: include taskBacklogTypesByTeam in discoverBoardState"
```

---

### Task 4: Thread `taskBacklogTypesByTeam` through config, setup, and sync

**Files:**
- Modify: `src/types.ts`
- Modify: `src/commands/setup.ts`
- Modify: `src/config/syncConfig.ts`
- Modify: `src/commands/syncBoardConfig.ts`
- Test: `src/config/syncConfig.test.ts`

**Interfaces:**
- Consumes: `BoardState.taskBacklogTypesByTeam` from Task 3.
- Produces: `KanbrainConfig.taskBacklogTypesByTeam?: Record<string, string[]>` — consumed by Task 5.

- [ ] **Step 1: Add the field to `KanbrainConfig`**

In `src/types.ts`, replace:

```ts
  cardSettingsByTeam?: Record<string, Record<string, Record<string, CardFieldSettings>>>;
  showAssignedTo?: boolean;
```

with:

```ts
  cardSettingsByTeam?: Record<string, Record<string, Record<string, CardFieldSettings>>>;
  taskBacklogTypesByTeam?: Record<string, string[]>;
  showAssignedTo?: boolean;
```

- [ ] **Step 2: Write the failing test for `syncConfig`**

Replace the entire contents of `src/config/syncConfig.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { syncConfig } from './syncConfig';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: { Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md' }, Done: null } },
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
      { Task: { 'To Do': 'Proposed', Done: 'Completed' } },
      { 'To Do': 'new-color' },
      { Task: 'new-color' },
      { Task: '<svg>new</svg>' },
      'MyProject Team',
      { 'MyProject Team': { Tasks: { Task: { parent: true, assignedTo: true } } } },
      { 'MyProject Team': ['Task'] },
    );

    expect(result.statusColors).toEqual({ 'To Do': 'new-color' });
    expect(result.typeColors).toEqual({ Task: 'new-color' });
    expect(result.typeIcons).toEqual({ Task: '<svg>new</svg>' });
    expect(result.defaultTeam).toBe('MyProject Team');
  });

  it('keeps organization and project unchanged', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {});
    expect(result.organization).toBe('org');
    expect(result.project).toBe('proj');
  });

  it('preserves an existing skill mapping for a status that still exists for that type', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed', Done: 'Completed' } }, {}, {}, {}, 'MyProject Team', {}, {});
    expect(result.skills.Task['To Do']).toEqual({ path: '.kanbrain/skills/task-todo.md' });
    expect(result.skills.Task.Done).toBeNull();
  });

  it('defaults a brand new status to null', () => {
    const result = syncConfig(
      config(),
      { Task: { 'To Do': 'Proposed', Done: 'Completed', Cancelled: 'Removed' } },
      {},
      {},
      {},
      'MyProject Team',
      {},
      {},
    );
    expect(result.skills.Task.Cancelled).toBeNull();
  });

  it('preserves an orphaned status mapping instead of deleting it', () => {
    const withOrphan = config({
      skills: {
        Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md' }, Legacy: { path: '.kanbrain/skills/legacy.md' } },
      },
    });
    const result = syncConfig(withOrphan, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {});

    expect(result.skills.Task.Legacy).toEqual({ path: '.kanbrain/skills/legacy.md' });
    expect(result.skills.Task['To Do']).toEqual({ path: '.kanbrain/skills/task-todo.md' });
  });

  it('preserves an orphaned type entirely instead of deleting it', () => {
    const withOrphanType = config({
      skills: { Task: { 'To Do': null }, Bug: { New: { path: '.kanbrain/skills/bug-new.md' } } },
    });
    const result = syncConfig(withOrphanType, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {});

    expect(result.skills.Bug).toEqual({ New: { path: '.kanbrain/skills/bug-new.md' } });
  });

  it('adds a brand new type with all statuses defaulted to null', () => {
    const result = syncConfig(
      config(),
      { Task: { 'To Do': 'Proposed' }, Bug: { New: 'Proposed' } },
      {},
      {},
      {},
      'MyProject Team',
      {},
      {},
    );
    expect(result.skills.Bug).toEqual({ New: null });
  });

  it('preserves label and color customizations on a skill entry that still applies', () => {
    const withCustomization = config({
      skills: {
        Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' } },
      },
    });
    const result = syncConfig(withCustomization, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {});

    expect(result.skills.Task['To Do']).toEqual({
      path: '.kanbrain/skills/task-todo.md',
      label: 'Refine',
      textColor: 'ffffff',
      buttonColor: '007acc',
    });
  });

  it('preserves showAssignedTo across a sync', () => {
    const result = syncConfig(config({ showAssignedTo: false }), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {});
    expect(result.showAssignedTo).toBe(false);
  });

  it('leaves showAssignedTo undefined when it was never set', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {});
    expect(result.showAssignedTo).toBeUndefined();
  });

  it('replaces cardSettingsByTeam with the fresh value, discarding the previous one', () => {
    const withOldSettings = config({ cardSettingsByTeam: { 'Old Team': { Tasks: { Task: { parent: false, assignedTo: false } } } } });
    const result = syncConfig(
      withOldSettings,
      { Task: { 'To Do': 'Proposed' } },
      {},
      {},
      {},
      'MyProject Team',
      { 'MyProject Team': { Tasks: { Task: { parent: true, assignedTo: true } } } },
      {},
    );

    expect(result.cardSettingsByTeam).toEqual({ 'MyProject Team': { Tasks: { Task: { parent: true, assignedTo: true } } } });
  });

  it('replaces taskBacklogTypesByTeam with the fresh value, discarding the previous one', () => {
    const withOldSettings = config({ taskBacklogTypesByTeam: { 'Old Team': ['Task'] } });
    const result = syncConfig(
      withOldSettings,
      { Task: { 'To Do': 'Proposed' } },
      {},
      {},
      {},
      'MyProject Team',
      {},
      { 'MyProject Team': ['Task', 'Bug'] },
    );

    expect(result.taskBacklogTypesByTeam).toEqual({ 'MyProject Team': ['Task', 'Bug'] });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/config/syncConfig.test.ts`
Expected: FAIL — either a TypeScript compile error (wrong argument count) or the new test's assertion failing once compiled.

- [ ] **Step 4: Update `syncConfig.ts`**

Replace:

```ts
export function syncConfig(
  config: KanbrainConfig,
  discoveredStatusesByType: Record<string, Record<string, string>>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshDefaultTeam: string,
  freshCardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>,
): KanbrainConfig {
```

with:

```ts
export function syncConfig(
  config: KanbrainConfig,
  discoveredStatusesByType: Record<string, Record<string, string>>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshDefaultTeam: string,
  freshCardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>,
  freshTaskBacklogTypesByTeam: Record<string, string[]>,
): KanbrainConfig {
```

Replace:

```ts
    cardSettingsByTeam: freshCardSettingsByTeam,
    showAssignedTo: config.showAssignedTo,
  };
```

with:

```ts
    cardSettingsByTeam: freshCardSettingsByTeam,
    taskBacklogTypesByTeam: freshTaskBacklogTypesByTeam,
    showAssignedTo: config.showAssignedTo,
  };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/config/syncConfig.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Update `setup.ts`**

Replace:

```ts
    const { discoveredStatusesByType, typeColors, typeIcons, defaultTeam, cardSettingsByTeam } = boardState;
```

with:

```ts
    const { discoveredStatusesByType, typeColors, typeIcons, defaultTeam, cardSettingsByTeam, taskBacklogTypesByTeam } = boardState;
```

Replace:

```ts
    writeConfig(workspaceRoot, {
      organization: orgPick.org.name,
      project: projectPick.project.name,
      defaultTeam,
      skills: preset.skills,
      statusColors,
      typeColors,
      typeIcons,
      cardSettingsByTeam,
      lastSyncedVersion: extensionVersion,
    });
```

with:

```ts
    writeConfig(workspaceRoot, {
      organization: orgPick.org.name,
      project: projectPick.project.name,
      defaultTeam,
      skills: preset.skills,
      statusColors,
      typeColors,
      typeIcons,
      cardSettingsByTeam,
      taskBacklogTypesByTeam,
      lastSyncedVersion: extensionVersion,
    });
```

- [ ] **Step 7: Update `syncBoardConfig.ts`**

Replace:

```ts
    const updated = syncConfig(
      result.config,
      boardState.discoveredStatusesByType,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
      boardState.defaultTeam,
      boardState.cardSettingsByTeam,
    );
```

with:

```ts
    const updated = syncConfig(
      result.config,
      boardState.discoveredStatusesByType,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
      boardState.defaultTeam,
      boardState.cardSettingsByTeam,
      boardState.taskBacklogTypesByTeam,
    );
```

- [ ] **Step 8: Type-check**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 9: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/types.ts src/commands/setup.ts src/config/syncConfig.ts src/commands/syncBoardConfig.ts src/config/syncConfig.test.ts
git commit -m "feat: persist taskBacklogTypesByTeam through setup and sync"
```

---

### Task 5: Override in `resolveShowParent`

**Files:**
- Modify: `src/config/resolveCardFieldVisibility.ts`
- Test: `src/config/resolveCardFieldVisibility.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.taskBacklogTypesByTeam` from Task 4.
- Produces: no new exports — `resolveShowParent`'s existing signature and behavior contract (returns `boolean`) is unchanged except for the new override case.

- [ ] **Step 1: Write the failing tests**

Add to `src/config/resolveCardFieldVisibility.test.ts`, inside the `describe('resolveShowParent', ...)` block, right after the last existing test (`'falls back to the first team found when neither the selected team nor defaultTeam exist in cardSettingsByTeam'`, which ends with `});` right before the block's closing `});`):

```ts
  it('always shows parent when the type is in the resolved team\'s task backlog, even if cardSettingsByTeam says parent is off', () => {
    const cfg = config({
      cardSettingsByTeam: { 'Team 1': { Stories: { Task: { parent: false, assignedTo: true } } } },
      taskBacklogTypesByTeam: { 'Team 1': ['Task', 'Bug'] },
    });
    expect(resolveShowParent(cfg, 'Task', 'Team 1')).toBe(true);
  });

  it('falls back to cardSettingsByTeam when the type is not in the task backlog', () => {
    const cfg = config({
      cardSettingsByTeam: { 'Team 1': { Stories: { Bug: { parent: true, assignedTo: true } } } },
      taskBacklogTypesByTeam: { 'Team 1': ['Task'] },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Team 1')).toBe(true);
  });

  it('falls back to cardSettingsByTeam-only behavior when taskBacklogTypesByTeam is undefined', () => {
    const cfg = config({
      cardSettingsByTeam: { 'Team 1': { Stories: { Task: { parent: false, assignedTo: true } } } },
    });
    expect(resolveShowParent(cfg, 'Task', 'Team 1')).toBe(false);
  });

  it('resolves the task backlog for the same team (selected > default > first) as cardSettingsByTeam', () => {
    const cfg = config({
      defaultTeam: 'Team 1',
      cardSettingsByTeam: {
        'Team 1': { Stories: { Task: { parent: false, assignedTo: true } } },
        'Team 2': { Stories: { Task: { parent: false, assignedTo: true } } },
      },
      taskBacklogTypesByTeam: { 'Team 2': ['Task'] },
    });
    // No selectedTeam -> falls back to defaultTeam ('Team 1'), which has no Task in its task backlog.
    expect(resolveShowParent(cfg, 'Task', undefined)).toBe(false);
    // Explicitly selecting Team 2 -> its task backlog includes Task.
    expect(resolveShowParent(cfg, 'Task', 'Team 2')).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/config/resolveCardFieldVisibility.test.ts`
Expected: FAIL — `resolveShowParent` doesn't check `taskBacklogTypesByTeam` yet, so the first two new tests return `false`/whatever `cardSettingsByTeam` says instead of the expected override.

- [ ] **Step 3: Implement the override**

Replace the full contents of `src/config/resolveCardFieldVisibility.ts` with:

```ts
import type { KanbrainConfig, CardFieldSettings } from '../types';

function resolveTeamName(config: KanbrainConfig, selectedTeam: string | undefined): string | undefined {
  const teamNames = Object.keys(config.cardSettingsByTeam ?? {});
  if (teamNames.length === 0) {
    return undefined;
  }
  return selectedTeam && teamNames.includes(selectedTeam) ? selectedTeam : teamNames.includes(config.defaultTeam) ? config.defaultTeam : teamNames[0];
}

function resolveCardField(
  config: KanbrainConfig,
  workItemType: string,
  selectedTeam: string | undefined,
  field: keyof CardFieldSettings,
): boolean {
  const teamName = resolveTeamName(config, selectedTeam);
  if (!teamName) {
    return false;
  }
  const boards = (config.cardSettingsByTeam ?? {})[teamName];

  const matches = Object.values(boards).filter(byType => workItemType in byType);
  if (matches.length === 0) {
    return false;
  }
  return matches[0][workItemType][field];
}

export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  const teamName = resolveTeamName(config, selectedTeam);
  const taskBacklogTypes = (teamName && config.taskBacklogTypesByTeam?.[teamName]) ?? [];
  if (taskBacklogTypes.includes(workItemType)) {
    return true;
  }
  return resolveCardField(config, workItemType, selectedTeam, 'parent');
}

export function resolveShowAssignedTo(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  return resolveCardField(config, workItemType, selectedTeam, 'assignedTo');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/config/resolveCardFieldVisibility.test.ts`
Expected: PASS, all tests (existing + 4 new).

- [ ] **Step 5: Type-check**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/config/resolveCardFieldVisibility.ts src/config/resolveCardFieldVisibility.test.ts
git commit -m "feat: always show parent for work item types in the team's task backlog"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite and type-check one more time**

Run: `npx vitest run && npm run compile`
Expected: all pass, no errors.

- [ ] **Step 2: Manual verification (F5)**

Press F5 to launch the Extension Development Host, then run **Kanbrain: Sync Board Configuration** (or **Kanbrain: Setup** if not yet configured) to populate `taskBacklogTypesByTeam` in `.kanbrain/config.json` from the real project. Then:
- Open a Task (or whatever type your project uses at the Task/iteration backlog level) in the Flow screen and confirm its parent now shows on the card, even if it didn't before.
- If your project's "Parent" board field toggle for that type is off, confirm the parent still shows (proving the override, not just the existing mirrored toggle, is what's showing it).
- If possible, check a non-Task-backlog type (e.g. a Story/Bug not configured as a task) still respects the existing board-mirrored toggle as before.

- [ ] **Step 3: Report back**

Tell the user the outcome of the manual check, and paste the shape of `taskBacklogTypesByTeam` that actually got written to `.kanbrain/config.json` for their team, since the `backlogconfiguration` response shape was confirmed via documentation, not a live call, in this session.
