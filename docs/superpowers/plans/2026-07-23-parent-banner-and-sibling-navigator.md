# Parent Banner + Sibling Navigator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revert the task-backlog "always show parent" heuristic entirely, and replace it with a more general parent banner + sibling navigator (dots + arrows) that always appears on the Flow screen's main card when it has a parent — using data already fetched today, with no new API calls.

**Architecture:** Task 1 is a pure revert of everything added by the previous plan (`2026-07-23-always-show-parent-for-task-backlog.md`). Task 2 adds a new `renderParentContext.ts` with two pure render functions built entirely from `parent.childIds` (already available on the `WorkItem` fetched today). Task 3 wires them into the Flow branch of `render.ts` and adds the CSS. Navigation reuses the existing `pick-work-item` message/handler — no new webview JS.

**Tech Stack:** TypeScript, Vitest, VS Code Webview API.

## Global Constraints

- No new Azure DevOps API calls — the sibling navigator is built entirely from `parent.childIds`, which is already present on every fetched `WorkItem`.
- Dots are non-interactive (visual only); only the arrows navigate, via the existing `data-action="pick-work-item"` delegated click handler.
- `renderWorkItemCard`/`resolveShowParent`/card-settings-driven inline "Parent: #id" behavior does not change at all — the banner is an unconditional addition on top, Flow-only.
- Sliding window of at most 5 dots, centered on the current item, clamped at the list's edges.

---

### Task 1: Revert `taskBacklogTypesByTeam` in full

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Modify: `src/azureDevOps/client.test.ts`
- Delete: `src/azureDevOps/discoverTaskBacklogTypes.ts`
- Delete: `src/azureDevOps/discoverTaskBacklogTypes.test.ts`
- Modify: `src/azureDevOps/discoverBoardState.ts`
- Modify: `src/azureDevOps/discoverBoardState.test.ts`
- Modify: `src/types.ts`
- Modify: `src/commands/setup.ts`
- Modify: `src/config/syncConfig.ts`
- Modify: `src/config/syncConfig.test.ts`
- Modify: `src/commands/syncBoardConfig.ts`
- Modify: `src/config/resolveCardFieldVisibility.ts`
- Modify: `src/config/resolveCardFieldVisibility.test.ts`

**Interfaces:**
- Produces: `resolveShowParent(config, workItemType, selectedTeam)` back to its pre-task-backlog behavior (pure `cardSettingsByTeam` lookup) — consumed unchanged by `render.ts`/`renderWorkItemCard.ts` (no call-site changes needed anywhere, since the signature never changed).

- [ ] **Step 1: Remove the client method**

In `src/azureDevOps/client.ts`, remove:

```ts
  async getTaskBacklogWorkItemTypes(organization: string, project: string, team: string): Promise<string[]> {
    const data = await this.request<{ taskBacklog?: { workItemTypes?: { name: string }[] } }>(
      `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/backlogconfiguration?api-version=7.1`,
    );
    return (data.taskBacklog?.workItemTypes ?? []).map(t => t.name);
  }
```

leaving `getPullRequest`'s closing `}` immediately followed by the class's closing `}`.

- [ ] **Step 2: Remove its tests**

In `src/azureDevOps/client.test.ts`, replace:

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

describe('AzureDevOpsClient.listWorkItemTypes', () => {
```

with:

```ts
describe('AzureDevOpsClient.listWorkItemTypes', () => {
```

- [ ] **Step 3: Delete the discovery module and its test**

```bash
git rm src/azureDevOps/discoverTaskBacklogTypes.ts src/azureDevOps/discoverTaskBacklogTypes.test.ts
```

- [ ] **Step 4: Revert `discoverBoardState.ts`**

Replace:

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

with:

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

Replace:

```ts
  const cardSettingsByTeam = await discoverCardSettingsByTeam(client, organization, project);
  const taskBacklogTypesByTeam = await discoverTaskBacklogTypesByTeam(client, organization, project);
```

with:

```ts
  const cardSettingsByTeam = await discoverCardSettingsByTeam(client, organization, project);
```

Replace:

```ts
    defaultTeam,
    cardSettingsByTeam,
    taskBacklogTypesByTeam,
  };
}
```

with:

```ts
    defaultTeam,
    cardSettingsByTeam,
  };
}
```

- [ ] **Step 5: Revert `discoverBoardState.test.ts`**

Replace the `stubClient` helper's type and defaults:

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

Remove the test:

```ts
  it('fetches task backlog work item types for every team', async () => {
    const client = stubClient();
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.taskBacklogTypesByTeam).toEqual({ 'MyProject Team': ['Task'] });
  });
