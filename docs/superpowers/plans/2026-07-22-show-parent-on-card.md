# Show Parent on Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the parent work item's title on the Kanbrain main card, gated by whether the real Azure DevOps board's "Parent" card field is enabled for that work item type — mirrored automatically from the Azure DevOps API, not a local-only toggle.

**Architecture:** A new `AzureDevOpsClient.getCardSettings` call reads each team board's real Fields configuration; `discoverBoardState` aggregates it into `cardSettingsByBoard` (keyed by board name, then work item type); Setup/Sync write it into `.kanbrain/config.json` as a full replace, same as `typeColors`/`typeIcons`. A pure `resolveShowParent` function decides visibility per type, using a user-local (workspaceState, not committed) "selected board" only to break ties when a type exists on more than one board. `renderWorkItemCard` gains two optional trailing parameters (`parent`, `showParent`) and only the Flow screen's main card passes them.

**Tech Stack:** TypeScript, VS Code extension API, vitest for unit tests, Azure DevOps REST API 7.1.

## Global Constraints

- No hardcoded board or backlog-level names anywhere — boards come from `client.listBoards(...)`, exactly like backlog levels already come from `client.listBacklogLevels(...)` (spec section "Contexto e motivação").
- `cardSettingsByBoard` is a **full replace** on every Setup/Sync, never merged with the previous value — same treatment as `typeColors`/`typeIcons` (spec section "Escopo").
- `cardSettingsByBoard` is **not** manually editable in the Config screen — only the *board selection* (tie-break) is user-editable, and that selection lives in `workspaceState`, never in the committed `.kanbrain/config.json` (spec section "Escopo").
- Any parser/lookup failure (unrecognized `cardsettings` shape, missing type, board fetch error) must degrade to `false` (Parent hidden) — never throw, never abort Setup/Sync as a whole (spec section "Tratamento de erros").
- The Parent row renders **only on the main/active work item card** on the Flow screen — never on subtask cards, search results, or the Home screen (spec section "Escopo").
- One isolated board or type failing to fetch must not abort discovery for the others (same pattern already used by `discoverBoardColumns`).

---

### Task 1: Client method `getCardSettings`

**Files:**
- Modify: `src/types.ts`
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Produces: `KanbrainConfig.cardSettingsByBoard?: Record<string, Record<string, boolean>>` (board name → work item type → Parent field enabled).
- Produces: `AzureDevOpsClient.getCardSettings(organization: string, project: string, team: string, boardId: string): Promise<Record<string, boolean>>`.

- [ ] **Step 1: Add the new config field**

In `src/types.ts`, add `cardSettingsByBoard` to `KanbrainConfig` (after `typeIcons`, before `showAssignedTo`):

