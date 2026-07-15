# Home Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Home" screen (Commands / Current Work Item / Skill Configuration sections) shown by default when there's no active work item, reachable at any time from the focused (card) view via a new "🏠 Home" button — without changing the focused view's existing behavior otherwise.

**Architecture:** `renderWorkItemCard` is extracted into its own module so both the existing focused view and the new Home screen can reuse it without a circular import. `RenderState` gains a `showHome: boolean` field; `render()` dispatches to `renderHome()` or the (renamed, behaviorally identical) `renderFocused()`. A new `renderConfigEditor()` renders one editable row per `backlogLevels[level][status]` entry. View navigation (`showHome`) is tracked server-side on `KanbrainViewProvider`, not client-side, so it survives the 5s polling refresh.

**Tech Stack:** TypeScript, Vitest (`npm run test:unit`), `tsc` (`npm run compile`), VS Code Extension API.

## Global Constraints

- The config editor only edits `backlogLevels[level][status]` (path/label/textColor/buttonColor) — `organization`, `project`, `typeToBacklogLevel`, `statusColors`, `typeColors`, `typeIcons` stay read-only. It never creates a `level`/`status` key that doesn't already exist in `config.backlogLevels` — that stays Setup/Sync's job.
- Auto-save per field on blur (and after the file picker fills a field) — no explicit Save button. Saving does **not** force an immediate full re-render (avoids stealing focus from a field the user is still editing); the change surfaces on the next 5s poll like any other external config change.
- `showHome` lives on `KanbrainViewProvider` (server-side), defaults to `true`, and is only ever flipped by explicit user actions (`pick-work-item` → false, `clear-work-item` → true, "🏠 Home" → true, "View details" → false) — never implicitly by polling.
- The focused view's existing behavior (header, floating search dialog, main card, children list) is unchanged except for the added Home button — every existing `render.test.ts` assertion must still pass.

---

### Task 1: Extract `renderWorkItemCard` into its own module

**Files:**
- Create: `src/view/renderWorkItemCard.ts`
- Modify: `src/view/render.ts`

**Interfaces:**
- Produces: `renderWorkItemCard(workItem: WorkItem, config: KanbrainConfig, cssClass: string): string` — same signature and behavior as today's private function in `render.ts`, now exported so Task 3's `renderHome.ts` can reuse it too.

This is a pure, behavior-preserving refactor — verified by the existing `render.test.ts` suite passing unchanged (no new test file needed; every assertion about the action button, custom label, colors, status dot, and type icon/border already exercises this code through `render()`).

- [ ] **Step 1: Create `renderWorkItemCard.ts`**

Create `src/view/renderWorkItemCard.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { resolveSkill } from '../config/resolveSkill';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
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

export function renderWorkItemCard(workItem: WorkItem, config: KanbrainConfig, cssClass: string): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);

  return `
    <div class="${cssClass}"${borderStyle}>
      <div class="kb-card-header">
        ${iconHtml}
        <span class="kb-id">#${workItem.id}</span>
      </div>
      <div class="kb-title">${escapeHtml(workItem.title)}</div>
      <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
      ${renderActionButton(workItem, config)}
    </div>
  `;
}
```

- [ ] **Step 2: Update `render.ts` to use the extracted module**

