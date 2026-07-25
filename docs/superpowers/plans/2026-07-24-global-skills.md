# Global Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user define skills that aren't tied to any work item type/status ("global skills"), and run one of them on the current work item's card via a small dropdown next to the existing status-skill button — even when the card has no status skill at all.

**Architecture:** New optional `config.globalSkills: Record<string, SkillEntry>` map (same shape as `repositories`). A new "Global Skills" section in the Skill Configuration screen provides CRUD (add/edit/remove), mirroring the existing per-status skill rows and their message-passing plumbing. The card's skill-execution path in `KanbrainViewProvider` is split into a shared `executeSkill` used by both the existing status-skill flow and the new global-skill flow. The card gains a native `<select>` next to the status-skill button, populated from `config.globalSkills`, that runs the chosen skill immediately on selection (one-off action, not a sticky state).

**Tech Stack:** TypeScript, VS Code Webview API (`enableScripts: true` sidebar view — plain DOM APIs in the inline `<script>`, no framework), Vitest.

## Global Constraints

- `globalSkills` is optional and keyed by a stable string `id` (not an array index) — generated once as `global-skill-${Date.now()}` when a row is added, never regenerated. (Spec: "Modelo de dados")
- The global-skill dropdown only ever lists entries from `config.globalSkills` — never skills already assigned to some other type/status. (Spec: "Fora do escopo")
- Selecting a global skill from the dropdown is a one-off action: it runs immediately and the control resets to its placeholder — it does not become the card's new default skill. (Spec: "Design" — seta abre menu, escolher roda na hora)
- If a card has no status skill but does have global skills available, the `▾` select still renders on its own (no `▶` button). If there are no global skills configured at all, no select renders — identical to today's behavior. (Spec: "Escopo")
- `syncConfig()` must pass `config.globalSkills` through unchanged — it is never discovered from Azure DevOps. (Spec: "Modelo de dados")
- No migration needed — `globalSkills` is a new optional field; configs without it behave as an empty map. (Spec: "Fora de escopo")
- `KanbrainViewProvider.ts` has no automated test suite (verified: no `KanbrainViewProvider.test.ts` exists) — its changes are verified by `npm run compile` + the existing suite staying green + manual F5 verification, consistent with prior specs in this repo.

---

### Task 1: Data model — `globalSkills` field + sync pass-through

**Files:**
- Modify: `src/types.ts:83-96` (`KanbrainConfig` interface)
- Modify: `src/config/syncConfig.ts:54-67` (return object)
- Test: `src/config/syncConfig.test.ts`

**Interfaces:**
- Produces: `KanbrainConfig.globalSkills?: Record<string, SkillEntry>` — consumed by every later task.

- [ ] **Step 1: Write the failing test**

Add to `src/config/syncConfig.test.ts`, inside the existing `describe('syncConfig', ...)` block (after the `showAssignedTo` tests, before the closing `});` at line 125):

```ts
  it('preserves globalSkills unchanged across a sync', () => {
    const withGlobal = config({ globalSkills: { 'global-skill-1': { path: 'effort.md', label: 'Avaliar Effort' } } });
    const result = syncConfig(withGlobal, { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.globalSkills).toEqual({ 'global-skill-1': { path: 'effort.md', label: 'Avaliar Effort' } });
  });

  it('leaves globalSkills undefined when it was never set', () => {
    const result = syncConfig(config(), { Task: { 'To Do': 'Proposed' } }, {}, {}, {}, 'MyProject Team', {}, {}, {});
    expect(result.globalSkills).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- syncConfig`
Expected: FAIL — `result.globalSkills` is `undefined` in the first new test (expected the preserved object), because `syncConfig` doesn't return the field yet and the `KanbrainConfig` type doesn't declare it (TS will also flag `globalSkills` as an unknown property on the `config()` overrides call — that compile error is itself part of "fails").

- [ ] **Step 3: Add the field to `KanbrainConfig`**

In `src/types.ts`, inside the `KanbrainConfig` interface (right after `repositories?: Record<string, RepositoryPathEntry>;` at line 95):