```

- [ ] **Step 6: Revert `types.ts`**

Replace:

```ts
  cardSettingsByTeam?: Record<string, Record<string, Record<string, CardFieldSettings>>>;
  taskBacklogTypesByTeam?: Record<string, string[]>;
  showAssignedTo?: boolean;
```

with:

```ts
  cardSettingsByTeam?: Record<string, Record<string, Record<string, CardFieldSettings>>>;
  showAssignedTo?: boolean;
```

- [ ] **Step 7: Revert `setup.ts`**

Replace:

```ts
    const { discoveredStatusesByType, typeColors, typeIcons, defaultTeam, cardSettingsByTeam, taskBacklogTypesByTeam } = boardState;
```

with:

```ts
    const { discoveredStatusesByType, typeColors, typeIcons, defaultTeam, cardSettingsByTeam } = boardState;
```

Replace:

```ts
      typeIcons,
      cardSettingsByTeam,
      taskBacklogTypesByTeam,
      lastSyncedVersion: extensionVersion,
    });
```

with:

```ts
      typeIcons,
      cardSettingsByTeam,
      lastSyncedVersion: extensionVersion,
    });
```

- [ ] **Step 8: Revert `syncConfig.ts`**

Replace:

```ts
  freshCardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>,
  freshTaskBacklogTypesByTeam: Record<string, string[]>,
): KanbrainConfig {
```

with:

```ts
  freshCardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>,
): KanbrainConfig {
```

Replace:

```ts
    cardSettingsByTeam: freshCardSettingsByTeam,
    taskBacklogTypesByTeam: freshTaskBacklogTypesByTeam,
    showAssignedTo: config.showAssignedTo,
  };
```

with:

```ts
    cardSettingsByTeam: freshCardSettingsByTeam,
    showAssignedTo: config.showAssignedTo,
  };
```

- [ ] **Step 9: Revert `syncBoardConfig.ts`**

Replace:

```ts
      boardState.defaultTeam,
      boardState.cardSettingsByTeam,
      boardState.taskBacklogTypesByTeam,
    );
```

with:

```ts
      boardState.defaultTeam,
      boardState.cardSettingsByTeam,
    );
```

- [ ] **Step 10: Revert `resolveCardFieldVisibility.ts`**

Replace:

```ts
export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  const teamName = resolveTeamName(config, selectedTeam);
  const taskBacklogTypes = (teamName && config.taskBacklogTypesByTeam?.[teamName]) ?? [];
  if (taskBacklogTypes.includes(workItemType)) {
    return true;
  }
  return resolveCardField(config, workItemType, selectedTeam, 'parent');
}
```

with:

```ts
export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  return resolveCardField(config, workItemType, selectedTeam, 'parent');
}
```

(`resolveTeamName` stays as a shared helper used by `resolveCardField` — it's a reasonable extraction independent of the reverted feature, and removing it would just reintroduce duplicated team-resolution logic.)

- [ ] **Step 11: Revert `syncConfig.test.ts`**

Replace the entire file contents with:

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
    );

    expect(result.statusColors).toEqual({ 'To Do': 'new-color' });
    expect(result.typeColors).toEqual({ Task: 'new-color' });
    expect(result.typeIcons).toEqual({ Task: '<svg>new</svg>' });
    expect(result.defaultTeam).toBe('MyProject Team');
  });

  it('keeps organization and project unchanged', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {});
    expect(result.organization).toBe('org');
    expect(result.project).toBe('proj');
  });

  it('preserves an existing skill mapping for a status that still exists for that type', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed', Done: 'Completed' } }, {}, {}, {}, 'MyProject Team', {});
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
    );
    expect(result.skills.Task.Cancelled).toBeNull();
  });

  it('preserves an orphaned status mapping instead of deleting it', () => {
    const withOrphan = config({
      skills: {
        Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md' }, Legacy: { path: '.kanbrain/skills/legacy.md' } },
      },
    });
    const result = syncConfig(withOrphan, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {});

    expect(result.skills.Task.Legacy).toEqual({ path: '.kanbrain/skills/legacy.md' });
    expect(result.skills.Task['To Do']).toEqual({ path: '.kanbrain/skills/task-todo.md' });
  });

  it('preserves an orphaned type entirely instead of deleting it', () => {
    const withOrphanType = config({
      skills: { Task: { 'To Do': null }, Bug: { New: { path: '.kanbrain/skills/bug-new.md' } } },
    });
    const result = syncConfig(withOrphanType, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {});

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
    );
    expect(result.skills.Bug).toEqual({ New: null });
  });

  it('preserves label and color customizations on a skill entry that still applies', () => {
    const withCustomization = config({
      skills: {
        Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' } },
      },
    });
    const result = syncConfig(withCustomization, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {});

    expect(result.skills.Task['To Do']).toEqual({
      path: '.kanbrain/skills/task-todo.md',
      label: 'Refine',
      textColor: 'ffffff',
      buttonColor: '007acc',
    });
  });

  it('preserves showAssignedTo across a sync', () => {
    const result = syncConfig(config({ showAssignedTo: false }), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {});
    expect(result.showAssignedTo).toBe(false);
  });

  it('leaves showAssignedTo undefined when it was never set', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {});
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
    );

    expect(result.cardSettingsByTeam).toEqual({ 'MyProject Team': { Tasks: { Task: { parent: true, assignedTo: true } } } });
  });
});
```

