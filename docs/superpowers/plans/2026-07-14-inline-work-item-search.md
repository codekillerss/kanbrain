# Inline Work Item Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the QuickPick-only work item selection with a search box and status-grouped results list embedded directly in the Kanbrain panel, so users can browse and pick a work item without leaving the webview or opening the command palette.

**Architecture:** Three new pure/testable modules (`escapeHtml`, `groupByStatus`, `renderSearchResults`) render the results HTML on the extension host; the webview only injects that HTML and posts messages (`search-work-items`, `pick-work-item`) — it never talks to Azure DevOps directly, matching the project's existing pattern. `render.ts` gains the search box markup for both the "no active work item" and "active work item" states. `KanbrainViewProvider` gains message handlers and a `persistActiveWorkItem` callback that both the palette command and the inline picker funnel through, removing the duplicated `workspaceState` write that used to live only in `selectWorkItem.ts`.

**Tech Stack:** TypeScript, vitest (unit tests), VS Code Extension API (Webview `postMessage`).

## Global Constraints

- Webview JavaScript never calls the Azure DevOps API directly — it only sends `postMessage` and injects HTML the extension host already rendered, matching every existing message (`run-skill`) in `KanbrainViewProvider`.
- No debounce on the search input — matches the existing QuickPick's `onDidChangeValue`, which also fires on every keystroke.
- Search results are capped at 50 via `SELECT TOP 50` in the WIQL base query (`src/azureDevOps/wiql.ts`), keeping `getWorkItems` safely under Azure DevOps's 200-id batch limit.
- Follow existing code style: no comments except where a non-obvious constraint justifies one.

---

### Task 1: Extract `escapeHtml` and use it in `render.ts`

**Files:**
- Create: `src/view/escapeHtml.ts`
- Test: `src/view/escapeHtml.test.ts`
- Modify: `src/view/render.ts`

**Interfaces:**
- Produces: `escapeHtml(value: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/view/escapeHtml.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escapeHtml';

describe('escapeHtml', () => {
  it('escapes ampersands, angle brackets, and double quotes', () => {
    expect(escapeHtml('<b>Tom & "Jerry"</b>')).toBe('&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;');
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('plain text')).toBe('plain text');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/view/escapeHtml.test.ts`
Expected: FAIL — `Cannot find module './escapeHtml'`.

- [ ] **Step 3: Implement escapeHtml**

Create `src/view/escapeHtml.ts`:

```ts
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/view/escapeHtml.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Use escapeHtml in render.ts instead of the local esc()**

In `src/view/render.ts`, add the import:

```ts
import { escapeHtml } from './escapeHtml';
```

Remove the local `esc` function:

```ts
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

Replace every `esc(` call with `escapeHtml(` in `renderActionButton` and `renderWorkItemCard` (4 occurrences: the action button label, the status badge, the type badge, and the title).

- [ ] **Step 6: Run render tests to verify no regression**

Run: `npx vitest run src/view/render.test.ts`
Expected: PASS (8 tests, unchanged behavior).

- [ ] **Step 7: Commit**

```bash
git add src/view/escapeHtml.ts src/view/escapeHtml.test.ts src/view/render.ts
git commit -m "refactor: extract escapeHtml as a standalone module"
```

---

### Task 2: `groupByStatus` (pure module)

**Files:**
- Create: `src/view/groupByStatus.ts`
- Test: `src/view/groupByStatus.test.ts`

**Interfaces:**
- Produces: `groupByStatus(items: WorkItem[]): { status: string; items: WorkItem[] }[]`.

- [ ] **Step 1: Write the failing test**

Create `src/view/groupByStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupByStatus } from './groupByStatus';
import type { WorkItem } from '../types';

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

describe('groupByStatus', () => {
  it('groups items under their status, preserving first-seen status order', () => {
    const items = [
      workItem({ id: 1, status: 'Active' }),
      workItem({ id: 2, status: 'New' }),
      workItem({ id: 3, status: 'Active' }),
    ];

    expect(groupByStatus(items)).toEqual([
      { status: 'Active', items: [items[0], items[2]] },
      { status: 'New', items: [items[1]] },
    ]);
  });

  it('returns an empty array for an empty list', () => {
    expect(groupByStatus([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/view/groupByStatus.test.ts`
Expected: FAIL — `Cannot find module './groupByStatus'`.

- [ ] **Step 3: Implement groupByStatus**

Create `src/view/groupByStatus.ts`:

```ts
import type { WorkItem } from '../types';

export function groupByStatus(items: WorkItem[]): { status: string; items: WorkItem[] }[] {
  const order: string[] = [];
  const byStatus = new Map<string, WorkItem[]>();

  for (const item of items) {
    if (!byStatus.has(item.status)) {
      order.push(item.status);
      byStatus.set(item.status, []);
    }
    byStatus.get(item.status)!.push(item);
  }

  return order.map(status => ({ status, items: byStatus.get(status)! }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/view/groupByStatus.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/view/groupByStatus.ts src/view/groupByStatus.test.ts
git commit -m "feat: add groupByStatus for board-style result grouping"
```

---

### Task 3: `renderSearchResults` (pure module)

**Files:**
- Create: `src/view/renderSearchResults.ts`
- Test: `src/view/renderSearchResults.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` (Task 1), `groupByStatus` (Task 2).
- Produces: `renderSearchResults(items: WorkItem[]): string`.

- [ ] **Step 1: Write the failing test**

Create `src/view/renderSearchResults.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderSearchResults } from './renderSearchResults';
import type { WorkItem } from '../types';

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

describe('renderSearchResults', () => {
  it('shows an empty message when there are no results', () => {
    expect(renderSearchResults([])).toContain('Nenhum work item encontrado.');
  });

  it('groups results into status sections with counts', () => {
    const items = [workItem({ id: 1, status: 'Active' }), workItem({ id: 2, status: 'New' })];

    const html = renderSearchResults(items);

    expect(html).toContain('Active (1)');
    expect(html).toContain('New (1)');
  });

  it('renders each item as a pickable button with its id, escaping the title', () => {
    const html = renderSearchResults([workItem({ id: 482, title: 'Corrigir <bug>' })]);

    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('Corrigir &lt;bug&gt;');
    expect(html).not.toContain('Corrigir <bug>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/view/renderSearchResults.test.ts`
Expected: FAIL — `Cannot find module './renderSearchResults'`.

- [ ] **Step 3: Implement renderSearchResults**

Create `src/view/renderSearchResults.ts`:

```ts
import type { WorkItem } from '../types';
import { escapeHtml } from './escapeHtml';
import { groupByStatus } from './groupByStatus';

export function renderSearchResults(items: WorkItem[]): string {
  if (items.length === 0) {
    return '<div class="kb-empty">Nenhum work item encontrado.</div>';
  }

  return groupByStatus(items)
    .map(
      group => `
        <div class="kb-section-label">${escapeHtml(group.status)} (${group.items.length})</div>
        ${group.items
          .map(
            item => `
              <button class="kb-result-item" data-action="pick-work-item" data-id="${item.id}">#${item.id} ${escapeHtml(item.title)}</button>
            `,
          )
          .join('')}
      `,
    )
    .join('');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/view/renderSearchResults.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/view/renderSearchResults.ts src/view/renderSearchResults.test.ts
git commit -m "feat: render status-grouped work item search results"
```

---

### Task 4: Cap WIQL search results at 50

**Files:**
- Modify: `src/azureDevOps/wiql.ts`
- Modify: `src/azureDevOps/wiql.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change — `buildSearchQuery` behavior only.

- [ ] **Step 1: Update the failing assertion**

In `src/azureDevOps/wiql.test.ts`, replace:

```ts
  it('returns a title-ordered query with no filter when search text is empty', () => {
    const query = buildSearchQuery('');
    expect(query).toContain('SELECT [System.Id] FROM WorkItems');
    expect(query).toContain('ORDER BY [System.ChangedDate] DESC');
    expect(query).not.toContain('CONTAINS');
  });
```

with:

```ts
  it('returns a title-ordered query capped at 50 results with no filter when search text is empty', () => {
    const query = buildSearchQuery('');
    expect(query).toContain('SELECT TOP 50 [System.Id] FROM WorkItems');
    expect(query).toContain('ORDER BY [System.ChangedDate] DESC');
    expect(query).not.toContain('CONTAINS');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/azureDevOps/wiql.test.ts`
Expected: FAIL — actual query still contains `SELECT [System.Id]` without `TOP 50`.

- [ ] **Step 3: Add the TOP 50 clause**

In `src/azureDevOps/wiql.ts`, replace:

```ts
const BASE_QUERY = 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project';
```

with:

```ts
const BASE_QUERY = 'SELECT TOP 50 [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/azureDevOps/wiql.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/azureDevOps/wiql.ts src/azureDevOps/wiql.test.ts
git commit -m "fix: cap work item search results at 50 to stay under the Azure DevOps batch limit"
```

---

### Task 5: Search box markup in `render.ts`

**Files:**
- Modify: `src/view/render.ts`
- Modify: `src/view/render.test.ts`

**Interfaces:**
- Consumes: nothing new (markup-only change).
- Produces: new DOM ids relied on by Task 6's webview script: `kb-search-section`, `kb-search-input`, `kb-search-results`, `kb-toggle-search-btn`.

- [ ] **Step 1: Update the failing test for the empty state**

In `src/view/render.test.ts`, replace:

```ts
  it('shows a select-work-item prompt when there is config but no active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [] });
    expect(html).toContain('Kanbrain: Select Work Item');
  });
```

with:

```ts
  it('shows an inline search box when there is config but no active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [] });
    expect(html).toContain('id="kb-search-input"');
    expect(html).toContain('id="kb-search-results"');
  });
