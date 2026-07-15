# Home / Flow / Config Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current two-screen model (Home / Focused) into three: **Home** (commands + current work item, no embedded config editor), **Flow** (renamed from "focused" — card + children, unchanged behavior), and **Config** (new — just the skill configuration editor). Simplify Home's "no active work item" case to a single "Select Work Item" button reusing the same floating dialog Flow already uses. Restyle navigation/command buttons from the primary (blue) button look to the existing muted secondary style.

**Architecture:** `RenderState.showHome: boolean` becomes `RenderState.screen: 'home' | 'flow' | 'config'`. `render()` dispatches to `renderHome`, `renderConfig` (new), or the Flow content inline, based on `screen`. `KanbrainViewProvider` tracks `currentScreen` the same way it tracked `showHome` (survives polling refreshes). A new shared CSS class `.kb-secondary-btn` replaces the ID-based secondary-button styling and gets applied to every navigation/command button.

**Tech Stack:** TypeScript, Vitest (`npm run test:unit`), `tsc` (`npm run compile`), VS Code Extension API.

## Global Constraints

- `.kb-action-btn` (primary/blue style) stays reserved for the skill run button and the "Run Kanbrain: Setup" button in the no-config empty state — neither was called out as needing a style change.
- The floating search dialog (`kb-search-overlay`/`kb-search-dialog`) behaves identically everywhere it's used (Flow, Home-with-item, Home-without-item) — same markup, same `kb-toggle-search-btn` id, only the button's label text differs by context.
- Because the `.kb-secondary-btn` CSS class attribute gets added to buttons in `render.ts`/`renderHome.ts`/`renderConfig.ts` (Tasks 1-2) before the class's CSS rule is added in `KanbrainViewProvider.ts` (Task 3), those buttons render unstyled (default browser button look) for the commits in between — cosmetic only, no test or compile impact, resolved by Task 3.

---

### Task 1: `screen` state, `render()` dispatch, and the new Config screen

**Files:**
- Modify: `src/view/render.ts`
- Modify: `src/view/render.test.ts`
- Create: `src/view/renderConfig.ts`
- Create: `src/view/renderConfig.test.ts`

**Interfaces:**
- Produces: `RenderState.screen: 'home' | 'flow' | 'config'` (replaces `showHome: boolean`). `renderConfig(state: RenderState): string`. Task 3 (`KanbrainViewProvider`) consumes both.
- Consumes: `renderConfigEditor` (existing, `src/view/renderConfigEditor.ts`).

This task leaves `src/view/renderHome.test.ts` failing to compile (`showHome` no longer exists on `RenderState`) until Task 2 updates it — `renderHome.ts` itself needs no change for this task (it doesn't construct `RenderState`, only receives it), so `npm run test:unit` still passes; `npm run compile` shows exactly one error, in `renderHome.test.ts`, which Task 2 resolves.

- [ ] **Step 1: Write the failing test for `renderConfig`**

Create `src/view/renderConfig.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderConfig } from './renderConfig';
import type { RenderState } from './render';
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
    const html = renderConfig(state({ config: config({ backlogLevels: { Tasks: { 'To Do': null } } }) }));
    expect(html).toContain('data-level="Tasks"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: FAIL — `Cannot find module './renderConfig'`.

- [ ] **Step 3: Update `RenderState` and `render()`, and create `renderConfig.ts`**

Replace the full contents of `src/view/render.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
import { renderConfig } from './renderConfig';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  screen: 'home' | 'flow' | 'config';
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

  const subtasksHtml = state.subtasks.length
    ? state.subtasks.map(s => renderWorkItemCard(s, state.config!, 'kb-subtask-card')).join('')
    : '<div class="kb-empty">No child items.</div>';

  return `
    <div class="kb-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
      <button id="kb-toggle-search-btn" class="kb-secondary-btn">🔍 Switch work item</button>
      <button id="kb-clear-btn" class="kb-secondary-btn">✕ Clear</button>
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
    ${renderWorkItemCard(state.workItem, state.config, 'kb-main-card')}
    <div class="kb-section-label">Children (${state.subtasks.length})</div>
    ${subtasksHtml}
  `;
}
```

Create `src/view/renderConfig.ts`:

```ts
import type { RenderState } from './render';
import { renderConfigEditor } from './renderConfigEditor';

export function renderConfig(state: RenderState): string {
  const config = state.config!;

  return `
    <div class="kb-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-section-label">Skill Configuration</div>
    ${renderConfigEditor(config)}
  `;
}
```

- [ ] **Step 4: Run the `renderConfig` test to verify it passes**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Update `render.test.ts`**

Replace the full contents of `src/view/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, type RenderState } from './render';
import type { WorkItem, KanbrainConfig } from '../types';

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
    ...overrides,
  };
}