Replace the full contents of `src/view/render.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { resolveSkill } from '../config/resolveSkill';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';
import { isValidHexColor, normalizeHex } from './badgeColor';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
}

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

function renderWorkItemCard(workItem: WorkItem, config: KanbrainConfig, cssClass: string): string {
  const { borderStyle, iconHtml } = renderTypeAccent(workItem.type, config);

  return `
    <div class="${cssClass}"${borderStyle}>
      <div class="kb-card-header">
        ${iconHtml}
        <span class="kb-id">#${workItem.id}</span>
      </div>
      <div class="kb-title">${escapeHtml(workItem.title)}</div>
      <div class="kb-status-row">${renderStatusDot(workItem.status, config.statusColors ?? {})}${escapeHtml(workItem.status)}</div>
      ${renderActionButton(workItem, config)}
    </div>
  `;
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
      <button id="kb-toggle-search-btn">🔍 Switch work item</button>
      <button id="kb-clear-btn">✕ Clear</button>
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

with:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';

export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
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
      <button id="kb-toggle-search-btn">🔍 Switch work item</button>
      <button id="kb-clear-btn">✕ Clear</button>
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

- [ ] **Step 3: Compile and run the full unit test suite**

Run: `npm run compile`
Expected: succeeds with no errors.

Run: `npm run test:unit`
Expected: PASS — all existing tests, including every `render.test.ts` assertion (pure refactor, no behavior change).

- [ ] **Step 4: Commit**

```bash
git add src/view/renderWorkItemCard.ts src/view/render.ts
git commit -m "refactor: extract renderWorkItemCard for reuse by the home screen"
```

---

### Task 2: Skill configuration editor (`renderConfigEditor`)

**Files:**
- Create: `src/view/renderConfigEditor.ts`
- Create: `src/view/renderConfigEditor.test.ts`

**Interfaces:**
- Produces: `renderConfigEditor(config: KanbrainConfig): string`. Task 3's `renderHome.ts` consumes this.

- [ ] **Step 1: Write the failing tests**

Create `src/view/renderConfigEditor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderConfigEditor } from './renderConfigEditor';
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