```

- [ ] **Step 2: Add the failing test for the active-work-item toggle button**

In `src/view/render.test.ts`, after the `'escapes HTML in the work item title'` test, add:

```ts
  it('shows a toggle-search button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [] });
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('Trocar work item');
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/view/render.test.ts`
Expected: FAIL — the empty-state test no longer finds `id="kb-search-input"` (old text still there), and the toggle-button test doesn't find `id="kb-toggle-search-btn"`.

- [ ] **Step 4: Update render.ts**

In `src/view/render.ts`, replace:

```ts
  if (!state.workItem) {
    return '<div class="kb-empty">Nenhum work item selecionado. Rode o comando <b>Kanbrain: Select Work Item</b>.</div>';
  }
```

with:

```ts
  if (!state.workItem) {
    return `
      <div id="kb-search-section">
        <input id="kb-search-input" placeholder="Buscar por título ou #id...">
        <div id="kb-search-results"></div>
      </div>
    `;
  }
```

Replace:

```ts
  return `
    <div class="kb-header">
      <button id="kb-select-btn">Selecionar work item</button>
    </div>
    ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card')}
    <div class="kb-section-label">Subtasks (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
```

with:

```ts
  return `
    <div class="kb-header">
      <button id="kb-toggle-search-btn">🔍 Trocar work item</button>
    </div>
    <div id="kb-search-section" class="kb-hidden">
      <input id="kb-search-input" placeholder="Buscar por título ou #id...">
      <div id="kb-search-results"></div>
    </div>
    ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card')}
    <div class="kb-section-label">Subtasks (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/view/render.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts
git commit -m "feat: add inline search box markup to the panel"
```

---

### Task 6: Wire inline search into KanbrainViewProvider, selectWorkItem, and extension.ts

This task changes `KanbrainViewProvider`'s constructor signature and `registerSelectWorkItemCommand`'s signature, both of which are called from `extension.ts` — all three files must change together for `npm run compile` to pass. None of these three files has direct unit test coverage today (same vscode-heavy pattern as `setup.ts`); verification is the full test suite + compile, plus the manual checklist in Task 7.

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`
- Modify: `src/commands/selectWorkItem.ts`
- Modify: `src/extension.ts`

**Interfaces:**
- Consumes: `renderSearchResults` (Task 3).
- Produces: `KanbrainViewProvider` constructor now takes `(workspaceRoot, client, getCurrentBranch, persistActiveWorkItem: (id: number) => void)`. `registerSelectWorkItemCommand` now takes `(client, workspaceRoot, onSelect)` — no `context` parameter.

- [ ] **Step 1: Rewrite KanbrainViewProvider.ts**

Replace the full contents of `src/view/KanbrainViewProvider.ts`:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import type { WorkItem } from '../types';
import { readConfig } from '../config/config';
import { resolveSkillPath } from '../config/resolveSkillPath';
import { render } from './render';
import { renderSearchResults } from './renderSearchResults';
import { serializeState, hasStateChanged } from './hasStateChanged';
import { generateContextFile } from '../skills/generateContextFile';
import { sendReadCommand } from '../terminal/kanbrainTerminal';

const POLL_INTERVAL_MS = 5000;

export class KanbrainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'kanbrain.view';

  private view: vscode.WebviewView | undefined;
  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private lastState = '';
  private activeWorkItemId: number | undefined;

  constructor(
    private readonly workspaceRoot: string | undefined,
    private readonly client: AzureDevOpsClient | undefined,
    private readonly getCurrentBranch: () => Promise<string>,
    private readonly persistActiveWorkItem: (id: number) => void,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.type === 'run-skill') {
        await this.runSkill(Number(message.id));
      } else if (message.type === 'search-work-items') {
        await this.searchWorkItems(String(message.query ?? ''));
      } else if (message.type === 'pick-work-item') {
        this.setActiveWorkItem(Number(message.id));
      }
    });

    void this.refresh();
    this.pollHandle = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
    webviewView.onDidDispose(() => {
      if (this.pollHandle) {
        clearInterval(this.pollHandle);
      }
    });
  }

  setActiveWorkItem(id: number | undefined): void {
    this.activeWorkItemId = id;
    if (id !== undefined) {
      this.persistActiveWorkItem(id);
    }
    this.lastState = '';
    void this.refresh();
  }

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
      html = renderSearchResults(items);
    } catch {
      html = '<div class="kb-empty">Erro ao buscar work items.</div>';
    }

    this.view.webview.postMessage({ type: 'search-results', html });
  }

  private async runSkill(id: number): Promise<void> {
    if (!this.workspaceRoot || !this.client) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }

    const [workItem] = await this.client.getWorkItems(config.organization, config.project, [id]);
    if (!workItem) {
      return;
    }

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
      workItem,
      parent: parent ?? null,
      subtasks,
      branch,
    });

    sendReadCommand(relativePath);
  }

  private async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }
    const config = this.workspaceRoot ? readConfig(this.workspaceRoot) : null;

    let workItem: WorkItem | null = null;
    let parent: WorkItem | null = null;
    let subtasks: WorkItem[] = [];

    if (config && this.client && this.activeWorkItemId) {
      const [fetched] = await this.client.getWorkItems(config.organization, config.project, [this.activeWorkItemId]);
      workItem = fetched ?? null;
      if (workItem) {
        subtasks = await this.client.getChildren(config.organization, config.project, workItem);
        if (workItem.parentId) {
          const [fetchedParent] = await this.client.getWorkItems(config.organization, config.project, [workItem.parentId]);
          parent = fetchedParent ?? null;
        }
      }
    }

    if (!hasStateChanged(this.lastState, config, workItem, subtasks)) {
      return;
    }
    this.lastState = serializeState(config, workItem, subtasks);
    this.view.webview.html = this.wrapHtml(render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks }));
  }

  private wrapHtml(body: string): string {
    return `<!DOCTYPE html>
<html>
<head><style>${this.css()}</style></head>
<body>
  ${body}
  <script>
    const vscode = acquireVsCodeApi();

    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target.id === 'kb-toggle-search-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          const wasHidden = section.classList.contains('kb-hidden');
          section.classList.toggle('kb-hidden');
          if (wasHidden) {
            vscode.postMessage({ type: 'search-work-items', query: '' });
          }
        }
      } else if (target.dataset && target.dataset.action === 'run-skill') {
        vscode.postMessage({ type: 'run-skill', id: target.dataset.id });
      } else if (target.dataset && target.dataset.action === 'pick-work-item') {
        vscode.postMessage({ type: 'pick-work-item', id: target.dataset.id });
      }
    });

    const searchInput = document.getElementById('kb-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        vscode.postMessage({ type: 'search-work-items', query: e.target.value });
      });
    }

    window.addEventListener('message', (event) => {
      if (event.data.type === 'search-results') {
        const results = document.getElementById('kb-search-results');
        if (results) {
          results.innerHTML = event.data.html;
        }
      }
    });

    const searchSection = document.getElementById('kb-search-section');
    if (searchSection && !searchSection.classList.contains('kb-hidden')) {
      vscode.postMessage({ type: 'search-work-items', query: '' });
    }
  </script>
</body>
</html>`;
  }

  private css(): string {
    return `
      body { font-family: var(--vscode-font-family); padding: 8px; }
      .kb-badge { border-radius: 4px; padding: 2px 6px; margin-right: 4px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 11px; }
      .kb-main-card, .kb-subtask-card { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin: 8px 0; }
      .kb-title { font-weight: 600; margin: 4px 0; }
      .kb-action-btn { margin-top: 6px; }
      .kb-empty { opacity: 0.7; padding: 12px 0; }
      .kb-section-label { margin-top: 12px; font-size: 11px; text-transform: uppercase; opacity: 0.7; }
      .kb-hidden { display: none; }
      .kb-result-item { display: block; width: 100%; text-align: left; padding: 4px 6px; margin: 2px 0; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; }
      .kb-result-item:hover { background: var(--vscode-list-hoverBackground); }
    `;
  }
}
```

- [ ] **Step 2: Rewrite selectWorkItem.ts**

Replace the full contents of `src/commands/selectWorkItem.ts`:

```ts
import * as vscode from 'vscode';
import type { AzureDevOpsClient } from '../azureDevOps/client';
import { readConfig } from '../config/config';