- [ ] **Step 12: Revert `resolveCardFieldVisibility.test.ts`**

Replace the entire file contents with:

```ts
import { describe, it, expect } from 'vitest';
import { resolveShowParent, resolveShowAssignedTo } from './resolveCardFieldVisibility';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'Team 1',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('resolveShowParent', () => {
  it('returns false when the type is not found in any board of any team', () => {
    const result = resolveShowParent(
      config({ cardSettingsByTeam: { 'Team 1': { Stories: { Bug: { parent: true, assignedTo: true } } } } }),
      'Task',
      undefined,
    );
    expect(result).toBe(false);
  });

  it('returns false when cardSettingsByTeam is undefined', () => {
    expect(resolveShowParent(config(), 'Task', undefined)).toBe(false);
  });

  it('falls back to defaultTeam when no team is explicitly selected', () => {
    const cfg = config({
      defaultTeam: 'Team 1',
      cardSettingsByTeam: {
        'Team 1': { Stories: { Bug: { parent: true, assignedTo: false } } },
        'Team 2': { Stories: { Bug: { parent: false, assignedTo: false } } },
      },
    });
    expect(resolveShowParent(cfg, 'Bug', undefined)).toBe(true);
  });

  it('uses the explicitly selected team over defaultTeam', () => {
    const cfg = config({
      defaultTeam: 'Team 1',
      cardSettingsByTeam: {
        'Team 1': { Stories: { Bug: { parent: true, assignedTo: false } } },
        'Team 2': { Stories: { Bug: { parent: false, assignedTo: false } } },
      },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Team 2')).toBe(false);
  });

  it('finds the type in whichever board of the selected team has it', () => {
    const cfg = config({
      cardSettingsByTeam: {
        'Team 1': { Epics: { Epic: { parent: true, assignedTo: true } }, Stories: { Bug: { parent: false, assignedTo: true } } },
      },
    });
    expect(resolveShowParent(cfg, 'Epic', 'Team 1')).toBe(true);
    expect(resolveShowParent(cfg, 'Bug', 'Team 1')).toBe(false);
  });

  it('falls back to the first team found when neither the selected team nor defaultTeam exist in cardSettingsByTeam', () => {
    const cfg = config({
      defaultTeam: 'Missing Team',
      cardSettingsByTeam: { 'Team 1': { Stories: { Bug: { parent: true, assignedTo: true } } } },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Also Missing')).toBe(true);
  });
});

describe('resolveShowAssignedTo', () => {
  it('returns false when the type is not found in any board of any team', () => {
    const result = resolveShowAssignedTo(
      config({ cardSettingsByTeam: { 'Team 1': { Stories: { Bug: { parent: true, assignedTo: true } } } } }),
      'Task',
      undefined,
    );
    expect(result).toBe(false);
  });

  it('falls back to defaultTeam when no team is explicitly selected', () => {
    const cfg = config({
      defaultTeam: 'Team 1',
      cardSettingsByTeam: {
        'Team 1': { Stories: { Bug: { parent: false, assignedTo: true } } },
        'Team 2': { Stories: { Bug: { parent: false, assignedTo: false } } },
      },
    });
    expect(resolveShowAssignedTo(cfg, 'Bug', undefined)).toBe(true);
  });

  it('uses the explicitly selected team over defaultTeam', () => {
    const cfg = config({
      defaultTeam: 'Team 1',
      cardSettingsByTeam: {
        'Team 1': { Stories: { Bug: { parent: false, assignedTo: true } } },
        'Team 2': { Stories: { Bug: { parent: false, assignedTo: false } } },
      },
    });
    expect(resolveShowAssignedTo(cfg, 'Bug', 'Team 2')).toBe(false);
  });
});
```