```ts
export interface KanbrainConfig {
  organization: string;
  project: string;
  typeToBacklogLevel: Record<string, string>;
  backlogLevels: Record<string, Record<string, SkillEntry | null>>;
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  cardSettingsByBoard?: Record<string, Record<string, boolean>>;
  showAssignedTo?: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

Add to `src/azureDevOps/client.test.ts`, as a new `describe` block after `describe('AzureDevOpsClient.getComments', ...)` (before the file's closing):

```ts
describe('AzureDevOpsClient.getCardSettings', () => {
  it('maps each work item type to whether a Parent field identifier is present', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        cards: {
          'User Story': { fields: [{ fieldIdentifier: 'System.Parent' }, { fieldIdentifier: 'System.Tags' }] },
          Bug: { fields: [{ fieldIdentifier: 'System.Tags' }] },
        },
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const settings = await client.getCardSettings('my-org', 'MyProject', 'MyProject Team', 'b1');

    expect(settings).toEqual({ 'User Story': true, Bug: false });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/MyProject%20Team/_apis/work/boards/b1/cardsettings?api-version=7.1',
      expect.anything(),
    );
  });

  it('returns an empty object when the response has no cards', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({}));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const settings = await client.getCardSettings('my-org', 'MyProject', 'MyProject Team', 'b1');

    expect(settings).toEqual({});
  });

  it('treats a type with no fields array as Parent not shown', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ cards: { Task: {} } }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const settings = await client.getCardSettings('my-org', 'MyProject', 'MyProject Team', 'b1');

    expect(settings).toEqual({ Task: false });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit -- client.test.ts`
Expected: FAIL with `getCardSettings is not a function`

- [ ] **Step 4: Implement `getCardSettings`**

In `src/azureDevOps/client.ts`, add a module-level constant near the top (after the `RawIdentityRef` interface, before `mapIdentityRef`):

```ts
const PARENT_FIELD_IDENTIFIERS = new Set(['System.Parent', 'Parent']);
```

Add the method to `AzureDevOpsClient`, right after `listBoardColumns` (the last method, just before the closing `}` of the class):

```ts
  async getCardSettings(organization: string, project: string, team: string, boardId: string): Promise<Record<string, boolean>> {
    const data = await this.request<{ cards?: Record<string, { fields?: { fieldIdentifier?: string }[] }> }>(
      `https://dev.azure.com/${organization}/${project}/${encodeURIComponent(team)}/_apis/work/boards/${encodeURIComponent(boardId)}/cardsettings?api-version=7.1`,
    );
    const cards = data.cards ?? {};
    const result: Record<string, boolean> = {};
    for (const [type, settings] of Object.entries(cards)) {
      const fields = settings?.fields ?? [];
      result[type] = fields.some(f => !!f.fieldIdentifier && PARENT_FIELD_IDENTIFIERS.has(f.fieldIdentifier));
    }
    return result;
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit -- client.test.ts`
Expected: PASS (all `AzureDevOpsClient.getCardSettings` cases green, no regressions in the rest of the file)

- [ ] **Step 6: Compile**

Run: `npm run compile`
Expected: no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: add AzureDevOpsClient.getCardSettings and cardSettingsByBoard config field"
```

---

### Task 2: Discovery — `discoverCardSettingsByBoard`, wired into `discoverBoardState`

**Files:**
- Create: `src/azureDevOps/discoverCardSettings.ts`
- Test: `src/azureDevOps/discoverCardSettings.test.ts`
- Modify: `src/azureDevOps/discoverBoardState.ts`
- Modify: `src/azureDevOps/discoverBoardState.test.ts`

**Interfaces:**
- Consumes: `AzureDevOpsClient.listBoards(organization, project, team): Promise<{ id: string; name: string }[]>` (existing), `AzureDevOpsClient.getCardSettings(...)` (Task 1).
- Produces: `discoverCardSettingsByBoard(client, organization, project, team): Promise<Record<string, Record<string, boolean>>>`.
- Produces: `BoardState.cardSettingsByBoard: Record<string, Record<string, boolean>>` (new required field on the existing `BoardState` interface).

- [ ] **Step 1: Write the failing test for the new discovery function**

Create `src/azureDevOps/discoverCardSettings.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { discoverCardSettingsByBoard } from './discoverCardSettings';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, boolean>>;
}> = {}): AzureDevOpsClient {
  return {
    listBoards: vi.fn().mockResolvedValue([]),
    getCardSettings: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverCardSettingsByBoard', () => {
  it('collects card settings for every board, keyed by board name', async () => {
    const client = stubClient({
      listBoards: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Stories' },
        { id: 'b2', name: 'Features' },
      ]),
      getCardSettings: vi
        .fn()
        .mockResolvedValueOnce({ 'User Story': true })
        .mockResolvedValueOnce({ Feature: false }),
    });

    const result = await discoverCardSettingsByBoard(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(result).toEqual({ Stories: { 'User Story': true }, Features: { Feature: false } });
  });

  it('skips a board whose card settings fail to load, without aborting the others', async () => {
    const client = stubClient({
      listBoards: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Stories' },
        { id: 'b2', name: 'Features' },
      ]),
      getCardSettings: vi
        .fn()
        .mockRejectedValueOnce(new Error('no access'))
        .mockResolvedValueOnce({ Feature: true }),
    });

    const result = await discoverCardSettingsByBoard(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(result).toEqual({ Features: { Feature: true } });
  });

  it('returns an empty object when the team has no boards', async () => {
    const client = stubClient({ listBoards: vi.fn().mockResolvedValue([]) });

    const result = await discoverCardSettingsByBoard(client, 'my-org', 'MyProject', 'MyProject Team');

    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- discoverCardSettings.test.ts`
Expected: FAIL — cannot find module `./discoverCardSettings`

- [ ] **Step 3: Implement `discoverCardSettingsByBoard`**

Create `src/azureDevOps/discoverCardSettings.ts`:

```ts
import type { AzureDevOpsClient } from './client';

export async function discoverCardSettingsByBoard(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
  team: string,
): Promise<Record<string, Record<string, boolean>>> {
  const boards = await client.listBoards(organization, project, team);

  const result: Record<string, Record<string, boolean>> = {};
  for (const board of boards) {
    try {
      result[board.name] = await client.getCardSettings(organization, project, team, board.id);
    } catch {
      // One-off failure for a board: continue without it instead of aborting the whole discovery.
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- discoverCardSettings.test.ts`
Expected: PASS

- [ ] **Step 5: Update `discoverBoardState.test.ts`'s stub client and add coverage**

Read `src/azureDevOps/discoverBoardState.ts` first to see the current `discoverBoardState` implementation (levels/statesByType/typeColors/typeIcons loop) before editing it in Step 7 — this step only touches the test file.

Replace the whole content of `src/azureDevOps/discoverBoardState.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import { discoverBoardState } from './discoverBoardState';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  getDefaultTeamName: () => Promise<string>;
  listBacklogLevels: () => Promise<{ name: string; workItemTypes: string[] }[]>;
  listWorkItemTypeStates: () => Promise<{ name: string; category: string; color: string }[]>;
  getWorkItemTypeIcon: () => Promise<{ color: string; iconSvg: string } | null>;
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, boolean>>;
}> = {}): AzureDevOpsClient {
  return {
    getDefaultTeamName: vi.fn().mockResolvedValue('MyProject Team'),
    listBacklogLevels: vi.fn().mockResolvedValue([{ name: 'Tasks', workItemTypes: ['Task'] }]),
    listWorkItemTypeStates: vi.fn().mockResolvedValue([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]),
    getWorkItemTypeIcon: vi.fn().mockResolvedValue({ color: 'f2cb1d', iconSvg: '<svg></svg>' }),
    listBoards: vi.fn().mockResolvedValue([{ id: 'b1', name: 'Tasks' }]),
    getCardSettings: vi.fn().mockResolvedValue({ Task: true }),
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

  it('fetches card settings per board, keyed by board name', async () => {
    const client = stubClient();
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.cardSettingsByBoard).toEqual({ Tasks: { Task: true } });
  });

  it('continues with an empty cardSettingsByBoard when fetching it fails for every board', async () => {
    const client = stubClient({ getCardSettings: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.cardSettingsByBoard).toEqual({});
  });
});
```

- [ ] **Step 6: Run test to verify the new/changed cases fail**

Run: `npm run test:unit -- discoverBoardState.test.ts`
Expected: FAIL — `result.cardSettingsByBoard` is `undefined`, and the stub's `listBoards`/`getCardSettings` are unused so far (the two new tests fail; the three pre-existing ones should still pass since nothing about them changed)

- [ ] **Step 7: Wire `discoverCardSettingsByBoard` into `discoverBoardState`**

In `src/azureDevOps/discoverBoardState.ts`, add the import and extend `BoardState` and the function body:

```ts
import type { AzureDevOpsClient } from './client';
import type { BacklogLevel, WorkItemTypeState } from './backlogLevels';
import { sanitizeSvg } from '../view/sanitizeSvg';
import { discoverCardSettingsByBoard } from './discoverCardSettings';

export interface BoardState {
  levels: BacklogLevel[];
  statesByType: Record<string, WorkItemTypeState[]>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  cardSettingsByBoard: Record<string, Record<string, boolean>>;
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

  const cardSettingsByBoard = await discoverCardSettingsByBoard(client, organization, project, team);

  return { levels, statesByType, typeColors, typeIcons, cardSettingsByBoard };
}
```

- [ ] **Step 8: Run test to verify everything passes**

Run: `npm run test:unit -- discoverBoardState.test.ts`
Expected: PASS (all 5 cases)

- [ ] **Step 9: Run the full unit suite and compile**

Run: `npm run test:unit`
Expected: PASS, no regressions elsewhere

Run: `npm run compile`
Expected: no TypeScript errors

- [ ] **Step 10: Commit**

```bash
git add src/azureDevOps/discoverCardSettings.ts src/azureDevOps/discoverCardSettings.test.ts src/azureDevOps/discoverBoardState.ts src/azureDevOps/discoverBoardState.test.ts
git commit -m "feat: discover card settings per board and fold into discoverBoardState"
```

---

### Task 3: Setup and Sync wiring — `syncConfig`, `setup.ts`, `syncBoardConfig.ts`

**Files:**
- Modify: `src/config/syncConfig.ts`
- Modify: `src/config/syncConfig.test.ts`
- Modify: `src/commands/setup.ts`
- Modify: `src/commands/syncBoardConfig.ts`

**Interfaces:**
- Consumes: `BoardState.cardSettingsByBoard` (Task 2).
- Produces: `syncConfig(config, discovered, freshTypeToBacklogLevel, freshStatusColors, freshTypeColors, freshTypeIcons, freshCardSettingsByBoard): KanbrainConfig` (signature grows from 6 to 7 params; `freshCardSettingsByBoard` is required, no default).

- [ ] **Step 1: Write/update the failing tests**

Replace the whole content of `src/config/syncConfig.test.ts` with (every existing call gets a 7th argument; one new test is added for the new field):

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
      { Tasks: { Task: true } },
    );

    expect(result.statusColors).toEqual({ 'To Do': 'new-color' });
    expect(result.typeColors).toEqual({ Task: 'new-color' });
    expect(result.typeIcons).toEqual({ Task: '<svg>new</svg>' });
    expect(result.typeToBacklogLevel).toEqual({ Task: 'Tasks' });
  });

  it('keeps organization and project unchanged', () => {
    const result = syncConfig(config(), { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});
    expect(result.organization).toBe('org');
    expect(result.project).toBe('proj');
  });

  it('preserves an existing skill mapping for a status that still exists on the board', () => {
    const result = syncConfig(config(), { Tasks: { 'To Do': 'Proposed', Done: 'Completed' } }, { Task: 'Tasks' }, {}, {}, {}, {});
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
    const result = syncConfig(withOrphan, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});

    expect(result.backlogLevels.Tasks.Legacy).toEqual({ path: '.kanbrain/skills/legacy.md' });
    expect(result.backlogLevels.Tasks['To Do']).toEqual({ path: '.kanbrain/skills/tasks-todo.md' });
  });

  it('preserves an orphaned backlog level entirely instead of deleting it', () => {
    const withOrphanLevel = config({
      backlogLevels: { Tasks: { 'To Do': null }, Stories: { New: { path: '.kanbrain/skills/stories-new.md' } } },
    });
    const result = syncConfig(withOrphanLevel, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});

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
    const result = syncConfig(withCustomization, { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});

    expect(result.backlogLevels.Tasks['To Do']).toEqual({
      path: '.kanbrain/skills/tasks-todo.md',
      label: 'Refine',
      textColor: 'ffffff',
      buttonColor: '007acc',
    });
  });

  it('preserves showAssignedTo across a sync', () => {
    const result = syncConfig(config({ showAssignedTo: false }), { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});
    expect(result.showAssignedTo).toBe(false);
  });

  it('leaves showAssignedTo undefined when it was never set', () => {
    const result = syncConfig(config(), { Tasks: { 'To Do': 'Proposed' } }, { Task: 'Tasks' }, {}, {}, {}, {});
    expect(result.showAssignedTo).toBeUndefined();
  });

  it('replaces cardSettingsByBoard with the fresh value, discarding the previous one', () => {
    const withOldSettings = config({ cardSettingsByBoard: { OldBoard: { Task: false } } });
    const result = syncConfig(
      withOldSettings,
      { Tasks: { 'To Do': 'Proposed' } },
      { Task: 'Tasks' },
      {},
      {},
      {},
      { Tasks: { Task: true } },
    );

    expect(result.cardSettingsByBoard).toEqual({ Tasks: { Task: true } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- syncConfig.test.ts`
Expected: FAIL — TypeScript error (too many arguments) or the last test failing since `cardSettingsByBoard` isn't returned yet

- [ ] **Step 3: Update `syncConfig` implementation**

Read `src/config/syncConfig.ts` first to confirm the current merge logic for `backlogLevels` is unchanged by this edit. Then update the function signature and returned object:

```ts
export function syncConfig(
  config: KanbrainConfig,
  discovered: DiscoveredBacklogLevels,
  freshTypeToBacklogLevel: Record<string, string>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshCardSettingsByBoard: Record<string, Record<string, boolean>>,
): KanbrainConfig {
  // ...keep the existing backlogLevels merge loop unchanged...

  return {
    organization: config.organization,
    project: config.project,
    typeToBacklogLevel: freshTypeToBacklogLevel,
    backlogLevels,
    statusColors: freshStatusColors,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
    cardSettingsByBoard: freshCardSettingsByBoard,
    showAssignedTo: config.showAssignedTo,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- syncConfig.test.ts`
Expected: PASS (all cases, including the new `cardSettingsByBoard` replace test)

- [ ] **Step 5: Wire `setup.ts`**

Read `src/commands/setup.ts` first. In the `writeConfig(workspaceRoot, { ... })` call, add `cardSettingsByBoard: boardState.cardSettingsByBoard,` right after `typeIcons,`:

```ts
    writeConfig(workspaceRoot, {
      organization: orgPick.org.name,
      project: projectPick.project.name,
      typeToBacklogLevel,
      backlogLevels: preset.backlogLevels,
      statusColors,
      typeColors,
      typeIcons,
      cardSettingsByBoard: boardState.cardSettingsByBoard,
    });
```

- [ ] **Step 6: Wire `syncBoardConfig.ts`**

Read `src/commands/syncBoardConfig.ts` first. Update the `syncConfig(...)` call to pass the 7th argument:

```ts
    const updated = syncConfig(
      result.config,
      discovered,
      freshTypeToBacklogLevel,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
      boardState.cardSettingsByBoard,
    );
```

- [ ] **Step 7: Compile and run the full unit suite**

Run: `npm run compile`
Expected: no TypeScript errors (this will catch any missed `syncConfig` call site)

Run: `npm run test:unit`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add src/config/syncConfig.ts src/config/syncConfig.test.ts src/commands/setup.ts src/commands/syncBoardConfig.ts
git commit -m "feat: persist cardSettingsByBoard through Setup and Sync Board Configuration"
```

---

### Task 4: Resolution — `resolveShowParent`

**Files:**
- Create: `src/config/resolveShowParent.ts`
- Test: `src/config/resolveShowParent.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.cardSettingsByBoard` (Task 1).
- Produces: `resolveShowParent(config: KanbrainConfig, workItemType: string, selectedBoard: string | undefined): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `src/config/resolveShowParent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveShowParent } from './resolveShowParent';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    typeToBacklogLevel: {},
    backlogLevels: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('resolveShowParent', () => {
  it('returns false when the type is not found in any board', () => {
    const result = resolveShowParent(config({ cardSettingsByBoard: { Stories: { Bug: true } } }), 'Task', undefined);
    expect(result).toBe(false);
  });

  it('returns false when cardSettingsByBoard is undefined', () => {
    expect(resolveShowParent(config(), 'Task', undefined)).toBe(false);
  });

  it('uses the single board that has the type', () => {
    const result = resolveShowParent(config({ cardSettingsByBoard: { Stories: { 'User Story': true } } }), 'User Story', undefined);
    expect(result).toBe(true);
  });

  it('uses the selected board when the type appears in more than one board with different values', () => {
    const cfg = config({
      cardSettingsByBoard: {
        Stories: { Bug: true },
        Sprints: { Bug: false },
      },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Sprints')).toBe(false);
    expect(resolveShowParent(cfg, 'Bug', 'Stories')).toBe(true);
  });

  it('falls back to the first matching board when the selected board does not have the type', () => {
    const cfg = config({
      cardSettingsByBoard: {
        Stories: { Bug: true },
        Sprints: { Bug: false },
      },
    });
    expect(resolveShowParent(cfg, 'Bug', 'Features')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- resolveShowParent.test.ts`
Expected: FAIL — cannot find module `./resolveShowParent`

- [ ] **Step 3: Implement `resolveShowParent`**

Create `src/config/resolveShowParent.ts`:

```ts
import type { KanbrainConfig } from '../types';

export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedBoard: string | undefined): boolean {
  const boards = config.cardSettingsByBoard ?? {};
  const matches = Object.entries(boards).filter(([, byType]) => workItemType in byType);

  if (matches.length === 0) {
    return false;
  }
  if (matches.length === 1) {
    return matches[0][1][workItemType];
  }

  const selectedMatch = matches.find(([name]) => name === selectedBoard);
  return (selectedMatch ?? matches[0])[1][workItemType];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- resolveShowParent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/resolveShowParent.ts src/config/resolveShowParent.test.ts
git commit -m "feat: add resolveShowParent to decide Parent card visibility per type"
```

---

### Task 5: Rendering primitive — `renderParentRow`

**Files:**
- Create: `src/view/renderParent.ts`
- Test: `src/view/renderParent.test.ts`

**Interfaces:**
- Consumes: `WorkItem` (existing type), `escapeHtml` (existing, `src/view/escapeHtml.ts`).
- Produces: `renderParentRow(parent: WorkItem | null, show: boolean): string`.

- [ ] **Step 1: Write the failing tests**

Create `src/view/renderParent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderParentRow } from './renderParent';
import type { WorkItem } from '../types';

function parent(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 55,
    title: 'Parent <title>',
    description: '',
    status: 'Active',
    type: 'Feature',
    url: '',
    parentId: null,
    childIds: [],
    assignedTo: null,
    ...overrides,
  };
}

describe('renderParentRow', () => {
  it('returns an empty string when show is false', () => {
    expect(renderParentRow(parent(), false)).toBe('');
  });

  it('returns an empty string when parent is null', () => {
    expect(renderParentRow(null, true)).toBe('');
  });

  it('renders the parent id, escaped title, and a clickable data-id when shown', () => {
    const html = renderParentRow(parent(), true);
    expect(html).toContain('kb-parent-row');
    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('data-id="55"');
    expect(html).toContain('#55');
    expect(html).toContain('Parent &lt;title&gt;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- renderParent.test.ts`
Expected: FAIL — cannot find module `./renderParent`

- [ ] **Step 3: Implement `renderParentRow`**

Create `src/view/renderParent.ts`:

```ts
import type { WorkItem } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderParentRow(parent: WorkItem | null, show: boolean): string {
  if (!show || !parent) {
    return '';
  }
  return `<div class="kb-parent-row" data-action="open-work-item-detail" data-id="${parent.id}">↑ Parent: #${parent.id} ${escapeHtml(parent.title)}</div>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- renderParent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/view/renderParent.ts src/view/renderParent.test.ts
git commit -m "feat: add renderParentRow view primitive"
```

---

### Task 6: Card + Flow screen wiring — `renderWorkItemCard`, `render.ts`

**Files:**
- Modify: `src/view/renderWorkItemCard.ts`
- Modify: `src/view/renderWorkItemCard.test.ts`
- Modify: `src/view/render.ts`
- Modify: `src/view/render.test.ts`

**Interfaces:**
- Consumes: `renderParentRow` (Task 5), `resolveShowParent` (Task 4).
- Produces: `renderWorkItemCard(workItem, config, cssClass, showActionButton?, avatars?, clickableTitle?, parent?, showParent?): string` (two new optional trailing parameters; existing call sites in `renderHome.ts` and the subtask-card call in `render.ts` are unaffected since they omit them). `RenderState.selectedBoard?: string` (new optional field).

- [ ] **Step 1: Write the failing tests for `renderWorkItemCard`**

Add to `src/view/renderWorkItemCard.test.ts`, inside the existing `describe('renderWorkItemCard', ...)` block, after the last test (`makes the title clickable when clickableTitle is true`):

```ts
  it('does not show a parent row by default', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).not.toContain('kb-parent-row');
  });

  it('shows the parent row when parent is provided and showParent is true', () => {
    const parentItem = workItem({ id: 900, title: 'Epic parent' });
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card', true, {}, false, parentItem, true);
    expect(html).toContain('kb-parent-row');
    expect(html).toContain('data-id="900"');
    expect(html).toContain('Epic parent');
  });

  it('hides the parent row when showParent is false even if parent is provided', () => {
    const parentItem = workItem({ id: 900 });
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card', true, {}, false, parentItem, false);
    expect(html).not.toContain('kb-parent-row');
  });

  it('shows the parent row before the assignee row', () => {
    const parentItem = workItem({ id: 900, title: 'Epic parent' });
    const html = renderWorkItemCard(
      workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } }),
      config,
      'kb-main-card',
      true,
      {},
      false,
      parentItem,
      true,
    );

    const parentIndex = html.indexOf('kb-parent-row');
    const assigneeIndex = html.indexOf('kb-assignee-row');

    expect(parentIndex).toBeGreaterThanOrEqual(0);
    expect(assigneeIndex).toBeGreaterThan(parentIndex);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- renderWorkItemCard.test.ts`
Expected: FAIL — the new tests fail (`kb-parent-row` never appears)

- [ ] **Step 3: Update `renderWorkItemCard`**

In `src/view/renderWorkItemCard.ts`, add the import and the two new parameters:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { resolveSkill } from '../config/resolveSkill';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { renderAssigneeRow } from './renderAssignee';
import { renderParentRow } from './renderParent';
import { isValidHexColor, normalizeHex } from './badgeColor';

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

export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
  clickableTitle = false,
  parent: WorkItem | null = null,
  showParent = false,
): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const assigneeHtml = config.showAssignedTo === false ? '' : renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row');
  const parentHtml = renderParentRow(parent, showParent);
  const titleAttrs = clickableTitle
    ? ` class="kb-title kb-title-clickable" data-action="open-work-item-detail" data-id="${workItem.id}"`
    : ' class="kb-title"';

  return `
    <div class="${cssClass}"${borderStyle}>
      <div class="kb-card-header">
        ${iconHtml}
        <span class="kb-id">#${workItem.id}</span>
      </div>
      <div${titleAttrs}>${escapeHtml(workItem.title)}</div>
      ${parentHtml}
      ${assigneeHtml}
      <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- renderWorkItemCard.test.ts`
Expected: PASS (all cases, including the pre-existing ones — `parent`/`showParent` default to `null`/`false` so old assertions like "does not make the title clickable by default" are unaffected)

- [ ] **Step 5: Write the failing tests for `render.ts`**

Add to `src/view/render.test.ts`, after the last test (`makes the title clickable on the main card and subtasks in the flow screen`), inside the `describe('render', ...)` block:

```ts
  it('shows the parent row on the main card when cardSettingsByBoard enables Parent for the type', () => {
    const configWithParent: KanbrainConfig = { ...config, cardSettingsByBoard: { Stories: { Task: true } } };
    const html = render({
      hasWorkspace: true,
      config: configWithParent,
      workItem: workItem(),
      parent: workItem({ id: 900, title: 'Epic parent' }),
      subtasks: [],
      screen: 'flow',
    });

    expect(html).toContain('kb-parent-row');
    expect(html).toContain('data-id="900"');
  });

  it('does not show the parent row when the type is not enabled in cardSettingsByBoard', () => {
    const configWithParent: KanbrainConfig = { ...config, cardSettingsByBoard: { Stories: { Task: false } } };
    const html = render({
      hasWorkspace: true,
      config: configWithParent,
      workItem: workItem(),
      parent: workItem({ id: 900 }),
      subtasks: [],
      screen: 'flow',
    });

    expect(html).not.toContain('kb-parent-row');
  });

  it('does not show the parent row on subtask cards', () => {
    const configWithParent: KanbrainConfig = { ...config, cardSettingsByBoard: { Stories: { Task: true } } };
    const subtasks = [workItem({ id: 101, title: 'Sub 1' })];
    const html = render({
      hasWorkspace: true,
      config: configWithParent,
      workItem: workItem(),
      parent: workItem({ id: 900 }),
      subtasks,
      screen: 'flow',
    });

    expect(html.split('kb-parent-row').length - 1).toBe(1);
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm run test:unit -- render.test.ts`
Expected: FAIL — `kb-parent-row` never appears yet

- [ ] **Step 7: Wire `resolveShowParent` and the new parameters into `render.ts`**

Read `src/view/render.ts` first. Update it to:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
import { renderConfig } from './renderConfig';
import { resolveShowParent } from '../config/resolveShowParent';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
  connectionStatus?: 'connected' | 'disconnected';
  avatars?: Record<string, string>;
  selectedBoard?: string;
}

export function render(state: RenderState): string {
  if (!state.hasWorkspace) {
    return '<div class="kb-empty">Open a workspace folder to use Kanbrain.</div>';
  }
  if (!state.config) {
    return `
      <div class="kb-empty">
        No project configured. Run the <b>Kanbrain: Setup</b> command.
        <div><button id="kb-run-setup-btn" class="kb-action-btn">Run Kanbrain: Setup</button></div>
      </div>
    `;
  }
  if (state.connectionStatus === 'disconnected') {
    return `
      <div class="kb-empty">
        This project is configured, but not connected to Azure DevOps yet. Run the <b>Kanbrain: Connect to Azure DevOps</b> command.
        <div><button id="kb-run-connect-btn" class="kb-action-btn">Run Kanbrain: Connect to Azure DevOps</button></div>
      </div>
    `;
  }
  if (state.screen === 'home') {
    return renderHome(state);
  }
  if (state.screen === 'config') {
    return renderConfig(state);
  }

  if (!state.workItem) {
    return `
      <div id="kb-search-section">
        <input id="kb-search-input" placeholder="Search by title or #id...">
        <div id="kb-search-results"></div>
      </div>
    `;
  }

  const avatars = state.avatars ?? {};
  const showParent = resolveShowParent(state.config, state.workItem.type, state.selectedBoard);
  const subtasksHtml = state.subtasks.length
    ? state.subtasks.map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true)).join('')
    : '<div class="kb-empty">No child items.</div>';

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div id="kb-search-section" class="kb-search-overlay kb-hidden">
      <div class="kb-search-dialog">
        <div class="kb-search-dialog-header">
          <input id="kb-search-input" placeholder="Search by title or #id...">
          <button id="kb-search-close-btn">✕</button>
        </div>
        <div id="kb-search-results"></div>
      </div>
    </div>
    <div class="kb-card-wrapper">
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent)}
      <div class="kb-card-actions">
        <button id="kb-toggle-search-btn" class="kb-icon-btn" title="Switch work item">⇄</button>
        <button id="kb-clear-btn" class="kb-icon-btn" title="Clear">✕</button>
      </div>
    </div>
    <div class="kb-section-label">Children (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm run test:unit -- render.test.ts renderWorkItemCard.test.ts`
Expected: PASS (all cases)

- [ ] **Step 9: Run the full unit suite and compile**

Run: `npm run test:unit`
Expected: PASS, no regressions

Run: `npm run compile`
Expected: no TypeScript errors

- [ ] **Step 10: Commit**

```bash
git add src/view/renderWorkItemCard.ts src/view/renderWorkItemCard.test.ts src/view/render.ts src/view/render.test.ts
git commit -m "feat: render the Parent row on the main Flow card"
```

---

### Task 7: Board selection persistence — `extension.ts`, `KanbrainViewProvider.ts`

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `RenderState.selectedBoard` (Task 6).
- Produces: `KanbrainViewProvider.setSelectedBoard(board: string | undefined): void` (new public method); constructor gains a new required last parameter `persistSelectedBoard: (board: string | undefined) => void`.

No dedicated unit test for this task: `KanbrainViewProvider` and `extension.ts` are coupled to the VS Code API and already have no test files (same as `WorkItemDetailPanelManager`) — verified via `npm run compile` and a manual check (Task 9's README checklist).

- [ ] **Step 1: Add the constructor parameter, field, and setter method**

Read `src/view/KanbrainViewProvider.ts` in full first (it's a large file) to confirm line numbers haven't shifted from what's quoted below.

Update the constructor (currently lines 32-39):

```ts
  constructor(
    private readonly workspaceRoot: string | undefined,
    private readonly client: AzureDevOpsClient | undefined,
    private readonly getCurrentBranch: () => Promise<string>,
    private readonly persistActiveWorkItem: (id: number | undefined) => void,
    private readonly checkAzureSession: () => Promise<boolean>,
    private readonly openWorkItemDetail: (id: number) => Promise<void>,
    private readonly persistSelectedBoard: (board: string | undefined) => void,
  ) {}
```

Add a new field next to `private activeWorkItemId: number | undefined;` (currently line 25):

```ts
  private activeWorkItemId: number | undefined;
  private selectedBoard: string | undefined;
```

Add a new method right after `setActiveWorkItem` (currently lines 106-112):

```ts
  setActiveWorkItem(id: number | undefined): void {
    this.activeWorkItemId = id;
    this.persistActiveWorkItem(id);
    this.currentScreen = id === undefined ? 'home' : 'flow';
    this.lastState = '';
    void this.refresh();
  }

  setSelectedBoard(board: string | undefined): void {
    this.selectedBoard = board;
    this.persistSelectedBoard(board);
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 2: Handle the new webview message**

In the `onDidReceiveMessage` handler, right after the `set-show-assigned-to` branch (currently lines 81-82):

```ts
      } else if (message.type === 'set-show-assigned-to') {
        this.setShowAssignedTo(Boolean(message.value));
      } else if (message.type === 'set-selected-board') {
        this.setSelectedBoard(message.board || undefined);
```

- [ ] **Step 3: Pass `selectedBoard` into the render call**

Update the `render(...)` call inside `refresh()` (currently line 389):

```ts
    this.view.webview.html = this.wrapHtml(
      render({
        hasWorkspace: !!this.workspaceRoot,
        config,
        workItem,
        parent,
        subtasks,
        screen: this.currentScreen,
        avatars,
        selectedBoard: this.selectedBoard,
      }),
    );
```

- [ ] **Step 4: Wire the inline webview script for the board dropdown**

Right after the `showAssigneeToggle` block (currently lines 445-450):

```ts
    const showAssigneeToggle = document.getElementById('kb-show-assignee-toggle');
    if (showAssigneeToggle) {
      showAssigneeToggle.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-show-assigned-to', value: showAssigneeToggle.checked });
      });
    }

    const boardSelect = document.getElementById('kb-board-select');
    if (boardSelect) {
      boardSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-selected-board', board: boardSelect.value });
      });
    }
```

- [ ] **Step 5: Add the CSS for the parent row and the board select row**

Add next to `.kb-assignee-row` (currently line 614):

```ts
      .kb-assignee-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; opacity: 0.85; }
      .kb-parent-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; opacity: 0.85; cursor: pointer; }
      .kb-parent-row:hover { color: var(--vscode-textLink-foreground); text-decoration: underline; }
```

Add next to `.kb-checkbox-row` (currently line 622, right before the closing template literal backtick):

```ts
      .kb-checkbox-row { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 6px 0; cursor: pointer; }
      .kb-select-row { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 6px 0; }
      .kb-select-row select { background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; padding: 2px 4px; }
```

- [ ] **Step 6: Wire `extension.ts`**

Read `src/extension.ts` in full first. Update it to:

```ts
import * as vscode from 'vscode';
import { ensureAzureSession, hasCachedAzureSession } from './auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from './auth/vscodeSession';
import { AzureDevOpsClient } from './azureDevOps/client';
import { KanbrainViewProvider } from './view/KanbrainViewProvider';
import { WorkItemDetailPanelManager } from './view/WorkItemDetailPanelManager';
import { getCurrentBranch } from './git/getCurrentBranch';
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';
import { registerCheckBoardConfigCommand } from './commands/checkBoardConfig';
import { registerSyncBoardConfigCommand } from './commands/syncBoardConfig';
import { registerConfigureWithAiCommand } from './commands/configureWithAi';
import { registerConnectCommand } from './commands/connect';

const ACTIVE_WORK_ITEM_KEY = 'kanbrain.activeWorkItemId';
const SELECTED_BOARD_KEY = 'kanbrain.selectedBoard';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const client = workspaceRoot
    ? new AzureDevOpsClient({
        fetchImpl: fetch,
        getToken: () => ensureAzureSession(getVscodeMicrosoftSession),
      })
    : undefined;

  const detailPanelManager = workspaceRoot && client ? new WorkItemDetailPanelManager(workspaceRoot, client) : undefined;

  const provider = new KanbrainViewProvider(
    workspaceRoot,
    client,
    () => getCurrentBranch(workspaceRoot ?? ''),
    id => context.workspaceState.update(ACTIVE_WORK_ITEM_KEY, id),
    () => hasCachedAzureSession(getVscodeMicrosoftSession),
    async id => {
      if (detailPanelManager) {
        await detailPanelManager.open(id);
      }
    },
    board => context.workspaceState.update(SELECTED_BOARD_KEY, board),
  );

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(KanbrainViewProvider.viewType, provider));

  if (!workspaceRoot || !client) {
    return;
  }

  context.subscriptions.push(
    registerSetupCommand(client, workspaceRoot, () => provider.setActiveWorkItem(undefined)),
    registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id)),
    registerCheckBoardConfigCommand(client, workspaceRoot),
    registerSyncBoardConfigCommand(client, workspaceRoot),
    registerConfigureWithAiCommand(client, workspaceRoot),
    registerConnectCommand(client, workspaceRoot, () => provider.markConnected()),
  );

  const savedWorkItemId = context.workspaceState.get<number>(ACTIVE_WORK_ITEM_KEY);
  if (savedWorkItemId) {
    provider.setActiveWorkItem(savedWorkItemId);
  }

  const savedBoard = context.workspaceState.get<string>(SELECTED_BOARD_KEY);
  if (savedBoard) {
    provider.setSelectedBoard(savedBoard);
  }
}

export function deactivate(): void {}
```

- [ ] **Step 7: Compile and run the full unit suite**

Run: `npm run compile`
Expected: no TypeScript errors

Run: `npm run test:unit`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add src/extension.ts src/view/KanbrainViewProvider.ts
git commit -m "feat: persist the selected board locally and wire it into the webview"
```

---

### Task 8: Config screen board selector — `renderConfig.ts`

**Files:**
- Modify: `src/view/renderConfig.ts`
- Modify: `src/view/renderConfig.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.cardSettingsByBoard` (Task 1), `RenderState.selectedBoard` (Task 6).
- Produces: a `<select id="kb-board-select">` element in the Config screen's HTML, present only when `cardSettingsByBoard` lists more than one board.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderConfig.test.ts`, inside the existing `describe('renderConfig', ...)` block, after the last test:

```ts
  it('does not show a board selector when there are 0 or 1 boards in cardSettingsByBoard', () => {
    const html = renderConfig(state({ config: config({ cardSettingsByBoard: { Stories: { Task: true } } }) }));
    expect(html).not.toContain('id="kb-board-select"');
  });

  it('shows a board selector when there is more than one board in cardSettingsByBoard', () => {
    const html = renderConfig(
      state({ config: config({ cardSettingsByBoard: { Stories: { Task: true }, Sprints: { Task: false } } }) }),
    );
    expect(html).toContain('id="kb-board-select"');
    expect(html).toContain('<option value="Stories"');
    expect(html).toContain('<option value="Sprints"');
  });

  it('marks the selected board as selected in the dropdown', () => {
    const html = renderConfig(
      state({
        config: config({ cardSettingsByBoard: { Stories: { Task: true }, Sprints: { Task: false } } }),
        selectedBoard: 'Sprints',
      }),
    );
    expect(html).toMatch(/<option value="Sprints" selected>/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- renderConfig.test.ts`
Expected: FAIL — `kb-board-select` never appears

- [ ] **Step 3: Implement the dropdown in `renderConfig.ts`**

Replace the content of `src/view/renderConfig.ts` with:

```ts
import type { RenderState } from './render';
import { renderConfigEditor } from './renderConfigEditor';
import { escapeHtml } from './escapeHtml';

export function renderConfig(state: RenderState): string {
  const config = state.config!;
  const boardNames = Object.keys(config.cardSettingsByBoard ?? {});
  const boardSelectHtml =
    boardNames.length > 1
      ? `
    <label class="kb-select-row">
      Board (desempate de campos)
      <select id="kb-board-select">
        ${boardNames
          .map(name => `<option value="${escapeHtml(name)}"${name === state.selectedBoard ? ' selected' : ''}>${escapeHtml(name)}</option>`)
          .join('')}
      </select>
    </label>
  `
      : '';

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-section-label">Display</div>
    <label class="kb-checkbox-row">
      <input type="checkbox" id="kb-show-assignee-toggle" ${config.showAssignedTo === false ? '' : 'checked'}>
      Show assignee on cards
    </label>
    ${boardSelectHtml}
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
  `;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- renderConfig.test.ts`
Expected: PASS (all cases, including the pre-existing ones)

- [ ] **Step 5: Run the full unit suite and compile**

Run: `npm run test:unit`
Expected: PASS, no regressions

Run: `npm run compile`
Expected: no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/view/renderConfig.ts src/view/renderConfig.test.ts
git commit -m "feat: add a board selector to the Config screen for Parent field tie-breaks"
```

---

### Task 9: README checklist and manual verification note

**Files:**
- Modify: `README.md`

No test — this is a documentation-only task, matching how the existing manual verification checklist is maintained.

- [ ] **Step 1: Add checklist items**

Read `README.md`'s "Manual verification checklist" section first (it's a single flat list under `## Manual verification checklist`). Add these three items at the end of the list:

```markdown
- [ ] After `Kanbrain: Setup`, `.kanbrain/config.json` has a `cardSettingsByBoard` entry for every board the team's process has, each mapping work item types to whether Parent is enabled (compare against Board Settings > Fields for a couple of types in the real Azure DevOps project).
- [ ] The main Flow card shows a "↑ Parent: #id Title" row only for a work item type whose board has Parent enabled; a type with Parent disabled (or with no `parent` resolved) shows no such row, and clicking it opens that parent's detail tab without changing the active work item.
- [ ] When `cardSettingsByBoard` has more than one board, the Config screen shows a board dropdown; picking a different board and reloading the window keeps that same board selected (verifies `workspaceState` persistence), and it never gets written into the committed `.kanbrain/config.json`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add manual verification checklist items for Show Parent on Card"
```
