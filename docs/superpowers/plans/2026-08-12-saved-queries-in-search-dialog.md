# Saved Azure DevOps Queries in the Search Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user pick one of their Azure DevOps saved queries from a searchable combobox above the title input in the Kanbrain search dialog, and have the resulting work item list combine with whatever text is currently typed in the existing title search box.

**Architecture:** A new pair of pure functions (`filterWorkItemsByText`, `countItemsByType`) let the extension host combine a saved query's results with the existing text filter entirely in memory — no new WIQL is generated for the combined case. Two new `AzureDevOpsClient` methods talk to Azure's `_apis/wit/queries` (list) and `_apis/wit/wiql/{id}` (execute by id) endpoints. A new render function produces the dropdown's HTML the same way `renderWorkItemHistory`/`renderSearchResults` already do. The combobox itself is a hand-rolled input+dropdown widget (no `<select>`), following the same trigger+floating-panel pattern already used for the global-skill menu, wired through two new webview messages (`load-saved-queries` / `saved-queries`) that mirror the existing `load-work-item-history` / `work-item-history` pair.

**Tech Stack:** TypeScript, VS Code Webview API, Vitest.

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-08-12-saved-queries-in-search-dialog-design.md`.
- Test command: `npm run test:unit` (vitest). Run scoped with `npx vitest run <path>` per task, full suite before each task's commit.
- There is no automated test coverage for `KanbrainViewProvider.ts`'s inline webview script or for its `onDidReceiveMessage`/message-posting wiring (no test file exists for this class) — those tasks are verified by `npm run compile` plus careful manual re-reading, the same standard already used for this file's existing untested code paths.
- `runSavedQuery` is only ever invoked for `queryType: 'flat'` queries — the UI never lets a `tree`/`oneHop` query become selectable (native `disabled` attribute on its `<button>`), so no code path needs to parse `workItemRelations`.
- When a saved query is active, `typeCounts` passed to `renderSearchResults` must be a **local** variable computed from the query's own (pre-text-filter) results — `this.typeCounts` (the whole-project cache used by the plain-text-search path) must never be written to from the query path, so clearing the query returns exactly to today's behavior.
- The saved-query combobox is added only to `renderSearchDialog()` in `render.ts`. The separate unstyled inline search markup at `render.ts` (the `!state.workItem` fallback on the Flow screen, asserted by the render.test.ts case "shows an inline search box when there is config but no active work item") is explicitly out of scope and must not be touched.

---

### Task 1: Foundational type and pure combine/count helpers

**Files:**
- Modify: `src/types.ts`
- Modify: `src/azureDevOps/wiql.ts`
- Test: `src/azureDevOps/wiql.test.ts`

**Interfaces:**
- Produces: `export interface SavedQuery { id: string; path: string; queryType: 'flat' | 'tree' | 'oneHop'; }` in `src/types.ts` — consumed by Task 2 (`AzureDevOpsClient.listQueries`/`runSavedQuery`) and Task 3 (`renderSavedQueryOptions`).
- Produces: `export function filterWorkItemsByText(items: WorkItem[], searchText: string): WorkItem[]` and `export function countItemsByType(items: WorkItem[]): Record<string, number>` in `src/azureDevOps/wiql.ts` — consumed by Task 5 (`KanbrainViewProvider.searchWorkItems`).

- [ ] **Step 1: Write the failing tests**

Add to `src/types.ts` first (needed so the test file below type-checks — this is a type-only addition, not itself under TDD):

```ts
export interface SavedQuery {
  id: string;
  path: string;
  queryType: 'flat' | 'tree' | 'oneHop';
}
```

Place it after the `RepositoryPathEntry`/`ProfileEntry` interfaces, before `KanbrainConfig`.

Replace the full contents of `src/azureDevOps/wiql.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { buildSearchQuery, buildTypeCountQuery, filterWorkItemsByText, countItemsByType } from './wiql';
import type { WorkItem } from '../types';

describe('buildSearchQuery', () => {
  it('returns a title-ordered query with no filter when search text is empty', () => {
    const query = buildSearchQuery('');
    expect(query).toContain('SELECT [System.Id] FROM WorkItems');
    expect(query).toContain('ORDER BY [System.ChangedDate] DESC');
    expect(query).not.toContain('CONTAINS');
  });

  it('filters by exact id when the search text is numeric', () => {
    const query = buildSearchQuery('482');
    expect(query).toContain('[System.Id] = 482');
    expect(query).not.toContain('CONTAINS');
  });

  it('filters by title CONTAINS when the search text is not numeric', () => {
    const query = buildSearchQuery('login bug');
    expect(query).toContain("[System.Title] CONTAINS 'login bug'");
  });

  it('escapes single quotes in the search text', () => {
    const query = buildSearchQuery("user's login");
    expect(query).toContain("CONTAINS 'user''s login'");
  });
});

