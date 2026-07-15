# Backlog Level Tabs in the Search Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tab bar to the "Trocar work item" search dialog — "Todos" plus one tab per backlog level (Epics/Features/Stories/Tasks, in the project's real order) — so results can be filtered by backlog level without leaving the dialog.

**Architecture:** The item *list* under each tab stays a client-side filter of the single search batch already fetched today (max 50 items, ordered by `ChangedDate DESC`) — switching tabs is instant, no new request. The *count* shown in each backlog level tab's label is a separate, one-time-per-dialog-open value: the true total number of that backlog level's items in the whole project, fetched via one WIQL count query per level (WIQL has no `COUNT`/`GROUP BY`, so this means N small id-only queries) only when the search text is empty (dialog opening or cleared), cached on the provider instance, and reused unchanged while the user types a search.

**Tech Stack:** TypeScript, Vitest (`npm run test:unit`), `tsc` (`npm run compile`).

## Global Constraints

- Level tab counts reflect the total project count for that backlog level, not how many of the current search's items match — they do not change while typing, only when the dialog is opened or cleared (search text becomes `''`).
- The "Todos" tab count is the size of the currently fetched batch (`items.length`, capped at 50) — this one *does* change as you type, same as today's implicit behavior.
- When `config.backlogLevels` is empty (config predates this field), no tab bar is rendered at all — output is identical to before this feature.
- A backlog level tab with count 0 stays visible (dimmed via the `kb-search-tab-empty` class), not hidden.
- No debounce is added to the search input — level counts are no longer computed per keystroke, so per-keystroke request volume is unchanged from before this feature.
- Tab order follows `Object.keys(config.backlogLevels)` — the same order already captured during `Kanbrain: Setup`, no new ordering config.

---

### Task 1: Add `buildTypeCountQuery` to the WIQL query builder

**Files:**
- Modify: `src/azureDevOps/wiql.ts`
- Modify: `src/azureDevOps/wiql.test.ts`

**Interfaces:**
- Produces: `buildTypeCountQuery(types: string[]): string` — exported from `src/azureDevOps/wiql.ts`. Builds a WIQL query selecting `[System.Id]` for the current project, filtered to `[System.WorkItemType] IN (<types>)`, with no title filter and no `ORDER BY`. Task 2 consumes this.

- [ ] **Step 1: Write the failing test**

Add to `src/azureDevOps/wiql.test.ts` (after the existing `buildSearchQuery` describe block):

```ts
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
```

Also update the import line at the top of the file:

```ts
import { buildSearchQuery } from './wiql';
```

to:

```ts
import { buildSearchQuery, buildTypeCountQuery } from './wiql';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- wiql`
Expected: FAIL — `buildTypeCountQuery` is not exported from `./wiql` (TypeScript/module resolution error).

- [ ] **Step 3: Write minimal implementation**

In `src/azureDevOps/wiql.ts`, add below `buildSearchQuery`:

```ts
export function buildTypeCountQuery(types: string[]): string {
  const escapedTypes = types.map(t => `'${t.replace(/'/g, "''")}'`).join(', ');
  return `${BASE_QUERY} AND [System.WorkItemType] IN (${escapedTypes})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- wiql`
Expected: PASS (7 tests total in the file: 4 existing + 3 new)

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/wiql.ts src/azureDevOps/wiql.test.ts
git commit -m "feat: add a WIQL query builder for counting work items by type"
```

---

### Task 2: Add `countWorkItemsByType` to `AzureDevOpsClient`

**Files:**
- Modify: `src/azureDevOps/client.ts`
- Modify: `src/azureDevOps/client.test.ts`

**Interfaces:**
- Consumes: `buildTypeCountQuery(types: string[]): string` from Task 1.
- Produces: `AzureDevOpsClient.countWorkItemsByType(organization: string, project: string, types: string[]): Promise<number>`. Returns `0` without calling `fetch` when `types` is empty. Task 4 consumes this.

- [ ] **Step 1: Write the failing test**

Add to `src/azureDevOps/client.test.ts`, inside the `describe('AzureDevOpsClient', ...)` block (after the `'searches work items and returns matched IDs'` test):

```ts
  it('counts work items by type without fetching full details', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ workItems: [{ id: 1 }, { id: 2 }, { id: 3 }] }));
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const count = await client.countWorkItemsByType('my-org', 'MyProject', ['Epic']);

    expect(count).toBe(3);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://dev.azure.com/my-org/MyProject/_apis/wit/wiql?api-version=7.1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns 0 without calling fetch when types is empty', async () => {
    const fetchImpl = vi.fn();
    const client = new AzureDevOpsClient({ fetchImpl, getToken: async () => 'tok' });

    const count = await client.countWorkItemsByType('my-org', 'MyProject', []);

    expect(count).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- client`
Expected: FAIL — `client.countWorkItemsByType is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `src/azureDevOps/client.ts`, update the import on line 2:

```ts
import { buildSearchQuery } from './wiql';
```

to:

```ts
import { buildSearchQuery, buildTypeCountQuery } from './wiql';
```

Then add a new method to `AzureDevOpsClient`, right after `searchWorkItems`:

```ts
  async countWorkItemsByType(organization: string, project: string, types: string[]): Promise<number> {
    if (types.length === 0) {
      return 0;
    }
    const query = buildTypeCountQuery(types);
    const data = await this.request<{ workItems: { id: number }[] }>(
      `https://dev.azure.com/${organization}/${project}/_apis/wit/wiql?api-version=7.1`,
      { method: 'POST', body: JSON.stringify({ query }) },
    );
    return data.workItems.length;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- client`
Expected: PASS (14 tests total in the file: 12 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/client.ts src/azureDevOps/client.test.ts
git commit -m "feat: add countWorkItemsByType to AzureDevOpsClient"
```

---

### Task 3: Render a tab bar and per-backlog-level panels in `renderSearchResults`

**Files:**
- Modify: `src/view/renderSearchResults.ts`
- Modify: `src/view/renderSearchResults.test.ts`

**Interfaces:**
- Consumes: `renderTypeAccent`, `groupByStatus`, `renderStatusDot`, `escapeHtml` (unchanged, already used in this file).
- Produces: `renderSearchResults(items: WorkItem[], config: KanbrainConfig, backlogLevelCounts: Record<string, number>): string` — signature gains a third, required parameter. Task 4 depends on this new signature. `backlogLevelCounts` maps a backlog level name (a key of `config.backlogLevels`) to its total project-wide item count; missing keys are treated as `0`.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/view/renderSearchResults.test.ts`:

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
    ...overrides,
  };
}

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

describe('renderSearchResults', () => {
  it('shows an empty message when there are no results', () => {
    expect(renderSearchResults([], config(), {})).toContain('Nenhum work item encontrado.');
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
    const html = renderSearchResults([workItem({ id: 482, title: 'Corrigir <bug>' })], config(), {});

    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('Corrigir &lt;bug&gt;');
    expect(html).not.toContain('Corrigir <bug>');
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

  it('renders no tab bar when there are no configured backlog levels', () => {
    const html = renderSearchResults([workItem()], config(), {});

    expect(html).not.toContain('kb-search-tabs');
  });

  it('renders a tab per backlog level, in config order, plus an "all" tab first', () => {
    const items = [workItem({ id: 1, type: 'Epic' }), workItem({ id: 2, type: 'Task' })];
    const html = renderSearchResults(
      items,
      config({ backlogLevels: { Epics: {}, Tasks: {} }, typeToBacklogLevel: { Epic: 'Epics', Task: 'Tasks' } }),
      { Epics: 3, Tasks: 7 },
    );

    const allIndex = html.indexOf('data-tab="all"');
    const epicsIndex = html.indexOf('data-tab="Epics"');
    const tasksIndex = html.indexOf('data-tab="Tasks"');

    expect(allIndex).toBeGreaterThanOrEqual(0);
    expect(epicsIndex).toBeGreaterThan(allIndex);
    expect(tasksIndex).toBeGreaterThan(epicsIndex);
    expect(html).toContain('Todos (2)');
  });

  it('shows the backlog level tab count from backlogLevelCounts, not from the filtered item list', () => {
    const items = [workItem({ id: 1, type: 'Epic' })];
    const html = renderSearchResults(
      items,
      config({ backlogLevels: { Epics: {} }, typeToBacklogLevel: { Epic: 'Epics' } }),
      { Epics: 12 },
    );

    expect(html).toContain('Epics (12)');
  });

  it('marks a backlog level tab as empty when its count is 0', () => {
    const html = renderSearchResults(
      [workItem({ type: 'Epic' })],
      config({ backlogLevels: { Epics: {}, Tasks: {} }, typeToBacklogLevel: { Epic: 'Epics' } }),
      { Epics: 5, Tasks: 0 },
    );

    expect(html).toContain('kb-search-tab-empty');
    expect(html).toContain('Tasks (0)');
  });

  it("scopes each backlog level panel to only that level's items", () => {
    const items = [workItem({ id: 1, type: 'Epic', title: 'An epic' }), workItem({ id: 2, type: 'Task', title: 'A task' })];
    const html = renderSearchResults(
      items,
      config({ backlogLevels: { Epics: {}, Tasks: {} }, typeToBacklogLevel: { Epic: 'Epics', Task: 'Tasks' } }),
      { Epics: 1, Tasks: 1 },
    );

    const epicsPanelStart = html.indexOf('data-tab-panel="Epics"');
    const tasksPanelStart = html.indexOf('data-tab-panel="Tasks"');
    const epicsPanel = html.slice(epicsPanelStart, tasksPanelStart);

    expect(epicsPanel).toContain('An epic');
    expect(epicsPanel).not.toContain('A task');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- renderSearchResults`