- [ ] **Step 13: Type-check**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 14: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, and the total test count drops back down (no more task-backlog tests anywhere).

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "revert: remove taskBacklogTypesByTeam, superseded by the parent banner"
```

---

### Task 2: `renderParentContext.ts` — parent banner + sibling navigator

**Files:**
- Create: `src/view/renderParentContext.ts`
- Test: `src/view/renderParentContext.test.ts`

**Interfaces:**
- Consumes: `WorkItem`, `KanbrainConfig` from `../types` (existing); `renderTypeAccent` from `./renderTypeAccent` (existing); `escapeHtml` from `./escapeHtml` (existing).
- Produces: `renderParentBanner(parent: WorkItem | null, config: KanbrainConfig): string` and `renderSiblingNavigator(workItem: WorkItem, parent: WorkItem | null): string` — both consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `src/view/renderParentContext.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderParentBanner, renderSiblingNavigator } from './renderParentContext';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Fix bug',
    description: '',
    status: 'Active',
    type: 'Task',
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
  skills: {},
  statusColors: {},
  typeColors: { Epic: 'ff9900' },
  typeIcons: { Epic: '<svg><path d="M0 0"/></svg>' },
};

describe('renderParentBanner', () => {
  it('returns an empty string when there is no parent', () => {
    expect(renderParentBanner(null, config)).toBe('');
  });

  it('renders the parent icon, id, and escaped title, clickable to open its detail panel', () => {
    const parent = workItem({ id: 900, title: 'Epic <parent>', type: 'Epic' });
    const html = renderParentBanner(parent, config);

    expect(html).toContain('kb-parent-banner');
    expect(html).toContain('<svg');
    expect(html).toContain('#900');
    expect(html).toContain('Epic &lt;parent&gt;');
    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('data-id="900"');
  });
});