describe('renderConfigEditor', () => {
  it('shows an empty message when there are no backlog levels', () => {
    expect(renderConfigEditor(config())).toContain('No backlog levels configured yet.');
  });

  it('renders one row per status with data-level/data-status attributes', () => {
    const html = renderConfigEditor(config({ backlogLevels: { Tasks: { 'To Do': null, Done: null } } }));

    expect(html).toContain('data-level="Tasks"');
    expect(html).toContain('data-status="To Do"');
    expect(html).toContain('data-status="Done"');
  });

  it('leaves the fields empty when the entry is null', () => {
    const html = renderConfigEditor(config({ backlogLevels: { Tasks: { 'To Do': null } } }));

    expect(html).toContain('data-field="path" placeholder="Skill file path" value=""');
  });

  it('fills the fields from the skill entry when one is set', () => {
    const html = renderConfigEditor(
      config({
        backlogLevels: {
          Tasks: { 'To Do': { path: '.kanbrain/skills/tasks-todo.md', label: 'Refine', textColor: 'ffffff', buttonColor: '007acc' } },
        },
      }),
    );

    expect(html).toContain('value=".kanbrain/skills/tasks-todo.md"');
    expect(html).toContain('value="Refine"');
    expect(html).toContain('value="ffffff"');
    expect(html).toContain('value="007acc"');
  });

  it('escapes HTML in level, status, and field values', () => {
    const html = renderConfigEditor(config({ backlogLevels: { '<Tasks>': { '<To Do>': { path: '<script>' } } } }));

    expect(html).toContain('&lt;Tasks&gt;');
    expect(html).toContain('&lt;To Do&gt;');
    expect(html).not.toContain('<script>');
  });

  it('shows a status dot when a color is known for the status', () => {
    const html = renderConfigEditor(config({ backlogLevels: { Tasks: { 'To Do': null } }, statusColors: { 'To Do': 'b2b2b2' } }));

    expect(html).toContain('kb-status-dot');
    expect(html).toContain('#b2b2b2');
  });

  it('shows a picker button for each row', () => {
    const html = renderConfigEditor(config({ backlogLevels: { Tasks: { 'To Do': null } } }));

    expect(html).toContain('data-action="pick-skill-file"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/view/renderConfigEditor.test.ts`
Expected: FAIL — `Cannot find module './renderConfigEditor'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/view/renderConfigEditor.ts`:

```ts
import type { KanbrainConfig, SkillEntry } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderStatusDot } from './renderStatusDot';

function renderSkillEntryRow(level: string, status: string, entry: SkillEntry | null, statusColors: Record<string, string>): string {
  const path = entry?.path ?? '';
  const label = entry?.label ?? '';
  const textColor = entry?.textColor ?? '';
  const buttonColor = entry?.buttonColor ?? '';

  return `
    <div class="kb-config-row" data-level="${escapeHtml(level)}" data-status="${escapeHtml(status)}">
      <div class="kb-config-row-status">${renderStatusDot(status, statusColors)}${escapeHtml(status)}</div>
      <div class="kb-config-field-path">
        <input type="text" class="kb-input" data-field="path" placeholder="Skill file path" value="${escapeHtml(path)}">
        <button type="button" data-action="pick-skill-file" title="Browse for a file">…</button>
      </div>
      <input type="text" class="kb-input" data-field="label" placeholder="Label (optional)" value="${escapeHtml(label)}">
      <input type="text" class="kb-input" data-field="textColor" placeholder="Text color hex" value="${escapeHtml(textColor)}">
      <input type="text" class="kb-input" data-field="buttonColor" placeholder="Button color hex" value="${escapeHtml(buttonColor)}">
    </div>
  `;
}

export function renderConfigEditor(config: KanbrainConfig): string {
  const levels = Object.keys(config.backlogLevels);
  if (levels.length === 0) {
    return '<div class="kb-empty">No backlog levels configured yet.</div>';
  }

  return levels
    .map(level => {
      const statuses = config.backlogLevels[level];
      const rows = Object.keys(statuses)
        .map(status => renderSkillEntryRow(level, status, statuses[status], config.statusColors ?? {}))
        .join('');
      return `
        <div class="kb-config-level">
          <div class="kb-section-label">${escapeHtml(level)}</div>
          ${rows}
        </div>
      `;
    })
    .join('');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderConfigEditor.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/view/renderConfigEditor.ts src/view/renderConfigEditor.test.ts
git commit -m "feat: add renderConfigEditor for editing skill entries"
```

---

### Task 3: Home screen (`renderHome`) and `render()` dispatch

**Files:**
- Create: `src/view/renderHome.ts`
- Create: `src/view/renderHome.test.ts`
- Modify: `src/view/render.ts`
- Modify: `src/view/render.test.ts`

**Interfaces:**
- Consumes: `renderWorkItemCard` (Task 1), `renderConfigEditor` (Task 2).
- Produces: `renderHome(state: RenderState): string`. `RenderState` gains `showHome: boolean` (required). Task 4 (`KanbrainViewProvider`) consumes both the updated `RenderState` shape and passes `showHome` into `render()`.

This task lands `RenderState`'s new field and `renderHome.ts` together: `renderHome.ts` needs the updated `RenderState` shape to type-check, and `render.ts` needs `renderHome` to exist for its dispatch — splitting them would leave the project uncompilable in between.

- [ ] **Step 1: Write the failing test for `renderHome`**

Create `src/view/renderHome.test.ts`:

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
    showHome: true,
    ...overrides,
  };
}

describe('renderHome', () => {
  it('shows buttons for Setup, Check Board Configuration, and Sync Board Configuration', () => {
    const html = renderHome(state());

    expect(html).toContain('id="kb-run-setup-home-btn"');
    expect(html).toContain('id="kb-run-check-board-config-btn"');
    expect(html).toContain('id="kb-run-sync-board-config-btn"');
  });

  it('shows the inline search box when there is no active work item', () => {
    const html = renderHome(state({ workItem: null }));

    expect(html).toContain('id="kb-search-input"');
    expect(html).not.toContain('id="kb-view-details-btn"');
  });

  it('shows the active work item card with switch/clear/view-details buttons when one is active', () => {
    const html = renderHome(state({ workItem: workItem() }));

    expect(html).toContain('kb-main-card');
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('id="kb-clear-btn"');
    expect(html).toContain('id="kb-view-details-btn"');
  });

  it('renders the config editor section', () => {
    const html = renderHome(state({ config: config({ backlogLevels: { Tasks: { 'To Do': null } } }) }));

    expect(html).toContain('data-level="Tasks"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/view/renderHome.test.ts`
Expected: FAIL — `Cannot find module './renderHome'`.

- [ ] **Step 3: Add `showHome` to `RenderState` and create `renderHome.ts`**

In `src/view/render.ts`, replace:

```ts
export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
}
```

with:

```ts
export interface RenderState {
  hasWorkspace: boolean;
  config: KanbrainConfig | null;
  workItem: WorkItem | null;
  parent: WorkItem | null;
  subtasks: WorkItem[];
  showHome: boolean;
}
```

Create `src/view/renderHome.ts`:

```ts
import type { RenderState } from './render';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderConfigEditor } from './renderConfigEditor';

function renderHomeWorkItemSection(state: RenderState): string {
  const config = state.config!;

  if (!state.workItem) {
    return `
      <div id="kb-search-section">
        <input id="kb-search-input" placeholder="Search by title or #id...">
        <div id="kb-search-results"></div>
      </div>
    `;
  }

  return `
    <div class="kb-header">
      <button id="kb-toggle-search-btn">🔍 Switch work item</button>
      <button id="kb-clear-btn">✕ Clear</button>
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
    ${renderWorkItemCard(state.workItem, config, 'kb-main-card')}
    <button id="kb-view-details-btn" class="kb-action-btn">View details →</button>
  `;
}

export function renderHome(state: RenderState): string {
  const config = state.config!;

  return `
    <div class="kb-home-section">
      <div class="kb-section-label">Commands</div>
      <div class="kb-home-commands">
        <button id="kb-run-setup-home-btn" class="kb-action-btn">⚙ Setup</button>
        <button id="kb-run-check-board-config-btn" class="kb-action-btn">✅ Check Board Configuration</button>
        <button id="kb-run-sync-board-config-btn" class="kb-action-btn">🔄 Sync Board Configuration</button>
      </div>
    </div>
    <div class="kb-home-section">
      <div class="kb-section-label">Current Work Item</div>
      ${renderHomeWorkItemSection(state)}
    </div>
    <div class="kb-home-section">
      <div class="kb-section-label">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
  `;
}
```

Note: both `render.ts` and `renderHome.ts` import `renderWorkItemCard` from Task 1's `src/view/renderWorkItemCard.ts` — there's no duplication and no runtime circular dependency between `render.ts` and `renderHome.ts` (the only thing `renderHome.ts` imports from `render.ts` is the `RenderState` **type**, which TypeScript erases at compile time).

- [ ] **Step 4: Run the `renderHome` test to verify it passes**

Run: `npx vitest run src/view/renderHome.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire the dispatch into `render()` and add the Home button to the focused view**

In `src/view/render.ts`, add the import:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
```

becomes:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { renderWorkItemCard } from './renderWorkItemCard';
import { renderHome } from './renderHome';
```

Replace the final part of `render()`:

```ts
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
      <button id="kb-toggle-search-btn">🔍 Switch work item</button>
      <button id="kb-clear-btn">✕ Clear</button>
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

with:

```ts
  if (state.showHome) {
    return renderHome(state);
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
      <button id="kb-home-btn">🏠 Home</button>
      <button id="kb-toggle-search-btn">🔍 Switch work item</button>
      <button id="kb-clear-btn">✕ Clear</button>
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

- [ ] **Step 6: Update `render.test.ts`**

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
    const html = render({ hasWorkspace: false, config: null, workItem: null, parent: null, subtasks: [], showHome: false });
    expect(html).toContain('Open a workspace folder');
  });

  it('shows a setup prompt when there is no config', () => {
    const html = render({ hasWorkspace: true, config: null, workItem: null, parent: null, subtasks: [], showHome: false });
    expect(html).toContain('Kanbrain: Setup');
  });

  it('shows a button to run Setup when there is no config', () => {
    const html = render({ hasWorkspace: true, config: null, workItem: null, parent: null, subtasks: [], showHome: false });
    expect(html).toContain('id="kb-run-setup-btn"');
  });

  it('delegates to the home screen when showHome is true', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], showHome: true });
    expect(html).toContain('kb-home-section');
  });

  it('shows a Home button on the focused screen', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('id="kb-home-btn"');
  });

  it('shows an inline search box when there is config but no active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: null, parent: null, subtasks: [], showHome: false });
    expect(html).toContain('id="kb-search-input"');
    expect(html).toContain('id="kb-search-results"');
  });

  it('escapes HTML in the work item title', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('Fix &lt;bug&gt; in login');
    expect(html).not.toContain('Fix <bug> in login');
  });

  it('shows a toggle-search button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('id="kb-toggle-search-btn"');
    expect(html).toContain('Switch work item');
  });

  it('shows a clear button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('id="kb-clear-btn"');
  });

  it('shows an action button when the status has a configured skill', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      showHome: false,
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
      showHome: false,
    });
    expect(html).not.toContain('data-action="run-skill"');
  });

  it('lists children with their own action buttons', () => {
    const subtasks = [workItem({ id: 101, title: 'Sub 1', status: 'Active' })];
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks, showHome: false });
    expect(html).toContain('Sub 1');
    expect(html).toContain('data-id="101"');
    expect(html).toContain('Children (1)');
  });

  it('shows an empty message when there are no children', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
    expect(html).toContain('No child items');
  });

  it('shows the status as a colored dot next to the plain status text', () => {
    const html = render({
      hasWorkspace: true,
      config,
      workItem: workItem({ status: 'Active' }),
      parent: null,
      subtasks: [],
      showHome: false,
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
      showHome: false,
    });
    expect(html).toContain('kb-type-icon');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
    expect(html).toContain('border-right: 4px solid #f2cb1d');
  });

  it('wraps the search section in an overlay dialog with a close button when there is an active work item', () => {
    const html = render({ hasWorkspace: true, config, workItem: workItem(), parent: null, subtasks: [], showHome: false });
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
      showHome: false,
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
      showHome: false,
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
      showHome: false,
    });
    const buttonIndex = html.indexOf('data-action="run-skill"');
    const buttonMarkup = html.slice(buttonIndex - 40, buttonIndex + 40);
    expect(buttonMarkup).not.toContain('background:');
  });
});
```

- [ ] **Step 7: Compile and run the full unit test suite**

Run: `npm run compile`
Expected: succeeds with no errors.

Run: `npm run test:unit`
Expected: PASS — all tests, including the 19 in `render.test.ts` (17 existing + 2 new) and the 4 in `renderHome.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/view/render.ts src/view/render.test.ts src/view/renderHome.ts src/view/renderHome.test.ts
git commit -m "feat: add the home screen with commands, work item, and config sections"
```

---

### Task 4: Wire the home screen into `KanbrainViewProvider`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `render(state: RenderState)` with the new `showHome` field (Task 3).

No dedicated test file — matches the existing pattern for this file (no VS Code API test harness in unit tests); verified by `npm run compile` and the full unit suite, plus the manual checklist (Task 5).

- [ ] **Step 1: Update imports**

Replace:

```ts
import { readConfig } from '../config/config';
import { resolveSkill } from '../config/resolveSkill';
```

with:

```ts
import * as path from 'node:path';
import { readConfig, writeConfig } from '../config/config';
import { resolveSkill } from '../config/resolveSkill';
import type { SkillEntry } from '../types';
```

(`type { WorkItem, KanbrainConfig }` on the line above stays as-is — add the new `SkillEntry` import as its own line since it's used by a new method's local variable type, not by `RenderState`.)

- [ ] **Step 2: Add the `showHome` field**

Replace:

```ts
  private backlogLevelCounts: Record<string, number> = {};
  private hasCheckedBoardConfig = false;
```

with:

```ts
  private backlogLevelCounts: Record<string, number> = {};
  private hasCheckedBoardConfig = false;
  private showHome = true;
```

- [ ] **Step 3: Update `setActiveWorkItem` and add `showHomeScreen`/`showFocusedScreen`**

Replace:

```ts
  setActiveWorkItem(id: number | undefined): void {
    this.activeWorkItemId = id;
    this.persistActiveWorkItem(id);
    this.lastState = '';
    void this.refresh();
  }
```

with:

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

- [ ] **Step 4: Add `saveSkillEntry` and `pickSkillFile`**

Add these two methods after `fetchBacklogLevelCounts`:

```ts
  private saveSkillEntry(level: string, status: string, filePath: string, label: string, textColor: string, buttonColor: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config || !config.backlogLevels[level] || !(status in config.backlogLevels[level])) {
      return;
    }

    const trimmedPath = filePath.trim();
    if (!trimmedPath) {
      config.backlogLevels[level][status] = null;
    } else {
      const entry: SkillEntry = { path: trimmedPath };
      if (label.trim()) {
        entry.label = label.trim();
      }
      if (textColor.trim()) {
        entry.textColor = textColor.trim();
      }
      if (buttonColor.trim()) {
        entry.buttonColor = buttonColor.trim();
      }
      config.backlogLevels[level][status] = entry;
    }

    writeConfig(this.workspaceRoot, config);
  }

  private async pickSkillFile(level: string, status: string): Promise<void> {
    if (!this.workspaceRoot || !this.view) {
      return;
    }
    const uris = await vscode.window.showOpenDialog({
      defaultUri: vscode.Uri.file(this.workspaceRoot),
      canSelectMany: false,
      filters: { Markdown: ['md'] },
    });
    const picked = uris?.[0];
    if (!picked) {
      return;
    }
    const relativePath = path.relative(this.workspaceRoot, picked.fsPath).split(path.sep).join('/');
    this.view.webview.postMessage({ type: 'skill-file-picked', level, status, path: relativePath });
  }
```

- [ ] **Step 5: Extend the message handler**

Replace:

```ts
    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.type === 'run-skill') {
        await this.runSkill(Number(message.id));
      } else if (message.type === 'search-work-items') {
        await this.searchWorkItems(String(message.query ?? ''));
      } else if (message.type === 'pick-work-item') {
        this.setActiveWorkItem(Number(message.id));
      } else if (message.type === 'clear-work-item') {
        this.setActiveWorkItem(undefined);
      } else if (message.type === 'run-setup') {
        await vscode.commands.executeCommand('kanbrain.setup');
      }
    });
```

with:

```ts
    webviewView.webview.onDidReceiveMessage(async message => {
      if (message.type === 'run-skill') {
        await this.runSkill(Number(message.id));
      } else if (message.type === 'search-work-items') {
        await this.searchWorkItems(String(message.query ?? ''));
      } else if (message.type === 'pick-work-item') {
        this.setActiveWorkItem(Number(message.id));
      } else if (message.type === 'clear-work-item') {
        this.setActiveWorkItem(undefined);
      } else if (message.type === 'run-setup') {
        await vscode.commands.executeCommand('kanbrain.setup');
      } else if (message.type === 'run-check-board-config') {
        await vscode.commands.executeCommand('kanbrain.checkBoardConfig');
      } else if (message.type === 'run-sync-board-config') {
        await vscode.commands.executeCommand('kanbrain.syncBoardConfig');
      } else if (message.type === 'show-home') {
        this.showHomeScreen();
      } else if (message.type === 'show-focused') {
        this.showFocusedScreen();
      } else if (message.type === 'save-skill-entry') {
        this.saveSkillEntry(
          String(message.level ?? ''),
          String(message.status ?? ''),
          String(message.path ?? ''),
          String(message.label ?? ''),
          String(message.textColor ?? ''),
          String(message.buttonColor ?? ''),
        );
      } else if (message.type === 'pick-skill-file') {
        await this.pickSkillFile(String(message.level ?? ''), String(message.status ?? ''));
      }
    });
```

- [ ] **Step 6: Pass `showHome` into `render()`**

Replace:

```ts
    this.view.webview.html = this.wrapHtml(render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks }));
```

with:

```ts
    this.view.webview.html = this.wrapHtml(
      render({ hasWorkspace: !!this.workspaceRoot, config, workItem, parent, subtasks, showHome: this.showHome }),
    );
```

- [ ] **Step 7: Update the webview script**

Replace the full `<script>` block inside `wrapHtml`:

```
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
      } else if (target.id === 'kb-clear-btn') {
        vscode.postMessage({ type: 'clear-work-item' });
      } else if (target.id === 'kb-run-setup-btn') {
        vscode.postMessage({ type: 'run-setup' });
      } else if (target.id === 'kb-search-close-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          section.classList.add('kb-hidden');
        }
      } else if (target.id === 'kb-search-section' && target.classList.contains('kb-search-overlay')) {
        target.classList.add('kb-hidden');
      } else if (target.dataset && target.dataset.action === 'run-skill') {
        vscode.postMessage({ type: 'run-skill', id: target.dataset.id });
      } else if (target.dataset && target.dataset.action === 'pick-work-item') {
        vscode.postMessage({ type: 'pick-work-item', id: target.dataset.id });
      } else if (target.dataset && target.dataset.action === 'toggle-group') {
        const items = target.nextElementSibling;
        if (items) {
          items.classList.toggle('kb-hidden');
        }
      } else if (target.dataset && target.dataset.action === 'select-tab') {
        activeSearchTab = target.dataset.tab;
        applySearchTab();
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
          applySearchTab();
        }
      }
    });

    const searchSection = document.getElementById('kb-search-section');
    if (searchSection && !searchSection.classList.contains('kb-hidden')) {
      vscode.postMessage({ type: 'search-work-items', query: '' });
    }
```

with:

```
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

    function saveSkillRow(row) {
      vscode.postMessage({
        type: 'save-skill-entry',
        level: row.dataset.level,
        status: row.dataset.status,
        path: row.querySelector('[data-field="path"]').value,
        label: row.querySelector('[data-field="label"]').value,
        textColor: row.querySelector('[data-field="textColor"]').value,
        buttonColor: row.querySelector('[data-field="buttonColor"]').value,
      });
    }

    document.querySelectorAll('.kb-config-row input').forEach((input) => {
      input.addEventListener('blur', () => {
        const row = input.closest('.kb-config-row');
        if (row) {
          saveSkillRow(row);
        }
      });
    });

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
      } else if (target.id === 'kb-clear-btn') {
        vscode.postMessage({ type: 'clear-work-item' });
      } else if (target.id === 'kb-run-setup-btn' || target.id === 'kb-run-setup-home-btn') {
        vscode.postMessage({ type: 'run-setup' });
      } else if (target.id === 'kb-run-check-board-config-btn') {
        vscode.postMessage({ type: 'run-check-board-config' });
      } else if (target.id === 'kb-run-sync-board-config-btn') {
        vscode.postMessage({ type: 'run-sync-board-config' });
      } else if (target.id === 'kb-home-btn') {
        vscode.postMessage({ type: 'show-home' });
      } else if (target.id === 'kb-view-details-btn') {
        vscode.postMessage({ type: 'show-focused' });
      } else if (target.id === 'kb-search-close-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          section.classList.add('kb-hidden');
        }
      } else if (target.id === 'kb-search-section' && target.classList.contains('kb-search-overlay')) {
        target.classList.add('kb-hidden');
      } else if (target.dataset && target.dataset.action === 'run-skill') {
        vscode.postMessage({ type: 'run-skill', id: target.dataset.id });
      } else if (target.dataset && target.dataset.action === 'pick-work-item') {
        vscode.postMessage({ type: 'pick-work-item', id: target.dataset.id });
      } else if (target.dataset && target.dataset.action === 'toggle-group') {
        const items = target.nextElementSibling;
        if (items) {
          items.classList.toggle('kb-hidden');
        }
      } else if (target.dataset && target.dataset.action === 'select-tab') {
        activeSearchTab = target.dataset.tab;
        applySearchTab();
      } else if (target.dataset && target.dataset.action === 'pick-skill-file') {
        const row = target.closest('.kb-config-row');
        if (row) {
          vscode.postMessage({ type: 'pick-skill-file', level: row.dataset.level, status: row.dataset.status });
        }
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
          applySearchTab();
        }
      } else if (event.data.type === 'skill-file-picked') {
        const rows = document.querySelectorAll('.kb-config-row');
        for (const row of rows) {
          if (row.dataset.level === event.data.level && row.dataset.status === event.data.status) {
            const pathInput = row.querySelector('[data-field="path"]');
            pathInput.value = event.data.path;
            saveSkillRow(row);
            break;
          }
        }
      }
    });

    const searchSection = document.getElementById('kb-search-section');
    if (searchSection && !searchSection.classList.contains('kb-hidden')) {
      vscode.postMessage({ type: 'search-work-items', query: '' });
    }
```

- [ ] **Step 8: Update the CSS**

Replace:

```ts
      #kb-toggle-search-btn, #kb-clear-btn { flex: 1; box-sizing: border-box; padding: 4px 6px; text-align: center; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      #kb-toggle-search-btn:hover, #kb-clear-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
```

with:

```ts
      #kb-toggle-search-btn, #kb-clear-btn, #kb-home-btn { flex: 1; box-sizing: border-box; padding: 4px 6px; text-align: center; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      #kb-toggle-search-btn:hover, #kb-clear-btn:hover, #kb-home-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
```

Replace:

```ts
      .kb-search-tab-empty { opacity: 0.5; }
    `;
```

with:

```ts
      .kb-search-tab-empty { opacity: 0.5; }
      .kb-home-section { margin-bottom: 16px; }
      .kb-home-commands { display: flex; flex-direction: column; gap: 4px; }
      .kb-input { box-sizing: border-box; width: 100%; padding: 4px 6px; margin-bottom: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; font-family: var(--vscode-font-family); font-size: 12px; }
      .kb-input:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
      .kb-config-level { margin-bottom: 8px; }
      .kb-config-row { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 6px; margin: 6px 0; }
      .kb-config-row-status { display: flex; align-items: center; font-weight: 600; margin-bottom: 4px; font-size: 12px; }
      .kb-config-field-path { display: flex; gap: 4px; align-items: center; }
      .kb-config-field-path .kb-input { flex: 1; margin-bottom: 0; }
      .kb-config-field-path button { flex-shrink: 0; padding: 4px 8px; background: var(--vscode-button-secondaryBackground, var(--vscode-button-background)); color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground)); border: none; border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); }
      .kb-config-field-path button:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); }
    `;
```

- [ ] **Step 9: Compile and run the full unit test suite**

Run: `npm run compile`
Expected: succeeds with no errors.

Run: `npm run test:unit`
Expected: PASS — all tests across the project.

- [ ] **Step 10: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: wire the home screen, navigation, and skill config editor into the webview"
```

---

### Task 5: Update the README

**Files:**
- Modify: `README.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Document the home screen**

In `README.md`, after the paragraph documenting `Kanbrain: Check Board Configuration`/`Kanbrain: Sync Board Configuration` (added in a previous change, ending "...only shows a message if something needs your attention."), add:

```markdown

When there's no active work item — or after clicking **🏠 Home** from the work item view — the panel shows a Home screen with three sections: **Commands** (buttons for Setup, Check Board Configuration, and Sync Board Configuration), **Current Work Item** (the active item with Switch/Clear, or the search box if none is active), and **Skill Configuration** (one editable row per backlog level/status, with a path field, a "…" button to browse for the skill file, and label/text color/button color fields — changes save automatically when you leave a field). The skill configuration editor only edits these values; it doesn't add or remove backlog levels, statuses, or types — that stays the job of Setup/Sync.
```

- [ ] **Step 2: Add manual verification checklist items**

After the existing line:

```
- [ ] A skill entry with a custom `label` shows that text on the action button instead of the skill file's name; a valid `textColor`/`buttonColor` is applied to the button, and an invalid or missing one falls back to the theme's default button colors.
```

insert:

```
- [ ] With no active work item, the panel shows the Home screen (Commands / Current Work Item / Skill Configuration sections) instead of a bare search box.
- [ ] Clicking a Commands button on Home runs the corresponding command (Setup, Check Board Configuration, Sync Board Configuration).
- [ ] With an active work item, clicking "🏠 Home" shows the Home screen with that item's card, Switch, and Clear in the Current Work Item section, without clearing the active work item; clicking "View details →" returns to the full card + children view.
- [ ] Editing a skill's path, label, text color, or button color in the Skill Configuration section and moving focus away (Tab or click elsewhere) persists the change to `.kanbrain/config.json` without a Save button; reopening Home shows the saved value.
- [ ] Clicking the "…" button next to a skill's path field opens a native file picker; choosing a `.md` file inside the workspace fills the path field with the relative path and saves it.
- [ ] Clearing a skill's path field and moving focus away sets that status back to no skill (`null`) — the action button disappears from that status's card.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/plans/2026-07-15-home-screen.md
git commit -m "docs: document the home screen and skill configuration editor"
```