Expected: FAIL — TypeScript error (too many arguments to `renderSearchResults`, which still takes 2 params) and/or assertion failures for the new tab-related tests once it compiles loosely.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/view/renderSearchResults.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { groupByStatus } from './groupByStatus';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';

function renderStatusGroups(items: WorkItem[], config: KanbrainConfig): string {
  if (items.length === 0) {
    return '<div class="kb-empty">Nenhum work item encontrado.</div>';
  }

  return groupByStatus(items)
    .map(
      group => `
        <div class="kb-result-group">
          <button class="kb-section-label kb-group-toggle" data-action="toggle-group">${renderStatusDot(group.status, config.statusColors ?? {})}${escapeHtml(group.status)} (${group.items.length})</button>
          <div class="kb-group-items">
            ${group.items
              .map(item => {
                const { borderStyle, iconHtml } = renderTypeAccent(item.type, config);
                return `
                  <button class="kb-result-item" data-action="pick-work-item" data-id="${item.id}"${borderStyle}>${iconHtml}#${item.id} ${escapeHtml(item.title)}</button>
                `;
              })
              .join('')}
          </div>
        </div>
      `,
    )
    .join('');
}

export function renderSearchResults(items: WorkItem[], config: KanbrainConfig, backlogLevelCounts: Record<string, number>): string {
  if (items.length === 0) {
    return '<div class="kb-empty">Nenhum work item encontrado.</div>';
  }

  const levels = Object.keys(config.backlogLevels);
  if (levels.length === 0) {
    return renderStatusGroups(items, config);
  }

  const tabs = [
    { id: 'all', label: 'Todos', count: items.length, items },
    ...levels.map(level => ({
      id: level,
      label: level,
      count: backlogLevelCounts[level] ?? 0,
      items: items.filter(item => config.typeToBacklogLevel[item.type] === level),
    })),
  ];

  const tabBar = tabs
    .map(
      tab =>
        `<button class="kb-search-tab${tab.count === 0 ? ' kb-search-tab-empty' : ''}" data-action="select-tab" data-tab="${escapeHtml(tab.id)}">${escapeHtml(tab.label)} (${tab.count})</button>`,
    )
    .join('');

  const panels = tabs
    .map(tab => `<div class="kb-search-tab-panel" data-tab-panel="${escapeHtml(tab.id)}">${renderStatusGroups(tab.items, config)}</div>`)
    .join('');

  return `<div class="kb-search-tabs">${tabBar}</div>${panels}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- renderSearchResults`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add src/view/renderSearchResults.ts src/view/renderSearchResults.test.ts
git commit -m "feat: render a backlog level tab bar in search results"
```

---

### Task 4: Wire backlog level counts and tab switching into `KanbrainViewProvider`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `renderSearchResults(items: WorkItem[], config: KanbrainConfig, backlogLevelCounts: Record<string, number>): string` from Task 3; `AzureDevOpsClient.countWorkItemsByType(organization, project, types): Promise<number>` from Task 2.

There is no automated test for `KanbrainViewProvider` (requires the real VS Code API — per the project's existing pattern, webview wiring is verified with `npm run compile` plus the manual checklist in `README.md`, see Task 5). This task is verified by a successful `tsc` compile and the full unit suite still passing.

- [ ] **Step 1: Import `KanbrainConfig` and add the counts field**

In `src/view/KanbrainViewProvider.ts`, update the import on line 3:

```ts
import type { WorkItem } from '../types';
```

to:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
```

Add a new field next to `activeWorkItemId` (around line 22):

```ts
  private activeWorkItemId: number | undefined;
  private backlogLevelCounts: Record<string, number> = {};
```

- [ ] **Step 2: Fetch backlog level counts once per dialog open, and pass them to `renderSearchResults`**

Replace `searchWorkItems` (currently lines 63-83):

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
      const ids = await this.client.searchWorkItems(config.organization, config.project, query);
      const items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      html = renderSearchResults(filterSearchResults(items, query), config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      html = `<div class="kb-empty">Erro ao buscar work items: ${escapeHtml(message)}</div>`;
    }

    this.view.webview.postMessage({ type: 'search-results', html });
  }