describe('buildTypeCountQuery', () => {
  it('filters by a single work item type', () => {
    const query = buildTypeCountQuery(['Epic']);
    expect(query).toContain('SELECT [System.Id] FROM WorkItems');
    expect(query).toContain("[System.WorkItemType] IN ('Epic')");
    expect(query).not.toContain('CONTAINS');
    expect(query).not.toContain('ORDER BY');
  });

  it('filters by multiple work item types', () => {
    const query = buildTypeCountQuery(['User Story', 'Bug']);
    expect(query).toContain("[System.WorkItemType] IN ('User Story', 'Bug')");
  });

  it('escapes single quotes in type names', () => {
    const query = buildTypeCountQuery(["Tester's Task"]);
    expect(query).toContain("IN ('Tester''s Task')");
  });
});

function workItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'Fix login bug',
    description: '',
    status: 'Active',
    type: 'Bug',
    url: '',
    parentId: null,
    childIds: [],
    assignedTo: null,
    development: [],
    ...overrides,
  };
}

describe('filterWorkItemsByText', () => {
  it('returns all items unchanged when search text is empty', () => {
    const items = [workItem({ id: 1 }), workItem({ id: 2 })];
    expect(filterWorkItemsByText(items, '')).toEqual(items);
    expect(filterWorkItemsByText(items, '   ')).toEqual(items);
  });

  it('filters by exact id when the search text is numeric', () => {
    const items = [workItem({ id: 1, title: 'Fix login bug' }), workItem({ id: 2, title: 'Add logout button' })];
    expect(filterWorkItemsByText(items, '2')).toEqual([items[1]]);
  });

  it('filters by title substring, case-insensitively, when not numeric', () => {
    const items = [workItem({ id: 1, title: 'Fix Login Bug' }), workItem({ id: 2, title: 'Add logout button' })];
    expect(filterWorkItemsByText(items, 'login')).toEqual([items[0]]);
  });

  it('returns an empty array when nothing matches', () => {
    const items = [workItem({ id: 1, title: 'Fix login bug' })];
    expect(filterWorkItemsByText(items, 'nonexistent')).toEqual([]);
  });
});

