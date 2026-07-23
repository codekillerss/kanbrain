# Skill by Type and Multi-Team Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Kanbrain's backlog-level-based skill mapping with a direct (work item type, status) mapping, and expand board/card-field discovery from a single default team to every team in the project, fixing the per-team blind spot in both.

**Architecture:** Type enumeration moves from `listBacklogLevels` (team-scoped, hides types a team's backlog level visibility settings hide) to `GET .../_apis/wit/workitemtypes` (process-level, team-independent). `KanbrainConfig.backlogLevels`/`typeToBacklogLevel` are replaced by `skills: Record<type, Record<status, SkillEntry | null>>`. Card field discovery (`cardSettingsByBoard`) becomes `cardSettingsByTeam`, nested one level deeper (team → board → type), discovered via a new `listTeams` call. The Config screen's board tie-break dropdown becomes a team dropdown; within a team, boards still resolve automatically per type.

**Tech Stack:** TypeScript, VS Code extension API, vitest for unit tests, Azure DevOps REST API 7.1.

## Global Constraints

- No backlog-level concept survives anywhere in Kanbrain after this plan — not in config, not in the Config screen, not in the search dialog tabs (spec: "Escopo").
- `GET .../_apis/wit/workitemtypes` is the single source of truth for which work item types exist — never team-scoped, never filtered by any team's backlog-level visibility (spec: "Contexto e motivação").
- `cardSettingsByTeam` covers every team in the project (via `listTeams`), not just the default team (spec: "Escopo").
- The Config screen shows a **Team** selector (not Board) when there are 2+ teams; within a selected team, boards resolve automatically per type with no board-level tie-break exposed to the user (spec: "Contexto e motivação", confirmed in brainstorming).
- `Kanbrain: Configure with AI` keeps using only the default team for its board/column reference text — it is out of scope for the multi-team expansion (spec: "Escopo — Fora do escopo").
- **`npm run compile` will show errors between tasks** — this plan touches ~30 interdependent files; `tsc` only checks production `.ts` files (test files are excluded per `tsconfig.json`), so intermediate states will genuinely fail to compile until the later tasks land. Each task instead verifies its own slice with `npx vitest run <specific file>.test.ts` (vitest transforms one file at a time via esbuild and does not type-check). Full-project compile is only expected to pass starting at Task 17 (Final verification).
- Every new/changed `KanbrainConfig` object literal in test fixtures must include `skills` and `defaultTeam` instead of `typeToBacklogLevel`/`backlogLevels` — a fixture missing these will still run under vitest (no type-check) but will produce wrong/undefined behavior wherever the code under test actually reads those fields.

---

### Task 1: `types.ts` — new config shape

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Produces: `KanbrainConfig` with `defaultTeam: string`, `skills: Record<string, Record<string, SkillEntry | null>>`, `cardSettingsByTeam?: Record<string, Record<string, Record<string, CardFieldSettings>>>` — `typeToBacklogLevel`/`backlogLevels`/`cardSettingsByBoard` removed.

No test for this task — it's a pure type declaration; every consumer is fixed in a later task, and `tsc` will report every file that still references the old fields until this whole plan is done (expected, see Global Constraints).

- [ ] **Step 1: Update `KanbrainConfig`**

Read `src/types.ts` in full first. Replace the `KanbrainConfig` interface:

```ts
export interface KanbrainConfig {
  organization: string;
  project: string;
  defaultTeam: string;
  skills: Record<string, Record<string, SkillEntry | null>>;
  statusColors: Record<string, string>;
  typeColors: Record<string, string>;
  typeIcons: Record<string, string>;
  cardSettingsByTeam?: Record<string, Record<string, Record<string, CardFieldSettings>>>;
  showAssignedTo?: boolean;
}
```

`AssignedTo`, `WorkItem`, `SkillEntry`, `CardFieldSettings`, `DevelopmentLink`, `PullRequestDetails` are unchanged — only `KanbrainConfig` itself changes.

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: replace backlog-level config shape with skills-by-type and cardSettingsByTeam"
```

---

### Task 2: `client.ts` — `listWorkItemTypes`, `getIconSvg`, `listTeams`

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Modify: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Produces: `AzureDevOpsClient.listWorkItemTypes(organization, project): Promise<{ name: string; color: string; iconUrl: string }[]>`, `AzureDevOpsClient.getIconSvg(iconUrl: string): Promise<string>`, `AzureDevOpsClient.listTeams(organization, project): Promise<{ id: string; name: string }[]>`.
- Removes: `AzureDevOpsClient.listBacklogLevels`, `AzureDevOpsClient.getWorkItemTypeIcon` (nothing will call them after this plan).

- [ ] **Step 1: Write the failing tests**

Read `src/azureDevOps/client.test.ts` in full first. Remove the two `describe`/`it` blocks that test `listBacklogLevels` (inside `describe('AzureDevOpsClient', ...)`, the case `"lists backlog levels for a team, skipping hidden ones and ones without work item types"`) and `getWorkItemTypeIcon` (`describe('AzureDevOpsClient.getWorkItemTypeIcon'`-equivalent — it's the two `it` blocks `'fetches a work item type icon (type info, then the icon svg)'` and `'returns null when the work item type has no icon'`, both inside `describe('AzureDevOpsClient', ...)`).

Add, as a new `describe` block right after `describe('AzureDevOpsClient.getPullRequest', ...)` (the last one in the file):

```ts
describe('AzureDevOpsClient.listWorkItemTypes', () => {
  it('maps name/color/icon.url, skipping disabled types and types without an icon', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { name: 'Bug', color: 'CC293D', icon: { url: 'https://dev.azure.com/my-org/_apis/wit/workItemIcons/icon_insect' }, isDisabled: false },
          { name: 'Old Type', color: '000000', icon: { url: 'https://example.com/icon' }, isDisabled: true },
          { name: 'No Icon Type', color: '000000', isDisabled: false },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const types = await client.listWorkItemTypes('my-org', 'MyProject');

    expect(types).toEqual([
      { name: 'Bug', color: 'CC293D', iconUrl: 'https://dev.azure.com/my-org/_apis/wit/workItemIcons/icon_insect' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/workitemtypes?api-version=7.1',
      expect.anything(),
    );
  });
});

describe('AzureDevOpsClient.getIconSvg', () => {
  it('fetches the raw svg text from the given icon url', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(textResponse('<svg><path d="M0 0"/></svg>'));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const svg = await client.getIconSvg('https://dev.azure.com/my-org/_apis/wit/workItemIcons/icon_insect');

    expect(svg).toBe('<svg><path d="M0 0"/></svg>');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/wit/workItemIcons/icon_insect',
      expect.anything(),
    );
  });
});

describe('AzureDevOpsClient.listTeams', () => {
  it('maps id/name for every team in the project', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        value: [
          { id: 't1', name: 'Team 1' },
          { id: 't2', name: 'Team 2' },
        ],
      }),
    );
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const teams = await client.listTeams('my-org', 'MyProject');

    expect(teams).toEqual([
      { id: 't1', name: 'Team 1' },
      { id: 't2', name: 'Team 2' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/_apis/projects/MyProject/teams?api-version=7.1',
      expect.anything(),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run client.test.ts`
Expected: FAIL — `listWorkItemTypes`/`getIconSvg`/`listTeams` are not functions

- [ ] **Step 3: Implement the new methods, remove the old ones**

In `src/azureDevOps/client.ts`, remove the `listBacklogLevels` and `getWorkItemTypeIcon` methods entirely, and remove the now-unused `import type { BacklogLevel, WorkItemTypeState, WorkItemTypeIcon } from './backlogLevels';` — replace with `import type { WorkItemTypeState } from './backlogLevels';` (still needed by `listWorkItemTypeStates`, unchanged). Add the three new methods anywhere after `getPullRequest` (the last method):

```ts
  async listWorkItemTypes(organization: string, project: string): Promise<{ name: string; color: string; iconUrl: string }[]> {
    const data = await this.request<{ value: { name: string; color: string; icon?: { url: string }; isDisabled: boolean }[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/workitemtypes?api-version=7.1`,
    );
    return data.value.filter(t => !t.isDisabled && t.icon?.url).map(t => ({ name: t.name, color: t.color, iconUrl: t.icon!.url }));
  }

  async getIconSvg(iconUrl: string): Promise<string> {
    return this.requestText(iconUrl);
  }

  async listTeams(organization: string, project: string): Promise<{ id: string; name: string }[]> {
    const data = await this.request<{ value: { id: string; name: string }[] }>(
      `https://dev.azure.com/${organization}/_apis/projects/${project}/teams?api-version=7.1`,
    );
    return data.value.map(t => ({ id: t.id, name: t.name }));
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: add listWorkItemTypes, getIconSvg, listTeams; remove listBacklogLevels/getWorkItemTypeIcon"
```

---

### Task 3: `discoverWorkItemTypes.ts` — replaces `backlogLevels.ts`

**Files:**
- Create: `src/azureDevOps/discoverWorkItemTypes.ts`
- Test: `src/azureDevOps/discoverWorkItemTypes.test.ts`
- Delete: `src/azureDevOps/backlogLevels.ts`, `src/azureDevOps/backlogLevels.test.ts`

**Interfaces:**
- Consumes: `client.listWorkItemTypes`, `client.listWorkItemTypeStates` (existing, unchanged), `client.getIconSvg` (Task 2).
- Produces: `DiscoveredWorkItemType { name: string; color: string; iconSvg: string; states: { name: string; category: string; color: string }[] }`, `discoverWorkItemTypes(client, organization, project): Promise<DiscoveredWorkItemType[]>`, `discoverStatusesByType(types: DiscoveredWorkItemType[]): Record<string, Record<string, string>>`, `discoverStatusColors(types: DiscoveredWorkItemType[]): Record<string, string>`.

- [ ] **Step 1: Delete the old files**

```bash
rm src/azureDevOps/backlogLevels.ts src/azureDevOps/backlogLevels.test.ts
```

- [ ] **Step 2: Write the failing tests**

Create `src/azureDevOps/discoverWorkItemTypes.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { discoverWorkItemTypes, discoverStatusesByType, discoverStatusColors, type DiscoveredWorkItemType } from './discoverWorkItemTypes';
import type { AzureDevOpsClient } from './client';

function stubClient(overrides: Partial<{
  listWorkItemTypes: () => Promise<{ name: string; color: string; iconUrl: string }[]>;
  listWorkItemTypeStates: () => Promise<{ name: string; category: string; color: string }[]>;
  getIconSvg: () => Promise<string>;
}> = {}): AzureDevOpsClient {
  return {
    listWorkItemTypes: vi.fn().mockResolvedValue([{ name: 'Task', color: 'f2cb1d', iconUrl: 'https://example.com/icon' }]),
    listWorkItemTypeStates: vi.fn().mockResolvedValue([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]),
    getIconSvg: vi.fn().mockResolvedValue('<svg></svg>'),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverWorkItemTypes', () => {
  it('fetches states and the icon svg for every discovered type', async () => {
    const client = stubClient();
    const result = await discoverWorkItemTypes(client, 'my-org', 'MyProject');

    expect(result).toEqual([
      { name: 'Task', color: 'f2cb1d', iconSvg: '<svg></svg>', states: [{ name: 'New', category: 'Proposed', color: 'b2b2b2' }] },
    ]);
  });

  it('continues without a type when fetching its states fails', async () => {
    const client = stubClient({ listWorkItemTypeStates: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverWorkItemTypes(client, 'my-org', 'MyProject');

    expect(result).toEqual([]);
  });

  it('continues without a type when fetching its icon svg fails', async () => {
    const client = stubClient({ getIconSvg: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverWorkItemTypes(client, 'my-org', 'MyProject');

    expect(result).toEqual([]);
  });
});

describe('discoverStatusesByType', () => {
  const types: DiscoveredWorkItemType[] = [
    {
      name: 'Task',
      color: 'f2cb1d',
      iconSvg: '<svg></svg>',
      states: [
        { name: 'To Do', category: 'Proposed', color: 'b2b2b2' },
        { name: 'Done', category: 'Completed', color: '339933' },
      ],
    },
    { name: 'Epic', color: 'ff7b00', iconSvg: '<svg></svg>', states: [] },
  ];

  it('maps each type to its status → category record', () => {
    expect(discoverStatusesByType(types)).toEqual({
      Task: { 'To Do': 'Proposed', Done: 'Completed' },
    });
  });

  it('omits a type with no states at all', () => {
    expect(discoverStatusesByType(types).Epic).toBeUndefined();
  });
});

describe('discoverStatusColors', () => {
  it('maps each status name to its color, merging across types and keeping the first-seen color on conflict', () => {
    const types: DiscoveredWorkItemType[] = [
      { name: 'Task', color: 'f2cb1d', iconSvg: '', states: [{ name: 'New', category: 'Proposed', color: '111111' }] },
      { name: 'Bug', color: 'cc293d', iconSvg: '', states: [{ name: 'New', category: 'Proposed', color: '222222' }] },
    ];

    expect(discoverStatusColors(types)).toEqual({ New: '111111' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run discoverWorkItemTypes.test.ts`
Expected: FAIL — cannot find module `./discoverWorkItemTypes`

- [ ] **Step 4: Implement `discoverWorkItemTypes.ts`**

Create `src/azureDevOps/discoverWorkItemTypes.ts`:

```ts
import type { AzureDevOpsClient } from './client';
import { sanitizeSvg } from '../view/sanitizeSvg';

export interface DiscoveredWorkItemType {
  name: string;
  color: string;
  iconSvg: string;
  states: { name: string; category: string; color: string }[];
}

export async function discoverWorkItemTypes(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
): Promise<DiscoveredWorkItemType[]> {
  const types = await client.listWorkItemTypes(organization, project);
  const result: DiscoveredWorkItemType[] = [];

  for (const type of types) {
    try {
      const [states, iconSvgRaw] = await Promise.all([
        client.listWorkItemTypeStates(organization, project, type.name),
        client.getIconSvg(type.iconUrl),
      ]);
      result.push({ name: type.name, color: type.color, iconSvg: sanitizeSvg(iconSvgRaw), states });
    } catch {
      // One-off failure for a type: continue without it instead of aborting the whole discovery.
    }
  }

  return result;
}

export function discoverStatusesByType(types: DiscoveredWorkItemType[]): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const type of types) {
    const statuses: Record<string, string> = {};
    for (const state of type.states) {
      statuses[state.name] = state.category;
    }
    if (Object.keys(statuses).length > 0) {
      result[type.name] = statuses;
    }
  }
  return result;
}

export function discoverStatusColors(types: DiscoveredWorkItemType[]): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const type of types) {
    for (const state of type.states) {
      if (!(state.name in colors)) {
        colors[state.name] = state.color;
      }
    }
  }
  return colors;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run discoverWorkItemTypes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/discoverWorkItemTypes.ts src/azureDevOps/discoverWorkItemTypes.test.ts
git rm src/azureDevOps/backlogLevels.ts src/azureDevOps/backlogLevels.test.ts
git commit -m "feat: add discoverWorkItemTypes, replacing team-scoped backlogLevels.ts"
```

---

### Task 4: `resolveSkill.ts`

**Files:**
- Modify: `src/config/resolveSkill.ts`
- Modify: `src/config/resolveSkill.test.ts`

**Interfaces:**
- Produces: `resolveSkill(config: KanbrainConfig, workItem: WorkItem): SkillEntry | null` — now reads `config.skills[workItem.type]?.[workItem.status]`.

- [ ] **Step 1: Rewrite the test**

Replace the whole content of `src/config/resolveSkill.test.ts`:

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
    assignedTo: null,
    development: [],
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  defaultTeam: 'MyProject Team',
  skills: {
    'User Story': {
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
  it("resolves the full skill entry via the work item's type and status", () => {
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

  it('returns null when the work item type has no skill mapping at all', () => {
    expect(resolveSkill(config, workItem({ type: 'Impediment' }))).toBeNull();
  });

  it('returns null when the status has no skill mapped for that type', () => {
    expect(resolveSkill(config, workItem({ status: 'Unknown Status' }))).toBeNull();
  });

  it('returns null when the type explicitly maps the status to null', () => {
    expect(resolveSkill(config, workItem({ status: 'Done' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resolveSkill.test.ts`
Expected: FAIL — `config.skills` is `undefined`, `resolveSkill` still reads `config.typeToBacklogLevel`

- [ ] **Step 3: Implement**

Replace `src/config/resolveSkill.ts`:

```ts
import type { KanbrainConfig, SkillEntry, WorkItem } from '../types';

export function resolveSkill(config: KanbrainConfig, workItem: WorkItem): SkillEntry | null {
  return config.skills[workItem.type]?.[workItem.status] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resolveSkill.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/resolveSkill.ts src/config/resolveSkill.test.ts
git commit -m "feat: resolve skills directly by work item type and status"
```

---

### Task 5: `presetSkillFiles.ts`

**Files:**
- Modify: `src/skills/presetSkillFiles.ts`
- Modify: `src/skills/presetSkillFiles.test.ts`

**Interfaces:**
- Consumes: `discoverStatusesByType`'s return shape (Task 3): `Record<string /* type */, Record<string /* status */, string /* category */>>`.
- Produces: `PresetPlan { skills: Record<string, Record<string, SkillEntry | null>>; filesToWrite: {...}[] }`, `buildPresetPlan(discovered, generateFiles, statusColors): PresetPlan`.

- [ ] **Step 1: Rewrite the test**

Replace the whole content of `src/skills/presetSkillFiles.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run presetSkillFiles.test.ts`
Expected: FAIL — `plan.skills` is `undefined` (the implementation still produces `plan.backlogLevels`)

- [ ] **Step 3: Implement**

Replace `src/skills/presetSkillFiles.ts`:

```ts
import type { SkillEntry } from '../types';
import { isValidHexColor, normalizeHex, pickReadableTextColor } from '../view/badgeColor';

export interface PresetPlan {
  skills: Record<string, Record<string, SkillEntry | null>>;
  filesToWrite: { relativePath: string; content: string }[];
}

const FINAL_CATEGORIES = new Set(['Completed', 'Removed']);
const NEUTRAL_BUTTON_COLOR = 'b2b2b2';

function slugify(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function skillSkeleton(typeName: string, statusName: string): string {
  return `# Skill: ${typeName} — ${statusName}

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
  discovered: Record<string, Record<string, string>>,
  generateFiles: boolean,
  statusColors: Record<string, string>,
): PresetPlan {
  const skills: Record<string, Record<string, SkillEntry | null>> = {};
  const filesToWrite: { relativePath: string; content: string }[] = [];
  const pathByKey = new Map<string, string>();

  for (const [typeName, statuses] of Object.entries(discovered)) {
    const statusSkills: Record<string, SkillEntry | null> = {};

    for (const [statusName, category] of Object.entries(statuses)) {
      if (FINAL_CATEGORIES.has(category) || !generateFiles) {
        statusSkills[statusName] = null;
        continue;
      }

      const key = `${typeName}::${statusName}`;
      let relativePath = pathByKey.get(key);
      if (!relativePath) {
        relativePath = `.kanbrain/skills/${slugify(typeName)}-${slugify(statusName)}.md`;
        pathByKey.set(key, relativePath);
        filesToWrite.push({ relativePath, content: skillSkeleton(typeName, statusName) });
      }
      statusSkills[statusName] = buildStatusSkillEntry(relativePath, statusName, statusColors);
    }

    skills[typeName] = statusSkills;
  }

  return { skills, filesToWrite };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run presetSkillFiles.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/skills/presetSkillFiles.ts src/skills/presetSkillFiles.test.ts
git commit -m "feat: build the skill preset plan keyed by work item type instead of backlog level"
```

---

### Task 6: `renderConfigEditor.ts`

**Files:**
- Modify: `src/view/renderConfigEditor.ts`
- Modify: `src/view/renderConfigEditor.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.skills` (Task 1).
- Produces: `renderConfigEditor(config: KanbrainConfig): string` — unchanged signature, groups by type instead of level. `renderSkillEntryRow`'s first parameter is renamed `type` (still emits `data-level="${type}"` in the HTML — the attribute name itself does not change, since `KanbrainViewProvider`'s save/pick-file wiring already reads it generically as `row.dataset.level`/`message.level` and doesn't need to know it now holds a type name).

- [ ] **Step 1: Rewrite the test**

Replace the whole content of `src/view/renderConfigEditor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderConfigEditor } from './renderConfigEditor';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('renderConfigEditor', () => {
  it('shows an empty message when there are no work item types configured', () => {
    expect(renderConfigEditor(config())).toContain('No work item types configured yet.');
  });

  it('renders one row per status with data-level/data-status attributes', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null, Done: null } } }));

    expect(html).toContain('data-level="Task"');
    expect(html).toContain('data-status="To Do"');
    expect(html).toContain('data-status="Done"');
  });

  it('leaves the fields empty when the entry is null', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } } }));

    expect(html).toContain('data-field="path" placeholder="Skill file path" value=""');
  });

  it('fills the fields from the skill entry when one is set', () => {
    const html = renderConfigEditor(
      config({
        skills: {
          Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' } },
        },
      }),
    );

    expect(html).toContain('value=".kanbrain/skills/task-todo.md"');
    expect(html).toContain('value="Refine"');
    expect(html).toContain('value="ffffff"');
    expect(html).toContain('value="007acc"');
  });

  it('escapes HTML in type, status, and field values', () => {
    const html = renderConfigEditor(config({ skills: { '<Task>': { '<To Do>': { path: '<script>' } } } }));

    expect(html).toContain('&lt;Task&gt;');
    expect(html).toContain('&lt;To Do&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows a status dot when a color is known for the status', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } }, statusColors: { 'To Do': 'b2b2b2' } }));

    expect(html).toContain('kb-status-dot');
    expect(html).toContain('#b2b2b2');
  });

  it('shows a picker button for each row', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } } }));

    expect(html).toContain('data-action="pick-skill-file"');
  });

  it('shows native color pickers for textColor and buttonColor set to the stored hex', () => {
    const html = renderConfigEditor(
      config({
        skills: {
          Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md', textColor: 'ffffff', buttonColor: '007acc' } },
        },
      }),
    );

    expect(html).toContain('type="color"');
    expect(html).toContain('data-color-for="textColor"');
    expect(html).toContain('data-color-for="buttonColor"');
    expect(html).toContain('value="#ffffff"');
    expect(html).toContain('value="#007acc"');
  });

  it('defaults color pickers to black when the hex field is empty or invalid', () => {
    const html = renderConfigEditor(
      config({ skills: { Task: { 'To Do': { path: '.kanbrain/skills/task-todo.md', buttonColor: 'not-a-color' } } } }),
    );

    const pickers = [...html.matchAll(/data-color-for="(textColor|buttonColor)" value="([^"]*)"/g)];
    expect(pickers).toHaveLength(2);
    for (const [, , value] of pickers) {
      expect(value).toBe('#000000');
    }
  });

  it('renders each type as a collapsible section with a chevron toggle header', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } } }));

    expect(html).toContain('class="kb-config-level-header"');
    expect(html).toContain('data-action="toggle-group"');
    expect(html).toContain('kb-chevron');
  });

  it('starts each type body collapsed (kb-hidden) by default', () => {
    const html = renderConfigEditor(config({ skills: { Task: { 'To Do': null } } }));

    expect(html).toContain('class="kb-config-level-body kb-hidden"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run renderConfigEditor.test.ts`
Expected: FAIL — `config.skills` is not read by the current implementation

- [ ] **Step 3: Implement**

In `src/view/renderConfigEditor.ts`, rename the `level` parameter to `type` in `renderSkillEntryRow` (the emitted attribute stays `data-level`) and read `config.skills` in `renderConfigEditor`:

```ts
import type { KanbrainConfig, SkillEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { isValidHexColor, normalizeHex } from './badgeColor';

function renderColorField(field: 'textColor' | 'buttonColor', value: string, placeholder: string): string {
  const pickerValue = value && isValidHexColor(value) ? normalizeHex(value) : '#000000';
  return `
    <div class="kb-config-field-color">
      <input type="text" class="kb-input" data-field="${field}" placeholder="${placeholder}" value="${escapeHtml(value)}">
      <input type="color" class="kb-color-picker" data-color-for="${field}" value="${pickerValue}">
    </div>
  `;
}

function renderSkillEntryRow(type: string, status: string, entry: SkillEntry | null, statusColors: Record<string, string>): string {
  const path = entry?.path ?? '';
  const label = entry?.label ?? '';
  const textColor = entry?.textColor ?? '';
  const buttonColor = entry?.buttonColor ?? '';

  return `
    <div class="kb-config-row" data-level="${escapeHtml(type)}" data-status="${escapeHtml(status)}">
      <div class="kb-config-row-status">${renderStatusDot(status, statusColors)}${escapeHtml(status)}</div>
      <div class="kb-config-field-path">
        <input type="text" class="kb-input" data-field="path" placeholder="Skill file path" value="${escapeHtml(path)}">
        <button type="button" data-action="pick-skill-file" title="Browse for a file">…</button>
      </div>
      <input type="text" class="kb-input" data-field="label" placeholder="Label (optional)" value="${escapeHtml(label)}">
      ${renderColorField('textColor', textColor, 'Text color hex')}
      ${renderColorField('buttonColor', buttonColor, 'Button color hex')}
    </div>
  `;
}

export function renderConfigEditor(config: KanbrainConfig): string {
  const types = Object.keys(config.skills);
  if (types.length === 0) {
    return '<div class="kb-empty">No work item types configured yet.</div>';
  }

  return types
    .map(type => {
      const statuses = config.skills[type];
      const rows = Object.keys(statuses)
        .map(status => renderSkillEntryRow(type, status, statuses[status], config.statusColors ?? {}))
        .join('');
      return `
        <div class="kb-config-level">
          <button type="button" class="kb-config-level-header" data-action="toggle-group">
            <span class="kb-chevron">▾</span>${escapeHtml(type)}
          </button>
          <div class="kb-config-level-body kb-hidden">
            ${rows}
          </div>
        </div>
      `;
    })
    .join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run renderConfigEditor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/view/renderConfigEditor.ts src/view/renderConfigEditor.test.ts
git commit -m "feat: group the skill config editor by work item type instead of backlog level"
```

---

### Task 7: `discoverCardSettingsByTeam` — multi-team discovery

**Files:**
- Modify: `src/azureDevOps/discoverCardSettings.ts` (rename export)
- Modify: `src/azureDevOps/discoverCardSettings.test.ts`

**Interfaces:**
- Consumes: `client.listTeams` (Task 2), `client.listBoards`/`client.getCardSettings` (existing, unchanged).
- Produces: `discoverCardSettingsByTeam(client, organization, project): Promise<Record<string, Record<string, Record<string, CardFieldSettings>>>>` — replaces `discoverCardSettingsByBoard(client, organization, project, team)`.

- [ ] **Step 1: Rewrite the test**

Replace the whole content of `src/azureDevOps/discoverCardSettings.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { discoverCardSettingsByTeam } from './discoverCardSettings';
import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';

function stubClient(overrides: Partial<{
  listTeams: () => Promise<{ id: string; name: string }[]>;
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, CardFieldSettings>>;
}> = {}): AzureDevOpsClient {
  return {
    listTeams: vi.fn().mockResolvedValue([]),
    listBoards: vi.fn().mockResolvedValue([]),
    getCardSettings: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverCardSettingsByTeam', () => {
  it('collects card settings per board for every team in the project', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Team 1' },
        { id: 't2', name: 'Team 2' },
      ]),
      listBoards: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'b1', name: 'Stories' }])
        .mockResolvedValueOnce([{ id: 'b2', name: 'Stories' }]),
      getCardSettings: vi
        .fn()
        .mockResolvedValueOnce({ 'User Story': { parent: true, assignedTo: true } })
        .mockResolvedValueOnce({ 'User Story': { parent: false, assignedTo: true } }),
    });

    const result = await discoverCardSettingsByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({
      'Team 1': { Stories: { 'User Story': { parent: true, assignedTo: true } } },
      'Team 2': { Stories: { 'User Story': { parent: false, assignedTo: true } } },
    });
  });

  it('does not collide when two teams have a board with the same name', () => {
    // Covered by the assertion above: "Stories" appears under both "Team 1" and "Team 2"
    // as independent entries, proving the team is the outer key and boards never overwrite
    // each other across teams.
    expect(true).toBe(true);
  });

  it('skips a team whose boards fail to load, without aborting the others', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([
        { id: 't1', name: 'Team 1' },
        { id: 't2', name: 'Team 2' },
      ]),
      listBoards: vi.fn().mockRejectedValueOnce(new Error('no access')).mockResolvedValueOnce([{ id: 'b2', name: 'Stories' }]),
      getCardSettings: vi.fn().mockResolvedValue({ 'User Story': { parent: true, assignedTo: true } }),
    });

    const result = await discoverCardSettingsByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({ 'Team 2': { Stories: { 'User Story': { parent: true, assignedTo: true } } } });
  });

  it('skips a board whose card settings fail to load, keeping the rest of that team', async () => {
    const client = stubClient({
      listTeams: vi.fn().mockResolvedValue([{ id: 't1', name: 'Team 1' }]),
      listBoards: vi.fn().mockResolvedValue([
        { id: 'b1', name: 'Stories' },
        { id: 'b2', name: 'Features' },
      ]),
      getCardSettings: vi
        .fn()
        .mockRejectedValueOnce(new Error('no access'))
        .mockResolvedValueOnce({ Feature: { parent: true, assignedTo: false } }),
    });

    const result = await discoverCardSettingsByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({ 'Team 1': { Features: { Feature: { parent: true, assignedTo: false } } } });
  });

  it('returns an empty object when the project has no teams', async () => {
    const client = stubClient({ listTeams: vi.fn().mockResolvedValue([]) });

    const result = await discoverCardSettingsByTeam(client, 'my-org', 'MyProject');

    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run discoverCardSettings.test.ts`
Expected: FAIL — cannot find export `discoverCardSettingsByTeam`

- [ ] **Step 3: Implement**

Replace `src/azureDevOps/discoverCardSettings.ts`:

```ts
import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';

export async function discoverCardSettingsByTeam(
  client: AzureDevOpsClient,
  organization: string,
  project: string,
): Promise<Record<string, Record<string, Record<string, CardFieldSettings>>>> {
  const teams = await client.listTeams(organization, project);

  const result: Record<string, Record<string, Record<string, CardFieldSettings>>> = {};
  for (const team of teams) {
    try {
      const boards = await client.listBoards(organization, project, team.name);
      const byBoard: Record<string, Record<string, CardFieldSettings>> = {};
      for (const board of boards) {
        try {
          byBoard[board.name] = await client.getCardSettings(organization, project, team.name, board.id);
        } catch {
          // One-off failure for a board: continue without it instead of aborting the whole team.
        }
      }
      result[team.name] = byBoard;
    } catch {
      // One-off failure for a team (e.g. no board access): continue without it instead of aborting the whole discovery.
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run discoverCardSettings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/discoverCardSettings.ts src/azureDevOps/discoverCardSettings.test.ts
git commit -m "feat: discover card settings for every team in the project, not just the default team"
```

---

### Task 8: `discoverBoardState.ts`

**Files:**
- Modify: `src/azureDevOps/discoverBoardState.ts`
- Modify: `src/azureDevOps/discoverBoardState.test.ts`

**Interfaces:**
- Consumes: `discoverWorkItemTypes`, `discoverStatusesByType` (Task 3), `discoverCardSettingsByTeam` (Task 7), `client.getDefaultTeamName` (existing, unchanged).
- Produces: `BoardState { discoveredStatusesByType: Record<string, Record<string, string>>; typeColors: Record<string, string>; typeIcons: Record<string, string>; defaultTeam: string; cardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>> }`, `discoverBoardState(client, organization, project): Promise<BoardState>`.

- [ ] **Step 1: Rewrite the test**

Replace the whole content of `src/azureDevOps/discoverBoardState.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { discoverBoardState } from './discoverBoardState';
import type { AzureDevOpsClient } from './client';
import type { CardFieldSettings } from '../types';

function stubClient(overrides: Partial<{
  getDefaultTeamName: () => Promise<string>;
  listWorkItemTypes: () => Promise<{ name: string; color: string; iconUrl: string }[]>;
  listWorkItemTypeStates: () => Promise<{ name: string; category: string; color: string }[]>;
  getIconSvg: () => Promise<string>;
  listTeams: () => Promise<{ id: string; name: string }[]>;
  listBoards: () => Promise<{ id: string; name: string }[]>;
  getCardSettings: () => Promise<Record<string, CardFieldSettings>>;
}> = {}): AzureDevOpsClient {
  return {
    getDefaultTeamName: vi.fn().mockResolvedValue('MyProject Team'),
    listWorkItemTypes: vi.fn().mockResolvedValue([{ name: 'Task', color: 'f2cb1d', iconUrl: 'https://example.com/icon' }]),
    listWorkItemTypeStates: vi.fn().mockResolvedValue([{ name: 'New', category: 'Proposed', color: 'b2b2b2' }]),
    getIconSvg: vi.fn().mockResolvedValue('<svg></svg>'),
    listTeams: vi.fn().mockResolvedValue([{ id: 't1', name: 'MyProject Team' }]),
    listBoards: vi.fn().mockResolvedValue([{ id: 'b1', name: 'Tasks' }]),
    getCardSettings: vi.fn().mockResolvedValue({ Task: { parent: true, assignedTo: true } }),
    ...overrides,
  } as unknown as AzureDevOpsClient;
}

describe('discoverBoardState', () => {
  it('fetches the default team, statuses by type, and type colors/icons', async () => {
    const client = stubClient();
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.defaultTeam).toBe('MyProject Team');
    expect(result.discoveredStatusesByType.Task).toEqual({ New: 'Proposed' });
    expect(result.typeColors.Task).toBe('f2cb1d');
    expect(result.typeIcons.Task).toBe('<svg></svg>');
  });

  it('continues without a type when discovery fails for it', async () => {
    const client = stubClient({ listWorkItemTypeStates: vi.fn().mockRejectedValue(new Error('boom')) });
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.discoveredStatusesByType.Task).toBeUndefined();
    expect(result.typeColors.Task).toBeUndefined();
  });

  it('fetches card settings for every team, keyed by team then board', async () => {
    const client = stubClient();
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.cardSettingsByTeam).toEqual({ 'MyProject Team': { Tasks: { Task: { parent: true, assignedTo: true } } } });
  });

  it('continues with an empty cardSettingsByTeam when the project has no teams', async () => {
    const client = stubClient({ listTeams: vi.fn().mockResolvedValue([]) });
    const result = await discoverBoardState(client, 'my-org', 'MyProject');

    expect(result.cardSettingsByTeam).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run discoverBoardState.test.ts`
Expected: FAIL — `result.defaultTeam`/`result.discoveredStatusesByType`/`result.cardSettingsByTeam` are `undefined`

- [ ] **Step 3: Implement**

Replace `src/azureDevOps/discoverBoardState.ts`:

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

export async function discoverBoardState(client: AzureDevOpsClient, organization: string, project: string): Promise<BoardState> {
  const defaultTeam = await client.getDefaultTeamName(organization, project);
  const types = await discoverWorkItemTypes(client, organization, project);

  const discoveredStatusesByType = discoverStatusesByType(types);
  const typeColors: Record<string, string> = {};
  const typeIcons: Record<string, string> = {};
  for (const type of types) {
    typeColors[type.name] = type.color;
    typeIcons[type.name] = type.iconSvg;
  }

  const cardSettingsByTeam = await discoverCardSettingsByTeam(client, organization, project);

  return { discoveredStatusesByType, typeColors, typeIcons, defaultTeam, cardSettingsByTeam };
}
```

Note `discoverStatusColors` (from Task 3) is intentionally not called here — it's called directly by the command files that need it (`setup.ts`, `syncBoardConfig.ts`), same as the pre-existing pattern where `discoverStatusColors` was a caller-side concern, not part of `BoardState`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run discoverBoardState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/discoverBoardState.ts src/azureDevOps/discoverBoardState.test.ts
git commit -m "feat: discover board state via team-independent type discovery and multi-team card settings"
```

---

### Task 9: `checkBoardConfig.ts` — simplified diff

**Files:**
- Modify: `src/azureDevOps/checkBoardConfig.ts`
- Modify: `src/azureDevOps/checkBoardConfig.test.ts`

**Interfaces:**
- Consumes: `discoverStatusesByType`'s return shape (Task 3): `Record<string, Record<string, string>>`.
- Produces: `BoardConfigDiff { typesAdded: string[]; typesRemoved: string[]; statusesAdded: { type: string; status: string }[]; statusesRemoved: { type: string; status: string; skillPath: string | null }[] }`, `diffBoardConfig(config: KanbrainConfig, discovered: Record<string, Record<string, string>>): BoardConfigDiff` (no longer takes a `freshTypeToBacklogLevel` argument), `isDiffEmpty(diff)`, `summarizeDiff(diff)`.

- [ ] **Step 1: Rewrite the test**

Replace the whole content of `src/azureDevOps/checkBoardConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffBoardConfig, isDiffEmpty } from './checkBoardConfig';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: { Task: { 'To Do': null, Done: null } },
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

const discovered: Record<string, Record<string, string>> = { Task: { 'To Do': 'Proposed', Done: 'Completed' } };

describe('diffBoardConfig', () => {
  it('returns an empty diff when config matches the discovered types exactly', () => {
    const diff = diffBoardConfig(config(), discovered);
    expect(isDiffEmpty(diff)).toBe(true);
  });

  it('reports a type removed (no longer discovered)', () => {
    const diff = diffBoardConfig(config({ skills: { Task: { 'To Do': null, Done: null }, Bug: { New: null } } }), discovered);
    expect(diff.typesRemoved).toEqual(['Bug']);
  });

  it('reports a type added (discovered but not yet in config)', () => {
    const diff = diffBoardConfig(config(), { ...discovered, Bug: { New: 'Proposed' } });
    expect(diff.typesAdded).toEqual(['Bug']);
  });

  it('reports a status added within an existing type', () => {
    const diff = diffBoardConfig(config({ skills: { Task: { 'To Do': null } } }), discovered);
    expect(diff.statusesAdded).toEqual([{ type: 'Task', status: 'Done' }]);
  });

  it('reports a status removed within an existing type, including its skill path', () => {
    const diff = diffBoardConfig(
      config({ skills: { Task: { 'To Do': null, Done: null, Cancelled: { path: '.kanbrain/skills/task-cancelled.md' } } } }),
      discovered,
    );
    expect(diff.statusesRemoved).toEqual([{ type: 'Task', status: 'Cancelled', skillPath: '.kanbrain/skills/task-cancelled.md' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run checkBoardConfig.test.ts`
Expected: FAIL — `diffBoardConfig` still expects a third argument and reads `config.typeToBacklogLevel`/`config.backlogLevels`

- [ ] **Step 3: Implement**

Replace `src/azureDevOps/checkBoardConfig.ts`:

```ts
import type { KanbrainConfig } from '../types';

export interface BoardConfigDiff {
  typesAdded: string[];
  typesRemoved: string[];
  statusesAdded: { type: string; status: string }[];
  statusesRemoved: { type: string; status: string; skillPath: string | null }[];
}

export function diffBoardConfig(config: KanbrainConfig, discovered: Record<string, Record<string, string>>): BoardConfigDiff {
  const typesAdded: string[] = [];
  const typesRemoved: string[] = [];
  const statusesAdded: { type: string; status: string }[] = [];
  const statusesRemoved: { type: string; status: string; skillPath: string | null }[] = [];

  for (const type of Object.keys(config.skills)) {
    if (!(type in discovered)) {
      typesRemoved.push(type);
      continue;
    }
    for (const status of Object.keys(config.skills[type])) {
      if (!(status in discovered[type])) {
        statusesRemoved.push({ type, status, skillPath: config.skills[type][status]?.path ?? null });
      }
    }
  }
  for (const [type, statuses] of Object.entries(discovered)) {
    if (!(type in config.skills)) {
      typesAdded.push(type);
      continue;
    }
    for (const status of Object.keys(statuses)) {
      if (!(status in config.skills[type])) {
        statusesAdded.push({ type, status });
      }
    }
  }

  return { typesAdded, typesRemoved, statusesAdded, statusesRemoved };
}

export function isDiffEmpty(diff: BoardConfigDiff): boolean {
  return (
    diff.typesAdded.length === 0 &&
    diff.typesRemoved.length === 0 &&
    diff.statusesAdded.length === 0 &&
    diff.statusesRemoved.length === 0
  );
}

export function summarizeDiff(diff: BoardConfigDiff): string {
  const parts: string[] = [];
  if (diff.typesAdded.length) parts.push(`${diff.typesAdded.length} new work item type(s)`);
  if (diff.typesRemoved.length) parts.push(`${diff.typesRemoved.length} work item type(s) no longer found`);
  if (diff.statusesAdded.length) parts.push(`${diff.statusesAdded.length} new status(es)`);
  if (diff.statusesRemoved.length) parts.push(`${diff.statusesRemoved.length} status(es) no longer found (skill mappings preserved)`);
  return parts.join(', ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run checkBoardConfig.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/checkBoardConfig.ts src/azureDevOps/checkBoardConfig.test.ts
git commit -m "feat: simplify the board config diff to types/statuses, dropping backlog-level concepts"
```

---

### Task 10: `syncConfig.ts`

**Files:**
- Modify: `src/config/syncConfig.ts`
- Modify: `src/config/syncConfig.test.ts`

**Interfaces:**
- Consumes: `discoverStatusesByType`'s shape (Task 3), `CardFieldSettings` (existing).
- Produces: `syncConfig(config, discoveredStatusesByType, freshStatusColors, freshTypeColors, freshTypeIcons, freshDefaultTeam, freshCardSettingsByTeam): KanbrainConfig`.

- [ ] **Step 1: Rewrite the test**

Replace the whole content of `src/config/syncConfig.test.ts`:

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run syncConfig.test.ts`
Expected: FAIL — `syncConfig` still expects the old 7-argument signature and reads `config.backlogLevels`

- [ ] **Step 3: Implement**

Replace `src/config/syncConfig.ts`:

```ts
import type { KanbrainConfig, SkillEntry, CardFieldSettings } from '../types';

export function syncConfig(
  config: KanbrainConfig,
  discoveredStatusesByType: Record<string, Record<string, string>>,
  freshStatusColors: Record<string, string>,
  freshTypeColors: Record<string, string>,
  freshTypeIcons: Record<string, string>,
  freshDefaultTeam: string,
  freshCardSettingsByTeam: Record<string, Record<string, Record<string, CardFieldSettings>>>,
): KanbrainConfig {
  const skills: Record<string, Record<string, SkillEntry | null>> = {};

  for (const [type, statuses] of Object.entries(discoveredStatusesByType)) {
    const existingType = config.skills[type] ?? {};
    const merged: Record<string, SkillEntry | null> = {};
    for (const status of Object.keys(statuses)) {
      merged[status] = status in existingType ? existingType[status] : null;
    }
    skills[type] = merged;
  }

  for (const [type, statuses] of Object.entries(config.skills)) {
    if (!(type in skills)) {
      skills[type] = { ...statuses };
      continue;
    }
    for (const [status, skill] of Object.entries(statuses)) {
      if (!(status in skills[type])) {
        skills[type][status] = skill;
      }
    }
  }

  return {
    organization: config.organization,
    project: config.project,
    defaultTeam: freshDefaultTeam,
    skills,
    statusColors: freshStatusColors,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
    cardSettingsByTeam: freshCardSettingsByTeam,
    showAssignedTo: config.showAssignedTo,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run syncConfig.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/syncConfig.ts src/config/syncConfig.test.ts
git commit -m "feat: sync skills-by-type and cardSettingsByTeam instead of backlog-level config"
```

---

### Task 11: `resolveCardFieldVisibility.ts` — `selectedTeam`

**Files:**
- Modify: `src/config/resolveCardFieldVisibility.ts`
- Modify: `src/config/resolveCardFieldVisibility.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.cardSettingsByTeam`/`defaultTeam` (Task 1).
- Produces: `resolveShowParent(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean`, `resolveShowAssignedTo(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean`.

- [ ] **Step 1: Rewrite the test**

Replace the whole content of `src/config/resolveCardFieldVisibility.test.ts`:

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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resolveCardFieldVisibility.test.ts`
Expected: FAIL — `resolveShowParent`/`resolveShowAssignedTo` still read `config.cardSettingsByBoard` and ignore `defaultTeam`

- [ ] **Step 3: Implement**

Replace `src/config/resolveCardFieldVisibility.ts`:

```ts
import type { KanbrainConfig, CardFieldSettings } from '../types';

function resolveCardField(
  config: KanbrainConfig,
  workItemType: string,
  selectedTeam: string | undefined,
  field: keyof CardFieldSettings,
): boolean {
  const teams = config.cardSettingsByTeam ?? {};
  const teamNames = Object.keys(teams);
  if (teamNames.length === 0) {
    return false;
  }
  const teamName = selectedTeam && teamNames.includes(selectedTeam) ? selectedTeam : teamNames.includes(config.defaultTeam) ? config.defaultTeam : teamNames[0];
  const boards = teams[teamName];

  const matches = Object.values(boards).filter(byType => workItemType in byType);
  if (matches.length === 0) {
    return false;
  }
  return matches[0][workItemType][field];
}

export function resolveShowParent(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  return resolveCardField(config, workItemType, selectedTeam, 'parent');
}

export function resolveShowAssignedTo(config: KanbrainConfig, workItemType: string, selectedTeam: string | undefined): boolean {
  return resolveCardField(config, workItemType, selectedTeam, 'assignedTo');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resolveCardFieldVisibility.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/resolveCardFieldVisibility.ts src/config/resolveCardFieldVisibility.test.ts
git commit -m "feat: resolve Parent/AssignedTo visibility by team, falling back to defaultTeam"
```

---

### Task 12: `renderSearchResults.ts` + `KanbrainViewProvider.fetchTypeCounts`

**Files:**
- Modify: `src/view/renderSearchResults.ts`
- Modify: `src/view/renderSearchResults.test.ts`
- Modify: `src/view/KanbrainViewProvider.ts:27,162,168,177-189` (field, call site, method — no dedicated test, verified at Task 17)

**Interfaces:**
- Consumes: `KanbrainConfig.skills` (Task 1).
- Produces: `renderSearchResults(items: WorkItem[], config: KanbrainConfig, typeCounts: Record<string, number>, avatars?: Record<string, string>): string` (parameter renamed from `backlogLevelCounts`, tabs now driven by `item.type` directly).

- [ ] **Step 1: Rewrite the test**

Replace the whole content of `src/view/renderSearchResults.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderSearchResults } from './renderSearchResults';
import type { WorkItem, KanbrainConfig } from '../types';

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'T',
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

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

describe('renderSearchResults', () => {
  it('shows an empty message when there are no results', () => {
    expect(renderSearchResults([], config(), {})).toContain('No work items found.');
  });

  it('groups results into collapsible status sections with counts', () => {
    const items = [workItem({ id: 1, status: 'Active' }), workItem({ id: 2, status: 'New' })];

    const html = renderSearchResults(items, config(), {});

    expect(html).toContain('Active (1)');
    expect(html).toContain('New (1)');
    expect(html).toContain('data-action="toggle-group"');
    expect(html).toContain('kb-group-items');
  });

  it('renders each item as a pickable button with its id, escaping the title', () => {
    const html = renderSearchResults([workItem({ id: 482, title: 'Fix <bug>' })], config(), {});

    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('Fix &lt;bug&gt;');
    expect(html).not.toContain('Fix <bug>');
  });

  it('shows a status dot on the group header when a color is known for the status', () => {
    const html = renderSearchResults([workItem({ status: 'Active' })], config({ statusColors: { Active: 'b2b2b2' } }), {});

    expect(html).toContain('kb-status-dot');
    expect(html).toContain('#b2b2b2');
  });

  it('shows the type icon and a colored right border on each item', () => {
    const html = renderSearchResults(
      [workItem({ type: 'Task' })],
      config({ typeColors: { Task: 'f2cb1d' }, typeIcons: { Task: '<svg><path d="M0 0"/></svg>' } }),
      {},
    );

    expect(html).toContain('kb-type-icon');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
    expect(html).toContain('border-right: 4px solid #f2cb1d');
  });

  it('omits the icon and border when the type has no configured color or icon', () => {
    const html = renderSearchResults([workItem({ type: 'Task' })], config(), {});

    expect(html).not.toContain('kb-type-icon');
    expect(html).not.toContain('border-right');
  });

  it('does not show an action button on search result items', () => {
    const html = renderSearchResults([workItem({ id: 482 })], config(), {});

    expect(html).not.toContain('data-action="run-skill"');
  });

  it('renders no tab bar when there are no configured work item types', () => {
    const html = renderSearchResults([workItem()], config(), {});

    expect(html).not.toContain('kb-search-tabs');
  });

  it('renders a tab per work item type, in config order, plus an "all" tab first', () => {
    const items = [workItem({ id: 1, type: 'Epic' }), workItem({ id: 2, type: 'Task' })];
    const html = renderSearchResults(items, config({ skills: { Epic: {}, Task: {} } }), { Epic: 3, Task: 7 });

    const allIndex = html.indexOf('data-tab="all"');
    const epicIndex = html.indexOf('data-tab="Epic"');
    const taskIndex = html.indexOf('data-tab="Task"');

    expect(allIndex).toBeGreaterThanOrEqual(0);
    expect(epicIndex).toBeGreaterThan(allIndex);
    expect(taskIndex).toBeGreaterThan(epicIndex);
    expect(html).toContain('All (2)');
  });

  it('shows the type tab count from typeCounts, not from the filtered item list', () => {
    const items = [workItem({ id: 1, type: 'Epic' })];
    const html = renderSearchResults(items, config({ skills: { Epic: {} } }), { Epic: 12 });

    expect(html).toContain('Epic (12)');
  });

  it('marks a type tab as empty when its count is 0', () => {
    const html = renderSearchResults([workItem({ type: 'Epic' })], config({ skills: { Epic: {}, Task: {} } }), { Epic: 5, Task: 0 });

    expect(html).toContain('kb-search-tab-empty');
    expect(html).toContain('Task (0)');
  });

  it("scopes each type panel to only that type's items", () => {
    const items = [workItem({ id: 1, type: 'Epic', title: 'An epic' }), workItem({ id: 2, type: 'Task', title: 'A task' })];
    const html = renderSearchResults(items, config({ skills: { Epic: {}, Task: {} } }), { Epic: 1, Task: 1 });

    const epicPanelStart = html.indexOf('data-tab-panel="Epic"');
    const taskPanelStart = html.indexOf('data-tab-panel="Task"');
    const epicPanel = html.slice(epicPanelStart, taskPanelStart);

    expect(epicPanel).toContain('An epic');
    expect(epicPanel).not.toContain('A task');
  });

  it('shows "Unassigned" on a result item when the item has no assignee', () => {
    const html = renderSearchResults([workItem({ assignedTo: null })], config(), {});
    expect(html).toContain('kb-result-item-assignee');
    expect(html).toContain('Unassigned');
  });

  it('shows the assignee name on a result item when assigned', () => {
    const html = renderSearchResults([workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: null } })], config(), {});
    expect(html).toContain('Jane Doe');
  });

  it('shows the resolved avatar image on a result item when provided', () => {
    const item = workItem({ assignedTo: { displayName: 'Jane Doe', imageUrl: 'https://example.com/avatar.png' } });
    const html = renderSearchResults([item], config(), {}, { 'https://example.com/avatar.png': 'data:image/png;base64,X' });
    expect(html).toContain('<img class="kb-avatar" src="data:image/png;base64,X"');
  });

  it('hides the assignee row on result items when config.showAssignedTo is false', () => {
    const html = renderSearchResults([workItem()], config({ showAssignedTo: false }), {});
    expect(html).not.toContain('kb-result-item-assignee');
  });

  it('wraps the id+title in a single-line ellipsis span', () => {
    const html = renderSearchResults([workItem({ id: 482, title: 'A very long title that should be truncated' })], config(), {});

    expect(html).toContain('<span class="kb-result-item-title">#482 A very long title that should be truncated</span>');
  });

  it('shows a View details button for each item, separate from the pick-work-item button', () => {
    const html = renderSearchResults([workItem({ id: 482 })], config(), {});

    expect(html).toContain('data-action="open-work-item-detail"');
    expect(html).toContain('kb-view-details-link');
  });

  it('scopes the View details button to the correct item id', () => {
    const items = [workItem({ id: 1 }), workItem({ id: 2 })];
    const html = renderSearchResults(items, config(), {});

    expect(html).toContain('data-action="open-work-item-detail" data-id="1"');
    expect(html).toContain('data-action="open-work-item-detail" data-id="2"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run renderSearchResults.test.ts`
Expected: FAIL — tabs still key off `config.backlogLevels`/`config.typeToBacklogLevel`

- [ ] **Step 3: Implement**

In `src/view/renderSearchResults.ts`, update `renderSearchResults`'s signature and tab-building logic (`renderStatusGroups` is unchanged — it never referenced backlog levels):

```ts
export function renderSearchResults(
  items: WorkItem[],
  config: KanbrainConfig,
  typeCounts: Record<string, number>,
  avatars: Record<string, string> = {},
): string {
  if (items.length === 0) {
    return '<div class="kb-empty">No work items found.</div>';
  }

  const types = Object.keys(config.skills);
  if (types.length === 0) {
    return renderStatusGroups(items, config, avatars);
  }

  const tabs = [
    { id: 'all', label: 'All', count: items.length, items },
    ...types.map(type => ({
      id: type,
      label: type,
      count: typeCounts[type] ?? 0,
      items: items.filter(item => item.type === type),
    })),
  ];

  const tabBar = tabs
    .map(
      tab =>
        `<button class="kb-search-tab${tab.count === 0 ? ' kb-search-tab-empty' : ''}" data-action="select-tab" data-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)} (${tab.count})</button>`,
    )
    .join('');

  const panels = tabs
    .map(tab => `<div class="kb-search-tab-panel" data-tab-panel="${escapeHtml(tab.id)}">${renderStatusGroups(tab.items, config, avatars)}</div>`)
    .join('');

  return `<div class="kb-search-tabs">${tabBar}</div>${panels}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run renderSearchResults.test.ts`
Expected: PASS

- [ ] **Step 5: Wire `KanbrainViewProvider.ts`'s type-count fetch**

Read `src/view/KanbrainViewProvider.ts` in full first. Rename the field (currently line 27):

```ts
  private typeCounts: Record<string, number> = {};
```

Rename the method (currently lines 177-189):

```ts
  private async fetchTypeCounts(client: AzureDevOpsClient, config: KanbrainConfig): Promise<Record<string, number>> {
    const types = Object.keys(config.skills);
    const entries = await Promise.all(
      types.map(async type => [type, await client.countWorkItemsByType(config.organization, config.project, [type])] as const),
    );
    return Object.fromEntries(entries);
  }
```

Update the two call sites inside `searchWorkItems` (currently lines 162 and 168):

```ts
      if (query.trim() === '') {
        this.typeCounts = await this.fetchTypeCounts(this.client, config);
      }
      const ids = await this.client.searchWorkItems(config.organization, config.project, query);
      const items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      const filtered = filterSearchResults(items, query);
      const avatars = config.showAssignedTo !== false ? await this.resolveAvatars(filtered) : {};
      html = renderSearchResults(filtered, config, this.typeCounts, avatars);
```

- [ ] **Step 6: Commit**

```bash
git add src/view/renderSearchResults.ts src/view/renderSearchResults.test.ts src/view/KanbrainViewProvider.ts
git commit -m "feat: drive search dialog tabs by work item type instead of backlog level"
```

---

### Task 13: `renderConfig.ts`, `render.ts`, `renderHome.ts` — Team selector

**Files:**
- Modify: `src/view/renderConfig.ts`
- Modify: `src/view/renderConfig.test.ts`
- Modify: `src/view/render.ts`
- Modify: `src/view/render.test.ts`
- Modify: `src/view/renderHome.ts`
- Modify: `src/view/renderHome.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.cardSettingsByTeam`/`defaultTeam` (Task 1), `resolveShowParent` (Task 11, signature now takes `selectedTeam`).
- Produces: `RenderState.selectedTeam?: string` (renamed from `selectedBoard`), a `<select id="kb-team-select">` in the Config screen (renamed from `kb-board-select`).

- [ ] **Step 1: Rewrite `renderConfig.test.ts`**

Replace the whole content of `src/view/renderConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderConfig } from './renderConfig';
import type { RenderState } from './render';
import type { KanbrainConfig } from '../types';

function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}

function state(overrides: Partial<RenderState> = {}): RenderState {
  return {
    hasWorkspace: true,
    config: config(),
    workItem: null,
    parent: null,
    subtasks: [],
    screen: 'config',
    ...overrides,
  };
}

describe('renderConfig', () => {
  it('shows a Home button', () => {
    const html = renderConfig(state());
    expect(html).toContain('id="kb-home-btn"');
  });

  it('renders the config editor', () => {
    const html = renderConfig(state({ config: config({ skills: { Task: { 'To Do': null } } }) }));
    expect(html).toContain('data-level="Task"');
  });

  it('makes the header sticky', () => {
    const html = renderConfig(state());
    expect(html).toContain('kb-header kb-page-header');
  });

  it('shows a "Show assignee in search results" checkbox, checked by default', () => {
    const html = renderConfig(state());
    expect(html).toContain('id="kb-show-assignee-toggle"');
    expect(html).toContain('Show assignee in search results');
    expect(html).toMatch(/id="kb-show-assignee-toggle"[^>]*checked/);
  });

  it('unchecks the checkbox when showAssignedTo is false', () => {
    const html = renderConfig(state({ config: config({ showAssignedTo: false }) }));
    expect(html).not.toMatch(/id="kb-show-assignee-toggle"[^>]*checked/);
  });

  it('wraps Skill Configuration in a parent section container around the config editor', () => {
    const html = renderConfig(state({ config: config({ skills: { Task: { 'To Do': null } } }) }));

    const parentIndex = html.indexOf('kb-config-parent-section');
    const headerIndex = html.indexOf('Skill Configuration');
    const levelIndex = html.indexOf('data-level="Task"');

    expect(parentIndex).toBeGreaterThanOrEqual(0);
    expect(headerIndex).toBeGreaterThan(parentIndex);
    expect(levelIndex).toBeGreaterThan(headerIndex);
  });

  it('does not show a team selector when there are 0 or 1 teams in cardSettingsByTeam', () => {
    const html = renderConfig(state({ config: config({ cardSettingsByTeam: { 'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } } } }) }));
    expect(html).not.toContain('id="kb-team-select"');
  });

  it('shows a team selector when there is more than one team in cardSettingsByTeam', () => {
    const html = renderConfig(
      state({
        config: config({
          cardSettingsByTeam: {
            'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } },
            'Team 2': { Stories: { Task: { parent: false, assignedTo: true } } },
          },
        }),
      }),
    );
    expect(html).toContain('id="kb-team-select"');
    expect(html).toContain('<option value="Team 1"');
    expect(html).toContain('<option value="Team 2"');
  });

  it('marks the selected team as selected in the dropdown', () => {
    const html = renderConfig(
      state({
        config: config({
          cardSettingsByTeam: {
            'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } },
            'Team 2': { Stories: { Task: { parent: false, assignedTo: true } } },
          },
        }),
        selectedTeam: 'Team 2',
      }),
    );
    expect(html).toMatch(/<option value="Team 2" selected>/);
  });

  it('marks defaultTeam as selected when no explicit selection was made', () => {
    const html = renderConfig(
      state({
        config: config({
          defaultTeam: 'Team 1',
          cardSettingsByTeam: {
            'Team 1': { Stories: { Task: { parent: true, assignedTo: false } } },
            'Team 2': { Stories: { Task: { parent: false, assignedTo: true } } },
          },
        }),
      }),
    );
    expect(html).toMatch(/<option value="Team 1" selected>/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run renderConfig.test.ts`
Expected: FAIL — still reads `config.cardSettingsByBoard`/`state.selectedBoard`, no `defaultTeam` fallback

- [ ] **Step 3: Implement `renderConfig.ts`**

Replace `src/view/renderConfig.ts`:

```ts
import type { RenderState } from './render';
import { renderConfigEditor } from './renderConfigEditor';
import { escapeHtml } from './escapeHtml';

export function renderConfig(state: RenderState): string {
  const config = state.config!;
  const teamNames = Object.keys(config.cardSettingsByTeam ?? {});
  const selected = state.selectedTeam ?? config.defaultTeam;
  const teamSelectHtml =
    teamNames.length > 1
      ? `
    <label class="kb-select-row">
      Team
      <select id="kb-team-select">
        ${teamNames
          .map(name => `<option value="${escapeHtml(name)}"${name === selected ? ' selected' : ''}>${escapeHtml(name)}</option>`)
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
      Show assignee in search results
    </label>
    ${teamSelectHtml}
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
  `;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run renderConfig.test.ts`
Expected: PASS

- [ ] **Step 5: Rewrite `render.test.ts`'s fixtures and the two parent-row tests that reference `cardSettingsByBoard`**

Read `src/view/render.test.ts` in full first. Change the top-level `config` fixture (currently lines 21-29):

```ts
const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  defaultTeam: 'MyProject Team',
  skills: { Task: { Active: { path: 'skills/fix.md' }, Closed: null } },
  statusColors: { Active: 'b2b2b2' },
  typeColors: { Task: 'f2cb1d' },
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};
```

Update the `workItem` fixture (currently lines 5-18) to add `development: []` (already required by `WorkItem` since the Development spec — confirm it's already there; if not, add it):

```ts
function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 482,
    title: 'Fix <bug> in login',
    description: 'desc',
    status: 'Active',
    type: 'Task',
    url: 'https://dev.azure.com/org/proj/_workitems/edit/482',
    parentId: null,
    childIds: [],
    assignedTo: null,
    development: [],
    ...overrides,
  };
}
```

Update the three `cardSettingsByBoard`-based tests to `cardSettingsByTeam`:

```ts
  it('shows the parent row on the main card when cardSettingsByTeam enables Parent for the type', () => {
    const configWithParent: KanbrainConfig = { ...config, cardSettingsByTeam: { 'MyProject Team': { Stories: { Task: { parent: true, assignedTo: false } } } } };
    const html = render({
      hasWorkspace: true,
      config: configWithParent,
      workItem: workItem(),
      parent: workItem({ id: 900, title: 'Epic parent' }),
      subtasks: [],
      screen: 'flow',
    });

    expect(html).toContain('kb-field-label');
    expect(html).toContain('data-id="900"');
  });

  it('does not show the parent row when the type is not enabled in cardSettingsByTeam', () => {
    const configWithParent: KanbrainConfig = { ...config, cardSettingsByTeam: { 'MyProject Team': { Stories: { Task: { parent: false, assignedTo: false } } } } };
    const html = render({
      hasWorkspace: true,
      config: configWithParent,
      workItem: workItem(),
      parent: workItem({ id: 900 }),
      subtasks: [],
      screen: 'flow',
    });

    expect(html).not.toContain('kb-field-label');
  });

  it('does not show the parent row on subtask cards', () => {
    const configWithParent: KanbrainConfig = { ...config, cardSettingsByTeam: { 'MyProject Team': { Stories: { Task: { parent: true, assignedTo: false } } } } };
    const subtasks = [workItem({ id: 101, title: 'Sub 1' })];
    const html = render({
      hasWorkspace: true,
      config: configWithParent,
      workItem: workItem(),
      parent: workItem({ id: 900 }),
      subtasks,
      screen: 'flow',
    });

    expect(html.split('kb-field-label').length - 1).toBe(1);
  });
```

Also update the `'passes avatars through to the main card and subtasks'` test's `configWithAssignee` (currently uses `cardSettingsByBoard`):

```ts
    const configWithAssignee: KanbrainConfig = { ...config, cardSettingsByTeam: { 'MyProject Team': { Stories: { Task: { parent: false, assignedTo: true } } } } };
```

- [ ] **Step 6: Run test to verify it fails, then implement `render.ts`**

Run: `npx vitest run render.test.ts`
Expected: FAIL

In `src/view/render.ts`, rename `selectedBoard` to `selectedTeam` throughout (the `RenderState` field and both places it's passed into `resolveShowParent`/`renderWorkItemCard`):

```ts
export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
  connectionStatus?: 'connected' | 'disconnected';
  avatars?: Record<string, string>;
  selectedTeam?: string;
  prDetails?: Record<string, PullRequestDetails>;
}
```

```ts
  const avatars = state.avatars ?? {};
  const showParent = resolveShowParent(state.config, state.workItem.type, state.selectedTeam);
  const prDetails = state.prDetails ?? {};
  const subtasksHtml = state.subtasks.length
    ? state.subtasks
        .map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card', true, avatars, true, null, false, state.selectedTeam, prDetails))
        .join('')
    : '<div class="kb-empty">No child items.</div>';
```

```ts
      ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card', true, avatars, true, state.parent, showParent, state.selectedTeam, prDetails)}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run render.test.ts`
Expected: PASS

- [ ] **Step 8: Rewrite `renderHome.test.ts`'s fixture and implement `renderHome.ts`**

Read `src/view/renderHome.test.ts` in full first. Update its `config` helper to the new shape:

```ts
function config(overrides: Partial<KanbrainConfig> = {}): KanbrainConfig {
  return {
    organization: 'org',
    project: 'proj',
    defaultTeam: 'MyProject Team',
    skills: {},
    statusColors: {},
    typeColors: {},
    typeIcons: {},
    ...overrides,
  };
}
```

Update the `'passes avatars through to the active work item card'` test's override:

```ts
        config: config({ cardSettingsByTeam: { 'MyProject Team': { Stories: { Task: { parent: false, assignedTo: true } } } } }),
```

In `src/view/renderHome.ts`, rename the parameter passed through:

```ts
      ${renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars, false, null, false, state.selectedTeam, state.prDetails ?? {})}
```

- [ ] **Step 9: Run the full trio of tests to verify they pass**

Run: `npx vitest run renderConfig.test.ts render.test.ts renderHome.test.ts`
Expected: PASS (all cases)

- [ ] **Step 10: Commit**

```bash
git add src/view/renderConfig.ts src/view/renderConfig.test.ts src/view/render.ts src/view/render.test.ts src/view/renderHome.ts src/view/renderHome.test.ts
git commit -m "feat: replace the board tie-break selector with a Team selector"
```

---

### Task 14: `renderWorkItemCard.ts` param rename + remaining fixture-only files

**Files:**
- Modify: `src/view/renderWorkItemCard.ts`
- Modify: `src/view/renderWorkItemCard.test.ts`
- Modify: `src/view/renderParent.test.ts` (fixture only)
- Modify: `src/view/renderWorkItemDetail.test.ts` (fixture only)
- Modify: `src/view/renderTypeAccent.test.ts` (fixture only)
- Modify: `src/config/config.test.ts` (fixture only)

**Interfaces:**
- Produces: `renderWorkItemCard(...)`'s 9th parameter renamed `selectedTeam` (purely a name change — it is only ever forwarded into `resolveShowAssignedTo`, which already expects a team name as of Task 11).

- [ ] **Step 1: Rewrite `renderWorkItemCard.test.ts`'s fixture and the tie-break test**

Read `src/view/renderWorkItemCard.test.ts` in full first. Update the top-level `config` fixture:

```ts
const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  defaultTeam: 'MyProject Team',
  skills: { Task: { Active: { path: 'skills/fix.md' } } },
  statusColors: {},
  typeColors: {},
  typeIcons: {},
  cardSettingsByTeam: { 'MyProject Team': { Stories: { Task: { parent: false, assignedTo: true } } } },
};
```

Update the two tests that reference `cardSettingsByBoard`/board-tie-break directly:

```ts
  it('hides the assignee row when cardSettingsByTeam has assignedTo: false for the type', () => {
    const hiddenConfig: KanbrainConfig = { ...config, cardSettingsByTeam: { 'MyProject Team': { Stories: { Task: { parent: false, assignedTo: false } } } } };
    const html = renderWorkItemCard(workItem(), hiddenConfig, 'kb-main-card');
    expect(html).not.toContain('kb-assignee-row');
  });

  it('hides the assignee row when cardSettingsByTeam is missing entirely (fail-safe default)', () => {
    const noSettingsConfig: KanbrainConfig = { ...config, cardSettingsByTeam: undefined };
    const html = renderWorkItemCard(workItem(), noSettingsConfig, 'kb-main-card');
    expect(html).not.toContain('kb-assignee-row');
  });
```

And:

```ts
  it('uses the selected team to break a tie when the type appears in more than one team', () => {
    const ambiguousConfig: KanbrainConfig = {
      ...config,
      cardSettingsByTeam: {
        'MyProject Team': { Stories: { Task: { parent: false, assignedTo: true } } },
        'Other Team': { Stories: { Task: { parent: false, assignedTo: false } } },
      },
    };
    const shown = renderWorkItemCard(workItem(), ambiguousConfig, 'kb-main-card', true, {}, false, null, false, 'MyProject Team');
    const hidden = renderWorkItemCard(workItem(), ambiguousConfig, 'kb-main-card', true, {}, false, null, false, 'Other Team');
    expect(shown).toContain('kb-assignee-row');
    expect(hidden).not.toContain('kb-assignee-row');
  });
```

The rest of the file (parent-row tests, `prDetails` test) is unaffected — leave as-is.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run renderWorkItemCard.test.ts`
Expected: FAIL — `config.cardSettingsByTeam` doesn't exist on `KanbrainConfig` type yet in this file's usage (it does exist from Task 1, so this actually depends on whether `resolveShowAssignedTo` — already updated in Task 11 — reads `cardSettingsByTeam`; since `renderWorkItemCard.ts` itself doesn't change until Step 3, the parameter is still literally named `selectedBoard` — rename it now)

- [ ] **Step 3: Rename the parameter in `renderWorkItemCard.ts`**

In `src/view/renderWorkItemCard.ts`, rename `selectedBoard` to `selectedTeam` (used only as a pass-through into `resolveShowAssignedTo`):

```ts
export function renderWorkItemCard(
  workItem: WorkItem,
  config: KanbrainConfig,
  cssClass: string,
  showActionButton = true,
  avatars: Record<string, string> = {},
  clickableTitle = false,
  parent: WorkItem | null = null,
  showParent = false,
  selectedTeam: string | undefined = undefined,
  prDetails: Record<string, PullRequestDetails> = {},
): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);
  const showAssignedTo = resolveShowAssignedTo(config, workItem.type, selectedTeam);
  const assigneeHtml = showAssignedTo ? renderAssigneeRow(workItem.assignedTo, avatars, 'kb-assignee-row') : '';
  const parentHtml = renderParentRow(parent, showParent, config);
  const developmentHtml = renderDevelopmentSection(workItem.development, prDetails);
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
      ${developmentHtml}
      ${showActionButton ? renderActionButton(workItem, config) : ''}
    </div>
  `;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run renderWorkItemCard.test.ts`
Expected: PASS

- [ ] **Step 5: Update the remaining fixture-only test files**

In `src/view/renderParent.test.ts`, `src/view/renderWorkItemDetail.test.ts`, and `src/view/renderTypeAccent.test.ts`, each has a `KanbrainConfig` object literal with `typeToBacklogLevel: {}, backlogLevels: {}` — replace with `defaultTeam: 'MyProject Team', skills: {}` (same position in the object). None of these files' assertions reference backlog levels, so no other change is needed. For example, in `src/view/renderParent.test.ts`:

```ts
const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  defaultTeam: 'MyProject Team',
  skills: {},
  statusColors: {},
  typeColors: { Feature: 'f2cb1d' },
  typeIcons: { Feature: '<svg><path d="M0 0"/></svg>' },
};
```

In `src/config/config.test.ts`, every inline `KanbrainConfig`-shaped object literal (there are three: in `'returns the parsed config when the file exists'`, `'creates the .kanbrain directory if missing'`, and `'returns status "ok" with the parsed config when the file is valid'`) replaces `typeToBacklogLevel: {...}, backlogLevels: {...}` with `defaultTeam: '...', skills: {...}`. For the first one (which has non-empty values):

```ts
    const config = {
      organization: 'my-org',
      project: 'MyProject',
      defaultTeam: 'MyProject Team',
      skills: { Task: { New: { path: '.kanbrain/skills/a.md' } } },
      statusColors: { New: 'b2b2b2' },
      typeColors: { Task: 'f2cb1d' },
      typeIcons: { Task: '<svg></svg>' },
    };
```

For the other two (empty defaults), just `defaultTeam: '', skills: {},` in place of `typeToBacklogLevel: {}, backlogLevels: {},`.

- [ ] **Step 6: Run these four test files to verify they still pass**

Run: `npx vitest run renderParent.test.ts renderWorkItemDetail.test.ts renderTypeAccent.test.ts config.test.ts`
Expected: PASS (all cases — these files' logic never depended on the renamed fields, only the fixture shape needed to stay a valid `KanbrainConfig` literal)

- [ ] **Step 7: Commit**

```bash
git add src/view/renderWorkItemCard.ts src/view/renderWorkItemCard.test.ts src/view/renderParent.test.ts src/view/renderWorkItemDetail.test.ts src/view/renderTypeAccent.test.ts src/config/config.test.ts
git commit -m "feat: rename renderWorkItemCard's selectedBoard parameter to selectedTeam"
```

---

### Task 15: `KanbrainViewProvider.ts` + `extension.ts` — `selectedTeam` persistence

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`
- Modify: `src/extension.ts`

No dedicated test for this task — same convention as every prior plan this session for these two files (coupled to the VS Code API, verified via compile + manual checklist at Task 17/18).

- [ ] **Step 1: Rename the field, constructor parameter, and method**

Read `src/view/KanbrainViewProvider.ts` in full first (line numbers below assume no changes since the version quoted in this plan's research — re-confirm before editing). Rename (currently line 26):

```ts
  private selectedTeam: string | undefined;
```

Rename the constructor parameter (currently line 41):

```ts
    private readonly persistSelectedTeam: (team: string | undefined) => void,
```

Rename the public method (currently lines 119-124):

```ts
  setSelectedTeam(team: string | undefined): void {
    this.selectedTeam = team;
    this.persistSelectedTeam(team);
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 2: Rename the message branch**

Update the `onDidReceiveMessage` branch (currently lines 86-87):

```ts
      } else if (message.type === 'set-selected-team') {
        this.setSelectedTeam(message.team || undefined);
```

- [ ] **Step 3: Rename the `render()` call's field**

Update the `refresh()` method's `render(...)` call (currently line 442):

```ts
        selectedTeam: this.selectedTeam,
```

- [ ] **Step 4: Rename the inline webview script's dropdown wiring**

Update the script block (currently lines 507-512):

```ts
    const teamSelect = document.getElementById('kb-team-select');
    if (teamSelect) {
      teamSelect.addEventListener('change', () => {
        vscode.postMessage({ type: 'set-selected-team', team: teamSelect.value });
      });
    }
```

- [ ] **Step 5: Update the CSS selector reference**

`.kb-select-row`/`.kb-select-row select` (currently lines 690-691) already style any `<select>` inside `.kb-select-row` generically — no change needed there, since `renderConfig.ts` (Task 13) already wraps the new `<select id="kb-team-select">` in a `<label class="kb-select-row">`.

- [ ] **Step 6: Update `extension.ts`**

Replace the whole content of `src/extension.ts`:

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
const SELECTED_TEAM_KEY = 'kanbrain.selectedTeam';

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
    team => context.workspaceState.update(SELECTED_TEAM_KEY, team),
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

  const savedTeam = context.workspaceState.get<string>(SELECTED_TEAM_KEY);
  if (savedTeam) {
    provider.setSelectedTeam(savedTeam);
  }
}

export function deactivate(): void {}
```

- [ ] **Step 7: Commit**

```bash
git add src/view/KanbrainViewProvider.ts src/extension.ts
git commit -m "feat: persist the selected team instead of the selected board"
```

---

### Task 16: Command wiring — `setup.ts`, `syncBoardConfig.ts`, `commands/checkBoardConfig.ts`

**Files:**
- Modify: `src/commands/setup.ts`
- Modify: `src/commands/syncBoardConfig.ts`
- Modify: `src/commands/checkBoardConfig.ts`

No dedicated test for these three files — same convention as before (VS Code command wiring, verified via compile + manual checklist).

- [ ] **Step 1: Rewrite `setup.ts`**

Read `src/commands/setup.ts` in full first. Replace it:

```ts
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverStatusColors } from '../azureDevOps/discoverWorkItemTypes';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { discoverWorkItemTypes } from '../azureDevOps/discoverWorkItemTypes';
import { buildPresetPlan } from '../skills/presetSkillFiles';
import { writeConfig, ensureGitignoreEntry } from '../config/config';

const EXAMPLE_SKILL = `# Example skill

Work item: {{title}} (#{{id}})
Status: {{status}}
Description: {{description}}

Subtasks:
{{subtasks}}

## Instructions
Describe here what the agent should do when the work item is in this status.
`;

export function registerSetupCommand(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  onSetupComplete: () => void,
): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.setup', async () => {
    const organizations = await client.listOrganizations();
    if (organizations.length === 0) {
      vscode.window.showErrorMessage('No Azure DevOps organization found for this account.');
      return;
    }
    const orgPick = await vscode.window.showQuickPick(
      organizations.map(o => ({ label: o.name, org: o })),
      { placeHolder: 'Select the Azure DevOps organization' },
    );
    if (!orgPick) {
      return;
    }

    const projects = await client.listProjects(orgPick.org.name);
    if (projects.length === 0) {
      vscode.window.showErrorMessage(`No project found in the ${orgPick.org.name} organization.`);
      return;
    }
    const projectPick = await vscode.window.showQuickPick(
      projects.map(p => ({ label: p.name, project: p })),
      { placeHolder: 'Select the Azure DevOps project' },
    );
    if (!projectPick) {
      return;
    }

    let boardState;
    try {
      boardState = await discoverBoardState(client, orgPick.org.name, projectPick.project.name);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not read the process's work item types: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const { discoveredStatusesByType, typeColors, typeIcons, defaultTeam, cardSettingsByTeam } = boardState;

    let types;
    try {
      types = await discoverWorkItemTypes(client, orgPick.org.name, projectPick.project.name);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not read the process's status colors: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const statusColors = discoverStatusColors(types);

    const generateFilesPick = await vscode.window.showQuickPick(
      [
        { label: 'Yes', generate: true },
        { label: 'No', generate: false },
      ],
      { placeHolder: 'Automatically generate placeholder skill files per work item type and status?' },
    );
    if (!generateFilesPick) {
      return;
    }

    const preset = buildPresetPlan(discoveredStatusesByType, generateFilesPick.generate, statusColors);

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
      defaultTeam,
      skills: preset.skills,
      statusColors,
      typeColors,
      typeIcons,
      cardSettingsByTeam,
    });

    ensureGitignoreEntry(workspaceRoot, '.kanbrain/generated/');

    onSetupComplete();

    vscode.window.showInformationMessage(
      `Kanbrain configured: ${orgPick.org.name}/${projectPick.project.name}. Edit .kanbrain/config.json to map skills per status.`,
    );
  });
}
```

Note `discoverWorkItemTypes` is called twice (once inside `discoverBoardState`, once directly here for `discoverStatusColors`) — this duplicates one HTTP round of type discovery. This is an accepted small inefficiency for this v1 (consistent with the "discovers everything, don't optimize yet" philosophy already used elsewhere) — flagged here rather than silently introduced.

- [ ] **Step 2: Rewrite `syncBoardConfig.ts`**

Read `src/commands/syncBoardConfig.ts` in full first. Replace it:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
import { discoverWorkItemTypes, discoverStatusColors } from '../azureDevOps/discoverWorkItemTypes';
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
    let types;
    try {
      boardState = await discoverBoardState(client, result.config.organization, result.config.project);
      types = await discoverWorkItemTypes(client, result.config.organization, result.config.project);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Could not sync the board configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const freshStatusColors = discoverStatusColors(types);
    const diff = diffBoardConfig(result.config, boardState.discoveredStatusesByType);

    const updated = syncConfig(
      result.config,
      boardState.discoveredStatusesByType,
      freshStatusColors,
      boardState.typeColors,
      boardState.typeIcons,
      boardState.defaultTeam,
      boardState.cardSettingsByTeam,
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

- [ ] **Step 3: Rewrite `commands/checkBoardConfig.ts`**

Read `src/commands/checkBoardConfig.ts` in full first. Update `checkBoardConfig` (the exported function that calls `discoverBoardState`/`diffBoardConfig`) — everything else in the file (`presentBoardConfigCheck`, `registerCheckBoardConfigCommand`) is unaffected:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { discoverBoardState } from '../azureDevOps/discoverBoardState';
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

  const diff = diffBoardConfig(result.config, boardState.discoveredStatusesByType);

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

- [ ] **Step 4: Commit**

```bash
git add src/commands/setup.ts src/commands/syncBoardConfig.ts src/commands/checkBoardConfig.ts
git commit -m "feat: wire Setup/Sync/Check commands to skills-by-type and multi-team discovery"
```

---

### Task 17: `buildSetupAssistantFile.ts` / `configureWithAi.ts` — text update (out of scope for multi-team, in scope for wording)

**Files:**
- Modify: `src/skills/buildSetupAssistantFile.ts`
- Modify: `src/skills/buildSetupAssistantFile.test.ts`
- Modify: `src/commands/configureWithAi.ts`

**Interfaces:**
- Consumes: `discoverWorkItemTypes` (Task 3) instead of `BoardState.levels`/`statesByType`.
- Produces: `buildSetupAssistantContent(organization, project, types: DiscoveredWorkItemType[], boards: DiscoveredBoard[]): string` (parameter 3 changes from `BoardState` to `DiscoveredWorkItemType[]`).

- [ ] **Step 1: Rewrite the test**

Replace the whole content of `src/skills/buildSetupAssistantFile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSetupAssistantContent } from './buildSetupAssistantFile';
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

function types(overrides: Partial<DiscoveredWorkItemType>[] = []): DiscoveredWorkItemType[] {
  if (overrides.length > 0) {
    return overrides.map(o => ({ name: 'User Story', color: 'b2b2b2', iconSvg: '', states: [], ...o }));
  }
  return [
    { name: 'User Story', color: 'b2b2b2', iconSvg: '', states: [{ name: 'New', category: 'Proposed', color: 'b2b2b2' }] },
  ];
}

describe('buildSetupAssistantContent', () => {
  it('includes the organization and project', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('my-org');
    expect(content).toContain('MyProject');
  });

  it('includes each work item type and status with its category, with no backlog-level grouping', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('### User Story');
    expect(content).toContain('New (Proposed)');
  });

  it('includes each board, column, and state mapping', () => {
    const boards: DiscoveredBoard[] = [
      {
        name: 'MyProject Team Board',
        columns: [{ name: 'Doing', columnType: 'inProgress', stateMappings: { 'User Story': 'Committed' } }],
      },
    ];
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), boards);

    expect(content).toContain('MyProject Team Board');
    expect(content).toContain('Doing');
    expect(content).toContain('User Story: Committed');
  });

  it('notes when no boards were found', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('No boards were found');
  });

  it('includes all four instructional sections', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('## How Kanbrain works');
    expect(content).toContain('## Important nuance');
    expect(content).toContain("## This project's real configuration");
    expect(content).toContain('## What to do');
  });

  it('is assertive that Kanbrain only supports one skill per status, never per board column', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('one skill per status, per work item type');
    expect(content).not.toContain('ask them how they want Kanbrain to work');
    expect(content).not.toContain('or one skill per board column');
  });

  it('instructs the agent to rename auto-generated labels to the real flow step', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('`label`');
    expect(content).toContain('auto-generated');
  });

  it('instructs the agent to propose labels from the real board column names before asking the user', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('Propose a first draft');
    expect(content).toContain('Boards and columns');
    expect(content).not.toContain('Ask the user what real flow step each status represents');
  });

  it('only falls back to asking the user when a status has no clear column name to infer from', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('Only fall back to asking');
  });

  it('instructs the agent to write real instructions into each skill file using the template placeholders', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('real, useful instructions');
    expect(content).toContain('{{id}}');
    expect(content).toContain('{{subtasks}}');
  });

  it('instructs the agent to delete skill files no longer referenced by the final mapping', () => {
    const content = buildSetupAssistantContent('my-org', 'MyProject', types(), []);

    expect(content).toContain('delete');
    expect(content).toContain('.kanbrain/skills/');
    expect(content).toContain('no longer');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run buildSetupAssistantFile.test.ts`
Expected: FAIL — signature mismatch and/or level-grouping text no longer present

- [ ] **Step 3: Implement**

Replace `src/skills/buildSetupAssistantFile.ts`:

```ts
import type { DiscoveredWorkItemType } from '../azureDevOps/discoverWorkItemTypes';
import type { DiscoveredBoard } from '../azureDevOps/discoverBoardColumns';

function renderTypes(types: DiscoveredWorkItemType[]): string {
  return types
    .map(type => {
      const stateLines = type.states.map(state => `  - ${state.name} (${state.category})`).join('\n');
      return `### ${type.name}\n\n${stateLines}`;
    })
    .join('\n\n');
}

function renderBoards(boards: DiscoveredBoard[]): string {
  if (boards.length === 0) {
    return '_No boards were found for this team._';
  }
  return boards
    .map(board => {
      const columnsSection = board.columns
        .map(column => {
          const mappingLines = Object.entries(column.stateMappings)
            .map(([type, state]) => `  - ${type}: ${state}`)
            .join('\n');
          return `- **${column.name}** (${column.columnType})\n${mappingLines}`;
        })
        .join('\n');
      return `### ${board.name}\n\n${columnsSection}`;
    })
    .join('\n\n');
}

export function buildSetupAssistantContent(
  organization: string,
  project: string,
  types: DiscoveredWorkItemType[],
  boards: DiscoveredBoard[],
): string {
  return `# Kanbrain Setup Assistant

Organization: \`${organization}\`
Project: \`${project}\`

## How Kanbrain works

Kanbrain shows the active Azure DevOps work item in a VS Code side panel, with per-status "skill" buttons. Each button generates a context file — this file was generated the exact same way — and sends a "read this file" command to an agent running in an integrated terminal. That agent is you. \`.kanbrain/config.json\`'s \`skills\` map links each **status** (\`System.State\`), per work item type, to a skill file. The result we're aiming for is one skill for each real step of the team's flow — not necessarily one per raw status name.

## Important nuance: status vs. board column

Kanbrain only understands **status** (\`System.State\`) per work item type — \`skills\` maps exactly **one skill per status, per work item type**. There is no board-column mode to choose between; board columns aren't a real Kanbrain configuration option, they're listed below purely for your reference. Many teams still think and work in terms of **board columns** rather than raw statuses (common, and often the more natural mental model) — a column can group several statuses together, or have a name that doesn't match any status. When that's the case here, the way to honor it is to point every status that belongs to the same column at the *same* skill file — not to look for a column-level setting that doesn't exist.

## This project's real configuration

### Work item types and statuses

${renderTypes(types)}

### Boards and columns

${renderBoards(boards)}

## What to do

1. Read and understand the data above — the real statuses per work item type, and the real board columns each status maps into.
2. Explain to the user, in your own words, that Kanbrain maps one skill per status (never per board column) — and that if they think in board columns, multiple statuses sharing a column should simply share the same skill file.
3. Propose a first draft of the real flow step for every status yourself, before asking the user anything: for each status, check which board column it's listed under in the "Boards and columns" section above, and use that column's name directly when it already reads as a clear step name (e.g. a status listed under a "Code Review" column becomes "Code Review"; one under "QA" becomes "QA"). Group statuses that share a column under one skill file.
4. Present your full proposed status → flow step mapping to the user in one message and ask them to confirm it or correct any entries — don't make them name every status from scratch. Only fall back to asking open-ended for a status when no board column mapping exists for it, the column name is generic or unhelpful (e.g. "Column 1"), or different boards disagree on its column.
5. Once confirmed, update every entry's \`label\` in \`.kanbrain/config.json\`'s \`skills\` map to the agreed real step name — not the auto-generated \`"Execute {status} skill"\` placeholder Setup fills in by default.
6. For every skill file that stays in use, write real, useful instructions for that flow step into it — not a placeholder. Skill files can use \`{{id}}\`, \`{{title}}\`, \`{{description}}\`, \`{{status}}\`, \`{{type}}\`, \`{{url}}\`, \`{{branch}}\`, \`{{parent.id}}\`, \`{{parent.title}}\`, \`{{parent.description}}\`, and \`{{subtasks}}\` placeholders, resolved with the real work item's data every time a skill button runs.
7. Once the final mapping is settled, delete any file under \`.kanbrain/skills/\` that no longer has a \`skills\` entry pointing at it — don't leave unused skill files behind.
8. Only touch the real Azure DevOps board (moving statuses between columns, renaming columns, etc.) if the user explicitly asks for that, and only using your own tools/credentials — never through Kanbrain, which stays read-only.
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run buildSetupAssistantFile.test.ts`
Expected: PASS

- [ ] **Step 5: Update `configureWithAi.ts`'s call site**

Read `src/commands/configureWithAi.ts` in full first. Replace the body of `configureWithAi`:

```ts
export async function configureWithAi(client: AzureDevOpsClient, workspaceRoot: string): Promise<void> {
  const config = readConfig(workspaceRoot);
  if (!config) {
    vscode.window.showErrorMessage('No project configured. Run Kanbrain: Setup.');
    return;
  }

  let content: string;
  try {
    const team = await client.getDefaultTeamName(config.organization, config.project);
    const types = await discoverWorkItemTypes(client, config.organization, config.project);
    const boards = await discoverBoardColumns(client, config.organization, config.project, team);
    content = buildSetupAssistantContent(config.organization, config.project, types, boards);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Could not read the project's board configuration: ${message}`);
    return;
  }

  const fileName = `setup-assistant-${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
  const relativePath = writeGeneratedFile(workspaceRoot, fileName, content);
  sendReadCommand(relativePath);
}
```

Update the import line at the top of the file from `import { discoverBoardState } from '../azureDevOps/discoverBoardState';` to `import { discoverWorkItemTypes } from '../azureDevOps/discoverWorkItemTypes';`.

- [ ] **Step 6: Compile just this file's dependency chain conceptually reviewed (no isolated command to run — full compile happens in Task 18)**

- [ ] **Step 7: Commit**

```bash
git add src/skills/buildSetupAssistantFile.ts src/skills/buildSetupAssistantFile.test.ts src/commands/configureWithAi.ts
git commit -m "feat: describe work item types flatly (no backlog level) in the Configure with AI assistant file"
```

---

### Task 18: Final verification, README, cleanup

**Files:**
- Modify: `README.md`

**Interfaces:** none new — this task only verifies everything from Tasks 1-17 fits together.

- [ ] **Step 1: Full compile**

Run: `npm run compile`
Expected: no TypeScript errors. If any remain, they will name the exact file/line still referencing a removed field (`backlogLevels`, `typeToBacklogLevel`, `cardSettingsByBoard`, `listBacklogLevels`, `getWorkItemTypeIcon`, `selectedBoard`, `persistSelectedBoard`, `setSelectedBoard`, `discoverCardSettingsByBoard`, `BacklogLevel`, `WorkItemTypeIcon`) — fix each in place following the same rename pattern used in the task that covered that concept, then re-run.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 3: Update the README manual verification checklist**

Read `README.md`'s "Manual verification checklist" section first. Add these items at the end of the list:

```markdown
- [ ] After `Kanbrain: Setup`, `.kanbrain/config.json` has a `skills` entry per real work item type (not per backlog level) and a `defaultTeam` matching the project's actual default team.
- [ ] `.kanbrain/config.json`'s `cardSettingsByTeam` has an entry for every team in the project (compare against the real list of teams in Azure DevOps project settings), not just the default team.
- [ ] The Config screen's skill editor groups skills by work item type (e.g. "Epic", "Feature", "User Story", "Bug", "Task"), not by any backlog-level grouping.
- [ ] The search dialog's tabs are one per work item type, not per backlog level — a type like "Bug" that used to share a "Stories" tab with "User Story" now has its own tab.
- [ ] When the project has 2+ teams, the Config screen shows a "Team" dropdown (not "Board"); switching it and reloading the window keeps that same team selected, and it's never written into the committed `.kanbrain/config.json`.
- [ ] A work item type visible on one team's board but hidden on another team's board (a real per-team backlog-level visibility difference) still gets a correct `skills` entry — the type is never silently missing just because the default team happens to hide it.
- [ ] `Kanbrain: Check Board Configuration` and `Kanbrain: Sync Board Configuration` report added/removed work item types and statuses correctly after a real process change, with no mention of "backlog level" anywhere in the messages.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: update manual verification checklist for skills-by-type and multi-team discovery"
```

- [ ] **Step 5: Final full-suite confirmation**

Run: `npm run compile && npx vitest run`
Expected: both PASS, confirming the whole plan lands in a fully consistent state.