const config: KanbrainConfig = {
  organization: 'org',
  project: 'proj',
  typeToBacklogLevel: { Task: 'Tasks' },
  backlogLevels: { Tasks: { Active: { path: 'skills/fix.md' }, Closed: null } },
  statusColors: { Active: 'b2b2b2' },
  typeColors: { Task: 'f2cb1d' },
  typeIcons: { Task: '<svg><path d="M0 0"/></svg>' },
};

describe('render', () => {
  it('shows an open-folder prompt when there is no workspace folder open', () => {
    const html = render({ hasWorkspace: false, config: null, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('Open a workspace folder');
  });

  it('shows a setup prompt when there is no config', () => {
    const html = render({ hasWorkspace: true, config: null, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('Kanbrain: Setup');
  });

  it('shows a button to run Setup when there is no config', () => {
    const html = render({ hasWorkspace: true, config: null, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-run-setup-btn"');
  });

  it('delegates to the home screen when screen is "home"', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'home' });
    expect(html).toContain('kb-home-section');
  });

  it('delegates to the config screen when screen is "config"', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'config' });
    expect(html).toContain('kb-config-level');
  });

  it('shows a Home button on the flow screen', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-home-btn"');
  });

  it('shows an inline search box when there is config but no active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-search-input"');
    expect(html).toContain('id="kb-search-results"');
  });

  it('escapes HTML in the work item title', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('Fix &lt;bug&gt; in login');
    expect(html).not.toContain('Fix <bug> in login');
  });

  it('shows a toggle-search button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('Switch work item');
  });

  it('shows a clear button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('id="kb-clear-btn"');
  });

  it('shows an action button when the status has a configured skill', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    expect(html).toContain('data-action="run-skill"');
    expect(html).toContain('data-id="482"');
  });

  it('hides the action button when the status has no configured skill', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ status: 'Closed' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    expect(html).not.toContain('data-action="run-skill"');
  });

  it('lists children with their own action buttons', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, screen: 'flow' });
    expect(html).toContain('Sub 1');
    expect(html).toContain('data-id="101"');
    expect(html).toContain('Children (1)');
  });

  it('shows an empty message when there are no children', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('No child items');
  });

  it('shows the status as a colored dot next to the plain status text', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    expect(html).toContain('kb-status-dot');
    expect(html).toContain('background-color: #b2b2b2');
    expect(html).not.toContain('kb-badge');
  });

  it('shows the type icon and a colored right border instead of a type badge', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ type: 'Task' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    expect(html).toContain('kb-type-icon');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
    expect(html).toContain('border-right: 4px solid #f2cb1d');
  });

  it('wraps the search section in an overlay dialog with a close button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], screen: 'flow' });
    expect(html).toContain('kb-search-overlay');
    expect(html).toContain('kb-search-dialog');
    expect(html).toContain('id="kb-search-close-btn"');
  });

  it('uses a custom label when the skill entry defines one', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      backlogLevels: { Tasks: { Active: { path: 'skills/fix.md', label: 'Fix it now' }, Closed: null } },
    };
    const html = render({
      hasWorkspace: true,
      config: customConfig,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    expect(html).toContain('Fix it now');
    expect(html).not.toContain('fix.md');
  });

  it('applies textColor and buttonColor as inline style when valid hex', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      backlogLevels: { Tasks: { Active: { path: 'skills/fix.md', textColor: 'ffffff', buttonColor: '007acc' }, Closed: null } },
    };
    const html = render({
      hasWorkspace: true,
      config: customConfig,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    expect(html).toContain('background: #007acc;');
    expect(html).toContain('color: #ffffff;');
  });

  it('ignores an invalid hex color and falls back to the theme default', () => {
    const customConfig: KanbrainConfig = {
      ...config,
      backlogLevels: { Tasks: { Active: { path: 'skills/fix.md', buttonColor: 'not-a-color' }, Closed: null } },
    };
    const html = render({
      hasWorkspace: true,
      config: customConfig,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      screen: 'flow',
    });
    const buttonIndex = html.indexOf('data-action="run-skill"');
    const buttonMarkup = html.slice(buttonIndex - 40, buttonIndex + 40);
    expect(buttonMarkup).not.toContain('background:');
  });
});
```

- [ ] **Step 6: Run the render tests to verify they pass, and check the expected compile gap**

Run: `npx vitest run src/view/render.test.ts src/view/renderConfig.test.ts`
Expected: PASS (20 + 2 tests)

Run: `npm run compile`
Expected: exactly one error, in `src/view/renderHome.test.ts` (`Property 'showHome' does not exist...` or similar) — this is the expected, temporary gap described in Global Constraints; Task 2 closes it.

- [ ] **Step 7: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts src/view/renderConfig.ts src/view/renderConfig.test.ts
git commit -m "feat: split render() into home/flow/config screens"
```

