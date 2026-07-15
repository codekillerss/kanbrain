# Search Result Type Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each item in the "Trocar work item" search results list show the real Azure DevOps type icon and a colored right border (matching the active card's styling), so the work item type (PBI, Bug, custom type, etc.) is visible at a glance.

**Architecture:** Extract the icon/border-by-type logic that already lives inline inside `renderWorkItemCard` (`src/view/render.ts`) into a small standalone module, `renderTypeAccent`, and reuse it from both `render.ts` and `renderSearchResults.ts`. `renderSearchResults` changes its second parameter from a bare `statusColors` map to the full `KanbrainConfig`, since it now needs `typeColors`/`typeIcons` too.

**Tech Stack:** TypeScript, Vitest (`npm run test:unit`), `tsc` (`npm run compile`).

## Global Constraints

- Search result items stay compact — one line per item, no per-item status dot/text (the group header already shows status) and no action button (clicking an item only selects it as active, per existing behavior).
- The colored border uses the exact same style as the active card: `border-right: 4px solid <normalized hex>;`.
- No behavior change to the active/subtask card (`renderWorkItemCard`) — the extraction must be a pure refactor there.
- Reuse `isValidHexColor`/`normalizeHex` from `src/view/badgeColor.ts` — do not reimplement hex validation.

---

### Task 1: Extract `renderTypeAccent` and refactor `render.ts` to use it

**Files:**
- Create: `src/view/renderTypeAccent.ts`
- Create: `src/view/renderTypeAccent.test.ts`
- Modify: `src/view/render.ts:1-41`

**Interfaces:**
- Produces: `renderTypeAccent(type: string, config: KanbrainConfig): { borderStyle: string; iconHtml: string }` — exported from `src/view/renderTypeAccent.ts`. `borderStyle` is either `''` or a string starting with a leading space, e.g. `' style="border-right: 4px solid #f2cb1d;"'`. `iconHtml` is either `''` or `'<span class="kb-type-icon">' + <raw svg markup> + '</span>'`.

- [ ] **Step 1: Write the failing test**

Create `src/view/renderTypeAccent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderTypeAccent } from './renderTypeAccent';
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

describe('renderTypeAccent', () => {
  it('returns a border-right style when the type has a valid configured color', () => {
    const { borderStyle } = renderTypeAccent('Task', config({ typeColors: { Task: 'f2cb1d' } }));
    expect(borderStyle).toBe(' style="border-right: 4px solid #f2cb1d;"');
  });

  it('returns an empty border when the type has no configured color', () => {
    const { borderStyle } = renderTypeAccent('Task', config());
    expect(borderStyle).toBe('');
  });

  it('returns an empty border when the configured color is invalid', () => {
    const { borderStyle } = renderTypeAccent('Task', config({ typeColors: { Task: 'not-a-color' } }));
    expect(borderStyle).toBe('');
  });

  it('returns an icon span when the type has a configured icon', () => {
    const { iconHtml } = renderTypeAccent('Task', config({ typeIcons: { Task: '<svg><path d="M0 0"/></svg>' } }));
    expect(iconHtml).toBe('<span class="kb-type-icon"><svg><path d="M0 0"/></svg></span>');
  });

  it('returns an empty icon when the type has no configured icon', () => {
    const { iconHtml } = renderTypeAccent('Task', config());
    expect(iconHtml).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- renderTypeAccent`
Expected: FAIL — `Cannot find module './renderTypeAccent'` (or similar resolution error), since the module doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/view/renderTypeAccent.ts`:

```ts
import type { KanbrainConfig } from '../types';
import { isValidHexColor, normalizeHex } from './badgeColor';

export interface TypeAccent {
  borderStyle: string;
  iconHtml: string;
}