```ts
  repositories?: Record<string, RepositoryPathEntry>;
  globalSkills?: Record<string, SkillEntry>;
}
```

- [ ] **Step 4: Pass `globalSkills` through in `syncConfig`**

In `src/config/syncConfig.ts`, the function signature and return object both need the field. Change the return object (currently lines 54-66):

```ts
  return {
    organization: config.organization,
    project: config.project,
    defaultTeam: freshDefaultTeam,
    skills,
    statusColors: freshStatusColors,
    typeColors: freshTypeColors,
    typeIcons: freshTypeIcons,
    cardSettingsByTeam: freshCardSettingsByTeam,
    taskBacklogTypesByTeam: freshTaskBacklogTypesByTeam,
    showAssignedTo: config.showAssignedTo,
    repositories: mergeRepositories(config.repositories, freshRepositories),
    globalSkills: config.globalSkills,
  };
```

(No parameter added to `syncConfig`'s signature — `globalSkills` isn't "fresh"/discovered data like the other parameters, it comes straight from the existing `config` argument already in scope, same treatment as `showAssignedTo`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- syncConfig`
Expected: PASS — both new tests green, plus all pre-existing `syncConfig` tests still passing (the `config()` test fixture in `syncConfig.test.ts` doesn't set `globalSkills`, so those calls are unaffected).

- [ ] **Step 6: Full compile check**

Run: `npm run compile`
Expected: PASS — no other file references `KanbrainConfig` exhaustively (it's an interface with several other optional fields already), so adding one more optional field breaks nothing else.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/config/syncConfig.ts src/config/syncConfig.test.ts
git commit -m "feat: add globalSkills field to KanbrainConfig, preserved across sync"
```

---

### Task 2: Execution refactor — shared `executeSkill` + `run-global-skill` message

**Files:**
- Modify: `src/view/KanbrainViewProvider.ts:47-101` (message switch), `:312-345` (`runSkill`)

**Interfaces:**
- Consumes: `KanbrainConfig.globalSkills` (Task 1).
- Produces: `private async runGlobalSkill(id: number, skillId: string): Promise<void>` and `private async executeSkill(workItem: WorkItem, skill: SkillEntry): Promise<void>` — not consumed by other tasks directly (the card's UI in Task 4 talks to this only through the `run-global-skill` postMessage contract: `{ type: 'run-global-skill', workItemId: <number as string>, skillId: <string> }`).

- [ ] **Step 1: Split `runSkill` into a shared `loadWorkItemForSkill` + `executeSkill`, and add `runGlobalSkill`**

In `src/view/KanbrainViewProvider.ts`, replace the current `runSkill` method (lines 312-345):

```ts
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

    const skill = resolveSkill(config, workItem);
    if (!skill) {
      return;
    }

    const [parent] = workItem.parentId
      ? await this.client.getWorkItems(config.organization, config.project, [workItem.parentId])
      : [];
    const subtasks = await this.client.getChildren(config.organization, config.project, workItem);
    const branch = await this.getCurrentBranch();

    const relativePath = generateContextFile(this.workspaceRoot, skill.path, {
      workItem,
      parent: parent ?? null,
      subtasks,
      branch,
    });

    sendReadCommand(relativePath);
  }
```

with:

```ts
  private async runSkill(id: number): Promise<void> {
    const found = await this.loadWorkItemForSkill(id);
    if (!found) {
      return;
    }
    const skill = resolveSkill(found.config, found.workItem);
    if (!skill) {
      return;
    }
    await this.executeSkill(found.workItem, skill);
  }

  private async runGlobalSkill(id: number, skillId: string): Promise<void> {
    const found = await this.loadWorkItemForSkill(id);
    if (!found) {
      return;
    }
    const skill = found.config.globalSkills?.[skillId];
    if (!skill) {
      return;
    }
    await this.executeSkill(found.workItem, skill);
  }

  private async loadWorkItemForSkill(id: number): Promise<{ config: KanbrainConfig; workItem: WorkItem } | null> {
    if (!this.workspaceRoot || !this.client) {
      return null;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return null;
    }
    const [workItem] = await this.client.getWorkItems(config.organization, config.project, [id]);
    if (!workItem) {
      return null;
    }
    return { config, workItem };
  }

  private async executeSkill(workItem: WorkItem, skill: SkillEntry): Promise<void> {
    if (!this.workspaceRoot || !this.client) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    const [parent] = workItem.parentId
      ? await this.client.getWorkItems(config.organization, config.project, [workItem.parentId])
      : [];
    const subtasks = await this.client.getChildren(config.organization, config.project, workItem);
    const branch = await this.getCurrentBranch();

    const relativePath = generateContextFile(this.workspaceRoot, skill.path, {
      workItem,
      parent: parent ?? null,
      subtasks,
      branch,
    });

    sendReadCommand(relativePath);
  }
```

(`executeSkill` re-reads `config` rather than taking it as a parameter — `loadWorkItemForSkill`'s `config` could theoretically be stale by the time a slow work-item fetch resolves; re-reading keeps the same freshness guarantee `runSkill` already had, at negligible cost since `readConfig` is a local file read.)

- [ ] **Step 2: Wire the `run-global-skill` message**

In the `onDidReceiveMessage` handler (`src/view/KanbrainViewProvider.ts`, inside the `if`/`else if` chain, right after the existing `run-skill` branch at lines 48-49):

```ts
      if (message.type === 'run-skill') {
        await this.runSkill(Number(message.id));
      } else if (message.type === 'run-global-skill') {
        await this.runGlobalSkill(Number(message.workItemId), String(message.skillId ?? ''));
      } else if (message.type === 'search-work-items') {
```

- [ ] **Step 3: Compile and run the full test suite**

Run: `npm run compile && npm run test:unit`
Expected: PASS — 482 pre-existing tests still green (no test file targets `KanbrainViewProvider.ts` directly), no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/view/KanbrainViewProvider.ts
git commit -m "refactor: share skill execution between status and global skill runs"
```

---

### Task 3: Skill Configuration screen — Global Skills CRUD section

**Files:**
- Modify: `src/view/renderConfigEditor.ts` (new section + row renderer)
- Modify: `src/view/KanbrainViewProvider.ts` (message handlers + inline webview script)
- Test: `src/view/renderConfigEditor.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.globalSkills` (Task 1).
- Produces: rows with `data-global-skill-id="<id>"` and a `<button data-action="add-global-skill">` — consumed by the webview script added in this same task (not by other tasks).

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderConfigEditor.test.ts`, inside the `describe('renderConfigEditor', ...)` block (after the last existing `it`, before the closing `});`):

```ts
  it('renders a Global Skills section with one row per entry', () => {
    const html = renderConfigEditor(config({ globalSkills: { 'global-skill-1': { path: '.kanbrain/skills/effort.md', label: 'Avaliar Effort' } } }));

    expect(html).toContain('Global Skills');
    expect(html).toContain('data-global-skill-id="global-skill-1"');
    expect(html).toContain('value=".kanbrain/skills/effort.md"');
    expect(html).toContain('value="Avaliar Effort"');
  });

  it('shows the Global Skills section even when there are no work item types configured', () => {
    const html = renderConfigEditor(config());

    expect(html).toContain('No work item types configured yet.');
    expect(html).toContain('Global Skills');
    expect(html).toContain('data-action="add-global-skill"');
  });

  it('shows a remove button for each global skill row', () => {
    const html = renderConfigEditor(config({ globalSkills: { 'global-skill-1': { path: 'x.md' } } }));

    expect(html).toContain('data-action="remove-global-skill"');
    expect(html).toContain('data-global-skill-id="global-skill-1"');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- renderConfigEditor`
Expected: FAIL — none of the three new assertions find a match, since `renderConfigEditor` doesn't render a Global Skills section yet.

- [ ] **Step 3: Implement the section in `renderConfigEditor.ts`**

In `src/view/renderConfigEditor.ts`, add two new functions and call the section from `renderConfigEditor`:

```ts
function renderGlobalSkillRow(id: string, entry: SkillEntry): string {
  const path = entry.path ?? '';
  const label = entry.label ?? '';
  const textColor = entry.textColor ?? '';
  const buttonColor = entry.buttonColor ?? '';

  return `
    <div class="kb-config-row" data-global-skill-id="${escapeHtml(id)}">
      <div class="kb-config-field-path">
        <input type="text" class="kb-input" data-field="path" placeholder="Skill file path" value="${escapeHtml(path)}">
        <button type="button" data-action="pick-skill-file" title="Browse for a file">…</button>
      </div>
      <input type="text" class="kb-input" data-field="label" placeholder="Label" value="${escapeHtml(label)}">
      ${renderColorField('textColor', textColor, 'Text color hex')}
      ${renderColorField('buttonColor', buttonColor, 'Button color hex')}
      <button type="button" class="kb-icon-btn" data-action="remove-global-skill" data-global-skill-id="${escapeHtml(id)}" title="Remove">✕</button>
    </div>
  `;
}

function renderGlobalSkillsSection(globalSkills: Record<string, SkillEntry>): string {
  const rows = Object.entries(globalSkills)
    .map(([id, entry]) => renderGlobalSkillRow(id, entry))
    .join('');
  return `
    <div class="kb-config-level">
      <div class="kb-config-static-header">Global Skills</div>
      <div class="kb-config-level-body">
        ${rows}
        <button type="button" class="kb-secondary-btn" data-action="add-global-skill">+ Add global skill</button>
      </div>
    </div>
  `;
}
```

Change `renderConfigEditor` (currently lines 37-62) to include the section in both the empty-types branch and the normal branch:

```ts
export function renderConfigEditor(config: KanbrainConfig): string {
  const types = Object.keys(config.skills);
  const globalSkillsHtml = renderGlobalSkillsSection(config.globalSkills ?? {});

  if (types.length === 0) {
    return `<div class="kb-empty">No work item types configured yet.</div>${globalSkillsHtml}`;
  }

  const typesHtml = types
    .map(type => {
      const statuses = config.skills[type];
      const rows = Object.keys(statuses)
        .map(status => renderSkillEntryRow(type, status, statuses[status], config.statusColors ?? {}))
        .join('');
      const { borderStyle, iconHtml } = renderTypeAccent(type, config);
      return `
        <div class="kb-config-level">
          <button type="button" class="kb-config-level-header" data-action="toggle-group"${borderStyle}>
            <span class="kb-chevron">▾</span>${iconHtml}${escapeHtml(type)}
          </button>
          <div class="kb-config-level-body kb-hidden">
            ${rows}
          </div>
        </div>
      `;
    })
    .join('');

  return typesHtml + globalSkillsHtml;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- renderConfigEditor`
Expected: PASS — all 3 new tests plus all pre-existing `renderConfigEditor` tests green (the empty-types test still finds "No work item types configured yet." via `toContain`, unaffected by the appended section).

- [ ] **Step 5: Add CSS for the static section header**

In `src/view/KanbrainViewProvider.ts`, inside `css()` (right after the `.kb-config-level-body` rule, currently line 733):

```ts
      .kb-config-level-body { padding: 6px 8px; }
      .kb-config-static-header { padding: 6px 8px; font-family: var(--vscode-font-family); font-size: 12px; font-weight: 600; color: var(--vscode-foreground); }
```

- [ ] **Step 6: Wire the new messages server-side**

In `src/view/KanbrainViewProvider.ts`, add four new methods (near `saveSkillEntry`/`pickSkillFile`, e.g. right after `pickSkillFile` at line 281):

```ts
  private addGlobalSkill(): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config) {
      return;
    }
    const id = `global-skill-${Date.now()}`;
    config.globalSkills = { ...(config.globalSkills ?? {}), [id]: { path: '' } };
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }

  private saveGlobalSkillEntry(id: string, filePath: string, label: string, textColor: string, buttonColor: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config?.globalSkills?.[id]) {
      return;
    }
    const entry: SkillEntry = { path: filePath.trim() };
    if (label.trim()) {
      entry.label = label.trim();
    }
    if (textColor.trim()) {
      entry.textColor = textColor.trim();
    }
    if (buttonColor.trim()) {
      entry.buttonColor = buttonColor.trim();
    }
    config.globalSkills[id] = entry;
    writeConfig(this.workspaceRoot, config);
  }

  private removeGlobalSkill(id: string): void {
    if (!this.workspaceRoot) {
      return;
    }
    const config = readConfig(this.workspaceRoot);
    if (!config?.globalSkills?.[id]) {
      return;
    }
    delete config.globalSkills[id];
    writeConfig(this.workspaceRoot, config);
    this.lastState = '';
    void this.refresh();
  }

  private async pickGlobalSkillFile(id: string): Promise<void> {
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
    this.view.webview.postMessage({ type: 'global-skill-file-picked', id, path: relativePath });
  }
```

And register the four message types in `onDidReceiveMessage` (right after the existing `pick-skill-file` branch, lines 86-87):

```ts
      } else if (message.type === 'pick-skill-file') {
        await this.pickSkillFile(String(message.level ?? ''), String(message.status ?? ''));
      } else if (message.type === 'add-global-skill') {
        this.addGlobalSkill();
      } else if (message.type === 'save-global-skill-entry') {
        this.saveGlobalSkillEntry(
          String(message.id ?? ''),
          String(message.path ?? ''),
          String(message.label ?? ''),
          String(message.textColor ?? ''),
          String(message.buttonColor ?? ''),
        );
      } else if (message.type === 'remove-global-skill') {
        this.removeGlobalSkill(String(message.id ?? ''));
      } else if (message.type === 'pick-global-skill-file') {
        await this.pickGlobalSkillFile(String(message.id ?? ''));
      } else if (message.type === 'set-show-assigned-to') {
```

- [ ] **Step 7: Wire the webview script**

In `src/view/KanbrainViewProvider.ts`, inside `wrapHtml()`'s inline `<script>`:

Replace `saveSkillRow` (currently lines 481-491) with a version that branches on row type:

```js
    function saveSkillRow(row) {
      const path = row.querySelector('[data-field="path"]').value;
      const label = row.querySelector('[data-field="label"]').value;
      const textColor = row.querySelector('[data-field="textColor"]').value;
      const buttonColor = row.querySelector('[data-field="buttonColor"]').value;
      if (row.dataset.globalSkillId) {
        vscode.postMessage({ type: 'save-global-skill-entry', id: row.dataset.globalSkillId, path, label, textColor, buttonColor });
      } else {
        vscode.postMessage({
          type: 'save-skill-entry',
          level: row.dataset.level,
          status: row.dataset.status,
          path,
          label,
          textColor,
          buttonColor,
        });
      }
    }
```

Replace the `pick-skill-file` click branch (currently lines 608-613) with one that branches on row type:

```js
      } else if (target.dataset && target.dataset.action === 'pick-skill-file') {
        const row = target.closest('.kb-config-row');
        if (row) {
          if (row.dataset.globalSkillId) {
            vscode.postMessage({ type: 'pick-global-skill-file', id: row.dataset.globalSkillId });
          } else {
            vscode.postMessage({ type: 'pick-skill-file', level: row.dataset.level, status: row.dataset.status });
          }
        }
      } else if (target.dataset && target.dataset.action === 'add-global-skill') {
        vscode.postMessage({ type: 'add-global-skill' });
      } else if (target.dataset && target.dataset.action === 'remove-global-skill') {
        vscode.postMessage({ type: 'remove-global-skill', id: target.dataset.globalSkillId });
      }
```

(This replaces the final `}` that used to close the `document.addEventListener('click', ...)` chain — the new `add-global-skill`/`remove-global-skill` branches are appended as the last two `else if`s before that closing brace.)

Add a `global-skill-file-picked` branch in the `window.addEventListener('message', ...)` handler, right after the existing `skill-file-picked` branch (currently lines 630-639):

```js
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
      } else if (event.data.type === 'global-skill-file-picked') {
        const rows = document.querySelectorAll('.kb-config-row');
        for (const row of rows) {
          if (row.dataset.globalSkillId === event.data.id) {
            const pathInput = row.querySelector('[data-field="path"]');
            pathInput.value = event.data.path;
            saveSkillRow(row);
            break;
          }
        }
      } else if (event.data.type === 'repository-folder-picked') {
```

- [ ] **Step 8: Compile and run the full test suite**

Run: `npm run compile && npm run test:unit`
Expected: PASS — all tests green including the 3 new ones from Step 1.

- [ ] **Step 9: Commit**

```bash
git add src/view/renderConfigEditor.ts src/view/renderConfigEditor.test.ts src/view/KanbrainViewProvider.ts
git commit -m "feat: add Global Skills CRUD section to Skill Configuration screen"
```

---

### Task 4: Card dropdown to run a global skill

**Files:**
- Modify: `src/view/renderWorkItemCard.ts:16-29` (`renderActionButton`)
- Modify: `src/view/KanbrainViewProvider.ts` (CSS + webview script `change` listener)
- Test: `src/view/renderWorkItemCard.test.ts`

**Interfaces:**
- Consumes: `KanbrainConfig.globalSkills` (Task 1); posts `{ type: 'run-global-skill', workItemId, skillId }`, handled server-side by Task 2's message wiring.

- [ ] **Step 1: Write the failing tests**

Add to `src/view/renderWorkItemCard.test.ts`, inside the `describe('renderWorkItemCard', ...)` block (after the last existing `it`, before the closing `});`):

```ts
  it('does not show the global skill select when no global skills are configured', () => {
    const html = renderWorkItemCard(workItem(), config, 'kb-main-card');
    expect(html).not.toContain('kb-global-skill-select');
  });

  it('shows the global skill select with an option per entry when global skills are configured', () => {
    const withGlobal: KanbrainConfig = {
      ...config,
      globalSkills: { 'global-skill-1': { path: 'effort.md', label: 'Avaliar Effort' } },
    };
    const html = renderWorkItemCard(workItem(), withGlobal, 'kb-main-card');
    expect(html).toContain('kb-global-skill-select');
    expect(html).toContain('data-action="run-global-skill"');
    expect(html).toContain('data-id="482"');
    expect(html).toContain('Avaliar Effort');
  });

  it('shows the global skill select even when the card has no status skill', () => {
    const noStatusSkill: KanbrainConfig = {
      ...config,
      skills: { Task: { Active: null } },
      globalSkills: { 'global-skill-1': { path: 'effort.md', label: 'Avaliar Effort' } },
    };
    const html = renderWorkItemCard(workItem(), noStatusSkill, 'kb-main-card');
    expect(html).not.toContain('data-action="run-skill"');
    expect(html).toContain('data-action="run-global-skill"');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- renderWorkItemCard`
Expected: FAIL — the two new "shows..." tests find no `kb-global-skill-select`/`run-global-skill` in the output.

- [ ] **Step 3: Implement in `renderWorkItemCard.ts`**

Replace `renderActionButton` (currently lines 16-29):

```ts
function renderGlobalSkillSelect(id: number, globalSkills: Record<string, SkillEntry>): string {
  const entries = Object.entries(globalSkills);
  if (entries.length === 0) {
    return '';
  }
  const options = entries
    .map(([skillId, entry]) => {
      const label = entry.label ?? entry.path.split('/').pop() ?? entry.path;
      return `<option value="${escapeHtml(skillId)}">${escapeHtml(label)}</option>`;
    })
    .join('');
  return `
    <select class="kb-global-skill-select" data-action="run-global-skill" data-id="${id}">
      <option value="" selected disabled>▾</option>
      ${options}
    </select>
  `;
}

function renderActionButton(workItem: WorkItem, config: KanbrainConfig): string {
  const skill = resolveSkill(config, workItem);
  const globalSkillHtml = renderGlobalSkillSelect(workItem.id, config.globalSkills ?? {});
  if (!skill) {
    return globalSkillHtml;
  }
  const label = skill.label ?? skill.path.split('/').pop() ?? skill.path;
  const textColor = skill.textColor && isValidHexColor(skill.textColor) ? normalizeHex(skill.textColor) : null;
  const buttonColor = skill.buttonColor && isValidHexColor(skill.buttonColor) ? normalizeHex(skill.buttonColor) : null;
  const style =
    buttonColor || textColor
      ? ` style="${buttonColor ? `background: ${buttonColor};` : ''}${textColor ? ` color: ${textColor};` : ''}"`
      : '';
  return `<button class="kb-action-btn" data-action="run-skill" data-id="${workItem.id}"${style}>▶ ${escapeHtml(label)}</button>${globalSkillHtml}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- renderWorkItemCard`
Expected: PASS — all 3 new tests plus every pre-existing `renderWorkItemCard` test (in particular "shows the skill action button by default" and "hides the skill action button when showActionButton is false" — both use the `config` fixture with no `globalSkills`, so `renderGlobalSkillSelect` returns `''` and the button markup is unchanged from before).

- [ ] **Step 5: Add CSS for the select**

In `src/view/KanbrainViewProvider.ts`, inside `css()` (right after the `.kb-action-btn:hover` rule, currently line 682):

```ts
      .kb-action-btn:hover { background: var(--vscode-button-hoverBackground); }
      .kb-global-skill-select { margin-top: 6px; margin-left: 4px; padding: 4px 6px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; cursor: pointer; font-family: var(--vscode-font-family); font-size: 12px; }
```

- [ ] **Step 6: Wire the `change` event in the webview script**

In `src/view/KanbrainViewProvider.ts`, inside `wrapHtml()`'s inline `<script>`, add a new delegated `change` listener right after the existing `document.addEventListener('click', (e) => { ... });` block closes (currently right after line 614):

```js
    document.addEventListener('change', (e) => {
      const target = e.target;
      if (target.dataset && target.dataset.action === 'run-global-skill' && target.value) {
        vscode.postMessage({ type: 'run-global-skill', workItemId: target.dataset.id, skillId: target.value });
        target.value = '';
      }
    });
```

- [ ] **Step 7: Compile and run the full test suite**

Run: `npm run compile && npm run test:unit`
Expected: PASS — all tests green.

- [ ] **Step 8: Commit**

```bash
git add src/view/renderWorkItemCard.ts src/view/renderWorkItemCard.test.ts src/view/KanbrainViewProvider.ts
git commit -m "feat: add global skill dropdown to the work item card"
```

- [ ] **Step 9: Manual verification (F5)**

Press F5 to launch the Extension Development Host. Open Skill Configuration, add a global skill (e.g. path to an existing `.md` skill file, label "Avaliar Effort"), confirm it's saved (reopen the screen, the row is still there). Set a work item with no status skill (or one in a status with `null`) as the current work item — confirm the `▾` select appears alone. Select the global skill from it — confirm the terminal receives the read command for that skill's file, and the select resets to `▾` afterward. Remove the global skill from Skill Configuration — confirm the `▾` disappears from the card on the next refresh.

---

## Self-Review Notes

- **Spec coverage:** data model + sync pass-through (Task 1) ✓; only-global-skills-listed, no reuse of status skills (Task 1/3 — `globalSkills` is its own map, never merged with `config.skills`) ✓; Global Skills CRUD section in Skill Configuration (Task 3) ✓; arrow-opens-menu / one-off run / resets after (Task 4 Step 6, `target.value = ''`) ✓; select-alone-when-no-status-skill (Task 4 `renderActionButton`) ✓; no-select-when-no-global-skills (Task 4 `renderGlobalSkillSelect` early return) ✓; shared execution path (Task 2 `executeSkill`) ✓; manual verification since `KanbrainViewProvider` has no test suite (Task 4 Step 9) ✓.
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command.
- **Type consistency:** `SkillEntry` (unchanged shape) used identically across `config.skills[type][status]` and `config.globalSkills[id]`; `id` is always a `string` generated via `global-skill-${Date.now()}` (Task 3 Step 6), never regenerated or slugified elsewhere in the plan; `executeSkill(workItem: WorkItem, skill: SkillEntry)` signature is identical between its Task 2 definition and both call sites (`runSkill`, `runGlobalSkill`) in the same task.