describe('renderSiblingNavigator', () => {
  it('returns an empty string when there is no parent', () => {
    expect(renderSiblingNavigator(workItem(), null)).toBe('');
  });

  it('returns an empty string when the work item is not among the parent\'s childIds', () => {
    const parent = workItem({ id: 900, childIds: [101, 102] });
    expect(renderSiblingNavigator(workItem({ id: 482 }), parent)).toBe('');
  });

  it('shows a single active dot with both arrows disabled when the item has no siblings', () => {
    const parent = workItem({ id: 900, childIds: [482] });
    const html = renderSiblingNavigator(workItem({ id: 482 }), parent);

    // Exactly 1 active dot, 0 non-active dots (the literal `class="kb-sibling-dot"` with an
    // immediate closing quote never matches the active dot's `kb-sibling-dot kb-sibling-dot-active`).
    expect(html.split('kb-sibling-dot-active').length - 1).toBe(1);
    expect(html.split('class="kb-sibling-dot"').length - 1).toBe(0);
    expect(html).toContain('kb-sibling-arrow-prev" disabled');
    expect(html).toContain('kb-sibling-arrow-next" disabled');
  });

  it('points the prev/next arrows at the correct sibling ids', () => {
    const parent = workItem({ id: 900, childIds: [101, 482, 103] });
    const html = renderSiblingNavigator(workItem({ id: 482 }), parent);

    expect(html).toContain('kb-sibling-arrow-prev" data-action="pick-work-item" data-id="101"');
    expect(html).toContain('kb-sibling-arrow-next" data-action="pick-work-item" data-id="103"');
  });

  it('disables the prev arrow at the start of the list and the next arrow at the end', () => {
    const parent = workItem({ id: 900, childIds: [482, 103, 104] });

    const atStart = renderSiblingNavigator(workItem({ id: 482 }), parent);
    expect(atStart).toContain('kb-sibling-arrow-prev" disabled');
    expect(atStart).toContain('kb-sibling-arrow-next" data-action="pick-work-item" data-id="103"');

    const atEnd = renderSiblingNavigator(workItem({ id: 104 }), parent);
    expect(atEnd).toContain('kb-sibling-arrow-next" disabled');
    expect(atEnd).toContain('kb-sibling-arrow-prev" data-action="pick-work-item" data-id="103"');
  });

  it('shows a centered sliding window of at most 5 dots when there are more than 5 siblings', () => {
    const childIds = Array.from({ length: 12 }, (_, i) => i + 1); // [1..12]
    const parent = workItem({ id: 900, childIds });

    // Current item in the middle (id 6, index 5): window = indices [3..7] = ids [4,5,6,7,8].
    // prevId/nextId are the immediate neighbors in the full list (5 and 7), both inside the window.
    const middle = renderSiblingNavigator(workItem({ id: 6 }), parent);
    const middleDotCount = (middle.split('kb-sibling-dot-active').length - 1) + (middle.split('class="kb-sibling-dot"').length - 1);
    expect(middleDotCount).toBe(5);
    expect(middle).toContain('kb-sibling-arrow-prev" data-action="pick-work-item" data-id="5"');
    expect(middle).toContain('kb-sibling-arrow-next" data-action="pick-work-item" data-id="7"');

    // Current item at the very start (id 1, index 0): window clamps to ids [1..5].
    const start = renderSiblingNavigator(workItem({ id: 1 }), parent);
    expect(start).toContain('kb-sibling-arrow-prev" disabled');
    expect(start).toContain('kb-sibling-arrow-next" data-action="pick-work-item" data-id="2"');

    // Current item at the very end (id 12, index 11): window clamps to ids [8..12].
    const end = renderSiblingNavigator(workItem({ id: 12 }), parent);
    expect(end).toContain('kb-sibling-arrow-next" disabled');
    expect(end).toContain('kb-sibling-arrow-prev" data-action="pick-work-item" data-id="11"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/renderParentContext.test.ts`
Expected: FAIL — cannot find module `./renderParentContext`.

- [ ] **Step 3: Implement `renderParentContext.ts`**

Create `src/view/renderParentContext.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderTypeAccent } from './renderTypeAccent';

const MAX_VISIBLE_DOTS = 5;

export function renderParentBanner(parent: WorkItem | null, config: KanbrainConfig): string {
  if (!parent) {
    return '';
  }
  const { iconHtml } = renderTypeAccent(parent.type, config);
  return `
    <div class="kb-parent-banner" data-action="open-work-item-detail" data-id="${parent.id}">
      ${iconHtml}<span class="kb-link-text">#${parent.id}: ${escapeHtml(parent.title)}</span>
    </div>
  `;
}

function renderArrow(direction: 'prev' | 'next', siblingId: number | null): string {
  const symbol = direction === 'prev' ? '‹' : '›';
  const className = `kb-sibling-arrow kb-sibling-arrow-${direction}`;
  if (siblingId === null) {
    return `<button type="button" class="${className}" disabled>${symbol}</button>`;
  }
  return `<button type="button" class="${className}" data-action="pick-work-item" data-id="${siblingId}">${symbol}</button>`;
}

export function renderSiblingNavigator(workItem: WorkItem, parent: WorkItem | null): string {
  if (!parent) {
    return '';
  }
  const siblings = parent.childIds;
  const currentIndex = siblings.indexOf(workItem.id);
  if (currentIndex === -1) {
    return '';
  }

  const prevId = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextId = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  const windowSize = Math.min(MAX_VISIBLE_DOTS, siblings.length);
  const start = Math.min(
    Math.max(0, currentIndex - Math.floor(windowSize / 2)),
    Math.max(0, siblings.length - windowSize),
  );
  const windowIds = siblings.slice(start, start + windowSize);

  const dotsHtml = windowIds
    .map(id => `<span class="kb-sibling-dot${id === workItem.id ? ' kb-sibling-dot-active' : ''}"></span>`)
    .join('');

  return `
    <div class="kb-sibling-nav">
      ${renderArrow('prev', prevId)}
      <div class="kb-sibling-dots">${dotsHtml}</div>
      ${renderArrow('next', nextId)}
    </div>
  `;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/renderParentContext.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/view/renderParentContext.ts src/view/renderParentContext.test.ts
git commit -m "feat: add renderParentBanner and renderSiblingNavigator"
```

---

### Task 3: Wire into the Flow screen + CSS

**Files:**
- Modify: `src/view/render.ts`
- Modify: `src/view/KanbrainViewProvider.ts`
- Test: `src/view/render.test.ts`

**Interfaces:**
- Consumes: `renderParentBanner`, `renderSiblingNavigator` from Task 2.

- [ ] **Step 1: Write the failing tests**

In `src/view/render.test.ts`, add these tests right before the file's final closing `});` (after the `'does not show the parent row on subtask cards'` test, which currently ends the `describe` block):

```ts
  it('shows the parent banner and sibling navigator on the Flow screen when the item has a parent', () => {
    const parent = workItem({ id: 900, title: 'Epic parent', childIds: [482, 501] });
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ id: 482 }),
      parent,
      subtasks: [],
      screen: 'flow',
    });

    expect(html).toContain('kb-parent-banner');
    expect(html).toContain('kb-sibling-nav');
  });

  it('does not show the parent banner or sibling navigator when there is no parent', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem(),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });

    expect(html).not.toContain('kb-parent-banner');
    expect(html).not.toContain('kb-sibling-nav');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/view/render.test.ts`
Expected: FAIL — neither `kb-parent-banner` nor `kb-sibling-nav` appear anywhere yet.

- [ ] **Step 3: Wire the components into `render.ts`**

Replace:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
import { renderConfig } from './renderConfig';
import { resolveShowParent } from '../config/resolveCardFieldVisibility';
```

with:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
import { renderConfig } from './renderConfig';
import { resolveShowParent } from '../config/resolveCardFieldVisibility';
import { renderParentBanner, renderSiblingNavigator } from './renderParentContext';
```

Replace:

```ts
  const avatars = state.avatars ?? {};
  const showParent = resolveShowParent(state.config, state.workItem.type, state.selectedTeam);
  const subtasksHtml = state.subtasks.length
```

with:

```ts
  const avatars = state.avatars ?? {};
  const showParent = resolveShowParent(state.config, state.workItem.type, state.selectedTeam);
  const parentBannerHtml = renderParentBanner(state.parent, state.config);
  const siblingNavHtml = renderSiblingNavigator(state.workItem, state.parent);
  const subtasksHtml = state.subtasks.length
```

Replace:

```ts
    <div class="kb-card-wrapper">
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent, state.selectedTeam)}
```

with:

```ts
    ${parentBannerHtml}
    ${siblingNavHtml}
    <div class="kb-card-wrapper">
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent, state.selectedTeam)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/view/render.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Add the CSS**

In `src/view/KanbrainViewProvider.ts`'s `css()` method, replace:

```ts
      .kb-parent-link { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; }
      .kb-parent-link .kb-link-text { color: var(--vscode-textLink-foreground); text-decoration: underline; }
      .kb-parent-link:hover .kb-link-text { color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); }
```

with:

```ts
      .kb-parent-link { display: flex; align-items: center; gap: 4px; font-size: 12px; cursor: pointer; }
      .kb-parent-link .kb-link-text { color: var(--vscode-textLink-foreground); text-decoration: underline; }
      .kb-parent-link:hover .kb-link-text { color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); }
      .kb-parent-banner { display: flex; align-items: center; gap: 6px; padding: 6px 10px; margin-bottom: 4px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; cursor: pointer; font-size: 12px; }
      .kb-parent-banner:hover { background: var(--vscode-list-hoverBackground); }
      .kb-parent-banner .kb-link-text { color: var(--vscode-textLink-foreground); }
      .kb-sibling-nav { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 4px 0; margin-bottom: 8px; }
      .kb-sibling-arrow { background: none; border: none; color: var(--vscode-foreground); font-size: 16px; line-height: 1; cursor: pointer; padding: 0 4px; }
      .kb-sibling-arrow:disabled { opacity: 0.3; cursor: default; }
      .kb-sibling-dots { display: flex; gap: 6px; }
      .kb-sibling-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-panel-border); }
      .kb-sibling-dot-active { background: var(--vscode-textLink-foreground); }
```

- [ ] **Step 6: Type-check**

Run: `npm run compile`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts src/view/KanbrainViewProvider.ts
git commit -m "feat: show a parent banner and sibling navigator on the Flow screen"
```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite and type-check one more time**

Run: `npx vitest run && npm run compile`
Expected: all pass, no errors.

- [ ] **Step 2: Manual verification (F5)**

Press F5 to launch the Extension Development Host. Open the Flow screen for a work item that has a parent with multiple children:
- Confirm the parent banner appears above the main card, and clicking it opens the parent's detail panel.
- Confirm the sibling navigator appears below the banner, with the current item's dot highlighted.
- Click the next/prev arrows and confirm the Flow screen switches to that sibling (full refetch, same as picking it from search).
- Confirm the arrow disappears/disables correctly at the first and last sibling.
- If the parent has more than 5 children, confirm only 5 dots show at a time and the window slides as you navigate.
- Open a work item with no parent and confirm neither the banner nor the navigator appear.

- [ ] **Step 3: Report back**

Tell the user the outcome of the manual check.