export function renderTypeAccent(type: string, config: KanbrainConfig): TypeAccent {
  const typeColor = config.typeColors?.[type];
  const typeIcon = config.typeIcons?.[type];
  const borderStyle = typeColor && isValidHexColor(typeColor) ? ` style="border-right: 4px solid ${normalizeHex(typeColor)};"` : '';
  const iconHtml = typeIcon ? `<span class="kb-type-icon">${typeIcon}</span>` : '';
  return { borderStyle, iconHtml };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- renderTypeAccent`
Expected: PASS (5 tests)

- [ ] **Step 5: Refactor `render.ts` to use `renderTypeAccent`**

In `src/view/render.ts`, replace the import on line 5:

```ts
import { isValidHexColor, normalizeHex } from './badgeColor';
```

with:

```ts
import { renderTypeAccent } from './renderTypeAccent';
```

Replace the body of `renderWorkItemCard` (lines 24-41):

```ts
function renderWorkItemCard(workItem: WorkItem, config: KanbrainConfig, cssClass: string): string {
  const typeColor = config.typeColors?.[workItem.type];
  const typeIcon = config.typeIcons?.[workItem.type];
  const borderStyle = typeColor && isValidHexColor(typeColor) ? ` style="border-right: 4px solid ${normalizeHex(typeColor)};"` : '';
  const iconHtml = typeIcon ? `<span class="kb-type-icon">${typeIcon}</span>` : '';

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

with:

```ts
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
```

- [ ] **Step 6: Run the full unit test suite to confirm no regression**

Run: `npm run test:unit`
Expected: PASS — all existing tests, including `render.test.ts`'s `'shows the type icon and a colored right border instead of a type badge'` case, still pass unchanged (this was a pure refactor).

- [ ] **Step 7: Commit**

```bash
git add src/view/renderTypeAccent.ts src/view/renderTypeAccent.test.ts src/view/render.ts
git commit -m "refactor: extract renderTypeAccent from renderWorkItemCard"
```

---

### Task 2: Style search result items with type icon + colored border

**Files:**
- Modify: `src/view/renderSearchResults.ts`
- Modify: `src/view/renderSearchResults.test.ts`

**Interfaces:**
- Consumes: `renderTypeAccent(type: string, config: KanbrainConfig): { borderStyle: string; iconHtml: string }` from Task 1.
- Produces: `renderSearchResults(items: WorkItem[], config: KanbrainConfig): string` (signature changed — second parameter was `statusColors: Record<string, string>`, now the full `KanbrainConfig`). Task 3 depends on this new signature.

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
    expect(renderSearchResults([], config())).toContain('Nenhum work item encontrado.');
  });

  it('groups results into collapsible status sections with counts', () => {
    const items = [workItem({ id: 1, status: 'Active' }), workItem({ id: 2, status: 'New' })];

    const html = renderSearchResults(items, config());

    expect(html).toContain('Active (1)');
    expect(html).toContain('New (1)');
    expect(html).toContain('data-action="toggle-group"');
    expect(html).toContain('kb-group-items');
  });

  it('renders each item as a pickable button with its id, escaping the title', () => {
    const html = renderSearchResults([workItem({ id: 482, title: 'Corrigir <bug>' })], config());

    expect(html).toContain('data-action="pick-work-item"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('Corrigir &lt;bug&gt;');
    expect(html).not.toContain('Corrigir <bug>');
  });

  it('shows a status dot on the group header when a color is known for the status', () => {
    const html = renderSearchResults([workItem({ status: 'Active' })], config({ statusColors: { Active: 'b2b2b2' } }));

    expect(html).toContain('kb-status-dot');
    expect(html).toContain('#b2b2b2');
  });

  it('shows the type icon and a colored right border on each item', () => {
    const html = renderSearchResults(
      [workItem({ type: 'Task' })],
      config({ typeColors: { Task: 'f2cb1d' }, typeIcons: { Task: '<svg><path d="M0 0"/></svg>' } }),
    );

    expect(html).toContain('kb-type-icon');
    expect(html).toContain('<svg><path d="M0 0"/></svg>');
    expect(html).toContain('border-right: 4px solid #f2cb1d');
  });

  it('omits the icon and border when the type has no configured color or icon', () => {
    const html = renderSearchResults([workItem({ type: 'Task' })], config());

    expect(html).not.toContain('kb-type-icon');
    expect(html).not.toContain('border-right');
  });

  it('does not show an action button on search result items', () => {
    const html = renderSearchResults([workItem({ id: 482 })], config());

    expect(html).not.toContain('data-action="run-skill"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- renderSearchResults`
Expected: FAIL — TypeScript errors passing `config()`/`config({...})` where `renderSearchResults` still expects `Record<string, string>` as the second argument (or, if types are loose enough to still compile, the new icon/border assertions fail because the current implementation never emits `kb-type-icon`/`border-right`).

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/view/renderSearchResults.ts`:

```ts
import type { WorkItem, KanbrainConfig } from '../types';
import { escapeHtml } from './escapeHtml';
import { groupByStatus } from './groupByStatus';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';

export function renderSearchResults(items: WorkItem[], config: KanbrainConfig): string {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- renderSearchResults`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/view/renderSearchResults.ts src/view/renderSearchResults.test.ts
git commit -m "feat: show type icon and colored border on search result items"
```

---

### Task 3: Wire the new signature into `KanbrainViewProvider` and update CSS

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts:76`
- Modify: `src/view/KanbrainViewProvider.ts:229` (CSS block inside the `css()` method)

**Interfaces:**
- Consumes: `renderSearchResults(items: WorkItem[], config: KanbrainConfig): string` from Task 2. `config` here is the already-validated, non-null `KanbrainConfig` local variable in `searchWorkItems` (guarded by the existing `if (!config) { return; }` a few lines above).

There is no automated test for `KanbrainViewProvider` (it requires the real VS Code API, and per the project's existing pattern, webview wiring is verified with `npm run compile` plus the manual checklist in `README.md`). This task is verified by a successful `tsc` compile.

- [ ] **Step 1: Update the call site**

In `src/view/KanbrainViewProvider.ts`, in `searchWorkItems`, replace line 76:

```ts
      html = renderSearchResults(filterSearchResults(items, query), config.statusColors ?? {});
```

with:

```ts
      html = renderSearchResults(filterSearchResults(items, query), config);
```

- [ ] **Step 2: Update the CSS for `.kb-result-item`**

In the same file, inside the `css()` method, replace:

```ts
      .kb-result-item { display: block; width: 100%; text-align: left; padding: 4px 6px; margin: 2px 0; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); }
```

with:

```ts
      .kb-result-item { display: flex; align-items: center; width: 100%; text-align: left; padding: 4px 6px; margin: 2px 0; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-family: var(--vscode-font-family); }
```

(`.kb-type-icon` already has `margin-right: 6px`, so no extra `gap` is needed — this matches how `.kb-card-header` spaces its icon today.)

- [ ] **Step 3: Compile to verify no type errors**

Run: `npm run compile`
Expected: succeeds with no errors (confirms no other caller still passes the old `statusColors` argument).

- [ ] **Step 4: Run the full unit test suite**

Run: `npm run test:unit`
Expected: PASS — all tests across the project, including Tasks 1 and 2.

- [ ] **Step 5: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: wire type-styled search results into the webview"
```

---

### Task 4: Update the README manual verification checklist

**Files:**
- Modify: `README.md:87`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Add a checklist item**

In `README.md`, after the existing line:

```
- [ ] Each status section in the search results can be collapsed/expanded by clicking its header, independently of the others.
```

insert:

```
- [ ] Each work item in the search results list shows the real Azure DevOps type icon and a colored right border matching that type's color, without a status dot or action button on the item itself.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add manual verification step for search result type styling"
```