---

### Task 2: Simplify the Home screen (drop embedded config, add Configuration button, unify search)

**Files:**
- Modify: `src/view/renderHome.ts`
- Modify: `src/view/renderHome.test.ts`

**Interfaces:**
- Consumes: `renderWorkItemCard` (existing). No longer consumes `renderConfigEditor` — that moved to `renderConfig.ts` in Task 1.
- Produces: `renderHome(state: RenderState): string` — same signature, new content. Task 3 (`KanbrainViewProvider`) wires the new `kb-show-config-btn` button this task adds.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/view/renderHome.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderHome } from './renderHome';
import type { RenderState } from './render';
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

function state(overrides: Partial<RenderState> = {}): RenderState {
  return {
    hasWorkspace: true,
    config: config(),
    workItem: null,
    parent: null,
    subtasks: [],
    screen: 'home',
    ...overrides,
  };
}

describe('renderHome', () => {
  it('shows buttons for Setup, Check Board Configuration, Sync Board Configuration, and Configuration', () => {
    const html = renderHome(state());

    expect(html).toContain('id="kb-run-setup-home-btn"');
    expect(html).toContain('id="kb-run-check-board-config-btn"');
    expect(html).toContain('id="kb-run-sync-board-config-btn"');
    expect(html).toContain('id="kb-show-config-btn"');
  });

  it('shows a "Select Work Item" button (not the search box directly) when there is no active work item', () => {
    const html = renderHome(state({ workItem: null }));

    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('Select Work Item');
    expect(html).toContain('kb-search-overlay');
    expect(html).not.toContain('id="kb-clear-btn"');
    expect(html).not.toContain('id="kb-view-details-btn"');
  });

  it('shows the active work item card with switch/clear/view-details buttons when one is active', () => {
    const html = renderHome(state({ workItem: workItem() }));

    expect(html).toContain('kb-main-card');
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('Switch work item');
    expect(html).toContain('id="kb-clear-btn"');
    expect(html).toContain('id="kb-view-details-btn"');
  });

  it('does not render a config editor section', () => {
    const html = renderHome(state({ config: config({ backlogLevels: { Tasks: { 'To Do': null } } }) }));

    expect(html).not.toContain('data-level="Tasks"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/view/renderHome.test.ts`
Expected: FAIL — the "Select Work Item" test fails because today's Home still renders the bare inline search box; the "does not render a config editor" test fails because today's Home still renders `renderConfigEditor`.

- [ ] **Step 3: Write the minimal implementation**

Replace the full contents of `src/view/renderHome.ts`:

```ts
import type { RenderState } from './render';
import { renderWorkItemCard } from './renderWorkItemCard';

function renderHomeWorkItemSection(state: RenderState): string {
  const config = state.config!;
  const toggleLabel = state.workItem ? '🔍 Switch work item' : '🔍 Select Work Item';

  return `
    <div class="kb-header">
      <button id="kb-toggle-search-btn" class="kb-secondary-btn">${toggleLabel}</button>
      ${state.workItem ? '<button id="kb-clear-btn" class="kb-secondary-btn">✕ Clear</button>' : ''}
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
    ${
      state.workItem
        ? `${renderWorkItemCard(state.workItem, config, 'kb-main-card')}<button id="kb-view-details-btn" class="kb-secondary-btn">View details →</button>`
        : ''
    }
  `;
}

export function renderHome(state: RenderState): string {
  return `
    <div class="kb-home-section">
      <div class="kb-section-label">Commands</div>
      <div class="kb-home-commands">
        <button id="kb-run-setup-home-btn" class="kb-secondary-btn">⚙ Setup</button>
        <button id="kb-run-check-board-config-btn" class="kb-secondary-btn">✅ Check Board Configuration</button>
        <button id="kb-run-sync-board-config-btn" class="kb-secondary-btn">🔄 Sync Board Configuration</button>
        <button id="kb-show-config-btn" class="kb-secondary-btn">🛠️ Configuration</button>
      </div>
    </div>
    <div class="kb-home-section">
      <div class="kb-section-label">Current Work Item</div>
      ${renderHomeWorkItemSection(state)}
    </div>
  `;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderHome.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Compile and run the full unit test suite**

Run: `npm run compile`
Expected: succeeds with no errors — this closes the gap noted at the end of Task 1.

Run: `npm run test:unit`
Expected: PASS — all tests across the project.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderHome.ts src/view/renderHome.test.ts
git commit -m "feat: simplify home screen — drop embedded config, unify search dialog"
```

---

### Task 3: Wire the new screens, messages, and button styling into `KanbrainViewProvider`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `render(state)` with `screen` instead of `showHome` (Task 1).

No dedicated test file — matches the existing pattern for this file. Verified by `npm run compile` and the full unit suite, plus the manual checklist (Task 4).

- [ ] **Step 1: Replace the `showHome` field with `currentScreen`**

Replace:

```ts
  private backlogLevelCounts: Record<string, number> = {};
  private hasCheckedBoardConfig = false;
  private showHome = true;
```

with:

```ts
  private backlogLevelCounts: Record<string, number> = {};
  private hasCheckedBoardConfig = false;
  private currentScreen: 'home' | 'flow' | 'config' = 'home';
```

- [ ] **Step 2: Update `setActiveWorkItem`, `showHomeScreen`, rename `showFocusedScreen` to `showFlowScreen`, and add `showConfigScreen`**

Replace:

```ts
  setActiveWorkItem(id: number | undefined): void {
    this.activeWorkItemId = id;
    this.persistActiveWorkItem(id);
    this.showHome = id === undefined;
    this.lastState = '';
    void this.refresh();
  }

  showHomeScreen(): void {
    this.showHome = true;
    this.lastState = '';
    void this.refresh();
  }

  showFocusedScreen(): void {
    this.showHome = false;
    this.lastState = '';
    void this.refresh();
  }
```

with:

```ts
  setActiveWorkItem(id: number | undefined): void {
    this.activeWorkItemId = id;
    this.persistActiveWorkItem(id);
    this.currentScreen = id === undefined ? 'home' : 'flow';
    this.lastState = '';
    void this.refresh();
  }

  showHomeScreen(): void {
    this.currentScreen = 'home';
    this.lastState = '';
    void this.refresh();
  }

  showFlowScreen(): void {
    this.currentScreen = 'flow';
    this.lastState = '';
    void this.refresh();
  }

  showConfigScreen(): void {
    this.currentScreen = 'config';
    this.lastState = '';
    void this.refresh();
  }
```

- [ ] **Step 3: Update the message handler**

Replace:

```ts
      } else if (message.type === 'show-home') {
        this.showHomeScreen();
      } else if (message.type === 'show-focused') {
        this.showFocusedScreen();
      } else if (message.type === 'save-skill-entry') {
```

with:

```ts
      } else if (message.type === 'show-home') {
        this.showHomeScreen();
      } else if (message.type === 'show-flow') {
        this.showFlowScreen();
      } else if (message.type === 'show-config') {
        this.showConfigScreen();
      } else if (message.type === 'save-skill-entry') {
```

- [ ] **Step 4: Pass `screen` into `render()`**

Replace:

```ts
    this.view.webview.html = this.wrapHtml(
      render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks, showHome: this.showHome }),
    );
```

with:

```ts
    this.view.webview.html = this.wrapHtml(
      render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks, screen: this.currentScreen }),
    );
```

- [ ] **Step 5: Update the webview script**

Replace:

```ts
      } else if (target.id === 'kb-home-btn') {
        vscode.postMessage({ type: 'show-home' });
      } else if (target.id === 'kb-view-details-btn') {
        vscode.postMessage({ type: 'show-focused' });
      } else if (target.id === 'kb-search-close-btn') {
```

with:

```ts
      } else if (target.id === 'kb-home-btn') {
        vscode.postMessage({ type: 'show-home' });
      } else if (target.id === 'kb-view-details-btn') {
        vscode.postMessage({ type: 'show-flow' });
      } else if (target.id === 'kb-show-config-btn') {
        vscode.postMessage({ type: 'show-config' });
      } else if (target.id === 'kb-search-close-btn') {
```

- [ ] **Step 6: Replace the ID-based secondary button CSS with `.kb-secondary-btn`**

Replace:

```ts
      #kb-toggle-search-btn, #kb-clear-btn, #kb-home-btn { flex: 1; box-sizing: border-box; padding: 4px 6px; text-align: center; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      #kb-toggle-search-btn:hover, #kb-clear-btn:hover, #kb-home-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
```

with:

```ts
      .kb-secondary-btn { box-sizing: border-box; padding: 4px 6px; text-align: center; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-secondary-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
      .kb-header .kb-secondary-btn { flex: 1; }
```

- [ ] **Step 7: Compile and run the full unit test suite**

Run: `npm run compile`
Expected: succeeds with no errors.

Run: `npm run test:unit`
Expected: PASS — all tests across the project.

- [ ] **Step 8: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: wire home/flow/config navigation and secondary button styling"
```

---

### Task 4: Update the README

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Replace the Home screen paragraph**

Replace:

```markdown
When there's no active work item — or after clicking **🏠 Home** from the work item view — the panel shows a Home screen with three sections: **Commands** (buttons for Setup, Check Board Configuration, and Sync Board Configuration), **Current Work Item** (the active item with Switch/Clear, or the search box if none is active), and **Skill Configuration** (one editable row per backlog level/status, with a path field, a "…" button to browse for the skill file, and label/text color/button color fields — changes save automatically when you leave a field). The skill configuration editor only edits these values; it doesn't add or remove backlog levels, statuses, or types — that stays the job of Setup/Sync.
```

with:

```markdown
The panel has three screens. **Home** — shown by default when there's no active work item, or after clicking **🏠 Home** from either other screen — has a **Commands** section (Setup, Check Board Configuration, Sync Board Configuration, and Configuration) and a **Current Work Item** section: with an active item, its card plus Switch/Clear/"View details →"; without one, a single "Select Work Item" button that opens the same floating search dialog used elsewhere. **Flow** (reached by picking a work item, or "View details →" from Home) is the card + children view described above, with a "🏠 Home" button added to its header. **Config** (reached via the "Configuration" button on Home) shows the skill configuration editor: one editable row per backlog level/status, with a path field, a "…" button to browse for the skill file, and label/text color/button color fields — changes save automatically when you leave a field. The editor only edits these values; it doesn't add or remove backlog levels, statuses, or types — that stays the job of Setup/Sync.
```

- [ ] **Step 2: Update the manual verification checklist**

Replace:

```markdown
- [ ] With no active work item, the panel shows the Home screen (Commands / Current Work Item / Skill Configuration sections) instead of a bare search box.
- [ ] Clicking a Commands button on Home runs the corresponding command (Setup, Check Board Configuration, Sync Board Configuration).
- [ ] With an active work item, clicking "🏠 Home" shows the Home screen with that item's card, Switch, and Clear in the Current Work Item section, without clearing the active work item; clicking "View details →" returns to the full card + children view.
- [ ] Editing a skill's path, label, text color, or button color in the Skill Configuration section and moving focus away (Tab or click elsewhere) persists the change to `.kanbrain/config.json` without a Save button; reopening Home shows the saved value.
- [ ] Clicking the "…" button next to a skill's path field opens a native file picker; choosing a `.md` file inside the workspace fills the path field with the relative path and saves it.
- [ ] Clearing a skill's path field and moving focus away sets that status back to no skill (`null`) — the action button disappears from that status's card.
```

with:

```markdown
- [ ] With no active work item, the panel shows the Home screen (Commands + Current Work Item sections) instead of a bare search box; the Current Work Item section shows a single "Select Work Item" button rather than an embedded list.
- [ ] Clicking "Select Work Item" on Home opens the same floating search dialog used by "Switch work item" elsewhere; picking a result navigates to the Flow screen (card + children).
- [ ] Clicking Setup, Check Board Configuration, or Sync Board Configuration on Home runs the corresponding command; clicking Configuration navigates to the Config screen.
- [ ] With an active work item, clicking "🏠 Home" shows the Home screen with that item's card, Switch, and Clear in the Current Work Item section, without clearing the active work item; clicking "View details →" returns to the Flow screen.
- [ ] The Config screen shows a "🏠 Home" button and the skill configuration editor, with no Commands or Current Work Item content.
- [ ] Editing a skill's path, label, text color, or button color on the Config screen and moving focus away (Tab or click elsewhere) persists the change to `.kanbrain/config.json` without a Save button; reopening Config shows the saved value.
- [ ] Clicking the "…" button next to a skill's path field opens a native file picker; choosing a `.md` file inside the workspace fills the path field with the relative path and saves it.
- [ ] Clearing a skill's path field and moving focus away sets that status back to no skill (`null`) — the action button disappears from that status's card.
- [ ] The Home, Flow, and Config screens' navigation/command buttons (Home, Switch, Clear, View details, Setup, Check/Sync Board Configuration, Configuration) all use the same muted secondary button style, not the accent/primary color.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/plans/2026-07-15-home-flow-config-screens.md
git commit -m "docs: document the home/flow/config screen split"
```