describe('countItemsByType', () => {
  it('groups items by their type', () => {
    const items = [
      workItem({ id: 1, type: 'Bug' }),
      workItem({ id: 2, type: 'Bug' }),
      workItem({ id: 3, type: 'Task' }),
    ];
    expect(countItemsByType(items)).toEqual({ Bug: 2, Task: 1 });
  });

  it('returns an empty object for an empty list', () => {
    expect(countItemsByType([])).toEqual({});
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/azureDevOps/wiql.test.ts`
Expected: FAIL — `filterWorkItemsByText` and `countItemsByType` are not exported from `./wiql` yet (import error / undefined is not a function). The `buildSearchQuery`/`buildTypeCountQuery` tests keep passing (they're unchanged).

- [ ] **Step 3: Implement the two functions**

Add `import type { WorkItem } from '../types';` at the top of `src/azureDevOps/wiql.ts` (the file currently has no imports), and append at the end of the file:

```ts
export function filterWorkItemsByText(items: WorkItem[], searchText: string): WorkItem[] {
  const trimmed = searchText.trim();
  if (!trimmed) {
    return items;
  }
  if (/^\d+$/.test(trimmed)) {
    const id = Number(trimmed);
    return items.filter(item => item.id === id);
  }
  const needle = trimmed.toLowerCase();
  return items.filter(item => item.title.toLowerCase().includes(needle));
}

export function countItemsByType(items: WorkItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
  }
  return counts;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/azureDevOps/wiql.test.ts`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Run the full unit test suite and compile**

Run: `npm run compile && npm run test:unit`
Expected: both PASS — `SavedQuery` is a new exported type not yet consumed anywhere, so nothing else should break.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/azureDevOps/wiql.ts src/azureDevOps/wiql.test.ts
git commit -m "feat: add SavedQuery type and pure query-result combine/count helpers"
```

---

### Task 2: `AzureDevOpsClient.listQueries` and `runSavedQuery`

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Test: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: `SavedQuery` from `../types` (Task 1).
- Produces: `AzureDevOpsClient.listQueries(organization: string, project: string): Promise<SavedQuery[]>` and `AzureDevOpsClient.runSavedQuery(organization: string, project: string, queryId: string): Promise<number[]>` — consumed by Task 5 (`KanbrainViewProvider.loadSavedQueries`/`searchWorkItems`).

- [ ] **Step 1: Write the failing tests**

Add to `src/azureDevOps/client.test.ts`, inside the existing `describe('AzureDevOpsClient', ...)` block (after the `countWorkItemsByType`/empty-types tests, using the same `jsonResponse` helper already defined at the top of the file):

```ts
  it('lists saved queries, flattening nested folders into full paths', async () => {
    const tree = {
      value: [
        {
          id: 'folder-my',
          name: 'My Queries',
          isFolder: true,
          children: [{ id: 'q1', name: 'My Bugs', isFolder: false, queryType: 'flat' }],
        },
        {
          id: 'folder-shared',
          name: 'Shared Queries',
          isFolder: true,
          children: [
            {
              id: 'folder-team',
              name: 'Team X',
              isFolder: true,
              children: [{ id: 'q2', name: 'Sprint Board', isFolder: false }],
            },
            { id: 'q3', name: 'Bugs and Parents', isFolder: false, queryType: 'tree' },
          ],
        },
      ],
    };
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse(tree));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const queries = await client.listQueries('my-org', 'MyProject');

    expect(queries).toEqual([
      { id: 'q1', path: 'My Queries/My Bugs', queryType: 'flat' },
      { id: 'q2', path: 'Shared Queries/Team X/Sprint Board', queryType: 'flat' },
      { id: 'q3', path: 'Shared Queries/Bugs and Parents', queryType: 'tree' },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/queries?$depth=2&api-version=7.1',
      expect.anything(),
    );
  });

  it('runs a saved query by id and returns matched IDs', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ workItems: [{ id: 10 }, { id: 20 }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const ids = await client.runSavedQuery('my-org', 'MyProject', 'query-1');

    expect(ids).toEqual([10, 20]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/wiql/query-1?api-version=7.1&$top=50',
      expect.objectContaining({ method: 'POST' }),
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: FAIL — `client.listQueries is not a function` / `client.runSavedQuery is not a function`.

- [ ] **Step 3: Implement the two methods**

Add `import type { SavedQuery } from '../types';` to the top-of-file imports in `src/azureDevOps/client.ts` (alongside the existing `import type { AssignedTo, WorkItem, CardFieldSettings, PullRequestDetails, PullRequestDetail, PullRequestThread, PullRequestSummary } from '../types';`).

Add these two methods to the `AzureDevOpsClient` class, near `searchWorkItems`/`countWorkItemsByType`:

```ts
  async listQueries(organization: string, project: string): Promise<SavedQuery[]> {
    interface RawQueryNode {
      id: string;
      name: string;
      isFolder?: boolean;
      queryType?: string;
      children?: RawQueryNode[];
    }
    const data = await this.request<{ value: RawQueryNode[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/queries?$depth=2&api-version=7.1`,
    );
    const result: SavedQuery[] = [];
    const walk = (nodes: RawQueryNode[], parentPath: string) => {
      for (const node of nodes) {
        const path = parentPath ? `${parentPath}/${node.name}` : node.name;
        if (node.isFolder) {
          walk(node.children ?? [], path);
        } else {
          const queryType = node.queryType === 'tree' || node.queryType === 'oneHop' ? node.queryType : 'flat';
          result.push({ id: node.id, path, queryType });
        }
      }
    };
    walk(data.value, '');
    return result;
  }

  async runSavedQuery(organization: string, project: string, queryId: string): Promise<number[]> {
    const data = await this.request<{ workItems: { id: number }[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/wiql/${queryId}?api-version=7.1&$top=50`,
      { method: 'POST' },
    );
    return (data.workItems ?? []).map(w => w.id);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/azureDevOps/client.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Run the full unit test suite and compile**

Run: `npm run compile && npm run test:unit`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: add AzureDevOpsClient.listQueries and runSavedQuery"
```

---

### Task 3: `renderSavedQueryOptions`

**Files:**
- Create: `src/view/renderSavedQueryOptions.ts`
- Test: `src/view/renderSavedQueryOptions.test.ts`

**Interfaces:**
- Consumes: `SavedQuery` from `../types` (Task 1).
- Produces: `renderSavedQueryOptions(queries: SavedQuery[]): string` — consumed by Task 5 (`KanbrainViewProvider.loadSavedQueries`).

- [ ] **Step 1: Write the failing tests**

Create `src/view/renderSavedQueryOptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderSavedQueryOptions } from './renderSavedQueryOptions';
import type { SavedQuery } from '../types';

describe('renderSavedQueryOptions', () => {
  it('renders an empty state when there are no queries', () => {
    expect(renderSavedQueryOptions([])).toContain('No saved queries found.');
  });

  it('renders a flat query as a selectable, non-disabled option', () => {
    const queries: SavedQuery[] = [{ id: 'q1', path: 'Shared Queries/Bugs Abertos', queryType: 'flat' }];
    const html = renderSavedQueryOptions(queries);
    expect(html).toContain('data-action="select-query" data-id="q1" data-path="Shared Queries/Bugs Abertos"');
    expect(html).not.toContain('disabled');
    expect(html).toContain('Shared Queries/Bugs Abertos');
  });

  it('renders a tree query as disabled with a type badge', () => {
    const queries: SavedQuery[] = [{ id: 'q2', path: 'Shared Queries/Bugs and Parents', queryType: 'tree' }];
    const html = renderSavedQueryOptions(queries);
    expect(html).toContain('data-id="q2" data-path="Shared Queries/Bugs and Parents" disabled');
    expect(html).toContain('kb-query-type-badge');
    expect(html).toContain('tree');
  });

  it('renders a oneHop query as disabled', () => {
    const queries: SavedQuery[] = [{ id: 'q3', path: 'Shared Queries/Linked Items', queryType: 'oneHop' }];
    const html = renderSavedQueryOptions(queries);
    expect(html).toContain('data-id="q3" data-path="Shared Queries/Linked Items" disabled');
    expect(html).toContain('oneHop');
  });

  it('escapes HTML in the query path', () => {
    const queries: SavedQuery[] = [{ id: 'q4', path: '<script>alert(1)</script>', queryType: 'flat' }];
    const html = renderSavedQueryOptions(queries);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/view/renderSavedQueryOptions.test.ts`
Expected: FAIL — cannot find module `./renderSavedQueryOptions` (file doesn't exist yet).

- [ ] **Step 3: Implement the render function**

Create `src/view/renderSavedQueryOptions.ts`:

```ts
import type { SavedQuery } from '../types';
import { escapeHtml } from './escapeHtml';

export function renderSavedQueryOptions(queries: SavedQuery[]): string {
  if (queries.length === 0) {
    return '<div class="kb-empty">No saved queries found.</div>';
  }
  return queries
    .map(q => {
      const disabled = q.queryType !== 'flat';
      const badge = disabled ? `<span class="kb-query-type-badge">${escapeHtml(q.queryType)}</span>` : '';
      return `<button type="button" class="kb-query-option" data-action="select-query" data-id="${escapeHtml(q.id)}" data-path="${escapeHtml(q.path)}"${disabled ? ' disabled' : ''}>${escapeHtml(q.path)}${badge}</button>`;
    })
    .join('');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderSavedQueryOptions.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Run the full unit test suite and compile**

Run: `npm run compile && npm run test:unit`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderSavedQueryOptions.ts src/view/renderSavedQueryOptions.test.ts
git commit -m "feat: add renderSavedQueryOptions for the saved-query combobox dropdown"
```

---

### Task 4: Combobox markup in `renderSearchDialog`

**Files:**
- Modify: `src/view/render.ts`
- Test: `src/view/render.test.ts`

**Interfaces:**
- Produces: DOM ids `kb-query-filter-input`, `kb-query-clear-btn`, `kb-query-options` (all inside a `.kb-query-combobox` wrapper), present everywhere `kb-search-input` already is — consumed by Task 6 (webview JS) via `document.getElementById`.

This task is a pure markup/structure change with no new business logic — the existing `renderSearchDialog()` function's only job is to produce this HTML string, so "the test" here is asserting on that string, not TDD in the RED/GREEN sense of a new behavior. Still write the assertions first to confirm they fail against the current markup, per the project's established pattern of testing generated HTML by substring.

- [ ] **Step 1: Write the failing test**

Add to `src/view/render.test.ts`, immediately after the existing test at line ~324-329 (`'wraps the search section in an overlay dialog with a close button when there is an active work item'`):

```ts
  it('places the saved-query combobox above the title input inside the search dialog', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-query-filter-input"');
    expect(html).toContain('id="kb-query-clear-btn"');
    expect(html).toContain('id="kb-query-options"');
    expect(html.indexOf('kb-query-combobox')).toBeLessThan(html.indexOf('id="kb-search-input"'));
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/view/render.test.ts`
Expected: FAIL — none of the three new ids exist in the current markup, so all three `toContain` assertions fail (the file's other, unrelated tests keep passing).

- [ ] **Step 3: Update `renderSearchDialog`**

In `src/view/render.ts`, replace the `renderSearchDialog` function:

```ts
function renderSearchDialog(): string {
  return `
    <div id="kb-search-section" class="kb-search-overlay kb-hidden">
      <div class="kb-search-dialog">
        <div class="kb-search-dialog-header">
          <button id="kb-search-close-btn">✕</button>
        </div>
        <div class="kb-query-combobox">
          <input id="kb-query-filter-input" placeholder="Filter by saved query..." autocomplete="off">
          <button id="kb-query-clear-btn" class="kb-icon-btn kb-hidden" title="Clear query" aria-label="Clear query">✕</button>
          <div id="kb-query-options" class="kb-query-dropdown kb-hidden"></div>
        </div>
        <input id="kb-search-input" placeholder="Search by title or #id...">
        <div id="kb-search-results"></div>
      </div>
    </div>
  `;
}
```

(This moves `#kb-search-input` out of `.kb-search-dialog-header` — the header now holds only the close button — and inserts the combobox above it, matching the "select above the title input" requirement.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/view/render.test.ts`
Expected: PASS (all tests in the file, including the pre-existing ones — `kb-search-overlay`, `kb-search-dialog`, `id="kb-search-close-btn"`, `id="kb-search-input"`, `id="kb-search-results"` are all still present, just reordered).

- [ ] **Step 5: Run the full unit test suite and compile**

Run: `npm run compile && npm run test:unit`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts
git commit -m "feat: add saved-query combobox markup above the search dialog title input"
```

---

### Task 5: Backend wiring — `KanbrainViewProvider.ts` message handling and `searchWorkItems`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

No test file exists for this class (confirmed: no `KanbrainViewProvider*.test.ts` in the repo) — verification is `npm run compile` plus careful manual re-reading of the diff against the exact code below, the same standard already applied to this file's existing message-handling code.

**Interfaces:**
- Consumes: `filterWorkItemsByText`, `countItemsByType` from `./azureDevOps/wiql` (Task 1, relative path from `src/view/` is `../azureDevOps/wiql`); `client.listQueries`, `client.runSavedQuery` (Task 2); `renderSavedQueryOptions` from `./renderSavedQueryOptions` (Task 3).
- Produces: webview message `{ type: 'saved-queries', html: string }` posted in response to `{ type: 'load-saved-queries' }`; `searchWorkItems(query: string, queryId?: string)` (was `searchWorkItems(query: string)`) — the `queryId` parameter is consumed by Task 6's webview JS via the message it sends (`{ type: 'search-work-items', query, queryId }`).

- [ ] **Step 1: Add imports**

At the top of `src/view/KanbrainViewProvider.ts`, change:

```ts
import { renderWorkItemHistory } from './renderWorkItemHistory';
```

to:

```ts
import { renderWorkItemHistory } from './renderWorkItemHistory';
import { renderSavedQueryOptions } from './renderSavedQueryOptions';
import { filterWorkItemsByText, countItemsByType } from '../azureDevOps/wiql';
```

- [ ] **Step 2: Route the two message types**

In `resolveWebviewView`'s `onDidReceiveMessage` handler, change:

```ts
      } else if (message.type === 'search-work-items') {
        await this.searchWorkItems(String(message.query ?? ''));
      } else if (message.type === 'pick-work-item') {
```

to:

```ts
      } else if (message.type === 'search-work-items') {
        await this.searchWorkItems(String(message.query ?? ''), message.queryId ? String(message.queryId) : undefined);
      } else if (message.type === 'pick-work-item') {
```

Then, right after the existing `load-work-item-history` branch:

```ts
      } else if (message.type === 'load-work-item-history') {
        await this.loadWorkItemHistory();
      } else if (message.type === 'run-setup') {
```

add a new branch between them:

```ts
      } else if (message.type === 'load-work-item-history') {
        await this.loadWorkItemHistory();
      } else if (message.type === 'load-saved-queries') {
        await this.loadSavedQueries();
      } else if (message.type === 'run-setup') {
```

- [ ] **Step 3: Rewrite `searchWorkItems` to accept and combine a saved query**

Replace the full `searchWorkItems` method:

```ts
  private async searchWorkItems(query: string): Promise<void> {
    if (!this.view || !this.workspaceRoot || !this.client) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    let html: string;
    try {
      if (query.trim() === '') {
        this.typeCounts = await this.fetchTypeCounts(this.client, config);
      }
      const ids = await this.client.searchWorkItems(config.organization, config.project, query);
      const items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      const avatars = config.showAssignedTo !== false ? await this.resolveAvatars(items) : {};
      html = renderSearchResults(items, config, this.typeCounts, avatars);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      html = `<div class="kb-empty">Erro ao buscar work items: ${escapeHtml(message)}</div>`;
    }

    this.view.webview.postMessage({ type: 'search-results', html });
  }
```

with:

```ts
  private async searchWorkItems(query: string, queryId?: string): Promise<void> {
    if (!this.view || !this.workspaceRoot || !this.client) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    let html: string;
    try {
      let items: WorkItem[];
      let typeCounts: Record<string, number>;
      if (queryId) {
        const ids = await this.client.runSavedQuery(config.organization, config.project, queryId);
        const queryItems = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
        typeCounts = countItemsByType(queryItems);
        items = filterWorkItemsByText(queryItems, query);
      } else {
        if (query.trim() === '') {
          this.typeCounts = await this.fetchTypeCounts(this.client, config);
        }
        const ids = await this.client.searchWorkItems(config.organization, config.project, query);
        items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
        typeCounts = this.typeCounts;
      }
      const avatars = config.showAssignedTo !== false ? await this.resolveAvatars(items) : {};
      html = renderSearchResults(items, config, typeCounts, avatars);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      html = `<div class="kb-empty">Erro ao buscar work items: ${escapeHtml(message)}</div>`;
    }

    this.view.webview.postMessage({ type: 'search-results', html });
  }
```

Note the `typeCounts` local variable in the `queryId` branch is never assigned to `this.typeCounts` — that field is only ever written in the no-query, empty-text branch, exactly as today.

- [ ] **Step 4: Add `loadSavedQueries`**

Find the boundary between `loadWorkItemHistory` and `getActiveWorkItemId`:

```ts
  getActiveWorkItemId(): number | undefined {
    return this.activeWorkItemId;
  }
```

Insert the new method directly above it (i.e., right after `loadWorkItemHistory`'s closing `}`, before `getActiveWorkItemId`):

```ts
  private async loadSavedQueries(): Promise<void> {
    if (!this.view || !this.workspaceRoot || !this.client) return;
    const config = readConfig(this.workspaceRoot);
    if (!config) return;
    try {
      const queries = await this.client.listQueries(config.organization, config.project);
      this.view.webview.postMessage({ type: 'saved-queries', html: renderSavedQueryOptions(queries) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.view.webview.postMessage({
        type: 'saved-queries',
        html: `<div class="kb-empty">Error loading queries: ${escapeHtml(message)}</div>`,
      });
    }
  }
```

- [ ] **Step 5: Compile and run the full unit test suite**

Run: `npm run compile && npm run test:unit`
Expected: both PASS. `npm run compile` is the primary signal for this task (TypeScript will catch a mismatched signature, a missing import, or a typo in a property name); the unit suite passing confirms nothing else in the codebase broke (no other file references `searchWorkItems`'s old single-argument shape in a way that fails to compile — it's an added optional parameter, so existing single-argument call sites, if any, remain valid).

- [ ] **Step 6: Manual self-review of the diff**

Before committing, re-read the full diff of this task and confirm:
- `searchWorkItems`'s `queryId` branch never assigns to `this.typeCounts`.
- The `load-saved-queries` branch was inserted between `load-work-item-history` and `run-setup`, not duplicated or misplaced elsewhere in the `onDidReceiveMessage` chain.
- `loadSavedQueries` follows the exact same guard-clause/try-catch shape as `loadWorkItemHistory` immediately above it.

- [ ] **Step 7: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: wire search-work-items/load-saved-queries backend to combine saved queries with text search"
```

---

### Task 6: Combobox JS behavior and CSS — `KanbrainViewProvider.ts`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

Depends on Task 4 (the DOM ids `kb-query-filter-input`/`kb-query-clear-btn`/`kb-query-options` must exist in the rendered markup) and Task 5 (the `search-work-items` message must already accept `queryId` and `load-saved-queries`/`saved-queries` must already be wired, or this task's messages are no-ops). No automated test coverage for this file's inline webview script — verified by `npm run compile` and manual re-reading, same as Task 1 of the prior sidebar-ux-polish plan (`docs/superpowers/plans/2026-08-12-sidebar-ux-polish.md`), which used this exact standard for the same file.

**Interfaces:**
- Consumes: DOM ids from Task 4; message types `saved-queries` (Task 5) and `search-work-items` with `queryId` (Task 5).

- [ ] **Step 1: Replace the `#kb-search-input` listener with `triggerSearch`, and add combobox state/listeners**

Find, in the inline `<script>` string:

```ts
    const searchInput = document.getElementById('kb-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        vscode.postMessage({ type: 'search-work-items', query: e.target.value });
      });
    }
```

Replace with:

```ts
    const searchInput = document.getElementById('kb-search-input');
    const queryFilterInput = document.getElementById('kb-query-filter-input');
    const queryClearBtn = document.getElementById('kb-query-clear-btn');
    const queryOptions = document.getElementById('kb-query-options');
    let activeQueryId = null;

    function closeQueryDropdown() {
      if (queryOptions) queryOptions.classList.add('kb-hidden');
    }

    function triggerSearch() {
      vscode.postMessage({ type: 'search-work-items', query: searchInput ? searchInput.value : '', queryId: activeQueryId || undefined });
    }

    if (searchInput) {
      searchInput.addEventListener('input', triggerSearch);
    }

    if (queryFilterInput) {
      queryFilterInput.addEventListener('focus', () => queryOptions && queryOptions.classList.remove('kb-hidden'));
      queryFilterInput.addEventListener('input', () => {
        const needle = queryFilterInput.value.trim().toLowerCase();
        if (queryOptions) {
          queryOptions.classList.remove('kb-hidden');
          queryOptions.querySelectorAll('.kb-query-option').forEach((opt) => {
            opt.hidden = needle !== '' && !opt.dataset.path.toLowerCase().includes(needle);
          });
        }
      });
      queryFilterInput.addEventListener('blur', () => {
        setTimeout(() => {
          const activeOption = activeQueryId
            ? queryOptions && queryOptions.querySelector('[data-id="' + activeQueryId + '"]')
            : null;
          queryFilterInput.value = activeOption ? activeOption.dataset.path : '';
        }, 150);
      });
    }

    if (queryClearBtn) {
      queryClearBtn.addEventListener('click', () => {
        activeQueryId = null;
        if (queryFilterInput) queryFilterInput.value = '';
        queryClearBtn.classList.add('kb-hidden');
        triggerSearch();
      });
    }
```

(The `blur` handler's 150ms delay lets a `select-query` click on a dropdown option — added in Step 2 below — update `activeQueryId` and the input's value first; without the delay, the click's own value-setting could be immediately overwritten by the blur revert, since `blur` fires before `click` in the browser's event order.)

- [ ] **Step 2: Reset the combobox when the dialog opens, and select a query on click**

Find:

```ts
      if (target.id === 'kb-toggle-search-btn' || target.id === 'kb-footer-select-work-item-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          const wasHidden = section.classList.contains('kb-hidden');
          section.classList.toggle('kb-hidden');
          if (wasHidden) {
            vscode.postMessage({ type: 'search-work-items', query: '' });
            document.getElementById('kb-search-input')?.focus();
          }
        }
      } else if (target.id === 'kb-history-btn') {
```

Replace with:

```ts
      if (target.id === 'kb-toggle-search-btn' || target.id === 'kb-footer-select-work-item-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          const wasHidden = section.classList.contains('kb-hidden');
          section.classList.toggle('kb-hidden');
          if (wasHidden) {
            activeQueryId = null;
            if (queryFilterInput) queryFilterInput.value = '';
            if (queryClearBtn) queryClearBtn.classList.add('kb-hidden');
            closeQueryDropdown();
            vscode.postMessage({ type: 'search-work-items', query: '' });
            vscode.postMessage({ type: 'load-saved-queries' });
            document.getElementById('kb-search-input')?.focus();
          }
        }
      } else if (target.id === 'kb-history-btn') {
```

Find (the `open-work-item-detail` click branch already added by the prior sidebar-ux-polish plan):

```ts
      } else if (target.dataset && target.dataset.action === 'open-work-item-detail') {
        vscode.postMessage({ type: 'open-work-item-detail', id: target.dataset.id });
      } else if (target.closest && target.closest('a.kb-repo-tag-unmapped')) {
```

Insert a new branch between them:

```ts
      } else if (target.dataset && target.dataset.action === 'open-work-item-detail') {
        vscode.postMessage({ type: 'open-work-item-detail', id: target.dataset.id });
      } else if (target.closest && target.closest('[data-action="select-query"]')) {
        const option = target.closest('[data-action="select-query"]');
        activeQueryId = option.dataset.id;
        if (queryFilterInput) queryFilterInput.value = option.dataset.path;
        closeQueryDropdown();
        if (queryClearBtn) queryClearBtn.classList.remove('kb-hidden');
        triggerSearch();
      } else if (target.closest && target.closest('a.kb-repo-tag-unmapped')) {
```

- [ ] **Step 3: Close the dropdown on outside click**

Find:

```ts
      if (
        (!target.closest || !target.closest('[data-action="toggle-global-skill-menu"]')) &&
        (!target.closest || !target.closest('.kb-global-skill-menu'))
      ) {
        closeAllGlobalSkillMenus();
      }
    });
```

Replace with:

```ts
      if (
        (!target.closest || !target.closest('[data-action="toggle-global-skill-menu"]')) &&
        (!target.closest || !target.closest('.kb-global-skill-menu'))
      ) {
        closeAllGlobalSkillMenus();
      }

      if (!target.closest || !target.closest('.kb-query-combobox')) {
        closeQueryDropdown();
      }
    });
```

- [ ] **Step 4: Handle the `saved-queries` message**

Find:

```ts
      } else if (event.data.type === 'work-item-history') {
        const results = document.getElementById('kb-history-results');
        if (results) results.innerHTML = event.data.html;
      } else if (event.data.type === 'skill-file-picked') {
```

Replace with:

```ts
      } else if (event.data.type === 'work-item-history') {
        const results = document.getElementById('kb-history-results');
        if (results) results.innerHTML = event.data.html;
      } else if (event.data.type === 'saved-queries') {
        if (queryOptions) queryOptions.innerHTML = event.data.html;
      } else if (event.data.type === 'skill-file-picked') {
```

- [ ] **Step 5: Add the CSS**

In the `css()` method's template string, find (the search-input rule that today lives inside `.kb-search-dialog-header`'s styling area, and the header rule itself):

```ts
      .kb-search-dialog-header { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
```

Replace with:

```ts
      .kb-search-dialog-header { display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-shrink: 0; }
      .kb-query-combobox { position: relative; margin-bottom: 6px; display: flex; align-items: center; gap: 4px; }
      #kb-query-filter-input { box-sizing: border-box; width: 100%; flex: 1; padding: 4px 6px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); }
      #kb-query-filter-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      .kb-query-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 50; margin-top: 2px; display: flex; flex-direction: column; gap: 2px; padding: 4px; max-height: 200px; overflow-y: auto; background: var(--vscode-dropdown-background); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3); }
      .kb-query-option { width: 100%; box-sizing: border-box; text-align: left; padding: 4px 6px; background: none; border: none; border-radius: 2px; color: var(--vscode-dropdown-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .kb-query-option:hover { background: var(--vscode-list-hoverBackground); }
      .kb-query-option:disabled { opacity: 0.5; cursor: default; }
      .kb-query-option:disabled:hover { background: none; }
      .kb-query-type-badge { margin-left: 4px; font-size: 10px; opacity: 0.7; }
```

- [ ] **Step 6: Compile and run the full unit test suite**

Run: `npm run compile && npm run test:unit`
Expected: both PASS.

- [ ] **Step 7: Manual self-review of the diff**

Re-read the full diff of this task and confirm:
- `queryFilterInput`/`queryClearBtn`/`queryOptions` are looked up once, near `searchInput`, and reused by all the new listeners (no re-`getElementById` inside handlers).
- The dialog-open reset (Step 2) clears `activeQueryId` and the combobox's visible state every time the dialog transitions from hidden to visible — never on other clicks.
- The `select-query` branch (Step 2) sits in the `click` delegation chain such that `target.closest('[data-action="select-query"]')` cannot also match `[data-action="open-work-item-detail"]`'s elements (they're different elements: the query option `<button>` vs. the card title `<div>`).
- `.kb-search-dialog-header`'s new `justify-content: flex-end` doesn't visually orphan the close button now that it's the row's only child (a single flex child with `justify-content: flex-end` sits flush right, matching the design's intent of "close button alone in the header, aligned right").

- [ ] **Step 8: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: implement saved-query combobox filtering, selection, and clearing in the search dialog"
```
