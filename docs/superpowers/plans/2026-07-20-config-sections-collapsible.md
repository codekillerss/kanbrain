# Collapsible Configuration Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each backlog-level group in the Configuration screen a collapsible accordion (collapsed by default), nest it visually inside a bordered "Skill Configuration" parent section, and right-align the assignee row on cards and search results.

**Architecture:** Pure markup/CSS change reusing the existing generic `data-action="toggle-group"` + `kb-hidden`-on-next-sibling toggle mechanism already used by the search modal's status groups — no new webview message types or client-side state. A small robustness fix makes that click handler use `.closest()` so clicks on the new chevron icon (a child element of the toggle button) still register.

**Tech Stack:** TypeScript, vitest, hand-written HTML strings + inline `<script>`/CSS in `KanbrainViewProvider` (same as the rest of this codebase).

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-20-config-sections-collapsible-design.md` — follow it for every visual/behavioral detail (collapsed-by-default levels, "Skill Configuration" always expanded with only a visual section frame, `:has()`-based chevron rotation, align-end scope).
- Run `npm run test:unit` (vitest) after every task. Run `npm run compile` (`tsc -p ./`) after Task 3 (the only task touching `KanbrainViewProvider.ts`, which has no dedicated test file).
- Match existing code style: single quotes, `escapeHtml` on any user-controlled string rendered into markup, template-literal HTML matching the surrounding indentation style already in each file.
- Do not touch `.kb-result-group`/`.kb-group-toggle` (the search modal's status grouping) beyond the shared click-handler robustness fix — its visual style is out of scope.

---

### Task 1: Collapsible backlog-level sections in `renderConfigEditor`

**Files:**
- Modify: `src/view/renderConfigEditor.ts`
- Test: `src/view/renderConfigEditor.test.ts`

**Interfaces:**
- Consumes: none new.
- Produces: `renderConfigEditor(config)` output — each backlog level is now `<div class="kb-config-level"><button class="kb-config-level-header" data-action="toggle-group"><span class="kb-chevron">▾</span>{level}</button><div class="kb-config-level-body kb-hidden">{rows}</div></div>`. `renderSkillEntryRow`'s own output (`.kb-config-row` and its contents) is unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderConfigEditor.test.ts` (inside `describe('renderConfigEditor', ...)`, after the last `it`):

```ts
  it('renders each level as a collapsible section with a chevron toggle header', () => {
    const html = renderConfigEditor(config({ backlogLevels: { Tasks: { 'To Do': null } } }));

    expect(html).toContain('class="kb-config-level-header"');
    expect(html).toContain('data-action="toggle-group"');
    expect(html).toContain('kb-chevron');
  });

  it('starts each level body collapsed (kb-hidden) by default', () => {
    const html = renderConfigEditor(config({ backlogLevels: { Tasks: { 'To Do': null } } }));

    expect(html).toContain('class="kb-config-level-body kb-hidden"');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/view/renderConfigEditor.test.ts`
Expected: FAIL — the current output has no `kb-config-level-header`, `kb-chevron`, or `kb-config-level-body` classes yet.

- [ ] **Step 3: Implement the collapsible level markup**

Edit `src/view/renderConfigEditor.ts` — replace the `renderConfigEditor` function body (the `.map(level => ...)` block):

