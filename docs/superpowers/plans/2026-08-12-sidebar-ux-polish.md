# Sidebar UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent UX fixes in the Kanbrain sidebar: auto-focus the search input when the search dialog opens, disable the "set as current" action (with a "Current" badge) for the current work item inside the Work Item History dialog, and make the current work item's title clickable (with hover) on the Home screen, matching the Flow screen.

**Architecture:** Each fix touches its own file(s) and is independently testable. Task 1 edits the inline webview script in `KanbrainViewProvider.ts` (no automated test coverage for that file — manual verification). Task 2 adds a parameter to the pure render function `renderWorkItemHistory` and threads the caller's already-tracked `activeWorkItemId` through it, covered by `renderWorkItemHistory.test.ts`. Task 3 flips one boolean argument in `renderHome.ts`, covered by `renderHome.test.ts`.

**Tech Stack:** TypeScript, VS Code Webview API, Vitest.

## Global Constraints

- Full spec: `docs/superpowers/specs/2026-08-12-sidebar-ux-polish-design.md`.
- Test command: `npm run test:unit` (vitest). Run scoped with `npx vitest run <path>` per task, full suite before the final commit.
- No automated test coverage exists for `KanbrainViewProvider.ts`'s inline webview script (Task 1) — verify by reading the generated code path, not by running a test.
- Badge/disabled styling must reuse existing VS Code theme CSS variables (`--vscode-badge-background`, `--vscode-badge-foreground`) and the existing `.kb-search-tab:disabled`-style pattern (`opacity: 0.5; cursor: default;`) — no new custom colors.

---

### Task 1: Auto-focus the search input when the search dialog opens

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts:975-985`

**Interfaces:**
- Consumes: nothing new — reuses the existing `#kb-search-input` element (already referenced at `KanbrainViewProvider.ts:1144`) and the existing click-delegation branch for `kb-toggle-search-btn` / `kb-footer-select-work-item-btn`.
- Produces: nothing consumed by later tasks (independent fix).

- [ ] **Step 1: Read the current branch to confirm exact text**

The relevant block (inside the `document.addEventListener('click', ...)` handler) currently reads:

```js
      if (target.id === 'kb-toggle-search-btn' || target.id === 'kb-footer-select-work-item-btn') {
        const section = document.getElementById('kb-search-section');
        if (section) {
          const wasHidden = section.classList.contains('kb-hidden');
          section.classList.toggle('kb-hidden');
          if (wasHidden) {
            vscode.postMessage({ type: 'search-work-items', query: '' });
          }
        }
      } else if (target.id === 'kb-history-btn') {
```

- [ ] **Step 2: Add the focus call**

Replace the block above with:

```js
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

Only the `if (wasHidden) { ... }` body changes — the new `document.getElementById('kb-search-input')?.focus();` line is added right after the existing `postMessage` call. Focus is only requested when the section transitions from hidden to visible (opening), not when closing it.

- [ ] **Step 3: Verify with the full-project build**

Run: `npm run compile`
Expected: no TypeScript errors (this file is plain string template content inside a `.ts` file — compile just confirms the surrounding TS still parses/type-checks cleanly).

- [ ] **Step 4: Manual verification note**

There is no automated test harness for the generated webview's inline script in this repo. Confirm by re-reading the edited block in `KanbrainViewProvider.ts` that: (a) the focus call is inside the `if (wasHidden)` branch, so re-clicking the toggle button while the dialog is already open does not steal focus, and (b) `kb-search-input` matches the id used in the existing `document.getElementById('kb-search-input')` reference at line ~1144 (the `input` event listener) — same id, no typo.

- [ ] **Step 5: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "fix: focus search input when opening the work item search dialog"
```

---

### Task 2: Disable "set as current" for the current work item in Work Item History