interface WorkItemQuickPickItem extends vscode.QuickPickItem {
  id: number;
}

export function registerSelectWorkItemCommand(
  client: AzureDevOpsClient,
  workspaceRoot: string,
  onSelect: (id: number) => void,
): vscode.Disposable {
  return vscode.commands.registerCommand('kanbrain.selectWorkItem', async () => {
    const config = readConfig(workspaceRoot);
    if (!config) {
      vscode.window.showErrorMessage('Rode "Kanbrain: Setup" antes de selecionar um work item.');
      return;
    }

    const quickPick = vscode.window.createQuickPick<WorkItemQuickPickItem>();
    quickPick.placeholder = 'Buscar work item por título ou #id…';

    quickPick.onDidChangeValue(async value => {
      quickPick.busy = true;
      const ids = await client.searchWorkItems(config.organization, config.project, value);
      const items = ids.length ? await client.getWorkItems(config.organization, config.project, ids) : [];
      quickPick.items = items.map(item => ({ label: `#${item.id} ${item.title}`, description: item.status, id: item.id }));
      quickPick.busy = false;
    });

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        onSelect(selected.id);
      }
      quickPick.hide();
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  });
}
```

- [ ] **Step 3: Update extension.ts**

Replace the full contents of `src/extension.ts`:

```ts
import * as vscode from 'vscode';
import { ensureAzureSession } from './auth/ensureAzureSession';
import { getVscodeMicrosoftSession } from './auth/vscodeSession';
import { AzureDevOpsClient } from './azureDevOps/client';
import { KanbrainViewProvider } from './view/KanbrainViewProvider';
import { getCurrentBranch } from './git/getCurrentBranch';
import { registerSetupCommand } from './commands/setup';
import { registerSelectWorkItemCommand } from './commands/selectWorkItem';