```ts
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
          <button type="button" class="kb-config-level-header" data-action="toggle-group">
            <span class="kb-chevron">▾</span>${escapeHtml(level)}
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

(`renderColorField` and `renderSkillEntryRow` above it are unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/view/renderConfigEditor.test.ts`
Expected: PASS — all tests, including the pre-existing ones (`data-level="Tasks"`, `data-status="To Do"`, field values, escaping, status dot, picker button, color pickers — all still present, just nested one level deeper, which `toContain` doesn't care about).

- [ ] **Step 5: Commit**

```bash
git add src/view/renderConfigEditor.ts src/view/renderConfigEditor.test.ts
git commit -m "feat: make backlog-level config sections collapsible, collapsed by default"
```

---

### Task 2: "Skill Configuration" parent section frame in `renderConfig`

**Files:**
- Modify: `src/view/renderConfig.ts`
- Test: `src/view/renderConfig.test.ts`

**Interfaces:**
- Consumes: `renderConfigEditor` from Task 1 (unchanged call signature).
- Produces: `renderConfig(state)` output wraps the "Skill Configuration" label and the `renderConfigEditor(config)` call in `<div class="kb-config-parent-section"><div class="kb-config-parent-header">Skill Configuration</div>{editor output}</div>`.

- [ ] **Step 1: Write the failing test**

Add to `src/view/renderConfig.test.ts` (inside `describe('renderConfig', ...)`, after the last `it`):

```ts
  it('wraps Skill Configuration in a parent section container around the config editor', () => {
    const html = renderConfig(state({ config: config({ backlogLevels: { Tasks: { 'To Do': null } } }) }));

    const parentIndex = html.indexOf('kb-config-parent-section');
    const headerIndex = html.indexOf('Skill Configuration');
    const levelIndex = html.indexOf('data-level="Tasks"');

    expect(parentIndex).toBeGreaterThanOrEqual(0);
    expect(headerIndex).toBeGreaterThan(parentIndex);
    expect(levelIndex).toBeGreaterThan(headerIndex);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: FAIL — `kb-config-parent-section` doesn't exist in the output yet, so `parentIndex` is `-1` and the first assertion fails.

- [ ] **Step 3: Add the parent section wrapper**

Edit `src/view/renderConfig.ts`:

```ts
import type { RenderState } from './render';
import { renderConfigEditor } from './renderConfigEditor';

export function renderConfig(state: RenderState): string {
  const config = state.config!;

  return `
    <div class="kb-header kb-page-header">
      <button id="kb-home-btn" class="kb-secondary-btn">🏠 Home</button>
    </div>
    <div class="kb-section-label">Display</div>
    <label class="kb-checkbox-row">
      <input type="checkbox" id="kb-show-assignee-toggle" ${config.showAssignedTo === false ? '' : 'checked'}>
      Show assignee on cards
    </label>
    <div class="kb-config-parent-section">
      <div class="kb-config-parent-header">Skill Configuration</div>
      ${renderConfigEditor(config)}
    </div>
  `;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/view/renderConfig.test.ts`
Expected: PASS — all tests, including the pre-existing `data-level="Tasks"` and Home-button/sticky-header ones.

- [ ] **Step 5: Commit**

```bash
git add src/view/renderConfig.ts src/view/renderConfig.test.ts
git commit -m "feat: frame Skill Configuration as a parent section around backlog levels"
```

---

### Task 3: Toggle-click robustness, section CSS, and assignee right-alignment in `KanbrainViewProvider`

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts`

**Interfaces:**
- Consumes: `data-action="toggle-group"` markup produced by Task 1 (and the pre-existing `.kb-group-toggle` in `renderSearchResults`), `.kb-config-parent-section`/`.kb-config-parent-header` from Task 2.
- Produces: no new webview message types. Purely a click-handler robustness fix plus CSS additions.

There is no dedicated test file for `KanbrainViewProvider.ts` (same as noted in the prior plan — it's wired directly to the `vscode` API). Verification for this task is `npm run compile` plus the full `npm run test:unit` run to confirm nothing else regressed.

- [ ] **Step 1: Make the toggle-group click handler robust to clicks on child elements**

Edit `src/view/KanbrainViewProvider.ts`'s inline `<script>`, inside the `document.addEventListener('click', (e) => { ... })` handler. Replace:

```js
      } else if (target.dataset && target.dataset.action === 'toggle-group') {
        const items = target.nextElementSibling;
        if (items) {
          items.classList.toggle('kb-hidden');
        }
      } else if (target.dataset && target.dataset.action === 'select-tab') {
```

with:

```js
      } else if (target.closest && target.closest('[data-action="toggle-group"]')) {
        const toggle = target.closest('[data-action="toggle-group"]');
        const items = toggle.nextElementSibling;
        if (items) {
          items.classList.toggle('kb-hidden');
        }
      } else if (target.dataset && target.dataset.action === 'select-tab') {
```

(This is a straight substitution of that one `else if` branch — every other branch in the chain is unchanged. It now matches whether the click landed on the toggle button itself or on a child element like `.kb-chevron` or `.kb-status-dot` inside it.)

- [ ] **Step 2: Add the section-frame and chevron CSS**

In the `css()` method, replace the existing single-line rule:

```css
      .kb-config-level { margin-bottom: 8px; }
```

with:

```css
      .kb-config-parent-section { border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 8px; margin-top: 8px; background: var(--vscode-sideBarSectionHeader-background, transparent); }
      .kb-config-parent-header { font-size: 11px; text-transform: uppercase; opacity: 0.7; font-weight: 600; margin-bottom: 6px; }
      .kb-config-level { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin: 6px 0; }
      .kb-config-level-header { display: flex; align-items: center; width: 100%; text-align: left; padding: 6px 8px; background: var(--vscode-editor-background); border: none; cursor: pointer; color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: 12px; font-weight: 600; }
      .kb-config-level-header:hover { background: var(--vscode-list-hoverBackground); }
      .kb-config-level-body { padding: 6px 8px; }
      .kb-chevron { display: inline-block; margin-right: 6px; transition: transform 0.15s ease; }
      .kb-config-level-header:has(+ .kb-hidden) .kb-chevron { transform: rotate(-90deg); }
```

- [ ] **Step 3: Right-align the assignee rows**

In the same `css()` method, update these two existing rules by adding `justify-content: flex-end;`:

Replace:

```css
      .kb-assignee-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; opacity: 0.85; }
```

with:

```css
      .kb-assignee-row { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; opacity: 0.85; justify-content: flex-end; }
```

Replace:

```css
      .kb-result-item-assignee { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 11px; opacity: 0.75; }
```

with:

```css
      .kb-result-item-assignee { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 11px; opacity: 0.75; justify-content: flex-end; }
```

- [ ] **Step 4: Run compile and the full unit suite**

Run: `npm run compile && npm run test:unit`
Expected: compile exits 0, all tests PASS (this file has no dedicated unit tests, so a clean compile plus a green full suite is the acceptance bar for this task).

- [ ] **Step 5: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "feat: robust chevron toggle clicks, section framing CSS, right-aligned assignee rows"
```

---

## Final Verification

- [ ] Run `npm run test:unit` — full suite green.
- [ ] Run `npm run compile` — exits 0.
- [ ] Manually launch the extension (F5 in VS Code, "Run Extension"), open the Configuration screen, and confirm: "Skill Configuration" reads as a bordered container; each backlog level renders as its own bordered header row, collapsed by default; clicking anywhere on a level header (including directly on the ▾ chevron) toggles its status rows and rotates the chevron; on the main/subtask cards and in the search modal, the assignee avatar+name sit right-aligned.