**Files:**
- Modify: `src/view/renderWorkItemHistory.ts`
- Modify: `src/view/KanbrainViewProvider.ts:211` (the `loadWorkItemHistory` call site) and the CSS block around `KanbrainViewProvider.ts:1334-1343`
- Test: `src/view/renderWorkItemHistory.test.ts`

**Interfaces:**
- Consumes: `KanbrainViewProvider`'s existing `this.activeWorkItemId: number | undefined` field (already set by `setActiveWorkItem`, read elsewhere in the same class).
- Produces: `renderWorkItemHistory(items: WorkItem[], config: KanbrainConfig, avatars?: Record<string, string>, currentWorkItemId?: number): string` — the new fourth parameter is optional so any other caller (none currently exist besides `KanbrainViewProvider`) keeps compiling unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/view/renderWorkItemHistory.test.ts` (inside the existing `describe('renderWorkItemHistory', ...)` block, after the last `it(...)`):

```ts
  it('disables the pick action and shows a badge for the current work item', () => {
    const html = renderWorkItemHistory([item(2, 'Newest'), item(1, 'Older')], config, {}, 1);
    expect(html).toContain('data-action="pick-work-item" data-id="1" disabled>');
    expect(html).toContain('kb-current-badge');
    expect(html).toContain('Current');
    expect(html).not.toContain('data-action="pick-work-item" data-id="2" disabled>');
  });

  it('does not disable the "View details" button for the current work item', () => {
    const html = renderWorkItemHistory([item(1, 'Older')], config, {}, 1);
    expect(html).toContain('data-action="open-work-item-detail" data-id="1">View details');
  });

  it('disables no items when currentWorkItemId is omitted', () => {
    const html = renderWorkItemHistory([item(2, 'Newest'), item(1, 'Older')], config);
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('kb-current-badge');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/view/renderWorkItemHistory.test.ts`
Expected: FAIL — the first two new tests fail because no item is ever disabled/badged yet (current signature ignores a 4th argument and ships no `disabled`/`kb-current-badge` output). The third test passes already (nothing to disable is the current behavior).

- [ ] **Step 3: Implement the parameter and conditional markup**

Replace the full contents of `src/view/renderWorkItemHistory.ts` with:

```ts
import type { KanbrainConfig, WorkItem } from '../types';
import { escapeHtml } from './escapeHtml';
import { renderAssigneeRow } from './renderAssignee';
import { renderStatusDot } from './renderStatusDot';
import { renderTypeAccent } from './renderTypeAccent';

export function renderWorkItemHistory(
  items: WorkItem[],
  config: KanbrainConfig,
  avatars: Record<string, string> = {},
  currentWorkItemId?: number,
): string {
  if (items.length === 0) {
    return '<div class="kb-empty">No work item history yet.</div>';
  }
  return items.map(item => {
    const { borderStyle, iconHtml } = renderTypeAccent(item.type, config);
    const assignee = config.showAssignedTo === false ? '' : renderAssigneeRow(item.assignedTo, avatars, 'kb-result-item-assignee');
    const isCurrent = item.id === currentWorkItemId;
    const currentBadge = isCurrent ? '<span class="kb-current-badge">Current</span>' : '';
    return `<div class="kb-result-item kb-history-item"${borderStyle}>
      <button type="button" class="kb-result-item-main" data-action="pick-work-item" data-id="${item.id}"${isCurrent ? ' disabled' : ''}>
        ${iconHtml}<span class="kb-result-item-title">#${item.id} ${escapeHtml(item.title)}</span>${currentBadge}
      </button>
      <div class="kb-history-item-status">${renderStatusDot(item.status, config.statusColors ?? {})}${escapeHtml(item.status)}</div>
      <div class="kb-result-item-footer kb-history-item-footer">
        ${assignee}
        <button type="button" class="kb-view-details-link" data-action="open-work-item-detail" data-id="${item.id}">View details</button>
      </div>
    </div>`;
  }).join('');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderWorkItemHistory.test.ts`
Expected: PASS (all tests in the file, old and new).

- [ ] **Step 5: Wire `activeWorkItemId` through from `KanbrainViewProvider`**

In `src/view/KanbrainViewProvider.ts`, find (around line 211):

```ts
      this.view.webview.postMessage({ type: 'work-item-history', html: renderWorkItemHistory(items, config, avatars) });
```

Replace with:

```ts
      this.view.webview.postMessage({ type: 'work-item-history', html: renderWorkItemHistory(items, config, avatars, this.activeWorkItemId) });
```

- [ ] **Step 6: Add the disabled/badge CSS**

In `src/view/KanbrainViewProvider.ts`, find this line (around line 1343):

```ts
      .kb-history-item .kb-view-details-link { flex-shrink: 0; }
```

Add two new rules immediately after it (same template-literal CSS block):

```ts
      .kb-history-item .kb-view-details-link { flex-shrink: 0; }
      .kb-result-item-main:disabled { opacity: 0.5; cursor: default; }
      .kb-result-item-main:disabled:hover { background: none; }
      .kb-current-badge { flex-shrink: 0; margin-left: 6px; padding: 1px 5px; border-radius: 8px; font-size: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
```

- [ ] **Step 7: Run the full unit test suite**

Run: `npm run test:unit`
Expected: PASS — confirms nothing else references `renderWorkItemHistory`'s 3-argument form in a way that broke (it's additive/optional, so this should be a no-op check).

- [ ] **Step 8: Commit**

```bash
git add src/view/renderWorkItemHistory.ts src/view/renderWorkItemHistory.test.ts src/view/KanbrainViewProvider.ts
git commit -m "fix: disable set-as-current for the current work item in history dialog"
```

---

### Task 3: Make the current work item's title clickable on the Home screen

**Files:**
- Modify: `src/view/renderHome.ts:31`
- Test: `src/view/renderHome.test.ts:130-133`

**Interfaces:**
- Consumes: `renderWorkItemCard(workItem, config, cssClass, showActionButton, avatars, clickableTitle, parent, showParent, selectedTeam, showPickButton)` — existing signature from `src/view/renderWorkItemCard.ts`, unchanged. Only the `clickableTitle` (6th, positional) argument passed by `renderHome.ts` changes.
- Produces: nothing consumed by later tasks (independent fix).

- [ ] **Step 1: Update the existing test to expect the new behavior**

In `src/view/renderHome.test.ts`, replace the test at lines 130-133:

```ts
  it('does not make the title clickable on the home screen card', () => {
    const html = renderHome(state({ workItem: workItem() }));
    expect(html).not.toContain('kb-title-clickable');
  });
```

with:

```ts
  it('makes the current work item title clickable on the home screen card', () => {
    const html = renderHome(state({ workItem: workItem() }));
    expect(html).toContain('kb-title-clickable');
    expect(html).toContain('data-action="open-work-item-detail" data-id="482"');
  });
```

(`workItem()`'s default `id` is `482`, defined at the top of this test file.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/view/renderHome.test.ts`
Expected: FAIL on the new assertions — `renderHome` still passes `clickableTitle = false`, so neither `kb-title-clickable` nor `data-action="open-work-item-detail"` appear in the output yet.

- [ ] **Step 3: Flip the `clickableTitle` argument**

In `src/view/renderHome.ts`, inside `renderHomeWorkItemSection`, find:

```ts
    ${renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars, false, null, false, state.selectedTeam)}
```

Replace with:

```ts
    ${renderWorkItemCard(state.workItem, config, 'kb-main-card', false, avatars, true, null, false, state.selectedTeam)}
```

(Only the 6th argument changes from `false` to `true`; `showActionButton` — the 4th argument — stays `false`, matching today's Home behavior of not showing the skill action button.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/view/renderHome.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Run the full unit test suite**

Run: `npm run test:unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/view/renderHome.ts src/view/renderHome.test.ts
git commit -m "fix: make current work item title clickable on the home screen"
```