```

with:

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
        this.backlogLevelCounts = await this.fetchBacklogLevelCounts(this.client, config);
      }
      const ids = await this.client.searchWorkItems(config.organization, config.project, query);
      const items = ids.length ? await this.client.getWorkItems(config.organization, config.project, ids) : [];
      html = renderSearchResults(filterSearchResults(items, query), config, this.backlogLevelCounts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      html = `<div class="kb-empty">Erro ao buscar work items: ${escapeHtml(message)}</div>`;
    }

    this.view.webview.postMessage({ type: 'search-results', html });
  }

  private async fetchBacklogLevelCounts(client: AzureDevOpsClient, config: KanbrainConfig): Promise<Record<string, number>> {
    const levels = Object.keys(config.backlogLevels);
    const entries = await Promise.all(
      levels.map(async level => {
        const types = Object.entries(config.typeToBacklogLevel)
          .filter(([, backlogLevel]) => backlogLevel === level)
          .map(([type]) => type);
        const count = await client.countWorkItemsByType(config.organization, config.project, types);
        return [level, count] as const;
      }),
    );
    return Object.fromEntries(entries);
  }
```

- [ ] **Step 3: Add client-side tab switching to the webview script**

In `wrapHtml`, add the tab state and `applySearchTab` function right after `const vscode = acquireVsCodeApi();`:

```js
    const vscode = acquireVsCodeApi();
    let activeSearchTab = 'all';

    function applySearchTab() {
      document.querySelectorAll('.kb-search-tab').forEach((btn) => {
        btn.classList.toggle('kb-search-tab-active', btn.dataset.tab === activeSearchTab);
      });
      document.querySelectorAll('.kb-search-tab-panel').forEach((panel) => {
        panel.classList.toggle('kb-hidden', panel.dataset.tabPanel !== activeSearchTab);
      });
    }
```

In the click handler's `else if` chain, add a new branch after the `toggle-group` branch (currently the last one before the closing `}` of the listener, around line 187):

```js
      } else if (target.dataset && target.dataset.action === 'toggle-group') {
        const items = target.nextElementSibling;
        if (items) {
          items.classList.toggle('kb-hidden');
        }
      } else if (target.dataset && target.dataset.action === 'select-tab') {
        activeSearchTab = target.dataset.tab;
        applySearchTab();
      }
```

In the `message` listener, call `applySearchTab()` after replacing the results HTML (currently lines 197-204):

```js
    window.addEventListener('message', (event) => {
      if (event.data.type === 'search-results') {
        const results = document.getElementById('kb-search-results');
        if (results) {
          results.innerHTML = event.data.html;
          applySearchTab();
        }
      }
    });
```

- [ ] **Step 4: Add CSS for the tab bar**

In the `css()` method, add after the `.kb-search-dialog-header` rule (currently the last rules before the closing backtick, around line 244):

```css
      .kb-search-tabs { display: flex; gap: 4px; overflow-x: auto; margin-bottom: 6px; }
      .kb-search-tab { flex-shrink: 0; padding: 4px 8px; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-search-tab:hover { background: var(--vscode-list-hoverBackground); }
      .kb-search-tab-active { border-bottom: 2px solid var(--vscode-focusBorder); font-weight: 600; }
      .kb-search-tab-empty { opacity: 0.5; }
```

- [ ] **Step 5: Compile to verify no type errors**

Run: `npm run compile`
Expected: succeeds with no errors.

- [ ] **Step 6: Run the full unit test suite**

Run: `npm run test:unit`
Expected: PASS — all tests across the project, including Tasks 1-3.

- [ ] **Step 7: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: wire backlog level tabs into the search dialog webview"
```

---

### Task 5: Update the README manual verification checklist

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Add checklist items**

In `README.md`, after the existing line:

```
- [ ] Each work item in the search results list shows the real Azure DevOps type icon and a colored right border matching that type's color, without a status dot or action button on the item itself.
```

insert:

```
- [ ] The search dialog shows a "Todos" tab plus one tab per backlog level, in the project's real backlog order; clicking a tab filters the already-visible list instantly, with no loading delay.
- [ ] Each backlog level tab's count reflects the total number of that type of work item in the whole project (not just how many match the current search text), and only changes when the dialog is reopened or cleared — not while typing.
- [ ] A backlog level tab with 0 items in the project stays visible (dimmed), and clicking it shows the "Nenhum work item encontrado." message.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add manual verification steps for backlog level tabs"
```