const ACTIVE_WORK_ITEM_KEY = 'kanbrain.activeWorkItemId';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const client = workspaceRoot
    ? new AzureDevOpsClient({
        fetchImpl: fetch,
        getToken: () => ensureAzureSession(getVscodeMicrosoftSession),
      })
    : undefined;

  const provider = new KanbrainViewProvider(
    workspaceRoot,
    client,
    () => getCurrentBranch(workspaceRoot ?? ''),
    id => context.workspaceState.update(ACTIVE_WORK_ITEM_KEY, id),
  );

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(KanbrainViewProvider.viewType, provider));

  if (!workspaceRoot || !client) {
    return;
  }

  context.subscriptions.push(
    registerSetupCommand(client, workspaceRoot),
    registerSelectWorkItemCommand(client, workspaceRoot, id => provider.setActiveWorkItem(id)),
  );

  const savedWorkItemId = context.workspaceState.get<number>(ACTIVE_WORK_ITEM_KEY);
  if (savedWorkItemId) {
    provider.setActiveWorkItem(savedWorkItemId);
  }
}

export function deactivate(): void {}
```

- [ ] **Step 4: Run the full unit test suite**

Run: `npx vitest run`
Expected: PASS, all test files green.

- [ ] **Step 5: Run the TypeScript compiler**

Run: `npm run compile`
Expected: exits with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/view/KanbrainViewProvider.ts src/commands/selectWorkItem.ts src/extension.ts
git commit -m "feat: wire inline work item search into the panel"
```

---

### Task 7: Update README manual verification checklist

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing (documentation only).

- [ ] **Step 1: Add checklist items for the inline search**

In `README.md`, in the `## Manual verification checklist` section, after the line `- [ ] \`Kanbrain: Select Work Item\` search returns matching work items by title and by \`#id\`.`, add:

```markdown
- [ ] With no active work item, the panel shows a search box and, without typing anything, a list of up to 50 recent work items grouped by status.
- [ ] Typing in the search box filters the list by title or `#id`.
- [ ] Clicking a result in the list sets it as the active work item and persists the selection (survives a window reload).
- [ ] With an active work item, the header shows a "🔍 Trocar work item" button that toggles the same search box open/closed without leaving the panel.
- [ ] If the search request fails (e.g. token expired), the results area shows an inline error message instead of hanging or throwing.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document inline work item search verification steps"
```
